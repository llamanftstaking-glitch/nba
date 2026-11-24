"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronUp, Plus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { ClassificationBadge } from "@/components/classification-badge";
import { PlayerAvatar } from "@/components/player-avatar";
import { PlayerHistory } from "@/components/player-history";
import { ProbabilityDisplay } from "@/components/prob";
import { AvailabilityStatus, FreshnessIndicator, LineupStatusLabel, OriginTag } from "@/components/status";
import { StatusDot } from "@/components/ui/badge";
import { Button, linkButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { NA, Val } from "@/components/ui/na";
import { Label } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Sheet } from "@/components/ui/sheet";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { fmtAmerican, fmtDateTimeET, fmtLine, fmtNum, fmtTimeET, ORIGIN_LABELS, propMarketName, titleCase } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import type { ManualEntry, ManualEntryBody, PropMarketInfo, PropRow as Prop } from "@/lib/types";

export const propKey = (p: Prop) => `${p.player_id}:${p.market}:${p.game_id}`;

/** "7 of 10 over (L10)" — a count of past games, deliberately not shown as a percentage or styled like a probability. */
export function HistFrequency({ p }: { p: Pick<Prop, "hist_over" | "hist_n" | "line"> }) {
  if (p.line === null || p.hist_over === null || p.hist_n === null) return <NA />;
  return (
    <span className="num whitespace-nowrap text-sm text-soft" title="Descriptive history over the last 10 appearances — not a probability" data-testid="hist-frequency">
      {p.hist_over} of {p.hist_n} over <span className="text-xs text-muted">(L10)</span>
    </span>
  );
}

function Prices({ p }: { p: Prop }) {
  if (p.over_price === null && p.under_price === null) return <span className="text-xs text-muted">No quote</span>;
  return (
    <span className="num whitespace-nowrap text-sm text-ink">
      O <Val v={fmtAmerican(p.over_price)} /> <span className="text-faint">/</span> U <Val v={fmtAmerican(p.under_price)} />
    </span>
  );
}

function Projection({ p }: { p: Prop }) {
  if (p.projection === null) return <NA />;
  return (
    <span className="num whitespace-nowrap text-sm">
      <span className="font-semibold text-ink">{fmtNum(p.projection)}</span>
      {p.p10 !== null && p.p90 !== null && <span className="ml-1 text-xs text-muted">[{fmtNum(p.p10, 0)}–{fmtNum(p.p90, 0)}]</span>}
    </span>
  );
}

function ModelReady({ p }: { p: Prop }) {
  return (
    <StatusDot tone={p.model_ready ? "accent" : "warn"} title={p.model_status}>
      {p.model_ready ? "Ready" : "Not ready"}
    </StatusDot>
  );
}

function Avg({ label, v }: { label: string; v: number | null }) {
  return (
    <span className="flex flex-col">
      <span className="text-2xs font-medium uppercase text-muted">{label}</span>
      <span className="num text-sm text-ink">
        <Val v={fmtNum(v)} />
      </span>
    </span>
  );
}

/** Compact single-line prop row (overview summary, player profile). */
export function PropRow({ p, onOpen, showPlayer = true }: { p: Prop; onOpen?: (p: Prop) => void; showPlayer?: boolean }) {
  const body = (
    <>
      {showPlayer && <PlayerAvatar name={p.player_name} src={p.headshot_url} size={32} />}
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold text-ink sm:truncate">
          {showPlayer ? `${p.player_name} · ` : ""}
          {propMarketName(p.market)} <Val v={fmtLine(p.line)} />
        </span>
        <span className="block truncate text-xs text-muted">
          {p.team_abbr} vs {p.opp_abbr} · <OriginTag origin={p.origin} />
          {p.book ? ` · ${p.book}` : ""}
        </span>
      </span>
      <span className="hidden shrink-0 text-right sm:block">
        <Prices p={p} />
        <span className="block text-xs text-muted">
          L10 <Val v={fmtNum(p.l10)} />
        </span>
      </span>
      <span className="shrink-0 text-right">
        <HistFrequency p={p} />
        <span className="block text-xs text-muted">
          Proj <Projection p={p} />
        </span>
      </span>
      {onOpen && <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />}
    </>
  );
  const cls = "flex w-full min-w-0 items-center gap-3 py-2.5 text-left";
  return onOpen ? (
    <button type="button" className={cn(cls, "rounded-md hover:bg-raised/40")} onClick={() => onOpen(p)} data-testid="prop-row">
      {body}
    </button>
  ) : (
    <div className={cls} data-testid="prop-row">
      {body}
    </div>
  );
}

