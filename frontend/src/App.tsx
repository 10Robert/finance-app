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

const BREADCRUMBS: Record<string, string> = {
  '/': 'Painel',
  '/expenses': 'Gastos',
  '/transactions': 'Transações',
  '/reports': 'Relatórios',
  '/salary': 'Rendimentos Mensais',
  '/settings': 'Configurações',
}

export default function App() {
  const location = useLocation()
  const currentTitle = BREADCRUMBS[location.pathname] || 'Painel'

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
        {/* Top Bar */}
        <header className="flex justify-between items-center px-8 h-16 w-full sticky top-0 z-40 bg-[#09090b]/80 backdrop-blur-md border-b border-[#27272a]">
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-on-surface-variant">
              <span>Painel</span>
              <span className="material-symbols-outlined text-[10px]">chevron_right</span>
              <span className="text-on-surface">{currentTitle}</span>
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-sm">calendar_month</span>
              <span className="text-sm font-medium">Selecione o Período</span>
            </div>
            <button className="text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined">filter_list</span>
            </button>
          </div>
        </header>

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
