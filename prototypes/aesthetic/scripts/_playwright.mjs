// Loads the globally installed Playwright (it is not a dependency of this app on purpose).
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'

const require = createRequire(import.meta.url)

export function loadPlaywright() {
  const candidates = ['playwright', '/opt/node-tools/node_modules/playwright']
  try {
    candidates.push(`${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright`)
  } catch {
    /* npm not available: fall through */
  }
  for (const c of candidates) {
    try {
      return require(c)
    } catch {
      /* try the next location */
    }
  }
  throw new Error(`Playwright not found. Tried: ${candidates.join(', ')}`)
}

export const PAGES = [
  { path: '', name: 'dashboard' },
  { path: 'scores', name: 'scores' },
  { path: 'game', name: 'game' },
  { path: 'player', name: 'player' },
  { path: 'markets', name: 'markets' },
  { path: 'research', name: 'research' },
  { path: 'jarvis', name: 'jarvis' },
]

export const CONCEPTS = ['a', 'b', 'c']
