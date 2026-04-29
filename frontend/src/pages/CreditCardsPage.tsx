import { useMemo, useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  LineChart, Line,
} from 'recharts'
import {
  getCreditCards,
  createCreditCard,
  updateCreditCard,
  deleteCreditCard,
  createCreditCardExpense,
  updateCreditCardExpense,
  deleteCreditCardExpense,
  refundCreditCardExpense,
  unrefundCreditCardExpense,
  anticipateInstallment,
  getCreditCardBillMonths,
  getCreditCardBill,
  getCreditCardByCategory,
  getCreditCardByType,
  getCreditCardDailySpend,
  importCreditCardPdf,
  bulkCreateCreditCardExpenses,
  getCategories,
} from '../api/client'
import type {
  CreditCard,
  CreditCardCreate,
  CreditCardBillItem,
  CreditCardExpense,
  CreditCardImportPreviewItem,
  Category as CategoryType,
} from '../types'

type PeriodMode = 'annual' | 'monthly'

const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const PT_MONTHS_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

const PIE_COLORS = [
  '#a78bfa', '#34d399', '#ef4444', '#f59e0b', '#3b82f6',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#71717a',
]

const CARD_COLORS = [
  '#a78bfa', '#34d399', '#3b82f6', '#ef4444', '#f59e0b',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#71717a',
]

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtShort = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ─────────────────────────────────────────────────────────────────────── */

