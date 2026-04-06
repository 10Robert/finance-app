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
