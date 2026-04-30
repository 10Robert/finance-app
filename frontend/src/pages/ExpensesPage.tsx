import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getExpensesChart,
  getTransactionsGrouped,
  getTopCategoriesRange,
  getCategoryTransactions,
  createFixedExpense,
  getBalance,
} from '../api/client'
import type { Transaction, SpendingByCategory, FixedExpenseCreate } from '../types'

/* ─── helpers ─────────────────────────────────────────────────────────── */

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtShort = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })

const pad = (n: number) => String(n).padStart(2, '0')

type PeriodMode = 'annual' | 'monthly' | 'weekly'

const PIE_COLORS = [
  '#a78bfa', '#34d399', '#ef4444', '#f59e0b', '#3b82f6',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#71717a',
]

const LEGEND_ITEMS = [
  { color: '#34d399', label: 'Lucro Líquido' },
  { color: '#ef4444', label: 'Gastos Mensal' },
  { color: '#a78bfa', label: 'Acumulado' },
]

/* ─── week helpers ────────────────────────────────────────────────────── */

function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getMonday(d: Date) {
  const copy = new Date(d)
  const day = copy.getDay() || 7
  copy.setDate(copy.getDate() - day + 1)
  return copy
}

/* ─── main page ───────────────────────────────────────────────────────── */

