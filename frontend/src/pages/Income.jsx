import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  DollarSign,
  Landmark,
  PiggyBank,
  ReceiptText,
  UploadCloud,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { getIncome } from "../api/income";
import PeriodFilter from "../components/PeriodFilter";
import CategoryBreakdownChart from "../components/charts/CategoryBreakdownChart";
import IncomeTrendChart from "../components/charts/IncomeTrendChart";
import PaystubUploadModal from "../components/PaystubUploadModal";
import PaystubReviewModal from "../components/PaystubReviewModal";
import EmptyState from "../components/EmptyState";

const PERIODS = [
  { value: "this_month", label: "This Month" },
  { value: "30d", label: "30 Days" },
  { value: "ytd", label: "YTD" },
  { value: "3month_avg", label: "3-Month" },
];

const currency = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function MetricCard({ label, value, sublabel, icon: Icon }) {
  return (
    <div className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-2">
            {label}
          </p>
          <p className="font-display font-bold text-2xl text-ink-900 tabular">
            {currency(value)}
          </p>
          {sublabel && <p className="text-xs text-ink-500 mt-1">{sublabel}</p>}
        </div>
        {Icon && <Icon size={17} className="text-ink-300" />}
      </div>
    </div>
  );
}

function RateCard({ label, value, detail }) {
  return (
    <div className="border border-line rounded-lg p-4">
      <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="font-display font-bold text-2xl text-ink-900 tabular mt-1">
        {value.toFixed(2)}%
      </p>
      <p className="text-xs text-ink-500 mt-1">{detail}</p>
    </div>
  );
}

