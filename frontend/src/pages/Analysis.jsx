import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Repeat,
  Store,
  Gauge,
  Calendar,
  Receipt,
  Flame,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getAnalysis } from "../api/analysis";
import PeriodFilter from "../components/PeriodFilter";
import CategoryBadge from "../components/CategoryBadge";
import CategoryBreakdownChart from "../components/charts/CategoryBreakdownChart";
import TrendChart from "../components/charts/TrendChart";
import EmptyState from "../components/EmptyState";

/**
 * NEW OPTIONAL FIELDS EXPECTED ON `data` (from getAnalysis):
 *
 * data.category_breakdown[i].previous_total?: number
 *   Same category's total for the prior comparable period. Powers the
 *   per-category MoM badges. If absent, only the total MoM badge (derived
 *   from period_comparison, already present) is shown.
 *
 * data.category_trend?: Array<{
 *   month: string,                          // e.g. "Mar"
 *   categories: Record<string, number>,     // category_id -> total for that month
 * }>
 *   6 months of per-category totals, powers the multi-line trend chart.
 *   Category name/color are looked up from data.category_breakdown.
 *
 * data.day_of_week_breakdown?: Array<{
 *   day: "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat",
 *   total: number,
 * }>
 *   One entry per day of week (any order; sorted client-side), all charges
 *   in the current period.
 *
 * data.biggest_charges?: Array<{
 *   id: string,
 *   merchant: string,
 *   date: string,            // ISO date
 *   amount: number,
 *   category_id?: string,
 * }>
 *   Individual transactions, not aggregated by merchant. category_id is
 *   looked up against data.category_breakdown for name/color.
 *
 * data.budget_variance_history?: Array<{
 *   category_id: string,
 *   name: string,
 *   color?: string,
 *   months: Array<{ month: string, status: "over" | "under" | "on_budget" }>,
 * }>
 *   Ordered oldest -> newest, powers the streak view.
 */

