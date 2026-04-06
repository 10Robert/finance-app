import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getBalance,
  getMonthlyRevenue,
  getSpendingFlow,
  getTopCategories,
  getRecentTransactions,
} from '../api/client'
import SpendingFlowChart from '../components/charts/SpendingFlowChart'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export default function DashboardPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState<number | undefined>(now.getMonth() + 1)
  const [flowView, setFlowView] = useState<'month' | 'year'>('month')

  const params = { year, month }
  const flowParams = flowView === 'month' ? { year, month } : { year }

  const { data: balance } = useQuery({
    queryKey: ['balance', params],
    queryFn: () => getBalance(params),
  })

  const { data: revenue } = useQuery({
    queryKey: ['monthly-revenue', params],
    queryFn: () => getMonthlyRevenue(params),
  })

  const { data: spendingFlow } = useQuery({
    queryKey: ['spending-flow', flowParams],
    queryFn: () => getSpendingFlow(flowParams),
  })

  const { data: topCategories } = useQuery({
    queryKey: ['top-categories', params],
    queryFn: () => getTopCategories({ ...params, limit: 5 }),
  })

  const { data: recentTxns } = useQuery({
    queryKey: ['recent-transactions'],
    queryFn: () => getRecentTransactions(10),
  })

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  const fmtShort = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

  const toggleMonth = (m: number) => {
    setMonth(m)
  }

  const prevMonth = month && month > 1
    ? { label: `${MONTHS[(month - 2)]}`, m: month - 1 }
    : null

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Visão Geral</h2>
          <p className="text-sm text-secondary">Acompanhe seu desempenho financeiro {month ? 'mensal' : 'anual'}.</p>
        </div>
        <div className="flex items-center gap-3 bg-surface-container border border-outline-variant p-1 rounded-lg">
          {month && (
            <button
              className="px-4 py-1.5 text-xs font-medium rounded-md bg-secondary-container text-on-surface"
            >
              {MONTHS[month - 1]}, {year}
            </button>
          )}
          {prevMonth && (
            <button
              onClick={() => toggleMonth(prevMonth.m)}
              className="px-4 py-1.5 text-xs font-medium rounded-md text-secondary hover:text-on-surface hover:bg-secondary-container/50 transition-all"
            >
              {prevMonth.label}, {year}
            </button>
          )}
          <div className="h-4 w-[1px] bg-outline-variant mx-1" />
          <button
            onClick={() => setMonth(month ? undefined : now.getMonth() + 1)}
            className="p-1.5 rounded-md text-secondary hover:text-on-surface"
            title={month ? 'Ver visão anual' : 'Ver visão mensal'}
          >
            <span className="material-symbols-outlined text-sm">
              {month ? 'calendar_month' : 'today'}
            </span>
          </button>
        </div>
      </header>

      {/* Summary Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Saldo Total */}
        <div className="bg-surface-container border border-outline-variant p-6 rounded-xl relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-sm text-on-secondary-container mb-1">Saldo Total</p>
            <h2 className="text-3xl font-bold text-on-surface tracking-tight">
              {balance ? fmt(balance.balance) : 'R$ 0,00'}
            </h2>
            {balance?.variation_percent != null && (
              <div className={`mt-4 flex items-center gap-2 ${balance.variation_percent >= 0 ? 'text-tertiary' : 'text-error'}`}>
                <span className="material-symbols-outlined text-sm">
                  {balance.variation_percent >= 0 ? 'trending_up' : 'trending_down'}
                </span>
                <span className="text-xs font-medium">
                  {balance.variation_percent > 0 ? '+' : ''}{balance.variation_percent}%
                </span>
              </div>
            )}
          </div>
          <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-8xl text-primary/5 group-hover:text-primary/10 transition-colors">
            account_balance
          </span>
        </div>

        {/* Receitas */}
        <div className="bg-surface-container border border-outline-variant p-6 rounded-xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm text-on-secondary-container mb-1">Receitas ({month ? 'Mês' : 'Ano'})</p>
              <h2 className="text-2xl font-bold text-on-surface tracking-tight">
                {revenue ? fmt(revenue.revenue) : 'R$ 0,00'}
              </h2>
            </div>
            <div className="p-2 bg-tertiary/10 rounded-lg">
              <span className="material-symbols-outlined text-tertiary">arrow_upward</span>
            </div>
          </div>
          <div className="w-full bg-outline-variant h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-tertiary h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min((revenue?.revenue || 0) > 0 ? 85 : 0, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-secondary mt-2">
            {revenue && revenue.revenue > 0 ? 'Receita do período' : 'Sem receitas no período'}
          </p>
        </div>

        {/* Despesas */}
        <div className="bg-surface-container border border-outline-variant p-6 rounded-xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm text-on-secondary-container mb-1">Despesas ({month ? 'Mês' : 'Ano'})</p>
              <h2 className="text-2xl font-bold text-on-surface tracking-tight text-error">
                {balance ? fmt(balance.expense_total) : 'R$ 0,00'}
              </h2>
            </div>
            <div className="p-2 bg-error/10 rounded-lg">
              <span className="material-symbols-outlined text-error">arrow_downward</span>
            </div>
          </div>
          <div className="w-full bg-outline-variant h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-error h-full rounded-full transition-all duration-500"
              style={{
                width: `${balance && balance.income_total > 0
                  ? Math.min((Number(balance.expense_total) / Number(balance.income_total)) * 100, 100)
                  : 0}%`
              }}
            />
          </div>
          <p className="text-[10px] text-secondary mt-2">
            {balance && balance.income_total > 0
              ? `${Math.round((Number(balance.expense_total) / Number(balance.income_total)) * 100)}% das receitas`
              : 'Sem dados'}
          </p>
        </div>

        {/* Resultado do Mês (Receita - Despesa) */}
        <div className="bg-surface-container border border-outline-variant p-6 rounded-xl relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-sm text-on-secondary-container mb-1">Resultado ({month ? 'Mês' : 'Ano'})</p>
            {(() => {
              const incomeVal = balance ? Number(balance.income_total) : 0
              const expenseVal = balance ? Number(balance.expense_total) : 0
              const resultado = incomeVal - expenseVal
              const isPositive = resultado >= 0
              return (
                <>
                  <h2 className={`text-2xl font-bold tracking-tight ${isPositive ? 'text-tertiary' : 'text-error'}`}>
                    {isPositive ? '+ ' : '- '}{fmt(Math.abs(resultado))}
                  </h2>
                  <div className={`mt-4 flex items-center gap-2 ${isPositive ? 'text-tertiary' : 'text-error'}`}>
                    <span className="material-symbols-outlined text-sm">
                      {isPositive ? 'check_circle' : 'warning'}
                    </span>
                    <span className="text-xs font-medium">
                      {isPositive ? 'Você está no positivo!' : 'Gastos excedem receitas'}
                    </span>
                  </div>
                </>
              )
            })()}
          </div>
          <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-8xl text-primary/5 group-hover:text-primary/10 transition-colors">
            calculate
          </span>
        </div>
      </section>

      {/* Middle: Chart + Categories */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spending Flow */}
        <div className="lg:col-span-2 bg-surface-container border border-outline-variant p-6 rounded-xl flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold text-lg">Fluxo de Gastos</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setFlowView('month')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  flowView === 'month' ? 'bg-secondary-container text-on-surface' : 'text-secondary hover:bg-secondary-container'
                }`}
              >
                Mês
              </button>
              <button
                onClick={() => setFlowView('year')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  flowView === 'year' ? 'bg-secondary-container text-on-surface' : 'text-secondary hover:bg-secondary-container'
                }`}
              >
                Ano
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-[300px]">
            {spendingFlow && spendingFlow.points.length > 0 ? (
              <SpendingFlowChart data={spendingFlow.points} />
            ) : (
              <div className="flex items-center justify-center h-full text-secondary text-sm">
                Sem dados de gastos no período
              </div>
            )}
          </div>
        </div>

        {/* Categories Column */}
        <div className="space-y-6">
          {/* Highlight Card */}
          <div className="bg-primary p-6 rounded-xl text-on-primary relative overflow-hidden">
            <h4 className="font-bold mb-2">Resumo do Período</h4>
            <p className="text-xs opacity-80 mb-4">Balanço {month ? 'mensal' : 'anual'}</p>
            <div className="text-2xl font-black mb-4">
              {balance ? fmt(balance.balance) : 'R$ 0,00'}
            </div>
            <div className="w-full bg-on-primary/20 h-2 rounded-full">
              <div
                className="bg-on-primary h-full rounded-full transition-all duration-500"
                style={{
                  width: `${balance && balance.income_total > 0
                    ? Math.min(100 - (Number(balance.expense_total) / Number(balance.income_total)) * 100, 100)
                    : 0}%`
                }}
              />
            </div>
            <span className="material-symbols-outlined absolute top-4 right-4 opacity-20 text-4xl">savings</span>
          </div>

          {/* Top Categories */}
          <div className="bg-surface-container border border-outline-variant p-6 rounded-xl">
            <h4 className="font-bold text-sm mb-4">Principais Categorias</h4>
            <div className="space-y-4">
              {topCategories && topCategories.length > 0 ? (
                topCategories.map((cat, i) => (
                  <div key={cat.category_name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: cat.color || '#a78bfa' }}
                      />
                      <span className="text-xs text-on-surface-variant">{cat.category_name}</span>
                    </div>
                    <span className="text-xs font-bold">{fmtShort(cat.total)}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-secondary">Sem despesas no período</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Recent Transactions */}
      <section className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden">
        <div className="p-6 border-b border-outline-variant flex justify-between items-center">
          <h3 className="font-bold text-lg">Transações Recentes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-secondary border-b border-outline-variant">
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Descrição</th>
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Categoria</th>
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Data</th>
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {recentTxns && recentTxns.length > 0 ? (
                recentTxns.map((txn) => (
                  <tr key={txn.id} className="hover:bg-surface-variant transition-colors group">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className="p-2 bg-secondary-container rounded-lg group-hover:bg-surface-container-highest">
                        <span className="material-symbols-outlined text-primary text-sm">{txn.icon}</span>
                      </div>
                      <span className="text-sm font-medium">{txn.description}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs px-2 py-1 bg-outline-variant rounded-full text-on-surface-variant">
                        {txn.category_name || 'Sem categoria'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-secondary">
                      {new Date(txn.date + 'T00:00:00').toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className={`px-6 py-4 text-sm font-bold ${
                      txn.type === 'income' ? 'text-tertiary' : 'text-error'
                    }`}>
                      {txn.type === 'income' ? '+ ' : '- '}{fmt(Math.abs(txn.amount))}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-secondary text-sm">
                    Nenhuma transação encontrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