export default function ExpensesPage() {
  const now = new Date()
  const [mode, setMode] = useState<PeriodMode>('annual')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [weekStart, setWeekStart] = useState<string>(() => isoDate(getMonday(now)))

  // Pop-ups
  const [showAllOneTime, setShowAllOneTime] = useState(false)
  const [showAllRecurring, setShowAllRecurring] = useState(false)
  const [drillCategory, setDrillCategory] = useState<string | null>(null)
  const [makeFixedTx, setMakeFixedTx] = useState<Transaction | null>(null)

  /* query params */
  const chartParams = useMemo(() => {
    if (mode === 'monthly') return { mode, year, month }
    if (mode === 'weekly') return { mode, week_start: weekStart }
    return { mode, year }
  }, [mode, year, month, weekStart])

  const dateRange = useMemo(() => {
    if (mode === 'monthly') {
      const lastDay = new Date(year, month, 0).getDate()
      return { start_date: `${year}-${pad(month)}-01`, end_date: `${year}-${pad(month)}-${pad(lastDay)}` }
    }
    if (mode === 'weekly') {
      const s = new Date(weekStart)
      const e = new Date(s)
      e.setDate(s.getDate() + 6)
      return { start_date: weekStart, end_date: isoDate(e) }
    }
    return { start_date: `${year}-01-01`, end_date: `${year}-12-31` }
  }, [mode, year, month, weekStart])

  /* data queries */
  const { data: chart } = useQuery({
    queryKey: ['expenses-chart', chartParams],
    queryFn: () => getExpensesChart(chartParams),
  })

  const { data: grouped } = useQuery({
    queryKey: ['transactions-grouped', dateRange],
    queryFn: () => getTransactionsGrouped(dateRange),
  })

  const { data: topCategories } = useQuery({
    queryKey: ['top-categories-range', dateRange],
    queryFn: () => getTopCategoriesRange({ ...dateRange, limit: 10 }),
  })

  const { data: balance } = useQuery({
    queryKey: ['balance', dateRange],
    queryFn: () => getBalance(dateRange),
  })

  /* derived */
  const oneTime = grouped?.one_time || []
  const recurring = grouped?.recurring || []
  const totalExpenses = Number(balance?.expense_total ?? 0)
  const totalIncome = Number(balance?.income_total ?? 0)
  const netResult = totalIncome - totalExpenses

  /* period navigation */
  const prevPeriod = () => {
    if (mode === 'annual') setYear((y) => y - 1)
    else if (mode === 'monthly') {
      if (month === 1) { setMonth(12); setYear((y) => y - 1) }
      else setMonth((m) => m - 1)
    } else {
      const s = new Date(weekStart)
      s.setDate(s.getDate() - 7)
      setWeekStart(isoDate(s))
    }
  }
  const nextPeriod = () => {
    if (mode === 'annual') setYear((y) => y + 1)
    else if (mode === 'monthly') {
      if (month === 12) { setMonth(1); setYear((y) => y + 1) }
      else setMonth((m) => m + 1)
    } else {
      const s = new Date(weekStart)
      s.setDate(s.getDate() + 7)
      setWeekStart(isoDate(s))
    }
  }

  const periodLabel = useMemo(() => {
    const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    if (mode === 'annual') return `Ano ${year}`
    if (mode === 'monthly') return `${MONTHS_PT[month - 1]} ${year}`
    const s = new Date(weekStart)
    const e = new Date(s)
    e.setDate(s.getDate() + 6)
    return `${fmtDate(isoDate(s))} — ${fmtDate(isoDate(e))}`
  }, [mode, year, month, weekStart])

  const chartTitle = useMemo(() => {
    if (mode === 'annual') return 'Fluxo Anual de Caixa'
    if (mode === 'monthly') return 'Fluxo Mensal de Caixa'
    return 'Fluxo Semanal de Caixa'
  }, [mode])

  /* ─── render ───────────────────────────────────────────────────────── */

  const tabClass = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      active
        ? 'bg-[#a78bfa]/15 text-[#a78bfa] border border-[#a78bfa]/30'
        : 'text-[#a1a1aa] border border-[#27272a] hover:text-[#fafafa] hover:bg-[#18181b]'
    }`

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-[#fafafa]">Análise de Gastos</h1>
          <p className="text-sm text-[#a1a1aa]">Visão geral do desempenho financeiro {periodLabel.toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period navigation */}
          <button onClick={prevPeriod} className="text-[#a1a1aa] hover:text-[#fafafa] transition-colors">
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <span className="text-sm font-bold text-[#fafafa] min-w-[140px] text-center">{periodLabel}</span>
          <button onClick={nextPeriod} className="text-[#a1a1aa] hover:text-[#fafafa] transition-colors">
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
          <div className="h-6 w-px bg-[#27272a] mx-1" />
          {/* Mode tabs */}
          <div className="flex gap-2">
            <button onClick={() => setMode('annual')} className={tabClass(mode === 'annual')}>Anual</button>
            <button onClick={() => setMode('monthly')} className={tabClass(mode === 'monthly')}>Mensal</button>
            <button onClick={() => setMode('weekly')} className={tabClass(mode === 'weekly')}>Semanal</button>
          </div>
        </div>
      </header>

      {/* ─── Summary Cards ──────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0c0c0f] border border-[#27272a] rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#ef4444]">trending_down</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Total de Gastos {mode === 'annual' ? 'no Ano' : mode === 'monthly' ? 'no Mês' : 'na Semana'}</p>
            <p className="text-xl font-black text-[#fafafa]">{fmt(totalExpenses)}</p>
          </div>
        </div>
        <div className="bg-[#0c0c0f] border border-[#27272a] rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#34d399]/10 border border-[#34d399]/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#34d399]">trending_up</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Total de Receitas {mode === 'annual' ? 'no Ano' : mode === 'monthly' ? 'no Mês' : 'na Semana'}</p>
            <p className="text-xl font-black text-[#fafafa]">{fmt(totalIncome)}</p>
          </div>
        </div>
        <div className={`bg-[#0c0c0f] border rounded-xl p-5 flex items-center gap-4 ${
          netResult >= 0 ? 'border-[#34d399]/30' : 'border-[#ef4444]/30'
        }`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            netResult >= 0
              ? 'bg-[#34d399]/10 border border-[#34d399]/20'
              : 'bg-[#ef4444]/10 border border-[#ef4444]/20'
          }`}>
            <span className={`material-symbols-outlined ${netResult >= 0 ? 'text-[#34d399]' : 'text-[#ef4444]'}`}>
              {netResult >= 0 ? 'savings' : 'warning'}
            </span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Resultado (Receitas − Gastos)</p>
            <p className={`text-xl font-black ${netResult >= 0 ? 'text-[#34d399]' : 'text-[#ef4444]'}`}>
              {fmt(netResult)}
            </p>
          </div>
        </div>
      </section>

      {/* ─── Gastos Avulsos & Fixos ─────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Avulsos */}
        <div className="bg-[#0c0c0f] border border-[#27272a] rounded-xl">
          <div className="px-5 py-4 border-b border-[#27272a] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#a78bfa]">shopping_cart</span>
              <h3 className="font-bold text-[#fafafa]">Gastos Avulsos</h3>
              <span className="text-xs text-[#a1a1aa]">— {fmt(oneTime.reduce((s, t) => s + Math.abs(Number(t.amount)), 0))}</span>
            </div>
          </div>
          <div className="divide-y divide-[#27272a]/50">
            {oneTime.length > 0 ? (
              oneTime.slice(0, 4).map((t) => (
                <ExpenseRow key={t.id} tx={t} onMakeFixed={() => setMakeFixedTx(t)} />
              ))
            ) : (
              <p className="p-6 text-center text-sm text-[#a1a1aa]">Nenhum gasto avulso no período</p>
            )}
          </div>
          {oneTime.length > 4 && (
            <button
              onClick={() => setShowAllOneTime(true)}
              className="w-full py-3 text-sm font-medium text-[#a78bfa] hover:bg-[#18181b] transition-colors border-t border-[#27272a]"
            >
              Ver todos os avulsos ({oneTime.length})
            </button>
          )}
        </div>

        {/* Fixos */}
        <div className="bg-[#0c0c0f] border border-[#27272a] rounded-xl">
          <div className="px-5 py-4 border-b border-[#27272a] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#a78bfa]">credit_card</span>
              <h3 className="font-bold text-[#fafafa]">Gastos Fixos / Cartão</h3>
              <span className="text-xs text-[#a1a1aa]">— {fmt(recurring.reduce((s, t) => s + Math.abs(Number(t.amount)), 0))}</span>
            </div>
          </div>
          <div className="divide-y divide-[#27272a]/50">
            {recurring.length > 0 ? (
              recurring.slice(0, 4).map((t) => <ExpenseRow key={t.id} tx={t} />)
            ) : (
              <p className="p-6 text-center text-sm text-[#a1a1aa]">Nenhum gasto fixo no período</p>
            )}
          </div>
          {recurring.length > 4 && (
            <button
              onClick={() => setShowAllRecurring(true)}
              className="w-full py-3 text-sm font-medium text-[#a78bfa] hover:bg-[#18181b] transition-colors border-t border-[#27272a]"
            >
              Ver plano recorrente ({recurring.length})
            </button>
          )}
        </div>
      </section>

      {/* ─── Pie Chart by Category ──────────────────────────────────── */}
      <section className="bg-[#0c0c0f] border border-[#27272a] rounded-xl p-6">
        <div className="mb-6">
          <h3 className="text-[#fafafa] font-bold text-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-[#a78bfa]">donut_large</span>
            Gastos por Categoria
          </h3>
          <p className="text-xs text-[#a1a1aa]">Clique em uma categoria para ver os gastos detalhados</p>
        </div>
        {topCategories && topCategories.length > 0 ? (
          <div className="flex flex-col lg:flex-row items-center gap-8">
            {/* SVG Pie */}
            <PieChart data={topCategories} onSliceClick={(name) => setDrillCategory(name)} />
            {/* Legend */}
            <div className="flex-1 space-y-3 w-full">
              {topCategories.map((cat, i) => (
                <button
                  key={cat.category_name}
                  onClick={() => setDrillCategory(cat.category_name)}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#18181b] transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-sm text-[#fafafa] group-hover:text-[#a78bfa] transition-colors">
                      {cat.category_icon} {cat.category_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-[#fafafa]">{fmt(Number(cat.total))}</span>
                    <span className="material-symbols-outlined text-[#a1a1aa] text-base">chevron_right</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#a1a1aa] text-center py-8">Sem dados de categorias no período</p>
        )}
      </section>

      {/* ─── Stacked Bar Chart (final da página) ────────────────────── */}
      <section className="bg-[#0c0c0f] border border-[#27272a] rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#a78bfa]">bar_chart</span>
            <h3 className="text-[#fafafa] font-bold">{chartTitle}</h3>
          </div>
          <div className="flex items-center gap-4">
            {LEGEND_ITEMS.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
                <span className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {chart && chart.bars.length > 0 ? (
          <div className="flex items-end justify-between gap-2 h-[220px]">
            {(() => {
              const maxVal = Math.max(
                ...chart.bars.flatMap((b) => [
                  Math.abs(Number(b.accumulated)),
                  Number(b.expenses),
                  Math.abs(Number(b.net)),
                ]),
                1,
              )
              return chart.bars.map((bar) => {
                const accH = Math.max((Math.abs(Number(bar.accumulated)) / maxVal) * 200, 4)
                const expH = Math.max((Number(bar.expenses) / maxVal) * 200, 4)
                const netH = Math.max((Math.abs(Number(bar.net)) / maxVal) * 200, 4)
                return (
                  <div key={bar.label} className="flex-1 flex flex-col items-center gap-2 group relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 bg-[#18181b] border border-[#27272a] rounded-lg p-3 text-xs min-w-[160px] shadow-xl">
                      <p className="font-bold text-[#fafafa] mb-1">{bar.label}</p>
                      <p className="text-[#a78bfa]">Acumulado: {fmtShort(Number(bar.accumulated))}</p>
                      <p className="text-[#34d399]">Líquido: {fmtShort(Number(bar.net))}</p>
                      <p className="text-[#ef4444]">Gastos: {fmtShort(Number(bar.expenses))}</p>
                    </div>
                    {/* Stacked bars — tallest in back, shorter in front */}
                    <div className="relative w-full flex justify-center" style={{ height: `${Math.max(accH, expH, netH)}px` }}>
                      {/* Accumulated (back — tallest) */}
                      <div
                        className="absolute bottom-0 rounded-t-md opacity-60 transition-all"
                        style={{
                          height: `${accH}px`,
                          width: '90%',
                          backgroundColor: '#a78bfa',
                        }}
                      />
                      {/* Expenses (middle) */}
                      <div
                        className="absolute bottom-0 rounded-t-md transition-all"
                        style={{
                          height: `${expH}px`,
                          width: '65%',
                          backgroundColor: '#ef4444',
                        }}
                      />
                      {/* Net (front — smallest) */}
                      <div
                        className="absolute bottom-0 rounded-t-md transition-all"
                        style={{
                          height: `${netH}px`,
                          width: '40%',
                          backgroundColor: Number(bar.net) >= 0 ? '#34d399' : '#ef4444',
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-bold uppercase text-[#a1a1aa]">{bar.label}</span>
                  </div>
                )
              })
            })()}
          </div>
        ) : (
          <div className="h-[220px] flex items-center justify-center text-[#a1a1aa] text-sm">
            Sem dados para o período
          </div>
        )}
      </section>

      {/* ─── Modals ─────────────────────────────────────────────────── */}
      {showAllOneTime && (
        <TransactionListModal
          title="Gastos Avulsos"
          icon="shopping_cart"
          transactions={oneTime}
          onClose={() => setShowAllOneTime(false)}
          onMakeFixed={(tx) => { setShowAllOneTime(false); setMakeFixedTx(tx) }}
        />
      )}
      {showAllRecurring && (
        <TransactionListModal
          title="Gastos Fixos / Cartão"
          icon="credit_card"
          transactions={recurring}
          onClose={() => setShowAllRecurring(false)}
        />
      )}
      {drillCategory && (
        <CategoryDrillModal
          categoryName={drillCategory}
          dateRange={dateRange}
          onClose={() => setDrillCategory(null)}
        />
      )}
      {makeFixedTx && (
        <MakeFixedModal
          tx={makeFixedTx}
          onClose={() => setMakeFixedTx(null)}
        />
      )}
    </div>
  )
}

/* ─── Expense Row ──────────────────────────────────────────────────────── */

function ExpenseRow({ tx, onMakeFixed }: { tx: Transaction; onMakeFixed?: () => void }) {
  return (
    <div className="px-5 py-3 flex items-center justify-between hover:bg-[#18181b]/30 transition-colors group">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center text-[#a1a1aa]">
          <span className="material-symbols-outlined text-lg">{tx.icon || 'receipt_long'}</span>
        </div>
        <div>
          <p className="text-sm font-medium text-[#fafafa]">{tx.description}</p>
          <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">
            {tx.category?.name || 'Sem categoria'} • {fmtDate(tx.date)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onMakeFixed && (
          <button
            onClick={(e) => { e.stopPropagation(); onMakeFixed() }}
            title="Tornar gasto fixo"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[#a1a1aa] hover:text-[#3b82f6]"
          >
            <span className="material-symbols-outlined text-lg">repeat</span>
          </button>
        )}
        <p className="text-sm font-bold text-[#ef4444]">-{fmt(Math.abs(Number(tx.amount)))}</p>
      </div>
    </div>
  )
}

/* ─── Pie Chart (SVG) ──────────────────────────────────────────────────── */

function PieChart({
  data,
  onSliceClick,
}: {
  data: SpendingByCategory[]
  onSliceClick: (name: string) => void
}) {
  const total = data.reduce((s, d) => s + Number(d.total), 0) || 1
  const size = 200
  const cx = size / 2
  const cy = size / 2
  const radius = 80
  const innerRadius = 50

  let currentAngle = -Math.PI / 2 // start at top

  const slices = data.map((cat, i) => {
    const fraction = Number(cat.total) / total
    const angle = fraction * Math.PI * 2
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle = endAngle

    const x1 = cx + radius * Math.cos(startAngle)
    const y1 = cy + radius * Math.sin(startAngle)
    const x2 = cx + radius * Math.cos(endAngle)
    const y2 = cy + radius * Math.sin(endAngle)
    const ix1 = cx + innerRadius * Math.cos(endAngle)
    const iy1 = cy + innerRadius * Math.sin(endAngle)
    const ix2 = cx + innerRadius * Math.cos(startAngle)
    const iy2 = cy + innerRadius * Math.sin(startAngle)

    const largeArc = angle > Math.PI ? 1 : 0

    const d = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      'Z',
    ].join(' ')

    return (
      <path
        key={cat.category_name}
        d={d}
        fill={PIE_COLORS[i % PIE_COLORS.length]}
        className="cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => onSliceClick(cat.category_name)}
      >
        <title>{cat.category_name}: {fmt(Number(cat.total))} ({(fraction * 100).toFixed(1)}%)</title>
      </path>
    )
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {slices}
      <text x={cx} y={cy - 8} textAnchor="middle" className="fill-[#fafafa] text-lg font-black">
        {fmtShort(total)}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" className="fill-[#a1a1aa] text-[10px] uppercase tracking-widest">
        Total
      </text>
    </svg>
  )
}

/* ─── Transaction List Modal ───────────────────────────────────────────── */

function TransactionListModal({
  title,
  icon,
  transactions,
  onClose,
  onMakeFixed,
}: {
  title: string
  icon: string
  transactions: Transaction[]
  onClose: () => void
  onMakeFixed?: (tx: Transaction) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0c0c0f] border border-[#27272a] rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#27272a] flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold text-[#fafafa] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#a78bfa]">{icon}</span>
            {title}
            <span className="text-sm font-normal text-[#a1a1aa]">({transactions.length})</span>
          </h3>
          <button onClick={onClose} className="material-symbols-outlined text-[#a1a1aa] hover:text-[#fafafa]">
            close
          </button>
        </div>
        <div className="overflow-y-auto divide-y divide-[#27272a]/50 flex-1">
          {transactions.map((t) => (
            <ExpenseRow
              key={t.id}
              tx={t}
              onMakeFixed={onMakeFixed ? () => onMakeFixed(t) : undefined}
            />
          ))}
        </div>
        <div className="px-6 py-3 border-t border-[#27272a] flex justify-between items-center shrink-0 bg-[#09090b]">
          <span className="text-sm text-[#a1a1aa]">{transactions.length} transações</span>
          <span className="text-sm font-bold text-[#ef4444]">
            Total: {fmt(transactions.reduce((s, t) => s + Math.abs(Number(t.amount)), 0))}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ─── Category Drill-down Modal ────────────────────────────────────────── */

function CategoryDrillModal({
  categoryName,
  dateRange,
  onClose,
}: {
  categoryName: string
  dateRange: { start_date: string; end_date: string }
  onClose: () => void
}) {
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['category-transactions', categoryName, dateRange],
    queryFn: () =>
      getCategoryTransactions({
        category_name: categoryName,
        ...dateRange,
      }),
  })

  const total = (transactions || []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0c0c0f] border border-[#27272a] rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#27272a] flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold text-[#fafafa] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#a78bfa]">category</span>
            {categoryName}
          </h3>
          <button onClick={onClose} className="material-symbols-outlined text-[#a1a1aa] hover:text-[#fafafa]">
            close
          </button>
        </div>
        <div className="overflow-y-auto divide-y divide-[#27272a]/50 flex-1">
          {isLoading ? (
            <p className="p-8 text-center text-sm text-[#a1a1aa]">Carregando…</p>
          ) : transactions && transactions.length > 0 ? (
            transactions.map((t) => <ExpenseRow key={t.id} tx={t} />)
          ) : (
            <p className="p-8 text-center text-sm text-[#a1a1aa]">Nenhuma transação encontrada</p>
          )}
        </div>
        <div className="px-6 py-3 border-t border-[#27272a] flex justify-between items-center shrink-0 bg-[#09090b]">
          <span className="text-sm text-[#a1a1aa]">{transactions?.length ?? 0} transações</span>
          <span className="text-sm font-bold text-[#ef4444]">Total: {fmt(total)}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Make Fixed Modal ─────────────────────────────────────────────────── */

function MakeFixedModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const queryClient = useQueryClient()
  const txDay = new Date(tx.date + 'T00:00:00').getDate()
  const now = new Date()

  const [isPermanent, setIsPermanent] = useState(true)
  const [dayOfMonth, setDayOfMonth] = useState(String(txDay))
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`)
  const [endDate, setEndDate] = useState('')
  const [success, setSuccess] = useState(false)

  const createMut = useMutation({
    mutationFn: createFixedExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions-grouped'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      setSuccess(true)
    },
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string }
      alert(`Erro: ${e?.response?.data?.detail || e?.message || 'Erro desconhecido'}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: FixedExpenseCreate = {
      description: tx.description,
      amount: Math.abs(Number(tx.amount)),
      category_id: tx.category_id,
      day_of_month: Number(dayOfMonth),
      is_permanent: isPermanent,
      start_date: startDate,
      end_date: isPermanent ? null : endDate || null,
      icon: tx.icon || 'repeat',
    }
    createMut.mutate(data)
  }

  const inputClass =
    'w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#a78bfa]'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0c0c0f] border border-[#27272a] rounded-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#27272a] flex justify-between items-center">
          <h3 className="text-lg font-bold text-[#fafafa] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#3b82f6]">repeat</span>
            Tornar Gasto Fixo
          </h3>
          <button onClick={onClose} className="material-symbols-outlined text-[#a1a1aa] hover:text-[#fafafa]">
            close
          </button>
        </div>

        {success ? (
          <div className="p-6 text-center space-y-3">
            <span className="material-symbols-outlined text-[#34d399] text-5xl block">check_circle</span>
            <p className="text-[#fafafa] font-bold">Gasto fixo criado!</p>
            <p className="text-sm text-[#a1a1aa]">
              "{tx.description}" agora é um gasto fixo mensal. As transações foram geradas automaticamente.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2 bg-[#a78bfa] text-[#0a0012] rounded-lg text-sm font-bold hover:bg-[#a78bfa]/90"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Preview */}
            <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center text-[#a1a1aa]">
                <span className="material-symbols-outlined">{tx.icon || 'receipt_long'}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#fafafa]">{tx.description}</p>
                <p className="text-xs text-[#a1a1aa]">{tx.category?.name || 'Sem categoria'}</p>
              </div>
              <p className="text-sm font-bold text-[#ef4444]">{fmt(Math.abs(Number(tx.amount)))}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Dia do mês</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Início</label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Duração</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsPermanent(true)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isPermanent
                      ? 'bg-[#a78bfa]/15 text-[#a78bfa] border border-[#a78bfa]/30'
                      : 'text-[#a1a1aa] border border-[#27272a] hover:bg-[#18181b]'
                  }`}
                >
                  Permanente
                </button>
                <button
                  type="button"
                  onClick={() => setIsPermanent(false)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !isPermanent
                      ? 'bg-[#a78bfa]/15 text-[#a78bfa] border border-[#a78bfa]/30'
                      : 'text-[#a1a1aa] border border-[#27272a] hover:bg-[#18181b]'
                  }`}
                >
                  Com prazo
                </button>
              </div>
            </div>

            {!isPermanent && (
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Data final</label>
                <input
                  type="date"
                  required={!isPermanent}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={createMut.isPending}
              className="w-full bg-[#3b82f6] text-white py-2 rounded-lg text-sm font-bold hover:bg-[#3b82f6]/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-base">repeat</span>
              {createMut.isPending ? 'Cadastrando…' : 'Confirmar como Gasto Fixo'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
