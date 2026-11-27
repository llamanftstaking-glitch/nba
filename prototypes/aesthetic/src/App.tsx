import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import IndexPage from './IndexPage'

// Each concept is its own lazy chunk and owns everything under its prefix.
// Shared shell: do not edit from inside a concept.
const ConceptA = lazy(() => import('./concepts/a'))
const ConceptB = lazy(() => import('./concepts/b'))
const ConceptC = lazy(() => import('./concepts/c'))

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/a/*" element={<ConceptA />} />
        <Route path="/b/*" element={<ConceptB />} />
        <Route path="/c/*" element={<ConceptC />} />
        <Route path="*" element={<IndexPage />} />
      </Routes>
    </Suspense>
  )
}
