import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { createChart, LineSeries, type UTCTimestamp } from 'lightweight-charts'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, RefreshCw, X } from 'lucide-react'
import { data, type KalshiMarket } from '../../../data'
import { Delta, NA, Note, Slot, cents, clockET, compact, pct, stampET, tinyDate } from '../lib'
import { useShell } from '../shell'

const list = data.kalshi.list
const details = data.kalshi.details
const KINDS = [
  ['all', 'All'],
  ['game', 'Winner'],
  ['spread', 'Spread'],
  ['total', 'Total'],
  ['player', 'Player'],
] as const
type SortKey = 'volume' | 'price' | 'change_since_first' | 'spread' | 'threshold'
const etHM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
const etDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })

function PriceChart({ ticker }: { ticker: string }) {
  const el = useRef<HTMLDivElement>(null)
  const series = details[ticker].series
  useEffect(() => {
    if (!el.current) return
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#646b72', fontFamily: "'Archivo Variable', Arial, sans-serif", fontSize: 13 },
      grid: { vertLines: { visible: false }, horzLines: { color: '#d5d7d1' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.18, bottom: 0.18 } },
      timeScale: { borderColor: '#12161a', timeVisible: true, secondsVisible: false, tickMarkFormatter: (t: number) => `${etDay.format(new Date(t * 1000))}, ${etHM.format(new Date(t * 1000))}` },
      localization: { timeFormatter: (t: number) => `${etDay.format(new Date(t * 1000))}, ${etHM.format(new Date(t * 1000))} ET`, priceFormatter: (v: number) => `${(v * 100).toFixed(1)}¢` },
      crosshair: { horzLine: { color: '#646b72', labelBackgroundColor: '#12161a' }, vertLine: { color: '#646b72', labelBackgroundColor: '#12161a' } },
      handleScroll: false,
      handleScale: false,
    })
    const s = chart.addSeries(LineSeries, { color: '#12161a', lineWidth: 2, pointMarkersVisible: true, pointMarkersRadius: 4, lastValueVisible: true, priceLineVisible: false, priceFormat: { type: 'price', precision: 3, minMove: 0.005 } })
    s.setData(series.filter((o) => o.price != null).map((o) => ({ time: Math.floor(new Date(o.at).getTime() / 1000) as UTCTimestamp, value: o.price as number })))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [ticker, series])
  return <div ref={el} className="pricechart" role="img" aria-label={`Price at each of ${series.length} polled observations, from ${cents(series[0].price)} to ${cents(series[series.length - 1].price)}`} />
}

