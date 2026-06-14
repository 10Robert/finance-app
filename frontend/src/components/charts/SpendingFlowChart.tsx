import { memo, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { SpendingFlowPoint } from '../../types'

interface Props {
  data: SpendingFlowPoint[]
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function SpendingFlowChart({ data }: Props) {
  const chartData = useMemo(
    () => data.map((d) => ({ label: d.label, amount: Number(d.amount) })),
    [data],
  )

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-outline-variant)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--color-secondary)', fontSize: 10 }}
          axisLine={{ stroke: 'var(--color-outline-variant)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'var(--color-secondary)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-surface-container)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '8px',
            color: 'var(--color-on-surface)',
            fontSize: 12,
          }}
          formatter={(value) => [fmt(Number(value)), 'Gastos']}
          labelStyle={{ color: 'var(--color-on-surface-variant)' }}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#spendGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default memo(SpendingFlowChart)
