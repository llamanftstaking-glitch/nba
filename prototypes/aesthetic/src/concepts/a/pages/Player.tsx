import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { data, type FeaturedPlayer } from '../../../data'
import { Headshot, NA, Note, SectionHead, Slot, TeamMark, cents, num, shortDate, stampET, teamColor, teamNames, tinyDate } from '../lib'
import { useWidth } from '../GameCharts'

type Log = { date: string; opp_abbr: string; is_home: boolean; result: string; team_points: number; opp_points: number; min: number; pts: number; reb: number; ast: number; fg3m: number; stl: number; blk: number; tov: number; fga: number; fta: number; usage: number | null }

// ---- chart: last appearances, with missed games as gaps and the pregame projection beside the observed game
function FormChart({ p, stat }: { p: FeaturedPlayer; stat: 'pts' | 'min' }) {
  const [ref, w] = useWidth<HTMLDivElement>(800)
  const small = w < 560
  const logs = ([...p.game_logs.items] as Log[]).reverse()
  const first = logs[0].date
  const missed = p.game_logs.missed.filter((m) => m.date > first)
  type Cell = { kind: 'game'; g: Log } | { kind: 'missed'; date: string; opp: string }
  const slots: Cell[] = [...logs.map((g) => ({ kind: 'game' as const, g })), ...missed.map((m) => ({ kind: 'missed' as const, date: m.date, opp: m.opp_abbr }))].sort((a, b) =>
    (a.kind === 'game' ? a.g.date : a.date).localeCompare(b.kind === 'game' ? b.g.date : b.date),
  )
  const line = p.live.live?.line
  const proj = stat === 'pts' ? p.profile.projections.find((x) => x.stat === 'pts') : null
  const mp = p.minutes.profile
  const est = stat === 'pts' ? (proj ? { mean: proj.mean as number, lo: proj.p10 as number, hi: proj.p90 as number } : null) : mp.proj_min != null ? { mean: mp.proj_min, lo: mp.proj_min_low ?? mp.proj_min, hi: mp.proj_min_high ?? mp.proj_min } : null
  const observed = stat === 'pts' ? line?.pts : line?.minutes
  const season = p.averages.windows.find((x) => x.key === 'season')
  const avg = season?.stats[stat]?.mean
  const vals = logs.map((g) => g[stat])
  const max = Math.ceil(Math.max(...vals, est?.hi ?? 0, observed ?? 0) / 10) * 10
  const h = small ? 230 : 280
  const pad = { l: 34, r: small ? 64 : 92, t: 14, b: small ? 26 : 44 }
  const iw = Math.max(10, w - pad.l - pad.r)
  const ih = h - pad.t - pad.b
  const step = iw / slots.length
  const bw = Math.max(4, Math.min(28, step * 0.62))
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const ex = pad.l + iw + (small ? 30 : 44)
  const seasonBreak = slots.findIndex((s, i) => i > 0 && s.kind === 'game' && s.g.date >= '2026-10' && (slots[i - 1].kind === 'game' ? (slots[i - 1] as { g: Log }).g.date : '') < '2026-07')
  const unit = stat === 'pts' ? 'points' : 'minutes'
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={h} role="img" aria-label={`${unit} in the last ${logs.length} appearances, low ${Math.min(...vals).toFixed(0)}, high ${Math.max(...vals).toFixed(0)}. ${missed.length} missed game${missed.length === 1 ? '' : 's'} shown as gaps.`}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} className={t === 0 ? 'c-zero' : 'c-grid'} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="c-axis">
              {t}
            </text>
          </g>
        ))}
        {seasonBreak > 0 && (
          <g>
            <line x1={pad.l + seasonBreak * step} x2={pad.l + seasonBreak * step} y1={pad.t} y2={pad.t + ih} className="c-grid c-dash" />
            <text x={pad.l + seasonBreak * step + 6} y={pad.t + 10} className="c-axis">
              2026-27
            </text>
          </g>
        )}
        {slots.map((s, i) => {
          const cx = pad.l + i * step + step / 2
          if (s.kind === 'missed') {
            return (
              <g key={`m${s.date}`}>
                <line x1={cx} x2={cx} y1={y(0) - 3} y2={y(0) - 22} className="c-miss" />
                {!small && (
                  <text x={cx} y={y(0) - 28} textAnchor="middle" className="c-axis">
                    out
                  </text>
                )}
              </g>
            )
          }
          const v = s.g[stat]
          return (
            <g key={s.g.date}>
              <rect x={cx - bw / 2} y={y(v)} width={bw} height={y(0) - y(v)} className="c-bar" />
              {!small && (
                <text x={cx} y={h - 24} textAnchor="middle" className="c-axis c-axis-s">
                  {s.g.opp_abbr}
                </text>
              )}
            </g>
          )
        })}
        {avg != null && (
          <g>
            <line x1={pad.l} x2={pad.l + iw} y1={y(avg)} y2={y(avg)} className="c-avg" />
            <text x={pad.l + 4} y={y(avg) - 6} className="c-note">
              Season average {avg.toFixed(1)}
            </text>
          </g>
        )}
        <text x={pad.l} y={h - 4} className="c-axis">
          {tinyDate(first)}
        </text>
        <text x={pad.l + iw} y={h - 4} textAnchor="end" className="c-axis">
          {tinyDate(logs[logs.length - 1].date)}
        </text>
        <line x1={pad.l + iw + 12} x2={pad.l + iw + 12} y1={pad.t} y2={pad.t + ih} className="c-grid" />
        {est && (
          <g>
            <rect x={ex - 7} y={y(est.hi)} width={14} height={y(est.lo) - y(est.hi)} className="c-est-band" />
            <line x1={ex - 12} x2={ex + 12} y1={y(est.mean)} y2={y(est.mean)} className="c-est" />
          </g>
        )}
        {observed != null && <circle cx={ex} cy={y(observed)} r={6} className="c-dot" />}
        <text x={ex} y={h - 4} textAnchor="middle" className="c-axis">
          {tinyDate(data.meta.snapshot_date)}
        </text>
      </svg>
      <p className="pick-key">
        <span className="key-item">
          <span className="key-bar" aria-hidden="true" /> {unit}, one bar per appearance
        </span>
        <span className="key-item">
          <span className="key-miss" aria-hidden="true" /> missed game, never counted as zero
        </span>
        {est && (
          <span className="key-item">
            <span className="key-tick key-tick-h" aria-hidden="true" /> projection {est.mean.toFixed(1)}, range {est.lo} to {est.hi}
          </span>
        )}
        {observed != null && (
          <span className="key-item">
            <span className="key-dot" aria-hidden="true" /> observed {observed}
          </span>
        )}
      </p>
    </div>
  )
}

