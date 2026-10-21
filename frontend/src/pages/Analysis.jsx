import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Repeat,
  Store,
  Gauge,
  Receipt,
  Flame,
  ChevronDown,
  ChevronUp,
  PiggyBank,
  Pencil,
  Check,
} from "lucide-react";
import { getAnalysis } from "../api/analysis";
import PeriodFilter from "../components/PeriodFilter";
import CategoryBadge from "../components/CategoryBadge";
import CategoryBreakdownChart from "../components/charts/CategoryBreakdownChart";
import TrendChart from "../components/charts/TrendChart";
import EmptyState from "../components/EmptyState";
import CustomizableCards from "../components/CustomizableCards";
import PageHeader from "../components/PageHeader";
import PageLoading from "../components/PageLoading";
import { formatMonthShort, formatMonthYear } from "../utils/date";

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
 *   budget: number,          // monthly target for this category
 *   months: Array<{
 *     month: string,           // "YYYY-MM"
 *     status: "over" | "under" | "on_budget",
 *     spent: number,           // amount spent that month
 *     variance: number,        // spent - budget (positive = over, negative = under)
 *   }>,
 * }>
 *   Ordered oldest -> newest, powers the streak view.
 */

const currency = (n) =>
  `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compactCurrency = (n) =>
  `$${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const PERIOD_OPTIONS = [
  { value: "custom", label: "Custom" },
  { value: "30d", label: "30 Days" },
  { value: "ytd", label: "YTD" },
];


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
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(null);
  if (!categoryTrend || categoryTrend.length === 0) {
    return (
      <p className="text-sm text-ink-500 py-10 text-center">
        Not enough history yet to chart category trends.
      </p>
    );
  }

  const months = categoryTrend.map((m) => m.month);
  const activeMonthIndex = selectedMonthIndex ?? months.length - 1;
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
                <g key={i}>
                  <circle
                    cx={xFor(i)}
                    cy={yFor(v)}
                    r={activeMonthIndex === i ? 4 : 2.5}
                    fill={s.color}
                    pointerEvents="none"
                  />
                </g>
              ))}
            </g>
          );
        })}

        {months.map((month, i) => {
          const left = i === 0 ? padding.left : (xFor(i - 1) + xFor(i)) / 2;
          const right = i === months.length - 1
            ? width - padding.right
            : (xFor(i) + xFor(i + 1)) / 2;
          return (
            <rect
              key={`month-hit-${month}`}
              x={left}
              y={padding.top}
              width={Math.max(1, right - left)}
              height={innerH}
              fill="transparent"
              role="button"
              tabIndex={0}
              aria-pressed={activeMonthIndex === i}
              aria-label={`Show ${formatMonthYear(month)} category totals`}
              className="cursor-pointer outline-none focus-visible:stroke-accent focus-visible:stroke-2"
              onClick={() => setSelectedMonthIndex(i)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedMonthIndex(i);
                }
              }}
            />
          );
        })}
      </svg>

      <div className="rounded-xl bg-canvas/70 p-3" aria-live="polite">
        <p className="mb-2 text-xs font-semibold text-ink-900">
          {formatMonthYear(months[activeMonthIndex])} · tap a chart point to inspect
        </p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {series.map((s) => (
            <li key={s.id} className="flex min-w-0 items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-ink-500">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.name}</span>
              </span>
              <span className="shrink-0 font-medium tabular text-ink-900">
                {currency(s.data[activeMonthIndex])}
              </span>
            </li>
          ))}
        </ul>
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
  const [activeMonth, setActiveMonth] = useState(null);
  const monthControlsRef = useRef(null);

  useEffect(() => {
    if (!activeMonth) return undefined;

    const dismissOnOutsideClick = (event) => {
      if (!monthControlsRef.current?.contains(event.target)) {
        setActiveMonth(null);
      }
    };
    const dismissOnScroll = () => setActiveMonth(null);
    const dismissOnEscape = (event) => {
      if (event.key === "Escape") setActiveMonth(null);
    };

    document.addEventListener("pointerdown", dismissOnOutsideClick);
    document.addEventListener("scroll", dismissOnScroll, true);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsideClick);
      document.removeEventListener("scroll", dismissOnScroll, true);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [activeMonth]);

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

  const varianceLabel = (variance) =>
    variance > 0
      ? `${currency(variance)} over budget`
      : variance < 0
        ? `${currency(Math.abs(variance))} under budget`
        : "on budget";

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

  const barTooltip = (m) => {
    const variance = m.variance ?? 0;
    return `${formatMonthYear(m.month)}: ${currency(m.spent ?? 0)} spent — ${varianceLabel(variance)}`;
  };

  return (
    <ul className="space-y-5" ref={monthControlsRef}>
      {history.map((cat) => {
        const streak = streakFor(cat.months);
        return (
          <li key={cat.category_id}>
            <div className="flex items-center justify-between mb-1">
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
            <p className="text-xs text-ink-500 mb-2">
              {currency(cat.budget)} budgeted / month
            </p>
            <div className="flex gap-1">
              {cat.months.map((m, i) => {
                const monthKey = `${cat.category_id}-${i}`;
                const isActive = activeMonth?.key === monthKey;
                const variance = m.variance ?? 0;
                return (
                  <div className="min-w-0 flex-1" key={i}>
                    <button
                      type="button"
                      aria-label={barTooltip(m)}
                      aria-expanded={isActive}
                      aria-haspopup="dialog"
                      onClick={(event) => {
                        if (isActive) {
                          setActiveMonth(null);
                          return;
                        }
                        const rect = event.currentTarget.getBoundingClientRect();
                        setActiveMonth({
                          key: monthKey,
                          x: Math.max(144, Math.min(window.innerWidth - 144, rect.left + rect.width / 2)),
                          y: rect.top - 8,
                          month: formatMonthYear(m.month),
                          spent: currency(m.spent ?? 0),
                          variance: varianceLabel(variance),
                          status: m.status,
                        });
                      }}
                      className="flex w-full flex-col items-center gap-1 cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"
                    >
                      <span
                        className={`h-2.5 w-full rounded-sm ${dotClass(m.status)}`}
                      />
                      <span className="text-[10px] text-ink-500">
                        {formatMonthShort(m.month)}
                      </span>
                    </button>
                    {isActive && (
                      <div
                        role="dialog"
                        aria-label={`${activeMonth.month} budget details`}
                        className="fixed z-50 w-72 max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-700 shadow-lg"
                        style={{ left: activeMonth.x, top: activeMonth.y }}
                      >
                        <p className="font-medium text-ink-900">{activeMonth.month}</p>
                        <p className="mt-1">{activeMonth.spent} spent</p>
                        <p className={`mt-1 flex items-center gap-1 font-medium ${
                          activeMonth.status === "over"
                            ? "text-rose-600"
                            : activeMonth.status === "under"
                              ? "text-emerald-600"
                              : "text-ink-500"
                        }`}>
                          {activeMonth.status === "over" ? (
                            <TrendingUp size={13} aria-hidden="true" />
                          ) : activeMonth.status === "under" ? (
                            <TrendingDown size={13} aria-hidden="true" />
                          ) : null}
                          {activeMonth.variance}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
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
      className={`bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-6 ${className}`}
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
    <AnalysisCard title="Period Comparison">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg bg-canvas/50 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">
              {card.label}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-xl font-bold tabular text-ink-900">
                {currency(card.value)}
              </p>
              {card.mom !== undefined && <MoMBadge pct={card.mom} />}
            </div>
          </div>
        ))}
      </div>
    </AnalysisCard>
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
  if (Object.keys(data.pace_projection || {}).length === 0) {
    return (
      <AnalysisCard title="Pace Projection" icon={Gauge} className={className}>
        <p className="py-6 text-center text-sm text-ink-500">
          No projection data for this period.
        </p>
      </AnalysisCard>
    );
  }

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

function BudgetVarianceCard({ data, className = "" }) {
  return (
    <AnalysisCard
      title="Budget Variance History"
      icon={Flame}
      className={className}
    >
      <BudgetStreakCard history={data.budget_variance_history} />
    </AnalysisCard>
  );
}

function AnalysisContent({
  data,
  totalMomPct,
  noData,
  period,
  setPeriod,
  customRange,
  setCustomRange,
}) {
  const [showAllSources, setShowAllSources] = useState(false);
  const cards = [
    {
      id: "period-comparison",
      title: "Period Comparison",
      content: <PeriodComparisonCard data={data} totalMomPct={totalMomPct} />,
    },
    {
      id: "category-breakdown",
      title: "Category Breakdown",
      content: <CategoryBreakdownCard data={data} />,
    },
    {
      id: "spending-trend",
      title: "6-Month Spending Trend",
      content: <SpendingTrendCard data={data} />,
    },
    {
      id: "category-trend",
      title: "Category Trend Over Time",
      content: <CategoryTrendSection data={data} />,
    },
    {
      id: "biggest-charges",
      title: "Biggest Charges This Period",
      content: <BiggestChargesSection data={data} />,
    },
    {
      id: "top-spending-sources",
      title: "Top Spending Sources",
      content: (
        <TopSpendingSourcesCard
          data={data}
          showAllSources={showAllSources}
          onToggle={() => setShowAllSources((value) => !value)}
        />
      ),
    },
    {
      id: "pace-projection",
      title: "Pace Projection",
      content: <PaceProjectionCard data={data} />,
    },
    {
      id: "budget-variance-history",
      title: "Budget Variance History",
      content: <BudgetVarianceCard data={data} />,
    },
  ];

  return (
    <CustomizableCards
      key={noData ? "analysis-empty" : "analysis-with-data"}
      pageId="analysis"
      cards={cards}
      defaultVisible={noData ? [] : cards.map((card) => card.id)}
      columnsClass="grid-cols-1 lg:grid-cols-2"
      emptyState={noData ? (
        <AnalysisEmptyState />
      ) : (
        <p className="py-8 text-center text-sm text-ink-500">
          All cards are hidden. Use Customize to add one back.
        </p>
      )}
      renderToolbar={({ editing, onToggleEdit }) => (
        <PageHeader
          title="Analysis"
          eyebrow="Spending insights"
          actions={
            <>
            <Link
              to="/budget"
              title="Budget"
              aria-label="Budget"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-ink-700 hover:bg-black/5"
            >
              <PiggyBank size={16} />
            </Link>
            <PeriodFilter
              value={period}
              onChange={setPeriod}
              options={PERIOD_OPTIONS}
              customRange={customRange}
              onCustomRange={(start, end) => setCustomRange({ start, end })}
            />
            <button
              type="button"
              onClick={onToggleEdit}
              title={editing ? "Done customizing" : "Customize page"}
              aria-label={editing ? "Done customizing" : "Customize page"}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-ink-700 hover:bg-black/5"
            >
              {editing ? <Check size={16} /> : <Pencil size={16} />}
            </button>
            </>
          }
        />
      )}
    />
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
  const [customRange, setCustomRange] = useState({ start: null, end: null });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAnalysis(period, customRange.start, customRange.end)
      .then(setData)
      .finally(() => setLoading(false));
  }, [period, customRange.start, customRange.end]);

  if (loading && !data) {
    return <PageLoading label="Loading analysis" />;
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
      <AnalysisContent
        data={data}
        totalMomPct={totalMomPct}
        noData={noData}
        period={period}
        setPeriod={setPeriod}
        customRange={customRange}
        setCustomRange={setCustomRange}
      />
    </div>
  );
}
