import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Trash2, Repeat, CheckCircle2, AlertCircle } from "lucide-react";
import {
  getPending,
  getPlaidPending,
  updatePending,
  deletePending,
  confirmBatch,
} from "../api/upload";
import { getBudget, updateBudget } from "../api/budget";

const currency = (n) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function UploadPreview() {
  const [searchParams] = useSearchParams();
  const batchId = searchParams.get("batch_id");
  // Connected-account transactions don't come from a single upload batch —
  // one is created per Plaid Item, and Items come and go as accounts are
  // connected/disconnected — so this mode looks up every pending Plaid
  // charge across all Items instead of requiring a batch_id in the URL.
  const plaidMode = searchParams.get("source") === "plaid";
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [batchIds, setBatchIds] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [missingIds, setMissingIds] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategoryFor, setAddingCategoryFor] = useState(null);

  const load = useCallback(async () => {
    if (!plaidMode && !batchId) return;
    setLoading(true);
    try {
      const [pendingRes, budgetRes] = await Promise.all([
        plaidMode ? getPlaidPending() : getPending(batchId),
        getBudget(),
      ]);
      setItems(pendingRes.items);
      setBatchIds(
        plaidMode ? pendingRes.batch_ids : [...new Set(batchId.split(","))],
      );
      setCategories(budgetRes.categories.filter((c) => !c.archived));
    } finally {
      setLoading(false);
    }
  }, [plaidMode, batchId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleField(id, data) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...data } : it)),
    );
    await updatePending(id, data);
    setMissingIds((prev) => prev.filter((i) => i !== id));
  }

  async function handleDelete(id) {
    await deletePending(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function handleAddCategory(rowId) {
    if (!newCategoryName.trim()) return;
    const id = newCategoryName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const color =
      "#" +
      Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
    const newCategory = {
      id,
      name: newCategoryName.trim(),
      monthly_target: 0,
      color,
    };
    const b = await getBudget();
    await updateBudget({
      categories: [...b.categories, newCategory],
      income: b.income,
    });
    setCategories((prev) => [...prev, newCategory]);
    setNewCategoryName("");
    setAddingCategoryFor(null);
    await handleField(rowId, { category_id: id });
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      await confirmBatch(batchIds);
      navigate(plaidMode ? "/charges" : `/charges?batch=${batchId}`);
    } catch (e) {
      if (e.detail?.missing_ids) {
        setMissingIds(e.detail.missing_ids);
        setError(e.detail.message);
      } else {
        setError(e.message);
      }
    } finally {
      setConfirming(false);
    }
  }

  if (!plaidMode && !batchId) {
    return (
      <p className="text-sm text-ink-500">
        No upload batch specified. Try uploading a CSV again.
      </p>
    );
  }
  if (loading) {
    return (
      <p className="text-sm text-ink-500">
        {plaidMode ? "Loading connected account transactions…" : "Loading uploaded rows…"}
      </p>
    );
  }
  if (!items.length) {
    return (
      <p className="text-sm text-ink-500">
        {plaidMode
          ? "No connected-account transactions need review right now — you're all caught up."
          : "Nothing left to review in this batch — it may already be confirmed."}
      </p>
    );
  }

  const categorizedCount = items.filter((i) => i.category_id).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl text-ink-900">
            {plaidMode ? "Review Connected Account Transactions" : "Review Upload"}
          </h1>
          <p className="text-sm text-ink-500 mt-0.5">
            {plaidMode
              ? "New transactions from unrecognized merchants wait here for a category before they show up under Charges. Recognized merchants skip this and confirm automatically."
              : "Assign a category to every row, then confirm to add them to your Charges History."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-ink-700 tabular">
            {categorizedCount} of {items.length} categorized
          </span>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <CheckCircle2 size={15} /> Confirm All
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-over/10 border border-over/30 text-over text-sm rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-surface border border-line rounded-xl2 shadow-card divide-y divide-line">
        {items.map((item) => {
          const flagged = missingIds.includes(item.id);
          return (
            <div
              key={item.id}
              className={`p-4 flex flex-wrap items-center gap-3 ${flagged ? "bg-over/5" : ""}`}
            >
              <div className="w-24 shrink-0 text-sm text-ink-500 tabular">
                {item.date}
              </div>
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm font-medium text-ink-900">
                  {item.source}
                </p>
                <input
                  placeholder="Add nickname…"
                  defaultValue={item.nickname || ""}
                  onBlur={(e) =>
                    e.target.value !== (item.nickname || "") &&
                    handleField(item.id, { nickname: e.target.value })
                  }
                  className="mt-1 text-xs text-ink-500 border-b border-transparent hover:border-line focus:border-accent bg-transparent outline-none w-full"
                />
              </div>

              {addingCategoryFor === item.id ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    placeholder="New category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleAddCategory(item.id)
                    }
                    className="text-sm rounded-md border border-line px-2 py-1 w-40"
                  />
                  <button
                    onClick={() => handleAddCategory(item.id)}
                    className="text-xs font-semibold text-accent"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAddingCategoryFor(null)}
                    className="text-xs text-ink-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <select
                  value={item.category_id || ""}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setAddingCategoryFor(item.id);
                    } else {
                      handleField(item.id, {
                        category_id: e.target.value || null,
                      });
                    }
                  }}
                  className={`text-sm rounded-md border px-2.5 py-1.5 w-44 ${
                    flagged
                      ? "border-over"
                      : item.category_id
                        ? "border-line"
                        : "border-warn/60 bg-warn/5"
                  }`}
                >
                  <option value="">Select category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new__">+ New category…</option>
                </select>
              )}

              <button
                onClick={() =>
                  handleField(item.id, { recurring: !item.recurring })
                }
                title="Mark as recurring"
                className={`p-2 rounded-md transition-colors ${item.recurring ? "text-accent bg-accent-light" : "text-ink-300 hover:text-ink-500"}`}
              >
                <Repeat size={15} />
              </button>

              <span
                className={`text-sm font-medium tabular w-24 text-right ${item.amount < 0 ? "text-ink-900" : "text-good"}`}
              >
                {currency(item.amount)}
              </span>

              <button
                onClick={() => handleDelete(item.id)}
                className="p-2 rounded-md text-over hover:bg-over/10"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
