// Concept A · Courtside. Owns every route under /a/.
import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { CalendarDays, LineChart, Search, Sparkles, Trophy, Users, X, NotebookText } from 'lucide-react'
import clsx from 'clsx'
import '@fontsource-variable/archivo/wdth.css'
import './styles.css'
import './pages.css'
import { data, featuredPlayer } from '../../data'
import { Ctx, useShell, type ShellCtx } from './shell'
import { Headshot, SNAPSHOT, TeamMark, featuredId, shortDate } from './lib'
import Today from './pages/Today'
import Scores from './pages/Scores'
import Game from './pages/Game'
import Player from './pages/Player'
import Markets from './pages/Markets'
import Research from './pages/Research'
import Jarvis, { AssistantBody } from './pages/Jarvis'

const NAV = [
  { to: '/a/', label: 'Today', icon: CalendarDays, match: (p: string) => p === '/a' || p === '/a/' },
  { to: '/a/scores', label: 'Games', icon: Trophy, match: (p: string) => p.startsWith('/a/scores') || p.startsWith('/a/game') },
  { to: '/a/player', label: 'Players', icon: Users, match: (p: string) => p.startsWith('/a/player') },
  { to: '/a/markets', label: 'Markets', icon: LineChart, match: (p: string) => p.startsWith('/a/markets') },
  { to: '/a/research', label: 'Research', icon: NotebookText, match: (p: string) => p.startsWith('/a/research') },
]


function contextFor(path: string): { label: string; detail: string } {
  if (path.startsWith('/a/game')) return { label: 'CLE @ NYK', detail: 'Final, Nov 25' }
  if (path.startsWith('/a/player')) return { label: featuredPlayer.profile.player.name, detail: 'Player profile' }
  if (path.startsWith('/a/markets')) return { label: 'Kalshi market watch', detail: 'Read-only observations' }
  if (path.startsWith('/a/research')) return { label: `Edition v${data.edition.latest?.version}`, detail: 'Research workspace' }
  if (path.startsWith('/a/scores')) return { label: 'Scoreboard', detail: shortDate(SNAPSHOT) }
  return { label: "Today's slate", detail: shortDate(SNAPSHOT) }
}

// ---- search -----------------------------------------------------------------------------------
type Hit = { key: string; group: string; title: string; sub: string; to: string | null; abbr?: string; player?: { headshot_url?: string | null } }

