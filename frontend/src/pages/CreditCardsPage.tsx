import { useMemo, useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  CreditCardMonthSummary,
  CreditCardDailySpend,
  Category as CategoryType,
} from '../types'

const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const PT_MONTHS_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

const TREEMAP_COLORS = [
  '#a78bfa', '#3b82f6', '#34d399', '#67e8f9',
  '#fbbf24', '#e879f9', '#f87171', '#f97316',
]

const CARD_COLORS = [
  '#a78bfa', '#34d399', '#3b82f6', '#ef4444', '#f59e0b',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#71717a',
]

const ACCENT = '#a78bfa'
const SUCCESS = '#34d399'
const INFO = '#3b82f6'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtShort = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1000) return 'R$ ' + (v / 1000).toFixed(1).replace('.', ',') + 'k'
  return 'R$ ' + v.toFixed(0)
}

const fmtDateBR = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')} ${PT_MONTHS_SHORT[d.getMonth()].toLowerCase()} ${d.getFullYear()}`
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ─────────────────────────────────────────────────────────────────────── */

export default function CreditCardsPage() {
  const qc = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
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
  const { data: byCategory = [] } = useQuery({
    queryKey: ['cc-by-category', year, selectedMonth],
    queryFn: () => getCreditCardByCategory({ year, month: selectedMonth }),
  })
  const { data: dailySpend = [] } = useQuery({
    queryKey: ['cc-daily', year, selectedMonth],
    queryFn: () => getCreditCardDailySpend(year, selectedMonth),
  })
  const { data: monthBill = [] } = useQuery({
    queryKey: ['cc-bill', year, selectedMonth],
    queryFn: () => getCreditCardBill(year, selectedMonth),
  })

  const totalLimit = cards.reduce((acc, c) => acc + Number(c.credit_limit), 0)
  const totalUsed = cards.reduce((acc, c) => acc + Number(c.used_amount), 0)
  const limitPercent = totalLimit > 0 ? Math.min(100, (totalUsed / totalLimit) * 100) : 0

  /* ── modals ── */
  const [cardFormOpen, setCardFormOpen] = useState(false)
  const [cardEdit, setCardEdit] = useState<CreditCard | null>(null)
  const [billOpen, setBillOpen] = useState<{ year: number; month: number } | null>(null)
  const [pdfImportOpen, setPdfImportOpen] = useState(false)
  const [addTxOpen, setAddTxOpen] = useState(false)
  const [monthDetailOpen, setMonthDetailOpen] = useState<CreditCardMonthSummary | null>(null)
  const [txDetailOpen, setTxDetailOpen] = useState<CreditCardBillItem | null>(null)
  const [editExpenseOpen, setEditExpenseOpen] = useState<CreditCardBillItem | null>(null)

  /* ── invalidate helper ── */
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['cc-cards'] })
    qc.invalidateQueries({ queryKey: ['cc-bill-months'] })
    qc.invalidateQueries({ queryKey: ['cc-by-category'] })
    qc.invalidateQueries({ queryKey: ['cc-by-type'] })
    qc.invalidateQueries({ queryKey: ['cc-daily'] })
    qc.invalidateQueries({ queryKey: ['cc-expenses'] })
    qc.invalidateQueries({ queryKey: ['cc-bill'] })
    qc.invalidateQueries({ queryKey: ['expenses-chart'] })
    qc.invalidateQueries({ queryKey: ['top-categories'] })
    qc.invalidateQueries({ queryKey: ['transactions-grouped'] })
    qc.invalidateQueries({ queryKey: ['recent-transactions'] })
    qc.invalidateQueries({ queryKey: ['balance'] })
  }

  /* ── filtros de lançamentos ── */
  const [expenseFilter, setExpenseFilter] = useState<
    'all' | 'one_time' | 'installment' | 'subscription'
  >('all')
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all')

  const billCategories = useMemo(() => {
    const map = new Map<number, { id: number; name: string; icon: string | null }>()
    monthBill.forEach((b) => {
      if (b.category_id && !map.has(b.category_id)) {
        map.set(b.category_id, {
          id: b.category_id,
          name: b.category_name || 'Sem categoria',
          icon: b.category_icon,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [monthBill])

  useEffect(() => {
    if (categoryFilter !== 'all' && !billCategories.some((c) => c.id === categoryFilter)) {
      setCategoryFilter('all')
    }
  }, [billCategories, categoryFilter])

  const filteredBill = useMemo(() => {
    let list = monthBill
    if (expenseFilter === 'subscription') list = list.filter((e) => e.is_subscription)
    else if (expenseFilter === 'installment')
      list = list.filter((e) => !e.is_subscription && e.installment_count > 1)
    else if (expenseFilter === 'one_time')
      list = list.filter((e) => !e.is_subscription && e.installment_count === 1)
    if (categoryFilter !== 'all')
      list = list.filter((e) => e.category_id === categoryFilter)
    return [...list].sort(
      (a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime(),
    )
  }, [monthBill, expenseFilter, categoryFilter])

  const noCards = cards.length === 0
  const activeIdx = selectedMonth - 1

  return (
    <div className="space-y-6">
      {/* Topbar */}
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Cartão de Crédito</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Gerencie cartões, faturas, parcelas e assinaturas
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 border border-outline-variant rounded-lg px-1">
            <button
              onClick={() => setYear(year - 1)}
              className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-surface-container-high"
              aria-label="Ano anterior"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_left</span>
            </button>
            <span className="text-on-surface font-medium px-2 tabular-nums">{year}</span>
            <button
              onClick={() => setYear(year + 1)}
              className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-surface-container-high"
              aria-label="Próximo ano"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
            </button>
          </div>
          <button
            onClick={() => setPdfImportOpen(true)}
            disabled={noCards}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
            title={noCards ? 'Cadastre um cartão primeiro' : ''}
          >
            <span className="material-symbols-outlined text-base">description</span>
            Importar Fatura
          </button>
          <button
            onClick={() => setAddTxOpen(true)}
            disabled={noCards}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Lançar Gasto
          </button>
        </div>
      </header>

      {/* Resumo Mensal */}
      <section className="bg-surface-container border border-outline-variant rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-on-surface">Resumo Mensal</h2>
          <div className="text-xs text-on-surface-variant">Clique para filtrar · Duplo clique para detalhes</div>
        </div>
        <MonthStrip
          data={monthSummaries}
          activeIdx={activeIdx}
          onSelect={(i) => setSelectedMonth(i + 1)}
          onOpen={(i) => {
            setSelectedMonth(i + 1)
            setMonthDetailOpen(monthSummaries[i] || null)
          }}
        />
      </section>

      {/* Cartões + Heatmap */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="xl:col-span-3 bg-surface-container border border-outline-variant rounded-xl p-5">
          <header className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-on-surface">Meus Cartões</h2>
            <button
              onClick={() => { setCardEdit(null); setCardFormOpen(true) }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Novo Cartão
            </button>
          </header>
          <div className="space-y-2.5">
            {cards.length === 0 && (
              <p className="text-sm text-on-surface-variant text-center py-8">
                Nenhum cartão cadastrado.
              </p>
            )}
            {cards.map((c) => {
              const used = Number(c.used_amount)
              const limit = Number(c.credit_limit)
              const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
              return (
                <div
                  key={c.id}
                  className="grid items-center gap-3 p-3.5 rounded-xl border border-outline-variant bg-surface-container-low"
                  style={{ gridTemplateColumns: 'auto 1fr auto' }}
                >
                  <div
                    className="w-9 h-9 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: c.color }}
                  >
                    <span className="material-symbols-outlined text-sm text-white">credit_card</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
                      <div className="text-sm font-semibold text-on-surface truncate">{c.name}</div>
                      <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                        {c.brand || '—'} · Fechamento dia {c.closing_day}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: c.color }}
                        />
                      </div>
                      <div className="text-[10px] text-on-surface-variant tabular-nums whitespace-nowrap">
                        {fmt(used)} / {fmt(limit)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setCardEdit(c); setCardFormOpen(true) }}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high"
                    aria-label="Editar cartão"
                  >
                    <span className="material-symbols-outlined text-base">edit</span>
                  </button>
                </div>
              )
            })}
          </div>

          {cards.length > 0 && (
            <div
              className="mt-4 p-4 rounded-xl border"
              style={{
                background: `linear-gradient(135deg, ${ACCENT}1f, transparent)`,
                borderColor: `${ACCENT}38`,
              }}
            >
              <div className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5">
                Limite total consolidado
              </div>
              <div className="flex items-baseline gap-2.5 mb-2 flex-wrap">
                <div className="text-2xl font-semibold tabular-nums tracking-tight text-on-surface">
                  {fmt(totalLimit)}
                </div>
                <div className="text-xs text-on-surface-variant">
                  utilizado:{' '}
                  <span className="text-primary tabular-nums">{fmt(totalUsed)}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${limitPercent}%` }} />
              </div>
              <div className="text-[10px] text-on-surface-variant tabular-nums mt-1.5">
                {Math.round(limitPercent)}% utilizado · {fmt(totalLimit - totalUsed)} disponível
              </div>
            </div>
          )}
        </section>

        <section className="xl:col-span-2 bg-surface-container border border-outline-variant rounded-xl p-5">
          <SpendHeatmap days={dailySpend} year={year} month={selectedMonth} />
        </section>
      </div>

      {/* Lançamentos */}
      <section className="bg-surface-container border border-outline-variant rounded-xl p-4 sm:p-5">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Lançamentos</h2>
            <div className="text-xs text-on-surface-variant mt-0.5">
              Fatura de {PT_MONTHS[selectedMonth - 1]} {year}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <CategoryFilterButton
              categories={billCategories}
              value={categoryFilter}
              onChange={setCategoryFilter}
            />
          </div>
        </header>

        <div className="grid items-center gap-3 px-2 sm:px-3 pb-2 border-b border-outline-variant text-[10px] uppercase tracking-wider text-on-surface-variant grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_1fr_110px_160px]">
          <div />
          <div>Lançamento</div>
          <div className="text-right hidden sm:block">Data</div>
          <div className="text-right sm:pr-7">Valor</div>
        </div>

        <div>
          {filteredBill.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-8">
              Nenhum lançamento nesta fatura.
            </p>
          )}
          {filteredBill.map((item) => {
            const isSub = item.is_subscription
            const isInstallment = !isSub && item.installment_count > 1
            const tipoLabel = isSub ? 'Assinatura' : isInstallment ? 'Parcelado' : 'Avulso'
            return (
              <div
                key={item.installment_id}
                onClick={() => setTxDetailOpen(item)}
                className="grid items-center gap-3 px-2 sm:px-3 py-3 border-b border-outline-variant last:border-b-0 cursor-pointer hover:bg-surface-container-low transition-colors grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_1fr_110px_auto]"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${item.card_color}26` }}
                >
                  <span
                    className="material-symbols-outlined text-sm"
                    style={{ color: item.card_color }}
                  >
                    {item.category_icon || (isSub ? 'autorenew' : isInstallment ? 'splitscreen' : 'receipt_long')}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium truncate ${item.is_refunded ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                      {item.description}
                    </span>
                    {isInstallment && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary whitespace-nowrap">
                        {item.installment_number}/{item.installment_count}
                      </span>
                    )}
                    {isSub && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary">
                        assinatura
                      </span>
                    )}
                    {item.is_anticipated && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        antecipada
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-on-surface-variant mt-0.5 truncate">
                    {item.card_name} · {item.category_name || 'Sem categoria'} · {tipoLabel}
                  </div>
                </div>
                <div className="hidden sm:block text-[11px] uppercase tracking-wider text-on-surface-variant text-right tabular-nums">
                  {fmtDateBR(item.purchase_date)}
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <span className={`text-sm font-medium tabular-nums whitespace-nowrap ${item.is_refunded ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                    −{fmt(Number(item.amount))}
                    {isSub ? '/mês' : ''}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const msg = isSub
                        ? 'Remover esta assinatura? Todas as parcelas futuras serão excluídas.'
                        : 'Remover este lançamento?'
                      if (confirm(msg))
                        deleteCreditCardExpense(item.expense_id).then(invalidateAll)
                    }}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-surface-container-high"
                    title="Remover"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Charts (stacked) */}
      <div className="space-y-6">
        <section className="bg-surface-container border border-outline-variant rounded-xl p-5">
          <StackedBarsChart data={monthSummaries} />
        </section>
        <section className="bg-surface-container border border-outline-variant rounded-xl p-5">
          <TreemapChart
            data={byCategory}
            label={`${PT_MONTHS_SHORT[selectedMonth - 1]} ${year}`}
          />
        </section>
      </div>

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
      {addTxOpen && (
        <AddTxModal
          cards={cards}
          categories={expenseCategories}
          onClose={() => setAddTxOpen(false)}
          onCreated={() => { setAddTxOpen(false); invalidateAll() }}
        />
      )}
      {monthDetailOpen && (
        <MonthDetailModal
          summary={monthDetailOpen}
          summaries={monthSummaries}
          year={year}
          onClose={() => setMonthDetailOpen(null)}
          onNavigate={(s) => {
            setMonthDetailOpen(s)
            setSelectedMonth(s.bill_month)
          }}
          onTxClick={(t) => { setMonthDetailOpen(null); setTxDetailOpen(t) }}
          onEditBill={() => {
            setBillOpen({ year, month: monthDetailOpen.bill_month })
            setMonthDetailOpen(null)
          }}
        />
      )}
      {txDetailOpen && (
        <LancamentoDetailModal
          item={txDetailOpen}
          onClose={() => setTxDetailOpen(null)}
          onEdit={() => { setEditExpenseOpen(txDetailOpen); setTxDetailOpen(null) }}
          onDelete={() => {
            const isSub = txDetailOpen.is_subscription
            const msg = isSub
              ? 'Remover esta assinatura? Todas as parcelas futuras serão excluídas.'
              : 'Remover este lançamento?'
            if (confirm(msg))
              deleteCreditCardExpense(txDetailOpen.expense_id).then(() => {
                setTxDetailOpen(null)
                invalidateAll()
              })
          }}
        />
      )}
      {editExpenseOpen && (
        <EditExpenseModal
          installmentId={editExpenseOpen.installment_id}
          expenseId={editExpenseOpen.expense_id}
          onClose={() => setEditExpenseOpen(null)}
          onSaved={() => { setEditExpenseOpen(null); invalidateAll() }}
        />
      )}
    </div>
  )
}

/* ─── MonthStrip — cards de meses com linha SVG sobreposta ─────────────── */

function MonthStrip({
  data,
  activeIdx,
  onSelect,
  onOpen,
}: {
  data: CreditCardMonthSummary[]
  activeIdx: number
  onSelect: (i: number) => void
  onOpen: (i: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasOverflowPrev, setHasOverflowPrev] = useState(false)
  const [hasOverflowNext, setHasOverflowNext] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragState = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null)

  const canPrev = activeIdx > 0
  const canNext = activeIdx >= 0 && activeIdx < data.length - 1

  const updateBounds = () => {
    const el = scrollRef.current
    if (!el) return
    setHasOverflowPrev(el.scrollLeft > 2)
    setHasOverflowNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateBounds()
    el.addEventListener('scroll', updateBounds, { passive: true })
    window.addEventListener('resize', updateBounds)
    return () => {
      el.removeEventListener('scroll', updateBounds)
      window.removeEventListener('resize', updateBounds)
    }
  }, [data.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || activeIdx < 0) return
    const cardEl = el.querySelector<HTMLElement>(`[data-month-card="${activeIdx}"]`)
    if (!cardEl) return
    const cardLeft = cardEl.offsetLeft
    const cardRight = cardLeft + cardEl.offsetWidth
    const viewLeft = el.scrollLeft
    const viewRight = viewLeft + el.clientWidth
    if (cardLeft < viewLeft || cardRight > viewRight) {
      el.scrollTo({
        left: cardLeft - (el.clientWidth - cardEl.offsetWidth) / 2,
        behavior: 'smooth',
      })
    }
  }, [activeIdx])

  const goToMonth = (dir: -1 | 1) => {
    const next = activeIdx + dir
    if (next < 0 || next >= data.length) return
    onSelect(next)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    dragState.current = { startX: e.clientX, startScroll: el.scrollLeft, moved: false }
    el.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragState.current
    const el = scrollRef.current
    if (!st || !el) return
    const dx = e.clientX - st.startX
    if (!st.moved && Math.abs(dx) > 4) {
      st.moved = true
      setIsDragging(true)
    }
    if (st.moved) {
      el.scrollLeft = st.startScroll - dx
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragState.current
    const el = scrollRef.current
    if (st && el && el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId)
    }
    dragState.current = null
    if (isDragging) {
      requestAnimationFrame(() => setIsDragging(false))
    }
  }

  if (data.length === 0) {
    return <p className="text-sm text-on-surface-variant text-center py-8">Sem dados.</p>
  }
  const cardW = 140
  const cardH = 130
  const gap = 12
  const totalW = data.length * (cardW + gap) - gap

  const max = Math.max(...data.map((d) => Number(d.total)), 1)
  const lineYTop = 18
  const lineYBottom = 70
  const yAt = (v: number) => lineYTop + (1 - v / max) * (lineYBottom - lineYTop)
  const xAt = (i: number) => i * (cardW + gap) + cardW / 2

  const points = data.map((d, i) => ({ x: xAt(i), y: yAt(Number(d.total)) }))
  const linePath = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`
    const prev = points[i - 1]
    const cx1 = prev.x + (p.x - prev.x) / 2
    const cy1 = prev.y
    const cx2 = prev.x + (p.x - prev.x) / 2
    const cy2 = p.y
    return acc + ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p.x} ${p.y}`
  }, '')
  const lastP = points[points.length - 1]
  const firstP = points[0]
  const areaPath = `${linePath} L ${lastP.x} ${cardH - 8} L ${firstP.x} ${cardH - 8} Z`

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => goToMonth(-1)}
        disabled={!canPrev}
        aria-label="Mês anterior"
        className={`absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full border border-outline-variant bg-surface-container/95 backdrop-blur text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface flex items-center justify-center transition-all ${
          canPrev ? 'opacity-100' : 'opacity-30 pointer-events-none'
        }`}
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
      >
        <span className="material-symbols-outlined text-lg">chevron_left</span>
      </button>
      <button
        type="button"
        onClick={() => goToMonth(1)}
        disabled={!canNext}
        aria-label="Próximo mês"
        className={`absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full border border-outline-variant bg-surface-container/95 backdrop-blur text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface flex items-center justify-center transition-all ${
          canNext ? 'opacity-100' : 'opacity-30 pointer-events-none'
        }`}
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
      >
        <span className="material-symbols-outlined text-lg">chevron_right</span>
      </button>
      {hasOverflowPrev && (
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, var(--color-surface-container, #18181b), transparent)' }}
        />
      )}
      {hasOverflowNext && (
        <div
          aria-hidden
          className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to left, var(--color-surface-container, #18181b), transparent)' }}
        />
      )}
      <div
        ref={scrollRef}
        className="relative overflow-x-auto cc-carousel select-none"
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (isDragging) {
            e.stopPropagation()
            e.preventDefault()
          }
        }}
      >
      <div className="relative" style={{ width: totalW, height: cardH }}>
        <svg
          width={totalW}
          height={cardH}
          className="absolute top-0 left-0 pointer-events-none"
          style={{ zIndex: 2 }}
        >
          <defs>
            <linearGradient id="ms-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#ms-area)" />
          <path
            d={linePath}
            stroke={ACCENT}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={i === activeIdx ? 6 : 4}
                fill={i === activeIdx ? ACCENT : '#0c0c0f'}
                stroke={ACCENT}
                strokeWidth="2"
              />
              {i === activeIdx && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="6"
                  fill="none"
                  stroke={ACCENT}
                  strokeOpacity="0.3"
                  strokeWidth="6"
                />
              )}
            </g>
          ))}
        </svg>

        <div className="flex relative" style={{ gap, zIndex: 1 }}>
          {data.map((d, i) => {
            const isActive = i === activeIdx
            return (
              <button
                key={i}
                data-month-card={i}
                onClick={() => onSelect(i)}
                onDoubleClick={() => onOpen(i)}
                className={`flex-shrink-0 rounded-xl px-3.5 py-3 flex flex-col justify-between text-left transition-all ${
                  isActive
                    ? 'border border-primary bg-primary/10'
                    : 'border border-outline-variant bg-surface-container-low hover:border-primary/40'
                }`}
                style={{
                  width: cardW,
                  height: cardH,
                  boxShadow: isActive ? `0 6px 20px ${ACCENT}40` : 'none',
                }}
              >
                <div
                  className={`text-xs font-semibold tracking-wide ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}
                >
                  {PT_MONTHS_SHORT[d.bill_month - 1]}
                </div>
                <div style={{ height: 30 }} />
                <div>
                  <div
                    className={`text-[15px] font-semibold tabular-nums tracking-tight ${
                      isActive ? 'text-on-surface' : 'text-on-surface'
                    }`}
                  >
                    {fmt(Number(d.total))}
                  </div>
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mt-1 tabular-nums">
                    {d.item_count} {d.item_count === 1 ? 'item' : 'itens'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      </div>
    </div>
  )
}

/* ─── SpendHeatmap — gastos por dia do mês ─────────────────────────────── */

function SpendHeatmap({
  days,
  year,
  month,
}: {
  days: CreditCardDailySpend[]
  year: number
  month: number
}) {
  const max = Math.max(...days.map((d) => Number(d.total)), 1)
  const cols = 10
  const rows = Math.max(1, Math.ceil(days.length / cols))
  const cell = 28
  const gap = 4
  const W = cols * cell + (cols - 1) * gap
  const H = rows * cell + (rows - 1) * gap

  const colorAt = (v: number) => {
    if (v <= 0) return '#1e1e22'
    const t = v / max
    return `color-mix(in oklch, ${ACCENT} ${Math.round(20 + t * 80)}%, #18181b)`
  }

  const [hover, setHover] = useState<CreditCardDailySpend | null>(null)
  const totalMonth = days.reduce((acc, d) => acc + Number(d.total), 0)

  return (
    <div>
      <div className="flex justify-between items-start mb-4 gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-on-surface">
            Gastos por dia · {PT_MONTHS_SHORT[month - 1]} {year}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant whitespace-nowrap">
          <span>Menos</span>
          {[0.1, 0.3, 0.5, 0.7, 1].map((t) => (
            <span
              key={t}
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: `color-mix(in oklch, ${ACCENT} ${Math.round(20 + t * 80)}%, #18181b)` }}
            />
          ))}
          <span>Mais</span>
        </div>
      </div>

      <div className="relative mx-auto" style={{ width: W }}>
        {days.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-8">Sem dados para este mês.</p>
        ) : (
          <svg width={W} height={H} className="block">
            {days.map((d, i) => {
              const c = i % cols
              const r = Math.floor(i / cols)
              const x = c * (cell + gap)
              const y = r * (cell + gap)
              const v = Number(d.total)
              return (
                <g
                  key={i}
                  onMouseEnter={() => setHover(d)}
                  onMouseLeave={() => setHover(null)}
                >
                  <rect
                    x={x}
                    y={y}
                    width={cell}
                    height={cell}
                    rx="4"
                    fill={colorAt(v)}
                    stroke={hover === d ? ACCENT : 'transparent'}
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer', transition: 'stroke 120ms' }}
                  />
                  <text
                    x={x + cell / 2}
                    y={y + cell / 2 + 3}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill={v > max * 0.6 ? 'white' : '#a1a1aa'}
                    style={{ pointerEvents: 'none', fontFamily: 'ui-monospace, monospace' }}
                  >
                    {d.day}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
        {hover && (
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full bg-surface-container-high border border-outline-variant rounded-lg px-3 py-1.5 text-xs whitespace-nowrap pointer-events-none"
            style={{ boxShadow: '0 6px 18px rgba(0,0,0,0.4)' }}
          >
            <span className="text-on-surface-variant">Dia {hover.day}</span>
            <span className="ml-2 font-semibold tabular-nums">{fmt(Number(hover.total))}</span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-outline-variant flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">Total no mês</div>
        <div className="text-sm font-semibold tabular-nums text-on-surface">{fmt(totalMonth)}</div>
      </div>
    </div>
  )
}

/* ─── StackedBarsChart — composição mensal (12 meses) ──────────────────── */

function StackedBarsChart({ data }: { data: CreditCardMonthSummary[] }) {
  const series = data.map((d) => ({
    mes: PT_MONTHS_SHORT[d.bill_month - 1],
    assinaturas: Number(d.subscription_total),
    parcelados: Number(d.installment_total),
    avulsos: Number(d.one_time_total),
  }))
  const max = Math.max(
    ...series.map((d) => d.assinaturas + d.parcelados + d.avulsos),
    1,
  )
  const W = 700
  const H = 220
  const padL = 36
  const padR = 8
  const padT = 10
  const padB = 22
  const iW = W - padL - padR
  const iH = H - padT - padB
  const groupW = iW / Math.max(series.length, 1)
  const barW = Math.min(28, groupW * 0.6)
  const colors = { assinaturas: SUCCESS, parcelados: ACCENT, avulsos: INFO }
  const [hover, setHover] = useState<{ d: typeof series[number]; total: number; x: number } | null>(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">Composição mensal</h3>
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mt-1">
            Assinaturas + Parcelados + Avulsos
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
          <Legend dot={colors.assinaturas} label="Assinaturas" />
          <Legend dot={colors.parcelados} label="Parcelados" />
          <Legend dot={colors.avulsos} label="Avulsos" />
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
          {[0, 0.5, 1].map((p, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={padT + iH * (1 - p)}
                y2={padT + iH * (1 - p)}
                stroke="#27272a"
                strokeDasharray="2 4"
              />
              <text
                x={padL - 6}
                y={padT + iH * (1 - p) + 3}
                fontSize="9"
                fill="#52525b"
                textAnchor="end"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              >
                {fmtShort(max * p)}
              </text>
            </g>
          ))}
          {series.map((d, i) => {
            const total = d.assinaturas + d.parcelados + d.avulsos
            const x = padL + groupW * i + (groupW - barW) / 2
            const segs = [
              { k: 'assinaturas', v: d.assinaturas, c: colors.assinaturas },
              { k: 'parcelados', v: d.parcelados, c: colors.parcelados },
              { k: 'avulsos', v: d.avulsos, c: colors.avulsos },
            ]
            let acc = 0
            return (
              <g
                key={i}
                onMouseEnter={() => setHover({ d, total, x: x + barW / 2 })}
                onMouseLeave={() => setHover(null)}
              >
                {segs.map((s, j) => {
                  const h = (s.v / max) * iH
                  const y = padT + iH - acc - h
                  acc += h
                  return (
                    <rect
                      key={j}
                      x={x}
                      y={y}
                      width={barW}
                      height={Math.max(0, h)}
                      fill={s.c}
                      style={{
                        opacity: hover && hover.d !== d ? 0.4 : 1,
                        transition: 'opacity 140ms',
                      }}
                    />
                  )
                })}
                <text
                  x={x + barW / 2}
                  y={H - 6}
                  fontSize="9.5"
                  textAnchor="middle"
                  fill="#a1a1aa"
                  style={{ fontFamily: 'ui-monospace, monospace' }}
                >
                  {d.mes}
                </text>
              </g>
            )
          })}
        </svg>
        {hover && (
          <div
            className="absolute bg-surface-container-high border border-outline-variant rounded-lg p-2.5 text-[11px] pointer-events-none whitespace-nowrap"
            style={{
              left: `${(hover.x / W) * 100}%`,
              top: 0,
              transform: 'translate(-50%, -100%)',
              boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
            }}
          >
            <div className="font-semibold mb-1 text-on-surface">
              {hover.d.mes} · {fmt(hover.total)}
            </div>
            <div className="grid gap-x-3 text-[10px]" style={{ gridTemplateColumns: 'auto auto' }}>
              <span style={{ color: colors.assinaturas }}>Assinaturas</span>
              <span className="tabular-nums text-right">{fmt(hover.d.assinaturas)}</span>
              <span style={{ color: colors.parcelados }}>Parcelados</span>
              <span className="tabular-nums text-right">{fmt(hover.d.parcelados)}</span>
              <span style={{ color: colors.avulsos }}>Avulsos</span>
              <span className="tabular-nums text-right">{fmt(hover.d.avulsos)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  )
}

/* ─── TreemapChart — gastos por categoria ──────────────────────────────── */

function TreemapChart({
  data,
  label,
}: {
  data: { category_name: string; category_icon: string | null; total: number }[]
  label: string
}) {
  const sorted = [...data].sort((a, b) => Number(b.total) - Number(a.total))
  const total = sorted.reduce((acc, c) => acc + Number(c.total), 0)
  const W = 700
  const H = 220

  let x = 0
  const rects = sorted.map((c, i) => {
    const w = total > 0 ? (Number(c.total) / total) * W : 0
    const r = {
      ...c,
      x,
      y: 0,
      w,
      h: H,
      cor: TREEMAP_COLORS[i % TREEMAP_COLORS.length],
      total: Number(c.total),
    }
    x += w
    return r
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">Categorias · {label}</h3>
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mt-1">
            Tamanho proporcional ao gasto
          </div>
        </div>
        <span className="text-xs text-on-surface-variant tabular-nums">{fmt(total)}</span>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-on-surface-variant text-center py-12">Sem dados.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block rounded-lg">
          {rects.map((r, i) => {
            const pct = total > 0 ? Math.round((r.total / total) * 100) : 0
            return (
              <g key={i}>
                <rect
                  x={r.x + 2}
                  y={r.y + 2}
                  width={Math.max(0, r.w - 4)}
                  height={r.h - 4}
                  rx="6"
                  fill={r.cor}
                  fillOpacity="0.18"
                  stroke={r.cor}
                  strokeOpacity="0.4"
                  strokeWidth="1"
                />
                {r.w > 70 && (
                  <>
                    <text x={r.x + 12} y={r.y + 24} fontSize="11" fontWeight="600" fill="#fafafa">
                      {r.category_name}
                    </text>
                    <text
                      x={r.x + 12}
                      y={r.y + 42}
                      fontSize="11"
                      fill={r.cor}
                      style={{ fontFamily: 'ui-monospace, monospace' }}
                    >
                      {fmt(r.total)}
                    </text>
                    <text
                      x={r.x + 12}
                      y={r.y + 58}
                      fontSize="9"
                      fill="#a1a1aa"
                      style={{ fontFamily: 'ui-monospace, monospace' }}
                    >
                      {pct}%
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

/* ─── AddTxModal — Lançar Gasto (substitui o form lateral) ─────────────── */

function AddTxModal({
  cards,
  categories,
  onClose,
  onCreated,
}: {
  cards: CreditCard[]
  categories: { id: number; name: string; icon: string | null }[]
  onClose: () => void
  onCreated: () => void
}) {
  const [cardId, setCardId] = useState<number | ''>(cards[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [categoryId, setCategoryId] = useState<number | ''>(categories[0]?.id ?? '')
  const [parcelado, setParcelado] = useState(false)
  const [installments, setInstallments] = useState(2)
  const [isSubscription, setIsSubscription] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useMutation({
    mutationFn: createCreditCardExpense,
    onSuccess: onCreated,
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
      installment_count: parcelado ? Math.max(2, installments) : 1,
      is_subscription: isSubscription,
    })
  }

  return (
    <Modal onClose={onClose} title="Lançar Gasto">
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

        <Field label="Descrição">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Supermercado BH"
            className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="R$ 0,00"
              inputMode="decimal"
              className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
          <Field label="Data">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        </div>

        <Field label="Categoria">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <ToggleRow
          icon="event_repeat"
          label="Parcelado?"
          value={parcelado}
          onChange={(v) => { setParcelado(v); if (v) setIsSubscription(false) }}
          disabled={isSubscription}
        />
        {parcelado && (
          <Field label="Número de Parcelas">
            <input
              type="number"
              min={2}
              value={installments}
              onChange={(e) => setInstallments(Number(e.target.value) || 2)}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        )}

        <ToggleRow
          icon="autorenew"
          label="Assinatura?"
          value={isSubscription}
          onChange={(v) => { setIsSubscription(v); if (v) { setParcelado(false); setInstallments(2) } }}
          disabled={parcelado}
        />

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submit.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            {submit.isPending ? 'Adicionando...' : 'Adicionar Gasto'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── MonthDetailModal — gastos do mês ─────────────────────────────────── */

function MonthDetailModal({
  summary,
  summaries,
  year,
  onClose,
  onNavigate,
  onTxClick,
  onEditBill,
}: {
  summary: CreditCardMonthSummary
  summaries: CreditCardMonthSummary[]
  year: number
  onClose: () => void
  onNavigate: (s: CreditCardMonthSummary) => void
  onTxClick: (item: CreditCardBillItem) => void
  onEditBill: () => void
}) {
  const { data: items = [] } = useQuery({
    queryKey: ['cc-bill', year, summary.bill_month],
    queryFn: () => getCreditCardBill(year, summary.bill_month),
  })
  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime()),
    [items],
  )
  const total = items.filter((i) => !i.is_refunded).reduce((acc, i) => acc + Number(i.amount), 0)

  const idx = summaries.findIndex(
    (s) => s.bill_month === summary.bill_month && s.bill_year === summary.bill_year,
  )
  const idxRef = useRef(idx)
  useEffect(() => { idxRef.current = idx }, [idx])
  const intervalRef = useRef<number | null>(null)
  const canPrev = idx > 0
  const canNext = idx >= 0 && idx < summaries.length - 1

  const stopHold = () => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }
  const stepOnce = (dir: -1 | 1) => {
    const next = idxRef.current + dir
    if (next < 0 || next >= summaries.length) return false
    idxRef.current = next
    onNavigate(summaries[next])
    return true
  }
  const startHold = (dir: -1 | 1) => {
    if (!stepOnce(dir)) return
    intervalRef.current = window.setInterval(() => {
      if (!stepOnce(dir)) stopHold()
    }, 280)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') stepOnce(-1)
      else if (e.key === 'ArrowRight') stepOnce(1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stopHold()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const navBtn = (dir: -1 | 1, disabled: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={() => startHold(dir)}
      onMouseUp={stopHold}
      onMouseLeave={stopHold}
      onTouchStart={(e) => { e.preventDefault(); startHold(dir) }}
      onTouchEnd={stopHold}
      onTouchCancel={stopHold}
      aria-label={dir === -1 ? 'Mês anterior' : 'Próximo mês'}
      className="w-9 h-9 rounded-lg flex items-center justify-center border border-outline-variant bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed select-none"
      title="Clique ou segure para navegar"
    >
      <span className="material-symbols-outlined text-base">
        {dir === -1 ? 'chevron_left' : 'chevron_right'}
      </span>
    </button>
  )

  /* ── Drag horizontal: click + segurar + arrastar para navegar meses ── */
  const DRAG_THRESHOLD = 80
  const DRAG_ACTIVATE = 8
  const dragState = useRef<{ startX: number; startY: number; active: boolean; pointerId: number } | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const isInteractive = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    return !!target.closest('button, a, input, select, textarea, [data-no-drag]')
  }

  const onPanelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (isInteractive(e.target)) return
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      pointerId: e.pointerId,
    }
  }

  const onPanelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragState.current
    if (!ds || ds.pointerId !== e.pointerId) return
    const dx = e.clientX - ds.startX
    const dy = e.clientY - ds.startY
    if (!ds.active) {
      if (Math.abs(dx) < DRAG_ACTIVATE && Math.abs(dy) < DRAG_ACTIVATE) return
      if (Math.abs(dx) <= Math.abs(dy)) {
        dragState.current = null
        return
      }
      ds.active = true
      setIsDragging(true)
      try {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
      } catch { /* ignore */ }
    }
    const limited =
      (dx > 0 && !canPrev) || (dx < 0 && !canNext) ? dx * 0.25 : dx
    setDragOffset(limited)
  }

  const onPanelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragState.current
    if (!ds || ds.pointerId !== e.pointerId) return
    const dx = e.clientX - ds.startX
    const wasActive = ds.active
    dragState.current = null
    setDragOffset(0)
    setIsDragging(false)
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
    } catch { /* ignore */ }
    if (!wasActive) return
    if (Math.abs(dx) >= DRAG_THRESHOLD) {
      if (dx > 0 && canPrev) stepOnce(-1)
      else if (dx < 0 && canNext) stepOnce(1)
    }
  }

  const dragHint =
    Math.abs(dragOffset) >= DRAG_THRESHOLD
      ? dragOffset > 0
        ? `← ${PT_MONTHS_SHORT[(summary.bill_month - 2 + 12) % 12]}`
        : `${PT_MONTHS_SHORT[summary.bill_month % 12]} →`
      : null

  return (
    <Modal
      onClose={onClose}
      width="xl"
      title={`Gastos de ${PT_MONTHS[summary.bill_month - 1]} ${year}`}
      panelClassName={`select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      panelStyle={{
        transform: `translateX(${dragOffset}px)`,
        transition: isDragging ? 'none' : 'transform 0.22s ease-out',
        touchAction: 'pan-y',
      }}
      onPanelPointerDown={onPanelPointerDown}
      onPanelPointerMove={onPanelPointerMove}
      onPanelPointerUp={onPanelPointerUp}
    >
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-base">calendar_today</span>
          <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
            {PT_MONTHS[summary.bill_month - 1]} {year}
          </span>
        </div>
        <div className="flex items-center gap-2" data-no-drag>
          {navBtn(-1, !canPrev)}
          <span className="text-[10px] uppercase tracking-wider text-on-surface-variant tabular-nums">
            {idx + 1} / {summaries.length}
          </span>
          {navBtn(1, !canNext)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="text-xs text-on-surface-variant">
          {items.length} {items.length === 1 ? 'lançamento' : 'lançamentos'} · total{' '}
          <span className="font-semibold text-on-surface tabular-nums">{fmt(total)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-on-surface-variant">
          <span className="material-symbols-outlined text-sm">swipe</span>
          <span className="hidden sm:inline">Arraste para navegar</span>
          <span className="sm:hidden">Arraste</span>
          {dragHint && (
            <span className="text-primary font-semibold ml-1 normal-case tracking-normal">
              {dragHint}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 px-2 sm:px-3 pb-2 border-b border-outline-variant text-[10px] uppercase tracking-wider text-on-surface-variant grid-cols-[1fr_auto] sm:grid-cols-[1fr_110px_110px]">
        <div>Lançamento</div>
        <div className="text-right hidden sm:block">Data</div>
        <div className="text-right">Valor</div>
      </div>

      <div className="max-h-[50vh] sm:max-h-[420px] overflow-y-auto mb-4">
        {sorted.length === 0 && (
          <p className="text-sm text-on-surface-variant text-center py-8">
            Sem lançamentos neste mês.
          </p>
        )}
        {sorted.map((tx) => (
          <div
            key={tx.installment_id}
            data-no-drag
            onClick={() => onTxClick(tx)}
            className="grid gap-3 items-center px-2 sm:px-3 py-2.5 rounded-md cursor-pointer border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low transition-colors grid-cols-[1fr_auto] sm:grid-cols-[1fr_110px_110px]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${tx.card_color}26` }}
              >
                <span
                  className="material-symbols-outlined text-xs"
                  style={{ color: tx.card_color }}
                >
                  {tx.category_icon || 'receipt_long'}
                </span>
              </div>
              <div className="min-w-0">
                <div className={`text-sm font-medium truncate ${tx.is_refunded ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                  {tx.description}
                </div>
                <div className="text-xs text-on-surface-variant truncate">
                  {tx.category_name || 'Sem categoria'} · {tx.card_name}
                </div>
              </div>
            </div>
            <div className="hidden sm:block text-[11px] uppercase tracking-wider text-on-surface-variant text-right tabular-nums">
              {fmtDateBR(tx.purchase_date)}
            </div>
            <div className={`text-sm font-medium text-right tabular-nums whitespace-nowrap ${tx.is_refunded ? 'line-through text-on-surface-variant' : 'text-error'}`}>
              −{fmt(Number(tx.amount))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-container-low border border-outline-variant mb-4">
        <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Total do mês</span>
        <span className="text-lg font-semibold text-error tabular-nums">−{fmt(total)}</span>
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end" data-no-drag>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
        >
          Fechar
        </button>
        <button
          onClick={onEditBill}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-base">edit</span>
          Editar fatura
        </button>
      </div>
    </Modal>
  )
}

/* ─── LancamentoDetailModal — detalhe de um lançamento ─────────────────── */

function LancamentoDetailModal({
  item,
  onClose,
  onEdit,
  onDelete,
}: {
  item: CreditCardBillItem
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isSub = item.is_subscription
  const isInstallment = !isSub && item.installment_count > 1
  const tipo = isSub ? 'Assinatura' : isInstallment ? 'Parcelado' : 'Avulso'
  const icon = item.category_icon || (isSub ? 'autorenew' : isInstallment ? 'splitscreen' : 'receipt_long')

  return (
    <Modal onClose={onClose} title={item.description}>
      <div className="-mt-2 mb-4 flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${ACCENT}24`, color: ACCENT }}
        >
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div className="text-xs text-on-surface-variant min-w-0">
          {item.card_name} · {item.category_name || 'Sem categoria'} · {tipo}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant mb-4">
        <div className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5">
          Valor
        </div>
        <div className="text-3xl font-semibold tabular-nums tracking-tight text-primary">
          −{fmt(Number(item.amount))}{isSub ? '/mês' : ''}
        </div>
        {isInstallment && (
          <div className="mt-2 text-xs text-on-surface-variant">
            Parcela{' '}
            <span className="text-info tabular-nums">
              {item.installment_number}/{item.installment_count}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <DetailField label="Data da compra" value={fmtDateBR(item.purchase_date)} icon="calendar_today" />
        <DetailField label="Cartão" value={item.card_name} icon="credit_card" />
        <DetailField label="Categoria" value={item.category_name || 'Sem categoria'} icon="sell" />
        <DetailField label="Tipo" value={tipo} icon="description" />
      </div>

      {item.is_anticipated && (
        <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/30 text-xs text-primary">
          Esta parcela foi <strong>antecipada</strong> manualmente.
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onDelete}
          className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:text-error hover:border-error/50 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base">delete</span>
          Excluir
        </button>
        <button
          onClick={onEdit}
          className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base">edit</span>
          Editar
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90"
        >
          Fechar
        </button>
      </div>
    </Modal>
  )
}

function DetailField({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="material-symbols-outlined text-xs text-on-surface-variant">{icon}</span>
        <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">{label}</div>
      </div>
      <div className="text-sm font-medium text-on-surface">{value}</div>
    </div>
  )
}

/* ─── ToggleRow ────────────────────────────────────────────────────────── */

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
  title, onClose, children, width = 'md', panelClassName = '', panelStyle, panelRef,
  onPanelPointerDown, onPanelPointerMove, onPanelPointerUp,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: 'md' | 'lg' | 'xl'
  panelClassName?: string
  panelStyle?: React.CSSProperties
  panelRef?: React.Ref<HTMLDivElement>
  onPanelPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPanelPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPanelPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void
}) {
  const widthCls =
    width === 'xl' ? 'max-w-4xl' : width === 'lg' ? 'max-w-2xl' : 'max-w-md'
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`${widthCls} w-full bg-surface-container border border-outline-variant rounded-xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto ${panelClassName}`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPanelPointerDown}
        onPointerMove={onPanelPointerMove}
        onPointerUp={onPanelPointerUp}
        onPointerCancel={onPanelPointerUp}
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

function CategoryFilterButton({
  categories,
  value,
  onChange,
}: {
  categories: { id: number; name: string; icon: string | null }[]
  value: number | 'all'
  onChange: (v: number | 'all') => void
}) {
  const active = value !== 'all'
  const label = active
    ? categories.find((c) => c.id === value)?.name || 'Categoria'
    : 'Categoria'
  return (
    <div className="relative">
      <select
        value={value === 'all' ? 'all' : String(value)}
        onChange={(e) => onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        className={`appearance-none pl-8 pr-7 py-1.5 text-xs rounded-lg border cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
          active
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-outline-variant bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
        }`}
        title="Filtrar por categoria"
      >
        <option value="all">Todas categorias</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <span
        className={`material-symbols-outlined text-sm absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none ${
          active ? 'text-primary' : 'text-on-surface-variant'
        }`}
      >
        sell
      </span>
      <span
        className={`material-symbols-outlined text-base absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${
          active ? 'text-primary' : 'text-on-surface-variant'
        }`}
      >
        expand_more
      </span>
      {/* keep label accessible to screen readers */}
      <span className="sr-only">{label}</span>
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

type ReviewItem = CreditCardImportPreviewItem & { accepted: boolean }

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
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parse = useMutation({
    mutationFn: () => importCreditCardPdf(cardId, file!),
    onSuccess: (data) =>
      setItems(
        data.items.map((it) => ({
          ...it,
          // Já cadastrados: vem desmarcado por padrão (usuário pode reativar)
          accepted: !it.is_duplicate,
        })),
      ),
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setError(e?.response?.data?.detail || 'Erro ao processar o PDF')
    },
  })

  const confirm = useMutation({
    mutationFn: () => {
      const accepted = (items || []).filter((it) => it.accepted)
      return bulkCreateCreditCardExpenses({
        credit_card_id: cardId,
        items: accepted.map((it) => ({
          description: it.description,
          amount: Number(it.amount) * Math.max(1, it.installment_count),
          purchase_date: it.purchase_date,
          category_id: it.suggested_category_id ?? null,
          installment_count: Math.max(1, it.installment_count),
        })),
      })
    },
    onSuccess: onDone,
  })

  const acceptedItems = (items || []).filter((it) => it.accepted)
  const totalParsed = acceptedItems.reduce(
    (acc, i) => acc + Number(i.amount) * Math.max(1, i.installment_count),
    0,
  )
  const duplicateCount = (items || []).filter((it) => it.is_duplicate).length

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
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant">
            <p className="text-xs text-on-surface-variant">A importar (selecionados)</p>
            <p className="text-lg font-semibold text-on-surface">
              {acceptedItems.length} · {fmt(totalParsed)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant">
            <p className="text-xs text-on-surface-variant">Já registrados (desmarcados)</p>
            <p className="text-lg font-semibold text-on-surface-variant">{duplicateCount}</p>
          </div>
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
              className={`p-3 rounded-lg border bg-surface-container-low transition-opacity ${
                it.is_duplicate
                  ? 'border-yellow-700/40 bg-yellow-900/5'
                  : 'border-outline-variant'
              } ${!it.accepted ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={it.accepted}
                  onChange={(e) => {
                    const next = [...items]; next[i] = { ...it, accepted: e.target.checked }; setItems(next)
                  }}
                  className="w-4 h-4 rounded border-outline-variant accent-primary cursor-pointer flex-shrink-0"
                  title={it.accepted ? 'Desmarcar' : 'Marcar para importar'}
                />
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
              {(it.installment_count > 1 || it.is_refund || it.is_duplicate) && (
                <div className="flex flex-wrap items-center gap-2 mt-2 ml-7 text-xs">
                  {it.installment_count > 1 && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                      Parcelado · {it.installment_number}/{it.installment_count} ·{' '}
                      total {fmt(Number(it.amount) * it.installment_count)}
                    </span>
                  )}
                  {it.is_refund && (
                    <span className="px-2 py-0.5 rounded-full bg-tertiary/15 text-tertiary font-medium">
                      Estorno / crédito
                    </span>
                  )}
                  {it.is_duplicate && (
                    <span className="px-2 py-0.5 rounded-full bg-yellow-700/20 text-yellow-300 font-medium">
                      <span className="material-symbols-outlined text-xs align-middle mr-1">
                        check_circle
                      </span>
                      Já registrado{it.duplicate_reason ? ` · ${it.duplicate_reason}` : ''}
                    </span>
                  )}
                </div>
              )}
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
              disabled={acceptedItems.length === 0 || confirm.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {confirm.isPending
                ? 'Importando...'
                : `Importar ${acceptedItems.length} gasto${acceptedItems.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
