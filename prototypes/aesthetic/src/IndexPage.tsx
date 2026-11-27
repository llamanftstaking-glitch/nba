import { Link } from 'react-router-dom'
import { data } from './data'
import { REQUIRED_PAGES } from './pages'
import './index-page.css'

const CONCEPTS = [
  { key: 'a', name: 'Concept A', label: 'Premium Sports Editorial' },
  { key: 'b', name: 'Concept B', label: 'Professional Intelligence Terminal' },
  { key: 'c', name: 'Concept C', label: 'JARVIS-First' },
] as const

/** Neutral index. Not part of any concept and not a design. */
export default function IndexPage() {
  return (
    <div className="proto-index">
      <main>
        <h1>GIZER NBA · Project Aesthetic</h1>
        <p className="notice">
          Everything here is a <strong>design prototype</strong> running on a{' '}
          <strong>data snapshot</strong> for {data.meta.snapshot_date}. It is not live, not connected to the
          production system, and not for production use. {data.meta.note}
        </p>
        <ul>
          {CONCEPTS.map((c) => (
            <li key={c.key}>
              <Link className="concept-link" to={`/${c.key}/`}>
                {c.name}: {c.label}
              </Link>
              <div className="pages">
                {REQUIRED_PAGES.map((p) => (
                  <Link key={p.name} to={`/${c.key}/${p.path}`}>
                    {p.name}
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="meta">
          Snapshot exported {data.meta.exported_at}. Team logos and player headshots are third-party assets
          used for an internal prototype only.
        </p>
      </main>
    </div>
  )
}
