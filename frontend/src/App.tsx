import { lazy, Suspense, useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'))
const SalaryPage = lazy(() => import('./pages/SalaryPage'))
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const CreditCardsPage = lazy(() => import('./pages/CreditCardsPage'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20 text-on-surface-variant text-sm">
      <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
      Carregando...
    </div>
  )
}

const navItems = [
  { to: '/', label: 'Painel', icon: 'dashboard' },
  { to: '/expenses', label: 'Gastos', icon: 'shopping_cart' },
  { to: '/credit-cards', label: 'Cartão de Crédito', icon: 'credit_card' },
  { to: '/transactions', label: 'Transações', icon: 'receipt_long' },
  { to: '/reports', label: 'Relatórios', icon: 'analytics' },
  { to: '/salary', label: 'Rendimentos', icon: 'trending_up' },
  { to: '/settings', label: 'Configurações', icon: 'settings' },
]

export default function App() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex min-h-screen bg-bg text-on-surface">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="fixed left-0 top-0 h-screen w-64 border-r border-[#27272a] bg-[#09090b] flex flex-col py-6 z-50">
          <div className="px-6 mb-10 flex items-center justify-between">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-on-surface-variant hover:text-on-surface transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
              title="Ocultar menu"
              aria-label="Ocultar menu lateral"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">menu_open</span>
            </button>
          </div>
          <nav aria-label="Menu principal" className="flex-1 space-y-1">
            {navItems.map((item) => {
              const isActive =
                item.to === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.to)
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-6 py-3 transition-colors duration-200 ${
                    isActive
                      ? 'text-primary font-bold border-r-2 border-primary bg-[#18181b]'
                      : 'text-on-surface-variant hover:bg-[#18181b] hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                </NavLink>
              )
            })}
          </nav>
        </aside>
      )}

      {/* Main */}
      <div
        className={`flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-200 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}
        style={sidebarOpen ? { width: 'calc(100% - 16rem)' } : undefined}
      >
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed top-4 left-4 z-50 text-on-surface-variant hover:text-on-surface transition-colors bg-[#09090b] border border-[#27272a] rounded-lg p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            title="Exibir menu"
            aria-label="Exibir menu lateral"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">menu</span>
          </button>
        )}
        <main className="p-8 max-w-7xl mx-auto w-full space-y-8 flex-1">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/credit-cards" element={<CreditCardsPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/salary" element={<SalaryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
