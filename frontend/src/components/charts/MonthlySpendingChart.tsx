import { useQuery } from '@tanstack/react-query'
import { getChart6Months, getBalance } from '../../api/client'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

export default function MonthlySpendingChart() {
  const { data: chartData } = useQuery({
    queryKey: ['chart-6months'],
    queryFn: getChart6Months,
  })

  const now = new Date()
  const { data: balance } = useQuery({
    queryKey: ['balance', { year: now.getFullYear(), month: now.getMonth() + 1 }],
    queryFn: () => getBalance({ year: now.getFullYear(), month: now.getMonth() + 1 }),
  })

  const maxTotal = chartData ? Math.max(...chartData.map((d) => Number(d.total)), 1) : 1

  return (
    <section className="bg-surface-container border border-outline-variant rounded-xl p-6 flex flex-col">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className="text-on-surface font-bold text-lg tracking-tight">Gastos Mensais</h3>
          <p className="text-on-surface-variant text-xs">Comparativo dos últimos 6 meses</p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-on-surface">
            {chartData && chartData.length > 0 ? fmt(Number(chartData[chartData.length - 1].total)) : 'R$ 0'}
          </span>
          {balance?.variation_percent != null && (
            <p className={`text-xs flex items-center justify-end font-bold ${
              Number(balance.variation_percent) <= 0 ? 'text-tertiary' : 'text-error'
            }`}>
              <span className="material-symbols-outlined text-xs mr-1">
                {Number(balance.variation_percent) <= 0 ? 'arrow_downward' : 'arrow_upward'}
              </span>
              {Math.abs(Number(balance.variation_percent))}% vs mês anterior
            </p>
          )}
        </div>
      </div>
      <div className="flex-1 flex items-end justify-between gap-2 pt-4">
        {chartData?.map((item, i) => {
          const isLast = i === chartData.length - 1
          const height = maxTotal > 0 ? Math.max((Number(item.total) / maxTotal) * 180, 8) : 8
          return (
            <div key={item.month_label} className="flex flex-col items-center gap-2 flex-1 group">
              <div
                className={`w-full rounded-t-sm transition-colors ${
                  isLast ? 'bg-primary' : 'bg-secondary-container group-hover:bg-primary/50'
                }`}
                style={{ height: `${height}px` }}
              />
              <span className={`text-[10px] font-bold uppercase ${
                isLast ? 'text-primary font-black' : 'text-on-surface-variant'
              }`}>
                {item.month_label}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
