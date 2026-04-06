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
