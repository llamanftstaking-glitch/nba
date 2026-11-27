// Hand-drawn SVG charts for the game page. Every mark is a stored observation.
import { useEffect, useRef, useState } from 'react'
import { featuredGame } from '../../data'
import { gameClock, teamColor } from './lib'

export function useWidth<T extends HTMLElement>(initial = 800) {
  const ref = useRef<T | null>(null)
  const [w, setW] = useState(initial)
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    setW(el.clientWidth)
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Lead over the 48 minutes: home above the line, away below. Step line, because scores change in steps. */
export function LeadChart() {
  const m = featuredGame.momentum
  const home = featuredGame.live.home.abbr
  const away = featuredGame.live.away.abbr
  const [ref, w] = useWidth<HTMLDivElement>(820)
  const small = w < 560
  const h = small ? 240 : 300
  const pad = { l: small ? 62 : 76, r: 12, t: 18, b: 30 }
  const iw = Math.max(10, w - pad.l - pad.r)
  const ih = h - pad.t - pad.b
  const top = Math.ceil((m.largest_lead.home + 1) / 5) * 5
  const bottom = Math.ceil((m.largest_lead.away + 1) / 5) * 5
  const x = (t: number) => pad.l + (t / 2880) * iw
  const y = (d: number) => pad.t + ((top - d) / (top + bottom)) * ih
  const pts = [{ t: 0, diff: 0 }, ...m.points.map((p) => ({ t: p.t, diff: p.diff }))]
  const area = (clamp: (d: number) => number) => {
    let d = `M${x(0)},${y(0)}`
    let prev = 0
    for (const p of pts) {
      d += `H${x(p.t).toFixed(1)}V${y(clamp(p.diff)).toFixed(1)}`
      prev = p.diff
    }
    d += `H${x(2880)}V${y(0)}Z`
    void prev
    return d
  }
  let line = `M${x(0)},${y(0)}`
  for (const p of pts) line += `H${x(p.t).toFixed(1)}V${y(p.diff).toFixed(1)}`
  line += `H${x(2880)}`
  const peakHome = m.points.reduce((a, b) => (b.diff > a.diff ? b : a))
  const peakAway = m.points.reduce((a, b) => (b.diff < a.diff ? b : a))
  const hc = teamColor(home)
  const ac = teamColor(away)
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={h} role="img" aria-label={`Lead by game time. ${home} led by as many as ${m.largest_lead.home}, ${away} by as many as ${m.largest_lead.away}. ${m.lead_changes} lead changes, ${m.ties} ties.`}>
        {[1, 2, 3].map((q) => (
          <line key={q} x1={x(q * 720)} x2={x(q * 720)} y1={pad.t} y2={h - pad.b} className="c-grid" />
        ))}
        {[0, 1, 2, 3].map((q) => (
          <text key={q} x={x(q * 720 + 360)} y={h - 8} textAnchor="middle" className="c-axis">
            Q{q + 1}
          </text>
        ))}
        <path d={area((d) => Math.max(0, d))} fill={hc} opacity={0.9} />
        <path d={area((d) => Math.min(0, d))} fill={ac} opacity={0.9} />
        <path d={line} fill="none" className="c-line" />
        <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} className="c-zero" />
        <text x={pad.l - 10} y={y(top) + 12} textAnchor="end" className="c-axis c-axis-strong" style={{ fill: hc }}>
          {home} +{top}
        </text>
        <text x={pad.l - 10} y={y(0) + 4} textAnchor="end" className="c-axis">
          Tied
        </text>
        <text x={pad.l - 10} y={y(-bottom)} textAnchor="end" className="c-axis c-axis-strong" style={{ fill: ac }}>
          {away} +{bottom}
        </text>
        <g>
          <circle cx={x(peakHome.t)} cy={y(peakHome.diff)} r={4} className="c-dot" />
          <text x={x(peakHome.t) - 8} y={y(peakHome.diff) - 6} textAnchor="end" className="c-note">
            {home} by {peakHome.diff}, {gameClock(peakHome.t)}
          </text>
          <circle cx={x(peakAway.t)} cy={y(peakAway.diff)} r={4} className="c-dot" />
          <text x={x(peakAway.t) + 8} y={y(peakAway.diff) + 16} className="c-note">
            {away} by {Math.abs(peakAway.diff)}, {gameClock(peakAway.t)}
          </text>
        </g>
      </svg>
    </div>
  )
}

/** Stints across the 48 minutes for one team. */
export function StintChart({ side }: { side: 'home' | 'away' }) {
  const team = featuredGame.rotations[side]
  const color = teamColor(team.abbr)
  const players = team.players.filter((p) => p.stints.length > 0)
  return (
    <div className="stints" style={{ ['--team' as string]: color }}>
      <div className="stint-row stint-head" aria-hidden="true">
        <span />
        <span className="stint-track stint-qs">
          <span>Q1</span>
          <span>Q2</span>
          <span>Q3</span>
          <span>Q4</span>
        </span>
        <span className="label r">Min</span>
        <span className="label r stint-proj">Proj</span>
        <span className="label r">Diff</span>
      </div>
      {players.map((p) => (
        <div className="stint-row" key={p.name}>
          <span className="stint-name">
            {p.name}
            {p.starter && <span className="stint-s" title="Starter"> S</span>}
          </span>
          <span className="stint-track" role="img" aria-label={`${p.name}: ${p.stints.length} stints, ${p.minutes ?? 'unknown'} minutes`}>
            {p.stints.map((s, i) => {
              const end = s.end_s ?? 2880
              return <span key={i} className="stint" style={{ left: `${(s.start_s / 2880) * 100}%`, width: `${Math.max(0.4, ((end - s.start_s) / 2880) * 100)}%` }} />
            })}
          </span>
          <span className="r tnum stint-min">{p.minutes ?? '—'}</span>
          <span className="r tnum stint-proj model">{p.proj_min != null ? p.proj_min.toFixed(1) : '—'}</span>
          <span className="r tnum">{p.minutes_vs_projection != null ? `${p.minutes_vs_projection > 0 ? '+' : '−'}${Math.abs(p.minutes_vs_projection).toFixed(1)}` : '—'}</span>
        </div>
      ))}
    </div>
  )
}
