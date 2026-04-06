import { useState } from 'react'
import type { Category, TransactionCreate } from '../types'

interface Props {
  categories: Category[]
  initialData?: Partial<TransactionCreate>
  onSubmit: (data: TransactionCreate) => void
  onClose: () => void
  isEdit: boolean
}

export default function TransactionForm({ categories, initialData, onSubmit, onClose, isEdit }: Props) {
  const [type, setType] = useState<'expense' | 'income'>(initialData?.type || 'expense')
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState(initialData?.description || '')
  const [amount, setAmount] = useState(initialData?.amount ? String(initialData.amount) : '')
  const [categoryId, setCategoryId] = useState<string>(initialData?.category_id ? String(initialData.category_id) : '')
  const [notes, setNotes] = useState(initialData?.notes || '')

  const filteredCategories = categories.filter((c) => c.type === type)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const amountNum = parseFloat(amount)
    onSubmit({
      date,
      description,
      amount: type === 'expense' ? -Math.abs(amountNum) : Math.abs(amountNum),
      type,
      category_id: categoryId ? Number(categoryId) : null,
      notes: notes || null,
    })
  }

  const inputClass = 'w-full bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-container border border-outline-variant rounded-xl shadow-2xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-on-surface mb-4">
          {isEdit ? 'Editar Transação' : 'Nova Transação'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setType('expense'); setCategoryId('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                type === 'expense' ? 'bg-error/20 text-error border border-error/50' : 'bg-secondary-container text-secondary'
              }`}
            >
              Despesa
            </button>
            <button
              type="button"
              onClick={() => { setType('income'); setCategoryId('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                type === 'income' ? 'bg-tertiary/20 text-tertiary border border-tertiary/50' : 'bg-secondary-container text-secondary'
              }`}
            >
              Receita
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-secondary mb-1">Data</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Valor (R$)</label>
              <input type="number" required step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0,00" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1">Descrição</label>
            <input type="text" required value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} placeholder="Ex: Supermercado" />
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1">Categoria</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
              <option value="">Sem categoria</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1">Notas (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows={2} placeholder="Observações..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-primary text-on-primary py-2 rounded-lg text-sm font-medium hover:bg-primary-container transition-colors"
            >
              {isEdit ? 'Salvar' : 'Criar'}
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
