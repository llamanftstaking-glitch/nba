// The one scoreboard, at three sizes: hero (Today, Game), row (Scores), bug (slate strip, sticky header).
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { data, fmtTimeET, type ScoreboardGame } from '../../data'
import { Slot, TeamMark, featuredId, teamColor, teamNames, teamRecord, num } from './lib'

export type BoardState = {
  status: ScoreboardGame['status']
  statusLabel: string
  away: { abbr: string; score: number | null; lines: (number | null)[] }
  home: { abbr: string; score: number | null; lines: (number | null)[] }
  live?: boolean
  stale?: boolean
}

export function boardFrom(g: ScoreboardGame): BoardState {
  return {
    status: g.status,
    statusLabel: g.status_label,
    away: { abbr: g.away.abbr, score: g.away.score, lines: g.away.linescores },
    home: { abbr: g.home.abbr, score: g.home.score, lines: g.home.linescores },
    live: g.status === 'live',
    stale: g.stale,
  }
}

const winner = (b: BoardState) =>
  b.status !== 'final' || b.away.score == null || b.home.score == null ? null : b.away.score > b.home.score ? 'away' : 'home'

/** Hero scoreboard: two stacked team rows, quarters, and a very large total. */
export function HeroBoard({ game, headingLevel = 'h1' }: { game: ScoreboardGame; headingLevel?: 'h1' | 'h2' }) {
  const b = boardFrom(game)
  const w = winner(b)
  const H = headingLevel
  return (
    <div className="hero-board">
      <H className="sr">
        {teamNames(b.away.abbr).name} {b.away.score}, {teamNames(b.home.abbr).name} {b.home.score}. {b.statusLabel}.
      </H>
      <div className="hb-head" aria-hidden="true">
        <span className="hb-status">
          <Slot>{b.statusLabel}</Slot>
          <span className="hb-venue">{game.venue}</span>
        </span>
        <span className="hb-q">1</span>
        <span className="hb-q">2</span>
        <span className="hb-q">3</span>
        <span className="hb-q">4</span>
        <span className="hb-t">T</span>
      </div>
      {(['away', 'home'] as const).map((side) => {
        const t = b[side]
        const n = teamNames(t.abbr)
        return (
          <div key={side} className={clsx('hb-row', w === side && 'is-winner', w && w !== side && 'is-loser')} style={{ ['--team' as string]: teamColor(t.abbr) }} aria-hidden="true">
            <span className="hb-team">
              <TeamMark abbr={t.abbr} size={88} className="hb-mark" />
              <span className="hb-name">
                <span className="hb-nick">{n.nick}</span>
                <span className="hb-abbr">{t.abbr}</span>
                <span className="hb-rec">
                  {n.city}
                  {teamRecord(t.abbr) && <>, {teamRecord(t.abbr)} entering</>}
                </span>
              </span>
            </span>
            {t.lines.map((q, i) => (
              <span key={i} className="hb-q">{num(q)}</span>
            ))}
            <span className="hb-t">{num(t.score)}</span>
          </div>
        )
      })}
      <table className="hb-mini">
        <caption className="sr">Line score</caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr">Team</span></th>
            {[1, 2, 3, 4].map((q) => (
              <th key={q} scope="col">Q{q}</th>
            ))}
            <th scope="col">T</th>
          </tr>
        </thead>
        <tbody>
          {(['away', 'home'] as const).map((side) => (
            <tr key={side} className={clsx(w === side && 'is-winner')}>
              <th scope="row">{b[side].abbr}</th>
              {b[side].lines.map((q, i) => (
                <td key={i}>{num(q)}</td>
              ))}
              <td className="hb-mini-t">{num(b[side].score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One game as a ruled row. Used for the nine games and for the design states. */
export function GameRow({ board, meta, context, to }: { board: BoardState; meta: React.ReactNode; context?: React.ReactNode; to?: string }) {
  const w = winner(board)
  const label = `${board.away.abbr} at ${board.home.abbr}`
  return (
    <li className={clsx('grow', board.live && 'is-live', board.stale && 'is-stale')}>
      <div className="grow-meta">{meta}</div>
      <table className="grow-line" aria-label={`${label} line score`}>
        <colgroup>
          <col />
          <col className="col-q" />
          <col className="col-q" />
          <col className="col-q" />
          <col className="col-q" />
          <col className="col-t" />
        </colgroup>
        <thead className="sr">
          <tr>
            <th scope="col">Team</th>
            <th scope="col">Q1</th>
            <th scope="col">Q2</th>
            <th scope="col">Q3</th>
            <th scope="col">Q4</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {(['away', 'home'] as const).map((side) => {
            const t = board[side]
            return (
              <tr key={side} className={clsx(w === side && 'is-winner', w && w !== side && 'is-loser')}>
                <th scope="row">
                  <span className="grow-team" style={{ ['--team' as string]: teamColor(t.abbr) }}>
                    <TeamMark abbr={t.abbr} size={36} />
                    <span className="grow-abbr">{t.abbr}</span>
                    <span className="grow-name">{teamNames(t.abbr).nick}</span>
                  </span>
                </th>
                {[0, 1, 2, 3].map((i) => (
                  <td key={i} className="grow-q">{t.lines[i] == null ? '' : t.lines[i]}</td>
                ))}
                <td className="grow-t">{t.score == null ? '' : t.score}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="grow-ctx">
        {context}
        {to && (
          <Link className="link" to={to}>
            Game page
          </Link>
        )}
      </div>
    </li>
  )
}

/** Smallest size: two short rows. */
export function Bug({ game }: { game: ScoreboardGame }) {
  const b = boardFrom(game)
  const w = winner(b)
  const inner = (
    <>
      {(['away', 'home'] as const).map((side) => (
        <span key={side} className={clsx('bug-row', w === side && 'is-winner', w && w !== side && 'is-loser')}>
          <TeamMark abbr={b[side].abbr} size={24} />
          <span className="bug-abbr">{b[side].abbr}</span>
          <span className="bug-score">{num(b[side].score)}</span>
        </span>
      ))}
      <span className="bug-status">
        {b.statusLabel}
        {game.status === 'scheduled' && game.tipoff_utc ? `, ${fmtTimeET(game.tipoff_utc)}` : ''}
      </span>
    </>
  )
  return game.game_id === featuredId ? (
    <Link to="/a/game" className="bug" aria-label={`${game.label}, ${b.statusLabel}, open game page`}>
      {inner}
    </Link>
  ) : (
    <div className="bug">{inner}</div>
  )
}

export const scoreboardGames = data.scoreboard.games
