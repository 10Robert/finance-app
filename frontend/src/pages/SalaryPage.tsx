import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSalaryConfig,
  saveSalaryConfig,
  getMonthlyEntries,
  getMonthlySummary,
  createMonthlyEntry,
  updateMonthlyEntry,
  deleteMonthlyEntry,
  getBalance,
  getTransactions,
} from '../api/client'
import type { MonthlyEntry, MonthlyEntryType } from '../types'
import { useToast, useConfirm } from '../components/feedback'
import { extractError } from '../utils/errors'
import { useFocusTrap, useEscapeKey } from '../utils/a11y'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const SHORT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const MULTIPLIERS = [
  { label: '30%', value: 0.3 },
  { label: '70%', value: 0.7 },
  { label: '100%', value: 1.0 },
]

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const ENTRY_BADGE: Record<MonthlyEntryType, { label: string; color: string; icon: string }> = {
  overtime: { label: 'Hora Extra', color: 'primary', icon: 'timer' },
  refund: { label: 'Reembolso', color: 'tertiary', icon: 'payments' },
  late: { label: 'Atraso', color: 'error', icon: 'schedule' },
  absence: { label: 'Falta', color: 'error', icon: 'event_busy' },
  medical_certificate: { label: 'Atestado', color: 'tertiary', icon: 'medical_services' },
}

