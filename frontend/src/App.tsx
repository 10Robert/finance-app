import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import TransactionsPage from './pages/TransactionsPage'
import ImportPage from './pages/ImportPage'

const navItems = [
  { to: '/', label: 'Painel', icon: 'dashboard' },
  { to: '/transactions', label: 'Transações', icon: 'payments' },
  { to: '/import', label: 'Importar', icon: 'upload_file' },
]

export default function App() {
  const location = useLocation()

  return (
    <div className="flex min-h-screen bg-bg text-on-surface">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-64 border-r border-outline-variant bg-bg flex flex-col py-6 z-50">
        <div className="px-6 mb-10">
          <h1 className="text-xl font-bold text-on-surface">Obsidian</h1>
          <p className="text-xs text-on-surface-variant">Gestão Financeira</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-4 py-2 transition-colors duration-200 ${
                  isActive
                    ? 'text-primary font-bold border-r-2 border-primary'
                    : 'text-on-surface-variant hover:bg-outline-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <main className="p-8 space-y-8 flex-1">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/import" element={<ImportPage />} />
          </Routes>
        </main>
      </div>

      {/* Mobile FAB */}
      <NavLink
        to="/transactions"
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center z-50"
      >
        <span className="material-symbols-outlined">add</span>
      </NavLink>
    </div>
  )
}