function useHits(q: string): Hit[] {
  return useMemo(() => {
    const needle = q.trim().toLowerCase()
    const featured = new Map(data.featured_players.map((p, i) => [p.player_id, i]))
    const players: Hit[] = [
      ...data.featured_players.map((p) => ({ id: p.player_id, name: p.profile.player.name, team_abbr: p.profile.player.team_abbr, headshot_url: p.profile.player.headshot_url })),
      ...data.players_index.items.filter((p) => !featured.has(p.id)),
    ].map((p) => ({
      key: `p${p.id}`,
      group: 'Players',
      title: p.name ?? '',
      sub: featured.has(p.id as number) ? `${p.team_abbr}, full profile` : `${p.team_abbr}, profile not in this snapshot`,
      to: featured.has(p.id as number) ? `/a/player?p=${featured.get(p.id as number)}` : null,
      player: p,
    }))
    const games: Hit[] = data.scoreboard.games.map((g) => ({
      key: g.game_id,
      group: 'Games',
      title: `${g.away.name} at ${g.home.name}`,
      sub: `${g.status_label}, ${g.away.score}–${g.home.score}`,
      to: g.game_id === featuredId ? '/a/game' : '/a/scores',
      abbr: g.home.abbr,
    }))
    const teams: Hit[] = data.teams.items.map((t) => ({ key: `t${t.id}`, group: 'Teams', title: t.name, sub: `${t.wins}–${t.losses}, team page not in this snapshot`, to: null, abbr: t.abbr }))
    const contracts: Hit[] = data.kalshi.list.items.map((m) => ({ key: m.ticker, group: 'Kalshi contracts', title: m.title, sub: `${m.game_label ?? ''}, read-only`, to: `/a/markets?t=${encodeURIComponent(m.ticker)}` }))
    const all = [...players, ...games, ...teams, ...contracts]
    if (!needle) return [...players.slice(0, 3), ...games.slice(0, 3), ...contracts.slice(0, 2)]
    return all.filter((h) => `${h.title} ${h.sub} ${h.abbr ?? ''}`.toLowerCase().includes(needle)).slice(0, 12)
  }, [q])
}

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { portal } = useShell()
  const [q, setQ] = useState('')
  const hits = useHits(q)
  const nav = useNavigate()
  const groups = [...new Set(hits.map((h) => h.group))]
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQ('') }}>
      <Dialog.Portal container={portal}>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="search-dialog" aria-describedby={undefined}>
          <Dialog.Title className="sr">Search</Dialog.Title>
          <div className="search-field">
            <Search size={20} aria-hidden="true" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Players, teams, games, contracts" aria-label="Search players, teams, games and contracts" />
            <Dialog.Close className="icon-btn" aria-label="Close search">
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className="search-results">
            {hits.length === 0 && (
              <p className="search-empty">
                Nothing in the snapshot matches &ldquo;{q}&rdquo;. It holds 9 games, 30 teams, {data.players_index.items.length} of {data.players_index.total} players and {data.kalshi.list.items.length} of {data.kalshi.list.total} contracts.
              </p>
            )}
            {groups.map((g) => (
              <div key={g} className="search-group">
                <h3 className="label">{g}</h3>
                <ul>
                  {hits.filter((h) => h.group === g).map((h) => (
                    <li key={h.key}>
                      <button type="button" className="search-hit" disabled={!h.to} onClick={() => { if (h.to) { nav(h.to); onOpenChange(false) } }}>
                        {h.player ? <Headshot player={h.player} name={h.title} size={36} /> : h.abbr ? <TeamMark abbr={h.abbr} size={32} /> : <span className="search-glyph" aria-hidden="true">K</span>}
                        <span className="search-hit-text">
                          <span className="search-hit-title">{h.title}</span>
                          <span className="search-hit-sub">{h.sub}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ---- assistant sheet ----------------------------------------------------------------------------
function AssistantSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { portal } = useShell()
  const { pathname } = useLocation()
  const ctx = contextFor(pathname)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portal}>
        <Dialog.Overlay className="overlay overlay-light" />
        <Dialog.Content className="sheet" aria-describedby={undefined} onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector('textarea')?.focus({ preventScroll: true }) }}>
          <header className="sheet-head">
            <Dialog.Title className="sheet-title">JARVIS</Dialog.Title>
            <Link to="/a/jarvis" className="link" onClick={() => onOpenChange(false)}>
              Open full view
            </Link>
            <Dialog.Close className="icon-btn" aria-label="Close assistant">
              <X size={20} />
            </Dialog.Close>
          </header>
          <AssistantBody variant="sheet" context={ctx} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ---- shell ----------------------------------------------------------------------------------------
export default function ConceptA() {
  const [portal, setPortal] = useState<HTMLElement | null>(null)
  const [params] = useSearchParams()
  const [assistant, setAssistant] = useState(params.get('panel') === 'jarvis')
  const [search, setSearch] = useState(params.get('panel') === 'search')
  const { pathname } = useLocation()
  const onJarvisPage = pathname.startsWith('/a/jarvis')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(el.tagName)) {
        e.preventDefault()
        setSearch(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const shell = useMemo<ShellCtx>(() => ({ portal, openAssistant: () => setAssistant(true), openSearch: () => setSearch(true) }), [portal])

  return (
    <Ctx.Provider value={shell}>
      <div className="concept-a a-root">
        <a className="skip" href="#a-main">
          Skip to content
        </a>
        <header className="topbar">
          <div className="topbar-in">
            <Link to="/a/" className="wordmark" aria-label="GIZER NBA, Today">
              GIZER<span>NBA</span>
            </Link>
            <nav className="primary" aria-label="Primary">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/a/'} className={() => clsx('primary-link', n.match(pathname) && 'is-current')} aria-current={n.match(pathname) ? 'page' : undefined}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="topbar-tools">
              <button type="button" className="search-trigger" onClick={() => setSearch(true)}>
                <Search size={18} aria-hidden="true" />
                <span className="search-trigger-text">Search players, teams, contracts</span>
                <kbd aria-hidden="true">/</kbd>
                <span className="sr">Open search</span>
              </button>
              {onJarvisPage ? (
                <span className="btn btn-ink is-here" aria-current="page">
                  <Sparkles size={16} aria-hidden="true" />
                  <span>JARVIS</span>
                </span>
              ) : (
                <button type="button" className="btn btn-ink" onClick={() => setAssistant(true)}>
                  <Sparkles size={16} aria-hidden="true" />
                  <span>
                    Ask <span className="hide-s">JARVIS</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main id="a-main" className="main" key={pathname}>
          <Routes>
            <Route index element={<Today />} />
            <Route path="scores" element={<Scores />} />
            <Route path="game" element={<Game />} />
            <Route path="player" element={<Player />} />
            <Route path="markets" element={<Markets />} />
            <Route path="research" element={<Research />} />
            <Route path="jarvis" element={<Jarvis />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        <footer className="foot">
          <div className="foot-in">
            <p>
              Design prototype on a stored snapshot of {shortDate(SNAPSHOT)}. Scores and prices are polled observations, not a real-time feed. Research, simulation and paper testing only.
            </p>
            <p>
              Team marks and player photos are third-party assets shown for internal review. <Link to="/" className="link">All concepts</Link>
            </p>
          </div>
        </footer>

        <nav className="tabbar" aria-label="Primary">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={clsx('tab', n.match(pathname) && 'is-current')} aria-current={n.match(pathname) ? 'page' : undefined}>
              <n.icon size={22} aria-hidden="true" strokeWidth={n.match(pathname) ? 2.4 : 1.8} />
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>

        <SearchDialog open={search} onOpenChange={setSearch} />
        <AssistantSheet open={assistant} onOpenChange={setAssistant} />
        <div ref={setPortal} />
      </div>
    </Ctx.Provider>
  )
}

function NotFound() {
  return (
    <div className="page">
      <h1 className="h-page">Nothing at this address</h1>
      <p className="lede">
        The prototype has seven pages. <Link className="link" to="/a/">Go to Today</Link>
      </p>
    </div>
  )
}