export default function SalaryPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  // Forms
  const [overtimeHours, setOvertimeHours] = useState('')
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(0.3)
  const [overtimeDescription, setOvertimeDescription] = useState('')
  const [lateHours, setLateHours] = useState('')
  const [absenceDays, setAbsenceDays] = useState('')
  const [absenceDescription, setAbsenceDescription] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundDescription, setRefundDescription] = useState('')
  const [medicalDays, setMedicalDays] = useState('')
  const [medicalDescription, setMedicalDescription] = useState('')

  // Settings modal
  const [showConfig, setShowConfig] = useState(false)
  const [cfgBaseSalary, setCfgBaseSalary] = useState('')
  const [cfgMealAllowance, setCfgMealAllowance] = useState('')
  const [cfgHealthPlan, setCfgHealthPlan] = useState('')
  const [cfgDentalPlan, setCfgDentalPlan] = useState('')
  const [cfgCoparticipation, setCfgCoparticipation] = useState('')
  const [cfgVtEnabled, setCfgVtEnabled] = useState(false)
  const [cfgVtPercent, setCfgVtPercent] = useState('6')
  const [cfgFgts, setCfgFgts] = useState('')

  // Edit modal
  const [editing, setEditing] = useState<MonthlyEntry | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editMultiplier, setEditMultiplier] = useState(0.3)

  // a11y refs for inline modals
  const configPanelRef = useRef<HTMLDivElement>(null)
  const editPanelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(showConfig, configPanelRef)
  useEscapeKey(showConfig, () => setShowConfig(false))
  useFocusTrap(!!editing, editPanelRef)
  useEscapeKey(!!editing, () => setEditing(null))

  const { data: config } = useQuery({
    queryKey: ['salary-config', selectedMonth, selectedYear],
    queryFn: () => getSalaryConfig({ month: selectedMonth, year: selectedYear }),
  })

  const { data: entries } = useQuery({
    queryKey: ['monthly-entries', selectedMonth, selectedYear],
    queryFn: () => getMonthlyEntries({ month: selectedMonth, year: selectedYear }),
  })

  const { data: summary } = useQuery({
    queryKey: ['monthly-summary', selectedMonth, selectedYear],
    queryFn: () => getMonthlySummary({ month: selectedMonth, year: selectedYear }),
    enabled: !!config,
  })

  // Saldo total acumulado (independente do mês selecionado)
  const { data: balance } = useQuery({
    queryKey: ['balance', selectedYear, selectedMonth],
    queryFn: () => getBalance({ year: selectedYear, month: selectedMonth }),
  })

  // Despesas do mês selecionado
  const monthRange = useMemo(() => {
    const start = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
    const end = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { start, end }
  }, [selectedMonth, selectedYear])

  const { data: monthExpenses } = useQuery({
    queryKey: ['month-expenses', selectedMonth, selectedYear],
    queryFn: () =>
      getTransactions({
        type: 'expense',
        start_date: monthRange.start,
        end_date: monthRange.end,
        per_page: 100,
      }),
  })

  // Despesas podem estar gravadas como negativas (importadas) ou positivas
  // (criadas pelo formulário). Sempre usamos o valor absoluto para evitar
  // inverter o sinal no cálculo do Resultado Mensal.
  const expenseTotal = useMemo(
    () =>
      (monthExpenses?.items || []).reduce(
        (s, t) => s + Math.abs(Number(t.amount || 0)),
        0,
      ),
    [monthExpenses],
  )

  const netSalary = Number(summary?.net_salary ?? 0)
  const monthlyResult = netSalary - expenseTotal
  const fgtsMonthlyDeposit = Number(config?.base_salary ?? 0) * 0.08

  const openConfigModal = () => {
    if (config) {
      setCfgBaseSalary(String(config.base_salary))
      setCfgMealAllowance(String(config.meal_allowance || 0))
      setCfgHealthPlan(String(config.health_plan_deduction || 0))
      setCfgDentalPlan(String(config.dental_plan_deduction || 0))
      setCfgCoparticipation(String(config.coparticipation || 0))
      setCfgVtEnabled(config.transport_voucher_enabled || false)
      setCfgVtPercent(String(config.transport_voucher_percent || 6))
      setCfgFgts(String(config.fgts_balance || 0))
    } else {
      setCfgBaseSalary('')
      setCfgMealAllowance('0')
      setCfgHealthPlan('0')
      setCfgDentalPlan('0')
      setCfgCoparticipation('0')
      setCfgVtEnabled(false)
      setCfgVtPercent('6')
      setCfgFgts('0')
    }
    setShowConfig(true)
  }

  const saveConfigMut = useMutation({
    mutationFn: () =>
      saveSalaryConfig({
        base_salary: parseFloat(cfgBaseSalary) || 0,
        overtime_hour_rate: config?.overtime_hour_rate ?? 0,
        meal_allowance: parseFloat(cfgMealAllowance) || 0,
        health_plan_deduction: parseFloat(cfgHealthPlan) || 0,
        dental_plan_deduction: parseFloat(cfgDentalPlan) || 0,
        coparticipation: parseFloat(cfgCoparticipation) || 0,
        transport_voucher_enabled: cfgVtEnabled,
        transport_voucher_percent: parseFloat(cfgVtPercent) || 0,
        fgts_balance: parseFloat(cfgFgts) || 0,
        reference_month: selectedMonth,
        reference_year: selectedYear,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salary-config'] })
      qc.invalidateQueries({ queryKey: ['monthly-summary'] })
      qc.invalidateQueries({ queryKey: ['monthly-entries'] })
      qc.invalidateQueries({ queryKey: ['balance'] })
      qc.invalidateQueries({ queryKey: ['month-expenses'] })
      setShowConfig(false)
      toast.success('Configurações de salário salvas.')
    },
    onError: (err) => toast.error(`Erro ao salvar configurações: ${extractError(err)}`),
  })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['monthly-entries', selectedMonth, selectedYear] })
    qc.invalidateQueries({ queryKey: ['monthly-summary', selectedMonth, selectedYear] })
  }

  const createMut = useMutation({
    mutationFn: createMonthlyEntry,
    onSuccess: () => {
      invalidateAll()
      toast.success('Lançamento adicionado.')
    },
    onError: (err) => toast.error(`Erro ao criar lançamento: ${extractError(err)}`),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateMonthlyEntry>[1] }) =>
      updateMonthlyEntry(id, data),
    onSuccess: () => {
      invalidateAll()
      setEditing(null)
      toast.success('Lançamento atualizado.')
    },
    onError: (err) => toast.error(`Erro ao atualizar lançamento: ${extractError(err)}`),
  })

  const deleteMut = useMutation({
    mutationFn: deleteMonthlyEntry,
    onSuccess: () => {
      invalidateAll()
      toast.success('Lançamento excluído.')
    },
    onError: (err) => toast.error(`Erro ao excluir lançamento: ${extractError(err)}`),
  })

  // Submit handlers
  const launchOvertime = () => {
    const h = parseFloat(overtimeHours)
    if (!h || h <= 0) {
      toast.warning('Informe a quantidade de horas extras.')
      return
    }
    createMut.mutate({
      reference_month: selectedMonth,
      reference_year: selectedYear,
      entry_type: 'overtime',
      hours: h,
      overtime_multiplier: overtimeMultiplier,
      description: overtimeDescription || null,
    })
    setOvertimeHours('')
    setOvertimeDescription('')
  }

  const launchAbsence = () => {
    const lh = parseFloat(lateHours)
    const ad = parseInt(absenceDays, 10)
    const hasLate = !isNaN(lh) && lh > 0
    const hasAbsence = !isNaN(ad) && ad > 0
    if (!hasLate && !hasAbsence) {
      toast.warning('Informe horas de atraso ou quantidade de faltas.')
      return
    }
    if (hasLate) {
      createMut.mutate({
        reference_month: selectedMonth,
        reference_year: selectedYear,
        entry_type: 'late',
        hours: lh,
        description: absenceDescription || null,
      })
    }
    if (hasAbsence) {
      createMut.mutate({
        reference_month: selectedMonth,
        reference_year: selectedYear,
        entry_type: 'absence',
        days: ad,
        description: absenceDescription || null,
      })
    }
    setLateHours('')
    setAbsenceDays('')
    setAbsenceDescription('')
  }

  const launchRefund = () => {
    const v = parseFloat(refundAmount)
    if (!v || v <= 0) {
      toast.warning('Informe o valor do reembolso.')
      return
    }
    createMut.mutate({
      reference_month: selectedMonth,
      reference_year: selectedYear,
      entry_type: 'refund',
      amount: v,
      description: refundDescription || null,
    })
    setRefundAmount('')
    setRefundDescription('')
  }

  const launchMedical = () => {
    const d = parseInt(medicalDays, 10)
    if (!d || d <= 0) {
      toast.warning('Informe a quantidade de dias de atestado.')
      return
    }
    createMut.mutate({
      reference_month: selectedMonth,
      reference_year: selectedYear,
      entry_type: 'medical_certificate',
      days: d,
      description: medicalDescription || null,
    })
    setMedicalDays('')
    setMedicalDescription('')
  }

  const openEdit = (entry: MonthlyEntry) => {
    setEditing(entry)
    setEditDescription(entry.description ?? '')
    if (entry.entry_type === 'refund') setEditValue(String(entry.amount ?? ''))
    else if (entry.entry_type === 'absence' || entry.entry_type === 'medical_certificate')
      setEditValue(String(entry.days ?? ''))
    else setEditValue(String(entry.hours ?? ''))
    setEditMultiplier(Number(entry.overtime_multiplier ?? 0.3))
  }

  const saveEdit = () => {
    if (!editing) return
    const v = parseFloat(editValue)
    const data: Parameters<typeof updateMonthlyEntry>[1] = { description: editDescription || null }
    if (editing.entry_type === 'refund') data.amount = v
    else if (editing.entry_type === 'absence' || editing.entry_type === 'medical_certificate')
      data.days = parseInt(editValue, 10)
    else data.hours = v
    if (editing.entry_type === 'overtime') data.overtime_multiplier = editMultiplier
    updateMut.mutate({ id: editing.id, data })
  }

  const confirmDelete = async (id: number) => {
    const ok = await confirm({
      title: 'Excluir lançamento',
      message: 'Tem certeza que deseja excluir este lançamento?',
      confirmLabel: 'Excluir',
      tone: 'danger',
    })
    if (ok) deleteMut.mutate(id)
  }

  // Computed - count entry totals from entries list (for the small "+12h" label, etc.)
  const overtimeTotalHours = useMemo(
    () => (entries || []).filter((e) => e.entry_type === 'overtime').reduce((s, e) => s + Number(e.hours || 0), 0),
    [entries],
  )

  const inputClass =
    'w-full bg-bg border border-outline-variant rounded-lg px-4 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-secondary'

  const cardClass = 'bg-surface border border-outline-variant rounded-lg p-6 flex flex-col'

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-on-surface">Rendimentos</h1>
          <p className="text-sm text-on-surface-variant">Lançamentos do mês — horas extras, reembolsos, atrasos e faltas.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surface border border-outline-variant px-3 py-2 rounded-lg">
            <span className="material-symbols-outlined text-primary text-lg">calendar_month</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent outline-none text-sm font-medium text-on-surface cursor-pointer"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1} className="bg-bg">{m}</option>
              ))}
            </select>
            <input
              type="number"
              min="2000"
              max="2100"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent outline-none text-sm font-medium text-on-surface w-16"
            />
          </div>
          <button
            onClick={openConfigModal}
            className="flex items-center gap-2 bg-surface border border-outline-variant px-3 py-2 rounded-lg hover:bg-surface-variant active:scale-95 transition-all group"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-lg group-hover:text-primary">settings</span>
            <span className="text-sm font-medium text-on-surface">Configurações</span>
          </button>
        </div>
      </header>

      {/* Summary cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-outline-variant rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant text-base">account_balance_wallet</span>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Saldo Total</p>
          </div>
          <p className="text-2xl font-black text-on-surface">{fmt(Number(balance?.balance ?? 0))}</p>
          <p className="text-xs text-secondary mt-1">Acumulado até o mês</p>
        </div>
        <div className="bg-surface border border-outline-variant rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary text-base">payments</span>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Salário Líquido</p>
          </div>
          <p className="text-2xl font-black text-primary">{fmt(netSalary)}</p>
          <p className="text-xs text-secondary mt-1">{MONTHS[selectedMonth - 1]}/{selectedYear}</p>
        </div>
        <div className="bg-surface border border-outline-variant rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-error text-base">trending_down</span>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Despesa Mensal</p>
          </div>
          <p className="text-2xl font-black text-error">{fmt(expenseTotal)}</p>
          <p className="text-xs text-secondary mt-1">{monthExpenses?.items.length ?? 0} lançamentos</p>
        </div>
        <div className="bg-surface border border-outline-variant rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`material-symbols-outlined text-base ${monthlyResult >= 0 ? 'text-tertiary' : 'text-error'}`}
            >
              {monthlyResult >= 0 ? 'trending_up' : 'trending_down'}
            </span>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Resultado Mensal</p>
          </div>
          <p className={`text-2xl font-black ${monthlyResult >= 0 ? 'text-tertiary' : 'text-error'}`}>
            {fmt(monthlyResult)}
          </p>
          <p className="text-xs text-secondary mt-1">Líquido − Despesas</p>
        </div>
      </section>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-8">
        {/* Left: launches */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Horas Extras */}
            <section className={cardClass}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary">timer</span>
                </div>
                <h3 className="font-bold text-on-surface">Lançamento de Horas Extras</h3>
              </div>
              <div className="space-y-4 flex-1">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5 block">Quantidade de Horas</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={overtimeHours}
                    onChange={(e) => setOvertimeHours(e.target.value)}
                    placeholder="0.00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5 block">Percentual</label>
                  <div className="flex gap-1 p-1 bg-bg border border-outline-variant rounded-lg">
                    {MULTIPLIERS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setOvertimeMultiplier(m.value)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${
                          overtimeMultiplier === m.value
                            ? 'bg-outline-variant text-primary'
                            : 'text-on-surface-variant hover:bg-surface'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5 block">Descrição (opcional)</label>
                  <input
                    type="text"
                    value={overtimeDescription}
                    onChange={(e) => setOvertimeDescription(e.target.value)}
                    placeholder="Ex: Projeto Q4 Migration"
                    className={inputClass}
                  />
                </div>
              </div>
              <button
                onClick={launchOvertime}
                disabled={createMut.isPending}
                className="w-full mt-6 py-2.5 bg-primary hover:bg-primary/90 text-on-primary font-bold rounded-lg transition-all active:scale-[0.98] disabled:opacity-50"
              >
                Lançar Horas Extras
              </button>
            </section>

            {/* Ausências */}
            <section className={cardClass}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded bg-error/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-error">event_busy</span>
                </div>
                <h3 className="font-bold text-on-surface">Lançamento de Ausências</h3>
              </div>
              <div className="space-y-4 flex-1">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5 block">Horas de Atraso</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={lateHours}
                    onChange={(e) => setLateHours(e.target.value)}
                    placeholder="0.00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5 block">Quantidade de Faltas (dias)</label>
                  <input
                    type="number"
                    min="0"
                    value={absenceDays}
                    onChange={(e) => setAbsenceDays(e.target.value)}
                    placeholder="0"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5 block">Descrição (opcional)</label>
                  <input
                    type="text"
                    value={absenceDescription}
                    onChange={(e) => setAbsenceDescription(e.target.value)}
                    placeholder="Ex: Consulta Médica"
                    className={inputClass}
                  />
                </div>
              </div>
              <button
                onClick={launchAbsence}
                disabled={createMut.isPending}
                className="w-full mt-6 py-2.5 border border-error/30 hover:bg-error/10 text-error font-bold rounded-lg transition-all active:scale-[0.98] disabled:opacity-50"
              >
                Lançar Ausência
              </button>
            </section>

            {/* Atestado Médico */}
            <section className={cardClass}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded bg-tertiary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-tertiary">medical_services</span>
                </div>
                <h3 className="font-bold text-on-surface">Lançamento de Atestado</h3>
              </div>
              <div className="space-y-4 flex-1">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5 block">Dias de Atestado</label>
                  <input
                    type="number"
                    min="0"
                    value={medicalDays}
                    onChange={(e) => setMedicalDays(e.target.value)}
                    placeholder="0"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5 block">Descrição (opcional)</label>
                  <input
                    type="text"
                    value={medicalDescription}
                    onChange={(e) => setMedicalDescription(e.target.value)}
                    placeholder="Ex: Gripe, cirurgia…"
                    className={inputClass}
                  />
                </div>
                <p className="text-[10px] text-secondary italic">
                  Atestado médico não gera desconto de salário (empregador paga).
                </p>
              </div>
              <button
                onClick={launchMedical}
                disabled={createMut.isPending}
                className="w-full mt-6 py-2.5 border border-tertiary/30 hover:bg-tertiary/10 text-tertiary font-bold rounded-lg transition-all active:scale-[0.98] disabled:opacity-50"
              >
                Lançar Atestado
              </button>
            </section>

            {/* Reembolsos */}
            <section className={cardClass}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded bg-tertiary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-tertiary">payments</span>
                </div>
                <h3 className="font-bold text-on-surface">Lançamento de Reembolsos</h3>
              </div>
              <div className="space-y-4 flex-1">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5 block">Valor do Reembolso</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      placeholder="0,00"
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1.5 block">Descrição</label>
                  <input
                    type="text"
                    value={refundDescription}
                    onChange={(e) => setRefundDescription(e.target.value)}
                    placeholder="Ex: Viagem técnica ou Material"
                    className={inputClass}
                  />
                </div>
              </div>
              <button
                onClick={launchRefund}
                disabled={createMut.isPending}
                className="w-full mt-6 py-2.5 bg-tertiary hover:bg-tertiary/90 text-on-tertiary font-bold rounded-lg transition-all active:scale-[0.98] disabled:opacity-50"
              >
                Lançar Reembolso
              </button>
            </section>
          </div>
        </div>

        {/* Right: Resumo do Mês */}
        <aside className="col-span-12 lg:col-span-4">
          <div className="bg-surface-container border border-outline-variant rounded-xl p-6 sticky top-8 space-y-6">
            <h3 className="text-lg font-bold text-on-surface flex items-center justify-between">
              Resumo do Mês
              <span className="text-xs font-normal text-on-surface-variant">{SHORT_MONTHS[selectedMonth - 1]}/{String(selectedYear).slice(-2)}</span>
            </h3>

            {!config ? (
              <div className="text-sm text-on-surface-variant text-center py-6">
                Configure seu salário para ver o resumo.
              </div>
            ) : !summary ? (
              <div className="text-sm text-on-surface-variant text-center py-6">Carregando…</div>
            ) : (
              <>
                <div className="flex justify-between items-center pb-4 border-b border-outline-variant">
                  <span className="text-sm text-on-surface-variant">Salário Base</span>
                  <span className="text-sm font-bold text-on-surface">{fmt(Number(summary.base_salary))}</span>
                </div>

                <div className="space-y-3">
                  {Number(summary.meal_allowance) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-on-surface-variant">Vale Refeição</span>
                      <span className="text-sm font-bold text-tertiary">+ {fmt(Number(summary.meal_allowance))}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant">Horas Extras (+{overtimeTotalHours}h)</span>
                    <span className="text-sm font-bold text-tertiary">+ {fmt(Number(summary.overtime_value))}</span>
                  </div>
                  {Number(summary.dsr_value) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-on-surface-variant flex items-center gap-1.5">
                        DSR sobre HE
                        <span
                          className="material-symbols-outlined text-secondary text-[14px]"
                          title="Descanso Semanal Remunerado proporcional às horas extras (Súmula 172 TST). Calculado sobre domingos do mês."
                        >
                          info
                        </span>
                      </span>
                      <span className="text-sm font-bold text-tertiary">+ {fmt(Number(summary.dsr_value))}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant">Reembolsos</span>
                    <span className="text-sm font-bold text-tertiary">+ {fmt(Number(summary.refunds_total))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant">Atrasos ({Number(summary.late_hours_total)}h)</span>
                    <span className="text-sm font-bold text-error">- {fmt(Number(summary.late_value))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant">Faltas ({summary.absence_days_total}d)</span>
                    <span className="text-sm font-bold text-error">- {fmt(Number(summary.absence_value))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant">INSS</span>
                    <span className="text-sm font-bold text-error">- {fmt(Number(summary.inss))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant">IRRF</span>
                    <span className="text-sm font-bold text-error">- {fmt(Number(summary.irrf))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant">Plano de Saúde</span>
                    <span className="text-sm font-bold text-error">- {fmt(Number(summary.health_plan_deduction))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant">Plano Odontológico</span>
                    <span className="text-sm font-bold text-error">- {fmt(Number(summary.dental_plan_deduction))}</span>
                  </div>
                  {Number(summary.coparticipation) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-on-surface-variant">Coparticipação Saúde</span>
                      <span className="text-sm font-bold text-error">- {fmt(Number(summary.coparticipation))}</span>
                    </div>
                  )}
                  {Number(summary.transport_voucher_value) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-on-surface-variant">Vale Transporte</span>
                      <span className="text-sm font-bold text-error">- {fmt(Number(summary.transport_voucher_value))}</span>
                    </div>
                  )}
                  {summary.medical_certificate_days > 0 && (
                    <div className="flex justify-between items-center border-t border-outline-variant pt-3">
                      <span className="text-sm text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-tertiary text-sm">medical_services</span>
                        Atestado Médico ({summary.medical_certificate_days}d)
                      </span>
                      <span className="text-xs italic text-secondary">sem desconto</span>
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-outline-variant">
                  <div className="bg-bg rounded-lg p-4 border border-primary/20">
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Estimativa Líquida</p>
                    <p className="text-2xl font-black text-primary">{fmt(Number(summary.net_salary))}</p>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <div className="flex items-center gap-3 bg-surface rounded-lg p-3 border border-outline-variant">
                    <span className="material-symbols-outlined text-tertiary">savings</span>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Saldo FGTS atual</p>
                      <p className="text-sm font-bold text-on-surface">{fmt(Number(summary.fgts_balance))}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-surface rounded-lg p-3 border border-outline-variant">
                    <span className="material-symbols-outlined text-tertiary">add_circle</span>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Depósito mensal estimado</p>
                      <p className="text-sm font-bold text-on-surface">{fmt(fgtsMonthlyDeposit)}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-secondary text-center italic">
                    informativo — não conta como receita
                  </p>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Histórico do Mês */}
      <section className="bg-surface border border-outline-variant rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
          <h3 className="font-bold text-on-surface">Histórico do Mês</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container text-on-surface-variant uppercase text-[10px] tracking-widest">
              <tr>
                <th className="px-6 py-3 font-medium">Data</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Descrição/Detalhes</th>
                <th className="px-6 py-3 font-medium">Valor/Quantidade</th>
                <th className="px-6 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {!entries || entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant text-sm">
                    Nenhum lançamento neste mês.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const badge = ENTRY_BADGE[entry.entry_type]
                  const bgColor = badge.color === 'primary' ? 'bg-primary/10 text-primary'
                    : badge.color === 'tertiary' ? 'bg-tertiary/10 text-tertiary'
                    : 'bg-error/10 text-error'
                  const valueColor = badge.color === 'tertiary' ? 'text-tertiary'
                    : badge.color === 'error' ? 'text-error'
                    : 'text-primary'
                  let valueText = ''
                  if (entry.entry_type === 'refund') valueText = fmt(Number(entry.amount || 0))
                  else if (entry.entry_type === 'absence') valueText = `${entry.days} dia${entry.days === 1 ? '' : 's'}`
                  else if (entry.entry_type === 'medical_certificate') valueText = `${entry.days} dia${entry.days === 1 ? '' : 's'}`
                  else if (entry.entry_type === 'overtime') {
                    const mult = Number(entry.overtime_multiplier || 0) * 100
                    valueText = `${Number(entry.hours)}h (${mult.toFixed(0)}%)`
                  } else valueText = `${Number(entry.hours)}h`

                  return (
                    <tr key={entry.id} className="hover:bg-surface-variant/50 transition-colors">
                      <td className="px-6 py-4 text-on-surface">{fmtDate(entry.entry_date)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${bgColor}`}>
                          <span className="material-symbols-outlined text-xs">{badge.icon}</span>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-on-surface-variant">{entry.description || '—'}</td>
                      <td className={`px-6 py-4 font-bold ${valueColor}`}>{valueText}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => openEdit(entry)}
                            className="text-on-surface-variant hover:text-primary transition-colors"
                            aria-label="Editar"
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            onClick={() => confirmDelete(entry.id)}
                            className="text-on-surface-variant hover:text-error transition-colors"
                            aria-label="Excluir"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Settings Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowConfig(false)}>
          <div
            ref={configPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="salary-config-title"
            className="bg-surface-container border border-outline-variant rounded-xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 id="salary-config-title" className="text-lg font-bold text-on-surface">Configurações de Rendimentos</h3>
                <p className="text-xs text-primary mt-0.5">
                  Referente a {MONTHS[selectedMonth - 1]}/{selectedYear}
                </p>
              </div>
              <button onClick={() => setShowConfig(false)} aria-label="Fechar" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface">close</button>
            </div>

            <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
              <p className="text-xs text-primary flex items-start gap-1.5">
                <span className="material-symbols-outlined text-sm mt-0.5">info</span>
                <span>
                  Ao salvar, estas configurações se aplicam <strong>somente a {MONTHS[selectedMonth - 1]}/{selectedYear}</strong>. Outros meses mantêm suas próprias configurações.
                </span>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1.5">Salário Bruto (referência)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={cfgBaseSalary} onChange={(e) => setCfgBaseSalary(e.target.value)} className={`${inputClass} pl-10`} />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1.5">Vale Refeição / Alimentação</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={cfgMealAllowance} onChange={(e) => setCfgMealAllowance(e.target.value)} className={`${inputClass} pl-10`} />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1.5">Plano de Saúde (mensalidade)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={cfgHealthPlan} onChange={(e) => setCfgHealthPlan(e.target.value)} className={`${inputClass} pl-10`} />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1.5">Coparticipação Plano de Saúde</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={cfgCoparticipation} onChange={(e) => setCfgCoparticipation(e.target.value)} className={`${inputClass} pl-10`} />
                </div>
                <p className="text-[10px] text-secondary mt-1 italic">
                  Valor variável cobrado mensalmente conforme uso do plano.
                </p>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1.5">Plano Odontológico</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={cfgDentalPlan} onChange={(e) => setCfgDentalPlan(e.target.value)} className={`${inputClass} pl-10`} />
                </div>
              </div>

              <div className="pt-2 border-t border-outline-variant">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-on-surface">Vale Transporte</label>
                  <button
                    type="button"
                    onClick={() => setCfgVtEnabled((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${cfgVtEnabled ? 'bg-primary' : 'bg-outline-variant'}`}
                    aria-pressed={cfgVtEnabled}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${cfgVtEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1.5">Percentual de Desconto</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={cfgVtPercent}
                    onChange={(e) => setCfgVtPercent(e.target.value)}
                    disabled={!cfgVtEnabled}
                    className={`${inputClass} pr-8 disabled:opacity-50`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">%</span>
                </div>
              </div>

              <div className="pt-2 border-t border-outline-variant">
                <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1.5">Saldo FGTS Atual</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={cfgFgts} onChange={(e) => setCfgFgts(e.target.value)} className={`${inputClass} pl-10`} />
                </div>
              </div>
            </div>

            <button
              onClick={() => saveConfigMut.mutate()}
              disabled={saveConfigMut.isPending}
              className="w-full py-3 bg-primary hover:bg-primary/90 text-on-primary font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {saveConfigMut.isPending ? 'Salvando…' : 'Salvar Configurações'}
            </button>
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div
            ref={editPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-entry-title"
            className="bg-surface-container border border-outline-variant rounded-xl p-6 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h3 id="edit-entry-title" className="text-lg font-bold text-on-surface">Editar {ENTRY_BADGE[editing.entry_type].label}</h3>
              <button onClick={() => setEditing(null)} aria-label="Fechar" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface">close</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1.5">
                  {editing.entry_type === 'refund'
                    ? 'Valor (R$)'
                    : editing.entry_type === 'absence' || editing.entry_type === 'medical_certificate'
                      ? 'Quantidade de Dias'
                      : 'Quantidade de Horas'}
                </label>
                <input
                  type="number"
                  step={editing.entry_type === 'absence' || editing.entry_type === 'medical_certificate' ? '1' : '0.01'}
                  min="0"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className={inputClass}
                />
              </div>
              {editing.entry_type === 'overtime' && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1.5">Percentual</label>
                  <div className="flex gap-1 p-1 bg-bg border border-outline-variant rounded-lg">
                    {MULTIPLIERS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setEditMultiplier(m.value)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${
                          editMultiplier === m.value ? 'bg-outline-variant text-primary' : 'text-on-surface-variant hover:bg-surface'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-on-surface-variant block mb-1.5">Descrição</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveEdit}
                disabled={updateMut.isPending}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-on-primary font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {updateMut.isPending ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="flex-1 py-2.5 border border-outline-variant text-on-surface-variant hover:text-on-surface font-medium rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
