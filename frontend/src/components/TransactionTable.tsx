import { memo } from 'react'
import type { Transaction } from '../types'

interface Props {
  transactions: Transaction[]
  onEdit: (id: number) => void
  onDelete: (id: number) => void
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function TransactionTable({ transactions, onEdit, onDelete }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Descrição</th>
            <th className="px-4 py-3">Categoria</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-600">
                {new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR')}
              </td>
              <td className="px-4 py-3 text-gray-800">{t.description}</td>
              <td className="px-4 py-3">
                {t.category ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-600">
                    {t.category.icon} {t.category.name}
                  </span>
                ) : (
                  <span className="text-gray-400 text-xs">Sem categoria</span>
                )}
              </td>
              <td className={`px-4 py-3 text-right font-medium ${
                t.type === 'income' ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {t.type === 'income' ? '+' : '-'}{fmt(Math.abs(t.amount))}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onEdit(t.id)}
                  className="text-blue-500 hover:text-blue-700 text-xs mr-3"
                >
                  Editar
                </button>
                <button
                  onClick={() => onDelete(t.id)}
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default memo(TransactionTable)
