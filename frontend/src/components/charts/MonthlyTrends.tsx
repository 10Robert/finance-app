import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import type { MonthlyTrend } from '../../types'

interface Props {
  data: MonthlyTrend[]
}

export default function MonthlyTrendsChart({ data }: Props) {
  const chartData = data.map((d) => ({
    month: d.month,
    Receita: Number(d.income),
    Despesa: Number(d.expenses),
  }))

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(value: number) => fmt(value)} />
        <Legend />
        <Bar dataKey="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
