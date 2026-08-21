import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const FALLBACK_COLORS = [
  "#2A6F6A",
  "#C7902E",
  "#B4483B",
  "#3F8C5F",
  "#6C5B7B",
  "#A8B0AA",
];

// Below this width the donut + right-side legend get too cramped to read,
// so the legend moves under the chart instead. Desktop layout/props are
// untouched above this breakpoint.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 640,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

export default function CategoryBreakdownChart({ data, currency = "USD" }) {
  const isMobile = useIsMobile();
  if (!data?.length) return null;

  const chartData = data.map((d, i) => ({
    name: d.name,
    value: d.amount,
    color: d.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 320 : 260}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={isMobile ? 52 : 62}
          outerRadius={isMobile ? 76 : 90}
          paddingAngle={2}
          strokeWidth={0}
        >
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) =>
            `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
          }
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #E4E3DC",
            fontSize: 13,
            fontFamily: "Inter",
          }}
        />
        <Legend
          verticalAlign={isMobile ? "bottom" : "middle"}
          align={isMobile ? "center" : "right"}
          layout={isMobile ? "horizontal" : "vertical"}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{
            fontSize: 12.5,
            fontFamily: "Inter",
            color: "#3C4440",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
