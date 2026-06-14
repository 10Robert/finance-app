import { useMemo, useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTransactions,
  getCategories,
  createTransaction,
  deleteTransaction,
  updateTransaction,
  getBalance,
  uploadFile,
  processImport,
  getStagedTransactions,
  updateStagedTransactions,
  confirmImport,
  createFixedExpense,
  createInstallment,
  importTransactionsJson,
} from '../api/client'
import type { TransactionCreate, Transaction } from '../types'
import TransactionForm, { type TransactionFormSubmit } from '../components/TransactionForm'
import ImportReview from '../components/ImportReview'
import { useToast, useConfirm } from '../components/feedback'
import { extractError } from '../utils/errors'
import { useFocusTrap, useEscapeKey } from '../utils/a11y'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

type TypeFilter = '' | 'expense' | 'income'
type PeriodMode = 'all' | 'week' | 'month' | 'year' | 'custom'

const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function weekRange(weekStr: string): { start: string; end: string } {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(weekStr)
  if (!m) return { start: '', end: '' }
  const year = Number(m[1])
  const week = Number(m[2])
  const jan4 = new Date(year, 0, 4)
  const jan4Day = jan4.getDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setDate(jan4.getDate() - (jan4Day - 1))
  const start = new Date(week1Monday)
  start.setDate(week1Monday.getDate() + (week - 1) * 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: isoDate(start), end: isoDate(end) }
}

function monthRange(monthStr: string): { start: string; end: string } {
  const m = /^(\d{4})-(\d{1,2})$/.exec(monthStr)
  if (!m) return { start: '', end: '' }
  const year = Number(m[1])
  const month = Number(m[2])
  const start = `${year}-${pad(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${pad(month)}-${pad(lastDay)}`
  return { start, end }
}

function yearRange(yearStr: string): { start: string; end: string } {
  if (!/^\d{4}$/.test(yearStr)) return { start: '', end: '' }
  return { start: `${yearStr}-01-01`, end: `${yearStr}-12-31` }
}

