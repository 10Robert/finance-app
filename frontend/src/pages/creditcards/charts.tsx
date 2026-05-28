import { useState, useEffect, useRef } from 'react'
import type { CreditCardMonthSummary, CreditCardDailySpend } from '../../types'
import {
  PT_MONTHS_SHORT,
  TREEMAP_COLORS,
  ACCENT,
  SUCCESS,
  INFO,
  fmt,
  fmtShort,
  Legend,
} from './shared'

/* ─── MonthStrip — cards de meses com linha SVG sobreposta ─────────────── */

export function MonthStrip({
  data,
  activeIdx,
  onSelect,
  onOpen,
}: {
  data: CreditCardMonthSummary[]
  activeIdx: number
  onSelect: (i: number) => void
  onOpen: (i: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasOverflowPrev, setHasOverflowPrev] = useState(false)
  const [hasOverflowNext, setHasOverflowNext] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragState = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null)

  const canPrev = activeIdx > 0
  const canNext = activeIdx >= 0 && activeIdx < data.length - 1

  const updateBounds = () => {
    const el = scrollRef.current
    if (!el) return
    setHasOverflowPrev(el.scrollLeft > 2)
    setHasOverflowNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateBounds()
    el.addEventListener('scroll', updateBounds, { passive: true })
    window.addEventListener('resize', updateBounds)
    return () => {
      el.removeEventListener('scroll', updateBounds)
      window.removeEventListener('resize', updateBounds)
    }
  }, [data.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || activeIdx < 0) return
    const cardEl = el.querySelector<HTMLElement>(`[data-month-card="${activeIdx}"]`)
    if (!cardEl) return
    const cardLeft = cardEl.offsetLeft
    const cardRight = cardLeft + cardEl.offsetWidth
    const viewLeft = el.scrollLeft
    const viewRight = viewLeft + el.clientWidth
    if (cardLeft < viewLeft || cardRight > viewRight) {
      el.scrollTo({
        left: cardLeft - (el.clientWidth - cardEl.offsetWidth) / 2,
        behavior: 'smooth',
      })
    }
  }, [activeIdx])

  const goToMonth = (dir: -1 | 1) => {
    const next = activeIdx + dir
    if (next < 0 || next >= data.length) return
    onSelect(next)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    dragState.current = { startX: e.clientX, startScroll: el.scrollLeft, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragState.current
    const el = scrollRef.current
    if (!st || !el) return
    const dx = e.clientX - st.startX
    if (!st.moved && Math.abs(dx) > 4) {
      st.moved = true
      setIsDragging(true)
      try {
        el.setPointerCapture(e.pointerId)
      } catch {}
    }
    if (st.moved) {
      el.scrollLeft = st.startScroll - dx
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (el && el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId)
    }
    dragState.current = null
    if (isDragging) {
      requestAnimationFrame(() => setIsDragging(false))
    }
  }

  if (data.length === 0) {
    return <p className="text-sm text-on-surface-variant text-center py-8">Sem dados.</p>
  }
  const cardW = 140
  const cardH = 130
  const gap = 12
  const totalW = data.length * (cardW + gap) - gap

  const max = Math.max(...data.map((d) => Number(d.total)), 1)
  const lineYTop = 18
  const lineYBottom = 70
  const yAt = (v: number) => lineYTop + (1 - v / max) * (lineYBottom - lineYTop)
  const xAt = (i: number) => i * (cardW + gap) + cardW / 2

  const points = data.map((d, i) => ({ x: xAt(i), y: yAt(Number(d.total)) }))
  const linePath = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`
    const prev = points[i - 1]
    const cx1 = prev.x + (p.x - prev.x) / 2
    const cy1 = prev.y
    const cx2 = prev.x + (p.x - prev.x) / 2
    const cy2 = p.y
    return acc + ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p.x} ${p.y}`
  }, '')
  const lastP = points[points.length - 1]
  const firstP = points[0]
  const areaPath = `${linePath} L ${lastP.x} ${cardH - 8} L ${firstP.x} ${cardH - 8} Z`

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => goToMonth(-1)}
        disabled={!canPrev}
        aria-label="Mês anterior"
        className={`absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full border border-outline-variant bg-surface-container/95 backdrop-blur text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface flex items-center justify-center transition-all ${
          canPrev ? 'opacity-100' : 'opacity-30 pointer-events-none'
        }`}
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
      >
        <span className="material-symbols-outlined text-lg">chevron_left</span>
      </button>
      <button
        type="button"
        onClick={() => goToMonth(1)}
        disabled={!canNext}
        aria-label="Próximo mês"
        className={`absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full border border-outline-variant bg-surface-container/95 backdrop-blur text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface flex items-center justify-center transition-all ${
          canNext ? 'opacity-100' : 'opacity-30 pointer-events-none'
        }`}
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
      >
        <span className="material-symbols-outlined text-lg">chevron_right</span>
      </button>
      {hasOverflowPrev && (
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, var(--color-surface-container, #18181b), transparent)' }}
        />
      )}
      {hasOverflowNext && (
        <div
          aria-hidden
          className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to left, var(--color-surface-container, #18181b), transparent)' }}
        />
      )}
      <div
        ref={scrollRef}
        className="relative overflow-x-auto cc-carousel select-none"
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (isDragging) {
            e.stopPropagation()
            e.preventDefault()
          }
        }}
      >
      <div className="relative" style={{ width: totalW, height: cardH }}>
        <svg
          width={totalW}
          height={cardH}
          className="absolute top-0 left-0 pointer-events-none"
          style={{ zIndex: 2 }}
        >
          <defs>
            <linearGradient id="ms-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#ms-area)" />
          <path
            d={linePath}
            stroke={ACCENT}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={i === activeIdx ? 6 : 4}
                fill={i === activeIdx ? ACCENT : 'var(--color-surface)'}
                stroke={ACCENT}
                strokeWidth="2"
              />
              {i === activeIdx && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="6"
                  fill="none"
                  stroke={ACCENT}
                  strokeOpacity="0.3"
                  strokeWidth="6"
                />
              )}
            </g>
          ))}
        </svg>

        <div className="flex relative" style={{ gap, zIndex: 1 }}>
          {data.map((d, i) => {
            const isActive = i === activeIdx
            return (
              <button
                key={i}
                data-month-card={i}
                onClick={() => onSelect(i)}
                onDoubleClick={() => onOpen(i)}
                className={`flex-shrink-0 rounded-xl px-3.5 py-3 flex flex-col justify-between text-left transition-all ${
                  isActive
                    ? 'border border-primary bg-primary/10'
                    : 'border border-outline-variant bg-surface-container-low hover:border-primary/40'
                }`}
                style={{
                  width: cardW,
                  height: cardH,
                  boxShadow: isActive ? `0 6px 20px ${ACCENT}40` : 'none',
                }}
              >
                <div
                  className={`text-xs font-semibold tracking-wide ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}
                >
                  {PT_MONTHS_SHORT[d.bill_month - 1]}
                </div>
                <div style={{ height: 30 }} />
                <div>
                  <div
                    className={`text-[15px] font-semibold tabular-nums tracking-tight ${
                      isActive ? 'text-on-surface' : 'text-on-surface'
                    }`}
                  >
                    {fmt(Number(d.total))}
                  </div>
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mt-1 tabular-nums">
                    {d.item_count} {d.item_count === 1 ? 'item' : 'itens'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      </div>
    </div>
  )
}

/* ─── SpendHeatmap — gastos por dia do mês ─────────────────────────────── */

export function SpendHeatmap({
  days,
  year,
  month,
}: {
  days: CreditCardDailySpend[]
  year: number
  month: number
}) {
  const max = Math.max(...days.map((d) => Number(d.total)), 1)
  const cols = 10
  const rows = Math.max(1, Math.ceil(days.length / cols))
  const cell = 28
  const gap = 4
  const W = cols * cell + (cols - 1) * gap
  const H = rows * cell + (rows - 1) * gap

  const colorAt = (v: number) => {
    if (v <= 0) return 'var(--color-surface-container-high)'
    const t = v / max
    return `color-mix(in oklch, ${ACCENT} ${Math.round(20 + t * 80)}%, var(--color-surface-variant))`
  }

  const [hover, setHover] = useState<CreditCardDailySpend | null>(null)
  const totalMonth = days.reduce((acc, d) => acc + Number(d.total), 0)

  return (
    <div>
      <div className="flex justify-between items-start mb-4 gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-on-surface">
            Gastos por dia · {PT_MONTHS_SHORT[month - 1]} {year}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant whitespace-nowrap">
          <span>Menos</span>
          {[0.1, 0.3, 0.5, 0.7, 1].map((t) => (
            <span
              key={t}
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: `color-mix(in oklch, ${ACCENT} ${Math.round(20 + t * 80)}%, var(--color-surface-variant))` }}
            />
          ))}
          <span>Mais</span>
        </div>
      </div>

      <div className="relative mx-auto" style={{ width: W }}>
        {days.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-8">Sem dados para este mês.</p>
        ) : (
          <svg width={W} height={H} className="block">
            {days.map((d, i) => {
              const c = i % cols
              const r = Math.floor(i / cols)
              const x = c * (cell + gap)
              const y = r * (cell + gap)
              const v = Number(d.total)
              return (
                <g
                  key={i}
                  onMouseEnter={() => setHover(d)}
                  onMouseLeave={() => setHover(null)}
                >
                  <rect
                    x={x}
                    y={y}
                    width={cell}
                    height={cell}
                    rx="4"
                    fill={colorAt(v)}
                    stroke={hover === d ? ACCENT : 'transparent'}
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer', transition: 'stroke 120ms' }}
                  />
                  <text
                    x={x + cell / 2}
                    y={y + cell / 2 + 3}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill={v > max * 0.6 ? 'white' : 'var(--color-on-surface-variant)'}
                    style={{ pointerEvents: 'none', fontFamily: 'ui-monospace, monospace' }}
                  >
                    {d.day}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
        {hover && (
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full bg-surface-container-high border border-outline-variant rounded-lg px-3 py-1.5 text-xs whitespace-nowrap pointer-events-none"
            style={{ boxShadow: '0 6px 18px rgba(0,0,0,0.4)' }}
          >
            <span className="text-on-surface-variant">Dia {hover.day}</span>
            <span className="ml-2 font-semibold tabular-nums">{fmt(Number(hover.total))}</span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-outline-variant flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">Total no mês</div>
        <div className="text-sm font-semibold tabular-nums text-on-surface">{fmt(totalMonth)}</div>
      </div>
    </div>
  )
}

/* ─── StackedBarsChart — composição mensal (12 meses) ──────────────────── */

export function StackedBarsChart({ data }: { data: CreditCardMonthSummary[] }) {
  const series = data.map((d) => ({
    mes: PT_MONTHS_SHORT[d.bill_month - 1],
    assinaturas: Number(d.subscription_total),
    parcelados: Number(d.installment_total),
    avulsos: Number(d.one_time_total),
  }))
  const max = Math.max(
    ...series.map((d) => d.assinaturas + d.parcelados + d.avulsos),
    1,
  )
  const W = 700
  const H = 220
  const padL = 36
  const padR = 8
  const padT = 10
  const padB = 22
  const iW = W - padL - padR
  const iH = H - padT - padB
  const groupW = iW / Math.max(series.length, 1)
  const barW = Math.min(28, groupW * 0.6)
  const colors = { assinaturas: SUCCESS, parcelados: ACCENT, avulsos: INFO }
  const [hover, setHover] = useState<{ d: typeof series[number]; total: number; x: number } | null>(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">Composição mensal</h3>
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mt-1">
            Assinaturas + Parcelados + Avulsos
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
          <Legend dot={colors.assinaturas} label="Assinaturas" />
          <Legend dot={colors.parcelados} label="Parcelados" />
          <Legend dot={colors.avulsos} label="Avulsos" />
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
          {[0, 0.5, 1].map((p, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={padT + iH * (1 - p)}
                y2={padT + iH * (1 - p)}
                stroke="var(--color-outline-variant)"
                strokeDasharray="2 4"
              />
              <text
                x={padL - 6}
                y={padT + iH * (1 - p) + 3}
                fontSize="9"
                fill="var(--color-outline)"
                textAnchor="end"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              >
                {fmtShort(max * p)}
              </text>
            </g>
          ))}
          {series.map((d, i) => {
            const total = d.assinaturas + d.parcelados + d.avulsos
            const x = padL + groupW * i + (groupW - barW) / 2
            const segs = [
              { k: 'assinaturas', v: d.assinaturas, c: colors.assinaturas },
              { k: 'parcelados', v: d.parcelados, c: colors.parcelados },
              { k: 'avulsos', v: d.avulsos, c: colors.avulsos },
            ]
            let acc = 0
            return (
              <g
                key={i}
                onMouseEnter={() => setHover({ d, total, x: x + barW / 2 })}
                onMouseLeave={() => setHover(null)}
              >
                {segs.map((s, j) => {
                  const h = (s.v / max) * iH
                  const y = padT + iH - acc - h
                  acc += h
                  return (
                    <rect
                      key={j}
                      x={x}
                      y={y}
                      width={barW}
                      height={Math.max(0, h)}
                      fill={s.c}
                      style={{
                        opacity: hover && hover.d !== d ? 0.4 : 1,
                        transition: 'opacity 140ms',
                      }}
                    />
                  )
                })}
                <text
                  x={x + barW / 2}
                  y={H - 6}
                  fontSize="9.5"
                  textAnchor="middle"
                  fill="var(--color-on-surface-variant)"
                  style={{ fontFamily: 'ui-monospace, monospace' }}
                >
                  {d.mes}
                </text>
              </g>
            )
          })}
        </svg>
        {hover && (
          <div
            className="absolute bg-surface-container-high border border-outline-variant rounded-lg p-2.5 text-[11px] pointer-events-none whitespace-nowrap"
            style={{
              left: `${(hover.x / W) * 100}%`,
              top: 0,
              transform: 'translate(-50%, -100%)',
              boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
            }}
          >
            <div className="font-semibold mb-1 text-on-surface">
              {hover.d.mes} · {fmt(hover.total)}
            </div>
            <div className="grid gap-x-3 text-[10px]" style={{ gridTemplateColumns: 'auto auto' }}>
              <span style={{ color: colors.assinaturas }}>Assinaturas</span>
              <span className="tabular-nums text-right">{fmt(hover.d.assinaturas)}</span>
              <span style={{ color: colors.parcelados }}>Parcelados</span>
              <span className="tabular-nums text-right">{fmt(hover.d.parcelados)}</span>
              <span style={{ color: colors.avulsos }}>Avulsos</span>
              <span className="tabular-nums text-right">{fmt(hover.d.avulsos)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── TreemapChart — gastos por categoria ──────────────────────────────── */

export function TreemapChart({
  data,
  label,
}: {
  data: { category_name: string; category_icon: string | null; total: number }[]
  label: string
}) {
  const sorted = [...data].sort((a, b) => Number(b.total) - Number(a.total))
  const total = sorted.reduce((acc, c) => acc + Number(c.total), 0)
  const W = 700
  const H = 220

  let x = 0
  const rects = sorted.map((c, i) => {
    const w = total > 0 ? (Number(c.total) / total) * W : 0
    const r = {
      ...c,
      x,
      y: 0,
      w,
      h: H,
      cor: TREEMAP_COLORS[i % TREEMAP_COLORS.length],
      total: Number(c.total),
    }
    x += w
    return r
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">Categorias · {label}</h3>
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mt-1">
            Tamanho proporcional ao gasto
          </div>
        </div>
        <span className="text-xs text-on-surface-variant tabular-nums">{fmt(total)}</span>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-on-surface-variant text-center py-12">Sem dados.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block rounded-lg">
          {rects.map((r, i) => {
            const pct = total > 0 ? Math.round((r.total / total) * 100) : 0
            return (
              <g key={i}>
                <rect
                  x={r.x + 2}
                  y={r.y + 2}
                  width={Math.max(0, r.w - 4)}
                  height={r.h - 4}
                  rx="6"
                  fill={r.cor}
                  fillOpacity="0.18"
                  stroke={r.cor}
                  strokeOpacity="0.4"
                  strokeWidth="1"
                />
                {r.w > 70 && (
                  <>
                    <text x={r.x + 12} y={r.y + 24} fontSize="11" fontWeight="600" fill="var(--color-on-surface)">
                      {r.category_name}
                    </text>
                    <text
                      x={r.x + 12}
                      y={r.y + 42}
                      fontSize="11"
                      fill={r.cor}
                      style={{ fontFamily: 'ui-monospace, monospace' }}
                    >
                      {fmt(r.total)}
                    </text>
                    <text
                      x={r.x + 12}
                      y={r.y + 58}
                      fontSize="9"
                      fill="var(--color-on-surface-variant)"
                      style={{ fontFamily: 'ui-monospace, monospace' }}
                    >
                      {pct}%
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
