import { memo, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { MonthlyTrend } from '../../types'

interface Props {
  data: MonthlyTrend[]
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function IncomeVsExpenseChart({ data }: Props) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        month: d.month,
        Receita: Number(d.income),
        Despesa: Number(d.expenses),
        Saldo: Number(d.net),
      })),
    [data],
  )

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(value: number) => fmt(value)} />
        <Area type="monotone" dataKey="Receita" stroke="#10b981" fill="#10b98130" strokeWidth={2} />
        <Area type="monotone" dataKey="Despesa" stroke="#ef4444" fill="#ef444430" strokeWidth={2} />
        <Area type="monotone" dataKey="Saldo" stroke="#3b82f6" fill="#3b82f630" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default memo(IncomeVsExpenseChart)
