import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp, Repeat, Wallet } from "lucide-react";
import { getDashboard } from "../api/dashboard";
import PeriodFilter from "../components/PeriodFilter";
import CategoryBadge from "../components/CategoryBadge";
import EmptyState from "../components/EmptyState";

const currency = (n) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusCopy = {
  on_track: { label: "On Track", color: "text-good", bg: "bg-good/10" },
  behind: { label: "Behind", color: "text-warn", bg: "bg-warn/10" },
  over: { label: "Over Budget", color: "text-over", bg: "bg-over/10" },
};

export default function Dashboard() {
  const [period, setPeriod] = useState("this_month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getDashboard(period)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

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

  if (data && !data.has_data) {
    return (
      <div className="bg-surface border border-line rounded-xl2 shadow-card">
        <EmptyState
          icon={Wallet}
          title="No charges yet"
          message="Upload a credit card CSV export to start tracking your spending against your budget."
        />
      </div>
    );
  }

  const status =
    statusCopy[data?.budget_summary?.status] || statusCopy.on_track;
  const spentPct = data?.budget_summary?.total_target
    ? Math.min(
        (data.budget_summary.total_spent / data.budget_summary.total_target) *
          100,
        100,
      )
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-2xl text-ink-900">
          Dashboard
        </h1>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Budget summary card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="lg:col-span-2 bg-surface border border-line rounded-xl2 shadow-card p-6"
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
                Spent vs Budgeted
              </p>
              <div className="flex items-baseline gap-2">
                <span className="font-display font-bold text-3xl text-ink-900 tabular">
                  {currency(data.budget_summary.total_spent)}
                </span>
                <span className="text-ink-500 text-sm tabular">
                  of {currency(data.budget_summary.total_target)}
                </span>
              </div>
            </div>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}
            >
              {status.label}
            </span>
          </div>

          <div className="h-2.5 w-full rounded-full bg-black/[0.06] overflow-hidden mb-6">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                data.budget_summary.status === "over"
                  ? "bg-over"
                  : data.budget_summary.status === "behind"
                    ? "bg-warn"
                    : "bg-accent"
              }`}
              style={{ width: `${spentPct}%` }}
            />
          </div>

          <Link
            to="/budget"
            className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-dark"
          >
            View Budget <ArrowRight size={14} />
          </Link>
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="bg-surface border border-line rounded-xl2 shadow-card p-6 flex flex-col justify-between"
        >
          <div>
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-3">
              Quick Actions
            </p>
            <Link
              to="/charges"
              className="flex items-center justify-between text-sm font-medium text-ink-900 py-2.5 border-b border-line"
            >
              Edit Charges
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
            <Link
              to="/analysis"
              className="flex items-center justify-between text-sm font-medium text-ink-900 py-2.5"
            >
              View Analysis
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Category breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-surface border border-line rounded-xl2 shadow-card p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">
              Top Categories
            </p>
            <Link
              to="/analysis"
              className="text-xs font-semibold text-accent hover:text-accent-dark flex items-center gap-1"
            >
              View Analysis <ArrowRight size={12} />
            </Link>
          </div>
          {data.top_categories.length === 0 ? (
            <p className="text-sm text-ink-500 py-6 text-center">
              No categorized spend yet this period.
            </p>
          ) : (
            <div className="space-y-5">
              {data.top_categories.map((cat) => {
                const maxAmount = data.top_categories[0].amount || 1;
                return (
                  <div key={cat.category_id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <CategoryBadge name={cat.name} color={cat.color} />
                      <span className="text-sm font-medium tabular text-ink-900">
                        {currency(cat.amount)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-black/[0.05] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(cat.amount / maxAmount) * 100}%`,
                          backgroundColor: cat.color || "#2A6F6A",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Recent charges */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="bg-surface border border-line rounded-xl2 shadow-card p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">
              Recent Charges
            </p>
            <Link
              to="/charges"
              className="text-xs font-semibold text-accent hover:text-accent-dark flex items-center gap-1"
            >
              View All <ArrowRight size={12} />
            </Link>
          </div>
          {data.recent_charges.length === 0 ? (
            <p className="text-sm text-ink-500 py-6 text-center">
              No confirmed charges yet.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent_charges.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">
                      {c.nickname || c.source}
                    </p>
                    <p className="text-xs text-ink-500 flex items-center gap-1 tabular">
                      {c.date}{" "}
                      {c.recurring ? (
                        <Repeat size={11} className="text-accent" />
                      ) : null}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-medium tabular ${c.amount < 0 ? "text-ink-900" : "text-good"}`}
                  >
                    {currency(c.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>
    </div>
  );
}
