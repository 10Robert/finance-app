import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getMonthlyTrends,
  getSpendingByCategory,
  getBalance,
} from '../api/client'
import MonthlyTrendsChart from '../components/charts/MonthlyTrends'
import IncomeVsExpenseChart from '../components/charts/IncomeVsExpense'
import SpendingByCategoryChart from '../components/charts/SpendingByCategory'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtShort = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const RANGE_OPTIONS = [
  { label: '6 meses', months: 6 },
  { label: '12 meses', months: 12 },
]

const PALETTE = [
  '#a78bfa', '#34d399', '#3b82f6', '#fbbf24',
  '#f87171', '#e879f9', '#67e8f9', '#f97316',
]

function KpiCard({
  label, value, icon, tone = 'neutral', hint,
}: {
  label: string
  value: string
  icon: string
  tone?: 'neutral' | 'positive' | 'negative'
  hint?: string
}) {
  const toneCls =
    tone === 'positive' ? 'text-tertiary' : tone === 'negative' ? 'text-error' : 'text-on-surface'
  const iconWrap =
    tone === 'positive'
      ? 'bg-tertiary/10 text-tertiary'
      : tone === 'negative'
        ? 'bg-error/10 text-error'
        : 'bg-primary/10 text-primary'
  return (
    <div className="bg-surface-container border border-outline-variant rounded-xl p-5">
      <div className="flex justify-between items-start mb-3">
        <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">{label}</p>
        <div className={`p-1.5 rounded-lg ${iconWrap}`}>
          <span className="material-symbols-outlined text-base">{icon}</span>
        </div>
      </div>
      <p className={`text-2xl font-black tracking-tight ${toneCls}`}>{value}</p>
      {hint && <p className="text-xs text-on-surface-variant mt-1">{hint}</p>}
    </div>
  )
}

export default function ReportsPage() {
  const now = new Date()
  const [months, setMonths] = useState(6)

  const { data: trends } = useQuery({
    queryKey: ['monthly-trends', months],
    queryFn: () => getMonthlyTrends(months),
  })

  const { data: byCategory } = useQuery({
    queryKey: ['reports-spending-by-category'],
    queryFn: () => getSpendingByCategory(),
  })

  const { data: balanceYear } = useQuery({
    queryKey: ['balance', { year: now.getFullYear() }],
    queryFn: () => getBalance({ year: now.getFullYear() }),
  })

  const totals = useMemo(() => {
    const list = trends ?? []
    const income = list.reduce((s, t) => s + Number(t.income), 0)
    const expenses = list.reduce((s, t) => s + Number(t.expenses), 0)
    return { income, expenses, net: income - expenses }
  }, [trends])

  const avgExpense = trends && trends.length > 0 ? totals.expenses / trends.length : 0

  const ranked = useMemo(() => {
    const list = [...(byCategory ?? [])].sort((a, b) => Number(b.total) - Number(a.total))
    const max = list.length > 0 ? Number(list[0].total) : 1
    return list.slice(0, 8).map((c, i) => ({
      ...c,
      pct: max > 0 ? (Number(c.total) / max) * 100 : 0,
      color: PALETTE[i % PALETTE.length],
    }))
  }, [byCategory])

  const topCategory = ranked[0]

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Relatórios</h2>
          <p className="text-sm text-on-surface-variant">
            Análise financeira consolidada dos últimos {months} meses.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-surface-container border border-outline-variant p-1 rounded-lg">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.months}
              onClick={() => setMonths(opt.months)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                months === opt.months
                  ? 'bg-secondary-container text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard
          label="Receitas no período"
          value={fmt(totals.income)}
          icon="arrow_upward"
          tone="positive"
        />
        <KpiCard
          label="Despesas no período"
          value={fmt(totals.expenses)}
          icon="arrow_downward"
          tone="negative"
          hint={`Média de ${fmtShort(avgExpense)}/mês`}
        />
        <KpiCard
          label="Resultado no período"
          value={`${totals.net >= 0 ? '+ ' : '- '}${fmt(Math.abs(totals.net))}`}
          icon={totals.net >= 0 ? 'check_circle' : 'warning'}
          tone={totals.net >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="Saldo acumulado"
          value={fmt(Number(balanceYear?.balance ?? 0))}
          icon="account_balance"
          hint={topCategory ? `Maior gasto: ${topCategory.category_name}` : undefined}
        />
      </section>

      {/* Trends */}
      <section className="bg-surface-container border border-outline-variant rounded-xl p-6">
        <div className="mb-6">
          <h3 className="font-bold text-lg tracking-tight">Receitas vs. Despesas</h3>
          <p className="text-on-surface-variant text-xs">Comparativo mensal do período selecionado</p>
        </div>
        {trends && trends.length > 0 ? (
          <MonthlyTrendsChart data={trends} />
        ) : (
          <div className="h-[300px] flex items-center justify-center text-on-surface-variant text-sm">
            Sem dados no período
          </div>
        )}
      </section>

      {/* Net flow + Category pie */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-container border border-outline-variant rounded-xl p-6">
          <div className="mb-6">
            <h3 className="font-bold text-lg tracking-tight">Evolução do Saldo</h3>
            <p className="text-on-surface-variant text-xs">Receita, despesa e saldo líquido por mês</p>
          </div>
          {trends && trends.length > 0 ? (
            <IncomeVsExpenseChart data={trends} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-on-surface-variant text-sm">
              Sem dados no período
            </div>
          )}
        </div>

        <div className="bg-surface-container border border-outline-variant rounded-xl p-6">
          <div className="mb-6">
            <h3 className="font-bold text-lg tracking-tight">Despesas por Categoria</h3>
            <p className="text-on-surface-variant text-xs">Distribuição do período atual</p>
          </div>
          {byCategory && byCategory.length > 0 ? (
            <SpendingByCategoryChart data={byCategory} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-on-surface-variant text-sm">
              Sem despesas no período
            </div>
          )}
        </div>
      </section>

      {/* Category ranking */}
      <section className="bg-surface-container border border-outline-variant rounded-xl p-6">
        <div className="mb-6">
          <h3 className="font-bold text-lg tracking-tight">Ranking de Categorias</h3>
          <p className="text-on-surface-variant text-xs">Maiores gastos por categoria</p>
        </div>
        {ranked.length > 0 ? (
          <div className="space-y-4">
            {ranked.map((cat) => (
              <div key={cat.category_name} className="space-y-1.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-on-surface">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.category_name}
                  </span>
                  <span className="font-bold tabular-nums">{fmt(Number(cat.total))}</span>
                </div>
                <div className="h-2 bg-secondary-container rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(cat.pct, 2)}%`, backgroundColor: cat.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant text-center py-8">Sem dados de categorias</p>
        )}
      </section>
    </div>
  )
}
