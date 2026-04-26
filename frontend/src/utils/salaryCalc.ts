// Client-side salary calculator (mirrors backend logic for real-time preview)

// INSS 2026 — teto R$ 8.475,55
const INSS_BRACKETS = [
  { limit: 1621.00, rate: 0.075 },
  { limit: 2902.84, rate: 0.09 },
  { limit: 4354.27, rate: 0.12 },
  { limit: 8475.55, rate: 0.14 },
]

// IRRF 2026 (tabela vigente após Lei 14.848/2024)
const IRRF_BRACKETS = [
  { limit: 2428.80, rate: 0, deduction: 0 },
  { limit: 2826.65, rate: 0.075, deduction: 182.16 },
  { limit: 3751.05, rate: 0.15, deduction: 394.16 },
  { limit: 4664.68, rate: 0.225, deduction: 675.49 },
  { limit: Infinity, rate: 0.275, deduction: 908.73 },
]
const SIMPLIFIED_MONTHLY_DEDUCTION = 607.20  // 25% de R$ 2.428,80
const DEPENDENT_DEDUCTION = 189.59
// Reforma 2026 (Lei nº 15.270/2025): redutor = 978,62 − (0,133145 × renda_bruta)
const REFORM_2026 = {
  exemptionThreshold: 5000.00,
  maxThreshold: 7350.00,
  redutorConstant: 978.62,
  redutorFactor: 0.133145,
}

function calculateINSS(base: number): number {
  let total = 0
  let prevLimit = 0
  for (const bracket of INSS_BRACKETS) {
    if (base <= prevLimit) break
    const taxable = Math.min(base, bracket.limit) - prevLimit
    total += taxable * bracket.rate
    prevLimit = bracket.limit
  }
  return Math.round(total * 100) / 100
}

function applyIRRFBrackets(taxableBase: number): number {
  for (const bracket of IRRF_BRACKETS) {
    if (taxableBase <= bracket.limit) {
      const irrf = taxableBase * bracket.rate - bracket.deduction
      return Math.max(Math.round(irrf * 100) / 100, 0)
    }
  }
  return 0
}

// Calcula o IRRF mensal usando o método mais favorável entre Tradicional
// (renda − INSS − dependentes×189,59) e Simplificado (renda − R$ 607,20),
// e aplica o redutor da reforma 2026 quando a renda está em [5000, 7350).
function calculateIRRF(
  monthlyGross: number,
  inss: number,
  dependents: number = 0,
  useSimplifiedDiscount: boolean = true,
): number {
  const baseTraditional = Math.max(monthlyGross - inss - dependents * DEPENDENT_DEDUCTION, 0)
  const irrfTraditional = applyIRRFBrackets(baseTraditional)

  const baseSimplified = Math.max(monthlyGross - SIMPLIFIED_MONTHLY_DEDUCTION, 0)
  const irrfSimplified = applyIRRFBrackets(baseSimplified)

  let irrf = useSimplifiedDiscount ? Math.min(irrfTraditional, irrfSimplified) : irrfTraditional

  // Reforma 2026
  if (monthlyGross <= REFORM_2026.exemptionThreshold) return 0
  if (monthlyGross < REFORM_2026.maxThreshold) {
    const redutor = Math.round((REFORM_2026.redutorConstant - REFORM_2026.redutorFactor * monthlyGross) * 100) / 100
    irrf = Math.max(Math.round((irrf - redutor) * 100) / 100, 0)
  }
  return irrf
}

export interface SalaryCalcResult {
  overtimeValue: number
  dsrValue: number
  totalGross: number
  inss: number
  irrf: number
  totalDeductions: number
  netSalary: number
}

// Algoritmo Anônimo Gregoriano para o domingo de Páscoa.
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

// Feriados nacionais oficiais (Lei 9.093/95) — entram como descanso para DSR.
// Carnaval e Corpus Christi são facultativos e NÃO entram.
function brazilianHolidays(year: number): Set<string> {
  const fixed: [number, number][] = [
    [1, 1],   // Confraternização Universal
    [4, 21],  // Tiradentes
    [5, 1],   // Dia do Trabalho
    [9, 7],   // Independência
    [10, 12], // N. Sra. Aparecida
    [11, 2],  // Finados
    [11, 15], // Proclamação da República
    [11, 20], // Consciência Negra
    [12, 25], // Natal
  ]
  const set = new Set<string>(fixed.map(([m, d]) => `${year}-${m}-${d}`))
  const easter = easterSunday(year)
  const goodFriday = new Date(easter)
  goodFriday.setDate(goodFriday.getDate() - 2)
  set.add(`${goodFriday.getFullYear()}-${goodFriday.getMonth() + 1}-${goodFriday.getDate()}`)
  return set
}

// Conta dias de descanso (domingos + feriados nacionais) e dias úteis do mês.
// Lei 605/49 + Lei 9.093/95. Sábado conta como dia útil.
function countRestAndWorkingDays(month: number, year: number): { restDays: number; working: number } {
  const daysInMonth = new Date(year, month, 0).getDate()
  const holidays = brazilianHolidays(year)
  let restDays = 0
  let working = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    const isHoliday = holidays.has(`${year}-${month}-${day}`)
    if (date.getDay() === 0 || isHoliday) restDays++
    else working++
  }
  return { restDays, working }
}

// DSR sobre HE (Súmula 172 TST + Lei 605/49):
//   DSR = HE_total × dias_descanso / dias_úteis
function calculateDSR(overtimeValue: number, month: number | null, year: number | null): number {
  if (overtimeValue <= 0 || month == null || year == null) return 0
  const { restDays, working } = countRestAndWorkingDays(month, year)
  if (working === 0) return 0
  return Math.round((overtimeValue * restDays / working) * 100) / 100
}

export function calculateNetSalary(
  baseSalary: number,
  mealAllowance: number,
  healthPlanDeduction: number,
  overtimeHours: number,
  overtimeMultiplier: number,
  monthlyBonus: number,
  discountsAbsences: number,
  referenceMonth: number | null = null,
  referenceYear: number | null = null,
): SalaryCalcResult {
  const hourlyRate = baseSalary / 220
  const overtimeValue = Math.round(overtimeHours * hourlyRate * (1 + overtimeMultiplier) * 100) / 100
  const dsrValue = calculateDSR(overtimeValue, referenceMonth, referenceYear)

  const totalGross = Math.round((baseSalary + mealAllowance + overtimeValue + dsrValue + monthlyBonus) * 100) / 100

  // INSS base excludes meal allowance
  const inssBase = baseSalary + overtimeValue + dsrValue + monthlyBonus
  const inss = calculateINSS(inssBase)

  const irrf = calculateIRRF(inssBase, inss)

  const totalDeductions = Math.round((healthPlanDeduction + inss + irrf + discountsAbsences) * 100) / 100
  const netSalary = Math.round((totalGross - totalDeductions) * 100) / 100

  return { overtimeValue, dsrValue, totalGross, inss, irrf, totalDeductions, netSalary }
}
