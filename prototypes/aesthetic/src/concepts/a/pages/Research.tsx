import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { data, type Combo, type Selection } from '../../../data'
import { NA, Note, ProbScale, SectionHead, Slot, american, num, pct, signed, stampET } from '../lib'
import { PickKey, PickList, byProb, splitLabel } from '../Picks'

const ed = data.edition.latest!
const VIEWS = [
  ['picks', 'Picks', `${data.top_picks.items.length} ranked`],
  ['combinations', 'Combinations', `${ed.counts.combinations} built`],
  ['edition', 'Edition', `v${ed.version}, ${ed.changes_total ?? ed.changes.length} changes`],
  ['tracker', 'Paper tracker', `${data.research_tracker.total} open`],
  ['results', 'Results', `${data.results.summary.settled} settled`],
] as const

function Evidence({ s }: { s: Selection }) {
  const l = splitLabel(s)
  return (
    <div className="ev">
      <p className="ev-game">{s.game_label}</p>
      <h3 className="ev-title">
        {l.who} <span>{l.what}</span>
      </h3>
      <div className="ev-prob">
        <span className="ev-n model tnum">{pct(s.prob, 1)}</span>
        <span className="ev-l">
          <Slot tone="model">Model estimate</Slot>
          <span className="muted">
            interval {pct(s.prob_low, 0)} to {pct(s.prob_high, 0)}, break-even {pct(s.breakeven, 1)}
          </span>
        </span>
      </div>
      <ProbScale prob={s.prob} low={s.prob_low} high={s.prob_high} breakeven={s.breakeven} />
      <dl className="kv">
        <div>
          <dt>Projection</dt>
          <dd className="model">{num(s.projection, 1)}</dd>
        </div>
        <div>
          <dt>Line</dt>
          <dd>{s.line ?? NA}</dd>
        </div>
        <div>
          <dt>Last 10</dt>
          <dd>{num(s.context?.l10, 1)}</dd>
        </div>
        <div>
          <dt>Sample</dt>
          <dd>{s.sample_size ?? NA}</dd>
        </div>
      </dl>
      <h4 className="label ev-h">Evidence quality, {s.evidence_score} of 100</h4>
      <ul className="evc">
        {s.evidence.components.map((c) => (
          <li key={c.name}>
            <span className="evc-name">{c.name}</span>
            <span className="evc-score tnum">
              {c.score}/{c.max}
            </span>
            <span className="evc-note">{c.note}</span>
          </li>
        ))}
      </ul>
      <Note>Evidence quality describes the inputs. It is not a probability.</Note>
      <h4 className="label ev-h">For</h4>
      <ul className="evl">
        {s.evidence.supporting.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <h4 className="label ev-h">Against</h4>
      <ul className="evl">
        {s.evidence.opposing.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="ev-foot muted">
        Model {s.model?.name} {s.model?.version} ({s.model?.status}). Quote origin: {s.origin}, {s.book}, verified {stampET(s.verified_at)}.
      </p>
    </div>
  )
}

function Picks() {
  const [order, setOrder] = useState<'prob' | 'rank'>('prob')
  const [n, setN] = useState(10)
  const all = order === 'prob' ? [...data.top_picks.items].sort(byProb) : data.top_picks.items
  const [sel, setSel] = useState<number>(all[0].id)
  const c = ed.counts
  const selected = data.top_picks.items.find((s) => s.id === sel) ?? all[0]
  return (
    <>
      <dl className="funnel">
        <div>
          <dd>{c.markets_analyzed.toLocaleString('en-US')}</dd>
          <dt>quoted markets evaluated</dt>
        </div>
        <div>
          <dd>{(c.rejected + c.insufficient_evidence).toLocaleString('en-US')}</dd>
          <dt>rejected or lacking evidence</dt>
        </div>
        <div>
          <dd>{c.watchlist}</dd>
          <dt>on the watchlist</dt>
        </div>
        <div>
          <dd>{c.standard}</dd>
          <dt>met the standard</dt>
        </div>
        <div>
          <dd>{c.qualified}</dd>
          <dt>ranked for paper testing</dt>
        </div>
        <div>
          <dd>0</dd>
          <dt>high confidence: the tier is empty</dt>
        </div>
      </dl>
      <div className="split block-s">
        <div className="split-main">
          <SectionHead
            title="Ranked picks"
            aside={
              <div className="seg seg-s" role="group" aria-label="Order">
                <button type="button" className={clsx(order === 'prob' && 'is-on')} aria-pressed={order === 'prob'} onClick={() => setOrder('prob')}>
                  Highest estimate
                </button>
                <button type="button" className={clsx(order === 'rank' && 'is-on')} aria-pressed={order === 'rank'} onClick={() => setOrder('rank')}>
                  Edition order
                </button>
              </div>
            }
          />
          <PickList items={all.slice(0, n)} numbered selectedId={sel} onSelect={setSel} />
          <PickKey />
          {n < all.length && (
            <div className="toolbar toolbar-b">
              <button type="button" className="btn btn-line" onClick={() => setN(all.length)}>
                Show all {all.length}
              </button>
            </div>
          )}
        </div>
        <aside className="split-side">
          <SectionHead title="Why it qualified" level={3} />
          <Evidence s={selected} />
        </aside>
      </div>
    </>
  )
}

function ComboRow({ c }: { c: Combo }) {
  const cor = c.correlation as { method: string; draws: number; mc_se: number; assessment: string; shared_risks: string[] }
  return (
    <li className="combo">
      <div className="combo-id">
        <span className="combo-name">{c.name.replace('GIZER ', '')}</span>
        <Slot>{c.designation === 'paper_testing' ? 'Paper testing' : 'Research only'}</Slot>
        <span className="muted">{c.structure === 'SGP' ? 'Same game' : 'Two games'}</span>
      </div>
      <ol className="combo-legs">
        {c.legs.map((l) => (
          <li key={l.selection_id}>
            <span className="combo-leg">{l.label}</span>
            <span className="muted">{l.game_label}</span>
            <span className="tnum model">{pct(l.prob, 1)}</span>
          </li>
        ))}
      </ol>
      <div className="combo-joint">
        <span className="combo-n model tnum">{pct(c.joint_prob, 1)}</span>
        <span className="muted">
          joint, interval {pct(c.joint_low, 0)} to {pct(c.joint_high, 0)}
        </span>
        <ProbScale prob={c.joint_prob} low={c.joint_low} high={c.joint_high} />
        <dl className="kv kv-2">
          <div>
            <dt>If independent</dt>
            <dd>{pct(c.independent_prob, 1)}</dd>
          </div>
          <div>
            <dt>Reference price</dt>
            <dd>{c.reference_price ? american(c.reference_price.american) : 'None held'}</dd>
          </div>
        </dl>
      </div>
      <p className="combo-note">
        {cor.assessment} {cor.shared_risks[0]} {c.reference_price ? 'The reference price is the arithmetic product of the leg prices, not a quote.' : 'No combined quote was observed, so no price is shown.'}
      </p>
    </li>
  )
}

function Combinations() {
  const [cat, setCat] = useState<'double' | 'sgp'>('double')
  const set = data.parlays[cat]
  const cor = set.items[0].correlation as { method: string; draws: number; mc_se: number }
  return (
    <>
      <SectionHead
        title="Two-leg combinations"
        aside={
          <div className="seg seg-s" role="group" aria-label="Combination type">
            <button type="button" className={clsx(cat === 'double' && 'is-on')} aria-pressed={cat === 'double'} onClick={() => setCat('double')}>
              Doubles ({set.counts.double})
            </button>
            <button type="button" className={clsx(cat === 'sgp' && 'is-on')} aria-pressed={cat === 'sgp'} onClick={() => setCat('sgp')}>
              Same game ({set.counts.sgp})
            </button>
          </div>
        }
      />
      <p className="lede lede-s">
        Joint probability is simulated, not multiplied: {cor.method}, {cor.draws.toLocaleString('en-US')} draws, Monte Carlo standard error about {(cor.mc_se * 100).toFixed(1)} points. Showing {set.items.length} of {set.items_total ?? set.items.length}.
      </p>
      <ul className="combos">
        {set.items.map((c) => (
          <ComboRow key={c.uid + cat} c={c} />
        ))}
      </ul>
      <Note>
        <span className="model">Orange figures</span> are model estimates, not hit rates. Every combination is invalidated if a leg&rsquo;s player is ruled out, its line moves by 1.0 or more, or a later edition reclassifies a leg.
      </Note>
    </>
  )
}

function Edition() {
  const prev = data.edition.list.items[1]
  const keys = [
    ['markets_analyzed', 'Markets evaluated'],
    ['standard', 'Standard'],
    ['watchlist', 'Watchlist'],
    ['rejected', 'Rejected'],
    ['insufficient_evidence', 'Insufficient evidence'],
    ['combinations', 'Combinations'],
  ] as const
  return (
    <div className="split">
      <div className="split-main">
        <SectionHead title={`Edition v${ed.version}, ${ed.kind}`} aside={<Slot>Published {stampET(ed.published_at)}</Slot>} />
        <ul className="brief brief-l">
          {ed.summary.narrative.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <section className="block-s" aria-labelledby="chg-h">
          <SectionHead id="chg-h" title="What changed since v1" aside={<span className="muted">{ed.changes.length} of {ed.changes_total} shown</span>} />
          <ul className="changes">
            {ed.changes.map((c, i) => (
              <li key={i}>
                <span className="changes-t">{c.type === 'market_move' ? 'Price moved' : 'Reclassified'}</span>
                <span>{c.text.replace(/-(\d)/g, '−$1')}</span>
              </li>
            ))}
          </ul>
          <Note>An availability or lineup change opens a new edition. A published edition is never edited; its content hash is {ed.content_sha256.slice(0, 12)}.</Note>
        </section>
      </div>
      <aside className="split-side">
        <SectionHead title="v1 and v2" level={3} />
        <table className="stat stat-plain">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col" className="r">v{prev.version}</th>
              <th scope="col" className="r">v{ed.version}</th>
            </tr>
          </thead>
          <tbody>
            {keys.map(([k, l]) => (
              <tr key={k}>
                <th scope="row">{l}</th>
                <td className="r">{prev.counts[k]?.toLocaleString('en-US') ?? NA}</td>
                <td className="r strong">{ed.counts[k]?.toLocaleString('en-US') ?? NA}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <section className="side-block">
          <SectionHead title="Limits of this edition" level={3} />
          <ul className="brief">
            {ed.summary.limitations.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
        <section className="side-block">
          <SectionHead title="Rejected, with the reason" level={3} />
          <ul className="brief">
            {ed.summary.rejected.slice(0, 4).map((r) => (
              <li key={r.label}>
                <strong>{r.label.replace(' — ', ', ')}</strong>
                <span className="muted block-span">{r.reasons[0]}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  )
}

function Tracker() {
  const t = data.research_tracker
  return (
    <div className="narrow">
      <SectionHead title="Paper tracker" aside={<Slot>Awaiting settlement</Slot>} />
      <p className="lede lede-s">
        {t.total} paper tickets from this edition are open; {t.items.length} are shown. The games are final, but a ticket is settled only after the settlement job checks the final box score against the contract rules. Until then no outcome is stated.
      </p>
      <ul className="tickets">
        {t.items.map((k) => (
          <li key={k.ticket_id} className="ticket">
            <div className="ticket-id">
              <span className="combo-name">Ticket {k.ticket_id}</span>
              <span className="muted">
                {String(k.engine).toLowerCase()}, {k.structure === 'SGP' ? 'same game' : 'across games'}
              </span>
            </div>
            <table className="stat stat-plain">
              <thead>
                <tr>
                  <th scope="col">Leg</th>
                  <th scope="col" className="r">Line</th>
                  <th scope="col" className="r">Observed</th>
                  <th scope="col" className="r">Difference</th>
                </tr>
              </thead>
              <tbody>
                {(k.legs as { label: string; line: number; current: number | null; difference_to_line: number | null; game_label: string }[]).map((l) => (
                  <tr key={l.label}>
                    <th scope="row">
                      {l.label} <span className="muted">{l.game_label}</span>
                    </th>
                    <td className="r">{l.line}</td>
                    <td className="r strong">{l.current ?? NA}</td>
                    <td className="r">{signed(l.difference_to_line, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
      <Note>{t.notes.join(' ')}</Note>
    </div>
  )
}

function Results() {
  const r = data.results
  const s = r.summary
  return (
    <div>
      <SectionHead title="Paper results to date" aside={<Slot>Simulated units</Slot>} />
      <dl className="funnel">
        <div>
          <dd>{s.tickets}</dd>
          <dt>paper tickets</dt>
        </div>
        <div>
          <dd>{s.settled}</dd>
          <dt>settled</dt>
        </div>
        <div>
          <dd>
            {s.wins}&ndash;{s.losses}
          </dd>
          <dt>hit and missed, {s.voids} void</dt>
        </div>
        <div>
          <dd>{pct(s.hit_rate, 1)}</dd>
          <dt>
            hit rate, interval {pct(s.hit_rate_ci[0], 0)} to {pct(s.hit_rate_ci[1], 0)}
          </dt>
        </div>
        <div>
          <dd className="model">{pct(s.avg_model_prob, 1)}</dd>
          <dt>average model estimate</dt>
        </div>
        <div>
          <dd>{signed(s.pnl_units, 1)}</dd>
          <dt>simulated units on {s.staked_units}</dt>
        </div>
      </dl>
      <div className="split block-s">
        <div className="split-main">
          <SectionHead title="By size" level={3} />
          <div className="tscroll">
            <table className="stat">
              <thead>
                <tr>
                  <th scope="col" className="sticky-col">Legs</th>
                  <th scope="col" className="r">Tickets</th>
                  <th scope="col" className="r">Settled</th>
                  <th scope="col" className="r">Hit</th>
                  <th scope="col" className="r">Missed</th>
                  <th scope="col" className="r">Hit rate</th>
                  <th scope="col" className="r">
                    <span className="model">Avg estimate</span>
                  </th>
                  <th scope="col" className="r">Sim. units</th>
                </tr>
              </thead>
              <tbody>
                {r.by_engine.map((e) => (
                  <tr key={e.engine}>
                    <th scope="row" className="sticky-col">{String(e.engine)[0] + String(e.engine).slice(1).toLowerCase()}</th>
                    <td className="r">{e.tickets}</td>
                    <td className="r">{e.settled}</td>
                    <td className="r">{e.wins}</td>
                    <td className="r">{e.losses}</td>
                    <td className="r strong">{e.settled ? pct(e.hit_rate, 0) : NA}</td>
                    <td className="r model">{e.settled ? pct(e.avg_model_prob, 0) : NA}</td>
                    <td className="r">{e.settled ? signed(e.pnl_units, 1) : NA}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>{r.disclaimer}</Note>
        </div>
        <aside className="split-side">
          <SectionHead title="Calibration so far" level={3} />
          <table className="stat stat-plain">
            <thead>
              <tr>
                <th scope="col">Estimate</th>
                <th scope="col" className="r">n</th>
                <th scope="col" className="r">
                  <span className="model">Predicted</span>
                </th>
                <th scope="col" className="r">Observed</th>
              </tr>
            </thead>
            <tbody>
              {r.calibration.map((c) => (
                <tr key={c.bucket}>
                  <th scope="row">{c.bucket}</th>
                  <td className="r">{c.n}</td>
                  <td className="r model">{pct(c.predicted, 0)}</td>
                  <td className="r strong">{pct(c.observed, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note>With this few settled records per row, the intervals are wide and nothing here supports a claim about accuracy.</Note>
        </aside>
      </div>
    </div>
  )
}

export default function Research() {
  const [params, setParams] = useSearchParams()
  const view = VIEWS.some(([k]) => k === params.get('view')) ? params.get('view')! : 'picks'
  return (
    <div className="page research">
      <div className="page-head">
        <div>
          <h1 className="h-page">Research</h1>
          <p className="page-sub">
            Edition v{ed.version}, published {stampET(ed.published_at)}, before the first tip.
          </p>
        </div>
        <p className="sync">
          <Slot>Paper research only</Slot>
          <span>Nothing here is a wagering recommendation. Estimates come from registered models; prices are observed and never a model input.</span>
        </p>
      </div>
      <div className="ws">
        <nav className="ws-nav" aria-label="Research sections">
          {VIEWS.map(([k, label, sub]) => (
            <button key={k} type="button" className={clsx('ws-item', view === k && 'is-current')} aria-current={view === k ? 'page' : undefined} onClick={() => setParams(k === 'picks' ? {} : { view: k }, { replace: true })}>
              <span className="ws-label">{label}</span>
              <span className="ws-sub">{sub}</span>
            </button>
          ))}
        </nav>
        <div className="ws-main">
          {view === 'picks' && <Picks />}
          {view === 'combinations' && <Combinations />}
          {view === 'edition' && <Edition />}
          {view === 'tracker' && <Tracker />}
          {view === 'results' && <Results />}
        </div>
      </div>
    </div>
  )
}
