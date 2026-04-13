import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import TransactionsPage from './pages/TransactionsPage'
import SalaryPage from './pages/SalaryPage'
import ExpensesPage from './pages/ExpensesPage'
import SettingsPage from './pages/SettingsPage'

const navItems = [
  { to: '/', label: 'Painel', icon: 'dashboard' },
  { to: '/expenses', label: 'Gastos', icon: 'shopping_cart' },
  { to: '/transactions', label: 'Transações', icon: 'receipt_long' },
  { to: '/reports', label: 'Relatórios', icon: 'analytics' },
  { to: '/salary', label: 'Rendimentos', icon: 'trending_up' },
  { to: '/settings', label: 'Configurações', icon: 'settings' },
]

export default function App() {
  const location = useLocation()

  return (
    <div className="flex min-h-screen bg-bg text-on-surface">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-64 border-r border-[#27272a] bg-[#09090b] flex flex-col py-6 z-50">
        <div className="px-6 mb-10 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance</span>
          </div>
          <div>
            <h1 className="text-xl font-black text-on-surface tracking-tighter">Obsidian Finance</h1>
            <p className="text-xs text-on-surface-variant">Gestão Financeira</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
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
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="text-sm font-medium">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
        <div className="px-6 mt-auto">
          <div className="p-4 rounded-lg bg-[#18181b]/50 border border-[#27272a]">
            <p className="text-xs text-on-surface-variant font-medium">Plano Premium</p>
            <div className="w-full bg-[#27272a] h-1 mt-2 rounded-full overflow-hidden">
              <div className="bg-primary h-full w-3/4"></div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <main className="p-8 max-w-7xl mx-auto w-full space-y-8 flex-1">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/salary" element={<SalaryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
