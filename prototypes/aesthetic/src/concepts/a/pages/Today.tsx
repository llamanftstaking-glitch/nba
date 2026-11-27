import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { data, featuredGame } from '../../../data'
import { Headshot, Note, SNAPSHOT, SectionHead, Slot, featuredId, longDate, stampET, teamNames } from '../lib'
import { Bug, HeroBoard, scoreboardGames } from '../Scoreboard'
import { PickKey, PickList, byProb } from '../Picks'
import { useShell } from '../shell'

const hero = scoreboardGames.find((g) => g.game_id === featuredId)!
const others = scoreboardGames.filter((g) => g.game_id !== featuredId)
const picks = [...data.qualified.items].sort(byProb).slice(0, 6)
const box = [...featuredGame.boxscore.away.players, ...featuredGame.boxscore.home.players]
const shot = (id: number) => box.find((p) => p.player_id === id)

function Leaders() {
  const L = featuredGame.live.leaders as Record<'home' | 'away', Record<'pts' | 'reb' | 'ast', { player_id: number; name: string; value: number }>>
  const cats = [
    ['pts', 'Points'],
    ['reb', 'Rebounds'],
    ['ast', 'Assists'],
  ] as const
  return (
    <div className="leaders">
      {(['away', 'home'] as const).map((side) => (
        <div key={side} className="leaders-side">
          <h3 className="label">{teamNames(hero[side].abbr).nick} leaders</h3>
          <ul>
            {cats.map(([k, label]) => (
              <li key={k}>
                <Headshot player={shot(L[side][k].player_id)} name={L[side][k].name} size={44} />
                <span className="leaders-name">{L[side][k].name}</span>
                <span className="leaders-val">
                  {L[side][k].value} <span>{label.toLowerCase()}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function Today() {
  const { openAssistant } = useShell()
  const ed = data.edition.latest!
  const changes = data.injury_changes.items.filter((c) => c.material).slice(0, 6)
  return (
    <div className="page today">
      <div className="dayline">
        <p className="dayline-date">{longDate(SNAPSHOT)}</p>
        <p className="dayline-note">
          <Slot>Snapshot</Slot> Nine finals, last polled {stampET(hero.observed_at)}. Not live.
        </p>
      </div>

      <section className="today-hero" aria-label="Featured game">
        <HeroBoard game={hero} />
        <div className="today-hero-foot">
          <Leaders />
          <Link className="btn btn-line" to="/a/game">
            Box score and game page
          </Link>
        </div>
      </section>

      <section aria-labelledby="slate-h" className="block">
        <SectionHead id="slate-h" title="Around the league" aside={<Link className="link" to="/a/scores">All nine with line scores</Link>} />
        <div className="slate">
          {others.map((g) => (
            <Bug key={g.game_id} game={g} />
          ))}
        </div>
      </section>

      <div className="split block">
        <section aria-labelledby="picks-h" className="split-main">
          <SectionHead
            id="picks-h"
            title="Research picks"
            aside={
              <Link className="link" to="/a/research">
                All {data.qualified.total} qualified
              </Link>
            }
          />
          <p className="lede lede-s">
            The six highest model estimates among contracts that passed every check in edition v{ed.version}, published before tipoff at {stampET(ed.published_at)}.
          </p>
          <PickList items={picks} />
          <PickKey />
        </section>

        <aside className="split-side">
          <section aria-labelledby="brief-h">
            <SectionHead id="brief-h" title="Briefing" level={3} />
            <ul className="brief">
              {ed.summary.narrative.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <button type="button" className="ask" onClick={openAssistant}>
              <Sparkles size={18} aria-hidden="true" />
              <span>Ask JARVIS about the slate</span>
            </button>
            <Note>JARVIS explains stored records. It does not produce probabilities.</Note>
          </section>

          <section aria-labelledby="avail-h" className="side-block">
            <SectionHead id="avail-h" title="Availability changes" level={3} />
            <ul className="avail">
              {changes.map((c) => (
                <li key={`${c.player_name}${c.at}`}>
                  <span className="avail-name">
                    {c.player_name} <span className="avail-team">{c.team_abbr}</span>
                  </span>
                  <span className="avail-move">
                    {c.previous_status ?? 'Not listed'} <span aria-hidden="true">&rarr;</span>
                    <span className="sr"> to </span> <strong>{c.current_status ?? 'Not listed'}</strong>
                  </span>
                </li>
              ))}
            </ul>
            <Note>
              {data.injury_changes.items.length} changes recorded for this slate. Each one opens a new edition; published research is never edited.
            </Note>
          </section>
        </aside>
      </div>
    </div>
  )
}
