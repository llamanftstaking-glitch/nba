// Courtside: shared helpers and small presentational atoms. No data is created here.
import { useState, type CSSProperties, type ReactNode } from 'react'
import clsx from 'clsx'
import { data, playerHeadshotSized, teamByAbbr, teamLogo } from '../../data'

/** Public brand colours, used only on scoreboards, matchup headers and game charts. Design tokens, not data. */
const TEAM_COLOR: Record<string, string> = {
  ATL: '#C8102E', BOS: '#007A33', BKN: '#1B1B1B', CHA: '#00788C', CHI: '#CE1141', CLE: '#860038',
  DAL: '#00538C', DEN: '#0E2240', DET: '#C8102E', GSW: '#1D428A', HOU: '#CE1141', IND: '#002D62',
  LAC: '#C8102E', LAL: '#552583', MEM: '#5D76A9', MIA: '#98002E', MIL: '#00471B', MIN: '#0C2340',
  NOP: '#0C2340', NYK: '#006BB6', OKC: '#007AC1', ORL: '#0077C0', PHI: '#006BB6', PHX: '#1D1160',
  POR: '#E03A3E', SAC: '#5A2D81', SAS: '#1B1B1B', TOR: '#CE1141', UTA: '#002B5C', WAS: '#002B5C',
}
export const teamColor = (abbr: string | null | undefined) => (abbr && TEAM_COLOR[abbr]) || '#12161A'

/** "New York Knicks" -> { city: "New York", nick: "Knicks" } from the stored team name. */
export function teamNames(abbr: string, fallbackName?: string) {
  const name = teamByAbbr(abbr)?.name ?? fallbackName ?? abbr
  const two = / (Trail Blazers)$/.exec(name)
  const nick = two ? two[1] : name.split(' ').slice(-1)[0]
  return { name, nick, city: name.slice(0, name.length - nick.length).trim() }
}
export function teamRecord(abbr: string) {
  const t = teamByAbbr(abbr)
  return t ? `${t.wins}–${t.losses}` : null
}

const LONG_DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
const TINY_DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
const asUTC = (ymd: string) => new Date(`${ymd.slice(0, 10)}T12:00:00Z`)
export const longDate = (ymd: string) => LONG_DATE.format(asUTC(ymd))
export const shortDate = (ymd: string) => SHORT_DATE.format(asUTC(ymd))
export const tinyDate = (ymd: string) => TINY_DATE.format(asUTC(ymd))

const STAMP = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})
/** "Nov 25, 4:43 PM ET" */
export const stampET = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `${STAMP.format(d)} ET`
}
const CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit',
})
export const clockET = (iso: string) => CLOCK.format(new Date(iso))

export const NA = '—'
export const num = (v: number | null | undefined, digits = 0) => (v == null ? NA : v.toFixed(digits))
export const pct = (v: number | null | undefined, digits = 0) => (v == null ? NA : `${(v * 100).toFixed(digits)}%`)
export const cents = (v: number | null | undefined) => (v == null ? NA : `${(v * 100).toFixed(1).replace(/\.0$/, '')}¢`)
export const american = (v: number | null | undefined) => (v == null ? NA : v > 0 ? `+${v}` : `−${Math.abs(v)}`)
export const signed = (v: number | null | undefined, digits = 0) =>
  v == null ? NA : v > 0 ? `+${v.toFixed(digits)}` : v < 0 ? `−${Math.abs(v).toFixed(digits)}` : (0).toFixed(digits)
export const compact = (v: number | null | undefined) =>
  v == null ? NA : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0)
/** elapsed seconds in a 48-minute game -> "Q3 4:12" */
export const gameClock = (s: number) => {
  const q = Math.min(4, Math.floor(s / 720) + 1)
  const left = Math.max(0, q * 720 - s)
  return `Q${q} ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`
}

export const SNAPSHOT = data.meta.snapshot_date
export const featuredId = data.meta.featured_game_id

// ---- atoms ------------------------------------------------------------------------------------