function MinutesBar({ p }: { p: FeaturedPlayer }) {
  const m = p.minutes.profile as FeaturedPlayer['minutes']['profile'] & { min_l10?: number; max_l10?: number }
  const pc = (v: number) => `${(v / 48) * 100}%`
  if (m.proj_min == null) return <p className="muted">No minutes projection held.</p>
  return (
    <div className="minbar">
      <div className="minbar-top">
        <span className="minbar-n model tnum">{m.proj_min.toFixed(1)}</span>
        <span className="minbar-l">
          projected minutes
          <span className="muted">
            range {num(m.proj_min_low, 1)} to {num(m.proj_min_high, 1)}
          </span>
        </span>
      </div>
      <div className="minbar-track" role="img" aria-label={`Projected ${m.proj_min} minutes, range ${m.proj_min_low} to ${m.proj_min_high}. Last ten games ranged ${m.min_l10} to ${m.max_l10}.`}>
        {m.min_l10 != null && m.max_l10 != null && <span className="minbar-l10" style={{ left: pc(m.min_l10), width: pc(m.max_l10 - m.min_l10) }} />}
        {m.proj_min_low != null && m.proj_min_high != null && <span className="minbar-band" style={{ left: pc(m.proj_min_low), width: pc(m.proj_min_high - m.proj_min_low) }} />}
        <span className="minbar-tick" style={{ left: pc(m.proj_min) }} />
      </div>
      <div className="minbar-axis tnum" aria-hidden="true">
        <span>0</span>
        <span>12</span>
        <span>24</span>
        <span>36</span>
        <span>48</span>
      </div>
      <p className="pick-key">
        <span className="key-item">
          <span className="key-band" aria-hidden="true" /> projection range
        </span>
        <span className="key-item">
          <span className="key-l10" aria-hidden="true" /> last 10 low to high ({num(m.min_l10, 1)} to {num(m.max_l10, 1)})
        </span>
      </p>
    </div>
  )
}