function PaystubRow({ stub, expanded, onToggle }) {
  const sectionTotals = useMemo(() => {
    const totals = {};
    stub.line_items.forEach((item) => {
      totals[item.section] = (totals[item.section] || 0) + item.amount;
    });
    return totals;
  }, [stub.line_items]);

  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 sm:px-4 py-3 flex items-center justify-between gap-2 hover:bg-black/[0.015]"
      >
        <div className="text-left min-w-0">
          <p className="text-sm font-semibold text-ink-900 truncate">
            {stub.pay_period_start} → {stub.pay_period_end}
          </p>
          <p className="text-xs text-ink-500 mt-0.5">
            Check date {stub.check_date}
          </p>
        </div>
        <div className="flex items-center gap-3 sm:gap-5 text-right shrink-0">
          <div className="hidden sm:block">
            <p className="text-xs text-ink-500">Gross</p>
            <p className="text-sm tabular font-medium">
              {currency(stub.gross_pay)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-500">Net</p>
            <p className="text-sm tabular font-semibold text-ink-900">
              {currency(stub.net_pay)}
            </p>
          </div>
          <ArrowRight
            size={15}
            className={`text-ink-300 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </div>
      </button>
      {expanded && (
        <div className="border-t border-line px-4 py-4 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ["Taxes", stub.taxes_total],
              ["Pre-tax", stub.pretax_total],
              ["Post-tax", stub.posttax_total],
              ["Employer Benefits", stub.employer_benefits_total],
              ["Take-home", stub.net_pay],
            ].map(([label, value]) => (
              <div key={label} className="bg-black/[0.02] rounded-lg p-3">
                <p className="text-xs text-ink-500">{label}</p>
                <p className="text-sm font-semibold tabular text-ink-900 mt-0.5">
                  {currency(value)}
                </p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">
              Itemized Lines
            </p>
            <div className="divide-y divide-line border border-line rounded-lg overflow-hidden">
              {stub.line_items.map((item) => (
                <div
                  key={`${item.section}-${item.label}`}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span className="text-sm text-ink-700">{item.label}</span>
                  <span className="text-sm font-medium tabular text-ink-900">
                    {currency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">
              Payment Destinations
            </p>
            <div className="space-y-2">
              {stub.payments.map((payment) => (
                <div
                  key={`${payment.bank}-${payment.account_label}-${payment.account_last4}`}
                  className="flex items-center justify-between border border-line rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {payment.bank} — {payment.account_label}
                    </p>
                    <p className="text-xs text-ink-500">
                      ••••{payment.account_last4}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular">
                    {currency(payment.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Income() {
  const [period, setPeriod] = useState("this_month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewPaystubs, setReviewPaystubs] = useState(null);
  const [expandedStub, setExpandedStub] = useState(null);

  function load() {
    setLoading(true);
    return getIncome(period)
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [period]);

  const summary = data?.summary;
  const hasData = Boolean(data?.paystub_count);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-xl sm:text-2xl text-ink-900">
            Income
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            See how every paycheck is earned, withheld, saved, and distributed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} options={PERIODS} />
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-white text-sm font-semibold px-3.5 py-2 rounded-lg shadow-card"
          >
            <UploadCloud size={15} /> Upload Payslip
          </button>
        </div>
      </div>

      {loading && !data ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : !hasData ? (
        <div className="bg-surface border border-line rounded-xl2 shadow-card">
          <EmptyState
            icon={DollarSign}
            title="No payslips yet"
            message="Upload a payslip to start tracking gross income, taxes, retirement, savings, and payment destinations."
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
            <MetricCard
              label="Gross Pay"
              value={summary.gross}
              sublabel={`${data.paystub_count} paystub${data.paystub_count === 1 ? "" : "s"}`}
              icon={DollarSign}
            />
            <MetricCard
              label="Take-Home"
              value={summary.net}
              sublabel={`${((summary.net / summary.gross) * 100 || 0).toFixed(1)}% of gross`}
              icon={Wallet}
            />
            <MetricCard
              label="Taxes"
              value={summary.taxes}
              sublabel={`${summary.effective_tax_rate.toFixed(2)}% effective rate`}
              icon={ReceiptText}
            />
            <MetricCard
              label="Pre-tax"
              value={summary.pretax}
              sublabel={`${((summary.pretax / summary.gross) * 100 || 0).toFixed(2)}% of gross`}
              icon={PiggyBank}
            />
            <MetricCard
              label="Post-tax"
              value={summary.posttax}
              sublabel={`${((summary.posttax / summary.gross) * 100 || 0).toFixed(2)}% of gross`}
              icon={Landmark}
            />
          </div>

          <div className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-6">
            <div className="mb-4">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">
                Savings & Retirement Rates
              </p>
              <p className="text-sm text-ink-500 mt-1">
                Personal and employer retirement are shown separately so the
                total rate ties back to your budget model.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <RateCard
                label="Personal Retirement"
                value={summary.retirement_personal_percent_of_gross}
                detail={`${currency(summary.personal_retirement)} personal contributions`}
              />
              <RateCard
                label="Employer Retirement"
                value={
                  summary.gross
                    ? (summary.employer_retirement / summary.gross) * 100
                    : 0
                }
                detail={`${currency(summary.employer_retirement)} employer contributions`}
              />
              <RateCard
                label="Total Retirement"
                value={summary.retirement_percent_of_gross}
                detail={`${currency(summary.total_retirement)} personal + employer`}
              />
              <RateCard
                label="Take-home → Savings"
                value={summary.take_home_savings_percent}
                detail={`${currency(summary.take_home_savings)} routed to savings destinations`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2 bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">
                    Where Gross Pay Goes
                  </p>
                  <p className="text-sm text-ink-500 mt-1">
                    Every dollar of gross is allocated to taxes, deductions, or
                    take-home.
                  </p>
                </div>
              </div>
              <CategoryBreakdownChart data={summary.flow_breakdown} />
            </div>

            <div className="lg:col-span-3 bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-6">
              <div className="mb-2">
                <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">
                  Monthly Income Trend
                </p>
                <p className="text-sm text-ink-500 mt-1">
                  Gross, net, and taxes across the latest recorded paychecks.
                </p>
              </div>
              <IncomeTrendChart data={data.trend} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-6">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-3">
                Payment Destinations
              </p>
              <div className="space-y-2.5">
                {summary.payment_destinations.map((destination) => (
                  <div
                    key={destination.name}
                    className="flex items-center justify-between border-b border-line last:border-0 pb-2.5 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink-900">
                        {destination.name}
                      </p>
                      <p className="text-xs text-ink-500">
                        {destination.percent.toFixed(1)}% of net pay
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular text-ink-900">
                      {currency(destination.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-6">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-3">
                Detailed Deductions & Benefits
              </p>
              <div className="space-y-2.5">
                {summary.line_item_breakdown.map((item) => (
                  <div
                    key={item.category_id}
                    className="flex items-center justify-between border-b border-line last:border-0 pb-2.5 last:pb-0"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm text-ink-700">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium tabular text-ink-900">
                      {currency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                to="/analysis"
                className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-dark mt-4"
              >
                Compare against spending <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">
                  Paystub History
                </p>
                <p className="text-sm text-ink-500 mt-1">
                  Expand a paycheck for the complete stored itemization.
                </p>
              </div>
              <button
                onClick={() => setUploadOpen(true)}
                className="text-sm font-semibold text-accent hover:text-accent-dark"
              >
                Add another
              </button>
            </div>
            <div className="space-y-2">
              {data.paystubs.map((stub) => (
                <PaystubRow
                  key={stub.id}
                  stub={stub}
                  expanded={expandedStub === stub.id}
                  onToggle={() =>
                    setExpandedStub(expandedStub === stub.id ? null : stub.id)
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}

      <PaystubUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onParsed={(paystubs) => setReviewPaystubs(paystubs)}
      />
      <PaystubReviewModal
        isOpen={Boolean(reviewPaystubs)}
        paystubs={reviewPaystubs || []}
        onClose={() => setReviewPaystubs(null)}
        onSaved={async () => {
          setReviewPaystubs(null);
          await load();
        }}
      />
    </div>
  );
}
