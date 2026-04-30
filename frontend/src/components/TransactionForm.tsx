import { useState } from 'react'
import type {
  Category,
  TransactionCreate,
  FixedExpenseCreate,
  InstallmentPurchaseCreate,
} from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

type Kind = 'one_time' | 'fixed' | 'installment'

export type TransactionFormSubmit =
  | { kind: 'one_time'; data: TransactionCreate }
  | { kind: 'fixed'; data: FixedExpenseCreate }
  | { kind: 'installment'; data: InstallmentPurchaseCreate }

interface Props {
  categories: Category[]
  initialData?: Partial<TransactionCreate>
  onSubmit: (payload: TransactionFormSubmit) => void
  onClose: () => void
  isEdit: boolean
}

export default function TransactionForm({
  categories,
  initialData,
  onSubmit,
  onClose,
  isEdit,
}: Props) {
  const now = new Date()
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const [kind, setKind] = useState<Kind>('one_time')
  const [type, setType] = useState<'expense' | 'income'>(initialData?.type || 'expense')
  const [date, setDate] = useState(initialData?.date || todayIso)
  const [description, setDescription] = useState(initialData?.description || '')
  const [amount, setAmount] = useState(initialData?.amount ? String(initialData.amount) : '')
  const [categoryId, setCategoryId] = useState<string>(
    initialData?.category_id ? String(initialData.category_id) : '',
  )
  const [notes, setNotes] = useState(initialData?.notes || '')

  // Fixed expense
  const [dayOfMonth, setDayOfMonth] = useState('1')
  const [isPermanent, setIsPermanent] = useState(true)
  const [fixedStartDate, setFixedStartDate] = useState(
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
  )
  const [fixedEndDate, setFixedEndDate] = useState('')

  // Installment
  const [installmentCount, setInstallmentCount] = useState('2')

  const filteredCategories = categories.filter((c) => c.type === type)
  const expenseCategories = categories.filter((c) => c.type === 'expense')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const amountNum = parseFloat(amount)

    if (kind === 'one_time') {
      onSubmit({
        kind: 'one_time',
        data: {
          date,
          description,
          amount: type === 'expense' ? -Math.abs(amountNum) : Math.abs(amountNum),
          type,
          category_id: categoryId ? Number(categoryId) : null,
          notes: notes || null,
        },
      })
      return
    }

    if (kind === 'fixed') {
      onSubmit({
        kind: 'fixed',
        data: {
          description,
          amount: Math.abs(amountNum),
          category_id: categoryId ? Number(categoryId) : null,
          day_of_month: Number(dayOfMonth),
          is_permanent: isPermanent,
          start_date: fixedStartDate,
          end_date: isPermanent ? null : fixedEndDate || null,
        },
      })
      return
    }

    onSubmit({
      kind: 'installment',
      data: {
        description,
        total_amount: Math.abs(amountNum),
        installment_count: Number(installmentCount),
        category_id: categoryId ? Number(categoryId) : null,
        start_date: date,
      },
    })
  }

  const inputClass =
    'w-full bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary'

  const installmentPreview =
    kind === 'installment' && amount && installmentCount
      ? (parseFloat(amount) / Number(installmentCount)).toFixed(2)
      : null

  const kindTabClass = (active: boolean) =>
    `flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
      active
        ? 'bg-primary/15 text-primary border border-primary/40'
        : 'text-on-surface-variant border border-outline-variant hover:bg-surface-container-high'
    }`

  const fmtBRL = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-container border border-outline-variant rounded-xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-on-surface mb-4">
          {isEdit ? 'Editar Transação' : 'Nova Transação'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Kind selector — apenas no cadastro */}
          {!isEdit && (
            <div>
              <p className="text-xs text-secondary mb-2">Tipo de cadastro</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setKind('one_time')
                    setType((t) => t)
                  }}
                  className={kindTabClass(kind === 'one_time')}
                >
                  <span className="material-symbols-outlined text-base">receipt_long</span>
                  Avulsa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKind('fixed')
                    setType('expense')
                  }}
                  className={kindTabClass(kind === 'fixed')}
                >
                  <span className="material-symbols-outlined text-base">repeat</span>
                  Gasto Fixo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKind('installment')
                    setType('expense')
                  }}
                  className={kindTabClass(kind === 'installment')}
                >
                  <span className="material-symbols-outlined text-base">credit_card</span>
                  Parcelado
                </button>
              </div>
            </div>
          )}

          {/* Despesa / Receita — apenas no modo avulsa */}
          {kind === 'one_time' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setType('expense')
                  setCategoryId('')
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === 'expense'
                    ? 'bg-error/20 text-error border border-error/50'
                    : 'bg-secondary-container text-secondary'
                }`}
              >
                Despesa
              </button>
              <button
                type="button"
                onClick={() => {
                  setType('income')
                  setCategoryId('')
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === 'income'
                    ? 'bg-tertiary/20 text-tertiary border border-tertiary/50'
                    : 'bg-secondary-container text-secondary'
                }`}
              >
                Receita
              </button>
            </div>
          )}

          {/* Campos comuns */}
          <div>
            <label className="block text-xs text-secondary mb-1">Descrição</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
              placeholder={
                kind === 'fixed'
                  ? 'Ex: Aluguel'
                  : kind === 'installment'
                    ? 'Ex: iPhone 15'
                    : 'Ex: Supermercado'
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-secondary mb-1">
                {kind === 'installment' ? 'Valor total (R$)' : 'Valor (R$)'}
              </label>
              <input
                type="number"
                required
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClass}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">
                {kind === 'fixed'
                  ? 'Dia do mês'
                  : kind === 'installment'
                    ? 'Nº de parcelas'
                    : 'Data'}
              </label>
              {kind === 'fixed' ? (
                <input
                  type="number"
                  required
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  className={inputClass}
                />
              ) : kind === 'installment' ? (
                <input
                  type="number"
                  required
                  min="2"
                  max="120"
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(e.target.value)}
                  className={inputClass}
                />
              ) : (
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              )}
            </div>
          </div>

          {/* Preview parcela */}
          {kind === 'installment' && installmentPreview && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-xl">info</span>
              <p className="text-sm text-on-surface-variant">
                Valor por parcela:{' '}
                <span className="text-on-surface font-bold">
                  {fmtBRL(Number(installmentPreview))}
                </span>{' '}
                × {installmentCount}x
              </p>
            </div>
          )}

          {/* Categoria */}
          <div>
            <label className="block text-xs text-secondary mb-1">Categoria</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputClass}
            >
              <option value="">Sem categoria</option>
              {(kind === 'one_time' ? filteredCategories : expenseCategories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Campos extras: Gasto Fixo */}
          {kind === 'fixed' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-secondary mb-1">Início</label>
                  <input
                    type="date"
                    required
                    value={fixedStartDate}
                    onChange={(e) => setFixedStartDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1">Duração</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPermanent(true)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isPermanent
                          ? 'bg-primary/15 text-primary border border-primary/40'
                          : 'text-on-surface-variant border border-outline-variant hover:bg-surface-container-high'
                      }`}
                    >
                      Permanente
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPermanent(false)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                        !isPermanent
                          ? 'bg-primary/15 text-primary border border-primary/40'
                          : 'text-on-surface-variant border border-outline-variant hover:bg-surface-container-high'
                      }`}
                    >
                      Com prazo
                    </button>
                  </div>
                </div>
              </div>
              {!isPermanent && (
                <div>
                  <label className="block text-xs text-secondary mb-1">Data final</label>
                  <input
                    type="date"
                    required
                    value={fixedEndDate}
                    onChange={(e) => setFixedEndDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}
            </>
          )}

          {/* Campos extras: Parcelado */}
          {kind === 'installment' && (
            <div>
              <label className="block text-xs text-secondary mb-1">Data da primeira parcela</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          {/* Notas (apenas avulsa) */}
          {kind === 'one_time' && (
            <div>
              <label className="block text-xs text-secondary mb-1">Notas (opcional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClass}
                rows={2}
                placeholder="Observações..."
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-primary text-on-primary py-2 rounded-lg text-sm font-medium hover:bg-primary-container transition-colors"
            >
              {isEdit
                ? 'Salvar'
                : kind === 'fixed'
                  ? 'Cadastrar Gasto Fixo'
                  : kind === 'installment'
                    ? 'Cadastrar Parcelamento'
                    : 'Criar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-secondary-container text-secondary py-2 rounded-lg text-sm font-medium hover:text-on-surface transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
