import { useEffect, useState, useCallback } from "react";
import { Plus, Search, X } from "lucide-react";
import {
  listCharges,
  updateCharge,
  deleteCharge,
  createCharge,
} from "../api/charges";
import { getBudget } from "../api/budget";
import ChargeTable from "../components/ChargeTable";
import EmptyState from "../components/EmptyState";
import { Receipt } from "lucide-react";

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: "",
  source: "",
  category_id: "",
  recurring: false,
  nickname: "",
};

export default function Charges() {
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

  const hasFilters =
    search || categoryFilter.length || recurringOnly || start || end;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl text-ink-900">
            Charges
          </h1>
          <p className="text-sm text-ink-500 mt-0.5 tabular">
            {charges.length} charges · $
            {Math.abs(totalAmount).toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm((s) => !s)}
          className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} /> Add Charge
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddSubmit}
          className="bg-surface border border-line rounded-xl2 shadow-card p-5 grid grid-cols-2 md:grid-cols-6 gap-3"
        >
          <input
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="col-span-1 md:col-span-1 text-sm rounded-md border border-line px-2.5 py-1.5"
          />
          <input
            placeholder="Source (e.g. Cash)"
            required
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            className="col-span-2 md:col-span-2 text-sm rounded-md border border-line px-2.5 py-1.5"
          />
          <input
            placeholder="Nickname (optional)"
            value={form.nickname}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            className="col-span-1 text-sm rounded-md border border-line px-2.5 py-1.5"
          />
          <select
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="col-span-1 text-sm rounded-md border border-line px-2.5 py-1.5"
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            required
            placeholder="Amount (-45.23)"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="col-span-1 text-sm rounded-md border border-line px-2.5 py-1.5 tabular"
          />
          <div className="col-span-2 md:col-span-6 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={form.recurring}
                onChange={(e) =>
                  setForm({ ...form, recurring: e.target.checked })
                }
              />
              Recurring
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-sm font-medium text-ink-500 px-3 py-1.5 rounded-lg hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="text-sm font-semibold text-white bg-accent hover:bg-accent-dark px-3.5 py-1.5 rounded-lg"
              >
                Save Charge
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="bg-surface border border-line rounded-xl2 shadow-card p-4 flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300"
          />
          <input
            placeholder="Search source or nickname…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm rounded-lg border border-line pl-8 pr-3 py-1.5 w-56"
          />
        </div>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="text-sm rounded-lg border border-line px-2.5 py-1.5"
        />
        <span className="text-ink-300 text-sm">–</span>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="text-sm rounded-lg border border-line px-2.5 py-1.5"
        />

        <div className="flex items-center gap-1 flex-wrap">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => toggleCategoryFilter(c.id)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
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

        <label className="flex items-center gap-1.5 text-sm text-ink-700 ml-auto">
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

      <div className="bg-surface border border-line rounded-xl2 shadow-card p-2">
        {loading && !charges.length ? (
          <p className="text-sm text-ink-500 py-8 text-center">Loading…</p>
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
          />
        )}
      </div>
    </div>
  );
}
