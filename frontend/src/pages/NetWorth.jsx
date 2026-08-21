import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingUp, TrendingDown, Landmark } from "lucide-react";
import { getNetWorth, getNetWorthHistory } from "../api/networth";
import EmptyState from "../components/EmptyState";
import ValueTrendChart from "../components/charts/ValueTrendChart";

const currency = (n) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function AccountGroup({ title, accounts, total, tone }) {
  const maxBalance = Math.max(...accounts.map((a) => a.balance), 1);
  return (
    <div className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">{title}</p>
        <span className={`text-sm font-semibold tabular ${tone}`}>{currency(total)}</span>
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-ink-500 py-4 text-center">Nothing here yet.</p>
      ) : (
        <div className="space-y-4">
          {accounts.map((a) => (
            <div key={a.id}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900 truncate">{a.name}</p>
                  <p className="text-xs text-ink-500 truncate">
                    {a.institution_name || (a.is_manual ? "Manual" : a.type)}
                  </p>
                </div>
                <span className="text-sm font-medium tabular text-ink-900 shrink-0 ml-3">
                  {currency(a.balance)}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-black/[0.05] overflow-hidden">
                <div
                  className={`h-full rounded-full ${tone === "text-good" ? "bg-good" : "bg-over"}`}
                  style={{ width: `${(a.balance / maxBalance) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NetWorth() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getNetWorth(), getNetWorthHistory(180)])
      .then(([netWorthRes, historyRes]) => {
        setData(netWorthRes);
        setHistory(historyRes.history);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-ink-500">Loading…</p>;

  const hasAnyAccounts =
    (data?.assets?.accounts?.length || 0) + (data?.liabilities?.accounts?.length || 0) > 0;

  if (!hasAnyAccounts) {
    return (
      <div className="space-y-5">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-ink-900">Net Worth</h1>
        <div className="bg-surface border border-line rounded-xl2 shadow-card">
          <EmptyState
            icon={Landmark}
            title="No accounts connected yet"
            message="Connect a bank or investment account to see assets, liabilities, and your overall net worth here."
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

  const isPositive = data.net_worth >= 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-ink-900">Net Worth</h1>
        <Link
          to="/accounts"
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-dark"
        >
          Manage Accounts <ArrowRight size={14} />
        </Link>
      </div>

      <div className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
              Total Net Worth
            </p>
            <p
              className={`font-display font-bold text-3xl tabular ${isPositive ? "text-ink-900" : "text-over"}`}
            >
              {currency(data.net_worth)}
            </p>
          </div>
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${isPositive ? "bg-good/10" : "bg-over/10"}`}
          >
            {isPositive ? (
              <TrendingUp size={18} className="text-good" />
            ) : (
              <TrendingDown size={18} className="text-over" />
            )}
          </div>
        </div>
        <p className="text-sm text-ink-500 mt-2 tabular">
          {currency(data.assets.total)} in assets − {currency(data.liabilities.total)} in
          liabilities
        </p>
      </div>

      {history.length > 1 && (
        <div className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-6">
          <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-3">
            Net Worth Over Time
          </p>
          <ValueTrendChart
            data={history}
            dataKey="net_worth"
            label="Net Worth"
            color={isPositive ? "#2A6F6A" : "#B4483B"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <AccountGroup
          title="Assets"
          accounts={data.assets.accounts}
          total={data.assets.total}
          tone="text-good"
        />
        <AccountGroup
          title="Liabilities"
          accounts={data.liabilities.accounts}
          total={data.liabilities.total}
          tone="text-over"
        />
      </div>
    </div>
  );
}
