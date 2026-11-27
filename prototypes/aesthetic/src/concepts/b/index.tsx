import { Link, Route, Routes } from 'react-router-dom'
import { data } from '../../data'
import './styles.css'

// PLACEHOLDER for concept B (Professional Intelligence Terminal). Replace everything in this folder.
// This component owns every route under /b/. Keep the seven paths below.

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
        Concept B placeholder · page: <strong>{page}</strong> · snapshot {data.meta.snapshot_date}
      </p>
      <nav>
        {PAGES.map(([path, name]) => (
          <Link key={name} to={`/b/${path}`}>
            {name}
          </Link>
        ))}
        <Link to="/">index</Link>
      </nav>
    </div>
  )
}

export default function ConceptB() {
  return (
    <div className="concept-b">
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
