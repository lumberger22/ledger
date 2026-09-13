// Small timezone-safe date helpers. Avoid `.toISOString()` (converts to UTC,
// can shift the date by a day) and `new Date("YYYY-MM-DD")` (parsed as UTC
// midnight, same problem) — these operate on local calendar dates only.

export function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatShortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
