"""Ingestion: normalise provider records into the warehouse. Idempotent; snapshots are append-only."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select

from .config import ET, get_settings
from .db import (Game, InjurySnapshot, OddsSnapshot, Player, PlayerAbsence, PlayerBox, ProviderCall, Season, Team,
                 session_scope, utcnow)
from .providers import (TEAMS, EspnProvider, GameRec, OddsApiProvider, OddsRec, PbpStatsProvider, ProviderDisabled,
                        ProviderError, name_key)


def today_et() -> date:
    return datetime.now(ET).date()


def seed_reference():
    with session_scope() as s:
        for tid, abbr, name, espn in TEAMS:
            if not s.get(Team, tid):
                s.add(Team(id=tid, abbr=abbr, name=name, espn_abbr=espn,
                           logo_url=f"https://a.espncdn.com/i/teamlogos/nba/500/{espn.lower()}.png"))
        for season in get_settings().season_list:
            if not s.get(Season, season):
                s.add(Season(id=season, start_year=int(season[:4])))


def upsert_game(s, rec: GameRec) -> Game:
    """Match on NBA id, ESPN id, or (date, home, away) so that both providers describe one row."""
    g = None
    if rec.nba_game_id:
        g = s.scalar(select(Game).where(Game.id == rec.nba_game_id))
    if g is None and rec.espn_event_id:
        g = s.scalar(select(Game).where(Game.espn_event_id == rec.espn_event_id))
    if g is None:
        g = s.scalar(select(Game).where(Game.home_team_id == rec.home_team_id, Game.away_team_id == rec.away_team_id,
                                        Game.game_date.between(rec.game_date - timedelta(days=1),
                                                               rec.game_date + timedelta(days=1))))
    if g is None:
        gid = rec.nba_game_id or f"E{rec.espn_event_id}"
        g = Game(id=gid, season=rec.season, game_date=rec.game_date, home_team_id=rec.home_team_id,
                 away_team_id=rec.away_team_id, provider=rec.provider, status=rec.status)
        s.add(g)
    if rec.espn_event_id:
        g.espn_event_id = rec.espn_event_id
    if rec.tipoff_utc:
        if g.tipoff_utc and g.tipoff_utc != rec.tipoff_utc and g.status == "scheduled":
            g.game_date = rec.game_date  # rescheduled
        g.tipoff_utc = rec.tipoff_utc
    if rec.venue:
        g.venue = rec.venue
    # never regress a final game back to scheduled
    if not (g.status == "final" and rec.status != "final"):
        g.status = rec.status
    if rec.status == "final" and rec.home_points is not None:
        g.home_points, g.away_points = rec.home_points, rec.away_points
    if rec.home_poss:
        g.home_poss, g.away_poss = rec.home_poss, rec.away_poss
    return g


def ingest_results(season: str, max_boxes: int | None = None, provider: PbpStatsProvider | None = None) -> dict:
    """Completed games + player box scores from PBP Stats. Safe to re-run; only missing boxes are fetched."""
    p = provider or PbpStatsProvider()
    recs = p.games(season)
    with session_scope() as s:
        pending = []
        for r in recs:
            g = upsert_game(s, r)
            s.flush()
            if g.box_ingested_at is None:
                pending.append((g.id, r.nba_game_id, r.game_date))
    done, failed = 0, []
    for gid, nba_id, gdate in sorted(pending, key=lambda x: x[2]):
        if max_boxes is not None and done >= max_boxes:
            break
        try:
            rows = p.player_box(nba_id)
        except ProviderError as e:
            failed.append({"game_id": gid, "error": str(e)})
            continue
        with session_scope() as s:
            for r in rows:
                if not s.get(PlayerBox, (gid, r.player_id)):
                    s.add(PlayerBox(game_id=gid, player_id=r.player_id, team_id=r.team_id,
                                    opp_team_id=r.opp_team_id, game_date=gdate, season=season, is_home=r.is_home,
                                    minutes=r.minutes, pts=r.pts, reb=r.reb, ast=r.ast, fg3m=r.fg3m, stl=r.stl,
                                    blk=r.blk, tov=r.tov, fga=r.fga, fta=r.fta, usage=r.usage, provider=p.name))
                pl = s.get(Player, r.player_id)
                if pl is None:
                    pl = Player(id=r.player_id, name=r.name, name_key=name_key(r.name))
                    s.add(pl)
                if pl.last_game_date is None or gdate >= pl.last_game_date:
                    pl.last_game_date, pl.team_id = gdate, r.team_id
            s.get(Game, gid).box_ingested_at = utcnow()
        done += 1
    return {"season": season, "games_listed": len(recs), "boxes_ingested": done,
            "boxes_pending": len(pending) - done, "failed": failed[:20]}


def ingest_slate(d: date, provider: EspnProvider | None = None) -> dict:
    """Schedule + pregame game-level quotes for one ET date. Odds are appended only when they changed."""
    p = provider or EspnProvider()
    games, odds = p.scoreboard(d)
    n_new_odds = 0
    with session_scope() as s:
        ids = {}
        for r in games:
            g = upsert_game(s, r)
            s.flush()
            ids[r.espn_event_id] = g.id
        n_new_odds = store_odds(s, odds, ids)
    return {"date": d.isoformat(), "games": len(games), "odds_rows_appended": n_new_odds,
            "odds_available": bool(odds)}


def store_odds(s, odds: list[OddsRec], espn_to_game: dict | None = None) -> int:
    n = 0
    for o in odds:
        gid = (espn_to_game or {}).get(o.espn_event_id)
        if gid is None and o.home_team_id and o.game_date:
            gid = s.scalar(select(Game.id).where(Game.home_team_id == o.home_team_id,
                                                 Game.away_team_id == o.away_team_id,
                                                 Game.game_date == o.game_date))
        if gid is None:
            continue
        subject_id = None
        if o.subject_type == "player":
            subject_id = match_player(s, o.subject_name, [o.home_team_id, o.away_team_id])
            if subject_id is None:
                continue  # unmatched players are not guessed
        elif o.subject_type == "team":
            subject_id = o.home_team_id if o.side == "home" else o.away_team_id
        last = s.scalar(select(OddsSnapshot).where(
            OddsSnapshot.game_id == gid, OddsSnapshot.market == o.market, OddsSnapshot.side == o.side,
            OddsSnapshot.book == o.book, OddsSnapshot.subject_id.is_not_distinct_from(subject_id),
        ).order_by(OddsSnapshot.id.desc()).limit(1))
        if last is not None and last.line == o.line and last.price_american == o.price_american:
            # unchanged quote: record nothing, but freshness is tracked through provider_calls
            continue
        s.add(OddsSnapshot(game_id=gid, market=o.market, subject_type=o.subject_type, subject_id=subject_id,
                           side=o.side, line=o.line, price_american=o.price_american, book=o.book,
                           provider=o.provider, source_published_at=o.source_published_at))
        n += 1
    return n


def match_player(s, name: str | None, team_ids: list[int | None]) -> int | None:
    if not name:
        return None
    rows = s.scalars(select(Player).where(Player.name_key == name_key(name))).all()
    if len(rows) == 1:
        return rows[0].id
    rows = [r for r in rows if r.team_id in team_ids]
    return rows[0].id if len(rows) == 1 else None


def ingest_injuries(provider: EspnProvider | None = None) -> dict:
    p = provider or EspnProvider()
    recs = p.injuries()
    batch = uuid.uuid4().hex
    unmatched = 0
    with session_scope() as s:
        for r in recs:
            pid = match_player(s, r.player_name, [r.team_id])
            if pid is None:
                unmatched += 1
            elif r.position:
                pl = s.get(Player, pid)
                if pl and not pl.position:
                    pl.position = r.position
            s.add(InjurySnapshot(batch_id=batch, player_id=pid, player_name=r.player_name, team_id=r.team_id,
                                 status=r.status, detail=r.detail, comment=r.comment,
                                 source_published_at=r.source_published_at, provider=r.provider,
                                 source_id=r.source_id, quality="ok" if pid else "unmatched"))
    changes = detect_availability_changes(batch)
    return {"batch_id": batch, "rows": len(recs), "unmatched_players": unmatched, "changes": len(changes),
            "material_changes": sum(1 for c in changes if c["material"])}


AVAILABILITY_CLASSES = ("available", "probable", "questionable", "doubtful", "out", "game_time_decision", "unknown")


def availability_class(status: str | None) -> str:
    """Map a source status string to a supported classification. Never infers beyond the published words."""
    if status is None:
        return "available"  # not listed on the report
    s = status.lower()
    if any(w in s for w in ("out", "suspension", "injured reserve")):
        return "out"
    if "doubt" in s:
        return "doubtful"
    if "question" in s:
        return "questionable"
    if "prob" in s:
        return "probable"
    if "game-time" in s or "game time" in s or "gtd" in s or "day-to-day" in s or "day to day" in s:
        return "game_time_decision"
    return "unknown"


def detect_availability_changes(batch_id: str, today: date | None = None) -> list[dict]:
    """Compare a new injury batch with the previous one and append one audit event per changed player.
    A change is 'material' when it crosses into or out of `out`, or between certain and uncertain availability."""
    from .db import ResearchEvent
    out = []
    with session_scope() as s:
        cur = list(s.scalars(select(InjurySnapshot).where(InjurySnapshot.batch_id == batch_id)))
        if not cur:
            return out
        first_id = min(i.id for i in cur)
        prev_batch = s.scalar(select(InjurySnapshot.batch_id).where(InjurySnapshot.id < first_id).order_by(InjurySnapshot.id.desc()).limit(1))
        if prev_batch is None:
            return out  # nothing to compare with: the first report is not a "change"
        prev = {(i.player_id or i.player_name): i for i in s.scalars(select(InjurySnapshot).where(InjurySnapshot.batch_id == prev_batch))}
        now = {(i.player_id or i.player_name): i for i in cur}
        today = today or today_et()
        games = {}
        for g in s.scalars(select(Game).where(Game.game_date >= today, Game.game_date <= today + timedelta(days=1),
                                              Game.status == "scheduled").order_by(Game.game_date.desc())):
            games[g.home_team_id] = games[g.away_team_id] = g
        uncertain = {"questionable", "doubtful", "game_time_decision", "unknown"}
        for key in now.keys() | prev.keys():
            a, b = prev.get(key), now.get(key)
            ca, cb = availability_class(a.status if a else None), availability_class(b.status if b else None)
            if ca == cb and (a.status if a else None) == (b.status if b else None):
                continue
            ref = b or a
            material = ca != cb and ("out" in (ca, cb) or (ca in uncertain) != (cb in uncertain))
            g = games.get(ref.team_id)
            d = {"player_id": ref.player_id, "player_name": ref.player_name, "team_id": ref.team_id,
                 "previous_status": a.status if a else None, "current_status": b.status if b else None,
                 "previous_class": ca, "current_class": cb, "material": material, "game_id": g.id if g else None,
                 "source": ref.provider, "source_published_at": (b.source_published_at.isoformat() if b and b.source_published_at else None),
                 "detail": b.detail if b else None}
            s.add(ResearchEvent(kind="availability_change", ref_type="player", ref_id=str(ref.player_id or ref.player_name)[:48],
                                game_date=g.game_date if g else None, actor="agent-04-injury-intelligence-analyst", detail=d))
            out.append(d)
    return out


def ingest_player_props(d: date, provider: OddsApiProvider | None = None) -> dict:
    """Player-prop quotes via The Odds API. Abstains (does not fabricate) when no key is configured."""
    p = provider or OddsApiProvider()
    try:
        events = p.events()
    except ProviderDisabled as e:
        return {"available": False, "reason": str(e)}
    n = 0
    for ev in events:
        tip = datetime.fromisoformat(ev["commence_time"].replace("Z", "+00:00"))
        if tip.astimezone(ET).date() != d or tip < datetime.now(timezone.utc):
            continue
        recs = p.player_props(ev["id"])
        with session_scope() as s:
            n += store_odds(s, recs)
    return {"available": True, "odds_rows_appended": n}


def latest_injuries(s, as_of: datetime | None = None) -> list[InjurySnapshot]:
    """Rows of the most recent injury batch ingested at or before `as_of` (point-in-time)."""
    q = select(InjurySnapshot.batch_id).order_by(InjurySnapshot.id.desc()).limit(1)
    if as_of:
        q = q.where(InjurySnapshot.ingested_at <= as_of)
    batch = s.scalar(q)
    if not batch:
        return []
    return list(s.scalars(select(InjurySnapshot).where(InjurySnapshot.batch_id == batch)))


def provider_status(s) -> list[dict]:
    """Freshness per provider from the actual call log."""
    out = []
    month = utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    cfg = get_settings()
    for name, configured, quota, cost in (
            ("kalshi", cfg.kalshi_enabled, None, 0.0), ("pbpstats", cfg.pbpstats_enabled, None, 0.0), ("espn", cfg.espn_enabled, None, 0.0),
            ("oddsapi", bool(cfg.odds_api_key), cfg.odds_api_monthly_quota, cfg.odds_api_monthly_cost_usd)):
        last_ok = s.scalar(select(func.max(ProviderCall.called_at)).where(ProviderCall.provider == name,
                                                                          ProviderCall.ok.is_(True)))
        last_err = s.scalar(select(func.max(ProviderCall.called_at)).where(ProviderCall.provider == name,
                                                                           ProviderCall.ok.is_(False)))
        calls = s.scalar(select(func.count()).where(ProviderCall.provider == name, ProviderCall.called_at >= month))
        used = s.scalar(select(func.coalesce(func.sum(ProviderCall.quota_cost), 0)).where(
            ProviderCall.provider == name, ProviderCall.called_at >= month))
        out.append({"provider": name, "configured": configured, "last_success_at": last_ok,
                    "last_error_at": last_err, "calls_this_month": calls, "quota_used": int(used or 0),
                    "quota_limit": quota, "monthly_cost_usd": cost,
                    "status": "not_configured" if not configured else "never_called" if not last_ok
                    else "degraded" if last_err and last_err > last_ok else "ok"})
    return out


def ingest_confirmed_starters(since: date, until: date | None = None, max_games: int | None = None,
                              provider: EspnProvider | None = None) -> dict:
    """Confirmed starters, did-not-play records and player identity media from ESPN box scores for final games
    in [since, until]. Links ESPN event ids first (one scoreboard call per date that needs it). Idempotent."""
    p = provider or EspnProvider()
    until = until or today_et()
    with session_scope() as s:
        need_link = sorted(set(s.scalars(select(Game.game_date).where(
            Game.game_date >= since, Game.game_date <= until, Game.status == "final", Game.espn_event_id.is_(None)))))
    linked = 0
    for d in need_link:
        try:
            ingest_slate(d, provider=p); linked += 1
        except ProviderError:
            continue
    with session_scope() as s:
        todo = [(g.id, g.espn_event_id, g.game_date) for g in s.scalars(select(Game).where(
            Game.game_date >= since, Game.game_date <= until, Game.status == "final", Game.box_ingested_at.is_not(None),
            Game.espn_event_id.is_not(None), Game.lineup_ingested_at.is_(None)).order_by(Game.game_date.desc()))]
    done, failed, unmatched = 0, 0, 0
    for gid, eid, gdate in todo[:max_games]:
        try:
            rows = p.summary_box(eid)
        except ProviderError:
            failed += 1
            continue
        if sum(1 for r in rows if r["starter"]) != 10:
            failed += 1  # an incomplete starter list is not stored as a confirmed lineup
            continue
        with session_scope() as s:
            box = {b.player_id: b for b in s.scalars(select(PlayerBox).where(PlayerBox.game_id == gid))}
            for r in rows:
                pl = s.scalar(select(Player).where(Player.espn_id == r["espn_id"]))
                pid = pl.id if pl else match_player(s, r["name"], [r["team_id"]])
                if pid is None:
                    unmatched += 1
                    continue
                pl = pl or s.get(Player, pid)
                pl.espn_id = r["espn_id"]
                pl.jersey = r["jersey"] or pl.jersey
                pl.headshot_url = r["headshot_url"] or pl.headshot_url
                pl.position = r["position"] or pl.position
                if pid in box:
                    box[pid].starter = r["starter"]
                elif r["dnp"] and r["team_id"] and not s.get(PlayerAbsence, (gid, pid)):
                    s.add(PlayerAbsence(game_id=gid, player_id=pid, team_id=r["team_id"], game_date=gdate,
                                        reason=(r["reason"] or "Did not play")[:160], provider=p.name))
            s.get(Game, gid).lineup_ingested_at = utcnow()
        done += 1
    return {"dates_linked": linked, "games_done": done, "games_failed": failed, "games_pending": max(0, len(todo) - done - failed),
            "unmatched_player_rows": unmatched}
