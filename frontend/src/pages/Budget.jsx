import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  PiggyBank,
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  LineChart,
} from "lucide-react";
import { getBudget, updateBudget, getBudgetStatus } from "../api/budget";
import { listCharges, updateCharge, deleteCharge } from "../api/charges";
import ProgressBar from "../components/ProgressBar";
import ChargeTable from "../components/ChargeTable";
import EmptyState from "../components/EmptyState";

const currency = (n) =>
  `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedCurrency = (n) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
    {n < 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}$
    {Math.abs(n).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}
  </span>
);
const PERIODS = [
  { value: "this_month", label: "This Month" },
  { value: "30d", label: "30 Days" },
  { value: "3month_avg", label: "3-Month Avg" },
];

const PALETTE = [
  "#2A6F6A",
  "#C7902E",
  "#B4483B",
  "#3F8C5F",
  "#6C5B7B",
  "#3D5A80",
  "#9C6644",
  "#5B7553",
];

export default function Budget() {
  const [period, setPeriod] = useState("this_month");
  const [status, setStatus] = useState(null);
  const [budget, setBudget] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [expandedCharges, setExpandedCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftCategories, setDraftCategories] = useState([]);
  const [draftIncome, setDraftIncome] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, budgetRes] = await Promise.all([
        getBudgetStatus(period),
        getBudget(),
      ]);
      setStatus(statusRes);
      setBudget(budgetRes);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleExpand(categoryId) {
    if (expanded === categoryId) {
      setExpanded(null);
      return;
    }
    setExpanded(categoryId);
    const res = await listCharges({
      category_id: categoryId,
      start: status.period.start,
      end: status.period.end,
      sort: "date",
      direction: "desc",
    });
    setExpandedCharges(res.items);
  }

  function startEditing() {
    setDraftCategories(budget.categories.map((c) => ({ ...c })));
    setDraftIncome(budget.income ?? "");
    setEditing(true);
  }

  function addDraftCategory() {
    const name = prompt("Category name?");
    if (!name) return;
    const id = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const color = PALETTE[draftCategories.length % PALETTE.length];
    setDraftCategories((prev) => [
      ...prev,
      { id, name: name.trim(), monthly_target: 0, color, archived: false },
    ]);
  }

  function updateDraftCategory(id, field, value) {
    setDraftCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  }

  function archiveDraftCategory(id) {
    setDraftCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, archived: !c.archived } : c)),
    );
  }

  async function saveBudget() {
    await updateBudget({
      categories: draftCategories.map((c) => ({
        ...c,
        monthly_target: parseFloat(c.monthly_target) || 0,
      })),
      income: draftIncome === "" ? null : parseFloat(draftIncome),
    });
    setEditing(false);
    load();
  }

  async function handleExpandedUpdate(id, data) {
    await updateCharge(id, data);
    toggleExpand(null);
    load();
  }
  async function handleExpandedDelete(id) {
    await deleteCharge(id);
    toggleExpand(null);
    load();
  }

  if (loading && !status) {
    return <p className="text-sm text-ink-500">Loading…</p>;
  }

  const hasCategories = budget?.categories?.some((c) => !c.archived);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-ink-900">Budget</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/analysis"
            className="flex items-center gap-1.5 text-sm font-semibold text-ink-700 border border-line hover:bg-black/5 p-2 sm:px-3 sm:py-1.5 rounded-lg"
          >
            <LineChart size={13} />
            <span className="hidden sm:inline">Analysis</span>
          </Link>
          <div className="inline-flex items-center bg-black/[0.04] rounded-lg p-1 gap-0.5 overflow-x-auto max-w-full">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  period === p.value
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-900"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {!editing && (
            <button
              onClick={startEditing}
              title="Edit Budget"
              aria-label="Edit Budget"
              className="flex items-center gap-1.5 text-sm font-semibold text-accent border border-accent/30 hover:bg-accent-light p-2 sm:px-3 sm:py-1.5 rounded-lg"
            >
              <Pencil size={13} />
              <span className="hidden sm:inline">Edit Budget</span>
            </button>
          )}
        </div>
      </div>

      {status &&
        (() => {
          const overallDiff = status.total_target - status.total_spent;
          const isOver = overallDiff < 0;
          return (
            <div
              className={`bg-surface border rounded-xl2 shadow-card p-4 sm:p-5 ${isOver ? "border-over/30" : "border-good/30"}`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
                    {isOver ? "Over Budget" : "Under Budget"} —{" "}
                    {PERIODS.find((p) => p.value === period)?.label}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-display font-bold text-2xl tabular ${isOver ? "text-over" : "text-good"}`}
                    >
                      {signedCurrency(overallDiff)}
                    </span>
                    <span className="text-sm text-ink-500 tabular">
                      {currency(status.total_spent)} spent of{" "}
                      {currency(status.total_target)} budgeted
                    </span>
                  </div>
                </div>
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isOver ? "bg-over/10" : "bg-good/10"}`}
                >
                  {isOver ? (
                    <AlertTriangle
                      size={17}
                      className="text-over"
                      strokeWidth={2.25}
                    />
                  ) : (
                    <CheckCircle2
                      size={17}
                      className="text-good"
                      strokeWidth={2.25}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {status?.income != null && (
        <div className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">
              Total Budgeted vs Income
            </p>
            <span className="text-sm tabular text-ink-700">
              {currency(status.total_target)} / {currency(status.income)}
            </span>
          </div>
          <ProgressBar
            percent={
              status.income > 0
                ? (status.total_target / status.income) * 100
                : 0
            }
            status="on_track"
            color="#2A6F6A"
            height={8}
          />
          <p className="text-xs text-ink-500 mt-2">
            {status.income_source === "paystub"
              ? "Income is connected to confirmed payslips. Enter a monthly income value while editing Budget to override it."
              : "Income is using your manual monthly override."}
          </p>
        </div>
      )}

      {editing && (
        <div className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="font-display font-semibold text-ink-900">
              Edit Categories
            </p>
            <div className="flex items-center gap-2">
              <label className="text-sm text-ink-500">Monthly income</label>
              <input
                type="number"
                step="0.01"
                placeholder="optional"
                value={draftIncome}
                onChange={(e) => setDraftIncome(e.target.value)}
                className="text-sm rounded-md border border-line px-2 py-1 w-32 tabular"
              />
            </div>
          </div>

          <div className="space-y-2">
            {draftCategories.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-2.5 ${c.archived ? "opacity-40" : ""}`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <input
                  value={c.name}
                  onChange={(e) =>
                    updateDraftCategory(c.id, "name", e.target.value)
                  }
                  className="text-sm rounded-md border border-line px-2 py-1 flex-1"
                />
                <input
                  type="number"
                  step="0.01"
                  value={c.monthly_target}
                  onChange={(e) =>
                    updateDraftCategory(c.id, "monthly_target", e.target.value)
                  }
                  className="text-sm rounded-md border border-line px-2 py-1 w-28 tabular"
                />
                <button
                  onClick={() => archiveDraftCategory(c.id)}
                  className="p-1.5 rounded-md text-ink-500 hover:bg-black/5"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addDraftCategory}
            className="flex items-center gap-1.5 text-sm font-semibold text-accent"
          >
            <Plus size={14} /> Add Category
          </button>

          <div className="flex items-center gap-2 justify-end pt-2 border-t border-line">
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 text-sm font-medium text-ink-500 px-3 py-1.5 rounded-lg hover:bg-black/5"
            >
              <X size={14} /> Cancel
            </button>
            <button
              onClick={saveBudget}
              className="flex items-center gap-1 text-sm font-semibold text-white bg-accent hover:bg-accent-dark px-3.5 py-1.5 rounded-lg"
            >
              <Check size={14} /> Save
            </button>
          </div>
        </div>
      )}

      {!hasCategories && !editing ? (
        <div className="bg-surface border border-line rounded-xl2 shadow-card">
          <EmptyState
            icon={PiggyBank}
            title="No budget categories yet"
            message="Add a category and monthly target to start tracking spend against your budget."
            showUpload={false}
          />
          <div className="text-center pb-6">
            <button
              onClick={startEditing}
              className="text-sm font-semibold text-accent"
            >
              + Add your first category
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-xl2 shadow-card divide-y divide-line">
          {status?.categories.map((cat) => {
            const diff = cat.monthly_target - cat.spent;
            const catIsOver = diff < 0;
            return (
              <div key={cat.id}>
                <button
                  onClick={() => toggleExpand(cat.id)}
                  className="w-full text-left p-3 sm:p-4 hover:bg-black/[0.015] transition-colors"
                >
                  {/* Mobile: stacked layout */}
                  <div className="md:hidden">
                    <div className="flex items-center gap-2 mb-2">
                      {expanded === cat.id ? (
                        <ChevronDown size={15} className="text-ink-300 shrink-0" />
                      ) : (
                        <ChevronRight size={15} className="text-ink-300 shrink-0" />
                      )}
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium text-sm text-ink-900 truncate flex-1">
                        {cat.name}
                      </span>
                      <span
                        className={`text-xs font-semibold tabular shrink-0 ${
                          catIsOver ? "text-over" : "text-good"
                        }`}
                      >
                        {signedCurrency(diff)}
                      </span>
                    </div>
                    <ProgressBar
                      percent={cat.percent}
                      status={cat.status}
                      color={cat.color}
                    />
                    <div className="flex items-center justify-between mt-1.5 text-xs text-ink-500 tabular">
                      <span>{currency(cat.spent)} spent</span>
                      <span>of {currency(cat.monthly_target)}</span>
                    </div>
                  </div>

                  {/* Desktop: single row */}
                  <div className="hidden md:flex items-center gap-4">
                    {expanded === cat.id ? (
                      <ChevronDown size={16} className="text-ink-300 shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-ink-300 shrink-0" />
                    )}
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-medium text-sm text-ink-900 w-36 shrink-0 truncate">
                      {cat.name}
                    </span>
                    <div className="flex-1">
                      <ProgressBar
                        percent={cat.percent}
                        status={cat.status}
                        color={cat.color}
                      />
                    </div>
                    <span className="text-sm tabular text-ink-700 w-32 text-right shrink-0">
                      {currency(cat.spent)}{" "}
                      <span className="text-ink-300">
                        / {currency(cat.monthly_target)}
                      </span>
                    </span>
                    <span
                      className={`text-xs font-semibold tabular w-20 text-right shrink-0 ${
                        catIsOver ? "text-over" : "text-good"
                      }`}
                    >
                      {signedCurrency(diff)}
                    </span>
                  </div>
                </button>
                {expanded === cat.id && (
                  <div className="px-4 pb-4">
                    <ChargeTable
                      charges={expandedCharges}
                      categories={budget.categories}
                      onUpdate={handleExpandedUpdate}
                      onDelete={handleExpandedDelete}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {status?.uncategorized_spend > 0 && (
            <div className="p-3 sm:p-4 flex items-center gap-2.5 sm:gap-4 text-ink-500">
              <span className="hidden md:inline-block w-6" />
              <span className="w-2.5 h-2.5 rounded-full bg-ink-300 shrink-0" />
              <span className="text-sm flex-1 md:flex-none md:w-36 truncate">
                Uncategorized
              </span>
              <div className="hidden md:block flex-1" />
              <span className="text-sm tabular">
                {currency(status.uncategorized_spend)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
