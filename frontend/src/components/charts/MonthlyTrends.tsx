import { memo, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import type { MonthlyTrend } from '../../types'

interface Props {
  data: MonthlyTrend[]
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function MonthlyTrendsChart({ data }: Props) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        month: d.month,
        Receita: Number(d.income),
        Despesa: Number(d.expenses),
      })),
    [data],
  )

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant)' }} />
        <YAxis tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant)' }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(value) => fmt(Number(value))}
          contentStyle={{
            background: 'var(--color-surface-container)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '8px',
            color: 'var(--color-on-surface)',
          }}
          labelStyle={{ color: 'var(--color-on-surface-variant)' }}
        />
        <Legend />
        <Bar dataKey="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default memo(MonthlyTrendsChart)
