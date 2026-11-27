import { Link, Route, Routes } from 'react-router-dom'
import { data } from '../../data'
import './styles.css'

// PLACEHOLDER for concept C (JARVIS-First). Replace everything in this folder.
// This component owns every route under /c/. Keep the seven paths below.

const PAGES = [
  ['', 'dashboard'],
  ['scores', 'scores'],
  ['game', 'game'],
  ['player', 'player'],
  ['markets', 'markets'],
  ['research', 'research'],
  ['jarvis', 'jarvis'],
] as const

function Placeholder({ page }: { page: string }) {
  return (
    <div className="placeholder">
      <p>
        Concept C placeholder · page: <strong>{page}</strong> · snapshot {data.meta.snapshot_date}
      </p>
      <nav>
        {PAGES.map(([path, name]) => (
          <Link key={name} to={`/c/${path}`}>
            {name}
          </Link>
        ))}
        <Link to="/">index</Link>
      </nav>
    </div>
  )
}

export default function ConceptC() {
  return (
    <div className="concept-c">
      <Routes>
        <Route index element={<Placeholder page="dashboard" />} />
        {PAGES.slice(1).map(([path, name]) => (
          <Route key={name} path={path} element={<Placeholder page={name} />} />
        ))}
        <Route path="*" element={<Placeholder page="not found" />} />
      </Routes>
    </div>
  )
}
