import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ConfirmTone = 'danger' | 'primary'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve })
    })
  }, [])

  const handle = useCallback(
    (result: boolean) => {
      if (pending) {
        pending.resolve(result)
        setPending(null)
      }
    },
    [pending],
  )

  const value = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && <ConfirmDialogView options={pending} onResult={handle} />}
    </ConfirmContext.Provider>
  )
}

function ConfirmDialogView({
  options,
  onResult,
}: {
  options: ConfirmOptions
  onResult: (result: boolean) => void
}) {
  const tone: ConfirmTone = options.tone ?? 'danger'
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onResult(false)
      } else if (e.key === 'Tab') {
        const focusables = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[]
        if (focusables.length === 0) return
        const idx = focusables.indexOf(document.activeElement as HTMLElement)
        e.preventDefault()
        const next = e.shiftKey
          ? focusables[(idx - 1 + focusables.length) % focusables.length]
          : focusables[(idx + 1) % focusables.length]
        next?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onResult])

  const confirmClass =
    tone === 'danger'
      ? 'bg-error text-white hover:bg-error/90'
      : 'bg-primary text-on-primary hover:bg-primary/90'

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fade-in_120ms_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onResult(false)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="bg-surface-container border border-outline-variant rounded-xl shadow-2xl w-full max-w-md animate-[scale-in_140ms_ease-out]"
      >
        <div className="p-6">
          <h2 id="confirm-title" className="text-lg font-semibold text-on-surface mb-2">
            {options.title ?? 'Confirmar ação'}
          </h2>
          <p id="confirm-message" className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
            {options.message}
          </p>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-6">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onResult(false)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {options.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onResult(true)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${confirmClass}`}
          >
            {options.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm deve ser usado dentro de <ConfirmProvider>')
  return ctx.confirm
}
