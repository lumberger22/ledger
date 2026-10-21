import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Repeat,
  Wallet,
  CircleDollarSign,
  RefreshCw,
  Pencil,
  Check,
} from "lucide-react";
import { getDashboard } from "../api/dashboard";
import { getNetWorth } from "../api/networth";
import { triggerSync } from "../api/plaid";
import { getPlaidPending } from "../api/upload";
import PeriodFilter from "../components/PeriodFilter";
import CategoryBadge from "../components/CategoryBadge";
import EmptyState from "../components/EmptyState";
import CustomizableCards from "../components/CustomizableCards";

const currency = (n) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusCopy = {
  on_track: { label: "On Track", color: "text-good", bg: "bg-good/10" },
  behind: { label: "Behind", color: "text-warn", bg: "bg-warn/10" },
  over: { label: "Over Budget", color: "text-over", bg: "bg-over/10" },
};

// "This Month" (below) is replaced by "Select Timeframe" (custom), and YTD
// is dropped from the dashboard specifically — both stay available on
// other pages.
const PERIOD_OPTIONS = [
  { value: "custom", label: "Select Timeframe" },
  { value: "30d", label: "30 Days" },
];

export default function Dashboard() {
  const [period, setPeriod] = useState("this_month");
  const [customRange, setCustomRange] = useState({ start: null, end: null });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [netWorth, setNetWorth] = useState(null);
  const [plaidPendingCount, setPlaidPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getDashboard(period, customRange.start, customRange.end)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period, customRange.start, customRange.end]);

  useEffect(() => {
    // Net worth doesn't depend on the period filter (it's a point-in-time
    // snapshot), so it's fetched once, separately from the rest of the
    // dashboard, and simply doesn't render if nothing's connected yet.
    getNetWorth()
      .then(setNetWorth)
      .catch(() => setNetWorth(null));
  }, []);

  const refreshPlaidPendingCount = useCallback(() => {
    getPlaidPending()
      .then((res) => setPlaidPendingCount(res.total))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshPlaidPendingCount();
  }, [refreshPlaidPendingCount]);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      await triggerSync();
      await Promise.all([
        getDashboard(period, customRange.start, customRange.end).then(setData),
        getNetWorth().then(setNetWorth).catch(() => {}),
      ]);
      refreshPlaidPendingCount();
    } catch (err) {
      setSyncError(
        err.status === 503
          ? "Connect a bank account on the Accounts page to enable syncing."
          : err.message || "Sync failed.",
      );
    } finally {
      setSyncing(false);
    }
  }

  if (error) {
    return (
      <div className="text-over text-sm">
        Couldn't load the dashboard: {error}
      </div>
    );
  }

  if (loading && !data) {
    return <div className="text-ink-500 text-sm">Loading…</div>;
  }

  const hasNetWorthData =
    (netWorth?.assets?.accounts?.length || 0) + (netWorth?.liabilities?.accounts?.length || 0) > 0;

  const status =
    statusCopy[data?.budget_summary?.status] || statusCopy.on_track;
  const spentPct = data?.budget_summary?.total_target
    ? Math.min(
        (data.budget_summary.total_spent / data.budget_summary.total_target) *
          100,
        100,
      )
    : 0;

  const hasAnyData = Boolean(data?.has_data || data?.has_income || hasNetWorthData);
  const panelClass = "bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-6";
  const cards = [
    {
      id: "net-worth",
      title: "Net Worth",
      content: (
        <Link
          to="/net-worth"
          className={`${panelClass} flex items-center justify-between gap-3 transition-colors hover:border-accent/30`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${netWorth?.net_worth >= 0 ? "bg-good/10" : "bg-over/10"}`}>
              {netWorth?.net_worth >= 0 ? <TrendingUp size={16} className="text-good" /> : <TrendingDown size={16} className="text-over" />}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Net Worth</p>
              <p className="font-display text-xl font-bold tabular text-ink-900">
                {hasNetWorthData ? currency(netWorth.net_worth) : "Connect an account to get started"}
              </p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-accent">
            View Accounts <ArrowRight size={14} />
          </span>
        </Link>
      ),
    },
    {
      id: "budget-summary",
      title: "Budget Summary",
      content: (
        <section className={panelClass}>
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">Spent vs Budgeted</p>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-3xl font-bold tabular text-ink-900">{currency(data.budget_summary.total_spent)}</span>
                <span className="text-sm tabular text-ink-500">of {currency(data.budget_summary.total_target)}</span>
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.bg} ${status.color}`}>{status.label}</span>
          </div>
          <div className="mb-6 h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className={`h-full rounded-full transition-all duration-700 ${data.budget_summary.status === "over" ? "bg-over" : data.budget_summary.status === "behind" ? "bg-warn" : "bg-accent"}`}
              style={{ width: `${spentPct}%` }}
            />
          </div>
          <Link to="/budget" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent hover:text-accent-dark">
            View Budget <ArrowRight size={14} />
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <button onClick={handleSync} disabled={syncing} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-ink-700 transition-colors hover:bg-black/5 disabled:opacity-60">
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync Accounts"}
            </button>
            {plaidPendingCount > 0 ? (
              <Link to="/upload-preview?source=plaid" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent-light px-3 text-sm font-semibold text-accent-dark hover:bg-accent-light/70">
                {plaidPendingCount} to review <ArrowRight size={13} />
              </Link>
            ) : <span className="text-xs text-ink-500">Nothing to review</span>}
          </div>
          {syncError && <p className="mt-2 text-xs text-over">{syncError}</p>}
        </section>
      ),
    },
    {
      id: "income-summary",
      title: "Income Summary",
      content: (
        <section className={panelClass}>
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">Income</p>
              <p className="font-display text-2xl font-bold tabular text-ink-900">{currency(data.income_summary?.net || 0)}</p>
              <p className="mt-1 text-xs text-ink-500">take-home this period</p>
            </div>
            <CircleDollarSign size={17} className="text-ink-300" />
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-500">Gross</span><span className="tabular font-medium">{currency(data.income_summary?.gross || 0)}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">Taxes</span><span className="tabular font-medium">{currency(data.income_summary?.taxes || 0)}</span></div>
          </div>
          <Link to="/income" className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent hover:text-accent-dark">View Income <ArrowRight size={14} /></Link>
        </section>
      ),
    },
    {
      id: "quick-actions",
      title: "Quick Actions",
      content: (
        <section className={`${panelClass} h-full`}>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-500">Quick Actions</p>
          <Link to="/charges" className="flex min-h-11 items-center justify-between border-b border-line py-2.5 text-sm font-medium text-ink-900">Edit Charges <ArrowRight size={14} className="text-ink-300" /></Link>
          <Link to="/analysis" className="flex min-h-11 items-center justify-between py-2.5 text-sm font-medium text-ink-900">View Analysis <ArrowRight size={14} className="text-ink-300" /></Link>
        </section>
      ),
    },
    {
      id: "top-categories",
      title: "Top Categories",
      content: (
        <section className={panelClass}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Top Categories</p>
            <Link to="/analysis" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-accent hover:text-accent-dark">View Analysis <ArrowRight size={12} /></Link>
          </div>
          {data.top_categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">No categorized spend yet this period.</p>
          ) : (
            <div className="space-y-5">
              {data.top_categories.map((cat) => {
                const maxAmount = data.top_categories[0].amount || 1;
                return (
                  <div key={cat.category_id}>
                    <div className="mb-1.5 flex items-center justify-between"><CategoryBadge name={cat.name} color={cat.color} /><span className="text-sm font-medium tabular text-ink-900">{currency(cat.amount)}</span></div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.05]"><div className="h-full rounded-full" style={{ width: `${(cat.amount / maxAmount) * 100}%`, backgroundColor: cat.color || "#2A6F6A" }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ),
    },
    {
      id: "recent-charges",
      title: "Recent Charges",
      content: (
        <section className={panelClass}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Recent Charges</p>
            <Link to="/charges" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-accent hover:text-accent-dark">View All <ArrowRight size={12} /></Link>
          </div>
          {data.recent_charges.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">No confirmed charges yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent_charges.map((charge) => (
                <li key={charge.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{charge.nickname || charge.source}</p>
                    <p className="flex items-center gap-1 text-xs tabular text-ink-500">{charge.date} {charge.recurring ? <Repeat size={11} className="text-accent" /> : null}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-medium tabular ${charge.amount < 0 ? "text-ink-900" : "text-good"}`}>{currency(charge.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <CustomizableCards
        key={hasAnyData ? "dashboard-with-data" : "dashboard-empty"}
        pageId="dashboard"
        cards={cards}
        defaultVisible={hasAnyData ? cards.map((card) => card.id) : []}
        emptyState={hasAnyData ? (
          <p className="py-8 text-center text-sm text-ink-500">All cards are hidden. Use Customize to add one back.</p>
        ) : (
          <div className="rounded-xl2 border border-line bg-surface shadow-card">
            <EmptyState icon={Wallet} title="No charges yet" message="Upload a credit card CSV export or a payslip to start building your Ledger." />
          </div>
        )}
        renderToolbar={({ editing, onToggleEdit }) => (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-xl font-bold text-ink-900 sm:text-2xl">Dashboard</h1>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodFilter value={period} onChange={setPeriod} options={PERIOD_OPTIONS} customRange={customRange} onCustomRange={(start, end) => setCustomRange({ start, end })} />
              <button type="button" onClick={onToggleEdit} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-ink-700 hover:bg-black/5">
                {editing ? <Check size={15} /> : <Pencil size={15} />}
                {editing ? "Done" : "Customize"}
              </button>
            </div>
          </div>
        )}
      />
    </div>
  );
}
