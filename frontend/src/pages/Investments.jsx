import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  PieChart,
  TrendingUp,
  TrendingDown,
  Landmark,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { getInvestmentsSummary, getInvestmentsHistory } from "../api/investments";
import CategoryBreakdownChart from "../components/charts/CategoryBreakdownChart";
import ValueTrendChart from "../components/charts/ValueTrendChart";
import EmptyState from "../components/EmptyState";

const currency = (n) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ALLOCATION_LABELS = {
  equity: "Stocks",
  etf: "ETFs",
  "mutual fund": "Mutual Funds",
  "fixed income": "Bonds",
  cash: "Cash",
  cryptocurrency: "Crypto",
  derivative: "Derivatives",
  loan: "Loans",
  other: "Other",
};

const ALLOCATION_COLORS = [
  "#2A6F6A",
  "#C7902E",
  "#B4483B",
  "#3F8C5F",
  "#6C5B7B",
  "#A8B0AA",
  "#4C7FA6",
  "#8C6B4F",
];

export default function Investments() {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  // Which accounts' holdings tables are expanded, keyed by account id.
  // Missing from this map means expanded — matches the same default as the
  // Accounts page's institution accordion.
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    Promise.all([getInvestmentsSummary(), getInvestmentsHistory(180)])
      .then(([summaryRes, historyRes]) => {
        setSummary(summaryRes);
        setHistory(historyRes.history);
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleExpanded(accountId) {
    setExpanded((prev) => ({ ...prev, [accountId]: prev[accountId] === false }));
  }

  if (loading) return <p className="text-sm text-ink-500">Loading…</p>;

  if (!summary || summary.accounts.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="font-display font-bold text-2xl text-ink-900">Investments</h1>
        <div className="bg-surface border border-line rounded-xl2 shadow-card">
          <EmptyState
            icon={PieChart}
            title="No investment accounts connected yet"
            message="Connect a brokerage, 401k, 403b, or IRA on the Accounts page to see holdings, allocation, and performance here."
            showUpload={false}
          />
          <div className="text-center pb-6">
            <Link to="/accounts" className="text-sm font-semibold text-accent">
              Go to Accounts →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const hasGain = summary.total_gain !== null && summary.total_gain !== undefined;
  const gainPositive = hasGain && summary.total_gain >= 0;

  const allocationData = summary.allocation.map((a, i) => ({
    name: ALLOCATION_LABELS[a.type] || a.type,
    amount: a.value,
    color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-2xl text-ink-900">Investments</h1>
        <Link
          to="/accounts"
          className="text-sm font-semibold text-accent hover:text-accent-dark"
        >
          Manage Accounts →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-surface border border-line rounded-xl2 shadow-card p-5">
          <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
            Total Value
          </p>
          <p className="font-display font-bold text-2xl text-ink-900 tabular">
            {currency(summary.total_value)}
          </p>
        </div>
        <div className="bg-surface border border-line rounded-xl2 shadow-card p-5">
          <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
            Cost Basis
          </p>
          <p className="font-display font-bold text-2xl text-ink-900 tabular">
            {summary.total_cost_basis !== null ? currency(summary.total_cost_basis) : "—"}
          </p>
        </div>
        <div className="bg-surface border border-line rounded-xl2 shadow-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
              Unrealized Gain/Loss
            </p>
            {hasGain &&
              (gainPositive ? (
                <TrendingUp size={16} className="text-good" />
              ) : (
                <TrendingDown size={16} className="text-over" />
              ))}
          </div>
          {hasGain ? (
            <p
              className={`font-display font-bold text-2xl tabular ${gainPositive ? "text-good" : "text-over"}`}
            >
              {currency(summary.total_gain)}{" "}
              <span className="text-base font-semibold">
                ({gainPositive ? "+" : ""}
                {summary.total_gain_pct}%)
              </span>
            </p>
          ) : (
            <p className="font-display font-bold text-2xl text-ink-900">—</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-surface border border-line rounded-xl2 shadow-card p-6">
          <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-3">
            Allocation
          </p>
          {allocationData.length > 0 ? (
            <CategoryBreakdownChart data={allocationData} />
          ) : (
            <p className="text-sm text-ink-500 py-8 text-center">No holdings synced yet.</p>
          )}
        </div>
        <div className="bg-surface border border-line rounded-xl2 shadow-card p-6">
          <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-3">
            Value Over Time
          </p>
          {history.length > 1 ? (
            <ValueTrendChart data={history} dataKey="value" label="Value" />
          ) : (
            <p className="text-sm text-ink-500 py-8 text-center">
              Not enough history yet — this builds up from today as your accounts sync.
            </p>
          )}
        </div>
      </div>

      {summary.accounts.map((account) => {
        const isExpanded = expanded[account.id] !== false;
        return (
        <div
          key={account.id}
          className="bg-surface border border-line rounded-xl2 shadow-card overflow-hidden"
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggleExpanded(account.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleExpanded(account.id);
              }
            }}
            aria-expanded={isExpanded}
            className={`flex items-center justify-between p-4 flex-wrap gap-2 cursor-pointer hover:bg-black/[0.015] transition-colors ${isExpanded ? "border-b border-line" : ""}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accent-light flex items-center justify-center shrink-0">
                <Landmark size={16} className="text-accent-dark" />
              </div>
              <div>
                <p className="font-display font-semibold text-ink-900">
                  {account.institution_name ? `${account.institution_name} — ` : ""}
                  {account.name}
                  {account.mask ? ` ···· ${account.mask}` : ""}
                </p>
                <p className="text-xs text-ink-500 tabular">
                  {account.subtype || "investment"}
                  {` · ${account.holdings.length} holding${account.holdings.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold tabular text-ink-900">
                  {currency(account.holdings_value)}
                </p>
                {account.gain !== null && (
                  <p
                    className={`text-xs font-medium tabular ${account.gain >= 0 ? "text-good" : "text-over"}`}
                  >
                    {account.gain >= 0 ? "+" : ""}
                    {currency(account.gain)}
                  </p>
                )}
              </div>
              {isExpanded ? (
                <ChevronDown size={16} className="text-ink-500 shrink-0" />
              ) : (
                <ChevronRight size={16} className="text-ink-500 shrink-0" />
              )}
            </div>
          </div>

          {isExpanded && (account.holdings.length === 0 ? (
            <p className="text-sm text-ink-500 p-4">No holdings synced yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left font-medium text-ink-500 text-xs uppercase tracking-wide py-2.5 px-4">
                      Security
                    </th>
                    <th className="text-left font-medium text-ink-500 text-xs uppercase tracking-wide py-2.5 px-3">
                      Type
                    </th>
                    <th className="text-right font-medium text-ink-500 text-xs uppercase tracking-wide py-2.5 px-3">
                      Quantity
                    </th>
                    <th className="text-right font-medium text-ink-500 text-xs uppercase tracking-wide py-2.5 px-3">
                      Price
                    </th>
                    <th className="text-right font-medium text-ink-500 text-xs uppercase tracking-wide py-2.5 px-3">
                      Value
                    </th>
                    <th className="text-right font-medium text-ink-500 text-xs uppercase tracking-wide py-2.5 px-4">
                      Gain/Loss
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {account.holdings.map((h, i) => (
                    <tr key={i} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5 text-sm text-ink-900">
                        <span className="font-medium">{h.ticker || h.name}</span>
                        {h.ticker && (
                          <span className="text-ink-500"> · {h.name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-ink-500">
                        {ALLOCATION_LABELS[h.type] || h.type}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right tabular text-ink-700">
                        {h.quantity ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right tabular text-ink-700">
                        {h.price !== null ? currency(h.price) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right tabular font-medium text-ink-900">
                        {currency(h.value)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-sm text-right tabular font-medium ${
                          h.gain === null
                            ? "text-ink-500"
                            : h.gain >= 0
                              ? "text-good"
                              : "text-over"
                        }`}
                      >
                        {h.gain === null
                          ? "—"
                          : `${h.gain >= 0 ? "+" : ""}${currency(h.gain)} (${h.gain_pct >= 0 ? "+" : ""}${h.gain_pct}%)`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        );
      })}
    </div>
  );
}
