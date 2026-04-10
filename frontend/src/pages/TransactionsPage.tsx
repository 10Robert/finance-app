import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTransactions, getCategories, createTransaction, deleteTransaction, updateTransaction } from '../api/client'
import type { TransactionCreate } from '../types'
import TransactionForm from '../components/TransactionForm'

export default function TransactionsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

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

  const extractError = (err: unknown): string => {
    const e = err as { response?: { data?: { detail?: unknown } }; message?: string }
    const detail = e?.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d?.msg ?? '').join('; ')
    return e?.message ?? 'Erro desconhecido ao salvar transação'
  }

  const createMut = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setShowForm(false)
    },
    onError: (err) => {
      alert(`Erro ao criar transação: ${extractError(err)}`)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TransactionCreate> }) =>
      updateTransaction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setEditingId(null)
      setShowForm(false)
    },
    onError: (err) => {
      alert(`Erro ao atualizar transação: ${extractError(err)}`)
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  })

  const handleSubmit = (formData: TransactionCreate) => {
    if (editingId) {
      updateMut.mutate({ id: editingId, data: formData })
    } else {
      createMut.mutate(formData)
    }
  }

  const handleDelete = (id: number) => {
    if (confirm('Tem certeza que deseja excluir esta transação?')) {
      deleteMut.mutate(id)
    }
  }

  const editingTransaction = editingId ? data?.items.find((t) => t.id === editingId) : undefined
  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Transações</h2>
          <p className="text-sm text-secondary">Gerencie suas transações financeiras.</p>
        </div>
        <button
          onClick={() => { setEditingId(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-container transition-colors"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Nova Transação
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-surface-container border border-outline-variant rounded-xl p-4">
        <input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
          className="bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface"
        />
        <span className="text-secondary text-sm">a</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
          className="bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface"
        />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          className="bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface"
        >
          <option value="">Todos os tipos</option>
          <option value="expense">Despesa</option>
          <option value="income">Receita</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
          className="bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface"
        >
          <option value="">Todas categorias</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-secondary">Carregando...</div>
      ) : data && data.items.length > 0 ? (
        <div className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-secondary border-b border-outline-variant">
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Descrição</th>
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Categoria</th>
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Data</th>
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Valor</th>
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {data.items.map((t) => (
                <tr key={t.id} className="hover:bg-surface-variant transition-colors group">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium">{t.description}</span>
                  </td>
                  <td className="px-6 py-4">
                    {t.category ? (
                      <span className="text-xs px-2 py-1 bg-outline-variant rounded-full text-on-surface-variant">
                        {t.category.icon} {t.category.name}
                      </span>
                    ) : (
                      <span className="text-xs text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-secondary">
                    {new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className={`px-6 py-4 text-sm font-bold ${t.type === 'income' ? 'text-tertiary' : 'text-error'}`}>
                    {t.type === 'income' ? '+ ' : '- '}{fmt(Math.abs(t.amount))}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingId(t.id); setShowForm(true) }}
                        className="text-primary text-xs hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-error text-xs hover:underline"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="p-4 border-t border-outline-variant flex justify-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 rounded border border-outline-variant text-sm text-secondary disabled:opacity-30 hover:bg-surface-variant"
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-sm text-secondary">
                {page} / {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 rounded border border-outline-variant text-sm text-secondary disabled:opacity-30 hover:bg-surface-variant"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface-container border border-outline-variant rounded-xl p-12 text-center text-secondary text-sm">
          Nenhuma transação encontrada
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <TransactionForm
          categories={categories || []}
          initialData={editingTransaction ? {
            date: editingTransaction.date,
            description: editingTransaction.description,
            amount: Math.abs(editingTransaction.amount),
            type: editingTransaction.type,
            category_id: editingTransaction.category_id,
            notes: editingTransaction.notes,
          } : undefined}
          onSubmit={handleSubmit}
          onClose={() => { setShowForm(false); setEditingId(null) }}
          isEdit={!!editingId}
        />
      )}
    </div>
  )
}
