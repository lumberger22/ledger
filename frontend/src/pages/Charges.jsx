import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, X, Landmark, ChevronRight, Trash2 } from "lucide-react";
import {
  listCharges,
  updateCharge,
  deleteCharge,
  deleteCharges,
  createCharge,
} from "../api/charges";
import { getBudget } from "../api/budget";
import { getPlaidPending } from "../api/upload";
import ChargeTable from "../components/ChargeTable";
import EmptyState from "../components/EmptyState";
import { Receipt } from "lucide-react";
import PageHeader from "../components/PageHeader";
import PageLoading from "../components/PageLoading";
import { todayIso } from "../utils/date";

const emptyForm = {
  date: todayIso(),
  amount: "",
  source: "",
  category_id: "",
  recurring: false,
  nickname: "",
};

export default function Charges() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [charges, setCharges] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalAmount, setTotalAmount] = useState(0);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState([]);
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [sort, setSort] = useState("date");
  const [direction, setDirection] = useState("desc");

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [plaidPendingCount, setPlaidPendingCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    if (searchParams.get("add") !== "1") return;
    setShowAddForm(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("add");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    getPlaidPending()
      .then((res) => setPlaidPendingCount(res.total))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [chargesRes, budgetRes] = await Promise.all([
        listCharges({
          search: search || undefined,
          category_id: categoryFilter.join(",") || undefined,
          recurring_only: recurringOnly || undefined,
          start: start || undefined,
          end: end || undefined,
          sort,
          direction,
        }),
        getBudget(),
      ]);
      setCharges(chargesRes.items);
      setTotalAmount(chargesRes.total_amount);
      setCategories(budgetRes.categories.filter((c) => !c.archived));
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, recurringOnly, start, end, sort, direction]);

  useEffect(() => {
    load();
  }, [load]);

  // A change to which charges are visible invalidates any existing
  // selection — ids picked under one filter set may not even be on screen
  // once the filters change, so hang onto a selection across a sort/
  // direction change (same rows, just reordered) but drop it otherwise.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, categoryFilter, recurringOnly, start, end]);

  function handleSortChange(field) {
    if (sort === field) {
      setDirection(direction === "asc" ? "desc" : "asc");
    } else {
      setSort(field);
      setDirection("desc");
    }
  }

  async function handleUpdate(id, data) {
    await updateCharge(id, data);
    load();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this charge?")) return;
    await deleteCharge(id);
    load();
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === charges.length
        ? new Set()
        : new Set(charges.map((c) => c.id)),
    );
  }

  async function handleBulkDelete() {
    const count = selectedIds.size;
    if (!count) return;
    if (
      !confirm(
        `Delete ${count} selected charge${count !== 1 ? "s" : ""}? This can't be undone.`,
      )
    )
      return;
    await deleteCharges(Array.from(selectedIds));
    setSelectedIds(new Set());
    load();
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    await createCharge({
      ...form,
      amount: parseFloat(form.amount),
      category_id: form.category_id || null,
      status: "confirmed",
    });
    setForm(emptyForm);
    setShowAddForm(false);
    load();
  }

  function toggleCategoryFilter(id) {
    setCategoryFilter((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function applyDatePreset(preset) {
    const today = new Date();
    const toIso = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    const endDate = toIso(today);
    const startDate = new Date(today);
    if (preset === "month") startDate.setDate(1);
    else startDate.setDate(startDate.getDate() - (preset === "90d" ? 89 : 29));
    setStart(toIso(startDate));
    setEnd(endDate);
  }

  const hasFilters =
    search || categoryFilter.length || recurringOnly || start || end;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Charges"
        eyebrow="Transactions"
        description={
          <span className="tabular">
            {charges.length} charges · ${Math.abs(totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        }
        actions={
          <button
            type="button"
            onClick={() => setShowAddForm((s) => !s)}
            aria-expanded={showAddForm}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-dark sm:w-auto"
          >
            <Plus size={15} /> Add Charge
          </button>
        }
      />

      {plaidPendingCount > 0 && (
        <Link
          to="/upload-preview?source=plaid"
          className="flex items-center justify-between gap-3 bg-accent-light/50 border border-accent/30 rounded-xl2 p-3 sm:p-4 text-sm hover:bg-accent-light transition-colors"
        >
          <span className="flex items-center gap-2 text-ink-900">
            <Landmark size={15} className="text-accent-dark shrink-0" />
            <span>
              <strong className="font-semibold">
                {plaidPendingCount} transaction{plaidPendingCount !== 1 ? "s" : ""}
              </strong>{" "}
              from your connected accounts {plaidPendingCount !== 1 ? "need" : "needs"} a
              category before they'll show up here.
            </span>
          </span>
          <span className="flex items-center gap-1 font-semibold text-accent-dark shrink-0">
            Review <ChevronRight size={14} />
          </span>
        </Link>
      )}

      {showAddForm && (
        <form
          onSubmit={handleAddSubmit}
          className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3"
        >
          <label className="col-span-1 md:col-span-1 text-xs font-medium text-ink-500">
            Date
          <input
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="mt-1 min-h-12 w-full text-sm rounded-xl border border-line px-3"
          />
          </label>
          <label className="col-span-1 md:col-span-2 text-xs font-medium text-ink-500">
            Merchant or source
          <input
            placeholder="e.g. Grocery store or Cash"
            required
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            className="mt-1 min-h-12 w-full text-sm rounded-xl border border-line px-3"
          />
          </label>
          <label className="col-span-1 text-xs font-medium text-ink-500">
            Nickname <span className="font-normal">(optional)</span>
          <input
            placeholder="Nickname (optional)"
            value={form.nickname}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            className="mt-1 min-h-12 w-full text-sm rounded-xl border border-line px-3"
          />
          </label>
          <label className="col-span-1 text-xs font-medium text-ink-500">
            Category
          <select
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="mt-1 min-h-12 w-full text-sm rounded-xl border border-line px-3"
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          </label>
          <label className="col-span-1 text-xs font-medium text-ink-500">
            Amount <span className="font-normal">(use a negative value for spending)</span>
          <input
            type="number"
            step="0.01"
            required
            placeholder="-45.23"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="mt-1 min-h-12 w-full text-sm rounded-xl border border-line px-3 tabular"
          />
          </label>
          <div className="col-span-1 sm:col-span-2 md:col-span-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={form.recurring}
                onChange={(e) =>
                  setForm({ ...form, recurring: e.target.checked })
                }
              />
              Recurring
            </label>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="min-h-11 flex-1 rounded-xl px-4 text-sm font-medium text-ink-500 hover:bg-black/5 sm:flex-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-11 flex-1 rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-dark sm:flex-none"
              >
                Save Charge
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="bg-surface border border-line rounded-xl2 shadow-card p-3 sm:p-4 grid grid-cols-2 items-center gap-3 sm:flex sm:flex-wrap sm:gap-2.5">
        <div className="relative col-span-2 w-full sm:col-span-1 sm:w-auto">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300"
          />
          <input
            placeholder="Search source or nickname…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 text-sm rounded-xl border border-line pl-9 pr-3 w-full sm:w-56"
          />
        </div>
        <label className="col-span-2 min-w-0 text-xs font-medium text-ink-500 sm:col-span-1 sm:w-36">
          <span className="mb-1 block">From date</span>
          <input
            type="date"
            aria-label="Filter charges from date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="min-h-11 w-full min-w-0 rounded-xl border border-line px-2.5 text-sm"
          />
        </label>
        <label className="col-span-2 min-w-0 text-xs font-medium text-ink-500 sm:col-span-1 sm:w-36">
          <span className="mb-1 block">To date</span>
          <input
            type="date"
            aria-label="Filter charges through date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="min-h-11 w-full min-w-0 rounded-xl border border-line px-2.5 text-sm"
          />
        </label>

        <div className="col-span-2 flex min-w-0 items-center gap-2 overflow-x-auto border-t border-line pt-2 sm:col-span-full sm:flex-wrap sm:overflow-visible">
          <span className="shrink-0 text-xs font-medium text-ink-500">Date range</span>
          {[
            ["month", "This month"],
            ["30d", "30 days"],
            ["90d", "90 days"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => applyDatePreset(value)}
              className="min-h-10 shrink-0 rounded-full border border-line px-3 text-xs font-semibold text-ink-600 transition-colors hover:border-accent/50 hover:bg-accent-light hover:text-accent-dark"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="col-span-2 flex min-w-0 items-center gap-2 overflow-x-auto py-1 sm:flex-wrap sm:overflow-visible">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={categoryFilter.includes(c.id)}
              onClick={() => toggleCategoryFilter(c.id)}
              className={`min-h-10 shrink-0 text-xs font-medium px-3 rounded-full border transition-colors ${
                categoryFilter.includes(c.id)
                  ? "text-white border-transparent"
                  : "text-ink-500 border-line hover:border-ink-300"
              }`}
              style={
                categoryFilter.includes(c.id)
                  ? { backgroundColor: c.color }
                  : {}
              }
            >
              {c.name}
            </button>
          ))}
        </div>

        <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm text-ink-700 sm:ml-auto">
          <input
            type="checkbox"
            checked={recurringOnly}
            onChange={(e) => setRecurringOnly(e.target.checked)}
          />
          Recurring only
        </label>

        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setCategoryFilter([]);
              setRecurringOnly(false);
              setStart("");
              setEnd("");
            }}
            className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-900"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {charges.length > 0 && (
        <div className="flex items-center gap-3 px-1 flex-wrap">
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink-700 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === charges.length}
              ref={(el) => {
                if (el)
                  el.indeterminate =
                    selectedIds.size > 0 && selectedIds.size < charges.length;
              }}
              onChange={toggleSelectAll}
            />
            Select all
          </label>
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-ink-500 tabular">
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 text-sm font-semibold text-over hover:text-over/80 ml-auto"
              >
                <Trash2 size={14} /> Delete Selected
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm font-medium text-ink-500 hover:text-ink-900"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

      <div className="bg-surface border border-line rounded-xl2 shadow-card p-2">
        {loading && !charges.length ? (
          <PageLoading label="Loading charges" compact />
        ) : charges.length === 0 && !hasFilters ? (
          <EmptyState
            icon={Receipt}
            title="No charges yet"
            message="Upload a CSV export or add a charge manually to get started."
          />
        ) : (
          <ChargeTable
            charges={charges}
            categories={categories}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            sort={sort}
            direction={direction}
            onSortChange={handleSortChange}
            selectable
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        )}
      </div>
    </div>
  );
}
