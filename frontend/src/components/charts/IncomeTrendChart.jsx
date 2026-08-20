import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

function formatMonth(m) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, {
    month: "short",
  });
}

const money = (value) =>
  `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function IncomeTrendChart({ data }) {
  if (!data?.length) return null;
  const chartData = data.map((d) => ({ ...d, label: formatMonth(d.month) }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart
        data={chartData}
        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
      >
        <defs>
          <linearGradient id="incomeGross" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2A6F6A" stopOpacity={0.25} />
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
          formatter={(value, name) => [money(value), name]}
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #E4E3DC",
            fontSize: 13,
            fontFamily: "Inter",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Inter" }} />
        <Area
          type="monotone"
          dataKey="gross"
          name="Gross"
          stroke="#2A6F6A"
          strokeWidth={2}
          fill="url(#incomeGross)"
        />
        <Area
          type="monotone"
          dataKey="net"
          name="Net"
          stroke="#3D5A80"
          strokeWidth={2}
          fill="none"
        />
        <Area
          type="monotone"
          dataKey="taxes"
          name="Taxes"
          stroke="#B4483B"
          strokeWidth={2}
          fill="none"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
