import type { Income } from '../../types'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

interface Props {
  incomes: Income[]
}

export default function IncomeHistory({ incomes }: Props) {
  return (
    <div className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden">
      <div className="p-6 border-b border-outline-variant flex justify-between items-center">
        <h3 className="text-lg font-bold">Histórico de Lançamentos</h3>
        <button className="text-sm text-primary font-bold hover:underline flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">visibility</span> Ver completo
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-container-high">
            <tr>
              <th className="px-6 py-3 text-xs font-bold text-on-secondary-container uppercase tracking-wider">Mês Referência</th>
              <th className="px-6 py-3 text-xs font-bold text-on-secondary-container uppercase tracking-wider text-right">Total Bruto</th>
              <th className="px-6 py-3 text-xs font-bold text-on-secondary-container uppercase tracking-wider text-right">Descontos</th>
              <th className="px-6 py-3 text-xs font-bold text-on-secondary-container uppercase tracking-wider text-right">Salário Líquido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {incomes.length > 0 ? (
              incomes.map((inc) => (
                <tr key={inc.id} className="hover:bg-surface-container-high transition-colors">
                  <td className="px-6 py-4 text-sm font-medium">
                    {MONTHS[inc.reference_month - 1]} {inc.reference_year}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-mono">
                    {fmt(Number(inc.total_gross))}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-mono text-error">
                    {fmt(Number(inc.total_deductions))}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-bold text-tertiary font-mono">
                    {fmt(Number(inc.net_salary))}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant text-sm">
                  Nenhum lançamento encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
