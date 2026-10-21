export default function CategoryBadge({ name, color, muted = false }) {
  if (!name) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink-300 bg-canvas px-2.5 py-1 text-xs font-semibold text-ink-500">
        Uncategorized
      </span>
    );
  }
  const badgeColor = color || "#64748b";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        backgroundColor: muted ? "transparent" : `${badgeColor}1A`,
        color: badgeColor,
        border: muted ? `1px solid ${badgeColor}` : "none",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: badgeColor }}
      />
      {name}
    </span>
  );
}
