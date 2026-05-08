import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  duration?: number
}

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
  duration: number
}

interface ToastContextValue {
  show: (message: string, variant: ToastVariant, options?: ToastOptions) => void
  success: (message: string, options?: ToastOptions) => void
  error: (message: string, options?: ToastOptions) => void
  info: (message: string, options?: ToastOptions) => void
  warning: (message: string, options?: ToastOptions) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastVariant, string> = {
  success: 'check_circle',
  error: 'error',
  info: 'info',
  warning: 'warning',
}

const VARIANT_STYLES: Record<ToastVariant, { border: string; icon: string; bar: string }> = {
  success: { border: 'border-tertiary/40', icon: 'text-tertiary', bar: 'bg-tertiary' },
  error: { border: 'border-error/40', icon: 'text-error', bar: 'bg-error' },
  info: { border: 'border-primary/40', icon: 'text-primary', bar: 'bg-primary' },
  warning: { border: 'border-amber-500/40', icon: 'text-amber-400', bar: 'bg-amber-400' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, variant: ToastVariant, options?: ToastOptions) => {
      const id = ++idRef.current
      const duration = options?.duration ?? (variant === 'error' ? 6000 : 3500)
      setToasts((prev) => [...prev, { id, message, variant, duration }])
    },
    [],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m, o) => show(m, 'success', o),
      error: (m, o) => show(m, 'error', o),
      info: (m, o) => show(m, 'info', o),
      warning: (m, o) => show(m, 'warning', o),
      dismiss,
    }),
    [show, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-auto pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastItemView key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItemView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const styles = VARIANT_STYLES[toast.variant]

  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(toast.id), toast.duration)
    return () => window.clearTimeout(t)
  }, [toast.id, toast.duration, onDismiss])

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto bg-surface-container border ${styles.border} rounded-xl shadow-lg overflow-hidden animate-[toast-in_180ms_ease-out]`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className={`material-symbols-outlined ${styles.icon} flex-shrink-0`} aria-hidden="true">
          {ICONS[toast.variant]}
        </span>
        <div className="flex-1 text-sm text-on-surface leading-snug">{toast.message}</div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0"
          aria-label="Fechar notificação"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>
      <div className={`h-0.5 ${styles.bar} animate-[toast-bar_var(--toast-d)_linear_forwards]`} style={{ ['--toast-d' as string]: `${toast.duration}ms` }} />
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>')
  return ctx
}
