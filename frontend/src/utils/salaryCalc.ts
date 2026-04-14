// Client-side salary calculator (mirrors backend logic for real-time preview)

// INSS 2026 — teto R$ 8.475,55
const INSS_BRACKETS = [
  { limit: 1621.00, rate: 0.075 },
  { limit: 2902.84, rate: 0.09 },
  { limit: 4354.27, rate: 0.12 },
  { limit: 8475.55, rate: 0.14 },
]

// IRRF 2026
const IRRF_BRACKETS = [
  { limit: 2259.20, rate: 0, deduction: 0 },
  { limit: 2826.65, rate: 0.075, deduction: 169.44 },
  { limit: 3751.05, rate: 0.15, deduction: 381.44 },
  { limit: 4664.68, rate: 0.225, deduction: 662.77 },
  { limit: Infinity, rate: 0.275, deduction: 896.00 },
]

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

function calculateIRRF(baseAfterINSS: number): number {
  for (const bracket of IRRF_BRACKETS) {
    if (baseAfterINSS <= bracket.limit) {
      const irrf = baseAfterINSS * bracket.rate - bracket.deduction
      return Math.max(Math.round(irrf * 100) / 100, 0)
    }
  }
  return 0
}

export interface SalaryCalcResult {
  overtimeValue: number
  totalGross: number
  inss: number
  irrf: number
  totalDeductions: number
  netSalary: number
}

export function calculateNetSalary(
  baseSalary: number,
  mealAllowance: number,
  healthPlanDeduction: number,
  overtimeHours: number,
  overtimeMultiplier: number,
  monthlyBonus: number,
  discountsAbsences: number,
): SalaryCalcResult {
  const hourlyRate = baseSalary / 220
  const overtimeValue = Math.round(overtimeHours * hourlyRate * (1 + overtimeMultiplier) * 100) / 100

  const totalGross = Math.round((baseSalary + mealAllowance + overtimeValue + monthlyBonus) * 100) / 100

  // INSS base excludes meal allowance
  const inssBase = baseSalary + overtimeValue + monthlyBonus
  const inss = calculateINSS(inssBase)

  const irrfBase = inssBase - inss
  const irrf = calculateIRRF(irrfBase)

  const totalDeductions = Math.round((healthPlanDeduction + inss + irrf + discountsAbsences) * 100) / 100
  const netSalary = Math.round((totalGross - totalDeductions) * 100) / 100

  return { overtimeValue, totalGross, inss, irrf, totalDeductions, netSalary }
}
