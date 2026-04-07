import type { Transaction } from '../types'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(v))

interface Props {
  transactions: Transaction[]
  title: string
  icon: string
}

export default function TransactionListCard({ transactions, title, icon }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h4 className="text-on-surface font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">{icon}</span>
          {title}
        </h4>
      </div>
      <div className="bg-surface-container border border-outline-variant rounded-xl divide-y divide-[#27272a]/50">
        {transactions.length > 0 ? (
          transactions.map((txn) => (
            <div key={txn.id} className="p-4 flex items-center justify-between hover:bg-[#18181b]/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined">{txn.icon || 'receipt_long'}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-on-surface text-sm">{txn.description}</p>
                    {txn.is_recurring && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] bg-tertiary/10 text-tertiary border border-tertiary/20 font-black">
                        RECORRENTE
                      </span>
                    )}
                  </div>
                  <p className="text-on-surface-variant text-xs uppercase tracking-tighter font-medium">
                    {txn.category?.name || 'Sem categoria'}
                    {txn.is_recurring && txn.recurring_day
                      ? ` • Todo dia ${String(txn.recurring_day).padStart(2, '0')}`
                      : ` • ${new Date(txn.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-on-surface">- {fmt(Number(txn.amount))}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="p-6 text-center text-on-surface-variant text-sm">
            Nenhuma transação encontrada
          </div>
        )}
      </div>
    </div>
  )
}
