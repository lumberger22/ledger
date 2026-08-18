import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function formatMonth(m) {
  const [y, mo] = m.split("-");
  const date = new Date(Number(y), Number(mo) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short" });
}

export default function TrendChart({ data }) {
  if (!data?.length) return null;
  const chartData = data.map((d) => ({ ...d, label: formatMonth(d.month) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart
        data={chartData}
        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2A6F6A" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#2A6F6A" stopOpacity={0} />
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
          width={48}
        />
        <Tooltip
          formatter={(value) => [
            `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            "Spend",
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
          dataKey="total"
          stroke="#2A6F6A"
          strokeWidth={2}
          fill="url(#trendFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