export default function CreditCardsPage() {
  const qc = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [mode, setMode] = useState<PeriodMode>('annual')
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

  /* ── data ── */
  const { data: cards = [] } = useQuery({ queryKey: ['cc-cards'], queryFn: getCreditCards })
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories })
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories],
  )
  const { data: monthSummaries = [] } = useQuery({
    queryKey: ['cc-bill-months', year],
    queryFn: () => getCreditCardBillMonths(year),
  })
  const byCategoryParams = mode === 'monthly' ? { year, month: selectedMonth } : { year }
  const { data: byCategory = [] } = useQuery({
    queryKey: ['cc-by-category', year, mode === 'monthly' ? selectedMonth : 'all'],
    queryFn: () => getCreditCardByCategory(byCategoryParams),
  })
  const { data: byType } = useQuery({
    queryKey: ['cc-by-type', year],
    queryFn: () => getCreditCardByType(year),
  })
  const { data: dailySpend = [] } = useQuery({
    queryKey: ['cc-daily', year, selectedMonth],
    queryFn: () => getCreditCardDailySpend(year, selectedMonth),
    enabled: mode === 'monthly',
  })
  const { data: monthBill = [] } = useQuery({
    queryKey: ['cc-bill', year, selectedMonth],
    queryFn: () => getCreditCardBill(year, selectedMonth),
    enabled: mode === 'monthly',
  })
  const { data: allExpenses = [] } = useQuery({
    queryKey: ['cc-expenses'],
    queryFn: () => fetch('/api/credit-cards/expenses').then((r) => r.json()) as Promise<CreditCardExpense[]>,
  })

  const totalLimit = cards.reduce((acc, c) => acc + Number(c.credit_limit), 0)
  const totalUsed = cards.reduce((acc, c) => acc + Number(c.used_amount), 0)
  const limitPercent = totalLimit > 0 ? Math.min(100, (totalUsed / totalLimit) * 100) : 0

  /* ── modals ── */
  const [cardFormOpen, setCardFormOpen] = useState(false)
  const [cardEdit, setCardEdit] = useState<CreditCard | null>(null)
  const [billOpen, setBillOpen] = useState<{ year: number; month: number } | null>(null)
  const [pdfImportOpen, setPdfImportOpen] = useState(false)
  const [allExpensesOpen, setAllExpensesOpen] = useState(false)

  /* ── invalidate helper ── */
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['cc-cards'] })
    qc.invalidateQueries({ queryKey: ['cc-bill-months'] })
    qc.invalidateQueries({ queryKey: ['cc-by-category'] })
    qc.invalidateQueries({ queryKey: ['cc-by-type'] })
    qc.invalidateQueries({ queryKey: ['cc-daily'] })
    qc.invalidateQueries({ queryKey: ['cc-expenses'] })
    qc.invalidateQueries({ queryKey: ['cc-bill'] })
    // Also invalidate global expense queries because mirrors changed.
    qc.invalidateQueries({ queryKey: ['expenses-chart'] })
    qc.invalidateQueries({ queryKey: ['top-categories'] })
    qc.invalidateQueries({ queryKey: ['transactions-grouped'] })
    qc.invalidateQueries({ queryKey: ['recent-transactions'] })
    qc.invalidateQueries({ queryKey: ['balance'] })
  }

  /* ── month carousel scroll to current month on load ── */
  const currentMonthIdx = year === now.getFullYear() ? now.getMonth() : 0

  /* ── annual chart data ── */
  const annualChartData = useMemo(
    () =>
      monthSummaries.map((m) => ({
        label: PT_MONTHS_SHORT[m.bill_month - 1],
        value: Number(m.total),
        installment: Number(m.installment_total),
        subscription: Number(m.subscription_total),
        oneTime: Number(m.one_time_total),
      })),
    [monthSummaries],
  )

  /* ── carousel scroll (drag + arrows) ── */
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false })
  const onCarouselDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!carouselRef.current) return
    drag.current = {
      active: true,
      startX: e.pageX - carouselRef.current.offsetLeft,
      scrollLeft: carouselRef.current.scrollLeft,
      moved: false,
    }
    carouselRef.current.style.cursor = 'grabbing'
  }
  const onCarouselMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drag.current.active || !carouselRef.current) return
    const x = e.pageX - carouselRef.current.offsetLeft
    const dx = x - drag.current.startX
    if (Math.abs(dx) > 4) drag.current.moved = true
    carouselRef.current.scrollLeft = drag.current.scrollLeft - dx
  }
  const onCarouselUp = () => {
    drag.current.active = false
    if (carouselRef.current) carouselRef.current.style.cursor = 'grab'
  }
  const scrollCarousel = (dir: 1 | -1) => {
    if (!carouselRef.current) return
    carouselRef.current.scrollBy({ left: dir * 220, behavior: 'smooth' })
  }

  const selectedSummary = monthSummaries.find((m) => m.bill_month === selectedMonth)

  /* ── filtro do painel de lançamentos (avulsos / parcelados / assinaturas) ── */
  const [expenseFilter, setExpenseFilter] = useState<
    'all' | 'one_time' | 'installment' | 'subscription'
  >('all')

  const filteredExpenses = useMemo(() => {
    let list = allExpenses
    if (expenseFilter === 'subscription') list = list.filter((e) => e.is_subscription)
    else if (expenseFilter === 'installment')
      list = list.filter((e) => !e.is_subscription && e.installment_count > 1)
    else if (expenseFilter === 'one_time')
      list = list.filter((e) => !e.is_subscription && e.installment_count === 1)
    return expenseFilter === 'subscription' ? list : list.slice(0, 10)
  }, [allExpenses, expenseFilter])

  return (
    <div className="space-y-8">
      {/* Header / year selector */}
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Cartão de Crédito</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Gerencie cartões, faturas, parcelas e assinaturas
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period filter */}
          <div className="flex border border-outline-variant rounded-lg overflow-hidden">
            <button
              onClick={() => setMode('annual')}
              className={`px-4 py-2 text-sm transition-colors ${
                mode === 'annual'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              Anual
            </button>
            <button
              onClick={() => setMode('monthly')}
              className={`px-4 py-2 text-sm transition-colors ${
                mode === 'monthly'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              Mensal
            </button>
          </div>

          {/* Month picker (monthly mode only) */}
          {mode === 'monthly' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 text-sm rounded-lg border border-outline-variant bg-surface-container text-on-surface"
            >
              {PT_MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          )}

          {/* Year nav */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setYear(year - 1)}
              className="w-10 h-10 rounded-lg border border-outline-variant hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-on-surface-variant">chevron_left</span>
            </button>
            <span className="text-on-surface font-medium px-3">{year}</span>
            <button
              onClick={() => setYear(year + 1)}
              className="w-10 h-10 rounded-lg border border-outline-variant hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
            </button>
          </div>
        </div>
      </header>

      {/* Annual mode: Resumo Mensal + line chart below */}
      {mode === 'annual' && (
        <section>
          <header className="flex items-center justify-between mb-4">
            <h2 className="text-base font-medium text-on-surface">Resumo Mensal</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollCarousel(-1)}
                className="w-9 h-9 rounded-lg border border-outline-variant hover:bg-surface-container-high"
                aria-label="Anterior"
              >
                <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_left</span>
              </button>
              <button
                onClick={() => scrollCarousel(1)}
                className="w-9 h-9 rounded-lg border border-outline-variant hover:bg-surface-container-high"
                aria-label="Próximo"
              >
                <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
              </button>
            </div>
          </header>
          <div
            ref={carouselRef}
            onMouseDown={onCarouselDown}
            onMouseMove={onCarouselMove}
            onMouseUp={onCarouselUp}
            onMouseLeave={onCarouselUp}
            className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 select-none cc-carousel"
            style={{ cursor: 'grab', scrollbarWidth: 'thin' }}
          >
            {monthSummaries.map((m, i) => {
              const isCurrent = i === currentMonthIdx
              const isFuture = year > now.getFullYear() || (year === now.getFullYear() && m.bill_month > now.getMonth() + 1)
              const isEmpty = m.item_count === 0
              return (
                <button
                  key={m.bill_month}
                  onClick={(e) => {
                    if (drag.current.moved) { e.preventDefault(); return }
                    setBillOpen({ year: m.bill_year, month: m.bill_month })
                  }}
                  className={`flex-shrink-0 w-44 text-left rounded-xl border p-4 transition-all ${
                    isCurrent
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container border-outline-variant hover:border-primary/50'
                  }`}
                >
                  <p className={`text-xs ${isCurrent ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                    {PT_MONTHS[m.bill_month - 1]}
                  </p>
                  <p className={`text-xl font-semibold mt-1 ${isCurrent ? 'text-on-primary' : 'text-on-surface'}`}>
                    {fmt(Number(m.total))}
                  </p>
                  <p className={`text-[11px] mt-2 flex items-center gap-1 ${isCurrent ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                    {isEmpty ? (
                      <>
                        <span className="material-symbols-outlined text-sm">lock</span>
                        {isFuture ? 'Não iniciado' : '—'}
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">receipt_long</span>
                        {m.item_count} item{m.item_count !== 1 ? 's' : ''}
                      </>
                    )}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Line chart of monthly totals */}
          <div className="mt-6 bg-surface-container border border-outline-variant rounded-xl p-5">
            <h3 className="text-sm font-medium text-on-surface mb-3">Evolução mensal</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={annualChartData}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="label" stroke="#a1a1aa" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#a1a1aa" tick={{ fontSize: 12 }} tickFormatter={fmtShort} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                    formatter={(v: number) => fmt(v)}
                    labelStyle={{ color: '#fafafa' }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Monthly mode: single big card + line chart + ações */}
      {mode === 'monthly' && (
        <section className="space-y-6">
          <div className="bg-surface-container border border-outline-variant rounded-xl p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-wide">
                  {PT_MONTHS[selectedMonth - 1]} {year}
                </p>
                <p className="text-3xl font-semibold text-on-surface mt-1">
                  {fmt(Number(selectedSummary?.total || 0))}
                </p>
                <p className="text-xs text-on-surface-variant mt-2">
                  {selectedSummary?.item_count || 0} lançamento{(selectedSummary?.item_count || 0) !== 1 ? 's' : ''}
                  {Number(selectedSummary?.refunded_total || 0) > 0 && (
                    <span className="text-tertiary ml-2">
                      · {fmt(Number(selectedSummary!.refunded_total))} reembolsado
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAllExpensesOpen(true)}
                  className="px-4 py-2 text-sm rounded-lg border border-primary text-primary hover:bg-primary/10 flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">list</span>
                  Ver todos os gastos
                </button>
                <button
                  onClick={() => setBillOpen({ year, month: selectedMonth })}
                  className="px-4 py-2 text-sm rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">edit</span>
                  Editar fatura
                </button>
              </div>
            </div>

            {/* Daily line chart for the selected month */}
            <div className="h-48 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailySpend.map((d) => ({ label: String(d.day).padStart(2, '0'), value: Number(d.total) }))}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="label" stroke="#a1a1aa" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#a1a1aa" tick={{ fontSize: 11 }} tickFormatter={fmtShort} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                    formatter={(v: number) => fmt(v)}
                    labelStyle={{ color: '#fafafa' }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Two-column area */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT — Cartões */}
        <div className="lg:col-span-3 space-y-6">
          <section className="bg-surface-container border border-outline-variant rounded-xl p-5">
            <header className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-base font-medium text-on-surface">Meus Cartões</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setPdfImportOpen(true)}
                  disabled={cards.length === 0}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
                  title={cards.length === 0 ? 'Cadastre um cartão primeiro' : ''}
                >
                  <span className="material-symbols-outlined text-base">upload_file</span>
                  Importar Fatura PDF
                </button>
                <button
                  onClick={() => { setCardEdit(null); setCardFormOpen(true) }}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-primary text-primary hover:bg-primary/10"
                >
                  <span className="material-symbols-outlined text-base">add</span>
                  Cadastrar Novo Cartão
                </button>
              </div>
            </header>
            <div className="space-y-3">
              {cards.length === 0 && (
                <p className="text-sm text-on-surface-variant text-center py-8">
                  Nenhum cartão cadastrado.
                </p>
              )}
              {cards.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-4 p-4 rounded-lg border border-outline-variant bg-surface-container-low"
                >
                  <div
                    className="w-10 h-10 rounded flex items-center justify-center"
                    style={{ backgroundColor: c.color }}
                  >
                    <span className="material-symbols-outlined text-on-primary">credit_card</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-on-surface">{c.name}</p>
                    <p className="text-xs text-on-surface-variant uppercase tracking-wide mt-0.5">
                      Limite: {fmt(Number(c.credit_limit))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-on-surface-variant">Fechamento</p>
                    <p className="text-sm font-medium text-on-surface">Dia {c.closing_day}</p>
                  </div>
                  <button
                    onClick={() => { setCardEdit(c); setCardFormOpen(true) }}
                    className="px-3 py-1.5 text-sm rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                  >
                    Editar
                  </button>
                </div>
              ))}
            </div>

            {/* Limit consolidated */}
            {cards.length > 0 && (
              <div className="mt-5 p-4 rounded-lg border border-outline-variant bg-surface-container-low">
                <p className="text-xs text-on-surface-variant uppercase tracking-wide">
                  Limite Total Consolidado
                </p>
                <p className="text-2xl font-semibold text-on-surface mt-1">
                  {fmt(totalLimit)}{' '}
                  <span className="text-sm font-normal text-on-surface-variant">
                    utilizado: {fmt(totalUsed)}
                  </span>
                </p>
                <div className="h-2 rounded bg-surface-container-highest mt-3 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded"
                    style={{ width: `${limitPercent}%` }}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Lançamentos (avulsos + parcelados + assinaturas) */}
          <section className="bg-surface-container border border-outline-variant rounded-xl p-5">
            <header className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="text-base font-medium text-on-surface">Lançamentos</h2>
              <div className="flex border border-outline-variant rounded-lg overflow-hidden text-xs">
                {([
                  ['all', 'Todos'],
                  ['one_time', 'Avulsos'],
                  ['installment', 'Parcelados'],
                  ['subscription', 'Assinaturas'],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setExpenseFilter(k)}
                    className={`px-3 py-1.5 transition-colors ${
                      expenseFilter === k
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </header>
            <div className="space-y-2">
              {filteredExpenses.length === 0 && (
                <p className="text-sm text-on-surface-variant text-center py-6">
                  {expenseFilter === 'subscription'
                    ? 'Nenhuma assinatura. Marque "Assinatura?" ao lançar um gasto.'
                    : 'Nenhum lançamento encontrado.'}
                </p>
              )}
              {filteredExpenses.map((e) => {
                const card = cards.find((c) => c.id === e.credit_card_id)
                const isSub = e.is_subscription
                const isInstallment = !isSub && e.installment_count > 1
                const tag = isSub
                  ? 'Assinatura'
                  : isInstallment
                  ? `Parcelado ${e.installment_count}x`
                  : 'Avulso'
                const iconName = isSub
                  ? 'subscriptions'
                  : isInstallment
                  ? 'splitscreen'
                  : 'receipt_long'
                const iconColor = isSub
                  ? 'text-tertiary'
                  : isInstallment
                  ? 'text-primary'
                  : 'text-on-surface-variant'
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low"
                  >
                    <span className={`material-symbols-outlined ${iconColor}`}>
                      {e.category?.icon || iconName}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {e.description}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {card?.name || '—'} · {e.category?.name || 'Sem categoria'} · {tag}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-medium whitespace-nowrap ${
                        e.is_refunded ? 'line-through text-on-surface-variant' : 'text-on-surface'
                      }`}
                    >
                      {isSub ? `${fmt(Number(e.amount))}/mês` : `- ${fmt(Number(e.amount))}`}
                    </p>
                    <button
                      onClick={() => {
                        const msg = isSub
                          ? 'Remover esta assinatura? Todas as parcelas futuras serão excluídas.'
                          : 'Remover este lançamento?'
                        if (confirm(msg))
                          deleteCreditCardExpense(e.id).then(invalidateAll)
                      }}
                      className="text-on-surface-variant hover:text-error"
                      title="Remover"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* RIGHT — Lançar Gasto */}
        <div className="lg:col-span-2 space-y-6">
          <ExpenseForm
            cards={cards}
            categories={expenseCategories}
            onCreated={invalidateAll}
          />
        </div>
      </div>

      {/* Charts */}
      {mode === 'annual' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-surface-container border border-outline-variant rounded-xl p-5">
            <h2 className="text-base font-medium text-on-surface mb-4">
              Gasto Anual por Tipo ({year})
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={annualChartData}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="label" stroke="#a1a1aa" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#a1a1aa" tick={{ fontSize: 12 }} tickFormatter={fmtShort} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                    formatter={(v: number) => fmt(v)}
                    labelStyle={{ color: '#fafafa' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
                  <Bar dataKey="oneTime" stackId="a" fill="#3b82f6" name="Avulsos" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="installment" stackId="a" fill="#a78bfa" name="Parcelados" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="subscription" stackId="a" fill="#34d399" name="Assinaturas" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-surface-container border border-outline-variant rounded-xl p-5">
            <h2 className="text-base font-medium text-on-surface mb-4">Por Categoria ({year})</h2>
            <div className="h-64">
              {byCategory.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center pt-20">Sem dados.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory.map((c) => ({ name: c.category_name, value: Number(c.total) }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {byCategory.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                      formatter={(v: number) => fmt(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Subscription vs installment vs one-time pie */}
          <section className="bg-surface-container border border-outline-variant rounded-xl p-5 lg:col-span-2">
            <h2 className="text-base font-medium text-on-surface mb-4">
              Assinaturas vs Parcelas Fixas vs Avulsos ({year})
            </h2>
            {byType && (Number(byType.subscription_total) + Number(byType.installment_total) + Number(byType.one_time_total)) > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Assinaturas', value: Number(byType.subscription_total) },
                        { name: 'Parcelas Fixas', value: Number(byType.installment_total) },
                        { name: 'Avulsos', value: Number(byType.one_time_total) },
                      ].filter((d) => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={(e: { name: string; percent: number }) => `${e.name} ${(e.percent * 100).toFixed(0)}%`}
                    >
                      <Cell fill="#34d399" />
                      <Cell fill="#a78bfa" />
                      <Cell fill="#3b82f6" />
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                      formatter={(v: number) => fmt(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant text-center py-12">Sem dados.</p>
            )}
          </section>
        </div>
      )}

      {/* Monthly mode charts */}
      {mode === 'monthly' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-surface-container border border-outline-variant rounded-xl p-5">
            <h2 className="text-base font-medium text-on-surface mb-4">
              Por Categoria ({PT_MONTHS[selectedMonth - 1]})
            </h2>
            <div className="h-64">
              {byCategory.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center pt-20">Sem dados.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory.map((c) => ({ name: c.category_name, value: Number(c.total) }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {byCategory.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                      formatter={(v: number) => fmt(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="bg-surface-container border border-outline-variant rounded-xl p-5">
            <h2 className="text-base font-medium text-on-surface mb-4">
              Composição da Fatura ({PT_MONTHS[selectedMonth - 1]})
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    {
                      label: PT_MONTHS_SHORT[selectedMonth - 1],
                      Parcelados: Number(selectedSummary?.installment_total || 0),
                      Avulsos: Number(selectedSummary?.one_time_total || 0),
                      Assinaturas: Number(selectedSummary?.subscription_total || 0),
                    },
                  ]}
                >
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="label" stroke="#a1a1aa" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#a1a1aa" tick={{ fontSize: 12 }} tickFormatter={fmtShort} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                    formatter={(v: number) => fmt(v)}
                    labelStyle={{ color: '#fafafa' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
                  <Bar dataKey="Avulsos" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="Parcelados" stackId="a" fill="#a78bfa" />
                  <Bar dataKey="Assinaturas" stackId="a" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}

      {/* Modals */}
      {cardFormOpen && (
        <CardFormModal
          card={cardEdit}
          onClose={() => setCardFormOpen(false)}
          onSaved={() => { setCardFormOpen(false); invalidateAll() }}
          onDeleted={() => { setCardFormOpen(false); invalidateAll() }}
        />
      )}
      {billOpen && (
        <BillModal
          year={billOpen.year}
          month={billOpen.month}
          onClose={() => setBillOpen(null)}
          onChanged={invalidateAll}
        />
      )}
      {pdfImportOpen && (
        <PdfImportModal
          cards={cards}
          categories={expenseCategories}
          onClose={() => setPdfImportOpen(false)}
          onDone={() => { setPdfImportOpen(false); invalidateAll() }}
        />
      )}
      {allExpensesOpen && (
        <AllExpensesModal
          items={[...monthBill].sort(
            (a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime(),
          )}
          monthLabel={`${PT_MONTHS[selectedMonth - 1]} ${year}`}
          onClose={() => setAllExpensesOpen(false)}
        />
      )}
    </div>
  )
}

/* ─── Expense Form ─────────────────────────────────────────────────────── */

function ExpenseForm({
  cards,
  categories,
  onCreated,
}: {
  cards: CreditCard[]
  categories: { id: number; name: string; icon: string | null }[]
  onCreated: () => void
}) {
  const [cardId, setCardId] = useState<number | ''>('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [parcelado, setParcelado] = useState(false)
  const [installments, setInstallments] = useState(1)
  const [isSubscription, setIsSubscription] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!cardId && cards.length) setCardId(cards[0].id)
  }, [cards, cardId])
  useEffect(() => {
    if (!categoryId && categories.length) setCategoryId(categories[0].id)
  }, [categories, categoryId])

  const submit = useMutation({
    mutationFn: createCreditCardExpense,
    onSuccess: () => {
      setDescription(''); setAmount(''); setInstallments(1); setParcelado(false); setIsSubscription(false)
      setError(null)
      onCreated()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setError(e?.response?.data?.detail || 'Erro ao lançar gasto')
    },
  })

  const handleSubmit = () => {
    setError(null)
    if (!cardId) { setError('Selecione um cartão'); return }
    if (!description.trim()) { setError('Descrição obrigatória'); return }
    const amt = Number(amount.replace(',', '.'))
    if (!amt || amt <= 0) { setError('Valor inválido'); return }
    submit.mutate({
      credit_card_id: Number(cardId),
      category_id: categoryId ? Number(categoryId) : null,
      description: description.trim(),
      amount: amt,
      purchase_date: date,
      installment_count: parcelado ? Math.max(1, installments) : 1,
      is_subscription: isSubscription,
    })
  }

  const noCards = cards.length === 0

  return (
    <section className="bg-surface-container border border-outline-variant rounded-xl p-5">
      <header className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 bg-primary rounded" />
        <h2 className="text-base font-medium text-on-surface">Lançar Gasto</h2>
      </header>

      {noCards && (
        <p className="text-sm text-on-surface-variant text-center py-4">
          Cadastre um cartão antes de lançar gastos.
        </p>
      )}

      {!noCards && (
        <div className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-on-surface-variant">Cartão</label>
            <select
              value={cardId}
              onChange={(e) => setCardId(Number(e.target.value))}
              className="mt-1.5 w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {cards.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-on-surface-variant">Descrição</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Supermercado BH"
              className="mt-1.5 w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-on-surface-variant">Valor (R$)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="R$ 0,00"
              inputMode="decimal"
              className="mt-1.5 w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-on-surface-variant">Categoria</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="mt-1.5 w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-on-surface-variant">Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <ToggleRow
            icon="event_repeat"
            label="Parcelado?"
            value={parcelado}
            onChange={(v) => { setParcelado(v); if (v) setIsSubscription(false) }}
            disabled={isSubscription}
          />
          {parcelado && (
            <div>
              <label className="text-xs uppercase tracking-wide text-on-surface-variant">
                Número de Parcelas
              </label>
              <input
                type="number"
                min={2}
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value) || 1)}
                className="mt-1.5 w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          <ToggleRow
            icon="subscriptions"
            label="Assinatura?"
            value={isSubscription}
            onChange={(v) => { setIsSubscription(v); if (v) { setParcelado(false); setInstallments(1) } }}
            disabled={parcelado}
          />

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={submit.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">send</span>
            {submit.isPending ? 'Adicionando...' : 'Adicionar Gasto'}
          </button>
        </div>
      )}
    </section>
  )
}

function ToggleRow({
  icon, label, value, onChange, disabled,
}: {
  icon: string; label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border border-outline-variant ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 text-on-surface">
        <span className="material-symbols-outlined text-base text-on-surface-variant">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`w-11 h-6 rounded-full transition-colors relative ${value ? 'bg-primary' : 'bg-surface-container-highest'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            value ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

/* ─── Card form modal ──────────────────────────────────────────────────── */

function CardFormModal({
  card, onClose, onSaved, onDeleted,
}: {
  card: CreditCard | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(card?.name || '')
  const [brand, setBrand] = useState(card?.brand || '')
  const [color, setColor] = useState(card?.color || CARD_COLORS[0])
  const [creditLimit, setCreditLimit] = useState(String(card?.credit_limit ?? ''))
  const [closingDay, setClosingDay] = useState(String(card?.closing_day ?? '5'))
  const [dueDay, setDueDay] = useState(String(card?.due_day ?? '15'))
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const payload: CreditCardCreate = {
        name: name.trim(),
        brand: brand.trim() || null,
        color,
        credit_limit: Number(creditLimit.replace(',', '.')) || 0,
        closing_day: Number(closingDay),
        due_day: Number(dueDay),
      }
      if (card) return updateCreditCard(card.id, payload)
      return createCreditCard(payload)
    },
    onSuccess: onSaved,
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setError(e?.response?.data?.detail || 'Erro ao salvar cartão')
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteCreditCard(card!.id),
    onSuccess: onDeleted,
  })

  const handleSubmit = () => {
    setError(null)
    if (!name.trim()) { setError('Nome obrigatório'); return }
    const cd = Number(closingDay), dd = Number(dueDay)
    if (!cd || cd < 1 || cd > 31) { setError('Dia de fechamento inválido (1-31)'); return }
    if (!dd || dd < 1 || dd > 31) { setError('Dia de vencimento inválido (1-31)'); return }
    save.mutate()
  }

  return (
    <Modal onClose={onClose} title={card ? 'Editar Cartão' : 'Cadastrar Cartão'}>
      <div className="space-y-4">
        <Field label="Nome">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Nubank Titanium"
            className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>
        <Field label="Bandeira (opcional)">
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Ex: Visa, Mastercard"
            className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>
        <Field label="Cor">
          <div className="flex gap-2 flex-wrap">
            {CARD_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-offset-surface-container ring-primary' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>
        <Field label="Limite (R$)">
          <input
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            placeholder="0,00"
            inputMode="decimal"
            className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fechamento (dia)">
            <input
              type="number"
              min={1}
              max={31}
              value={closingDay}
              onChange={(e) => setClosingDay(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
          <Field label="Vencimento (dia)">
            <input
              type="number"
              min={1}
              max={31}
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-between gap-2 pt-2">
          {card ? (
            <button
              onClick={() => {
                if (confirm('Excluir este cartão removerá todos os seus gastos. Continuar?'))
                  remove.mutate()
              }}
              className="px-4 py-2 rounded-lg border border-error text-error hover:bg-error/10"
            >
              Excluir
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={save.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {save.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Bill modal ───────────────────────────────────────────────────────── */

function BillModal({
  year, month, onClose, onChanged,
}: {
  year: number; month: number; onClose: () => void; onChanged: () => void
}) {
  const qc = useQueryClient()
  const { data: items = [] } = useQuery({
    queryKey: ['cc-bill', year, month],
    queryFn: () => getCreditCardBill(year, month),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['cc-bill', year, month] })
    onChanged()
  }

  const total = items.filter((i) => !i.is_refunded).reduce((acc, i) => acc + Number(i.amount), 0)
  const refunded = items.filter((i) => i.is_refunded).reduce((acc, i) => acc + Number(i.amount), 0)

  const [anticipateItem, setAnticipateItem] = useState<CreditCardBillItem | null>(null)
  const [editItem, setEditItem] = useState<CreditCardBillItem | null>(null)

  return (
    <Modal onClose={onClose} title={`Fatura — ${PT_MONTHS[month - 1]} ${year}`} width="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-lg bg-surface-container-low border border-outline-variant">
          <div>
            <p className="text-xs text-on-surface-variant uppercase tracking-wide">Total da fatura</p>
            <p className="text-2xl font-semibold text-on-surface">{fmt(total)}</p>
          </div>
          {refunded > 0 && (
            <div className="text-right">
              <p className="text-xs text-tertiary uppercase tracking-wide">Reembolsado</p>
              <p className="text-base text-tertiary">{fmt(refunded)}</p>
            </div>
          )}
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {items.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-8">
              Nenhum lançamento nesta fatura.
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.installment_id}
              className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low"
            >
              <div
                className="w-2 h-10 rounded"
                style={{ backgroundColor: item.card_color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`font-medium truncate ${item.is_refunded ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                    {item.description}
                  </p>
                  {item.is_subscription && (
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary">
                      assinatura
                    </span>
                  )}
                  {item.is_anticipated && (
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                      antecipada
                    </span>
                  )}
                  {item.is_refunded && (
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary">
                      reembolsado
                    </span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant">
                  {item.card_name} · {item.category_name || 'Sem categoria'}
                  {item.installment_count > 1 && ` · ${item.installment_number}/${item.installment_count}`}
                </p>
              </div>
              <p className={`font-medium whitespace-nowrap ${item.is_refunded ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                {fmt(Number(item.amount))}
              </p>
              <div className="flex items-center gap-1">
                <IconBtn
                  icon="schedule"
                  title="Antecipar parcela"
                  onClick={() => setAnticipateItem(item)}
                />
                <IconBtn
                  icon={item.is_refunded ? 'undo' : 'replay'}
                  title={item.is_refunded ? 'Desfazer reembolso' : 'Marcar como reembolsado'}
                  onClick={() => {
                    const fn = item.is_refunded ? unrefundCreditCardExpense : refundCreditCardExpense
                    fn(item.expense_id).then(refresh)
                  }}
                />
                <IconBtn
                  icon="edit"
                  title="Editar"
                  onClick={() => setEditItem(item)}
                />
                <IconBtn
                  icon="delete"
                  title="Excluir gasto"
                  onClick={() => {
                    if (confirm('Excluir este gasto removerá todas as parcelas. Continuar?'))
                      deleteCreditCardExpense(item.expense_id).then(refresh)
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {anticipateItem && (
          <AnticipateModal
            item={anticipateItem}
            onClose={() => setAnticipateItem(null)}
            onDone={() => { setAnticipateItem(null); refresh() }}
          />
        )}
        {editItem && (
          <EditExpenseModal
            installmentId={editItem.installment_id}
            expenseId={editItem.expense_id}
            onClose={() => setEditItem(null)}
            onSaved={() => { setEditItem(null); refresh() }}
          />
        )}
      </div>
    </Modal>
  )
}

function IconBtn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
    </button>
  )
}

/* ─── Anticipate modal ─────────────────────────────────────────────────── */

function AnticipateModal({
  item, onClose, onDone,
}: {
  item: CreditCardBillItem; onClose: () => void; onDone: () => void
}) {
  const now = new Date()
  const [targetMonth, setTargetMonth] = useState(now.getMonth() + 1)
  const [targetYear, setTargetYear] = useState(now.getFullYear())

  const submit = useMutation({
    mutationFn: () => anticipateInstallment(item.installment_id, {
      target_month: targetMonth, target_year: targetYear,
    }),
    onSuccess: onDone,
  })

  return (
    <Modal onClose={onClose} title="Antecipar Parcela">
      <div className="space-y-4">
        <p className="text-sm text-on-surface-variant">
          Mover a parcela <span className="text-on-surface font-medium">{item.installment_number}/{item.installment_count}</span>{' '}
          de <span className="text-on-surface font-medium">{item.description}</span> para outro mês.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mês destino">
            <select
              value={targetMonth}
              onChange={(e) => setTargetMonth(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {PT_MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Ano">
            <input
              type="number"
              value={targetYear}
              onChange={(e) => setTargetYear(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
          >
            Cancelar
          </button>
          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {submit.isPending ? 'Movendo...' : 'Mover Parcela'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Edit expense modal ───────────────────────────────────────────────── */

function EditExpenseModal({
  expenseId, onClose, onSaved,
}: {
  expenseId: number; installmentId: number; onClose: () => void; onSaved: () => void
}) {
  const { data: expenses = [] } = useQuery({
    queryKey: ['cc-expenses'],
    queryFn: () => fetch('/api/credit-cards/expenses').then((r) => r.json()) as Promise<CreditCardExpense[]>,
  })
  const expense = expenses.find((e) => e.id === expenseId)
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories })
  const expenseCategories = categories.filter((c) => c.type === 'expense')

  const [description, setDescription] = useState(expense?.description || '')
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [date, setDate] = useState(expense?.purchase_date || todayIso())
  const [categoryId, setCategoryId] = useState<number | ''>(expense?.category_id || '')

  useEffect(() => {
    if (expense) {
      setDescription(expense.description)
      setAmount(String(expense.amount))
      setDate(expense.purchase_date)
      setCategoryId(expense.category_id || '')
    }
  }, [expense])

  const save = useMutation({
    mutationFn: () => updateCreditCardExpense(expenseId, {
      description: description.trim(),
      amount: Number(amount.replace(',', '.')),
      purchase_date: date,
      category_id: categoryId ? Number(categoryId) : null,
    }),
    onSuccess: onSaved,
  })

  if (!expense) return null

  return (
    <Modal onClose={onClose} title="Editar Gasto">
      <div className="space-y-4">
        <Field label="Descrição">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>
        <Field label="Valor (R$)">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Sem categoria</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Data da compra">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        </div>
        <p className="text-xs text-on-surface-variant">
          Alterar valor ou data regenera as parcelas — antecipações manuais serão perdidas.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
          >
            Cancelar
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {save.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── shared primitives ────────────────────────────────────────────────── */

function Modal({
  title, onClose, children, width = 'md',
}: {
  title: string; onClose: () => void; children: React.ReactNode; width?: 'md' | 'lg'
}) {
  const widthCls = width === 'lg' ? 'max-w-2xl' : 'max-w-md'
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`${widthCls} w-full bg-surface-container border border-outline-variant rounded-xl p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-on-surface-variant block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

/* ─── PDF Import modal ────────────────────────────────────────────────── */

function PdfImportModal({
  cards, categories, onClose, onDone,
}: {
  cards: CreditCard[]
  categories: CategoryType[]
  onClose: () => void
  onDone: () => void
}) {
  const [cardId, setCardId] = useState<number>(cards[0]?.id ?? 0)
  const [file, setFile] = useState<File | null>(null)
  const [items, setItems] = useState<CreditCardImportPreviewItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parse = useMutation({
    mutationFn: () => importCreditCardPdf(cardId, file!),
    onSuccess: (data) => setItems(data.items),
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setError(e?.response?.data?.detail || 'Erro ao processar o PDF')
    },
  })

  const confirm = useMutation({
    mutationFn: () => bulkCreateCreditCardExpenses({
      credit_card_id: cardId,
      items: (items || []).map((it) => ({
        description: it.description,
        amount: Number(it.amount),
        purchase_date: it.purchase_date,
        category_id: it.suggested_category_id ?? null,
        installment_count: 1,
      })),
    }),
    onSuccess: onDone,
  })

  const totalParsed = items?.reduce((acc, i) => acc + Number(i.amount), 0) || 0

  if (items === null) {
    return (
      <Modal onClose={onClose} title="Importar Fatura PDF" width="md">
        <div className="space-y-4">
          <Field label="Cartão">
            <select
              value={cardId}
              onChange={(e) => setCardId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {cards.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Arquivo PDF">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-on-surface-variant file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border file:border-outline-variant file:bg-surface-container-low file:text-on-surface file:hover:bg-surface-container-high file:cursor-pointer"
            />
          </Field>
          <p className="text-xs text-on-surface-variant">
            A fatura será analisada pela IA. Você poderá revisar e ajustar antes de confirmar a importação.
          </p>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            >
              Cancelar
            </button>
            <button
              onClick={() => { setError(null); parse.mutate() }}
              disabled={!file || !cardId || parse.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {parse.isPending ? 'Processando...' : 'Analisar PDF'}
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose} title={`Revisão da Importação (${items.length} itens)`} width="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low border border-outline-variant">
          <p className="text-sm text-on-surface-variant">Total identificado</p>
          <p className="text-lg font-semibold text-on-surface">{fmt(totalParsed)}</p>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-8">
              Nenhuma transação foi identificada no PDF.
            </p>
          )}
          {items.map((it, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low"
            >
              <input
                type="date"
                value={it.purchase_date}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...it, purchase_date: e.target.value }; setItems(next)
                }}
                className="w-36 px-2 py-1 text-xs rounded bg-bg border border-outline-variant text-on-surface"
              />
              <input
                type="text"
                value={it.description}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...it, description: e.target.value }; setItems(next)
                }}
                className="flex-1 px-2 py-1 text-sm rounded bg-bg border border-outline-variant text-on-surface min-w-0"
              />
              <select
                value={it.suggested_category_id ?? ''}
                onChange={(e) => {
                  const next = [...items]
                  next[i] = { ...it, suggested_category_id: e.target.value ? Number(e.target.value) : null }
                  setItems(next)
                }}
                className="w-36 px-2 py-1 text-xs rounded bg-bg border border-outline-variant text-on-surface"
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={it.amount}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...it, amount: Number(e.target.value) }; setItems(next)
                }}
                className="w-24 px-2 py-1 text-sm rounded bg-bg border border-outline-variant text-on-surface text-right"
              />
              <button
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                className="text-on-surface-variant hover:text-error"
                title="Remover"
              >
                <span className="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-between gap-2 pt-2">
          <button
            onClick={() => setItems(null)}
            className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
          >
            Voltar
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            >
              Cancelar
            </button>
            <button
              onClick={() => confirm.mutate()}
              disabled={items.length === 0 || confirm.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {confirm.isPending ? 'Importando...' : `Importar ${items.length} gasto${items.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ─── All expenses (monthly) modal ─────────────────────────────────────── */

function AllExpensesModal({
  items, monthLabel, onClose,
}: {
  items: CreditCardBillItem[]
  monthLabel: string
  onClose: () => void
}) {
  const total = items.filter((i) => !i.is_refunded).reduce((acc, i) => acc + Number(i.amount), 0)
  return (
    <Modal onClose={onClose} title={`Gastos de ${monthLabel}`} width="lg">
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low border border-outline-variant">
          <p className="text-sm text-on-surface-variant">{items.length} lançamento{items.length !== 1 ? 's' : ''}</p>
          <p className="text-lg font-semibold text-on-surface">{fmt(total)}</p>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-8">Sem lançamentos.</p>
          )}
          {items.map((item) => (
            <div
              key={item.installment_id}
              className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: item.card_color + '33' }}
              >
                <span className="material-symbols-outlined text-sm" style={{ color: item.card_color }}>
                  {item.category_icon || 'receipt_long'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`font-medium truncate text-sm ${item.is_refunded ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                    {item.description}
                  </p>
                  {item.is_subscription && (
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary">
                      assinatura
                    </span>
                  )}
                  {item.installment_count > 1 && (
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                      {item.installment_number}/{item.installment_count}
                    </span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant">
                  {new Date(item.purchase_date + 'T00:00:00').toLocaleDateString('pt-BR')} · {item.card_name} · {item.category_name || 'Sem categoria'}
                </p>
              </div>
              <p className={`font-medium whitespace-nowrap text-sm ${item.is_refunded ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                {fmt(Number(item.amount))}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
