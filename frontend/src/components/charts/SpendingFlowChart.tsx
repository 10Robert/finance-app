import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { SpendingFlowPoint } from '../../types'

interface Props {
  data: SpendingFlowPoint[]
}

export default function SpendingFlowChart({ data }: Props) {
  const chartData = data.map((d) => ({
    label: d.label,
    amount: Number(d.amount),
  }))

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={{ stroke: '#27272a' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            background: '#121215',
            border: '1px solid #27272a',
            borderRadius: '8px',
            color: '#fafafa',
            fontSize: 12,
          }}
          formatter={(value: number) => [fmt(value), 'Gastos']}
          labelStyle={{ color: '#a1a1aa' }}
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
