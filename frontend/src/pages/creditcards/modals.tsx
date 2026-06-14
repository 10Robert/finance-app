import { useMemo, useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createCreditCard,
  updateCreditCard,
  deleteCreditCard,
  createCreditCardExpense,
  updateCreditCardExpense,
  deleteCreditCardExpense,
  refundCreditCardExpense,
  unrefundCreditCardExpense,
  anticipateInstallment,
  getCreditCardBill,
  importCreditCardPdf,
  bulkCreateCreditCardExpenses,
  getCategories,
} from '../../api/client'
import type {
  CreditCard,
  CreditCardCreate,
  CreditCardBillItem,
  CreditCardExpense,
  CreditCardImportPreviewItem,
  CreditCardMonthSummary,
  Category as CategoryType,
} from '../../types'
import { useToast, useConfirm } from '../../components/feedback'
import {
  Modal,
  Field,
  ToggleRow,
  IconBtn,
  DetailField,
  PT_MONTHS,
  PT_MONTHS_SHORT,
  CARD_COLORS,
  ACCENT,
  fmt,
  fmtDateBR,
  todayIso,
} from './shared'

/* ─── AddTxModal — Lançar Gasto (substitui o form lateral) ─────────────── */

export function AddTxModal({
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
  const toast = useToast()

  const submit = useMutation({
    mutationFn: createCreditCardExpense,
    onSuccess: () => {
      toast.success('Gasto lançado.')
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

export function MonthDetailModal({
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

export function LancamentoDetailModal({
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

/* ─── Card form modal ──────────────────────────────────────────────────── */

export function CardFormModal({
  card, onClose, onSaved, onDeleted,
}: {
  card: CreditCard | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const confirm = useConfirm()
  const toast = useToast()
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
    onSuccess: () => {
      toast.success(card ? 'Cartão atualizado.' : 'Cartão criado.')
      onSaved()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => {
      setError(e?.response?.data?.detail || 'Erro ao salvar cartão')
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteCreditCard(card!.id),
    onSuccess: () => {
      toast.success('Cartão excluído.')
      onDeleted()
    },
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
              onClick={async () => {
                const ok = await confirm({
                  title: 'Excluir cartão',
                  message: 'Excluir este cartão removerá todos os seus gastos. Continuar?',
                  confirmLabel: 'Excluir',
                  tone: 'danger',
                })
                if (ok) remove.mutate()
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

export function BillModal({
  year, month, onClose, onChanged,
}: {
  year: number; month: number; onClose: () => void; onChanged: () => void
}) {
  const qc = useQueryClient()
  const confirm = useConfirm()
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
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Excluir gasto',
                      message: 'Excluir este gasto removerá todas as parcelas. Continuar?',
                      confirmLabel: 'Excluir',
                      tone: 'danger',
                    })
                    if (ok) deleteCreditCardExpense(item.expense_id).then(refresh)
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

/* ─── Anticipate modal ─────────────────────────────────────────────────── */

export function AnticipateModal({
  item, onClose, onDone,
}: {
  item: CreditCardBillItem; onClose: () => void; onDone: () => void
}) {
  const now = new Date()
  const [targetMonth, setTargetMonth] = useState(now.getMonth() + 1)
  const [targetYear, setTargetYear] = useState(now.getFullYear())
  const toast = useToast()

  const submit = useMutation({
    mutationFn: () => anticipateInstallment(item.installment_id, {
      target_month: targetMonth, target_year: targetYear,
    }),
    onSuccess: () => {
      toast.success('Parcela antecipada.')
      onDone()
    },
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
              min="2000"
              max="2100"
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

export function EditExpenseModal({
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
  const toast = useToast()

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
    onSuccess: () => {
      toast.success('Gasto atualizado.')
      onSaved()
    },
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
            onClick={() => {
              const amt = Number(amount.replace(',', '.'))
              if (!description.trim()) {
                toast.warning('Descrição obrigatória')
                return
              }
              if (!amt || amt <= 0) {
                toast.warning('Valor inválido')
                return
              }
              save.mutate()
            }}
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

/* ─── PDF Import modal ────────────────────────────────────────────────── */

type ReviewItem = CreditCardImportPreviewItem & { accepted: boolean }

export function PdfImportModal({
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
  const toast = useToast()

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
    onSuccess: () => {
      const n = (items || []).filter((it) => it.accepted).length
      toast.success(`${n} gasto(s) importado(s).`)
      onDone()
    },
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
                  min="0"
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