const currency = (n) =>
  `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compactCurrency = (n) =>
  `$${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const PERIOD_OPTIONS = [
  { value: "30d", label: "30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "ytd", label: "YTD" },
];

const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_PALETTE = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#0ea5e9",
  "#a855f7",
  "#ef4444",
];

function pctChange(current, previous) {
  if (previous === undefined || previous === null) return 0;
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function MoMBadge({ pct, size = "sm" }) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  const rounded = Math.round(pct);
  const isUp = rounded > 0;
  const isFlat = rounded === 0;
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  const color = isFlat
    ? "text-ink-500 bg-black/[0.04]"
    : isUp
      ? "text-rose-600 bg-rose-50"
      : "text-emerald-600 bg-emerald-50";
  const padding =
    size === "lg" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full font-semibold tabular ${color} ${padding}`}
    >
      <Icon size={size === "lg" ? 12 : 11} />
      {isFlat ? "0%" : `${isUp ? "+" : ""}${rounded}%`}
    </span>
  );
}

function CategoryTrendCard({ categoryTrend, categoryBreakdown }) {
  if (!categoryTrend || categoryTrend.length === 0) {
    return (
      <p className="text-sm text-ink-500 py-10 text-center">
        Not enough history yet to chart category trends.
      </p>
    );
  }

  const months = categoryTrend.map((m) => m.month);
  const categoryIds = Array.from(
    new Set(categoryTrend.flatMap((m) => Object.keys(m.categories || {}))),
  );

  const series = categoryIds.map((id, i) => {
    const meta = categoryBreakdown?.find((c) => c.category_id === id);
    return {
      id,
      name: meta?.name || id,
      color: meta?.color || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
      data: categoryTrend.map((m) => m.categories?.[id] ?? 0),
    };
  });

  const width = 640;
  const height = 240;
  const padding = { top: 12, right: 16, bottom: 28, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxY = Math.max(1, ...series.flatMap((s) => s.data));
  const xStep = months.length > 1 ? innerW / (months.length - 1) : 0;
  const xFor = (i) => padding.left + i * xStep;
  const yFor = (v) => padding.top + innerH - (v / maxY) * innerH;

  const gridLines = 4;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = padding.top + (innerH / gridLines) * i;
          const val = Math.round(maxY - (maxY / gridLines) * i);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-ink-300"
                strokeOpacity={0.25}
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-ink-500"
                fontSize={9}
              >
                {compactCurrency(val)}
              </text>
            </g>
          );
        })}

        {months.map((m, i) => (
          <text
            key={m + i}
            x={xFor(i)}
            y={height - 8}
            textAnchor="middle"
            className="fill-ink-500"
            fontSize={10}
          >
            {m}
          </text>
        ))}

        {series.map((s) => {
          const d = s.data
            .map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`)
            .join(" ");
          return (
            <g key={s.id}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
              {s.data.map((v, i) => (
                <circle
                  key={i}
                  cx={xFor(i)}
                  cy={yFor(v)}
                  r={2.5}
                  fill={s.color}
                />
              ))}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {series.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1.5 text-xs text-ink-700"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function DayOfWeekCard({ dayOfWeekBreakdown }) {
  if (!dayOfWeekBreakdown || dayOfWeekBreakdown.length === 0) {
    return (
      <p className="text-sm text-ink-500 py-10 text-center">
        Not enough data yet to break down by day.
      </p>
    );
  }

  const byDay = DAY_ORDER.map((day) => {
    const entry = dayOfWeekBreakdown.find((d) => d.day === day);
    return { day, total: entry?.total ?? 0 };
  });

  const maxVal = Math.max(1, ...byDay.map((d) => d.total));
  const weekendTotal = byDay
    .filter((d) => d.day === "Sat" || d.day === "Sun")
    .reduce((sum, d) => sum + d.total, 0);
  const weekdayTotal = byDay
    .filter((d) => d.day !== "Sat" && d.day !== "Sun")
    .reduce((sum, d) => sum + d.total, 0);
  const total = weekendTotal + weekdayTotal;
  const weekendPct = total ? (weekendTotal / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-end gap-2 h-32 mb-2">
        {byDay.map((d) => {
          const isWeekend = d.day === "Sat" || d.day === "Sun";
          const heightPct = (d.total / maxVal) * 100;
          return (
            <div
              key={d.day}
              className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end"
            >
              <div
                className={`w-full rounded-t-md ${isWeekend ? "bg-accent" : "bg-ink-300"}`}
                style={{ height: `${Math.max(heightPct, 2)}%` }}
                title={`${d.day}: ${currency(d.total)}`}
              />
              <span className="text-[11px] text-ink-500 font-medium">
                {d.day}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-sm pt-3 border-t border-line mt-3">
        <span className="flex items-center gap-1.5 text-ink-700">
          <span className="w-2 h-2 rounded-full bg-accent" /> Weekend
          <span className="tabular font-medium text-ink-900 ml-1">
            {currency(weekendTotal)}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-ink-700">
          <span className="w-2 h-2 rounded-full bg-ink-300" /> Weekday
          <span className="tabular font-medium text-ink-900 ml-1">
            {currency(weekdayTotal)}
          </span>
        </span>
        <span className="text-xs text-ink-500 tabular">
          {Math.round(weekendPct)}% on weekends
        </span>
      </div>
    </div>
  );
}

function BiggestChargesCard({ charges, categoryBreakdown }) {
  if (!charges || charges.length === 0) {
    return (
      <p className="text-sm text-ink-500 py-6 text-center">Nothing here yet.</p>
    );
  }

  const top5 = [...charges]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5);

  return (
    <ul className="divide-y divide-line">
      {top5.map((c) => {
        const meta = categoryBreakdown?.find(
          (cat) => cat.category_id === c.category_id,
        );
        const dateLabel = c.date
          ? new Date(c.date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          : null;
        return (
          <li
            key={c.id}
            className="flex items-center justify-between py-2.5 gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-900 truncate">
                {c.merchant}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {meta && <CategoryBadge name={meta.name} color={meta.color} />}
                {dateLabel && (
                  <span className="text-xs text-ink-500">{dateLabel}</span>
                )}
              </div>
            </div>
            <span className="text-sm font-medium tabular text-ink-900 shrink-0">
              {currency(c.amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function BudgetStreakCard({ history }) {
  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-ink-500 py-10 text-center">
        Not enough history yet to show budget streaks.
      </p>
    );
  }

  const dotClass = (status) =>
    status === "over"
      ? "bg-rose-400"
      : status === "under"
        ? "bg-emerald-400"
        : "bg-ink-300";

  const streakFor = (months) => {
    if (!months || months.length === 0) return null;
    const last = months[months.length - 1].status;
    if (last === "on_budget") return null;
    let count = 0;
    for (let i = months.length - 1; i >= 0; i--) {
      if (months[i].status === last) count += 1;
      else break;
    }
    return { status: last, count };
  };

  return (
    <ul className="space-y-3.5">
      {history.map((cat) => {
        const streak = streakFor(cat.months);
        return (
          <li key={cat.category_id}>
            <div className="flex items-center justify-between mb-1.5">
              <CategoryBadge name={cat.name} color={cat.color} />
              {streak && (
                <span
                  className={`text-xs font-medium flex items-center gap-1 ${
                    streak.status === "over"
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }`}
                >
                  <Flame size={12} />
                  {streak.count} {streak.count === 1 ? "month" : "months"}{" "}
                  {streak.status === "over" ? "over" : "under"}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {cat.months.map((m, i) => (
                <span
                  key={i}
                  title={`${m.month}: ${m.status.replace("_", " ")}`}
                  className={`h-2.5 flex-1 rounded-sm ${dotClass(m.status)}`}
                />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AnalysisCard({ children, className = "", title, icon: Icon }) {
  return (
    <section
      className={`bg-surface border border-line rounded-xl2 shadow-card p-6 ${className}`}
    >
      {title && (
        <div className="flex items-center gap-1.5 mb-4">
          {Icon && <Icon size={14} className="text-ink-500" />}
          <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">
            {title}
          </p>
        </div>
      )}
      {children}
    </section>
  );
}

function PeriodComparisonCard({ data, totalMomPct }) {
  const cards = [
    {
      label: "This Month",
      value: data.period_comparison.this_month,
      mom: totalMomPct,
    },
    {
      label: "Last Month",
      value: data.period_comparison.last_month,
    },
    {
      label: "3-Month Avg",
      value: data.period_comparison.three_month_avg,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => (
        <AnalysisCard key={card.label} className="p-4">
          <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
            {card.label}
          </p>
          <div className="flex items-center gap-2">
            <p className="font-display font-bold text-xl text-ink-900 tabular">
              {currency(card.value)}
            </p>
            {card.mom !== undefined && <MoMBadge pct={card.mom} />}
          </div>
        </AnalysisCard>
      ))}
    </div>
  );
}

function CategoryBreakdownCard({ data, className = "" }) {
  return (
    <AnalysisCard title="Category Breakdown" className={className}>
      {data.category_breakdown.length ? (
        <>
          <CategoryBreakdownChart data={data.category_breakdown} />
          <ul className="mt-4 space-y-2">
            {data.category_breakdown.map((c) => (
              <li
                key={c.category_id}
                className="flex items-center justify-between text-sm"
              >
                <CategoryBadge name={c.name} color={c.color} />
                <span className="flex items-center gap-1.5">
                  <span className="tabular text-ink-900 font-medium">
                    {currency(c.total)}
                  </span>
                  <MoMBadge pct={pctChange(c.total, c.previous_total)} />
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-ink-500 py-10 text-center">
          No categorized spend this period.
        </p>
      )}
    </AnalysisCard>
  );
}

function SpendingTrendCard({ data, className = "" }) {
  return (
    <AnalysisCard
      title="6-Month Spending Trend"
      icon={TrendingUp}
      className={className}
    >
      <TrendChart data={data.monthly_trend} />
    </AnalysisCard>
  );
}

function CategoryTrendSection({ data, className = "" }) {
  return (
    <AnalysisCard
      title="Category Trend Over Time"
      icon={TrendingUp}
      className={className}
    >
      <CategoryTrendCard
        categoryTrend={data.category_trend}
        categoryBreakdown={data.category_breakdown}
      />
    </AnalysisCard>
  );
}

function DayOfWeekSection({ data, className = "" }) {
  return (
    <AnalysisCard
      title="Spend by Day of Week"
      icon={Calendar}
      className={className}
    >
      <DayOfWeekCard dayOfWeekBreakdown={data.day_of_week_breakdown} />
    </AnalysisCard>
  );
}

function TopSpendingSourcesCard({ data, showAllSources, onToggle }) {
  const visibleSources = showAllSources
    ? data.top_merchants
    : data.top_merchants.slice(0, 3);

  return (
    <AnalysisCard title="Top Spending Sources" icon={Store}>
      {data.top_merchants.length === 0 ? (
        <p className="text-sm text-ink-500 py-6 text-center">
          Nothing here yet.
        </p>
      ) : (
        <div className="flex flex-col">
          {/* Scrollable list */}
          <div className="max-h-[260px] overflow-y-auto pr-1">
            <ul className="divide-y divide-line">
              {visibleSources.map((m) => (
                <li
                  key={m.source}
                  className="flex items-center justify-between py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">
                      {m.source}
                    </p>
                    <p className="text-xs text-ink-500">
                      {m.count} {m.count === 1 ? "charge" : "charges"}
                    </p>
                  </div>

                  <span className="text-sm font-medium tabular text-ink-900 shrink-0 ml-3">
                    {currency(m.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Button stays outside the scroll area */}
          {data.top_merchants.length > 3 && (
            <button
              onClick={onToggle}
              className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-dark mt-3"
            >
              {showAllSources ? (
                <>
                  Show less <ChevronUp size={13} />
                </>
              ) : (
                <>
                  Show all {data.top_merchants.length} sources{" "}
                  <ChevronDown size={13} />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </AnalysisCard>
  );
}

function BiggestChargesSection({ data }) {
  return (
    <AnalysisCard title="Biggest Charges This Period" icon={Receipt}>
      <BiggestChargesCard
        charges={data.biggest_charges}
        categoryBreakdown={data.category_breakdown}
      />
    </AnalysisCard>
  );
}

function RecurringVsOneTimeCard({ data, className = "" }) {
  const total = data.recurring_split.recurring + data.recurring_split.one_time;
  const recurringPct = total
    ? (data.recurring_split.recurring / total) * 100
    : 0;

  return (
    <AnalysisCard
      title="Recurring vs One-Time"
      icon={Repeat}
      className={className}
    >
      <div className="h-3 w-full rounded-full bg-black/[0.06] overflow-hidden flex mb-3">
        <div
          className="h-full bg-accent"
          style={{ width: `${recurringPct}%` }}
        />
        <div
          className="h-full bg-ink-300"
          style={{ width: `${100 - recurringPct}%` }}
        />
      </div>

      <div className="flex justify-between text-sm gap-4">
        <span className="flex items-center gap-1.5 text-ink-700">
          <span className="w-2 h-2 rounded-full bg-accent" />
          Recurring
          <span className="tabular font-medium text-ink-900 ml-1">
            {currency(data.recurring_split.recurring)}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-ink-700">
          <span className="w-2 h-2 rounded-full bg-ink-300" />
          One-time
          <span className="tabular font-medium text-ink-900 ml-1">
            {currency(data.recurring_split.one_time)}
          </span>
        </span>
      </div>
    </AnalysisCard>
  );
}

function PaceProjectionCard({ data, className = "" }) {
  if (Object.keys(data.pace_projection || {}).length === 0) return null;

  const firstProjection = Object.values(data.pace_projection)[0];

  return (
    <AnalysisCard
      title={`Pace Projection (${firstProjection?.days_elapsed} of ${firstProjection?.days_in_month} days)`}
      icon={Gauge}
      className={className}
    >
      <ul className="space-y-2.5">
        {Object.entries(data.pace_projection).map(([catId, p]) => {
          const meta = data.category_breakdown.find(
            (c) => c.category_id === catId,
          );

          return (
            <li
              key={catId}
              className="flex items-center justify-between text-sm"
            >
              <CategoryBadge name={meta?.name || catId} color={meta?.color} />
              <span className="tabular text-ink-700">
                {currency(p.spent_so_far)}{" "}
                <span className="text-ink-300">→</span>{" "}
                <span className="font-medium text-ink-900">
                  {currency(p.projected_total)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </AnalysisCard>
  );
}

function BudgetVarianceCard({ data }) {
  return (
    <AnalysisCard title="Budget Variance History" icon={Flame}>
      <BudgetStreakCard history={data.budget_variance_history} />
    </AnalysisCard>
  );
}

function AnalysisContent({ data, totalMomPct }) {
  const [showAllSources, setShowAllSources] = useState(false);

  return (
    <div className="space-y-5">
      <PeriodComparisonCard data={data} totalMomPct={totalMomPct} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left side */}
        <CategoryBreakdownCard data={data} className="lg:col-span-2" />

        {/* Right side */}
        <div className="lg:col-span-3 space-y-5">
          <SpendingTrendCard data={data} />
          <CategoryTrendSection data={data} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TopSpendingSourcesCard
          data={data}
          showAllSources={showAllSources}
          onToggle={() => setShowAllSources((value) => !value)}
        />
        <BiggestChargesSection data={data} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left side */}
        <PaceProjectionCard data={data} className="lg:col-span-2" />

        {/* Right side */}
        <div className="lg:col-span-3 space-y-5">
          <DayOfWeekSection data={data} />
          <BudgetVarianceCard data={data} />
        </div>
      </div>
    </div>
  );
}

function AnalysisEmptyState() {
  return (
    <div className="bg-surface border border-line rounded-xl2 shadow-card">
      <EmptyState
        icon={TrendingUp}
        title="Nothing to analyze yet"
        message="Once you've confirmed some charges, spending breakdowns and trends will show up here."
      />
    </div>
  );
}

export default function Analysis() {
  const [period, setPeriod] = useState("this_month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAnalysis(period)
      .then(setData)
      .finally(() => setLoading(false));
  }, [period]);

  if (loading && !data) {
    return <p className="text-sm text-ink-500">Loading…</p>;
  }

  const noData =
    data &&
    data.category_breakdown.length === 0 &&
    data.top_merchants.length === 0;

  const totalMomPct = data
    ? pctChange(
        data.period_comparison.this_month,
        data.period_comparison.last_month,
      )
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-2xl text-ink-900">
          Analysis
        </h1>
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          options={PERIOD_OPTIONS}
        />
      </div>

      {noData ? (
        <AnalysisEmptyState />
      ) : (
        <AnalysisContent data={data} totalMomPct={totalMomPct} />
      )}
    </div>
  );
}
