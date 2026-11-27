import { useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { data, featuredGame, fmtTimeET } from '../../../data'
import { Note, SNAPSHOT, SectionHead, Slot, featuredId, longDate, num, shortDate, stampET } from '../lib'
import { GameRow, boardFrom, scoreboardGames, type BoardState } from '../Scoreboard'

const cards = new Map(data.games.games.map((g) => [g.id, g]))
const L = featuredGame.live.leaders as Record<'home' | 'away', Record<'pts' | 'reb' | 'ast', { name: string; value: number }>>
const last = (n: string) => n.split(' ').slice(1).join(' ') || n

function Projection({ id }: { id: string }) {
  const c = cards.get(id)
  if (!c?.environment) return <span className="muted">No pregame projection held</span>
  return (
    <span className="proj">
      <span className="proj-l">Projected</span>
      <span className="proj-line">
        {c.away.abbr} {num(c.environment.proj_away_points, 1)}, {c.home.abbr} {num(c.environment.proj_home_points, 1)}
      </span>
    </span>
  )
}

// A real moment of the featured game from the stored play-by-play, to show the in-progress design.
const moment = featuredGame.play_by_play.items.find((p) => p.period === 4 && p.scoring && p.elapsed_s <= 2520)!
const sum3 = (a: number[]) => a[0] + a[1] + a[2]
const fgLive = featuredGame.live
const liveBoard: BoardState = {
  status: 'live',
  statusLabel: `Q4 ${moment.clock}`,
  live: true,
  away: { abbr: fgLive.away.abbr, score: moment.away_score, lines: [...fgLive.away.linescores.slice(0, 3), moment.away_score - sum3(fgLive.away.linescores)] },
  home: { abbr: fgLive.home.abbr, score: moment.home_score, lines: [...fgLive.home.linescores.slice(0, 3), moment.home_score - sum3(fgLive.home.linescores)] },
}
const sched = data.games.games.find((g) => g.status === 'scheduled')!
const schedBoard: BoardState = {
  status: 'scheduled',
  statusLabel: 'Scheduled',
  away: { abbr: sched.away.abbr, score: null, lines: [] },
  home: { abbr: sched.home.abbr, score: null, lines: [] },
}
const staleBoard: BoardState = { ...liveBoard, live: false, stale: true }

export default function Scores() {
  const sb = data.scoreboard
  const days = [sb.prev, SNAPSHOT, sb.next]
  const [day, setDay] = useState(SNAPSHOT)
  const idx = days.indexOf(day)
  return (
    <div className="page scores">
      <div className="page-head">
        <div>
          <h1 className="h-page">Scores</h1>
          <p className="page-sub">{longDate(day)}</p>
        </div>
        <div className="dayswitch" role="group" aria-label="Choose a day">
          <button type="button" className="icon-btn" aria-label="Previous day" disabled={idx === 0} onClick={() => setDay(days[idx - 1])}>
            <ChevronLeft size={20} />
          </button>
          {days.map((d) => (
            <button key={d} type="button" className={clsx('day', d === day && 'is-current')} aria-pressed={d === day} onClick={() => setDay(d)}>
              <span className="day-rel">{d === sb.prev ? 'Previous' : d === SNAPSHOT ? 'Snapshot' : 'Next'}</span>
              <span className="day-date">{shortDate(d)}</span>
            </button>
          ))}
          <button type="button" className="icon-btn" aria-label="Next day" disabled={idx === 2} onClick={() => setDay(days[idx + 1])}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {day !== SNAPSHOT ? (
        <div className="empty">
          <h2 className="h-section">No games held for {shortDate(day)}</h2>
          <p>This prototype stores one day. In the product this is where that day&rsquo;s schedule or finals load.</p>
          <button type="button" className="btn btn-line" onClick={() => setDay(SNAPSHOT)}>
            Back to {shortDate(SNAPSHOT)}
          </button>
        </div>
      ) : (
        <>
          <div className="board-cols" aria-hidden="true">
            <span className="label">{scoreboardGames.length} games, all final</span>
            <span className="label board-cols-q">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>T</span>
            </span>
            <span className="label board-cols-ctx model">Pregame projection</span>
          </div>
          <ul className="board">
            {scoreboardGames.map((g) => (
              <GameRow
                key={g.game_id}
                board={boardFrom(g)}
                to={g.game_id === featuredId ? '/a/game' : undefined}
                meta={
                  <>
                    <Slot>{g.status_label}</Slot>
                    <span className="grow-when">{fmtTimeET(g.tipoff_utc)} tip</span>
                    <span className="grow-venue">{g.venue}</span>
                  </>
                }
                context={
                  <>
                    <Projection id={g.game_id} />
                    {g.game_id === featuredId && (
                      <span className="grow-leaders">
                        Leaders: {last(L.away.pts.name)} {L.away.pts.value} pts, {last(L.home.pts.name)} {L.home.pts.value} pts
                      </span>
                    )}
                  </>
                }
              />
            ))}
          </ul>
          <Note className="board-note">
            Scores were polled from a public feed and last verified {stampET(sb.games[0].observed_at)}. They are delayed observations. Leaders and a full game page are held for CLE @ NYK only. Pregame projections are shown as published and are never revised after the game.
          </Note>

          <section className="block states" aria-labelledby="states-h">
            <SectionHead id="states-h" title="Other game states" aside={<Slot>Design reference, not live</Slot>} />
            <p className="lede lede-s">
              Every game in the snapshot is final, so the three other states are shown here with real stored values: a replayed moment of CLE @ NYK from the play-by-play, and a pregame record as it was published.
            </p>
            <ul className="board">
              <GameRow
                board={liveBoard}
                meta={
                  <>
                    <Slot live>Live, {liveBoard.statusLabel}</Slot>
                    <span className="grow-when">Polled about every 15 seconds</span>
                    <span className="grow-venue">Observed, delayed</span>
                  </>
                }
                context={<span className="grow-leaders">Last scoring play: {moment.text}</span>}
              />
              <GameRow
                board={staleBoard}
                meta={
                  <>
                    <Slot>Feed stopped</Slot>
                    <span className="grow-when">Last verified Q4 {moment.clock}</span>
                    <span className="grow-venue">Values held, not updated</span>
                  </>
                }
                context={<span className="muted">A stopped feed keeps the last verified score and says so. Nothing is estimated.</span>}
              />
              <GameRow
                board={schedBoard}
                meta={
                  <>
                    <Slot>Scheduled</Slot>
                    <span className="grow-when">{fmtTimeET(sched.tipoff_utc)} tip</span>
                    <span className="grow-venue">{sched.venue}</span>
                  </>
                }
                context={
                  <>
                    <span className="grow-leaders">Lineups projected, not official</span>
                    <Projection id={sched.id} />
                  </>
                }
              />
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
