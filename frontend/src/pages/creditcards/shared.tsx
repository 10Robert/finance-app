import { useId, useRef } from 'react'
import { useFocusTrap, useEscapeKey } from '../../utils/a11y'

/* ─── constants ────────────────────────────────────────────────────────── */

export const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
export const PT_MONTHS_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

export const TREEMAP_COLORS = [
  '#a78bfa', '#3b82f6', '#34d399', '#67e8f9',
  '#fbbf24', '#e879f9', '#f87171', '#f97316',
]

export const CARD_COLORS = [
  '#a78bfa', '#34d399', '#3b82f6', '#ef4444', '#f59e0b',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#71717a',
]

export const ACCENT = '#a78bfa'
export const SUCCESS = '#34d399'
export const INFO = '#3b82f6'

/* ─── formatters ───────────────────────────────────────────────────────── */

export const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export const fmtShort = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1000) return 'R$ ' + (v / 1000).toFixed(1).replace('.', ',') + 'k'
  return 'R$ ' + v.toFixed(0)
}

export const fmtDateBR = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')} ${PT_MONTHS_SHORT[d.getMonth()].toLowerCase()} ${d.getFullYear()}`
}

export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ─── shared primitives ────────────────────────────────────────────────── */

export function Modal({
  title, onClose, children, width = 'md', panelClassName = '', panelStyle, panelRef,
  onPanelPointerDown, onPanelPointerMove, onPanelPointerUp,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: 'md' | 'lg' | 'xl'
  panelClassName?: string
  panelStyle?: React.CSSProperties
  panelRef?: React.Ref<HTMLDivElement>
  onPanelPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPanelPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPanelPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void
}) {
  const widthCls =
    width === 'xl' ? 'max-w-4xl' : width === 'lg' ? 'max-w-2xl' : 'max-w-md'
  const internalRef = useRef<HTMLDivElement>(null)
  const ref = (panelRef as React.RefObject<HTMLDivElement>) ?? internalRef
  const titleId = useId()
  useFocusTrap(true, ref)
  useEscapeKey(true, onClose)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${widthCls} w-full bg-surface-container border border-outline-variant rounded-xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto ${panelClassName}`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPanelPointerDown}
        onPointerMove={onPanelPointerMove}
        onPointerUp={onPanelPointerUp}
        onPointerCancel={onPanelPointerUp}
      >
        <header className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-lg font-semibold text-on-surface">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-on-surface-variant hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
          >
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-on-surface-variant block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export function ToggleRow({
  icon, label, value, onChange, disabled,
}: {
  icon: string; label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border border-outline-variant ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 text-on-surface">
        <span className="material-symbols-outlined text-base text-on-surface-variant">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`w-11 h-6 rounded-full transition-colors relative ${value ? 'bg-primary' : 'bg-surface-container-highest'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            value ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export function IconBtn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="material-symbols-outlined text-base" aria-hidden="true">{icon}</span>
    </button>
  )
}

export function DetailField({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="material-symbols-outlined text-xs text-on-surface-variant">{icon}</span>
        <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">{label}</div>
      </div>
      <div className="text-sm font-medium text-on-surface">{value}</div>
    </div>
  )
}

export function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  )
}

export function CategoryFilterButton({
  categories,
  value,
  onChange,
}: {
  categories: { id: number; name: string; icon: string | null }[]
  value: number | 'all'
  onChange: (v: number | 'all') => void
}) {
  const active = value !== 'all'
  const label = active
    ? categories.find((c) => c.id === value)?.name || 'Categoria'
    : 'Categoria'
  return (
    <div className="relative">
      <select
        value={value === 'all' ? 'all' : String(value)}
        onChange={(e) => onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        className={`appearance-none pl-8 pr-7 py-1.5 text-xs rounded-lg border cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
          active
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-outline-variant bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
        }`}
        title="Filtrar por categoria"
      >
        <option value="all">Todas categorias</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <span
        className={`material-symbols-outlined text-sm absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none ${
          active ? 'text-primary' : 'text-on-surface-variant'
        }`}
      >
        sell
      </span>
      <span
        className={`material-symbols-outlined text-base absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${
          active ? 'text-primary' : 'text-on-surface-variant'
        }`}
      >
        expand_more
      </span>
      {/* keep label accessible to screen readers */}
      <span className="sr-only">{label}</span>
    </div>
  )
}