/** Mobile / tablet: one expandable card per prop market. */
export function PropCard({ p, onOpen }: { p: Prop; onOpen: (p: Prop) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-lg bg-card ring-1 ring-inset ring-line/60" data-testid="prop-card" data-prop={propKey(p)}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-[44px] w-full items-center gap-3 p-3 text-left" data-testid="prop-card-toggle">
        <PlayerAvatar name={p.player_name} src={p.headshot_url} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-ink">{p.player_name}</span>
          <span className="block text-xs text-muted">
            {p.team_abbr} vs {p.opp_abbr} · {propMarketName(p.market)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="num block text-base font-semibold text-ink">
            <Val v={fmtLine(p.line)} />
          </span>
          <Prices p={p} />
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-faint" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0 text-faint" aria-hidden />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-line/50 p-3">
          <div className="grid grid-cols-4 gap-2">
            <Avg label="L5" v={p.l5} />
            <Avg label="L10" v={p.l10} />
            <Avg label="L20" v={p.l20} />
            <Avg label={`Season n=${p.n_games}`} v={p.season_avg} />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div>
              <dt className="text-2xs font-medium uppercase text-muted">History vs line (descriptive)</dt>
              <dd><HistFrequency p={p} /></dd>
            </div>
            <div>
              <dt className="text-2xs font-medium uppercase text-muted">Projection [p10–p90]</dt>
              <dd><Projection p={p} /></dd>
            </div>
            <div>
              <dt className="text-2xs font-medium uppercase text-muted">Proj. minutes</dt>
              <dd className="num text-ink"><Val v={fmtNum(p.proj_min, 0)} /></dd>
            </div>
            <div>
              <dt className="text-2xs font-medium uppercase text-muted">Availability</dt>
              <dd><AvailabilityStatus value={p.availability} /></dd>
            </div>
            <div>
              <dt className="text-2xs font-medium uppercase text-muted">Lineup</dt>
              <dd className="text-ink">
                {p.lineup_role ? titleCase(p.lineup_role) : "—"} · <LineupStatusLabel status={p.lineup_status} short />
              </dd>
            </div>
            <div>
              <dt className="text-2xs font-medium uppercase text-muted">Model</dt>
              <dd><ModelReady p={p} /></dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted">
              <OriginTag origin={p.origin} />
              {p.book ? ` · ${p.book}` : ""} · <FreshnessIndicator at={p.updated_at} />
            </span>
            <Button variant="primary" onClick={() => onOpen(p)} data-testid="prop-open">
              Open research
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

const TH = "px-2 pb-2 text-2xs font-semibold uppercase tracking-wide text-muted";

/** Player-prop market table (xl and up) with PropCards below that width. Row click opens the research drawer. */
export function MarketTable({ rows, onOpen, caption }: { rows: Prop[]; onOpen: (p: Prop) => void; caption: string }) {
  return (
    <>
      <div className="hidden xl:block" data-testid="market-table">
        <table className="w-full table-auto border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={TH}>Player</th>
              <th scope="col" className={TH}>Market · line</th>
              <th scope="col" className={TH}>Over / under · book</th>
              <th scope="col" className={cn(TH, "text-right")}>L5 / L10 / L20</th>
              <th scope="col" className={cn(TH, "text-right")}>Season</th>
              <th scope="col" className={TH} title="Count of past games over today's line — descriptive, not a probability">History vs line</th>
              <th scope="col" className={TH}>Projection [p10–p90]</th>
              <th scope="col" className={TH}>Availability · lineup</th>
              <th scope="col" className={cn(TH, "hidden 2xl:table-cell")}>Model</th>
              <th scope="col" className={cn(TH, "hidden 2xl:table-cell")}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={propKey(p)}
                tabIndex={0}
                role="button"
                aria-label={`Open research for ${p.player_name} ${propMarketName(p.market)}`}
                onClick={() => onOpen(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(p);
                  }
                }}
                className="cursor-pointer border-b border-line/40 align-middle last:border-0 hover:bg-raised/40"
                data-testid="market-row"
                data-prop={propKey(p)}
              >
                <td className="px-2 py-2">
                  <span className="flex items-center gap-2.5">
                    <PlayerAvatar name={p.player_name} src={p.headshot_url} size={32} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-5 text-ink">{p.player_name}</span>
                      <span className="block text-xs text-muted">
                        {p.team_abbr} vs {p.opp_abbr}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span className="text-sm text-soft">{propMarketName(p.market)}</span>{" "}
                  <span className="num text-sm font-semibold text-ink">
                    <Val v={fmtLine(p.line)} />
                  </span>
                </td>
                <td className="px-2 py-2">
                  <Prices p={p} />
                  <span className="block whitespace-nowrap text-xs text-muted">
                    {p.book ? `${p.book} · ` : ""}
                    <OriginTag origin={p.origin} />
                  </span>
                </td>
                <td className="num whitespace-nowrap px-2 py-2 text-right text-sm text-ink">
                  <Val v={fmtNum(p.l5)} /> <span className="text-faint">/</span> <Val v={fmtNum(p.l10)} /> <span className="text-faint">/</span> <Val v={fmtNum(p.l20)} />
                </td>
                <td className="num px-2 py-2 text-right text-sm text-ink">
                  <Val v={fmtNum(p.season_avg)} />
                  <span className="block text-xs text-muted">n={p.n_games}</span>
                </td>
                <td className="px-2 py-2">
                  <HistFrequency p={p} />
                </td>
                <td className="px-2 py-2">
                  <Projection p={p} />
                  <span className="num block whitespace-nowrap text-xs text-muted">
                    <Val v={fmtNum(p.proj_min, 0)} /> proj min
                  </span>
                </td>
                <td className="px-2 py-2">
                  <AvailabilityStatus value={p.availability} />
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
                    {p.lineup_role ? titleCase(p.lineup_role) : "Role —"}
                    <LineupStatusLabel status={p.lineup_status} short className="text-xs text-muted" />
                  </span>
                </td>
                <td className="hidden px-2 py-2 2xl:table-cell">
                  <ModelReady p={p} />
                </td>
                <td className="num hidden whitespace-nowrap px-2 py-2 text-xs text-muted 2xl:table-cell" title={fmtDateTimeET(p.updated_at) ?? undefined}>
                  <Val v={fmtTimeET(p.updated_at)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 xl:hidden">
        {rows.map((p) => (
          <PropCard key={propKey(p)} p={p} onOpen={onOpen} />
        ))}
      </div>
    </>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <Label>{title}</Label>
      {children}
    </section>
  );
}

/** Research drawer for one prop market: history against any threshold, the model projection, and manual entry. */
export function PropDrawer({ p, onClose, onAddManual }: { p: Prop | null; onClose: () => void; onAddManual?: (p: Prop) => void }) {
  return (
    <Sheet open={p !== null} onClose={onClose} side="auto" testId="prop-drawer" title={p ? `${p.player_name} · ${propMarketName(p.market)}` : "Prop research"}>
      {p && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <PlayerAvatar name={p.player_name} src={p.headshot_url} size={48} />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-soft">
                {p.team_abbr} vs {p.opp_abbr} · {p.game_label}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <AvailabilityStatus value={p.availability} />
                <span className="text-xs text-muted">{p.lineup_role ? titleCase(p.lineup_role) : "Role —"}</span>
                <LineupStatusLabel status={p.lineup_status} short />
              </div>
            </div>
            <DLink href={`/players/${p.player_id}`} className={linkButton}>
              Profile
            </DLink>
          </div>

          <Block title="Today's market">
            <div className="grid grid-cols-2 gap-3 rounded-md bg-raised/50 p-3 sm:grid-cols-3">
              <div>
                <div className="text-2xs font-medium uppercase text-muted">Line</div>
                <div className="num text-lg font-semibold text-ink"><Val v={fmtLine(p.line)} /></div>
              </div>
              <div>
                <div className="text-2xs font-medium uppercase text-muted">Over / under</div>
                <Prices p={p} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <div className="text-2xs font-medium uppercase text-muted">Source</div>
                <div className="text-sm text-ink">{p.book ?? "—"}</div>
                <OriginTag origin={p.origin} />
              </div>
            </div>
          </Block>

          <Block title="Historical performance">
            <PlayerHistory playerId={p.player_id} initialStat={p.stat} lines={{ [p.stat]: p.line }} compact />
          </Block>

          <Block title="Model projection">
            <div className="grid grid-cols-3 gap-3 rounded-md bg-raised/50 p-3">
              <div>
                <div className="text-2xs font-medium uppercase text-muted">Projection [p10–p90]</div>
                <Projection p={p} />
              </div>
              <div>
                <div className="text-2xs font-medium uppercase text-muted">Proj. minutes</div>
                <div className="num text-sm text-ink"><Val v={fmtNum(p.proj_min, 0)} /></div>
              </div>
              <div>
                <div className="text-2xs font-medium uppercase text-muted">Model</div>
                <ModelReady p={p} />
                <div className="text-xs text-muted">{titleCase(p.model_status)}</div>
              </div>
            </div>
          </Block>

          <Block title="Research selection">
            {p.selection ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-raised/50 p-3">
                <div>
                  <div className="text-sm font-medium capitalize text-ink">{p.selection.side}</div>
                  <ClassificationBadge value={p.selection.classification} />
                </div>
                <div className="text-right">
                  <div className="text-2xs font-medium uppercase text-muted">Model probability [interval]</div>
                  <ProbabilityDisplay prob={p.selection.prob} low={p.selection.prob_low} high={p.selection.prob_high} />
                </div>
              </div>
            ) : (
              <p className="rounded-md bg-raised/40 px-3 py-2.5 text-sm text-muted">No research selection was evaluated for this market.</p>
            )}
          </Block>

          {onAddManual && (
            <Button onClick={() => onAddManual(p)} data-testid="drawer-add-manual">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add manual market
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

export type ManualPrefill = { game_id?: string; player_id?: number; player_name?: string; market?: string; line?: number | null };

/** Owner-only manual market entry. The origin choice is explicit and its consequences are stated. */
export function ManualEntryForm({ markets, prefill, date, onDone }: { markets: PropMarketInfo[]; prefill?: ManualPrefill; date?: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const games = useQuery({ queryKey: ["games", date ?? "today"], queryFn: () => api.games(date) });
  const [gameId, setGameId] = useState(prefill?.game_id ?? "");
  const [playerText, setPlayerText] = useState(prefill?.player_name ?? "");
  const [playerId, setPlayerId] = useState<string>(prefill?.player_id ? String(prefill.player_id) : "");
  const [market, setMarket] = useState(prefill?.market ?? "");
  const [line, setLine] = useState(prefill?.line != null ? String(prefill.line) : "");
  const [over, setOver] = useState("");
  const [under, setUnder] = useState("");
  const [format, setFormat] = useState<"american" | "decimal">("american");
  const [origin, setOrigin] = useState<"owner_entered" | "hypothetical">("owner_entered");
  const [book, setBook] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const search = useDebounced(playerText.trim(), 300);
  const players = useQuery({ queryKey: ["players", "search", search], queryFn: () => api.players({ q: search, limit: 20 }), enabled: search.length >= 2 });
  const options = players.data?.items ?? [];
  const hasPrefillOption = prefill?.player_id && !options.some((o) => o.id === prefill.player_id);

  const m = useMutation({
    mutationFn: (body: ManualEntryBody) => api.createManualEntry(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["manual-entries"] });
      void qc.invalidateQueries({ queryKey: ["player-props"] });
      setLine("");
      setOver("");
      setUnder("");
      setNote("");
      onDone?.();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const ln = Number(line);
    if (!gameId || !playerId || !market) return setLocalError("Choose a game, a player and a market.");
    if (line.trim() === "" || !Number.isFinite(ln)) return setLocalError("Enter a numeric line.");
    const o = over.trim() === "" ? undefined : Number(over);
    const u = under.trim() === "" ? undefined : Number(under);
    if ((o !== undefined && !Number.isFinite(o)) || (u !== undefined && !Number.isFinite(u))) return setLocalError("Prices must be numbers.");
    if (origin === "owner_entered" && o === undefined && u === undefined) return setLocalError("An owner-entered quote needs at least one price. Use Hypothetical for a line without prices.");
    m.mutate({
      game_id: gameId,
      player_id: Number(playerId),
      market,
      line: ln,
      over_price: o,
      under_price: u,
      odds_format: o !== undefined || u !== undefined ? format : undefined,
      origin,
      book: book.trim() || undefined,
      source_ref: sourceRef.trim() || undefined,
      note: note.trim() || undefined,
    });
  }

  const apiError = m.error instanceof ApiError ? m.error.message : m.error ? "Request failed." : null;

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="manual-form">
      <p className="rounded-md bg-warn/10 px-3 py-2 text-sm text-soft ring-1 ring-inset ring-warn/30">
        Owner-entered and hypothetical entries are <span className="font-semibold text-warn">not independently verified quotes</span>. They are stored with their origin and shown with that label everywhere they appear.
      </p>
      <fieldset>
        <legend className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Origin</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["owner_entered", "Owner-entered", "A price you observed yourself at a sportsbook."],
              ["hypothetical", "Hypothetical", "A what-if line for research. Prices are optional."],
            ] as const
          ).map(([value, label, help]) => (
            <label key={value} className={cn("flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-md px-3 py-2 ring-1 ring-inset", origin === value ? "bg-accent/10 ring-accent/50" : "bg-raised/50 ring-line")}>
              <input type="radio" name="origin" value={value} checked={origin === value} onChange={() => setOrigin(value)} className="mt-1 accent-[rgb(0,229,160)]" />
              <span>
                <span className="block text-sm font-semibold text-ink">{label}</span>
                <span className="block text-xs text-muted">{help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Game" className="col-span-2">
          <Select value={gameId} onChange={(e) => setGameId(e.target.value)} name="game_id">
            <option value="">Select a game</option>
            {(games.data?.games ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Player search">
          <Input type="search" placeholder="Type 2+ letters" value={playerText} onChange={(e) => setPlayerText(e.target.value)} name="player_search" />
        </Field>
        <Field label="Player">
          <Select value={playerId} onChange={(e) => setPlayerId(e.target.value)} name="player_id">
            <option value="">{players.isFetching ? "Searching…" : "Select a player"}</option>
            {hasPrefillOption && <option value={String(prefill?.player_id)}>{prefill?.player_name}</option>}
            {options.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.name}
                {o.team_abbr ? ` · ${o.team_abbr}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Market">
          <Select value={market} onChange={(e) => setMarket(e.target.value)} name="market">
            <option value="">Select a market</option>
            {markets.map((mk) => (
              <option key={mk.key} value={mk.key}>
                {mk.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Line">
          <Input type="number" step="0.5" inputMode="decimal" value={line} onChange={(e) => setLine(e.target.value)} name="line" />
        </Field>
        <Field label="Over price">
          <Input type="number" step="any" inputMode="decimal" value={over} onChange={(e) => setOver(e.target.value)} name="over_price" placeholder={origin === "hypothetical" ? "optional" : ""} />
        </Field>
        <Field label="Under price">
          <Input type="number" step="any" inputMode="decimal" value={under} onChange={(e) => setUnder(e.target.value)} name="under_price" placeholder={origin === "hypothetical" ? "optional" : ""} />
        </Field>
        <Field label="Odds format">
          <Select value={format} onChange={(e) => setFormat(e.target.value as "american" | "decimal")} name="odds_format">
            <option value="american">American (-110)</option>
            <option value="decimal">Decimal (1.91)</option>
          </Select>
        </Field>
        <Field label="Book">
          <Input value={book} onChange={(e) => setBook(e.target.value)} name="book" placeholder="optional" />
        </Field>
        <Field label="Source reference" className="col-span-2">
          <Input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} name="source_ref" placeholder="optional — where you saw it" />
        </Field>
        <Field label="Note" className="col-span-2 md:col-span-4">
          <Input value={note} onChange={(e) => setNote(e.target.value)} name="note" placeholder="optional" />
        </Field>
      </div>
      {(localError || apiError) && (
        <p role="alert" className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad ring-1 ring-inset ring-bad/40">
          {localError ?? apiError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="md" disabled={m.isPending} data-testid="manual-submit">
          {m.isPending ? "Saving…" : "Save manual market"}
        </Button>
        {m.isSuccess && (
          <span role="status" className="text-sm text-accent" data-testid="manual-ok">
            Saved as {ORIGIN_LABELS[m.data.entry.origin]} entry #{m.data.entry.id}
          </span>
        )}
      </div>
    </form>
  );
}

export function ManualEntries({ items }: { items: ManualEntry[] }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (id: number) => api.withdrawManualEntry(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["manual-entries"] });
      void qc.invalidateQueries({ queryKey: ["player-props"] });
    },
  });
  if (items.length === 0) return <EmptyState title="No manual market entries for this date." />;
  return (
    <ul className="divide-y divide-line/40" data-testid="manual-entries">
      {items.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5" data-testid="manual-entry" data-withdrawn={e.withdrawn ? "1" : "0"}>
          <div className="min-w-0">
            <div className={cn("text-sm font-semibold", e.withdrawn ? "text-muted line-through" : "text-ink")}>
              {e.player_name} · {propMarketName(e.market)} {fmtLine(e.line)}
            </div>
            <div className="num text-xs text-muted">
              {e.game_label} · O <Val v={e.over_price} /> / U <Val v={e.under_price} />
              {e.book ? ` · ${e.book}` : ""} · <OriginTag origin={e.origin} /> · by {e.created_by} · {fmtDateTimeET(e.created_at) ?? "—"}
            </div>
            {e.note && <div className="text-xs text-muted">{e.note}</div>}
          </div>
          {e.withdrawn ? (
            <StatusDot tone="neutral">Withdrawn</StatusDot>
          ) : (
            <Button variant="danger" disabled={m.isPending} onClick={() => m.mutate(e.id)} data-testid="manual-withdraw">
              Withdraw
            </Button>
          )}
        </li>
      ))}
      {m.isError && (
        <li role="alert" className="py-2 text-sm text-bad">
          {m.error instanceof ApiError ? m.error.message : "Withdraw failed."}
        </li>
      )}
    </ul>
  );
}
