export interface Category {
  id: number
  name: string
  type: 'expense' | 'income'
  icon: string | null
  created_at: string
}

export interface Transaction {
  id: number
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
  category_id: number | null
  category: Category | null
  notes: string | null
  bank_import_id: number | null
  is_recurring: boolean
  recurring_day: number | null
  icon: string
  source: string | null
  created_at: string
  updated_at: string
}

export interface TransactionList {
  items: Transaction[]
  total: number
  page: number
  per_page: number
}

export interface TransactionCreate {
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
  category_id?: number | null
  notes?: string | null
  is_recurring?: boolean
  recurring_day?: number | null
  icon?: string
}

export interface BankImport {
  id: number
  filename: string
  file_type: string
  row_count: number | null
  status: string
  error_message: string | null
  created_at: string
}

export interface StagedTransaction {
  id: number
  bank_import_id: number
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
  category_id: number | null
  category: Category | null
  confidence: number | null
  original_text: string | null
  accepted: boolean
}

// Dashboard types
export interface BalanceData {
  balance: number
  income_total: number
  expense_total: number
  variation_percent: number | null
}

export interface MonthlyRevenueData {
  revenue: number
  goal: number | null
  goal_percent: number | null
}

export interface SpendingFlowPoint {
  label: string
  amount: number
}

export interface SpendingFlowData {
  period: 'monthly' | 'annual'
  points: SpendingFlowPoint[]
}

export interface SpendingByCategory {
  category_name: string
  category_icon: string | null
  total: number
  color: string | null
}

export interface MonthlyTrend {
  month: string
  income: number
  expenses: number
  net: number
}

// Salary types
export interface DiscountData {
  id: number
  salary_config_id: number
  name: string
  type: 'fixed' | 'percent'
  value: number
  created_at: string
}

export interface OvertimeEntryData {
  id: number
  salary_config_id: number
  month: number
  year: number
  hours: number
  rate_percent: 70 | 100
  created_at: string
}

export interface SalaryConfig {
  id: number
  base_salary: number
  overtime_hour_rate: number
  meal_allowance: number
  health_plan_deduction: number
  dental_plan_deduction: number
  transport_voucher_enabled: boolean
  transport_voucher_percent: number
  fgts_balance: number
  reference_month: number | null
  reference_year: number | null
  coparticipation: number
  discounts: DiscountData[]
  overtime_entries: OvertimeEntryData[]
  created_at: string
  updated_at: string
}

export interface SalaryCalculation {
  base_salary: number
  overtime_total: number
  overtime_details: { id: number; hours: number; rate_percent: number; value: number }[]
  gross_salary: number
  discounts_total: number
  discount_details: { id: number; name: string; type: string; value: number; amount: number }[]
  net_salary: number
}

export interface RecentTransaction {
  id: number
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
  category_name: string | null
  category_icon: string | null
  icon: string
}

// Income types
export interface IncomeCalculateRequest {
  reference_month: number
  reference_year: number
  overtime_hours: number
  overtime_multiplier: number
  monthly_bonus: number
  discounts_absences: number
}

export interface Income {
  id: number
  reference_month: number
  reference_year: number
  base_salary: number
  meal_allowance: number
  health_plan_deduction: number
  overtime_hours: number
  overtime_multiplier: number
  monthly_bonus: number
  discounts_absences: number
  overtime_value: number
  dsr_value: number
  inss: number
  irrf: number
  total_gross: number
  total_deductions: number
  net_salary: number
  created_at: string
}

// New Dashboard types
export interface ChartMonth {
  month_label: string
  total: number
}

export interface CategoryProgress {
  name: string
  total: number
  percentage: number
}

export interface TransactionsGrouped {
  one_time: Transaction[]
  recurring: Transaction[]
}

// Expenses Chart (stacked bar)
export interface ExpensesChartBar {
  label: string
  income: number
  expenses: number
  net: number
  accumulated: number
}

export interface ExpensesChartData {
  mode: 'annual' | 'monthly' | 'weekly'
  bars: ExpensesChartBar[]
  total_expenses: number
  monthly_average: number
  highest_label: string
}

// Fixed Expenses
export interface FixedExpense {
  id: number
  description: string
  amount: number
  category_id: number | null
  category: Category | null
  day_of_month: number
  is_permanent: boolean
  start_date: string
  end_date: string | null
  active: boolean
  icon: string
  created_at: string
}

export interface FixedExpenseCreate {
  description: string
  amount: number
  category_id?: number | null
  day_of_month?: number
  is_permanent?: boolean
  start_date: string
  end_date?: string | null
  icon?: string
}

// Installment Purchases
export interface InstallmentPurchase {
  id: number
  description: string
  total_amount: number
  installment_count: number
  category_id: number | null
  category: Category | null
  start_date: string
  icon: string
  created_at: string
}

export interface InstallmentPurchaseCreate {
  description: string
  total_amount: number
  installment_count: number
  category_id?: number | null
  start_date: string
  icon?: string
}

// Monthly Entries (overtime / refund / late / absence / medical certificate launches)
export type MonthlyEntryType = 'overtime' | 'refund' | 'late' | 'absence' | 'medical_certificate'

export interface MonthlyEntry {
  id: number
  reference_month: number
  reference_year: number
  entry_type: MonthlyEntryType
  entry_date: string
  description: string | null
  amount: number | null
  hours: number | null
  overtime_multiplier: number | null
  days: number | null
  created_at: string
}

export interface MonthlyEntryCreate {
  reference_month: number
  reference_year: number
  entry_type: MonthlyEntryType
  entry_date?: string | null
  description?: string | null
  amount?: number | null
  hours?: number | null
  overtime_multiplier?: number | null
  days?: number | null
}

export interface MonthlyEntryUpdate {
  entry_date?: string | null
  description?: string | null
  amount?: number | null
  hours?: number | null
  overtime_multiplier?: number | null
  days?: number | null
}

export interface MonthlySummary {
  reference_month: number
  reference_year: number
  base_salary: number
  meal_allowance: number
  overtime_hours_total: number
  overtime_value: number
  dsr_value: number
  refunds_total: number
  late_hours_total: number
  late_value: number
  absence_days_total: number
  absence_value: number
  discounts_absences_value: number
  health_plan_deduction: number
  dental_plan_deduction: number
  transport_voucher_value: number
  coparticipation: number
  medical_certificate_days: number
  inss: number
  irrf: number
  total_gross: number
  total_deductions: number
  net_salary: number
  fgts_balance: number
}