const WINDOWS = ['L3', 'L5', 'L10', 'L20', 'season', 'prev_season']
const STATS = [
  ['min', 'MIN'],
  ['pts', 'PTS'],
  ['reb', 'REB'],
  ['ast', 'AST'],
  ['fg3m', '3PM'],
  ['pra', 'PRA'],
] as const

export default function Player() {
  const [params, setParams] = useSearchParams()
  const idx = Math.min(data.featured_players.length - 1, Math.max(0, Number(params.get('p') ?? 0) || 0))
  const p = data.featured_players[idx]
  const [stat, setStat] = useState<'pts' | 'min'>('pts')
  const [all, setAll] = useState(false)
  const pl = p.profile.player
  const abbr = pl.team_abbr ?? ''
  const [first, ...rest] = pl.name.split(' ')
  const sl = p.dna.season_line
  const mp = p.minutes.profile
  const line = p.live.live?.line
  const season = p.profile.splits.find((s) => s.label === 'Season')
  const contracts = data.kalshi.list.items.filter((m) => m.player_id === p.player_id)
  const logs = p.game_logs.items as Log[]
  const firstShown = (all ? logs[logs.length - 1] : logs[9] ?? logs[logs.length - 1]).date
  const rows = [...(all ? logs : logs.slice(0, 10)).map((g) => ({ date: g.date, g })), ...p.game_logs.missed.filter((m) => m.date > firstShown).map((m) => ({ date: m.date, m }))].sort((a, b) => b.date.localeCompare(a.date))
  const proj = (s: string) => p.profile.projections.find((x) => x.stat === s)
  const pos = pl.position === 'G' ? 'Guard' : pl.position === 'F' ? 'Forward' : pl.position === 'C' ? 'Center' : pl.position
  return (
    <div className="page player">
      <nav className="subnav" aria-label="Profiled players">
        {data.featured_players.map((fp, i) => (
          <button key={fp.player_id} type="button" className={clsx('subnav-item', i === idx && 'is-current')} aria-current={i === idx ? 'page' : undefined} onClick={() => setParams(i === 0 ? {} : { p: String(i) }, { replace: true })}>
            {fp.profile.player.name}
          </button>
        ))}
        <span className="subnav-note">
          3 of {data.players_index.total} players have a full profile in this snapshot
        </span>
      </nav>

      <header className="ph" style={{ ['--team' as string]: teamColor(abbr) }}>
        <Headshot player={pl} name={pl.name} size={232} className="ph-shot" />
        <div className="ph-id">
          <h1 className="ph-name">
            <span className="ph-first">{first}</span>
            <span className="ph-last">{rest.join(' ')}</span>
          </h1>
          <p className="ph-meta">
            <TeamMark abbr={abbr} size={32} />
            <span>
              {teamNames(abbr).name}, {pos}, No. {pl.jersey}
            </span>
          </p>
          <p className="ph-role">
            {mp.classification_label && <Slot>{mp.classification_label}</Slot>}
            <span className="muted">{mp.classification_reason}</span>
          </p>
        </div>
        {line && (
          <div className="ph-last-game">
            <p className="ph-lg-head">
              <Slot>{p.live.live?.status_label}</Slot>
              <span>
                {shortDate(data.meta.snapshot_date)}, {p.live.live?.label}
              </span>
            </p>
            <dl className="ph-line">
              {(
                [
                  ['PTS', line.pts],
                  ['REB', line.reb],
                  ['AST', line.ast],
                  ['MIN', line.minutes],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dd>{num(v)}</dd>
                  <dt>{k}</dt>
                </div>
              ))}
            </dl>
            <p className="muted">
              {line.fgm}-{line.fga} FG, {line.fg3m}-{line.fg3a} 3PT, {line.ftm}-{line.fta} FT. <Link className="link" to="/a/game?tab=box">Box score</Link>
            </p>
          </div>
        )}
      </header>

      {season && (
        <section aria-label="Season line" className="seasonline">
          <p className="seasonline-cap">
            Season {p.dna.season}, {season.games} games
          </p>
          <dl>
            {(
              [
                ['Points', season.pts],
                ['Rebounds', season.reb],
                ['Assists', season.ast],
                ['Threes', season.fg3m],
                ['Minutes', season.min],
                ['Usage', sl.usage != null ? `${sl.usage}%` : null],
                ['True shooting', sl.true_shooting_pct != null ? `${sl.true_shooting_pct}%` : null],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dd>{v ?? NA}</dd>
                <dt>{k}</dt>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="split block-s">
        <div className="split-main">
          <section aria-labelledby="form-h">
            <SectionHead
              id="form-h"
              title={`Last ${logs.length} appearances`}
              aside={
                <div className="seg seg-s" role="group" aria-label="Statistic">
                  <button type="button" className={clsx(stat === 'pts' && 'is-on')} aria-pressed={stat === 'pts'} onClick={() => setStat('pts')}>
                    Points
                  </button>
                  <button type="button" className={clsx(stat === 'min' && 'is-on')} aria-pressed={stat === 'min'} onClick={() => setStat('min')}>
                    Minutes
                  </button>
                </div>
              }
            />
            <FormChart p={p} stat={stat} />
          </section>

          <section aria-labelledby="win-h" className="block-s">
            <SectionHead id="win-h" title="Recent form" aside={<span className="muted">Averages over appearances</span>} />
            <div className="tscroll" tabIndex={0} role="region" aria-label="Recent form, scrolls sideways">
              <table className="stat">
                <thead>
                  <tr>
                    <th scope="col" className="sticky-col">Window</th>
                    <th scope="col" className="r">GP</th>
                    <th scope="col" className="r">Missed</th>
                    {STATS.map(([, l]) => (
                      <th key={l} scope="col" className="r">{l}</th>
                    ))}
                    <th scope="col" className="r">PTS range</th>
                  </tr>
                </thead>
                <tbody>
                  {WINDOWS.map((k) => {
                    const w = p.averages.windows.find((x) => x.key === k)
                    if (!w || !w.available) return null
                    return (
                      <tr key={k}>
                        <th scope="row" className="sticky-col">
                          {w.label}
                          {w.small_sample && <span className="flag"> small sample</span>}
                        </th>
                        <td className="r">{w.games}</td>
                        <td className="r">{w.missed ?? NA}</td>
                        {STATS.map(([s]) => (
                          <td key={s} className={clsx('r', s === 'pts' && 'strong')}>{num(w.stats[s]?.mean, 1)}</td>
                        ))}
                        <td className="r">
                          {w.stats.pts ? `${w.stats.pts.min}–${w.stats.pts.max}` : NA}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Note>{p.averages.definition} These are historical averages, not probabilities.</Note>
          </section>

          <section aria-labelledby="log-h" className="block-s">
            <SectionHead id="log-h" title="Game log" aside={<span className="muted">{p.game_logs.total} games held</span>} />
            <div className="tscroll" tabIndex={0} role="region" aria-label="Game log, scrolls sideways">
              <table className="stat">
                <thead>
                  <tr>
                    <th scope="col" className="sticky-col">Date</th>
                    <th scope="col">Opp</th>
                    <th scope="col">Result</th>
                    {['MIN', 'PTS', 'REB', 'AST', '3PM', 'STL', 'BLK', 'TO', 'FGA', 'FTA', 'USG%'].map((l) => (
                      <th key={l} scope="col" className="r">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) =>
                    'm' in r ? (
                      <tr key={r.date} className="missed">
                        <th scope="row" className="sticky-col">{tinyDate(r.date)}</th>
                        <td>{r.m.opp_abbr}</td>
                        <td colSpan={12}>{r.m.reason.replace('ILLNESS', 'Illness')}. Not counted in any average.</td>
                      </tr>
                    ) : (
                      <tr key={r.date}>
                        <th scope="row" className="sticky-col">{tinyDate(r.date)}</th>
                        <td>
                          {r.g.is_home ? 'vs' : '@'} {r.g.opp_abbr}
                        </td>
                        <td>
                          {r.g.result} {r.g.team_points}&ndash;{r.g.opp_points}
                        </td>
                        <td className="r">{num(r.g.min, 0)}</td>
                        <td className="r strong">{r.g.pts}</td>
                        <td className="r">{r.g.reb}</td>
                        <td className="r">{r.g.ast}</td>
                        <td className="r">{r.g.fg3m}</td>
                        <td className="r">{r.g.stl}</td>
                        <td className="r">{r.g.blk}</td>
                        <td className="r">{r.g.tov}</td>
                        <td className="r">{r.g.fga}</td>
                        <td className="r">{r.g.fta}</td>
                        <td className="r">{num(r.g.usage, 1)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <div className="toolbar toolbar-b">
              <button type="button" className="btn btn-line" onClick={() => setAll((v) => !v)}>
                {all ? 'Show last 10' : `Show all ${logs.length} held here`}
              </button>
              <p className="muted">{p.game_logs.source}</p>
            </div>
          </section>
        </div>

        <aside className="split-side">
          <section aria-labelledby="min-h">
            <SectionHead id="min-h" title="Minutes" level={3} />
            <MinutesBar p={p} />
            <dl className="kv">
              {(
                [
                  ['Last 3', mp.l3],
                  ['Last 5', mp.l5],
                  ['Last 10', mp.l10],
                  ['Season', mp.season_avg],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{num(v, 1)}</dd>
                </div>
              ))}
            </dl>
            <Note>
              Model {p.minutes.model.name} {p.minutes.model.version}, status {p.minutes.model.status}. The range is the {p.minutes.uncertainty}. {p.minutes.restrictions_note}
            </Note>
          </section>

          {line?.pregame && (
            <section aria-labelledby="pvo-h" className="side-block">
              <SectionHead id="pvo-h" title={`Projected and observed, ${tinyDate(data.meta.snapshot_date)}`} level={3} />
              <table className="stat stat-plain">
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col" className="r">
                      <span className="model">Projected</span>
                    </th>
                    <th scope="col" className="r">Range</th>
                    <th scope="col" className="r">Observed</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Points', 'pts', line.pts],
                      ['Rebounds', 'reb', line.reb],
                      ['Assists', 'ast', line.ast],
                      ['Threes', 'fg3m', line.fg3m],
                    ] as const
                  ).map(([label, k, obs]) => {
                    const pr = proj(k)
                    return (
                      <tr key={k}>
                        <th scope="row">{label}</th>
                        <td className="r model">{pr ? (pr.mean as number).toFixed(1) : NA}</td>
                        <td className="r muted">{pr ? `${pr.p10}–${pr.p90}` : NA}</td>
                        <td className="r strong">{num(obs)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <Note>Published {stampET(line.pregame.published_at)} and never revised. One game is not evidence about a model.</Note>
            </section>
          )}

          <section aria-labelledby="dna-h" className="side-block">
            <SectionHead id="dna-h" title="Profile labels" level={3} />
            {p.dna.archetypes.length === 0 ? (
              <p className="side-p">No label applies. None of the published rules is met by this season&rsquo;s box scores.</p>
            ) : (
              <ul className="arche">
                {p.dna.archetypes.map((a) => (
                  <li key={a.key}>
                    <span className="arche-l">{a.label}</span>
                    <span className="arche-r">Rule: {a.rule}</span>
                  </li>
                ))}
              </ul>
            )}
            <dl className="kv kv-3">
              {(
                [
                  ['PTS per 36', sl.pts36],
                  ['AST per 36', sl.ast36],
                  ['FGA per 36', sl.fga36],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{num(v, 1)}</dd>
                </div>
              ))}
            </dl>
            <Note>{p.dna.notes[0]}</Note>
          </section>

          <section aria-labelledby="k-h" className="side-block">
            <SectionHead id="k-h" title="Kalshi contracts" level={3} />
            {contracts.length === 0 ? (
              <p className="side-p">
                None of the {data.kalshi.list.items.length} contracts in this snapshot names {pl.name}. The full list holds {data.kalshi.list.total.toLocaleString('en-US')}.{' '}
                <Link className="link" to="/a/markets">Market watch</Link>
              </p>
            ) : (
              <ul className="h2h">
                {contracts.map((c) => (
                  <li key={c.ticker}>
                    <Link className="link" to={`/a/markets?t=${encodeURIComponent(c.ticker)}`}>{c.title}</Link>
                    <span className="tnum">{cents(c.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="na-h" className="side-block">
            <SectionHead id="na-h" title="Not available" level={3} />
            <ul className="na">
              {[...(p.dna.identity.not_held as string[]), ...p.dna.not_available].map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <Note>{(p.dna.tactical_profile as { reason: string }).reason}</Note>
          </section>
        </aside>
      </div>
    </div>
  )
}