function Detail({ m }: { m: KalshiMarket }) {
  const d = details[m.ticker]
  const r = d?.research as { model_ready?: boolean; projection?: { mean: number; p10: number; p90: number }; selections?: { side: string; classification: string; rejection_reasons: string[] }[]; note?: string } | null | undefined
  return (
    <div className="mk-detail">
      <p className="mk-d-game">
        {m.game_label} <Slot>Read-only</Slot>
      </p>
      <h2 className="mk-d-title">{m.title}</h2>
      <div className="mk-d-price">
        <span className="mk-d-n tnum">{cents(m.price)}</span>
        <dl className="kv kv-inline">
          <div>
            <dt>Bid / ask</dt>
            <dd>
              {cents(m.yes_bid)} / {cents(m.yes_ask)}
            </dd>
          </div>
          <div>
            <dt>Since first observed</dt>
            <dd>
              <Delta v={m.change_since_first} />
            </dd>
          </div>
          <div>
            <dt>Low to high</dt>
            <dd>
              {cents(m.low)} to {cents(m.high)}
            </dd>
          </div>
        </dl>
      </div>

      {d ? (
        <>
          <PriceChart ticker={m.ticker} />
          <Note>
            {d.series.length} polled observations, {stampET(d.series[0].at)} to {stampET(d.series[d.series.length - 1].at)}. The first one is our first observation, not an opening price. Sync is stale: nothing has been polled since.
          </Note>
          <h3 className="label mk-d-h">Observations</h3>
          <div className="tscroll">
            <table className="stat stat-plain">
              <thead>
                <tr>
                  <th scope="col">Observed (ET)</th>
                  <th scope="col" className="r">Price</th>
                  <th scope="col" className="r">Bid</th>
                  <th scope="col" className="r">Ask</th>
                  <th scope="col" className="r">Volume</th>
                </tr>
              </thead>
              <tbody>
                {[...d.series].reverse().map((o) => (
                  <tr key={o.at}>
                    <th scope="row">
                      {etDay.format(new Date(o.at))}, {clockET(o.at)}
                    </th>
                    <td className="r strong">{cents(o.price)}</td>
                    <td className="r">{cents(o.yes_bid)}</td>
                    <td className="r">{cents(o.yes_ask)}</td>
                    <td className="r">{compact(o.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {d.history && (
            <>
              <h3 className="label mk-d-h">How often he has cleared {m.threshold}</h3>
              <table className="stat stat-plain">
                <thead>
                  <tr>
                    <th scope="col">Window</th>
                    <th scope="col" className="r">Games</th>
                    <th scope="col" className="r">Cleared</th>
                    <th scope="col" className="r">Frequency</th>
                    <th scope="col" className="r">Average</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(d.history).map(([k, h]) => (
                    <tr key={k}>
                      <th scope="row">{k === 'season' ? 'Season' : `Last ${k.slice(1)}`}</th>
                      <td className="r">{h.n}</td>
                      <td className="r">{h.over}</td>
                      <td className="r">{pct(h.frequency_over, 0)}</td>
                      <td className="r">{h.average.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Note>A historical frequency over games he played. Descriptive, not a probability.</Note>
            </>
          )}

          <h3 className="label mk-d-h">GIZER research</h3>
          {r ? (
            <p className="mk-d-p">
              {r.model_ready ? 'A validated model covers this market family.' : 'No validated model covers this market family, so GIZER publishes no estimate for it.'}{' '}
              {r.projection && (
                <>
                  The stat projection is <span className="model">{r.projection.mean}</span> (range {r.projection.p10} to {r.projection.p90}).{' '}
                </>
              )}
              {r.selections?.[0] && <>Both sides are classed {r.selections[0].classification}: {r.selections[0].rejection_reasons[0]}</>}
            </p>
          ) : (
            <p className="mk-d-p">No research record is attached to this contract in the snapshot.</p>
          )}
          <Note>The model probability is independent of the market price. The price is never a model input.</Note>

          <h3 className="label mk-d-h">Contract rules</h3>
          <p className="mk-d-p">{d.rules.primary}</p>
          <details className="trail mk-rules">
            <summary>Full rule text and settlement</summary>
            {d.rules.secondary?.split('\n\n').map((t) => (
              <p key={t}>{t}</p>
            ))}
            {d.rules.settlement_note && <p>{d.rules.settlement_note}</p>}
          </details>

          {d.timeline.length > 0 && (
            <>
              <h3 className="label mk-d-h">Recorded around these observations</h3>
              <ul className="mk-timeline">
                {d.timeline.slice(0, 5).map((t) => (
                  <li key={t.at + t.text}>
                    <span className="muted tnum">{etHM.format(new Date(t.at))}</span>
                    <span>{t.text}</span>
                  </li>
                ))}
              </ul>
              <Note>Shown for context. A price change does not show why the market moved.</Note>
            </>
          )}
        </>
      ) : (
        <div className="mk-nohist">
          <p className="mk-d-p">
            <strong>No observation series for this contract in the snapshot.</strong> {m.observations} observations are stored; only four contracts were exported with their history. First observed {cents(m.first_observed)} at {stampET(m.first_observed_at)}, last observed {stampET(m.last_observed_at as string)}.
          </p>
        </div>
      )}
    </div>
  )
}

export default function Markets() {
  const { portal } = useShell()
  const [params] = useSearchParams()
  const [kind, setKind] = useState<string>('all')
  const [game, setGame] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'volume', dir: 1 })
  const [state, setState] = useState(params.get('state') ?? 'data')
  const [sel, setSel] = useState(params.get('t') ?? data.kalshi.detail_tickers.game ?? list.items[0].ticker)
  const [sheet, setSheet] = useState(false)
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return list.items
      .filter((m) => (kind === 'all' || m.kind === kind) && (game === 'all' || m.game_id === game) && (!n || `${m.title} ${m.game_label}`.toLowerCase().includes(n)))
      .sort((a, b) => ((b[sort.key] ?? -1) - (a[sort.key] ?? -1)) * sort.dir)
  }, [kind, game, q, sort])
  const selected = list.items.find((m) => m.ticker === sel) ?? list.items[0]
  const view = state !== 'data' ? state : rows.length === 0 ? 'empty' : 'data'
  const clear = () => { setKind('all'); setGame('all'); setQ(''); setState('data') }
  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th scope="col" className="r" aria-sort={sort.key === k ? (sort.dir === 1 ? 'descending' : 'ascending') : undefined}>
      <button type="button" className={clsx('th-sort', sort.key === k && 'is-sorted')} onClick={() => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 }))}>
        {label}
        {sort.key === k && (sort.dir === 1 ? <ArrowDown size={13} aria-hidden="true" /> : <ArrowUp size={13} aria-hidden="true" />)}
      </button>
    </th>
  )
  const pick = (t: string) => {
    setSel(t)
    if (window.matchMedia('(max-width: 1099px)').matches) setSheet(true)
  }
  return (
    <div className="page markets">
      <div className="page-head">
        <div>
          <h1 className="h-page">Market watch</h1>
          <p className="page-sub">Kalshi contracts for the {tinyDate(list.date)} slate. Observed prices, read-only.</p>
        </div>
        <p className="sync">
          <Slot>Stale</Slot>
          <span>
            Last sync {stampET(list.sync.last_sync_at)}, about {Math.round(list.sync.age_minutes / 60)} hours old when this snapshot was exported. Polled about every {list.sync.poll_minutes} minutes while games are upcoming. Not real-time.
          </span>
        </p>
      </div>

      <div className="filters">
        <div className="seg" role="group" aria-label="Contract type">
          {KINDS.map(([k, l]) => (
            <button key={k} type="button" className={clsx(kind === k && 'is-on')} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="sr">Game</span>
          <select value={game} onChange={(e) => setGame(e.target.value)}>
            <option value="all">All nine games</option>
            {list.events.map((e) => (
              <option key={e.game_id} value={e.game_id}>{e.label}</option>
            ))}
          </select>
        </label>
        <label className="field field-grow">
          <span className="sr">Filter contracts</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by player, team or contract" />
        </label>
        <p className="filters-count">
          {view === 'data' ? rows.length : 0} of {list.items.length} shown. The snapshot holds the {list.items.length} highest-volume of {list.total.toLocaleString('en-US')} contracts.
        </p>
      </div>

      <div className="mk">
        <div className="mk-table">
          <div className="tscroll" tabIndex={0} role="region" aria-label="Contracts, scrolls sideways">
            <table className="stat mk-t">
              <thead>
                <tr>
                  <th scope="col" className="sticky-col">Contract</th>
                  <Th k="threshold" label="Line" />
                  <Th k="price" label="Price" />
                  <th scope="col" className="r">First obs.</th>
                  <Th k="change_since_first" label="Change" />
                  <Th k="volume" label="Volume" />
                  <Th k="spread" label="Spread" />
                  <th scope="col" className="r">Last observed</th>
                </tr>
              </thead>
              {view === 'data' && (
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.ticker} className={clsx('mk-row', m.ticker === sel && 'is-selected')} onClick={() => pick(m.ticker)}>
                      <th scope="row" className="sticky-col">
                        <button type="button" className="mk-name" aria-pressed={m.ticker === sel} onClick={(e) => { e.stopPropagation(); pick(m.ticker) }}>
                          <span className="mk-title">{m.title.replace('Full Game: ', '')}</span>
                          <span className="mk-game">{m.game_label}</span>
                        </button>
                      </th>
                      <td className="r">{m.threshold ?? NA}</td>
                      <td className="r strong">{cents(m.price)}</td>
                      <td className="r">{cents(m.first_observed)}</td>
                      <td className="r">
                        <Delta v={m.change_since_first} />
                      </td>
                      <td className="r">{compact(m.volume)}</td>
                      <td className="r">{cents(m.spread)}</td>
                      <td className="r muted">{m.last_observed_at ? etHM.format(new Date(m.last_observed_at as string)) : NA}</td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
          {view === 'loading' && (
            <div className="mk-state" role="status">
              <span className="mk-progress" aria-hidden="true" />
              <h2 className="h-sub">Loading contracts</h2>
              <p>Asking the server for the {tinyDate(list.date)} slate. The header and filters stay usable, and the last sync time above stays visible.</p>
              <p className="muted">If this takes longer than 8 seconds the page stops waiting and offers a retry. No placeholder rows.</p>
            </div>
          )}
          {view === 'empty' && (
            <div className="mk-state">
              <h2 className="h-sub">No contracts match</h2>
              <p>Nothing in the {list.items.length} stored contracts fits these filters.</p>
              <button type="button" className="btn btn-line" onClick={clear}>
                Clear filters
              </button>
            </div>
          )}
          {view === 'error' && (
            <div className="mk-state" role="alert">
              <h2 className="h-sub">The market sync did not answer</h2>
              <p>
                Prices are not shown, because showing old prices as current would mislead. The last successful sync was {stampET(list.sync.last_sync_at)}.
              </p>
              <button type="button" className="btn btn-line" onClick={() => setState('data')}>
                <RefreshCw size={16} aria-hidden="true" /> Try again
              </button>
            </div>
          )}
          {view === 'data' && (
            <Note>
              {list.notes.join(' ')} Prices are in cents per contract that pays 100.
            </Note>
          )}
        </div>
        <aside className="mk-side" aria-label="Contract detail">
          {view === 'data' ? <Detail m={selected} /> : <p className="muted mk-side-empty">Select a contract to see its observations and rules.</p>}
        </aside>
      </div>

      <div className="designstates">
        <span className="label">Design states</span>
        <div className="seg seg-s" role="group" aria-label="Preview a page state">
          {['data', 'loading', 'empty', 'error'].map((s) => (
            <button key={s} type="button" className={clsx(state === s && 'is-on')} aria-pressed={state === s} onClick={() => setState(s)}>
              {s === 'data' ? 'Snapshot data' : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="muted">A prototype control for reviewing the other states. Not part of the product.</span>
      </div>

      <Dialog.Root open={sheet} onOpenChange={setSheet}>
        <Dialog.Portal container={portal}>
          <Dialog.Overlay className="overlay overlay-light" />
          <Dialog.Content className="sheet sheet-wide" aria-describedby={undefined}>
            <header className="sheet-head">
              <Dialog.Title className="sheet-title">Contract</Dialog.Title>
              <Dialog.Close className="icon-btn" aria-label="Close contract detail">
                <X size={20} />
              </Dialog.Close>
            </header>
            <div className="sheet-scroll">{sheet && <Detail m={selected} />}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
