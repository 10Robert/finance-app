import { useQuery } from '@tanstack/react-query'
import { getCategoryProgress } from '../../api/client'

const VIOLET_SHADES = ['#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6']

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

export default function CategoryDistribution() {
  const { data: categories } = useQuery({
    queryKey: ['category-progress'],
    queryFn: () => getCategoryProgress(),
  })

  return (
    <section className="bg-surface-container border border-outline-variant rounded-xl p-6 flex flex-col">
      <div className="mb-6">
        <h3 className="text-on-surface font-bold text-lg tracking-tight">Gastos por Categoria</h3>
        <p className="text-on-surface-variant text-xs">Distribuição de despesas no mês atual</p>
      </div>
      <div className="space-y-5">
        {categories && categories.length > 0 ? (
          categories.map((cat, i) => (
            <div key={cat.name} className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                <span className="text-[#d4d4d8]">{cat.name}</span>
                <span className="text-on-surface">{fmt(Number(cat.total))}</span>
              </div>
              <div className="h-2 bg-[#27272a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(Number(cat.percentage), 2)}%`,
                    backgroundColor: VIOLET_SHADES[i % VIOLET_SHADES.length],
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-on-surface-variant">Sem despesas no período</p>
        )}
      </div>
    </section>
  )
}
