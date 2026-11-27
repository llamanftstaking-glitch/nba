// Research pick rows: probability first, drawn on a ruled scale. Paper research only.
import type { Selection } from '../../data'
import { ProbScale, american, pct } from './lib'

export function splitLabel(s: { market_label: string; subject_name: string; subject_type: string }) {
  if (s.subject_type === 'player' && s.market_label.startsWith(s.subject_name)) {
    return { who: s.subject_name, what: s.market_label.slice(s.subject_name.length).trim() }
  }
  return { who: s.market_label, what: s.subject_type === 'player' ? '' : 'Game contract' }
}

export const byProb = (a: Selection, b: Selection) => (b.prob ?? 0) - (a.prob ?? 0)

export function PickList({ items, showGame = true, numbered = false, selectedId, onSelect }: { items: Selection[]; showGame?: boolean; numbered?: boolean; selectedId?: number; onSelect?: (id: number) => void }) {
  return (
    <div className="picks" role="table" aria-label="Research picks">
      <div className="picks-head" role="row">
        <span role="columnheader" className="label">Contract</span>
        <span role="columnheader" className="label picks-est">Model estimate</span>
        <span role="columnheader" className="label picks-scale-h" aria-label="Scale from 0 to 100 percent">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </span>
        <span role="columnheader" className="label r">Price</span>
        <span role="columnheader" className="label r">Break-even</span>
        <span role="columnheader" className="label r picks-ev">Evidence</span>
      </div>
      {items.map((s, i) => {
        const l = splitLabel(s)
        return (
          <div className={'pick' + (selectedId === s.id ? ' is-selected' : '') + (onSelect ? ' is-pickable' : '')} role="row" key={s.id} onClick={onSelect ? () => onSelect(s.id) : undefined}>
            <span role="cell" className="pick-what">
              {numbered && <span className="pick-n">{i + 1}</span>}
              <span>
                {onSelect ? (
                  <button type="button" className="pick-who pick-btn" aria-pressed={selectedId === s.id} onClick={() => onSelect(s.id)}>
                    {l.who}
                  </button>
                ) : (
                  <span className="pick-who">{l.who}</span>
                )}
                <span className="pick-line">
                  {l.what}
                  {l.what && showGame ? ', ' : ''}
                  {showGame ? s.game_label : ''}
                </span>
              </span>
            </span>
            <span role="cell" className="pick-prob">
              <span className="pick-prob-n">{pct(s.prob, 1)}</span>
              <span className="pick-int">
                {s.prob_low != null && s.prob_high != null ? `${pct(Math.min(s.prob_low, s.prob ?? 1), 0)}–${pct(Math.max(s.prob_high, s.prob ?? 0), 0)}` : 'no interval'}
              </span>
            </span>
            <span role="cell" className="pick-scale">
              <ProbScale prob={s.prob} low={s.prob_low} high={s.prob_high} breakeven={s.breakeven} />
            </span>
            <span role="cell" className="pick-num r">
              <span className="cell-label">Price</span>
              {american(s.price_american)}
              <span className="pick-sub">{s.book}</span>
            </span>
            <span role="cell" className="pick-num r">
              <span className="cell-label">Break-even</span>
              {pct(s.breakeven, 1)}
            </span>
            <span role="cell" className="pick-num r picks-ev">
              <span className="cell-label">Evidence</span>
              {s.evidence_score ?? '—'}
              <span className="pick-sub">n {s.sample_size ?? '—'}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function PickKey() {
  return (
    <p className="pick-key">
      <span className="key-item">
        <span className="key-tick" aria-hidden="true" /> model estimate
      </span>
      <span className="key-item">
        <span className="key-band" aria-hidden="true" /> its interval
      </span>
      <span className="key-item">
        <span className="key-be" aria-hidden="true" /> price break-even
      </span>
      <span className="key-note">A model estimate, not a hit rate. Paper research only.</span>
    </p>
  )
}
