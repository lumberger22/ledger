import { useState } from "react";
import { todayIso } from "../utils/date";

/**
 * Popover for picking an arbitrary start/end date range. Uses native
 * <input type="date"> — this gets a real calendar picker UI on both desktop
 * and mobile browsers for free, and avoids the timezone footguns of hand-
 * rolling a calendar grid (native date inputs hand back plain "YYYY-MM-DD"
 * strings, no Date object parsing involved).
 */
export default function DateRangePicker({
  initialStart,
  initialEnd,
  onApply,
  onCancel,
}) {
  const today = todayIso();
  const [start, setStart] = useState(initialStart || today);
  const [end, setEnd] = useState(initialEnd || today);
  const invalid = Boolean(start) && Boolean(end) && start > end;

  return (
    <div className="absolute z-20 top-full mt-2 right-0 bg-white rounded-xl shadow-lg border border-line p-4 w-72">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-500 font-medium">Start date</span>
          <input
            type="date"
            value={start}
            max={end || today}
            onChange={(e) => setStart(e.target.value)}
            className="text-sm rounded-md border border-line px-2 py-1.5 tabular"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-500 font-medium">End date</span>
          <input
            type="date"
            value={end}
            min={start}
            max={today}
            onChange={(e) => setEnd(e.target.value)}
            className="text-sm rounded-md border border-line px-2 py-1.5 tabular"
          />
        </label>
        {invalid && (
          <p className="text-xs text-over">
            Start date must be on or before the end date.
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-line">
          <button
            onClick={onCancel}
            className="text-sm font-medium text-ink-500 px-3 py-1.5 rounded-lg hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            disabled={invalid}
            onClick={() => onApply(start, end)}
            className="text-sm font-semibold text-white bg-accent hover:bg-accent-dark disabled:opacity-40 px-3.5 py-1.5 rounded-lg"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
