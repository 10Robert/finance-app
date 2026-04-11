import { useMemo, useState } from 'react'
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
} from '../api/client'
import type { TransactionCreate, Transaction } from '../types'
import TransactionForm from '../components/TransactionForm'
import ImportReview from '../components/ImportReview'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

const extractError = (err: unknown): string => {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string }
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d?.msg ?? '').join('; ')
  return e?.message ?? 'Erro desconhecido'
}

type TypeFilter = '' | 'expense' | 'income'

export default function TransactionsPage() {
  const queryClient = useQueryClient()
  const now = new Date()

  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('')
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showImport, setShowImport] = useState(false)

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

  const { data: balance } = useQuery({
    queryKey: ['balance', now.getFullYear(), now.getMonth() + 1],
    queryFn: () => getBalance({ year: now.getFullYear(), month: now.getMonth() + 1 }),
  })

  const createMut = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      setShowForm(false)
    },
    onError: (err) => alert(`Erro ao criar transação: ${extractError(err)}`),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TransactionCreate> }) =>
      updateTransaction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      setEditingId(null)
      setShowForm(false)
    },
    onError: (err) => alert(`Erro ao atualizar transação: ${extractError(err)}`),
  })

  const deleteMut = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
    },
    onError: (err) => alert(`Erro ao excluir: ${extractError(err)}`),
  })

  const handleSubmit = (formData: TransactionCreate) => {
    if (editingId) updateMut.mutate({ id: editingId, data: formData })
    else createMut.mutate(formData)
  }

  const handleDelete = (id: number) => {
    if (confirm('Tem certeza que deseja excluir esta transação?')) deleteMut.mutate(id)
  }

  const editingTransaction = editingId ? data?.items.find((t) => t.id === editingId) : undefined
  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0

  // Summary cards (current month)
  const incomeMonth = Number(balance?.income_total ?? 0)
  const expenseMonth = Number(balance?.expense_total ?? 0)
  const monthResult = incomeMonth - expenseMonth

  const exportCSV = () => {
    if (!data?.items.length) {
      alert('Nada para exportar.')
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

  const cardClass = 'bg-[#0c0c0f] border border-[#27272a] rounded-lg p-5'
  const inputClass =
    'bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#a78bfa] focus:border-transparent'

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
          <h1 className="text-2xl font-black tracking-tighter text-[#fafafa]">Transações</h1>
          <p className="text-sm text-[#a1a1aa]">
            Gerencie todas as suas movimentações financeiras em um só lugar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-[#0c0c0f] border border-[#27272a] px-3 py-2 rounded-lg hover:bg-[#18181b] active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[#a1a1aa] text-lg">upload_file</span>
            <span className="text-sm font-medium text-[#fafafa]">Importar Extrato</span>
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-[#0c0c0f] border border-[#27272a] px-3 py-2 rounded-lg hover:bg-[#18181b] active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[#a1a1aa] text-lg">download</span>
            <span className="text-sm font-medium text-[#fafafa]">Exportar</span>
          </button>
          <button
            onClick={() => {
              setEditingId(null)
              setShowForm(true)
            }}
            className="flex items-center gap-2 bg-[#a78bfa] text-[#0a0012] px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#a78bfa]/90 active:scale-95 transition-all"
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
            <span className="material-symbols-outlined text-[#a1a1aa] text-base">
              account_balance_wallet
            </span>
            <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Saldo Total</p>
          </div>
          <p className="text-2xl font-black text-[#fafafa]">{fmt(Number(balance?.balance ?? 0))}</p>
          <p className="text-xs text-[#52525b] mt-1">Acumulado</p>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[#34d399] text-base">trending_up</span>
            <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Receitas do Mês</p>
          </div>
          <p className="text-2xl font-black text-[#34d399]">{fmt(incomeMonth)}</p>
          <p className="text-xs text-[#52525b] mt-1">Mês atual</p>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[#ef4444] text-base">trending_down</span>
            <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Despesas do Mês</p>
          </div>
          <p className="text-2xl font-black text-[#ef4444]">{fmt(expenseMonth)}</p>
          <p className="text-xs text-[#52525b] mt-1">Mês atual</p>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`material-symbols-outlined text-base ${
                monthResult >= 0 ? 'text-[#a78bfa]' : 'text-[#ef4444]'
              }`}
            >
              {monthResult >= 0 ? 'savings' : 'warning'}
            </span>
            <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Resultado do Mês</p>
          </div>
          <p
            className={`text-2xl font-black ${
              monthResult >= 0 ? 'text-[#a78bfa]' : 'text-[#ef4444]'
            }`}
          >
            {fmt(monthResult)}
          </p>
          <p className="text-xs text-[#52525b] mt-1">Receitas − Despesas</p>
        </div>
      </section>

      {/* Filters */}
      <section className="bg-[#0c0c0f] border border-[#27272a] rounded-lg p-4 flex flex-wrap items-center gap-3">
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
        <div className="h-6 w-px bg-[#27272a] mx-1 hidden md:block" />
        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value)
            setPage(1)
          }}
          className={inputClass}
        />
        <span className="text-[#a1a1aa] text-sm">até</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value)
            setPage(1)
          }}
          className={inputClass}
        />
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
            <option key={c.id} value={c.id} className="bg-[#09090b]">
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </section>

      {/* Table */}
      <section className="bg-[#0c0c0f] border border-[#27272a] rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-[#a1a1aa] text-sm">Carregando…</div>
        ) : data && data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#121215] text-[#a1a1aa] uppercase text-[10px] tracking-widest">
                  <tr>
                    <th className="px-6 py-3 font-medium">Data</th>
                    <th className="px-6 py-3 font-medium">Descrição</th>
                    <th className="px-6 py-3 font-medium">Categoria</th>
                    <th className="px-6 py-3 font-medium text-right">Valor</th>
                    <th className="px-6 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272a]">
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
              <div className="px-6 py-4 border-t border-[#27272a] flex justify-between items-center">
                <p className="text-xs text-[#a1a1aa]">
                  {data.total} {data.total === 1 ? 'transação' : 'transações'}
                </p>
                <div className="flex gap-2 items-center">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1.5 rounded border border-[#27272a] text-xs text-[#a1a1aa] disabled:opacity-30 hover:bg-[#18181b]"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-[#a1a1aa]">
                    {page} / {totalPages}
                  </span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1.5 rounded border border-[#27272a] text-xs text-[#a1a1aa] disabled:opacity-30 hover:bg-[#18181b]"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-16 text-center text-[#a1a1aa] text-sm">Nenhuma transação encontrada.</div>
        )}
      </section>

      {/* Modal: New/Edit Transaction (reuses existing TransactionForm) */}
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
    </div>
  )
}

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
  const isIncome = tx.type === 'income'
  return (
    <tr className="hover:bg-[#18181b]/50 transition-colors">
      <td className="px-6 py-4 text-[#fafafa] whitespace-nowrap">{fmtDate(tx.date)}</td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#a1a1aa] text-base">
            {tx.icon || 'receipt_long'}
          </span>
          <span className="text-[#fafafa]">{tx.description}</span>
          {isAuto && (
            <span
              title="Gerado automaticamente a partir do Rendimentos"
              className="px-2 py-0.5 rounded-full bg-[#a78bfa]/15 border border-[#a78bfa]/30 text-[#a78bfa] text-[10px] font-bold uppercase tracking-wider"
            >
              auto
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        {tx.category ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#27272a] text-[#a1a1aa] text-xs">
            {tx.category.icon} {tx.category.name}
          </span>
        ) : (
          <span className="text-xs text-[#52525b]">—</span>
        )}
      </td>
      <td
        className={`px-6 py-4 text-right font-bold whitespace-nowrap ${
          isIncome ? 'text-[#34d399]' : 'text-[#ef4444]'
        }`}
      >
        {isIncome ? '+ ' : '- '}
        {fmt(Math.abs(tx.amount))}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex justify-end gap-3">
          {isAuto ? (
            <span
              title="Transação automática — edite via tela de Rendimentos"
              className="text-[#52525b] cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-lg">lock</span>
            </span>
          ) : (
            <>
              <button
                onClick={onEdit}
                className="text-[#a1a1aa] hover:text-[#a78bfa] transition-colors"
                aria-label="Editar"
              >
                <span className="material-symbols-outlined text-lg">edit</span>
              </button>
              <button
                onClick={onDelete}
                className="text-[#a1a1aa] hover:text-[#ef4444] transition-colors"
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

// --- Import Modal ----------------------------------------------------------

function ImportModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [activeImportId, setActiveImportId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [confirmResult, setConfirmResult] = useState<{ created: number; skipped_income: number } | null>(null)

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: getCategories })

  const { data: staged } = useQuery({
    queryKey: ['staged', activeImportId],
    queryFn: () => getStagedTransactions(activeImportId!),
    enabled: !!activeImportId,
  })

  // We poll the import status until it's not "processing" anymore.
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
    onError: (err) => alert(`Erro no upload: ${extractError(err)}`),
  })

  const processMut = useMutation({
    mutationFn: processImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-status', activeImportId] })
      queryClient.invalidateQueries({ queryKey: ['staged', activeImportId] })
    },
    onError: (err) => alert(`Erro no processamento: ${extractError(err)}`),
  })

  const confirmMut = useMutation({
    mutationFn: confirmImport,
    onSuccess: (result) => {
      setConfirmResult(result)
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
    },
    onError: (err) => alert(`Erro ao confirmar: ${extractError(err)}`),
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
        className="bg-[#0c0c0f] border border-[#27272a] rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#27272a] flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-[#fafafa]">Importar Extrato Bancário</h3>
            <p className="text-xs text-[#a1a1aa]">
              Receitas (salário, reembolsos) são ignoradas — use a tela de Rendimentos para isso.
            </p>
          </div>
          <button
            onClick={onClose}
            className="material-symbols-outlined text-[#a1a1aa] hover:text-[#fafafa]"
          >
            close
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Upload step */}
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
                dragOver ? 'border-[#a78bfa] bg-[#a78bfa]/5' : 'border-[#27272a] bg-[#09090b]'
              }`}
            >
              <span className="material-symbols-outlined text-5xl text-[#a1a1aa] mb-3 block">
                upload_file
              </span>
              <p className="text-[#fafafa] mb-2">Arraste seu extrato bancário aqui</p>
              <p className="text-xs text-[#a1a1aa] mb-4">Formatos aceitos: CSV, PDF</p>
              <label className="inline-block bg-[#a78bfa] text-[#0a0012] px-6 py-2 rounded-lg text-sm font-bold hover:bg-[#a78bfa]/90 cursor-pointer transition-colors">
                Escolher arquivo
                <input
                  type="file"
                  accept=".csv,.pdf"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </label>
              {uploadMut.isPending && (
                <p className="mt-3 text-sm text-[#a78bfa]">Enviando…</p>
              )}
            </div>
          )}

          {/* Process step */}
          {activeImport && status === 'pending' && (
            <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-6 flex items-center justify-between">
              <div>
                <p className="font-medium text-[#fafafa]">{activeImport.filename}</p>
                <p className="text-sm text-[#a1a1aa]">Pronto para processar com IA.</p>
              </div>
              <button
                onClick={() => processMut.mutate(activeImportId!)}
                disabled={processMut.isPending}
                className="bg-[#a78bfa] text-[#0a0012] px-6 py-2 rounded-lg text-sm font-bold hover:bg-[#a78bfa]/90 disabled:opacity-50 transition-colors"
              >
                {processMut.isPending ? 'Processando…' : 'Processar com IA'}
              </button>
            </div>
          )}

          {status === 'processing' && (
            <div className="bg-[#a78bfa]/5 border border-[#a78bfa]/20 rounded-lg p-6 text-center">
              <p className="text-[#a78bfa] font-medium">Processando com IA…</p>
              <p className="text-sm text-[#a1a1aa]">Isso pode levar alguns segundos</p>
            </div>
          )}

          {status === 'failed' && (
            <div className="bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg p-6">
              <p className="text-[#ef4444] font-medium">Erro no processamento</p>
              <p className="text-sm text-[#a1a1aa]">{activeImport?.error_message}</p>
            </div>
          )}

          {/* Review step */}
          {status === 'review' && staged && !confirmResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#fafafa]">
                  Revisar ({staged.length} transações)
                </h3>
                <button
                  onClick={() => confirmMut.mutate(activeImportId!)}
                  disabled={confirmMut.isPending}
                  className="bg-[#34d399] text-[#001a12] px-6 py-2 rounded-lg text-sm font-bold hover:bg-[#34d399]/90 disabled:opacity-50 transition-colors"
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

          {/* Confirm result */}
          {confirmResult && (
            <div className="bg-[#34d399]/5 border border-[#34d399]/20 rounded-lg p-6 text-center space-y-3">
              <span className="material-symbols-outlined text-[#34d399] text-5xl block">
                check_circle
              </span>
              <p className="text-[#fafafa] font-bold text-lg">Importação concluída</p>
              <p className="text-sm text-[#a1a1aa]">
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
                  className="px-4 py-2 border border-[#27272a] text-[#a1a1aa] rounded-lg text-sm font-medium hover:bg-[#18181b]"
                >
                  Importar outro
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-[#a78bfa] text-[#0a0012] rounded-lg text-sm font-bold hover:bg-[#a78bfa]/90"
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
