// CSS variable references (not hex literals) so the status color tracks
// light/dark automatically — this is set as an inline style below (recharts
// aside, this is a plain div), and `var()` inside an inline style resolves
// against the current cascade just like it would in a stylesheet, class
// toggle included.
const statusColor = {
  on_track: "rgb(var(--color-good))",
  behind: "rgb(var(--color-warn))",
  over: "rgb(var(--color-over))",
};

export default function ProgressBar({
  percent = 0,
  status = "on_track",
  color,
  height = 8,
}) {
  const clamped = Math.min(percent, 100);
  const barColor =
    status === "on_track" && color
      ? color
      : statusColor[status] || statusColor.on_track;

  return (
    <div
      className="w-full rounded-full bg-black/[0.06] overflow-hidden"
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: barColor }}
      />
    </div>
  );
}
