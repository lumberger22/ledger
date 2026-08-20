import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  X,
  AlertTriangle,
} from "lucide-react";
import { confirmPaystubs } from "../api/income";

const currency = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const SECTION_LABELS = {
  earning: "Earnings",
  tax: "Taxes",
  pretax_deduction: "Pre-tax Deductions",
  posttax_deduction: "Post-tax Deductions",
  employer_benefit: "Employer Paid Benefits",
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function NumberInput({ value, onChange, className = "" }) {
  return (
    <input
      type="number"
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-sm rounded-md border border-line px-2 py-1.5 text-right tabular ${className}`}
    />
  );
}

export default function PaystubReviewModal({
  isOpen,
  paystubs,
  onClose,
  onSaved,
}) {
  const [drafts, setDrafts] = useState(() => clone(paystubs || []));
  const [expanded, setExpanded] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setDrafts(clone(paystubs || []));
      setExpanded(0);
      setError(null);
    }
  }, [isOpen, paystubs]);

  if (!isOpen) return null;

  function updatePaystub(index, field, value) {
    setDrafts((prev) =>
      prev.map((stub, i) => (i === index ? { ...stub, [field]: value } : stub)),
    );
  }

  function updateLine(index, lineIndex, field, value) {
    setDrafts((prev) =>
      prev.map((stub, i) => {
        if (i !== index) return stub;
        const line_items = stub.line_items.map((item, j) =>
          j === lineIndex
            ? { ...item, [field]: field === "amount" ? Number(value) : value }
            : item,
        );
        return { ...stub, line_items };
      }),
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = drafts.map((stub) => ({
        ...stub,
        gross_pay: Number(stub.gross_pay),
        net_pay: Number(stub.net_pay),
        pretax_total: Number(stub.pretax_total),
        posttax_total: Number(stub.posttax_total),
        taxes_total: Number(stub.taxes_total),
        employer_benefits_total: Number(stub.employer_benefits_total),
        line_items: stub.line_items.map((item) => ({
          ...item,
          amount: Number(item.amount),
        })),
        payments: stub.payments.map((payment) => ({
          ...payment,
          amount: Number(payment.amount),
        })),
      }));
      await confirmPaystubs(payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-5">
      <div className="bg-surface rounded-xl2 shadow-cardHover w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="font-display font-bold text-lg text-ink-900">
              Review Payslip
            </h2>
            <p className="text-sm text-ink-500 mt-0.5">
              Verify the extracted values before anything is saved.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-ink-500 hover:bg-black/5"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-3">
          {drafts.map((stub, index) => {
            const isOpenStub = expanded === index;
            const sectionGroups = {};
            stub.line_items.forEach((item, lineIndex) => {
              (sectionGroups[item.section] ||= []).push({ item, lineIndex });
            });

            return (
              <div
                key={`${stub.pay_period_start}-${index}`}
                className="border border-line rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(isOpenStub ? null : index)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-black/[0.015]"
                >
                  <div className="flex items-center gap-3 text-left">
                    {isOpenStub ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        {stub.pay_period_start} → {stub.pay_period_end}
                      </p>
                      <p className="text-xs text-ink-500">
                        Check date {stub.check_date}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular text-ink-900">
                      {currency(stub.net_pay)}
                    </p>
                    <p className="text-xs text-ink-500">net pay</p>
                  </div>
                </button>

                {isOpenStub && (
                  <div className="border-t border-line px-4 py-4 space-y-5">
                    {stub.warnings?.length > 0 && (
                      <div className="flex items-start gap-2 text-xs text-warn bg-warn/10 border border-warn/20 rounded-lg px-3 py-2">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <div>{stub.warnings.join(" ")}</div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        ["Gross Pay", "gross_pay"],
                        ["Net Pay", "net_pay"],
                        ["Pre-tax", "pretax_total"],
                        ["Taxes", "taxes_total"],
                        ["Post-tax", "posttax_total"],
                        ["Employer Benefits", "employer_benefits_total"],
                      ].map(([label, field]) => (
                        <label key={field} className="space-y-1">
                          <span className="text-xs font-medium text-ink-500">
                            {label}
                          </span>
                          <NumberInput
                            value={stub[field]}
                            onChange={(value) =>
                              updatePaystub(index, field, value)
                            }
                            className="w-full"
                          />
                        </label>
                      ))}
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">
                        Dates
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[
                          ["Period Start", "pay_period_start"],
                          ["Period End", "pay_period_end"],
                          ["Check Date", "check_date"],
                        ].map(([label, field]) => (
                          <label key={field} className="space-y-1">
                            <span className="text-xs font-medium text-ink-500">
                              {label}
                            </span>
                            <input
                              type="date"
                              value={stub[field]}
                              onChange={(e) =>
                                updatePaystub(index, field, e.target.value)
                              }
                              className="w-full text-sm rounded-md border border-line px-2 py-1.5"
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">
                        Itemized Breakdown
                      </p>
                      <div className="space-y-4">
                        {Object.entries(sectionGroups).map(
                          ([section, items]) => (
                            <div
                              key={section}
                              className="border border-line rounded-lg overflow-hidden"
                            >
                              <div className="px-3 py-2 bg-black/[0.02] text-xs font-semibold text-ink-700">
                                {SECTION_LABELS[section] || section}
                              </div>
                              <div className="divide-y divide-line">
                                {items.map(({ item, lineIndex }) => (
                                  <div
                                    key={lineIndex}
                                    className="grid grid-cols-[1fr_130px] gap-3 px-3 py-2"
                                  >
                                    <input
                                      value={item.label}
                                      onChange={(e) =>
                                        updateLine(
                                          index,
                                          lineIndex,
                                          "label",
                                          e.target.value,
                                        )
                                      }
                                      className="text-sm rounded-md border border-line px-2 py-1.5"
                                    />
                                    <NumberInput
                                      value={item.amount}
                                      onChange={(value) =>
                                        updateLine(
                                          index,
                                          lineIndex,
                                          "amount",
                                          value,
                                        )
                                      }
                                      className="w-full"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">
                        Payment Destinations
                      </p>
                      <div className="space-y-2">
                        {stub.payments.map((payment, paymentIndex) => (
                          <div
                            key={paymentIndex}
                            className="grid grid-cols-1 md:grid-cols-[1fr_1fr_90px_130px] gap-2"
                          >
                            <input
                              value={payment.bank}
                              onChange={(e) => {
                                const next = clone(drafts);
                                next[index].payments[paymentIndex].bank =
                                  e.target.value;
                                setDrafts(next);
                              }}
                              className="text-sm rounded-md border border-line px-2 py-1.5"
                            />
                            <input
                              value={payment.account_label}
                              onChange={(e) => {
                                const next = clone(drafts);
                                next[index].payments[
                                  paymentIndex
                                ].account_label = e.target.value;
                                setDrafts(next);
                              }}
                              className="text-sm rounded-md border border-line px-2 py-1.5"
                            />
                            <input
                              value={payment.account_last4 || ""}
                              onChange={(e) => {
                                const next = clone(drafts);
                                next[index].payments[
                                  paymentIndex
                                ].account_last4 = e.target.value;
                                setDrafts(next);
                              }}
                              className="text-sm rounded-md border border-line px-2 py-1.5 tabular"
                            />
                            <NumberInput
                              value={payment.amount}
                              onChange={(value) => {
                                const next = clone(drafts);
                                next[index].payments[paymentIndex].amount =
                                  Number(value);
                                setDrafts(next);
                              }}
                              className="w-full"
                            />
                          </div>
                        ))}
                        {!stub.payments.length && (
                          <p className="text-sm text-ink-500">
                            No destinations detected.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mx-6 mb-3 text-sm text-over bg-over/10 border border-over/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-line shrink-0">
          <p className="text-xs text-ink-500">
            {drafts.length} paystub{drafts.length === 1 ? "" : "s"} ready to
            save
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-sm font-medium text-ink-500 px-3.5 py-2 rounded-lg hover:bg-black/5"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || drafts.length === 0}
              className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              <Check size={15} />
              {saving ? "Saving…" : "Confirm & Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
