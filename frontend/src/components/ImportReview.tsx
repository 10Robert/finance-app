import { useState } from 'react'
import type { StagedTransaction, Category } from '../types'

interface Props {
  staged: StagedTransaction[]
  categories: Category[]
  onUpdate: (updates: { id: number; category_id?: number; accepted?: boolean }[]) => void
}

export default function ImportReview({ staged, categories, onUpdate }: Props) {
  const [edits, setEdits] = useState<Record<number, { category_id?: number; accepted?: boolean }>>({})

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  const handleCategoryChange = (id: number, categoryId: number) => {
    const updated = { ...edits, [id]: { ...edits[id], category_id: categoryId } }
    setEdits(updated)
    onUpdate([{ id, category_id: categoryId }])
  }

  const handleAcceptToggle = (id: number, accepted: boolean) => {
    const updated = { ...edits, [id]: { ...edits[id], accepted } }
    setEdits(updated)
    onUpdate([{ id, accepted }])
  }

  const getAccepted = (item: StagedTransaction) => edits[item.id]?.accepted ?? item.accepted
  const getCategoryId = (item: StagedTransaction) => edits[item.id]?.category_id ?? item.category_id

  return (
    <div className="bg-surface-container border border-outline-variant rounded-xl overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-xs text-secondary border-b border-outline-variant">
            <th className="px-4 py-3 w-10">Acc</th>
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Descrição</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="px-4 py-3">Categoria</th>
            <th className="px-4 py-3 text-center">Confiança</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {staged.map((item) => {
            const confidence = item.confidence ? Number(item.confidence) : 0
            const lowConfidence = confidence < 0.7
            return (
              <tr
                key={item.id}
                className={`transition-colors ${
                  !getAccepted(item) ? 'opacity-40' : lowConfidence ? 'bg-yellow-900/10' : 'hover:bg-surface-variant'
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={getAccepted(item)}
                    onChange={(e) => handleAcceptToggle(item.id, e.target.checked)}
                    className="rounded border-outline-variant"
                  />
                </td>
                <td className="px-4 py-3 text-sm text-secondary whitespace-nowrap">
                  {new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3 text-sm">{item.description}</td>
                <td className={`px-4 py-3 text-sm text-right font-bold whitespace-nowrap ${
                  item.type === 'income' ? 'text-tertiary' : 'text-error'
                }`}>
                  {item.type === 'income' ? '+ ' : '- '}{fmt(Math.abs(item.amount))}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={getCategoryId(item) || ''}
                    onChange={(e) => handleCategoryChange(item.id, Number(e.target.value))}
                    className="bg-surface-container-high border border-outline-variant rounded px-2 py-1 text-xs text-on-surface w-full"
                  >
                    <option value="">Sem categoria</option>
                    {categories.filter((c) => c.type === item.type).map((c) => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    confidence >= 0.8 ? 'text-tertiary' : confidence >= 0.5 ? 'text-yellow-400' : 'text-error'
                  }`}>
                    {Math.round(confidence * 100)}%
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
