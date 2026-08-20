import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function formatDate(d) {
  const date = new Date(`${d}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTick(v) {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? "-" : ""}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `$${v}`;
}

// Generic "value over time" area chart, fed by the daily balance-snapshot
// history endpoints (/api/networth/history, /api/investments/history) —
// those only accumulate data from whenever an account was first
// connected/synced, so a freshly-connected account shows a single point
// until more days of syncing build up a real trend.
export default function ValueTrendChart({ data, dataKey = "value", color = "#2A6F6A", label = "Value" }) {
  if (!data?.length) return null;
  const chartData = data.map((d) => ({ ...d, label: formatDate(d.date) }));
  const gradientId = `valueTrendFill-${dataKey}`;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#E4E3DC" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "#6B756F", fontFamily: "Inter" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#6B756F", fontFamily: "Inter" }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={formatTick}
        />
        <Tooltip
          formatter={(value) => [
            `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            label,
          ]}
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #E4E3DC",
            fontSize: 13,
            fontFamily: "Inter",
          }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
