import axios from 'axios'
import type {
  Category,
  TransactionList,
  Transaction,
  TransactionCreate,
  BankImport,
  StagedTransaction,
  BalanceData,
  MonthlyRevenueData,
  SpendingFlowData,
  SpendingByCategory,
  MonthlyTrend,
  RecentTransaction,
  SalaryConfig,
  SalaryCalculation,
  DiscountData,
  OvertimeEntryData,
  Income,
  IncomeCalculateRequest,
  MonthlyEntry,
  MonthlyEntryCreate,
  MonthlyEntryUpdate,
  MonthlySummary,
  ChartMonth,
  CategoryProgress,
  TransactionsGrouped,
} from '../types'

const api = axios.create({ baseURL: '/api' })

// Categories
export const getCategories = () =>
  api.get<Category[]>('/categories/').then((r) => r.data)

export const createCategory = (data: { name: string; type: string; icon?: string }) =>
  api.post<Category>('/categories/', data).then((r) => r.data)

export const deleteCategory = (id: number) =>
  api.delete(`/categories/${id}`)

// Transactions
export const getTransactions = (params: {
  page?: number
  per_page?: number
  start_date?: string
  end_date?: string
  category_id?: number
  type?: string
}) => api.get<TransactionList>('/transactions/', { params }).then((r) => r.data)

export const createTransaction = (data: TransactionCreate) =>
  api.post<Transaction>('/transactions/', data).then((r) => r.data)

export const updateTransaction = (id: number, data: Partial<TransactionCreate>) =>
  api.put<Transaction>(`/transactions/${id}`, data).then((r) => r.data)

export const deleteTransaction = (id: number) =>
  api.delete(`/transactions/${id}`)

// Imports
export const getImports = () =>
  api.get<BankImport[]>('/imports/').then((r) => r.data)

export const uploadFile = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post<BankImport>('/imports/upload', form).then((r) => r.data)
}

export const processImport = (id: number) =>
  api.post<{ count: number }>(`/imports/${id}/process`).then((r) => r.data)

export const getStagedTransactions = (id: number) =>
  api.get<StagedTransaction[]>(`/imports/${id}/staged`).then((r) => r.data)

export const updateStagedTransactions = (
  id: number,
  updates: { id: number; category_id?: number; accepted?: boolean }[]
) => api.put(`/imports/${id}/staged`, { updates })

export const confirmImport = (id: number) =>
  api.post<{ count: number }>(`/imports/${id}/confirm`).then((r) => r.data)

// Dashboard - New endpoints
export const getBalance = (params: { year: number; month?: number }) =>
  api.get<BalanceData>('/dashboard/balance', { params }).then((r) => r.data)

export const getMonthlyRevenue = (params: { year: number; month?: number }) =>
  api.get<MonthlyRevenueData>('/dashboard/monthly-revenue', { params }).then((r) => r.data)

export const getSpendingFlow = (params: { year: number; month?: number }) =>
  api.get<SpendingFlowData>('/dashboard/spending-flow', { params }).then((r) => r.data)

export const getTopCategories = (params: { year: number; month?: number; limit?: number }) =>
  api.get<SpendingByCategory[]>('/dashboard/top-categories', { params }).then((r) => r.data)

export const getRecentTransactions = (limit?: number) =>
  api.get<RecentTransaction[]>('/dashboard/recent-transactions', { params: { limit } }).then((r) => r.data)

// Legacy
export const getSpendingByCategory = (params?: { start_date?: string; end_date?: string }) =>
  api.get<SpendingByCategory[]>('/dashboard/spending-by-category', { params }).then((r) => r.data)

export const getMonthlyTrends = (months?: number) =>
  api.get<MonthlyTrend[]>('/dashboard/monthly-trends', { params: { months } }).then((r) => r.data)

// Salary
export const getSalaryConfig = () =>
  api.get<SalaryConfig | null>('/salary/config').then((r) => r.data)

export const saveSalaryConfig = (data: {
  base_salary: number
  overtime_hour_rate: number
  meal_allowance?: number
  health_plan_deduction?: number
  dental_plan_deduction?: number
  transport_voucher_enabled?: boolean
  transport_voucher_percent?: number
  fgts_balance?: number
}) => api.post<SalaryConfig>('/salary/config', data).then((r) => r.data)

export const updateSalaryConfig = (data: {
  base_salary?: number
  overtime_hour_rate?: number
  meal_allowance?: number
  health_plan_deduction?: number
  dental_plan_deduction?: number
  transport_voucher_enabled?: boolean
  transport_voucher_percent?: number
  fgts_balance?: number
}) => api.put<SalaryConfig>('/salary/config', data).then((r) => r.data)

export const addDiscount = (data: { name: string; type: string; value: number }) =>
  api.post<DiscountData>('/salary/discounts', data).then((r) => r.data)

export const removeDiscount = (id: number) =>
  api.delete(`/salary/discounts/${id}`)

export const addOvertime = (data: { month: number; year: number; hours: number; rate_percent: number }) =>
  api.post<OvertimeEntryData>('/salary/overtime', data).then((r) => r.data)

export const removeOvertime = (id: number) =>
  api.delete(`/salary/overtime/${id}`)

export const calculateSalary = (params: { month: number; year: number }) =>
  api.get<SalaryCalculation>('/salary/calculate', { params }).then((r) => r.data)

// Incomes
export const calculateIncome = (data: IncomeCalculateRequest) =>
  api.post<Income>('/incomes/calculate', data).then((r) => r.data)

export const launchIncome = (data: IncomeCalculateRequest) =>
  api.post<Income>('/incomes/launch', data).then((r) => r.data)

export const getIncomes = () =>
  api.get<Income[]>('/incomes/').then((r) => r.data)

export const deleteIncome = (id: number) =>
  api.delete(`/incomes/${id}`)

// Monthly Entries (overtime / refund / late / absence)
export const getMonthlyEntries = (params: { month: number; year: number }) =>
  api.get<MonthlyEntry[]>('/monthly-entries/', { params }).then((r) => r.data)

export const createMonthlyEntry = (data: MonthlyEntryCreate) =>
  api.post<MonthlyEntry>('/monthly-entries/', data).then((r) => r.data)

export const updateMonthlyEntry = (id: number, data: MonthlyEntryUpdate) =>
  api.put<MonthlyEntry>(`/monthly-entries/${id}`, data).then((r) => r.data)

export const deleteMonthlyEntry = (id: number) =>
  api.delete(`/monthly-entries/${id}`)

export const getMonthlySummary = (params: { month: number; year: number }) =>
  api.get<MonthlySummary>('/monthly-entries/summary', { params }).then((r) => r.data)

// Dashboard - New endpoints
export const getChart6Months = () =>
  api.get<ChartMonth[]>('/dashboard/chart-6months').then((r) => r.data)

export const getCategoryProgress = (params?: { year?: number; month?: number }) =>
  api.get<CategoryProgress[]>('/dashboard/category-progress', { params }).then((r) => r.data)

export const getTransactionsGrouped = (params?: { year?: number; month?: number }) =>
  api.get<TransactionsGrouped>('/dashboard/transactions-grouped', { params }).then((r) => r.data)