function currentIsoWeek(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const year = d.getFullYear()
  const week1 = new Date(year, 0, 4)
  const diff = (d.getTime() - week1.getTime()) / 86400000
  const weekNum = 1 + Math.round((diff - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${year}-W${pad(weekNum)}`
}

export default function TransactionsPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const now = new Date()

  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('')
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('')
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all')
  const [weekValue, setWeekValue] = useState<string>(currentIsoWeek())
  const [monthValue, setMonthValue] = useState<string>(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`)
  const [yearValue, setYearValue] = useState<string>(String(now.getFullYear()))
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showJsonImport, setShowJsonImport] = useState(false)
  const [showImportMenu, setShowImportMenu] = useState(false)
  const importMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!showImportMenu) return
    const onClickOutside = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setShowImportMenu(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showImportMenu])

  // Resolve the active date range from the selected period mode.
  const { startDate, endDate } = useMemo(() => {
    switch (periodMode) {
      case 'week': {
        const r = weekRange(weekValue)
        return { startDate: r.start, endDate: r.end }
      }
      case 'month': {
        const r = monthRange(monthValue)
        return { startDate: r.start, endDate: r.end }
      }
      case 'year': {
        const r = yearRange(yearValue)
        return { startDate: r.start, endDate: r.end }
      }
      case 'custom':
        return { startDate: customStart, endDate: customEnd }
      case 'all':
      default:
        return { startDate: '', endDate: '' }
    }
  }, [periodMode, weekValue, monthValue, yearValue, customStart, customEnd])

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, typeFilter, categoryFilter, startDate, endDate],
    queryFn: () =>
      getTransactions({
        page,
        per_page: 20,
        ...(typeFilter && { type: typeFilter }),
        ...(categoryFilter && { category_id: Number(categoryFilter) }),
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate }),
      }),
  })

  // Balance query respects the period filter
  const balanceParams = useMemo(() => {
    if (startDate && endDate) {
      return { start_date: startDate, end_date: endDate }
    }
    // Default: current month
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }, [startDate, endDate])

  const { data: balance } = useQuery({
    queryKey: ['balance', balanceParams],
    queryFn: () => getBalance(balanceParams),
  })

  const createMut = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      setShowForm(false)
      toast.success('Transação criada com sucesso.')
    },
    onError: (err) => toast.error(`Erro ao criar transação: ${extractError(err)}`),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TransactionCreate> }) =>
      updateTransaction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      setEditingId(null)
      setShowForm(false)
      toast.success('Transação atualizada.')
    },
    onError: (err) => toast.error(`Erro ao atualizar transação: ${extractError(err)}`),
  })

  const deleteMut = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      toast.success('Transação excluída.')
    },
    onError: (err) => toast.error(`Erro ao excluir: ${extractError(err)}`),
  })

  const createFixedMut = useMutation({
    mutationFn: createFixedExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      queryClient.invalidateQueries({ queryKey: ['fixed-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['transactions-grouped'] })
      setShowForm(false)
      toast.success('Gasto fixo cadastrado.')
    },
    onError: (err) => toast.error(`Erro ao cadastrar gasto fixo: ${extractError(err)}`),
  })

  const createInstallmentMut = useMutation({
    mutationFn: createInstallment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      queryClient.invalidateQueries({ queryKey: ['installments'] })
      setShowForm(false)
      toast.success('Parcelamento cadastrado.')
    },
    onError: (err) => toast.error(`Erro ao cadastrar parcelamento: ${extractError(err)}`),
  })

  const handleSubmit = (payload: TransactionFormSubmit) => {
    if (editingId) {
      // Edição mantém apenas o modo avulsa
      if (payload.kind === 'one_time') {
        updateMut.mutate({ id: editingId, data: payload.data })
      }
      return
    }
    if (payload.kind === 'one_time') createMut.mutate(payload.data)
    else if (payload.kind === 'fixed') createFixedMut.mutate(payload.data)
    else createInstallmentMut.mutate(payload.data)
  }

  const handleDelete = async (id: number) => {
    const ok = await confirm({
      title: 'Excluir transação',
      message: 'Tem certeza que deseja excluir esta transação? Essa ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    })
    if (ok) deleteMut.mutate(id)
  }

  const editingTransaction = editingId ? data?.items.find((t) => t.id === editingId) : undefined
  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0

  // Summary cards — now respect period filter
  const incomeMonth = Number(balance?.income_total ?? 0)
  const expenseMonth = Number(balance?.expense_total ?? 0)
  const monthResult = incomeMonth - expenseMonth

  // Period label for cards
  const periodLabel = useMemo(() => {
    switch (periodMode) {
      case 'week': return 'Semana'
      case 'month': return 'Mês'
      case 'year': return 'Ano'
      case 'custom': return 'Período'
      default: return 'Mês atual'
    }
  }, [periodMode])

  const exportCSV = () => {
    if (!data?.items.length) {
      toast.warning('Nada para exportar.')
      return
    }
    const header = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor']
    const rows = data.items.map((t) => [
      t.date,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.category?.name ?? '',
      t.type,
      String(t.amount),
    ])
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transacoes-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const cardClass = 'bg-surface border border-outline-variant rounded-lg p-5'
  const inputClass =
    'bg-bg border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent'

  const tabClass = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      active
        ? 'bg-primary/15 text-primary border border-primary/30'
        : 'text-on-surface-variant border border-outline-variant hover:text-on-surface hover:bg-surface-variant'
    }`

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-on-surface">Transações</h1>
          <p className="text-sm text-on-surface-variant">
            Gerencie todas as suas movimentações financeiras em um só lugar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Importar (dropdown PDF / JSON) */}
          <div ref={importMenuRef} className="relative">
            <button
              onClick={() => setShowImportMenu((v) => !v)}
              className="flex items-center gap-2 bg-surface border border-outline-variant px-3 py-2 rounded-lg hover:bg-surface-variant active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-lg">upload_file</span>
              <span className="text-sm font-medium text-on-surface">Importar Gastos</span>
              <span className="material-symbols-outlined text-on-surface-variant text-base">expand_more</span>
            </button>
            {showImportMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-surface border border-outline-variant rounded-lg shadow-2xl overflow-hidden z-20">
                <button
                  onClick={() => {
                    setShowImportMenu(false)
                    setShowImport(true)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-variant transition-colors"
                >
                  <span className="material-symbols-outlined text-primary text-lg">picture_as_pdf</span>
                  <div>
                    <p className="text-sm font-medium text-on-surface">Exportar PDF</p>
                    <p className="text-[10px] text-on-surface-variant">Extrato bancário (PDF / CSV)</p>
                  </div>
                </button>
                <div className="h-px bg-outline-variant" />
                <button
                  onClick={() => {
                    setShowImportMenu(false)
                    setShowJsonImport(true)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-variant transition-colors"
                >
                  <span className="material-symbols-outlined text-tertiary text-lg">data_object</span>
                  <div>
                    <p className="text-sm font-medium text-on-surface">Exportar JSON</p>
                    <p className="text-[10px] text-on-surface-variant">Arquivo .json estruturado</p>
                  </div>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-surface border border-outline-variant px-3 py-2 rounded-lg hover:bg-surface-variant active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-lg">download</span>
            <span className="text-sm font-medium text-on-surface">Exportar</span>
          </button>
          <button
            onClick={() => {
              setEditingId(null)
              setShowForm(true)
            }}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Nova Transação
          </button>
        </div>
      </header>

      {/* Summary cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant text-base">
              account_balance_wallet
            </span>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Saldo Total</p>
          </div>
          <p className="text-2xl font-black text-on-surface">{fmt(Number(balance?.balance ?? 0))}</p>
          <p className="text-xs text-secondary mt-1">{periodLabel}</p>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-tertiary text-base">trending_up</span>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Receitas</p>
          </div>
          <p className="text-2xl font-black text-tertiary">{fmt(incomeMonth)}</p>
          <p className="text-xs text-secondary mt-1">{periodLabel}</p>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-error text-base">trending_down</span>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Despesas</p>
          </div>
          <p className="text-2xl font-black text-error">{fmt(expenseMonth)}</p>
          <p className="text-xs text-secondary mt-1">{periodLabel}</p>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`material-symbols-outlined text-base ${
                monthResult >= 0 ? 'text-primary' : 'text-error'
              }`}
            >
              {monthResult >= 0 ? 'savings' : 'warning'}
            </span>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Resultado</p>
          </div>
          <p
            className={`text-2xl font-black ${
              monthResult >= 0 ? 'text-primary' : 'text-error'
            }`}
          >
            {fmt(monthResult)}
          </p>
          <p className="text-xs text-secondary mt-1">Receitas − Despesas</p>
        </div>
      </section>

      {/* Filters */}
      <section className="bg-surface border border-outline-variant rounded-lg p-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setTypeFilter('')
              setPage(1)
            }}
            className={tabClass(typeFilter === '')}
          >
            Todas
          </button>
          <button
            onClick={() => {
              setTypeFilter('income')
              setPage(1)
            }}
            className={tabClass(typeFilter === 'income')}
          >
            Receitas
          </button>
          <button
            onClick={() => {
              setTypeFilter('expense')
              setPage(1)
            }}
            className={tabClass(typeFilter === 'expense')}
          >
            Despesas
          </button>
        </div>
        <div className="h-6 w-px bg-outline-variant mx-1 hidden md:block" />

        {/* Period mode selector */}
        <select
          value={periodMode}
          onChange={(e) => {
            setPeriodMode(e.target.value as PeriodMode)
            setPage(1)
          }}
          className={inputClass}
          title="Modo de período"
        >
          <option value="all">Todo o período</option>
          <option value="week">Semana</option>
          <option value="month">Mês</option>
          <option value="year">Ano</option>
          <option value="custom">Personalizado</option>
        </select>

        {periodMode === 'week' && (
          <input
            type="week"
            value={weekValue}
            onChange={(e) => {
              setWeekValue(e.target.value)
              setPage(1)
            }}
            className={inputClass}
          />
        )}
        {periodMode === 'month' && (
          <input
            type="month"
            value={monthValue}
            onChange={(e) => {
              setMonthValue(e.target.value)
              setPage(1)
            }}
            className={inputClass}
          />
        )}
        {periodMode === 'year' && (
          <select
            value={yearValue}
            onChange={(e) => {
              setYearValue(e.target.value)
              setPage(1)
            }}
            className={inputClass}
          >
            {Array.from({ length: 7 }, (_, i) => now.getFullYear() - 5 + i).map((y) => (
              <option key={y} value={String(y)} className="bg-bg">
                {y}
              </option>
            ))}
          </select>
        )}
        {periodMode === 'custom' && (
          <>
            <input
              type="date"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value)
                setPage(1)
              }}
              className={inputClass}
            />
            <span className="text-on-surface-variant text-sm">até</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value)
                setPage(1)
              }}
              className={inputClass}
            />
          </>
        )}

        {periodMode !== 'all' && startDate && endDate && (
          <span className="text-[10px] uppercase tracking-widest text-secondary hidden lg:inline">
            {fmtDate(startDate)} → {fmtDate(endDate)}
          </span>
        )}

        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value ? Number(e.target.value) : '')
            setPage(1)
          }}
          className={inputClass}
        >
          <option value="">Todas categorias</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id} className="bg-bg">
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </section>

      {/* Table */}
      <section className="bg-surface border border-outline-variant rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-on-surface-variant text-sm">Carregando…</div>
        ) : data && data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container text-on-surface-variant uppercase text-[10px] tracking-widest">
                  <tr>
                    <th className="px-6 py-3 font-medium">Data</th>
                    <th className="px-6 py-3 font-medium">Descrição</th>
                    <th className="px-6 py-3 font-medium">Categoria</th>
                    <th className="px-6 py-3 font-medium text-right">Valor</th>
                    <th className="px-6 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {data.items.map((t) => (
                    <TransactionRow
                      key={t.id}
                      tx={t}
                      onEdit={() => {
                        setEditingId(t.id)
                        setShowForm(true)
                      }}
                      onDelete={() => handleDelete(t.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-outline-variant flex justify-between items-center">
                <p className="text-xs text-on-surface-variant">
                  {data.total} {data.total === 1 ? 'transação' : 'transações'}
                </p>
                <div className="flex gap-2 items-center">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1.5 rounded border border-outline-variant text-xs text-on-surface-variant disabled:opacity-30 hover:bg-surface-variant"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-on-surface-variant">
                    {page} / {totalPages}
                  </span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1.5 rounded border border-outline-variant text-xs text-on-surface-variant disabled:opacity-30 hover:bg-surface-variant"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-16 text-center text-on-surface-variant text-sm">Nenhuma transação encontrada.</div>
        )}
      </section>

      {/* Modal: New/Edit Transaction */}
      {showForm && (
        <TransactionForm
          categories={categories || []}
          initialData={
            editingTransaction
              ? {
                  date: editingTransaction.date,
                  description: editingTransaction.description,
                  amount: Math.abs(editingTransaction.amount),
                  type: editingTransaction.type,
                  category_id: editingTransaction.category_id,
                  notes: editingTransaction.notes,
                }
              : undefined
          }
          onSubmit={handleSubmit}
          onClose={() => {
            setShowForm(false)
            setEditingId(null)
          }}
          isEdit={!!editingId}
        />
      )}

      {/* Modal: Import Statement */}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}

      {/* Modal: JSON Import */}
      {showJsonImport && <JsonImportModal onClose={() => setShowJsonImport(false)} />}
    </div>
  )
}

// --- Transaction Row --------------------------------------------------------

function TransactionRow({
  tx,
  onEdit,
  onDelete,
}: {
  tx: Transaction
  onEdit: () => void
  onDelete: () => void
}) {
  const isAuto = tx.source === 'salary_auto'
  const isFixed = tx.source?.startsWith('fixed_')
  const isInstallment = tx.source?.startsWith('installment_')
  const isIncome = tx.type === 'income'
  return (
    <tr className="hover:bg-surface-variant/50 transition-colors">
      <td className="px-6 py-4 text-on-surface whitespace-nowrap">{fmtDate(tx.date)}</td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-on-surface-variant text-base">
            {tx.icon || 'receipt_long'}
          </span>
          <span className="text-on-surface">{tx.description}</span>
          {isAuto && (
            <span
              title="Gerado automaticamente a partir do Rendimentos"
              className="px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-[10px] font-bold uppercase tracking-wider"
            >
              auto
            </span>
          )}
          {isFixed && (
            <span
              title="Gasto fixo mensal"
              className="px-2 py-0.5 rounded-full bg-[#3b82f6]/15 border border-[#3b82f6]/30 text-[#3b82f6] text-[10px] font-bold uppercase tracking-wider"
            >
              fixo
            </span>
          )}
          {isInstallment && (
            <span
              title="Compra parcelada"
              className="px-2 py-0.5 rounded-full bg-[#f59e0b]/15 border border-[#f59e0b]/30 text-[#f59e0b] text-[10px] font-bold uppercase tracking-wider"
            >
              parcela
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        {tx.category ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-outline-variant text-on-surface-variant text-xs">
            {tx.category.icon} {tx.category.name}
          </span>
        ) : (
          <span className="text-xs text-secondary">—</span>
        )}
      </td>
      <td
        className={`px-6 py-4 text-right font-bold whitespace-nowrap ${
          isIncome ? 'text-tertiary' : 'text-error'
        }`}
      >
        {isIncome ? '+ ' : '- '}
        {fmt(Math.abs(tx.amount))}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex justify-end gap-3">
          {isAuto || isFixed || isInstallment ? (
            <span
              title="Transação automática — gerencie pelo cadastro original"
              className="text-secondary cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-lg">lock</span>
            </span>
          ) : (
            <>
              <button
                onClick={onEdit}
                className="text-on-surface-variant hover:text-primary transition-colors"
                aria-label="Editar"
              >
                <span className="material-symbols-outlined text-lg">edit</span>
              </button>
              <button
                onClick={onDelete}
                className="text-on-surface-variant hover:text-error transition-colors"
                aria-label="Excluir"
              >
                <span className="material-symbols-outlined text-lg">delete</span>
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// --- Import Modal -----------------------------------------------------------

function ImportModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(true, panelRef)
  useEscapeKey(true, onClose)
  const [activeImportId, setActiveImportId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [confirmResult, setConfirmResult] = useState<{ created: number; skipped_income: number } | null>(null)

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: getCategories })

  const { data: staged } = useQuery({
    queryKey: ['staged', activeImportId],
    queryFn: () => getStagedTransactions(activeImportId!),
    enabled: !!activeImportId,
  })

  const { data: activeImport } = useQuery({
    queryKey: ['import-status', activeImportId],
    queryFn: async () => {
      const list = await import('../api/client').then((m) => m.getImports())
      return list.find((i) => i.id === activeImportId) ?? null
    },
    enabled: !!activeImportId,
    refetchInterval: (q) => {
      const data = q.state.data as { status?: string } | null | undefined
      return data?.status === 'processing' ? 1500 : false
    },
  })

  const uploadMut = useMutation({
    mutationFn: uploadFile,
    onSuccess: (data) => {
      setActiveImportId(data.id)
      queryClient.invalidateQueries({ queryKey: ['import-status', data.id] })
    },
    onError: (err) => toast.error(`Erro no upload: ${extractError(err)}`),
  })

  const processMut = useMutation({
    mutationFn: processImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-status', activeImportId] })
      queryClient.invalidateQueries({ queryKey: ['staged', activeImportId] })
    },
    onError: (err) => toast.error(`Erro no processamento: ${extractError(err)}`),
  })

  const confirmMut = useMutation({
    mutationFn: confirmImport,
    onSuccess: (result) => {
      setConfirmResult(result)
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      toast.success(`${result.created} transação(ões) importada(s).`)
    },
    onError: (err) => toast.error(`Erro ao confirmar: ${extractError(err)}`),
  })

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    setConfirmResult(null)
    uploadMut.mutate(files[0])
  }

  const handleStagedUpdate = async (
    updates: { id: number; category_id?: number; accepted?: boolean }[],
  ) => {
    if (!activeImportId) return
    await updateStagedTransactions(activeImportId, updates)
    queryClient.invalidateQueries({ queryKey: ['staged', activeImportId] })
  }

  const reset = () => {
    setActiveImportId(null)
    setConfirmResult(null)
  }

  const status = activeImport?.status

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        className="bg-surface border border-outline-variant rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
          <div>
            <h3 id="import-modal-title" className="text-lg font-bold text-on-surface">Importar Extrato Bancário</h3>
            <p className="text-xs text-on-surface-variant">
              Receitas (salário, reembolsos) são ignoradas — use a tela de Rendimentos para isso.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="material-symbols-outlined text-on-surface-variant hover:text-on-surface"
          >
            close
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!activeImportId && (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                handleFiles(e.dataTransfer.files)
              }}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-outline-variant bg-bg'
              }`}
            >
              <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3 block">
                upload_file
              </span>
              <p className="text-on-surface mb-2">Arraste seu extrato bancário aqui</p>
              <p className="text-xs text-on-surface-variant mb-4">Formatos aceitos: CSV, PDF</p>
              <label className="inline-block bg-primary text-on-primary px-6 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 cursor-pointer transition-colors">
                Escolher arquivo
                <input
                  type="file"
                  accept=".csv,.pdf"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </label>
              {uploadMut.isPending && (
                <p className="mt-3 text-sm text-primary">Enviando…</p>
              )}
            </div>
          )}

          {activeImport && status === 'pending' && (
            <div className="bg-bg border border-outline-variant rounded-lg p-6 flex items-center justify-between">
              <div>
                <p className="font-medium text-on-surface">{activeImport.filename}</p>
                <p className="text-sm text-on-surface-variant">Pronto para processar com IA.</p>
              </div>
              <button
                onClick={() => processMut.mutate(activeImportId!)}
                disabled={processMut.isPending}
                className="bg-primary text-on-primary px-6 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {processMut.isPending ? 'Processando…' : 'Processar com IA'}
              </button>
            </div>
          )}

          {status === 'processing' && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 text-center">
              <p className="text-primary font-medium">Processando com IA…</p>
              <p className="text-sm text-on-surface-variant">Isso pode levar alguns segundos</p>
            </div>
          )}

          {status === 'failed' && (
            <div className="bg-error/5 border border-error/20 rounded-lg p-6">
              <p className="text-error font-medium">Erro no processamento</p>
              <p className="text-sm text-on-surface-variant">{activeImport?.error_message}</p>
            </div>
          )}

          {status === 'review' && staged && !confirmResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-on-surface">
                  Revisar ({staged.length} transações)
                </h3>
                <button
                  onClick={() => confirmMut.mutate(activeImportId!)}
                  disabled={confirmMut.isPending}
                  className="bg-tertiary text-on-tertiary px-6 py-2 rounded-lg text-sm font-bold hover:bg-tertiary/90 disabled:opacity-50 transition-colors"
                >
                  {confirmMut.isPending ? 'Confirmando…' : 'Confirmar Importação'}
                </button>
              </div>
              <ImportReview
                staged={staged}
                categories={categories || []}
                onUpdate={handleStagedUpdate}
              />
            </div>
          )}

          {confirmResult && (
            <div className="bg-tertiary/5 border border-tertiary/20 rounded-lg p-6 text-center space-y-3">
              <span className="material-symbols-outlined text-tertiary text-5xl block">
                check_circle
              </span>
              <p className="text-on-surface font-bold text-lg">Importação concluída</p>
              <p className="text-sm text-on-surface-variant">
                {confirmResult.created} despesas importadas.
                {confirmResult.skipped_income > 0 && (
                  <>
                    {' '}
                    {confirmResult.skipped_income} entradas de receita ignoradas (use a tela de Rendimentos).
                  </>
                )}
              </p>
              <div className="flex gap-2 justify-center pt-2">
                <button
                  onClick={reset}
                  className="px-4 py-2 border border-outline-variant text-on-surface-variant rounded-lg text-sm font-medium hover:bg-surface-variant"
                >
                  Importar outro
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold hover:bg-primary/90"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- JSON Import Modal ------------------------------------------------------

function JsonImportModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(true, panelRef)
  useEscapeKey(true, onClose)
  const [jsonData, setJsonData] = useState<Record<string, unknown>[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null)

  const importMut = useMutation({
    mutationFn: importTransactionsJson,
    onSuccess: (res) => {
      setResult(res)
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      toast.success(`${res.created} transação(ões) importada(s).`)
    },
    onError: (err) => toast.error(`Erro na importação: ${extractError(err)}`),
  })

  const handleFile = (files: FileList | null) => {
    if (!files?.length) return
    const file = files[0]
    setFileName(file.name)
    setError('')
    setResult(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string)
        const arr = Array.isArray(parsed) ? parsed : parsed.transactions ?? parsed.data ?? null
        if (!Array.isArray(arr)) {
          setError('O arquivo deve conter um array JSON ou um objeto com chave "transactions" ou "data".')
          return
        }
        setJsonData(arr)
      } catch {
        setError('Arquivo JSON inválido.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="json-import-title"
        className="bg-surface border border-outline-variant rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
          <div>
            <h3 id="json-import-title" className="text-lg font-bold text-on-surface">Importar JSON</h3>
            <p className="text-xs text-on-surface-variant">
              Formato esperado: array com objetos contendo date, description, amount, type (optional).
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface">
            close
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!result && (
            <>
              <div className="flex gap-3 items-center">
                <label className="inline-block bg-primary text-on-primary px-6 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 cursor-pointer transition-colors">
                  Escolher arquivo .json
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files)}
                  />
                </label>
                {fileName && <span className="text-sm text-on-surface-variant">{fileName}</span>}
              </div>

              {error && (
                <div className="bg-error/5 border border-error/20 rounded-lg p-4">
                  <p className="text-sm text-error">{error}</p>
                </div>
              )}

              {jsonData && (
                <div className="space-y-4">
                  <p className="text-sm text-on-surface-variant">{jsonData.length} transações encontradas no arquivo.</p>
                  <div className="max-h-60 overflow-y-auto bg-bg border border-outline-variant rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-container text-on-surface-variant uppercase text-[10px] tracking-widest sticky top-0">
                        <tr>
                          <th className="px-4 py-2">Data</th>
                          <th className="px-4 py-2">Descrição</th>
                          <th className="px-4 py-2 text-right">Valor</th>
                          <th className="px-4 py-2">Tipo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {jsonData.slice(0, 50).map((row, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-on-surface">{String(row.date ?? '')}</td>
                            <td className="px-4 py-2 text-on-surface">{String(row.description ?? '')}</td>
                            <td className="px-4 py-2 text-right text-on-surface">{String(row.amount ?? '')}</td>
                            <td className="px-4 py-2 text-on-surface-variant">{String(row.type ?? 'expense')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {jsonData.length > 50 && (
                      <p className="text-center text-xs text-secondary py-2">
                        …e mais {jsonData.length - 50} linhas
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => importMut.mutate(jsonData)}
                    disabled={importMut.isPending}
                    className="bg-tertiary text-on-tertiary px-6 py-2 rounded-lg text-sm font-bold hover:bg-tertiary/90 disabled:opacity-50 transition-colors"
                  >
                    {importMut.isPending ? 'Importando…' : `Importar ${jsonData.length} transações`}
                  </button>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="bg-tertiary/5 border border-tertiary/20 rounded-lg p-6 text-center space-y-3">
              <span className="material-symbols-outlined text-tertiary text-5xl block">
                check_circle
              </span>
              <p className="text-on-surface font-bold text-lg">Importação concluída</p>
              <p className="text-sm text-on-surface-variant">{result.created} transações importadas.</p>
              {result.errors.length > 0 && (
                <div className="text-left bg-error/5 border border-error/20 rounded-lg p-3 mt-2">
                  <p className="text-xs text-error font-medium mb-1">Erros:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-on-surface-variant">{e}</p>
                  ))}
                </div>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold hover:bg-primary/90 mt-2"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
