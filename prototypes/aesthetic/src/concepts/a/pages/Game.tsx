import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as Tabs from '@radix-ui/react-tabs'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Sparkles } from 'lucide-react'
import { data, featuredGame, fmtTimeET, type BoxPlayer, type BoxSide, type LineupSide } from '../../../data'
import { Headshot, NA, Note, SectionHead, Slot, TeamMark, featuredId, gameClock, num, shortDate, signed, stampET, teamColor, teamNames } from '../lib'
import { HeroBoard, scoreboardGames } from '../Scoreboard'
import { LeadChart, StintChart } from '../GameCharts'
import { PickKey, PickList } from '../Picks'
import { useShell } from '../shell'

const g = scoreboardGames.find((x) => x.game_id === featuredId)!
const fg = featuredGame
const AWAY = fg.live.away.abbr
const HOME = fg.live.home.abbr
const box = [...fg.boxscore.away.players, ...fg.boxscore.home.players]

// ---- overview ---------------------------------------------------------------------------------
const COMPARE = ['fieldGoalPct', 'threePointFieldGoalPct', 'freeThrowPct', 'totalRebounds', 'assists', 'totalTurnovers', 'steals', 'blocks', 'pointsInPaint', 'fastBreakPoints', 'turnoverPoints']
const DETAIL: Record<string, string> = { fieldGoalPct: 'fieldGoalsMade-fieldGoalsAttempted', threePointFieldGoalPct: 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', freeThrowPct: 'freeThrowsMade-freeThrowsAttempted' }

function Compare() {
  const items = fg.team_stats.items
  const by = new Map(items.map((i) => [i.key, i]))
  return (
    <div className="cmp">
      <div className="cmp-head" aria-hidden="true">
        <span className="cmp-team" style={{ color: teamColor(AWAY) }}>
          <TeamMark abbr={AWAY} size={28} /> {AWAY}
        </span>
        <span />
        <span className="cmp-team cmp-team-r" style={{ color: teamColor(HOME) }}>
          {HOME} <TeamMark abbr={HOME} size={28} />
        </span>
      </div>
      <table className="sr">
        <caption>Team comparison</caption>
        <thead>
          <tr>
            <th scope="col">Statistic</th>
            <th scope="col">{AWAY}</th>
            <th scope="col">{HOME}</th>
          </tr>
        </thead>
        <tbody>
          {COMPARE.map((k) => (
            <tr key={k}>
              <th scope="row">{by.get(k)?.label}</th>
              <td>{by.get(k)?.away}</td>
              <td>{by.get(k)?.home}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div aria-hidden="true">
        {COMPARE.map((k) => {
          const s = by.get(k)
          if (!s || s.home_value == null || s.away_value == null) return null
          const max = Math.max(s.home_value, s.away_value, 1)
          const lowerBetter = k === 'totalTurnovers'
          const awayLeads = lowerBetter ? s.away_value < s.home_value : s.away_value > s.home_value
          const homeLeads = lowerBetter ? s.home_value < s.away_value : s.home_value > s.away_value
          const d = DETAIL[k] ? by.get(DETAIL[k]) : null
          const isPct = k.endsWith('Pct')
          return (
            <div className="cmp-row" key={k}>
              <span className={clsx('cmp-val', awayLeads && 'is-lead')}>
                {s.away}
                {isPct && '%'}
                {d && <span className="cmp-detail">{d.away}</span>}
              </span>
              <span className="cmp-bars">
                <span className="cmp-bar cmp-bar-l">
                  <span style={{ width: `${(s.away_value / max) * 100}%`, background: awayLeads ? teamColor(AWAY) : undefined }} />
                </span>
                <span className="cmp-label">{s.label.replace(' %', '')}</span>
                <span className="cmp-bar">
                  <span style={{ width: `${(s.home_value / max) * 100}%`, background: homeLeads ? teamColor(HOME) : undefined }} />
                </span>
              </span>
              <span className={clsx('cmp-val cmp-val-r', homeLeads && 'is-lead')}>
                {s.home}
                {isPct && '%'}
                {d && <span className="cmp-detail">{d.home}</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GameLeaders() {
  const L = fg.live.leaders as Record<'home' | 'away', Record<'pts' | 'reb' | 'ast', { player_id: number; name: string; value: number }>>
  const cats = [
    ['pts', 'Points'],
    ['reb', 'Rebounds'],
    ['ast', 'Assists'],
  ] as const
  const shot = (id: number) => box.find((p) => p.player_id === id)
  return (
    <div className="gl">
      {cats.map(([k, label]) => (
        <div className="gl-row" key={k}>
          <div className="gl-p">
            <Headshot player={shot(L.away[k].player_id)} name={L.away[k].name} size={52} />
            <span className="gl-name">{L.away[k].name}</span>
            <span className="gl-val">{L.away[k].value}</span>
          </div>
          <span className="label gl-cat">{label}</span>
          <div className="gl-p gl-p-r">
            <span className="gl-val">{L.home[k].value}</span>
            <span className="gl-name">{L.home[k].name}</span>
            <Headshot player={shot(L.home[k].player_id)} name={L.home[k].name} size={52} />
          </div>
        </div>
      ))}
    </div>
  )
}

function PlayList({ limit, scoringOnly }: { limit?: number; scoringOnly?: boolean }) {
  const items = fg.play_by_play.items.filter((p) => (scoringOnly ? p.scoring : limit ? p.kind !== 'period' : true)).slice(0, limit)
  return (
    <ol className="plays">
      {items.map((p) => (
        <li key={p.event_id} className={clsx('play', p.scoring && 'is-score')}>
          <span className="play-clock tnum">
            Q{p.period} {p.clock}
          </span>
          <span className="play-team">{p.team_side ? <TeamMark abbr={p.team_side === 'home' ? HOME : AWAY} size={22} /> : null}</span>
          <span className="play-text">{p.text}</span>
          <span className="play-score tnum">{p.scoring ? `${p.away_score}–${p.home_score}` : ''}</span>
        </li>
      ))}
    </ol>
  )
}

function Overview() {
  const m = fg.momentum
  const final = fg.live.summaries.find((s: { kind: string }) => s.kind === 'final') as { text: string } | undefined
  return (
    <div className="split">
      <div className="split-main">
        <section aria-labelledby="flow-h">
          <SectionHead id="flow-h" title="Game flow" aside={<span className="muted">Who led, and by how much</span>} />
          <LeadChart />
          <dl className="facts">
            <div>
              <dt>Lead changes</dt>
              <dd>{m.lead_changes}</dd>
            </div>
            <div>
              <dt>Ties</dt>
              <dd>{m.ties}</dd>
            </div>
            {m.runs.slice(0, 2).map((r) => (
              <div key={r.start_s}>
                <dt>
                  {r.team === 'home' ? HOME : AWAY} run, {gameClock(r.start_s)}
                </dt>
                <dd>{r.points} pts</dd>
              </div>
            ))}
          </dl>
          <Note>{m.note}</Note>
        </section>
        <section aria-labelledby="cmp-h" className="block-s">
          <SectionHead id="cmp-h" title="Team comparison" />
          <Compare />
          <Note>Not published by the source: {fg.team_stats.not_published.join(', ').toLowerCase()}.</Note>
        </section>
      </div>
      <aside className="split-side">
        <section aria-labelledby="gl-h">
          <SectionHead id="gl-h" title="Leaders" level={3} />
          <GameLeaders />
        </section>
        {final && (
          <section aria-labelledby="sum-h" className="side-block">
            <SectionHead id="sum-h" title="Final summary" level={3} />
            <ul className="summary">
              {final.text.split('\n').slice(1).map((l) => {
                const [k, ...rest] = l.split(': ')
                return (
                  <li key={l}>
                    <span className="summary-k">{k}</span> {rest.join(': ')}
                  </li>
                )
              })}
            </ul>
            <Note>Automatic summary of observed events. No commentary is generated.</Note>
          </section>
        )}
        <section aria-labelledby="lp-h" className="side-block">
          <SectionHead id="lp-h" title="Last plays" level={3} />
          <PlayList limit={6} />
        </section>
      </aside>
    </div>
  )
}

// ---- box score ----------------------------------------------------------------------------------
type Col = { key: string; label: string; full: string; get: (p: BoxPlayer) => number | null; show?: (p: BoxPlayer) => string; pre?: (p: BoxPlayer) => number | null | undefined }
const pair = (m: number | null, a: number | null) => (m == null || a == null ? NA : `${m}-${a}`)
const COLS: Col[] = [
  { key: 'minutes', label: 'MIN', full: 'Minutes', get: (p) => p.minutes, pre: (p) => p.pregame?.proj_min },
  { key: 'pts', label: 'PTS', full: 'Points', get: (p) => p.pts, pre: (p) => p.pregame?.pts },
  { key: 'reb', label: 'REB', full: 'Rebounds', get: (p) => p.reb, pre: (p) => p.pregame?.reb },
  { key: 'ast', label: 'AST', full: 'Assists', get: (p) => p.ast, pre: (p) => p.pregame?.ast },
  { key: 'fg', label: 'FG', full: 'Field goals made-attempted', get: (p) => p.fgm, show: (p) => pair(p.fgm, p.fga) },
  { key: 'fg3', label: '3PT', full: 'Three-pointers made-attempted', get: (p) => p.fg3m, show: (p) => pair(p.fg3m, p.fg3a), pre: (p) => p.pregame?.fg3m },
  { key: 'ft', label: 'FT', full: 'Free throws made-attempted', get: (p) => p.ftm, show: (p) => pair(p.ftm, p.fta) },
  { key: 'stl', label: 'STL', full: 'Steals', get: (p) => p.stl },
  { key: 'blk', label: 'BLK', full: 'Blocks', get: (p) => p.blk },
  { key: 'tov', label: 'TO', full: 'Turnovers', get: (p) => p.tov },
  { key: 'pf', label: 'PF', full: 'Fouls', get: (p) => p.pf },
  { key: 'plus_minus', label: '+/−', full: 'Plus-minus', get: (p) => p.plus_minus, show: (p) => signed(p.plus_minus) },
  { key: 'ts', label: 'TS%', full: 'True shooting percentage', get: (p) => p.true_shooting_pct, show: (p) => num(p.true_shooting_pct, 1) },
]

function BoxTable({ side, pregame }: { side: BoxSide; pregame: boolean }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const col = COLS.find((c) => c.key === sort?.key)
  const order = (rows: BoxPlayer[]) => (col && sort ? [...rows].sort((a, b) => ((col.get(b) ?? -999) - (col.get(a) ?? -999)) * sort.dir) : rows)
  const played = side.players.filter((p) => !p.dnp)
  const groups = [
    { name: 'Starters', rows: order(played.filter((p) => p.starter)) },
    { name: 'Bench', rows: order(played.filter((p) => !p.starter)) },
  ]
  const dnp = side.players.filter((p) => p.dnp)
  const t = side.totals
  const totals: Record<string, string> = { pts: `${t.pts}`, reb: `${t.reb}`, ast: `${t.ast}`, fg: `${t.fgm}-${t.fga}`, fg3: `${t.fg3m}-${t.fg3a}`, ft: `${t.ftm}-${t.fta}`, stl: `${t.stl}`, blk: `${t.blk}`, tov: `${t.tov}`, pf: `${t.pf}` }
  const n = teamNames(side.abbr)
  return (
    <section className="boxteam" aria-label={`${n.name} box score`}>
      <h3 className="boxteam-h" style={{ ['--team' as string]: teamColor(side.abbr) }}>
        <TeamMark abbr={side.abbr} size={36} />
        <span>{n.nick}</span>
        <span className="boxteam-score tnum">{t.pts}</span>
      </h3>
      <div className="tscroll" tabIndex={0} role="region" aria-label={`${n.name} box score, scrolls sideways`}>
        <table className={clsx('stat box', pregame && 'with-pre')}>
          <thead>
            <tr>
              <th scope="col" className="sticky-col">Player</th>
              {COLS.map((c) => (
                <th key={c.key} scope="col" className="r" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'descending' : 'ascending') : undefined}>
                  <button type="button" className={clsx('th-sort', sort?.key === c.key && 'is-sorted')} title={`Sort by ${c.full.toLowerCase()}`} onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}>
                    <abbr title={c.full}>{c.label}</abbr>
                    {sort?.key === c.key && (sort.dir === 1 ? <ArrowDown size={13} aria-hidden="true" /> : <ArrowUp size={13} aria-hidden="true" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((grp) => (
            <tbody key={grp.name}>
              <tr className="grp">
                <th scope="rowgroup" className="sticky-col">{grp.name}</th>
                <td colSpan={COLS.length} />
              </tr>
              {grp.rows.map((p) => (
                <tr key={p.name}>
                  <th scope="row" className="sticky-col">
                    <span className="box-player">
                      <Headshot player={p} name={p.name} size={32} />
                      <span className="box-name">{p.name}</span>
                      <span className="box-pos">{p.position}</span>
                    </span>
                  </th>
                  {COLS.map((c) => {
                    const pre = pregame && c.pre ? c.pre(p) : undefined
                    return (
                      <td key={c.key} className={clsx('r', sort?.key === c.key && 'is-sorted', c.key === 'pts' && 'strong')}>
                        {c.show ? c.show(p) : num(c.get(p))}
                        {pregame && c.pre && <span className="pre">{pre != null ? pre.toFixed(1) : NA}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <th scope="row" className="sticky-col">Team</th>
              {COLS.map((c) => (
                <td key={c.key} className="r">{totals[c.key] ?? ''}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {dnp.length > 0 && <p className="dnp">Did not play: {dnp.map((p) => p.name).join(', ')}</p>}
    </section>
  )
}

function BoxScore() {
  const [pregame, setPregame] = useState(false)
  return (
    <div>
      <div className="toolbar">
        <p className="muted">Tap a column head to sort within starters and bench.</p>
        <label className="switch">
          <input type="checkbox" checked={pregame} onChange={(e) => setPregame(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span>Show pregame projection</span>
        </label>
      </div>
      <BoxTable side={fg.boxscore.away} pregame={pregame} />
      <BoxTable side={fg.boxscore.home} pregame={pregame} />
      <Note>
        {pregame && <><span className="model">Orange figures</span> are the last model projection published before tipoff, shown for comparison and never revised. </>}
        Box score polled from the source and last verified {stampET(fg.boxscore.observed_at as string)}. A value the source has not published is shown as {NA}, not as zero.
      </Note>
    </div>
  )
}

// ---- plays ----------------------------------------------------------------------------------------
function Plays() {
  const [scoring, setScoring] = useState(false)
  return (
    <div className="narrow">
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filter plays">
          <button type="button" className={clsx(!scoring && 'is-on')} aria-pressed={!scoring} onClick={() => setScoring(false)}>
            All plays
          </button>
          <button type="button" className={clsx(scoring && 'is-on')} aria-pressed={scoring} onClick={() => setScoring(true)}>
            Scoring only
          </button>
        </div>
        <p className="muted">
          Newest first. Showing the last {fg.play_by_play.items.length} of {fg.play_by_play.total} events held.
        </p>
      </div>
      <PlayList scoringOnly={scoring} />
      <Note>{fg.play_by_play.note}</Note>
    </div>
  )
}

// ---- rotations --------------------------------------------------------------------------------------
function Rotations() {
  return (
    <div>
      {(['away', 'home'] as const).map((side) => (
        <section key={side} className="boxteam" aria-label={`${fg.rotations[side].abbr} rotation`}>
          <h3 className="boxteam-h" style={{ ['--team' as string]: teamColor(fg.rotations[side].abbr) }}>
            <TeamMark abbr={fg.rotations[side].abbr} size={36} />
            <span>{teamNames(fg.rotations[side].abbr).nick}</span>
          </h3>
          <StintChart side={side} />
        </section>
      ))}
      <Note>
        {fg.rotations.home.note} <span className="model">Proj</span> is the pregame minutes projection, kept as published. S marks a starter.
      </Note>
    </div>
  )
}

// ---- research -----------------------------------------------------------------------------------------
function Five({ side }: { side: LineupSide }) {
  return (
    <div className="five">
      <h4 className="five-h">
        <TeamMark abbr={side.team.abbr} size={28} /> {teamNames(side.team.abbr).nick}
        <Slot tone="model">Projected, not official</Slot>
      </h4>
      <ol>
        {side.starters.map((p) => (
          <li key={p.name}>
            <Headshot player={p} name={p.name} size={40} />
            <span className="five-name">
              {p.name}
              <span className="five-sub">
                {p.position}
                {p.availability && p.availability !== 'available' ? `, ${p.availability}` : ''}
              </span>
            </span>
            <span className="five-min tnum model">{num(p.proj_min, 1)}</span>
          </li>
        ))}
      </ol>
      {side.unavailable.length > 0 && <p className="five-out">Out: {side.unavailable.map((p) => p.name).join(', ')}</p>}
    </div>
  )
}

function ResearchTab() {
  const r = fg.research
  const env = r.game.environment
  const hs = fg.live.home.score!
  const as = fg.live.away.score!
  const held = r.game.research_completeness.items
  const forms = [
    ['Record entering', 'record'],
    ['Last 10', 'last_10'],
    ['Points per game', 'points_per_game'],
    ['Opponent points per game', 'opp_points_per_game'],
    ['Offensive rating', 'off_rating'],
    ['Defensive rating', 'def_rating'],
    ['Pace', 'pace'],
  ] as const
  return (
    <div className="split">
      <div className="split-main">
        <section aria-labelledby="rp-h">
          <SectionHead id="rp-h" title="Pregame picks for this game" aside={<Slot>Published {stampET(r.game.top_picks[0]?.verified_at)}</Slot>} />
          <p className="lede lede-s">
            {r.selections_total ?? r.selections.length} contracts were evaluated for this game. {r.selection_counts.standard} met the standard, {r.selection_counts.watchlist} are on the watchlist and {r.selection_counts.rejected + r.selection_counts.insufficient_evidence} were rejected or lacked evidence. These are the five ranked highest.
          </p>
          <PickList items={r.game.top_picks} showGame={false} />
          <PickKey />
        </section>

        {env && (
          <section aria-labelledby="env-h" className="block-s">
            <SectionHead id="env-h" title="Projected and observed" />
            <div className="tscroll">
              <table className="stat">
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col" className="r">
                      <span className="model">Projected before tipoff</span>
                    </th>
                    <th scope="col" className="r">80% range</th>
                    <th scope="col" className="r">Observed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{HOME} points</th>
                    <td className="r model">{num(env.proj_home_points, 1)}</td>
                    <td className="r muted">{NA}</td>
                    <td className="r strong">{hs}</td>
                  </tr>
                  <tr>
                    <th scope="row">{AWAY} points</th>
                    <td className="r model">{num(env.proj_away_points, 1)}</td>
                    <td className="r muted">{NA}</td>
                    <td className="r strong">{as}</td>
                  </tr>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="r model">{num(env.proj_total, 1)}</td>
                    <td className="r">
                      {num(env.total_p10, 1)}&ndash;{num(env.total_p90, 1)}
                    </td>
                    <td className="r strong">{hs + as}</td>
                  </tr>
                  <tr>
                    <th scope="row">{HOME} margin</th>
                    <td className="r model">{signed(env.proj_margin, 1)}</td>
                    <td className="r muted">{NA}</td>
                    <td className="r strong">{signed(hs - as)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Pace</th>
                    <td className="r model">{num(env.proj_pace, 1)}</td>
                    <td className="r muted">{NA}</td>
                    <td className="r muted">Not published</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Note>The projection is shown as published and is not revised after the game. One game says nothing about a model.</Note>
          </section>
        )}

        <section aria-labelledby="form-h" className="block-s">
          <SectionHead id="form-h" title="Team form entering the game" />
          <div className="tscroll">
            <table className="stat">
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col" className="r">{AWAY}</th>
                  <th scope="col" className="r">{HOME}</th>
                </tr>
              </thead>
              <tbody>
                {forms.map(([label, k]) => (
                  <tr key={k}>
                    <th scope="row">{label}</th>
                    <td className="r">{String(r.team_form.away[k]).replace('-', '–')}</td>
                    <td className="r">{String(r.team_form.home[k]).replace('-', '–')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="split-side">
        <section aria-labelledby="five-h">
          <SectionHead id="five-h" title="Starting fives" level={3} />
          <Five side={fg.lineups.away} />
          <Five side={fg.lineups.home} />
          <Note>
            <span className="model">Orange figures</span> are projected minutes. A lineup is confirmed only from a box score.
          </Note>
        </section>
        <section aria-labelledby="held-h" className="side-block">
          <SectionHead id="held-h" title={`Inputs held: ${held.filter((i) => i.ok).length} of ${held.length}`} level={3} />
          <ul className="held">
            {held.map((i) => (
              <li key={i.name} className={clsx(!i.ok && 'is-missing')}>
                <span>{i.name}</span>
                <span>{i.note}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="h2h-h" className="side-block">
          <SectionHead id="h2h-h" title="Last five meetings" level={3} />
          <ul className="h2h">
            {r.h2h.map((m) => (
              <li key={m.date}>
                <span className="muted">{shortDate(m.date)}{m.date < '2026-07' ? `, ${m.date.slice(0, 4)}` : ''}</span>
                <span className="tnum">
                  {m.away_abbr} {m.away_points}, {m.home_abbr} {m.home_points}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="open-h" className="side-block">
          <SectionHead id="open-h" title="Open questions" level={3} />
          <ul className="brief">
            {r.unresolved.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  )
}

// ---- page ---------------------------------------------------------------------------------------------
const TABS = [
  ['overview', 'Overview'],
  ['box', 'Box score'],
  ['plays', 'Plays'],
  ['rotations', 'Rotations'],
  ['research', 'Research'],
] as const

export default function Game() {
  const [params, setParams] = useSearchParams()
  const { openAssistant } = useShell()
  const initial = useMemo(() => (TABS.some(([k]) => k === params.get('tab')) ? params.get('tab')! : 'overview'), [])
  const [tab, setTab] = useState(initial)
  const card = data.games.games.find((x) => x.id === featuredId)
  const heroRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: '-72px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div className="page game">
      <div className="dayline">
        <p className="dayline-date">
          {teamNames(AWAY).city} at {teamNames(HOME).city}
        </p>
        <p className="dayline-note">
          {shortDate(g.game_date)}, {fmtTimeET(g.tipoff_utc)} tip. <Slot>Snapshot</Slot> last verified {stampET(g.observed_at)}
        </p>
      </div>
      <div ref={heroRef}>
        <HeroBoard game={g} />
      </div>

      <Tabs.Root value={tab} onValueChange={(v) => { setTab(v); setParams(v === 'overview' ? {} : { tab: v }, { replace: true }) }}>
        <div className={clsx('gamebar', stuck && 'is-stuck')}>
          <div className="gamebar-in">
            <div className="gamebar-score" aria-hidden="true">
              <TeamMark abbr={AWAY} size={24} />
              <span className={clsx('gb-abbr', g.away.score! < g.home.score! && 'is-loser')}>{AWAY}</span>
              <span className={clsx('gb-n tnum', g.away.score! < g.home.score! && 'is-loser')}>{g.away.score}</span>
              <span className="gb-status">{g.status_label}</span>
              <span className={clsx('gb-n tnum', g.home.score! < g.away.score! && 'is-loser')}>{g.home.score}</span>
              <span className={clsx('gb-abbr', g.home.score! < g.away.score! && 'is-loser')}>{HOME}</span>
              <TeamMark abbr={HOME} size={24} />
            </div>
            <Tabs.List className="tabs" aria-label="Game sections">
              {TABS.map(([k, label]) => (
                <Tabs.Trigger key={k} value={k} className="tab-t">
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <button type="button" className="btn btn-line gamebar-ask" onClick={openAssistant}>
              <Sparkles size={16} aria-hidden="true" /> Ask JARVIS
            </button>
          </div>
        </div>
        <Tabs.Content value="overview" className="tabpane">
          <Overview />
        </Tabs.Content>
        <Tabs.Content value="box" className="tabpane">
          <BoxScore />
        </Tabs.Content>
        <Tabs.Content value="plays" className="tabpane">
          <Plays />
        </Tabs.Content>
        <Tabs.Content value="rotations" className="tabpane">
          <Rotations />
        </Tabs.Content>
        <Tabs.Content value="research" className="tabpane">
          <ResearchTab />
        </Tabs.Content>
      </Tabs.Root>
      {card && <p className="sr">Lineup status: {card.lineup_status}</p>}
    </div>
  )
}
