import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCategories,
  createCategory,
  deleteCategory,
  getSalaryConfig,
  saveSalaryConfig,
} from '../api/client'

const ICON_OPTIONS = [
  { icon: 'home', label: 'Moradia' },
  { icon: 'restaurant', label: 'Alimentação' },
  { icon: 'commute', label: 'Transporte' },
  { icon: 'celebration', label: 'Lazer' },
  { icon: 'shopping_bag', label: 'Compras' },
  { icon: 'sports_esports', label: 'Jogos' },
  { icon: 'directions_car', label: 'Veículo' },
  { icon: 'local_hospital', label: 'Saúde' },
  { icon: 'school', label: 'Educação' },
  { icon: 'pets', label: 'Pets' },
  { icon: 'fitness_center', label: 'Fitness' },
  { icon: 'subscriptions', label: 'Assinaturas' },
  { icon: 'checkroom', label: 'Vestuário' },
  { icon: 'flight', label: 'Viagens' },
  { icon: 'child_care', label: 'Filhos' },
  { icon: 'savings', label: 'Poupança' },
]

export default function SettingsPage() {
  const queryClient = useQueryClient()

  // ── Salary State ──
  const { data: salaryConfig } = useQuery({
    queryKey: ['salary-config'],
    queryFn: getSalaryConfig,
  })

  const [salary, setSalary] = useState('')
  const [salarySaved, setSalarySaved] = useState(false)

  useEffect(() => {
    if (salaryConfig?.base_salary != null) {
      setSalary(String(salaryConfig.base_salary))
    }
  }, [salaryConfig])

  const salaryMutation = useMutation({
    mutationFn: (value: number) =>
      saveSalaryConfig({
        base_salary: value,
        overtime_hour_rate: salaryConfig?.overtime_hour_rate ?? 0,
        meal_allowance: salaryConfig?.meal_allowance ?? 0,
        health_plan_deduction: salaryConfig?.health_plan_deduction ?? 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-config'] })
      setSalarySaved(true)
      setTimeout(() => setSalarySaved(false), 2500)
    },
  })

  // ── Categories State ──
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const [catName, setCatName] = useState('')
  const [catIcon, setCatIcon] = useState('shopping_bag')
  const [showAllIcons, setShowAllIcons] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const createCatMutation = useMutation({
    mutationFn: () => createCategory({ name: catName, type: 'expense', icon: catIcon }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setCatName('')
      setCatIcon('shopping_bag')
    },
  })

  const deleteCatMutation = useMutation({
    mutationFn: (id: number) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setDeletingId(null)
    },
  })

  const expenseCategories = categories?.filter((c) => c.type === 'expense') ?? []
  const visibleIcons = showAllIcons ? ICON_OPTIONS : ICON_OPTIONS.slice(0, 3)

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* ═══ Perfil Financeiro ═══ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">account_circle</span>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            Perfil Financeiro
          </h3>
        </div>

        <div className="bg-surface-container border border-outline-variant rounded-xl p-6 flex flex-col md:flex-row md:items-end gap-6">
          <div className="flex-1 space-y-2">
            <label className="block text-xs font-medium text-on-surface-variant" htmlFor="salario">
              Salário Bruto Mensal
            </label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-semibold text-sm">
                R$
              </span>
              <input
                id="salario"
                type="number"
                step="0.01"
                min="0"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="0,00"
                className="w-full bg-[#09090b] border border-outline-variant rounded-lg py-3 pl-12 pr-4 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-[#3f3f46]"
              />
            </div>
          </div>
          <button
            onClick={() => {
              const value = parseFloat(salary)
              if (!isNaN(value) && value > 0) salaryMutation.mutate(value)
            }}
            disabled={salaryMutation.isPending}
            className="bg-primary hover:bg-primary-container text-on-primary font-bold px-8 py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">
              {salarySaved ? 'check' : 'save'}
            </span>
            {salaryMutation.isPending
              ? 'Salvando...'
              : salarySaved
              ? 'Salvo!'
              : 'Salvar Alterações'}
          </button>
        </div>
      </section>

      {/* ═══ Gerenciar Categorias ═══ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">category</span>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            Gerenciar Categorias
          </h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Formulário de Criar Categoria ── */}
          <div className="lg:col-span-1 bg-surface-container border border-outline-variant rounded-xl p-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Crie novas categorias para organizar seus gastos com precisão cirúrgica.
              </p>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-on-surface-variant">
                  Nome da Categoria
                </label>
                <input
                  type="text"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Ex: Assinaturas"
                  className="w-full bg-[#09090b] border border-outline-variant rounded-lg py-3 px-4 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-[#3f3f46]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && catName.trim()) createCatMutation.mutate()
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-on-surface-variant">
                  Escolher Ícone
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {visibleIcons.map((opt) => (
                    <button
                      key={opt.icon}
                      onClick={() => setCatIcon(opt.icon)}
                      title={opt.label}
                      className={`aspect-square rounded-lg flex items-center justify-center transition-all ${
                        catIcon === opt.icon
                          ? 'border-2 border-primary bg-primary/10 text-primary'
                          : 'bg-[#18181b] border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                      }`}
                    >
                      <span className="material-symbols-outlined">{opt.icon}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setShowAllIcons(!showAllIcons)}
                    title={showAllIcons ? 'Ver menos' : 'Ver mais ícones'}
                    className={`aspect-square rounded-lg flex items-center justify-center transition-all ${
                      showAllIcons
                        ? 'border-2 border-primary bg-primary/10 text-primary'
                        : 'bg-[#18181b] border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                    }`}
                  >
                    <span className="material-symbols-outlined">
                      {showAllIcons ? 'expand_less' : 'more_horiz'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                if (catName.trim()) createCatMutation.mutate()
              }}
              disabled={!catName.trim() || createCatMutation.isPending}
              className="w-full border border-primary text-primary hover:bg-primary/10 font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              {createCatMutation.isPending ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>

          {/* ── Lista de Categorias ── */}
          <div className="lg:col-span-2 bg-surface-container border border-outline-variant rounded-xl overflow-hidden">
            <div className="p-6 border-b border-outline-variant bg-surface-container-high/50 flex justify-between items-center">
              <h4 className="text-sm font-semibold text-on-surface">Categorias Ativas</h4>
              <span className="text-xs text-on-surface-variant">
                {expenseCategories.length} categori{expenseCategories.length === 1 ? 'a' : 'as'}
              </span>
            </div>

            <div className="divide-y divide-outline-variant max-h-[480px] overflow-y-auto">
              {expenseCategories.length > 0 ? (
                expenseCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-4 hover:bg-[#18181b]/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-[#18181b] flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined">
                          {cat.icon || 'category'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-on-surface">{cat.name}</p>
                        <p className="text-[10px] text-on-surface-variant">
                          {cat.type === 'expense' ? 'Despesa' : 'Receita'}
                        </p>
                      </div>
                    </div>

                    {deletingId === cat.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => deleteCatMutation.mutate(cat.id)}
                          className="px-3 py-1.5 text-xs font-bold bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="px-3 py-1.5 text-xs font-medium text-on-surface-variant rounded-lg hover:bg-[#18181b] transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(cat.id)}
                        className="p-2 text-on-surface-variant/40 hover:text-error transition-colors rounded-lg hover:bg-error/10"
                      >
                        <span className="material-symbols-outlined text-xl">delete</span>
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-on-surface-variant text-sm">
                  <span className="material-symbols-outlined text-4xl mb-2 block opacity-30">
                    category
                  </span>
                  Nenhuma categoria de gastos cadastrada
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Informações da Conta ═══ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">info</span>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            Resumo da Conta
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-container border border-outline-variant rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <span className="material-symbols-outlined text-primary text-sm">payments</span>
              </div>
              <p className="text-xs font-medium text-on-surface-variant">Salário Cadastrado</p>
            </div>
            <p className="text-lg font-bold text-on-surface">
              {salaryConfig?.base_salary ? fmt(salaryConfig.base_salary) : 'Não definido'}
            </p>
          </div>

          <div className="bg-surface-container border border-outline-variant rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-tertiary/10 rounded-lg">
                <span className="material-symbols-outlined text-tertiary text-sm">category</span>
              </div>
              <p className="text-xs font-medium text-on-surface-variant">Categorias de Gasto</p>
            </div>
            <p className="text-lg font-bold text-on-surface">
              {expenseCategories.length}
            </p>
          </div>

          <div className="bg-surface-container border border-outline-variant rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <span className="material-symbols-outlined text-primary text-sm">tag</span>
              </div>
              <p className="text-xs font-medium text-on-surface-variant">Total de Categorias</p>
            </div>
            <p className="text-lg font-bold text-on-surface">
              {categories?.length ?? 0}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
