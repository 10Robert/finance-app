import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSalaryConfig, saveSalaryConfig, launchIncome, getIncomes } from '../api/client'
import { calculateNetSalary } from '../utils/salaryCalc'
import MonthlySummary from '../components/income/MonthlySummary'
import IncomeHistory from '../components/income/IncomeHistory'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const MULTIPLIERS = [
  { label: '30%', value: 0.3 },
  { label: '50%', value: 0.5 },
  { label: '70%', value: 0.7 },
]

export default function SalaryPage() {
  const qc = useQueryClient()
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  // Form state
  const [overtimeHours, setOvertimeHours] = useState(0)
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(0.3)
  const [monthlyBonus, setMonthlyBonus] = useState(0)
  const [discountsAbsences, setDiscountsAbsences] = useState(0)

  // Config modal
  const [showConfig, setShowConfig] = useState(false)
  const [cfgBaseSalary, setCfgBaseSalary] = useState('')
  const [cfgMealAllowance, setCfgMealAllowance] = useState('')
  const [cfgHealthPlan, setCfgHealthPlan] = useState('')
  const [cfgHourRate, setCfgHourRate] = useState('')

  const { data: config } = useQuery({
    queryKey: ['salary-config'],
    queryFn: getSalaryConfig,
  })

  const { data: incomes } = useQuery({
    queryKey: ['incomes'],
    queryFn: getIncomes,
  })

  // Fill config form when data loads
  const openConfigModal = () => {
    if (config) {
      setCfgBaseSalary(String(config.base_salary))
      setCfgMealAllowance(String(config.meal_allowance || 0))
      setCfgHealthPlan(String(config.health_plan_deduction || 0))
      setCfgHourRate(String(config.overtime_hour_rate))
    }
    setShowConfig(true)
  }

  const saveConfigMut = useMutation({
    mutationFn: () =>
      saveSalaryConfig({
        base_salary: parseFloat(cfgBaseSalary) || 0,
        overtime_hour_rate: parseFloat(cfgHourRate) || 0,
        meal_allowance: parseFloat(cfgMealAllowance) || 0,
        health_plan_deduction: parseFloat(cfgHealthPlan) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salary-config'] })
      setShowConfig(false)
    },
  })

  const launchMut = useMutation({
    mutationFn: () =>
      launchIncome({
        reference_month: selectedMonth,
        reference_year: selectedYear,
        overtime_hours: overtimeHours,
        overtime_multiplier: overtimeMultiplier,
        monthly_bonus: monthlyBonus,
        discounts_absences: discountsAbsences,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incomes'] })
      setOvertimeHours(0)
      setMonthlyBonus(0)
      setDiscountsAbsences(0)
    },
  })

  const launchErrorMessage = (() => {
    if (!launchMut.isError) return null
    const e = launchMut.error as { response?: { data?: { detail?: unknown } }; message?: string }
    const detail = e?.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d?.msg ?? '').join('; ')
    return e?.message ?? 'Erro desconhecido ao lançar rendimento'
  })()

  // Real-time calculation preview
  const calc = useMemo(() => {
    const baseSalary = config ? Number(config.base_salary) : 0
    const mealAllowance = config ? Number(config.meal_allowance || 0) : 0
    const healthPlan = config ? Number(config.health_plan_deduction || 0) : 0

    return calculateNetSalary(
      baseSalary,
      mealAllowance,
      healthPlan,
      overtimeHours,
      overtimeMultiplier,
      monthlyBonus,
      discountsAbsences,
    )
  }, [config, overtimeHours, overtimeMultiplier, monthlyBonus, discountsAbsences])

  const todayStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()

  const inputClass =
    'w-full bg-surface-container-low border border-outline-variant rounded-lg py-3 px-4 text-on-surface focus:ring-2 focus:ring-primary outline-none font-mono'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-on-surface">Gestão de Rendimentos</h1>
          <p className="text-on-secondary-container">Gerencie seu salário base, benefícios e entradas variáveis.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-container border border-outline-variant rounded-lg text-sm font-medium text-on-surface">
            <span className="material-symbols-outlined text-primary text-xl">calendar_today</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent outline-none font-mono cursor-pointer"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1} className="bg-surface-container">{m}</option>
              ))}
            </select>
            <input
              type="number"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent outline-none font-mono w-16"
            />
          </div>
          <button
            onClick={openConfigModal}
            className="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface hover:bg-surface-container transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-primary">tune</span>
            Configurações Fixas
          </button>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Main Form Section */}
        <div className="lg:col-span-2 space-y-8">
          {/* Lancamento do Dia */}
          <div className="bg-surface-container border border-outline-variant rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">edit_calendar</span>
                  Lançamento do Dia
                </h3>
                <button className="flex items-center gap-1 px-2 py-1 bg-surface-container-low border border-outline-variant rounded text-[10px] font-bold text-on-secondary-container hover:text-on-surface transition-colors uppercase tracking-tighter">
                  <span className="material-symbols-outlined text-xs">event</span>
                  Alterar Data
                </button>
              </div>
              <span className="text-xs font-mono text-tertiary bg-tertiary-container/20 px-2 py-1 rounded">{todayStr}</span>
            </div>

            {/* Horas Extras */}
            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-on-secondary-container">Horas Extras</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <span className="text-sm text-on-surface-variant">Quantidade de Horas</span>
                  <input
                    type="number"
                    step="0.5"
                    value={overtimeHours || ''}
                    onChange={(e) => setOvertimeHours(parseFloat(e.target.value) || 0)}
                    placeholder="00:00"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <span className="text-sm text-on-surface-variant">Percentual de Adicional</span>
                  <div className="grid grid-cols-3 gap-2 bg-surface-container-low p-1 rounded-lg border border-outline-variant">
                    {MULTIPLIERS.map((m) => (
                      <button
                        key={m.value}
                        onClick={() => setOvertimeMultiplier(m.value)}
                        className={`py-2 text-sm font-bold rounded-md transition-all ${
                          overtimeMultiplier === m.value
                            ? 'bg-primary-container text-on-primary-container shadow-lg'
                            : 'text-on-secondary-container hover:bg-surface-variant'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Ajustes Variaveis */}
            <div className="space-y-4 pt-4 border-t border-outline-variant">
              <label className="text-xs font-bold uppercase tracking-widest text-on-secondary-container">Ajustes Variáveis</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <span className="text-sm text-on-surface-variant">Bônus do Mês</span>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary font-mono">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={monthlyBonus || ''}
                      onChange={(e) => setMonthlyBonus(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className={`${inputClass} pl-12`}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-sm text-on-surface-variant">Descontos (Atrasos/Faltas)</span>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-error font-mono">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={discountsAbsences || ''}
                      onChange={(e) => setDiscountsAbsences(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className={`${inputClass} pl-12`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-6 space-y-3">
              <button
                onClick={() => launchMut.mutate()}
                disabled={!config || launchMut.isPending}
                className="w-full py-4 bg-primary text-on-primary font-black uppercase tracking-widest rounded-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                <span className="material-symbols-outlined">save</span>
                {launchMut.isPending ? 'Processando...' : 'Calcular e Lançar'}
              </button>
              {!config && (
                <p className="text-xs text-on-surface-variant text-center">
                  Configure seu salário base em "Configurações Fixas" para habilitar o lançamento.
                </p>
              )}
              {launchErrorMessage && (
                <div className="bg-error/10 border border-error/40 rounded-lg p-3 text-sm text-error flex items-start gap-2">
                  <span className="material-symbols-outlined text-base">error</span>
                  <span className="break-words">{launchErrorMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <IncomeHistory incomes={incomes || []} />
        </div>

        {/* Summary Sidebar */}
        <MonthlySummary
          calc={calc}
          baseSalary={config ? Number(config.base_salary) : 0}
          mealAllowance={config ? Number(config.meal_allowance || 0) : 0}
          healthPlanDeduction={config ? Number(config.health_plan_deduction || 0) : 0}
        />
      </div>

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-container border border-outline-variant rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Configurações Fixas</h3>
              <button onClick={() => setShowConfig(false)} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface">close</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-on-surface-variant uppercase tracking-wider block mb-1">Salário Base (R$)</label>
                <input type="number" step="0.01" value={cfgBaseSalary} onChange={(e) => setCfgBaseSalary(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-on-surface-variant uppercase tracking-wider block mb-1">Valor Hora Extra (R$)</label>
                <input type="number" step="0.01" value={cfgHourRate} onChange={(e) => setCfgHourRate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-on-surface-variant uppercase tracking-wider block mb-1">Auxílio Refeição (R$)</label>
                <input type="number" step="0.01" value={cfgMealAllowance} onChange={(e) => setCfgMealAllowance(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-on-surface-variant uppercase tracking-wider block mb-1">Plano de Saúde (R$)</label>
                <input type="number" step="0.01" value={cfgHealthPlan} onChange={(e) => setCfgHealthPlan(e.target.value)} className={inputClass} />
              </div>
            </div>
            <button
              onClick={() => saveConfigMut.mutate()}
              disabled={saveConfigMut.isPending}
              className="w-full py-3 bg-primary text-on-primary font-bold rounded-lg hover:bg-primary-container hover:text-on-primary-container transition-colors"
            >
              {saveConfigMut.isPending ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
