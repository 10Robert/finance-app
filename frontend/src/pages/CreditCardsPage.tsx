import { useMemo, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCreditCards,
  deleteCreditCardExpense,
  getCreditCardBillMonths,
  getCreditCardBill,
  getCreditCardByCategory,
  getCreditCardDailySpend,
  getCategories,
} from '../api/client'
import type {
  CreditCard,
  CreditCardBillItem,
  CreditCardMonthSummary,
} from '../types'
import { useToast, useConfirm } from '../components/feedback'
import { extractError } from '../utils/errors'
import {
  PT_MONTHS,
  PT_MONTHS_SHORT,
  ACCENT,
  fmt,
  fmtDateBR,
  CategoryFilterButton,
} from './creditcards/shared'
import {
  MonthStrip,
  SpendHeatmap,
  StackedBarsChart,
  TreemapChart,
} from './creditcards/charts'
import {
  AddTxModal,
  MonthDetailModal,
  LancamentoDetailModal,
  CardFormModal,
  BillModal,
  EditExpenseModal,
  PdfImportModal,
} from './creditcards/modals'

export default function CreditCardsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
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
                    onClick={async (e) => {
                      e.stopPropagation()
                      const msg = isSub
                        ? 'Remover esta assinatura? Todas as parcelas futuras serão excluídas.'
                        : 'Remover este lançamento?'
                      const ok = await confirm({
                        title: isSub ? 'Remover assinatura' : 'Remover lançamento',
                        message: msg,
                        confirmLabel: 'Remover',
                        tone: 'danger',
                      })
                      if (ok) {
                        try {
                          await deleteCreditCardExpense(item.expense_id)
                          invalidateAll()
                        } catch (err) {
                          toast.error(`Erro ao remover: ${extractError(err)}`)
                        }
                      }
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
          onDelete={async () => {
            const isSub = txDetailOpen.is_subscription
            const msg = isSub
              ? 'Remover esta assinatura? Todas as parcelas futuras serão excluídas.'
              : 'Remover este lançamento?'
            const ok = await confirm({
              title: isSub ? 'Remover assinatura' : 'Remover lançamento',
              message: msg,
              confirmLabel: 'Remover',
              tone: 'danger',
            })
            if (ok) {
              try {
                await deleteCreditCardExpense(txDetailOpen.expense_id)
                setTxDetailOpen(null)
                invalidateAll()
              } catch (err) {
                toast.error(`Erro ao remover: ${extractError(err)}`)
              }
            }
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
