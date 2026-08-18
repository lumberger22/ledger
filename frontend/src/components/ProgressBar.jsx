const statusColor = {
  on_track: "#3F8C5F",
  behind: "#C7902E",
  over: "#B4483B",
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
