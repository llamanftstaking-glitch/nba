/** The seven page paths every concept must serve, relative to its prefix (/a, /b, /c). */
export const REQUIRED_PAGES = [
  { path: '', name: 'dashboard', title: 'Main dashboard' },
  { path: 'scores', name: 'scores', title: 'Live NBA scoreboard' },
  { path: 'game', name: 'game', title: 'Game matchup (featured game)' },
  { path: 'player', name: 'player', title: 'Player intelligence (first featured player)' },
  { path: 'markets', name: 'markets', title: 'Kalshi Market Watch' },
  { path: 'research', name: 'research', title: 'Research workspace (top picks, parlays, edition)' },
  { path: 'jarvis', name: 'jarvis', title: 'JARVIS assistant' },
] as const
