export default function CategoryBadge({ name, color, muted = false }) {
  if (!name) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-ink-500 bg-black/5 border border-dashed border-ink-300">
        Uncategorized
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: muted ? 'transparent' : `${color}1A`,
        color: color || '#6B756F',
        border: muted ? `1px solid ${color || '#A8B0AA'}` : 'none',
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color || '#A8B0AA' }} />
      {name}
    </span>
  )
}
