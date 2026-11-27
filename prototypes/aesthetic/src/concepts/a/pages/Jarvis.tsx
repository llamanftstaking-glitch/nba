import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { ArrowUp, ImagePlus, X } from 'lucide-react'
import { data } from '../../../data'
import { Headshot, Note, Slot, TeamMark } from '../lib'

const convo = data.jarvis.sample_conversation
const owner = convo.messages.find((m) => m.role === 'owner')!
const answer = convo.messages.find((m) => m.role === 'assistant')!
const fact = Object.fromEntries(convo.facts.map((f) => [f.key, f.value])) as Record<string, number>
const state = data.jarvis.state as { models: Record<string, string>; budget: { spent_usd: number; today_usd: number }; lifetime_cap_usd: number; daily_cap_usd: number }

const MODES = [
  { key: 'quick', label: 'Quick answers', hint: 'Short replies from stored records' },
  { key: 'standard', label: 'Standard', hint: 'The everyday setting' },
  { key: 'deep', label: 'Deep review', hint: 'Slower, for audits and long reads' },
] as const

const sections = answer.text.split('\n\n').map((p) => {
  const m = /^\*\*(.+?)\*\*\s*(.*)$/s.exec(p)
  return m ? { head: m[1].replace(/\.$/, ''), body: m[2] } : { head: null, body: p }
})

const rows: [string, string, string][] = [
  ['Projected minutes', `${fact.proj_min}`, `range ${fact.proj_min_low} to ${fact.proj_min_high}`],
  ['Minutes, last 10', `${fact.min_l10}`, `sd ${fact.sd_l10}, started ${fact.starts_l10} of 10`],
  ['Usage, season', `${fact.usage_season}%`, `${fact.usage_games} games`],
  ['Usage, last 10', `${fact.usage_recent_10}%`, ''],
  ['True shooting, season', `${fact.true_shooting_season}%`, `${fact.fga36} FGA per 36`],
  ['Points, last 5', `${fact.pts_l5_mean}`, `${fact.pts_l5_games} appearances`],
  ['Points, last 10', `${fact.pts_l10_mean}`, `low ${fact.pts_l10_min}, high ${fact.pts_l10_max}`],
  ['Observed Nov 25', `${fact.live_pts} pts`, `${fact.live_min} min, pregame projection ${fact.pregame_pts}`],
]

