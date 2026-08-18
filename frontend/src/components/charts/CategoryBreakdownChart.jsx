import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const FALLBACK_COLORS = ['#2A6F6A', '#C7902E', '#B4483B', '#3F8C5F', '#6C5B7B', '#A8B0AA']

export default function CategoryBreakdownChart({ data, currency = 'USD' }) {
  if (!data?.length) return null

  const chartData = data.map((d, i) => ({
    name: d.name,
    value: d.amount,
    color: d.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={62}
          outerRadius={90}
          paddingAngle={2}
          strokeWidth={0}
        >
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          contentStyle={{ borderRadius: 10, border: '1px solid #E4E3DC', fontSize: 13, fontFamily: 'Inter' }}
        />
        <Legend
          verticalAlign="middle"
          align="right"
          layout="vertical"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12.5, fontFamily: 'Inter', color: '#3C4440' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
