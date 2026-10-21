export default function PageLoading({
  label = "Loading page",
  compact = false,
}) {
  if (compact) {
    return (
      <div
        role="status"
        aria-label={label}
        className="space-y-3 p-2 animate-pulse"
      >
        <span className="sr-only">{label}</span>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex h-[104px] items-center justify-between rounded-2xl border border-line bg-surface p-4 shadow-card"
          >
            <div className="w-2/3 space-y-3">
              <div className="h-4 w-3/4 rounded bg-ink-300/25" />
              <div className="h-3 w-1/2 rounded bg-ink-300/25" />
            </div>
            <div className="h-5 w-20 rounded bg-ink-300/25" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div role="status" aria-label={label} className="space-y-4 animate-pulse">
      <span className="sr-only">{label}</span>
      <div className="h-3 w-24 rounded bg-ink-300/25" />
      <div className="h-8 w-48 max-w-[70%] rounded-lg bg-ink-300/25" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-40 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="h-3 w-28 rounded bg-ink-300/25" />
          <div className="mt-5 h-8 w-36 rounded bg-ink-300/25" />
          <div className="mt-5 h-2 rounded-full bg-ink-300/25" />
          <div className="mt-4 h-3 w-24 rounded bg-ink-300/25" />
        </div>
        <div className="h-40 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="h-3 w-28 rounded bg-ink-300/25" />
          <div className="mt-5 space-y-3">
            <div className="h-3 rounded bg-ink-300/25" />
            <div className="h-3 w-4/5 rounded bg-ink-300/25" />
            <div className="h-3 w-3/5 rounded bg-ink-300/25" />
          </div>
        </div>
      </div>
    </div>
  );
}