export function TeamMark({ abbr, size = 32, className }: { abbr: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = teamLogo(abbr)
  const name = teamByAbbr(abbr)?.name ?? abbr
  if (!src || failed) {
    return (
      <span className={clsx('mark mark-fallback', className)} style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34) }} role="img" aria-label={`${name} (no mark held)`}>
        {abbr}
      </span>
    )
  }
  return <img className={clsx('mark', className)} src={src} width={size} height={size} alt={`${name} mark`} loading="eager" onError={() => setFailed(true)} />
}

export function Headshot({ player, name, size = 48, className }: { player: { headshot_url?: string | null } | null | undefined; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = playerHeadshotSized(player, size <= 64 ? 160 : size <= 160 ? 360 : 600)
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('')
  const style: CSSProperties = { width: size, height: size }
  if (!src || failed) {
    return (
      <span className={clsx('shot shot-fallback', className)} style={{ ...style, fontSize: Math.max(12, size * 0.36) }} role="img" aria-label={`${name} (no photo held)`}>
        {initials}
      </span>
    )
  }
  return (
    <span className={clsx('shot', className)} style={style}>
      <img src={src} alt={name} onError={() => setFailed(true)} />
    </span>
  )
}

/** The quiet label that carries provenance: "Final", "Projected, not official", "Model estimate"... */
export function Slot({ children, tone, live }: { children: ReactNode; tone?: 'model' | 'plain'; live?: boolean }) {
  return (
    <span className={clsx('slot', tone === 'model' && 'slot-model', live && 'slot-live')}>
      {live && <span className="live-dot" aria-hidden="true" />}
      {children}
    </span>
  )
}

export function Delta({ v, unit = 'c' }: { v: number | null | undefined; unit?: 'c' | 'raw' }) {
  if (v == null) return <span className="delta">{NA}</span>
  const mag = unit === 'c' ? `${Math.abs(v * 100).toFixed(1).replace(/\.0$/, '')}¢` : Math.abs(v).toString()
  if (v === 0) return <span className="delta delta-flat">0</span>
  return (
    <span className="delta">
      <span aria-hidden="true" className="delta-arrow">{v > 0 ? '▲' : '▼'}</span>
      <span className="sr">{v > 0 ? 'up' : 'down'} </span>
      {mag}
    </span>
  )
}

/**
 * A model probability drawn on a ruled 0 to 100 scale: interval band, estimate tick (accent = model),
 * and the price break-even as an ink notch on the same scale.
 */
export function ProbScale({ prob, low, high, breakeven, compact: small }: { prob: number | null; low?: number | null; high?: number | null; breakeven?: number | null; compact?: boolean }) {
  if (prob == null) return <span className="muted">Not available</span>
  const lo = low != null ? Math.min(low, prob) : null
  const hi = high != null ? Math.max(high, prob) : null
  const label = `Model estimate ${pct(prob, 1)}${lo != null && hi != null ? `, interval ${pct(lo, 0)} to ${pct(hi, 0)}` : ''}${breakeven != null ? `, price break-even ${pct(breakeven, 1)}` : ''}`
  return (
    <span className={clsx('pscale', small && 'pscale-compact')} role="img" aria-label={label}>
      <span className="pscale-track">
        <span className="pscale-mid" />
        {lo != null && hi != null && <span className="pscale-band" style={{ left: `${lo * 100}%`, width: `${Math.max(0.6, (hi - lo) * 100)}%` }} />}
        {breakeven != null && <span className="pscale-be" style={{ left: `${breakeven * 100}%` }} />}
        <span className="pscale-tick" style={{ left: `${prob * 100}%` }} />
      </span>
    </span>
  )
}

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx('note', className)}>{children}</p>
}

export function SectionHead({ title, aside, id, level = 2 }: { title: ReactNode; aside?: ReactNode; id?: string; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3'
  return (
    <div className="sec-head">
      <H id={id} className={level === 2 ? 'h-section' : 'h-sub'}>{title}</H>
      {aside && <div className="sec-aside">{aside}</div>}
    </div>
  )
}