function Conversation({ compact }: { compact?: boolean }) {
  return (
    <article className={clsx('convo', compact && 'convo-compact')}>
      <p className="convo-flag">
        <Slot>Sample conversation</Slot> Written by hand for this prototype from stored records. Not a recorded exchange and not model output.
      </p>
      <div className="q">
        <span className="q-who">You asked</span>
        <h2 className="q-text">{owner.text}</h2>
      </div>
      <details className="trail">
        <summary>
          Read {answer.tool_activity?.length} records: {answer.tool_activity?.map((t) => t.label.replace(/^(Loading|Reading) (the )?/, '')).join(', ')}
        </summary>
        <ol>
          {answer.tool_activity?.map((t) => (
            <li key={t.tool}>
              <span>{t.label}</span>
              <span className="trail-tool">{t.tool}</span>
              <span className="trail-status">{t.status}</span>
            </li>
          ))}
        </ol>
      </details>
      <div className="a">
        {sections.map((s, i) => (
          <section key={i}>
            {s.head && <h3 className="a-h">{s.head}</h3>}
            <p>{s.body}</p>
            {i === 0 && !compact && (
              <div className="a-table tscroll">
                <table className="stat">
                  <caption>The numbers this answer uses</caption>
                  <thead>
                    <tr>
                      <th scope="col">Measure</th>
                      <th scope="col" className="r">Value</th>
                      <th scope="col">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([k, v, d]) => (
                      <tr key={k}>
                        <th scope="row">{k}</th>
                        <td className="r strong">{v}</td>
                        <td className="muted">{d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
      <div className="a-foot">
        <div>
          <h3 className="label">Sources</h3>
          <ol className="sources">
            {answer.sources?.map((s) => (
              <li key={s.label}>
                <span className="sources-l">{s.label}</span>
                <span className="sources-d">{s.detail}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="label">Limits of this answer</h3>
          <ul className="limits">
            {answer.limitations?.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  )
}

function Composer({ context, onClearContext }: { context: ReactNode; onClearContext?: () => void }) {
  const [mode, setMode] = useState<(typeof MODES)[number]['key']>('standard')
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const [attached, setAttached] = useState(false)
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); setTried(true) }}>
      <div className="composer-ctx">
        <span className="composer-ctx-l">Looking at</span>
        {context}
        {attached && (
          <span className="chip">
            Image attached (demo)
            <button type="button" className="chip-x" aria-label="Remove image" onClick={() => setAttached(false)}>
              <X size={14} />
            </button>
          </span>
        )}
        {onClearContext && null}
      </div>
      <label className="sr" htmlFor="a-ask">
        Ask JARVIS
      </label>
      <textarea id="a-ask" rows={2} value={text} onChange={(e) => { setText(e.target.value); setTried(false) }} placeholder="Ask about a game, a player or a contract" />
      <div className="composer-row">
        <button type="button" className="icon-btn" aria-label="Attach an image" title="Attach an image" onClick={() => setAttached(true)}>
          <ImagePlus size={20} />
        </button>
        <div className="seg seg-s" role="radiogroup" aria-label="Answer depth">
          {MODES.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} className={clsx(mode === m.key && 'is-on')} title={`${m.hint}. Model: ${state.models[m.key]}`} onClick={() => setMode(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        <button type="submit" className="btn btn-ink send" aria-label="Send">
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="composer-foot" aria-live="polite">
        {tried ? (
          'Sending is switched off in this prototype. Nothing was sent and nothing was spent.'
        ) : (
          <>
            ${state.budget.spent_usd.toFixed(2)} of ${state.lifetime_cap_usd} lifetime budget used, ${state.budget.today_usd.toFixed(2)} today.
          </>
        )}
      </p>
    </form>
  )
}

const suggestions = data.jarvis.suggestions.items.filter((s) => !s.text.startsWith('/'))

export function AssistantBody({ variant, context }: { variant: 'page' | 'sheet'; context?: { label: string; detail: string } }) {
  const chips = (
    <>
      {variant === 'sheet' && context && (
        <span className="chip">
          {context.label} <span className="chip-d">{context.detail}</span>
        </span>
      )}
      {variant === 'page' && (
        <>
          <span className="chip chip-p">
            <Headshot player={convo.subject} name={convo.subject.name} size={24} /> {convo.subject.name}
          </span>
          <span className="chip chip-p">
            <TeamMark abbr="CLE" size={20} />
            <TeamMark abbr="NYK" size={20} /> CLE @ NYK <span className="chip-d">Final</span>
          </span>
        </>
      )}
    </>
  )
  if (variant === 'sheet') {
    return (
      <div className="sheet-body">
        <div className="sheet-scroll">
          <h3 className="label">Suggested</h3>
          <ul className="sugg sugg-sheet">
            {suggestions.slice(0, 3).map((s) => (
              <li key={s.label}>
                <button type="button" title={s.text}>
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
          <Conversation compact />
        </div>
        <Composer context={chips} />
      </div>
    )
  }
  return (
    <div className="jarvis-grid">
      <div className="jarvis-main">
        <Conversation />
        <Composer context={chips} />
      </div>
      <aside className="jarvis-side">
        <section>
          <h2 className="h-sub">Suggested questions</h2>
          <ul className="sugg">
            {suggestions.map((s) => (
              <li key={s.label}>
                <button type="button">
                  <span className="sugg-l">{s.label}</span>
                  <span className="sugg-t">{s.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="side-block">
          <h2 className="h-sub">What JARVIS does</h2>
          <p className="side-p">It reads verified records and explains them, with the sources it used. It never produces a probability, changes a classification or touches risk and budget policy.</p>
          <Note>
            Budget: ${state.budget.spent_usd.toFixed(2)} of ${state.lifetime_cap_usd} used. Daily cap ${state.daily_cap_usd}.
          </Note>
        </section>
      </aside>
    </div>
  )
}

export default function Jarvis() {
  return (
    <div className="page jarvis">
      <div className="page-head">
        <div>
          <h1 className="h-page">JARVIS</h1>
          <p className="page-sub">The research assistant. Ask it about anything on the slate.</p>
        </div>
      </div>
      <AssistantBody variant="page" />
    </div>
  )
}
