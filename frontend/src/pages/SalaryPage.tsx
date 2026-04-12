import { useState, useMemo } from 'react'
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
}

const extractError = (err: unknown): string => {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string }
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d?.msg ?? '').join('; ')
  return e?.message ?? 'Erro desconhecido'
}

export default function SalaryPage() {
  const qc = useQueryClient()
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

  // Settings modal
  const [showConfig, setShowConfig] = useState(false)
  const [cfgBaseSalary, setCfgBaseSalary] = useState('')
  const [cfgHealthPlan, setCfgHealthPlan] = useState('')
  const [cfgDentalPlan, setCfgDentalPlan] = useState('')
  const [cfgVtEnabled, setCfgVtEnabled] = useState(false)
  const [cfgVtPercent, setCfgVtPercent] = useState('6')
  const [cfgFgts, setCfgFgts] = useState('')

  // Edit modal
  const [editing, setEditing] = useState<MonthlyEntry | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editMultiplier, setEditMultiplier] = useState(0.3)

  const { data: config } = useQuery({
    queryKey: ['salary-config'],
    queryFn: getSalaryConfig,
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

  const expenseTotal = useMemo(
    () => (monthExpenses?.items || []).reduce((s, t) => s + Number(t.amount || 0), 0),
    [monthExpenses],
  )

  const netSalary = Number(summary?.net_salary ?? 0)
  const monthlyResult = netSalary - expenseTotal
  const fgtsMonthlyDeposit = Number(config?.base_salary ?? 0) * 0.08

  const openConfigModal = () => {
    if (config) {
      setCfgBaseSalary(String(config.base_salary))
      setCfgHealthPlan(String(config.health_plan_deduction || 0))
      setCfgDentalPlan(String(config.dental_plan_deduction || 0))
      setCfgVtEnabled(config.transport_voucher_enabled || false)
      setCfgVtPercent(String(config.transport_voucher_percent || 6))
      setCfgFgts(String(config.fgts_balance || 0))
    } else {
      setCfgBaseSalary('')
      setCfgHealthPlan('0')
      setCfgDentalPlan('0')
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
        meal_allowance: config?.meal_allowance ?? 0,
        health_plan_deduction: parseFloat(cfgHealthPlan) || 0,
        dental_plan_deduction: parseFloat(cfgDentalPlan) || 0,
        transport_voucher_enabled: cfgVtEnabled,
        transport_voucher_percent: parseFloat(cfgVtPercent) || 0,
        fgts_balance: parseFloat(cfgFgts) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salary-config'] })
      qc.invalidateQueries({ queryKey: ['monthly-summary'] })
      setShowConfig(false)
    },
    onError: (err) => alert(`Erro ao salvar configurações: ${extractError(err)}`),
  })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['monthly-entries', selectedMonth, selectedYear] })
    qc.invalidateQueries({ queryKey: ['monthly-summary', selectedMonth, selectedYear] })
  }

  const createMut = useMutation({
    mutationFn: createMonthlyEntry,
    onSuccess: invalidateAll,
    onError: (err) => alert(`Erro ao criar lançamento: ${extractError(err)}`),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateMonthlyEntry>[1] }) =>
      updateMonthlyEntry(id, data),
    onSuccess: () => {
      invalidateAll()
      setEditing(null)
    },
    onError: (err) => alert(`Erro ao atualizar lançamento: ${extractError(err)}`),
  })

  const deleteMut = useMutation({
    mutationFn: deleteMonthlyEntry,
    onSuccess: invalidateAll,
    onError: (err) => alert(`Erro ao excluir lançamento: ${extractError(err)}`),
  })

  // Submit handlers
  const launchOvertime = () => {
    const h = parseFloat(overtimeHours)
    if (!h || h <= 0) return alert('Informe a quantidade de horas extras.')
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
    if (!hasLate && !hasAbsence) return alert('Informe horas de atraso ou quantidade de faltas.')
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
    if (!v || v <= 0) return alert('Informe o valor do reembolso.')
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

  const openEdit = (entry: MonthlyEntry) => {
    setEditing(entry)
    setEditDescription(entry.description ?? '')
    if (entry.entry_type === 'refund') setEditValue(String(entry.amount ?? ''))
    else if (entry.entry_type === 'absence') setEditValue(String(entry.days ?? ''))
    else setEditValue(String(entry.hours ?? ''))
    setEditMultiplier(Number(entry.overtime_multiplier ?? 0.3))
  }

  const saveEdit = () => {
    if (!editing) return
    const v = parseFloat(editValue)
    const data: Parameters<typeof updateMonthlyEntry>[1] = { description: editDescription || null }
    if (editing.entry_type === 'refund') data.amount = v
    else if (editing.entry_type === 'absence') data.days = parseInt(editValue, 10)
    else data.hours = v
    if (editing.entry_type === 'overtime') data.overtime_multiplier = editMultiplier
    updateMut.mutate({ id: editing.id, data })
  }

  const confirmDelete = (id: number) => {
    if (confirm('Tem certeza que deseja excluir este lançamento?')) deleteMut.mutate(id)
  }

  // Computed - count entry totals from entries list (for the small "+12h" label, etc.)
  const overtimeTotalHours = useMemo(
    () => (entries || []).filter((e) => e.entry_type === 'overtime').reduce((s, e) => s + Number(e.hours || 0), 0),
    [entries],
  )

  const inputClass =
    'w-full bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5 text-sm text-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#a78bfa] focus:border-transparent placeholder:text-[#52525b]'

  const cardClass = 'bg-[#0c0c0f] border border-[#27272a] rounded-lg p-6 flex flex-col'

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-[#fafafa]">Rendimentos</h1>
          <p className="text-sm text-[#a1a1aa]">Lançamentos do mês — horas extras, reembolsos, atrasos e faltas.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#0c0c0f] border border-[#27272a] px-3 py-2 rounded-lg">
            <span className="material-symbols-outlined text-[#a78bfa] text-lg">calendar_month</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent outline-none text-sm font-medium text-[#fafafa] cursor-pointer"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1} className="bg-[#09090b]">{m}</option>
              ))}
            </select>
            <input
              type="number"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent outline-none text-sm font-medium text-[#fafafa] w-16"
            />
          </div>
          <button
            onClick={openConfigModal}
            className="flex items-center gap-2 bg-[#0c0c0f] border border-[#27272a] px-3 py-2 rounded-lg hover:bg-[#18181b] active:scale-95 transition-all group"
          >
            <span className="material-symbols-outlined text-[#a1a1aa] text-lg group-hover:text-[#a78bfa]">settings</span>
            <span className="text-sm font-medium text-[#fafafa]">Configurações</span>
          </button>
        </div>
      </header>

      {/* Summary cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0c0c0f] border border-[#27272a] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[#a1a1aa] text-base">account_balance_wallet</span>
            <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Saldo Total</p>
          </div>
          <p className="text-2xl font-black text-[#fafafa]">{fmt(Number(balance?.balance ?? 0))}</p>
          <p className="text-xs text-[#52525b] mt-1">Acumulado até o mês</p>
        </div>
        <div className="bg-[#0c0c0f] border border-[#27272a] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[#a78bfa] text-base">payments</span>
            <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Salário Líquido</p>
          </div>
          <p className="text-2xl font-black text-[#a78bfa]">{fmt(netSalary)}</p>
          <p className="text-xs text-[#52525b] mt-1">{MONTHS[selectedMonth - 1]}/{selectedYear}</p>
        </div>
        <div className="bg-[#0c0c0f] border border-[#27272a] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[#ef4444] text-base">trending_down</span>
            <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Despesa Mensal</p>
          </div>
          <p className="text-2xl font-black text-[#ef4444]">{fmt(expenseTotal)}</p>
          <p className="text-xs text-[#52525b] mt-1">{monthExpenses?.items.length ?? 0} lançamentos</p>
        </div>
        <div className="bg-[#0c0c0f] border border-[#27272a] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`material-symbols-outlined text-base ${monthlyResult >= 0 ? 'text-[#34d399]' : 'text-[#ef4444]'}`}
            >
              {monthlyResult >= 0 ? 'trending_up' : 'trending_down'}
            </span>
            <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Resultado Mensal</p>
          </div>
          <p className={`text-2xl font-black ${monthlyResult >= 0 ? 'text-[#34d399]' : 'text-[#ef4444]'}`}>
            {fmt(monthlyResult)}
          </p>
          <p className="text-xs text-[#52525b] mt-1">Líquido − Despesas</p>
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
                <div className="w-10 h-10 rounded bg-[#a78bfa]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#a78bfa]">timer</span>
                </div>
                <h3 className="font-bold text-[#fafafa]">Lançamento de Horas Extras</h3>
              </div>
              <div className="space-y-4 flex-1">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5 block">Quantidade de Horas</label>
                  <input
                    type="number"
                    step="0.5"
                    value={overtimeHours}
                    onChange={(e) => setOvertimeHours(e.target.value)}
                    placeholder="0.00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5 block">Percentual</label>
                  <div className="flex gap-1 p-1 bg-[#09090b] border border-[#27272a] rounded-lg">
                    {MULTIPLIERS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setOvertimeMultiplier(m.value)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${
                          overtimeMultiplier === m.value
                            ? 'bg-[#27272a] text-[#a78bfa]'
                            : 'text-[#a1a1aa] hover:bg-[#0c0c0f]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5 block">Descrição (opcional)</label>
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
                className="w-full mt-6 py-2.5 bg-[#a78bfa] hover:bg-[#a78bfa]/90 text-[#0a0012] font-bold rounded-lg transition-all active:scale-[0.98] disabled:opacity-50"
              >
                Lançar Horas Extras
              </button>
            </section>

            {/* Ausências */}
            <section className={cardClass}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded bg-[#ef4444]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#ef4444]">event_busy</span>
                </div>
                <h3 className="font-bold text-[#fafafa]">Lançamento de Ausências</h3>
              </div>
              <div className="space-y-4 flex-1">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5 block">Horas de Atraso</label>
                  <input
                    type="number"
                    step="0.5"
                    value={lateHours}
                    onChange={(e) => setLateHours(e.target.value)}
                    placeholder="0.00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5 block">Quantidade de Faltas (dias)</label>
                  <input
                    type="number"
                    value={absenceDays}
                    onChange={(e) => setAbsenceDays(e.target.value)}
                    placeholder="0"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5 block">Descrição (opcional)</label>
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
                className="w-full mt-6 py-2.5 border border-[#ef4444]/30 hover:bg-[#ef4444]/10 text-[#ef4444] font-bold rounded-lg transition-all active:scale-[0.98] disabled:opacity-50"
              >
                Lançar Ausência
              </button>
            </section>

            {/* Reembolsos (full width) */}
            <section className={`${cardClass} md:col-span-2`}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded bg-[#34d399]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#34d399]">payments</span>
                </div>
                <h3 className="font-bold text-[#fafafa]">Lançamento de Reembolsos</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5 block">Valor do Reembolso</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1aa] text-sm">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      placeholder="0,00"
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5 block">Descrição</label>
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
                className="w-full mt-6 py-2.5 bg-[#34d399] hover:bg-[#34d399]/90 text-[#001a12] font-bold rounded-lg transition-all active:scale-[0.98] disabled:opacity-50"
              >
                Lançar Reembolso
              </button>
            </section>
          </div>
        </div>

        {/* Right: Resumo do Mês */}
        <aside className="col-span-12 lg:col-span-4">
          <div className="bg-[#121215] border border-[#27272a] rounded-xl p-6 sticky top-8 space-y-6">
            <h3 className="text-lg font-bold text-[#fafafa] flex items-center justify-between">
              Resumo do Mês
              <span className="text-xs font-normal text-[#a1a1aa]">{SHORT_MONTHS[selectedMonth - 1]}/{String(selectedYear).slice(-2)}</span>
            </h3>

            {!config ? (
              <div className="text-sm text-[#a1a1aa] text-center py-6">
                Configure seu salário para ver o resumo.
              </div>
            ) : !summary ? (
              <div className="text-sm text-[#a1a1aa] text-center py-6">Carregando…</div>
            ) : (
              <>
                <div className="flex justify-between items-center pb-4 border-b border-[#27272a]">
                  <span className="text-sm text-[#a1a1aa]">Salário Base</span>
                  <span className="text-sm font-bold text-[#fafafa]">{fmt(Number(summary.base_salary))}</span>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#a1a1aa]">Horas Extras (+{overtimeTotalHours}h)</span>
                    <span className="text-sm font-bold text-[#34d399]">+ {fmt(Number(summary.overtime_value))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#a1a1aa]">Reembolsos</span>
                    <span className="text-sm font-bold text-[#34d399]">+ {fmt(Number(summary.refunds_total))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#a1a1aa]">Atrasos/Faltas</span>
                    <span className="text-sm font-bold text-[#ef4444]">- {fmt(Number(summary.discounts_absences_value))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#a1a1aa]">INSS + IRRF</span>
                    <span className="text-sm font-bold text-[#ef4444]">- {fmt(Number(summary.inss) + Number(summary.irrf))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#a1a1aa]">Plano de Saúde + Odonto</span>
                    <span className="text-sm font-bold text-[#ef4444]">- {fmt(Number(summary.health_plan_deduction) + Number(summary.dental_plan_deduction))}</span>
                  </div>
                  {Number(summary.transport_voucher_value) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#a1a1aa]">Vale Transporte</span>
                      <span className="text-sm font-bold text-[#ef4444]">- {fmt(Number(summary.transport_voucher_value))}</span>
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-[#27272a]">
                  <div className="bg-[#09090b] rounded-lg p-4 border border-[#a78bfa]/20">
                    <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa] mb-1">Estimativa Líquida</p>
                    <p className="text-2xl font-black text-[#a78bfa]">{fmt(Number(summary.net_salary))}</p>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <div className="flex items-center gap-3 bg-[#0c0c0f] rounded-lg p-3 border border-[#27272a]">
                    <span className="material-symbols-outlined text-[#34d399]">savings</span>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Saldo FGTS atual</p>
                      <p className="text-sm font-bold text-[#fafafa]">{fmt(Number(summary.fgts_balance))}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-[#0c0c0f] rounded-lg p-3 border border-[#27272a]">
                    <span className="material-symbols-outlined text-[#34d399]">add_circle</span>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">Depósito mensal estimado</p>
                      <p className="text-sm font-bold text-[#fafafa]">{fmt(fgtsMonthlyDeposit)}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#52525b] text-center italic">
                    informativo — não conta como receita
                  </p>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Histórico do Mês */}
      <section className="bg-[#0c0c0f] border border-[#27272a] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#27272a] flex justify-between items-center">
          <h3 className="font-bold text-[#fafafa]">Histórico do Mês</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#121215] text-[#a1a1aa] uppercase text-[10px] tracking-widest">
              <tr>
                <th className="px-6 py-3 font-medium">Data</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Descrição/Detalhes</th>
                <th className="px-6 py-3 font-medium">Valor/Quantidade</th>
                <th className="px-6 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27272a]">
              {!entries || entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#a1a1aa] text-sm">
                    Nenhum lançamento neste mês.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const badge = ENTRY_BADGE[entry.entry_type]
                  const bgColor = badge.color === 'primary' ? 'bg-[#a78bfa]/10 text-[#a78bfa]'
                    : badge.color === 'tertiary' ? 'bg-[#34d399]/10 text-[#34d399]'
                    : 'bg-[#ef4444]/10 text-[#ef4444]'
                  const valueColor = badge.color === 'tertiary' ? 'text-[#34d399]'
                    : badge.color === 'error' ? 'text-[#ef4444]'
                    : 'text-[#a78bfa]'
                  let valueText = ''
                  if (entry.entry_type === 'refund') valueText = fmt(Number(entry.amount || 0))
                  else if (entry.entry_type === 'absence') valueText = `${entry.days} dia${entry.days === 1 ? '' : 's'}`
                  else if (entry.entry_type === 'overtime') {
                    const mult = Number(entry.overtime_multiplier || 0) * 100
                    valueText = `${Number(entry.hours)}h (${mult.toFixed(0)}%)`
                  } else valueText = `${Number(entry.hours)}h`

                  return (
                    <tr key={entry.id} className="hover:bg-[#18181b]/50 transition-colors">
                      <td className="px-6 py-4 text-[#fafafa]">{fmtDate(entry.entry_date)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${bgColor}`}>
                          <span className="material-symbols-outlined text-xs">{badge.icon}</span>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[#a1a1aa]">{entry.description || '—'}</td>
                      <td className={`px-6 py-4 font-bold ${valueColor}`}>{valueText}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => openEdit(entry)}
                            className="text-[#a1a1aa] hover:text-[#a78bfa] transition-colors"
                            aria-label="Editar"
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            onClick={() => confirmDelete(entry.id)}
                            className="text-[#a1a1aa] hover:text-[#ef4444] transition-colors"
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
          <div className="bg-[#121215] border border-[#27272a] rounded-xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-[#fafafa]">Configurações de Rendimentos</h3>
              <button onClick={() => setShowConfig(false)} className="material-symbols-outlined text-[#a1a1aa] hover:text-[#fafafa]">close</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] block mb-1.5">Salário Bruto (referência)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1aa] text-sm">R$</span>
                  <input type="number" step="0.01" value={cfgBaseSalary} onChange={(e) => setCfgBaseSalary(e.target.value)} className={`${inputClass} pl-10`} />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] block mb-1.5">Plano de Saúde</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1aa] text-sm">R$</span>
                  <input type="number" step="0.01" value={cfgHealthPlan} onChange={(e) => setCfgHealthPlan(e.target.value)} className={`${inputClass} pl-10`} />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] block mb-1.5">Plano Odontológico</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1aa] text-sm">R$</span>
                  <input type="number" step="0.01" value={cfgDentalPlan} onChange={(e) => setCfgDentalPlan(e.target.value)} className={`${inputClass} pl-10`} />
                </div>
              </div>

              <div className="pt-2 border-t border-[#27272a]">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-[#fafafa]">Vale Transporte</label>
                  <button
                    type="button"
                    onClick={() => setCfgVtEnabled((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${cfgVtEnabled ? 'bg-[#a78bfa]' : 'bg-[#27272a]'}`}
                    aria-pressed={cfgVtEnabled}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${cfgVtEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] block mb-1.5">Percentual de Desconto</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    value={cfgVtPercent}
                    onChange={(e) => setCfgVtPercent(e.target.value)}
                    disabled={!cfgVtEnabled}
                    className={`${inputClass} pr-8 disabled:opacity-50`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a1a1aa] text-sm">%</span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#27272a]">
                <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] block mb-1.5">Saldo FGTS Atual</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1aa] text-sm">R$</span>
                  <input type="number" step="0.01" value={cfgFgts} onChange={(e) => setCfgFgts(e.target.value)} className={`${inputClass} pl-10`} />
                </div>
              </div>
            </div>

            <button
              onClick={() => saveConfigMut.mutate()}
              disabled={saveConfigMut.isPending}
              className="w-full py-3 bg-[#a78bfa] hover:bg-[#a78bfa]/90 text-[#0a0012] font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {saveConfigMut.isPending ? 'Salvando…' : 'Salvar Configurações'}
            </button>
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="bg-[#121215] border border-[#27272a] rounded-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-[#fafafa]">Editar {ENTRY_BADGE[editing.entry_type].label}</h3>
              <button onClick={() => setEditing(null)} className="material-symbols-outlined text-[#a1a1aa] hover:text-[#fafafa]">close</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] block mb-1.5">
                  {editing.entry_type === 'refund' ? 'Valor (R$)' : editing.entry_type === 'absence' ? 'Quantidade de Dias' : 'Quantidade de Horas'}
                </label>
                <input
                  type="number"
                  step={editing.entry_type === 'absence' ? '1' : '0.01'}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className={inputClass}
                />
              </div>
              {editing.entry_type === 'overtime' && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] block mb-1.5">Percentual</label>
                  <div className="flex gap-1 p-1 bg-[#09090b] border border-[#27272a] rounded-lg">
                    {MULTIPLIERS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setEditMultiplier(m.value)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${
                          editMultiplier === m.value ? 'bg-[#27272a] text-[#a78bfa]' : 'text-[#a1a1aa] hover:bg-[#0c0c0f]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#a1a1aa] block mb-1.5">Descrição</label>
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
                className="flex-1 py-2.5 bg-[#a78bfa] hover:bg-[#a78bfa]/90 text-[#0a0012] font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {updateMut.isPending ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="flex-1 py-2.5 border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] font-medium rounded-lg transition-colors"
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
