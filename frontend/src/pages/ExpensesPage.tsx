import { useQuery } from '@tanstack/react-query'
import { getTransactionsGrouped } from '../api/client'
import MonthlySpendingChart from '../components/charts/MonthlySpendingChart'
import CategoryDistribution from '../components/charts/CategoryDistribution'
import TransactionListCard from '../components/TransactionListCard'

export default function ExpensesPage() {
  const { data: grouped } = useQuery({
    queryKey: ['transactions-grouped'],
    queryFn: () => getTransactionsGrouped(),
  })

  return (
    <div className="space-y-8">
      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MonthlySpendingChart />
        <CategoryDistribution />
      </div>

      {/* Transaction Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <TransactionListCard
          transactions={grouped?.one_time || []}
          title="Gastos Avulsos"
          icon="shopping_cart"
        />
        <TransactionListCard
          transactions={grouped?.recurring || []}
          title="Gastos Fixos / Cartão"
          icon="credit_card"
        />
      </div>
    </div>
  )
}
