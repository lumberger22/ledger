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
  const [pickerPosition, setPickerPosition] = useState(null);

  function togglePicker(event) {
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const pickerWidth = Math.min(288, Math.max(0, window.innerWidth - 32));
    const pickerHeight = 300;
    const left = Math.min(
      Math.max(16, rect.left),
      Math.max(16, window.innerWidth - pickerWidth - 16),
    );
    const below = rect.bottom + 8;
    const top =
      below + pickerHeight <= window.innerHeight - 16
        ? below
        : Math.max(16, rect.top - pickerHeight - 8);

    setPickerPosition({ left, top });
    setPickerOpen(true);
  }

  return (
    <div className="relative inline-flex max-w-full">
      <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-line/80 bg-canvas p-1">
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
              onClick={(event) => {
                if (isCustom) {
                  togglePicker(event);
                  return;
                }
                setPickerOpen(false);
                onChange(opt.value);
              }}
              className={`min-h-11 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
                isActive
                  ? "bg-surface text-ink-900 shadow-sm ring-1 ring-black/[0.04]"
                  : "text-ink-500 hover:bg-surface/70 hover:text-ink-900"
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
          position={pickerPosition}
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
