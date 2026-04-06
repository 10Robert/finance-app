import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { SpendingByCategory } from '../../types'

const COLORS = [
  '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#d946ef', '#a855f7', '#22c55e', '#e11d48',
]

interface Props {
  data: SpendingByCategory[]
}

export default function SpendingByCategoryChart({ data }: Props) {
  const chartData = data.map((d) => ({
    name: `${d.category_icon || ''} ${d.category_name}`.trim(),
    value: Number(d.total),
  }))

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          dataKey="value"
          paddingAngle={2}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => fmt(value)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
