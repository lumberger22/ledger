import { useState } from "react";
import DateRangePicker from "./DateRangePicker";
import { formatShortDate } from "../utils/date";

const OPTIONS = [
  { value: "this_month", label: "This Month" },
  { value: "30d", label: "30 Days" },
  { value: "ytd", label: "YTD" },
];

/**
 * Pill-row period selector. Supports a "custom" option (value: "custom")
 * that, instead of firing onChange immediately, opens a calendar popover —
 * onChange("custom") fires only once the user applies a start/end range via
 * onCustomRange.
 */
export default function PeriodFilter({
  value,
  onChange,
  options = OPTIONS,
  customRange = null,
  onCustomRange,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <div className="inline-flex items-center bg-black/[0.04] rounded-lg p-1 gap-0.5 overflow-x-auto max-w-full">
        {options.map((opt) => {
          const isCustom = opt.value === "custom";
          const isActive = value === opt.value;
          const label =
            isCustom && isActive && customRange?.start && customRange?.end
              ? `${formatShortDate(customRange.start)} – ${formatShortDate(customRange.end)}`
              : opt.label;
          return (
            <button
              key={opt.value}
              onClick={() => {
                if (isCustom) {
                  setPickerOpen((v) => !v);
                  return;
                }
                setPickerOpen(false);
                onChange(opt.value);
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-white text-ink-900 shadow-sm"
                  : "text-ink-500 hover:text-ink-900"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {pickerOpen && (
        <DateRangePicker
          initialStart={customRange?.start}
          initialEnd={customRange?.end}
          onApply={(start, end) => {
            setPickerOpen(false);
            onCustomRange?.(start, end);
            onChange("custom");
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
