"""GIZER CORTEX: the basketball knowledge library and the evidence-derived player, team and rotation profiles.

Two different things live here and are never mixed:
* **Knowledge records** — original, general basketball knowledge (rules, tactics, statistics, methods), loaded
  from versioned files in `cortex_data/`, each carrying its sources and whether it was checked against one.
* **DNA profiles** — computed on request from this platform's own stored records, each attribute with the rule
  and the numbers behind it. A profile is a description of what the data shows, never a scouting opinion.

Retrieval is local PostgreSQL full-text search. No model and no external service is involved, so it costs nothing.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path

from sqlalchemy import func, select, text

from .db import (CortexBenchmarkRun, CortexConcept, CortexRetrievalLog, CortexSource, Game, Player, PlayerBox,
                 ResearchFinding, Team, session_scope, utcnow)

DATA = Path(__file__).parent / "cortex_data"
DEPARTMENTS = {
    1: "Basketball Fundamentals", 2: "Offensive Tactical Intelligence", 3: "Defensive Tactical Intelligence",
    4: "Coaching Intelligence", 5: "Player Scouting Intelligence", 6: "Team Identity Intelligence",
    7: "Minutes and Rotation Intelligence", 8: "Usage and Opportunity Intelligence", 9: "Shooting and Efficiency Intelligence",
    10: "Rebounding Intelligence", 11: "Passing and Playmaking Intelligence", 12: "Lineup and Teammate Intelligence",
    13: "Injury and Availability Intelligence", 14: "Schedule and Fatigue Intelligence", 15: "Matchup Intelligence",
    16: "Historical Basketball Intelligence", 17: "Advanced Statistical Intelligence", 18: "Kalshi Market Literacy",
    19: "Live Game Interpretation", 20: "Postgame Research and Learning",
}
KINDS = ("rule", "statistic", "offense", "defense", "role", "concept", "context", "market", "method", "live")
VERIFICATIONS = ("checked_against_source", "authored_not_checked")
FORBIDDEN = re.compile(r"\b(lock|locks|locked|guaranteed|free money|risk-free|cannot lose|sure thing)\b", re.I)
REQUIRED = ("slug", "department", "kind", "title", "summary", "body", "limitations", "observable_in_our_data", "data_gaps",
            "ruleset", "sources", "verification")
# Everyday wording -> the terms the library uses. Small and hand-kept; it widens a query, it never invents a record.
SYNONYMS = {"bonus": "penalty team fouls", "questionable": "status designations injury report", "doubtful": "status designations injury report",
            "probable": "status designations injury report", "gtd": "game-time decision status", "b2b": "back-to-back", "pnr": "pick-and-roll",
            "p&r": "pick-and-roll", "dho": "dribble handoff", "iso": "isolation", "ts": "true shooting", "efg": "effective field goal",
            "usg": "usage", "ortg": "offensive rating", "drtg": "defensive rating", "odds": "price probability", "juice": "fees break-even",
            "vig": "fees break-even", "parlay": "combination joint probability", "sgp": "combination same game dependence",
            "blowout": "garbage time", "boards": "rebounds", "dimes": "assists", "threes": "three-point", "treys": "three-point",
            "fouled": "personal fouls", "ejected": "technical flagrant ejection", "ot": "overtime", "sub": "substitution", "subs": "substitutions"}
STOPWORDS = frozenset("""the and for with what when where which who whom why how does did are was were has have had his her its their
this that these those from into over under than then them they you your our out per not any all can could would should will may might
about after before between during against each more most much many some such only also just very one two three game games team teams
player players points scores scored average many much there here""".split())
BENCH_CATEGORIES = ("basketball_rules", "offensive_tactics", "defensive_tactics", "coaching", "player_roles", "advanced_statistics",
                    "lineup_analysis", "historical_basketball", "data_interpretation", "probability", "market_contracts",
                    "research_integrity")


# ------------------------------------------------------------------ library loading
def validate_concept(c: dict, source_keys: set) -> list[str]:
    errs = [f"missing {k}" for k in REQUIRED if k not in c]
    if errs:
        return errs
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", str(c["slug"])) or len(c["slug"]) > 80:
        errs.append("bad slug")
    if c["department"] not in DEPARTMENTS:
        errs.append("bad department")
    if c["kind"] not in KINDS:
        errs.append("bad kind")
    if c["verification"] not in VERIFICATIONS:
        errs.append("bad verification")
    if c["ruleset"] not in ("NBA", "FIBA", "general"):
        errs.append("bad ruleset")
    if len(str(c["body"]).split()) < 60:
        errs.append("body too short")
    keys = [s.get("key") for s in c["sources"] or []]
    if any(k not in source_keys for k in keys):
        errs.append("unknown source key")
    if c["verification"] == "checked_against_source" and not keys:
        errs.append("checked record without a source")
    blob = json.dumps(c)
    if FORBIDDEN.search(blob):
        errs.append("forbidden vocabulary")
    return errs


def read_files() -> tuple[list[dict], list[dict], list[str]]:
    """(sources, concepts, problems). Invalid records are reported and skipped, never loaded."""
    problems: list[str] = []
    sources = []
    sp = DATA / "sources.json"
    if sp.exists():
        try:
            sources = [s for s in json.loads(sp.read_text()) if isinstance(s, dict) and s.get("key") and s.get("title")]
        except json.JSONDecodeError as e:
            problems.append(f"sources.json: {e}")
    keys = {s["key"] for s in sources}
    concepts, seen = [], set()
    for f in sorted(DATA.glob("dept_*.json")):
        try:
            rows = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            problems.append(f"{f.name}: {e}")
            continue
        for c in rows if isinstance(rows, list) else []:
            errs = validate_concept(c, keys) if isinstance(c, dict) else ["not an object"]
            if not errs and c["slug"] in seen:
                errs = ["duplicate slug"]
            if errs:
                problems.append(f"{f.name}:{c.get('slug') if isinstance(c, dict) else '?'}: {', '.join(errs)}")
                continue
            seen.add(c["slug"])
            concepts.append(c)
    for c in concepts:      # related slugs that do not exist are dropped, not invented
        c["related"] = [r for r in c.get("related") or [] if r in seen and r != c["slug"]]
    return sources, concepts, problems


def _search_text(c: dict) -> str:
    parts = [c["title"], c["slug"].replace("-", " "), c["summary"], c["body"], c.get("formula") or "",
             " ".join(c.get("limitations") or []), c.get("when_not_to_use") or "", c.get("player_responsibilities") or "",
             c.get("common_responses") or "", DEPARTMENTS[c["department"]]]
    return " \n".join(str(p) for p in parts if p)


def load_library() -> dict:
    """Idempotent upsert of the files into the database. A changed record gets a new version number."""
    sources, concepts, problems = read_files()
    added = changed = 0
    with session_scope() as s:
        for src in sources:
            row = s.get(CortexSource, src["key"])
            vals = {k: (str(src.get(k))[:(300 if k in ("title", "url") else 16 if k == "accessed" else 600)] if src.get(k) is not None else None) for k in
                    ("title", "publisher", "url", "league", "kind", "reliability", "permission", "accessed", "access_result")}
            if row is None:
                s.add(CortexSource(key=src["key"][:48], **{**vals, "title": (vals["title"] or src["key"])[:200]}))
            else:
                for k, v in vals.items():
                    setattr(row, k, v)
                row.updated_at = utcnow()
        have = {c.slug: c for c in s.scalars(select(CortexConcept))}
        for c in concepts:
            sha = hashlib.sha256(json.dumps(c, sort_keys=True).encode()).hexdigest()
            detail = {k: c.get(k) for k in ("limitations", "when_not_to_use", "player_responsibilities", "common_responses",
                                            "observable_in_our_data", "data_gaps", "sources", "related", "evaluation_questions")}
            vals = dict(department=c["department"], kind=c["kind"], title=c["title"][:200], summary=c["summary"], body=c["body"],
                        formula=c.get("formula"), detail=detail, ruleset=c["ruleset"], season_note=(c.get("season_note") or None),
                        verification=c["verification"], source_keys=[x["key"] for x in c["sources"]], content_sha=sha,
                        search_text=_search_text(c))
            row = have.get(c["slug"])
            if row is None:
                s.add(CortexConcept(slug=c["slug"], version=1, **vals))
                added += 1
            elif row.content_sha != sha:
                for k, v in vals.items():
                    setattr(row, k, v)
                row.version, row.updated_at = row.version + 1, utcnow()
                changed += 1
        keep = {c["slug"] for c in concepts}
        removed = [slug for slug in have if slug not in keep]
        for slug in removed:
            s.delete(have[slug])
    return {"sources": len(sources), "concepts": len(concepts), "added": added, "changed": changed, "removed": len(removed),
            "problems": problems[:40], "problem_count": len(problems)}


# ------------------------------------------------------------------ retrieval
def concept_dict(c: CortexConcept, full: bool = True) -> dict:
    out = {"slug": c.slug, "title": c.title, "department": c.department, "department_name": DEPARTMENTS.get(c.department),
           "kind": c.kind, "summary": c.summary, "ruleset": c.ruleset, "verification": c.verification, "version": c.version,
           "sources": c.source_keys}
    if full:
        out.update({"body": c.body, "formula": c.formula, "season_note": c.season_note, "updated_at": c.updated_at, **(c.detail or {})})
    return out


def search(q: str, department: int | None = None, kind: str | None = None, limit: int = 6, caller: str = "api",
           log: bool = True) -> dict:
    """Hybrid keyword retrieval: full-text rank, plus a boost when the words are in the title or slug. If the
    strict query (all words) finds nothing, it retries with any word. Returns short records; fetch one for the body."""
    t0 = time.monotonic()
    q = " ".join((q or "").split())[:300]
    limit = max(1, min(int(limit), 12))
    words = re.findall(r"[a-z0-9%&]+", q.lower())
    extra = " ".join(SYNONYMS[w] for w in words if w in SYNONYMS)
    terms = [w for w in re.findall(r"[a-z0-9%]+", (q + " " + extra).lower()) if len(w) > 2 and not w.isdigit() and w not in STOPWORDS][:20]
    rows, method = [], "none"
    with session_scope() as s:
        if terms:
            where = ("where (cast(:dept as integer) is null or department = cast(:dept as integer)) "
                     "and (cast(:kind as text) is null or kind = cast(:kind as text))")
            base = ("select slug, ts_rank(to_tsvector('english', search_text), {tsq}) "
                    "+ case when lower(title) like cast(:like as text) or replace(slug, '-', ' ') like cast(:like as text) then 1.0 else 0 end "
                    "+ (select count(*) from unnest(cast(:terms as text[])) t where lower(title) like '%' || t || '%') * 0.15 as score "
                    "from cortex_concepts " + where + " and (to_tsvector('english', search_text) @@ {tsq} or lower(title) like cast(:like as text)) "
                    "order by score desc, slug limit :lim")
            params = {"q": q, "dept": department, "kind": kind, "like": f"%{q.lower()[:60]}%", "terms": terms, "lim": limit}
            hits = [] if extra else s.execute(text(base.format(tsq="websearch_to_tsquery('english', cast(:q as text))")), params).all()
            method = "all_words"
            if not hits:
                params["q"] = " or ".join(terms)
                hits = s.execute(text(base.format(tsq="websearch_to_tsquery('english', cast(:q as text))")), params).all()
                hits = [h for h in hits if float(h[1]) >= 0.06]      # a stray common word is not a match
                method = "any_word"
            found = {c.slug: c for c in s.scalars(select(CortexConcept).where(CortexConcept.slug.in_([h[0] for h in hits] or ["-"])))}
            rows = [{**concept_dict(found[h[0]], full=False), "score": round(float(h[1]), 3)} for h in hits if h[0] in found]
        ms = int((time.monotonic() - t0) * 1000)
        if log:
            s.add(CortexRetrievalLog(query=q, filters={"department": department, "kind": kind}, returned=[r["slug"] for r in rows],
                                     method=method, duration_ms=ms, caller=caller[:24]))
    return {"query": q, "method": method, "items": rows, "total": len(rows),
            "note": "Keyword retrieval over the local knowledge library. A record's 'verification' says whether its text was "
                    "checked against a source that was actually opened."}


def get_concept(slug: str) -> dict | None:
    with session_scope() as s:
        c = s.get(CortexConcept, slug[:80])
        if c is None:
            return None
        d = concept_dict(c)
        rel = list(s.scalars(select(CortexConcept).where(CortexConcept.slug.in_(d.get("related") or ["-"]))))
        d["related"] = [{"slug": r.slug, "title": r.title} for r in rel]
        srcs = {x.key: x for x in s.scalars(select(CortexSource).where(CortexSource.key.in_(c.source_keys or ["-"])))}
        d["sources"] = [{"key": k, "title": srcs[k].title if k in srcs else k, "url": srcs[k].url if k in srcs else None,
                         "note": next((x.get("note") for x in (c.detail or {}).get("sources") or [] if x.get("key") == k), None)}
                        for k in c.source_keys or []]
        return d


# ------------------------------------------------------------------ DNA (computed from our own records)
def _season() -> str:
    from .ingestion import today_et
    from .providers import season_for_date
    return season_for_date(today_et())


ARCHETYPE_RULES = [
    # (key, label, rule text, test on the season line)
    ("primary_creator", "Primary creator", "usage >= 26% and assists per 36 >= 5.5",
     lambda r: r["usage"] is not None and r["usage"] >= 26 and r["ast36"] >= 5.5),
    ("secondary_creator", "Secondary creator", "usage 20% to 26% and assists per 36 >= 4",
     lambda r: r["usage"] is not None and 20 <= r["usage"] < 26 and r["ast36"] >= 4),
    ("facilitator", "Facilitator", "assists per 36 >= 7 and usage below 22%",
     lambda r: r["ast36"] >= 7 and (r["usage"] is None or r["usage"] < 22)),
    ("volume_scorer", "High-volume scorer", "points per 36 >= 22 and field goal attempts per 36 >= 16",
     lambda r: r["pts36"] >= 22 and r["fga36"] >= 16),
    ("floor_spacer", "Floor spacer", "three-pointers made per 36 >= 2.5 and usage below 22%",
     lambda r: r["fg3m36"] >= 2.5 and (r["usage"] is None or r["usage"] < 22)),
    ("interior_rebounder", "Rebounder", "rebounds per 36 >= 10",
     lambda r: r["reb36"] >= 10),
    ("rim_protector", "Shot blocker", "blocks per 36 >= 1.8",
     lambda r: r["blk36"] >= 1.8),
    ("ball_hawk", "Steals-generating defender", "steals per 36 >= 1.8",
     lambda r: r["stl36"] >= 1.8),
    ("low_usage_role", "Low-usage role player", "usage below 15% with at least 18 minutes a game",
     lambda r: r["usage"] is not None and r["usage"] < 15 and r["mpg"] >= 18),
    ("rotation_reserve", "Rotation reserve", "10 to 20 minutes a game, started fewer than a quarter of appearances with a known role",
     lambda r: 10 <= r["mpg"] < 20 and r["start_share"] is not None and r["start_share"] < 0.25),
]
MIN_GAMES_FOR_ARCHETYPE, MIN_MINUTES_FOR_ARCHETYPE = 8, 150


def player_dna(player_id: int) -> dict | None:
    import pandas as pd

    from . import jarvis_tools as T
    season = _season()
    with session_scope() as s:
        pl = s.get(Player, player_id)
        if pl is None:
            return None
        team = s.get(Team, pl.team_id) if pl.team_id else None
        rows = s.execute(select(PlayerBox.season, PlayerBox.team_id, PlayerBox.game_date, PlayerBox.minutes, PlayerBox.usage, PlayerBox.pts,
                                PlayerBox.reb, PlayerBox.ast, PlayerBox.fg3m, PlayerBox.stl, PlayerBox.blk, PlayerBox.tov, PlayerBox.fga,
                                PlayerBox.fta, PlayerBox.starter).where(PlayerBox.player_id == player_id).order_by(PlayerBox.game_date)).all()
        abbr = {t.id: t.abbr for t in s.scalars(select(Team))}
    df = pd.DataFrame(rows, columns=["season", "team_id", "date", "min", "usage", "pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "fga",
                                     "fta", "starter"])
    df = df[df["min"].fillna(0) > 0]
    identity = {"player_id": pl.id, "name": pl.name, "team": team.abbr if team else None, "team_id": pl.team_id, "position": pl.position,
                "jersey": pl.jersey, "headshot_url": pl.headshot_url, "last_game_date": pl.last_game_date,
                "not_held": ["height", "weight", "age", "contract or roster status"]}
    stints = []
    if not df.empty:
        for (seas, tid), g in df.groupby(["season", "team_id"], sort=False):
            stints.append({"season": seas, "team": abbr.get(int(tid)), "games": int(len(g)), "first": g["date"].min(), "last": g["date"].max()})
    cur = df[df["season"] == season]
    base = {"identity": identity, "season": season, "team_history": stints, "generated_at": utcnow(),
            "method": "Computed from this platform's stored box scores. Every classification lists the rule and the numbers behind it."}
    if cur.empty:
        return {**base, "available": False, "note": "No appearances this season in our records: no profile is derived."}
    mins = float(cur["min"].sum())

    def p36(col):
        return round(float(cur[col].sum()) / mins * 36, 2) if mins else 0.0
    us = cur["usage"].dropna()
    known = cur[cur["starter"].notna()]
    line = {"games": int(len(cur)), "minutes_total": round(mins), "mpg": round(mins / len(cur), 1),
            "usage": round(float(us.mean()), 1) if len(us) else None, "usage_games": int(len(us)),
            "pts36": p36("pts"), "reb36": p36("reb"), "ast36": p36("ast"), "fg3m36": p36("fg3m"), "stl36": p36("stl"), "blk36": p36("blk"),
            "tov36": p36("tov"), "fga36": p36("fga"), "fta36": p36("fta"),
            "true_shooting_pct": (round(100 * float(cur["pts"].sum()) / (2 * (float(cur["fga"].sum()) + 0.44 * float(cur["fta"].sum()))), 1)
                                  if float(cur["fga"].sum()) + float(cur["fta"].sum()) > 0 else None),
            "start_share": round(float(known["starter"].astype(bool).mean()), 2) if len(known) else None,
            "starts_known_games": int(len(known)),
            "minutes_sd": round(float(cur["min"].std()), 1) if len(cur) > 1 else None}
    enough = line["games"] >= MIN_GAMES_FOR_ARCHETYPE and line["minutes_total"] >= MIN_MINUTES_FOR_ARCHETYPE
    arche = []
    if enough:
        for key, label, rule, test in ARCHETYPE_RULES:
            try:
                if test(line):
                    arche.append({"key": key, "label": label, "rule": rule})
            except TypeError:
                continue
    last10 = cur.tail(10)
    recent = {"games": int(len(last10)), "mpg": round(float(last10["min"].mean()), 1), "pts": round(float(last10["pts"].mean()), 1),
              "reb": round(float(last10["reb"].mean()), 1), "ast": round(float(last10["ast"].mean()), 1),
              "usage": round(float(last10["usage"].dropna().mean()), 1) if last10["usage"].notna().any() else None}
    teammates = None
    try:
        r = T.t_teammate_splits(T.PlayerArg(player_id=player_id), {})
        if r.get("available"):
            teammates = [{"teammate": x["teammate"], "games_with": x["with"]["n"], "games_without": x["without"]["n"] if x["without"] else 0,
                          "usage_with": x["with"]["usage_pct"], "usage_without": x["without"]["usage_pct"] if x["without"] else None,
                          "small_sample": x.get("small_sample", True)} for x in r["teammates"]]
    except Exception:
        teammates = None
    return {**base, "available": True, "season_line": line, "recent_10": recent,
            "archetypes": arche,
            "archetype_status": ("derived" if enough else
                                 f"not derived: needs at least {MIN_GAMES_FOR_ARCHETYPE} games and {MIN_MINUTES_FOR_ARCHETYPE} minutes this season"),
            "teammate_context": teammates,
            "tactical_profile": {"available": False,
                                 "reason": "No play-type, shot-location, tracking or film data is held, so observed offensive and "
                                           "defensive roles, strengths and limitations are not stated."},
            "not_available": ["assist percentage, rebound percentage and turnover percentage (need team totals while on court)",
                              "shot distribution by zone", "play-type frequencies", "defensive matchup data"],
            "notes": ["Archetypes are descriptive labels from simple published rules on this season's box scores. A player can "
                      "have several or none. They are not predictions and are not model inputs.",
                      "Thresholds are this platform's own conventions, chosen for readability, not validated cut-offs.",
                      "Usage is the provider's per-game figure averaged over games where it was published."]}


def team_dna(team_id: int) -> dict | None:
    import pandas as pd

    from .db import LivePlay, LiveGame
    season = _season()
    with session_scope() as s:
        team = s.get(Team, team_id)
        if team is None:
            return None
        games = list(s.scalars(select(Game).where(Game.season == season, Game.status == "final",
                                                  (Game.home_team_id == team_id) | (Game.away_team_id == team_id)).order_by(Game.game_date)))
        rows = s.execute(select(PlayerBox.game_id, PlayerBox.player_id, PlayerBox.minutes, PlayerBox.pts, PlayerBox.fg3m, PlayerBox.fga,
                                PlayerBox.fta, PlayerBox.tov, PlayerBox.starter, PlayerBox.game_date)
                         .where(PlayerBox.team_id == team_id, PlayerBox.season == season)).all()
        names = {p.id: p.name for p in s.scalars(select(Player).where(Player.team_id == team_id))}
        live_ids = list(s.scalars(select(LiveGame.game_id).join(Game, Game.id == LiveGame.game_id).where(
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id), LiveGame.plays_count > 0)))
        first_subs = []
        for gid in live_ids:
            t = s.scalar(select(func.min(LivePlay.elapsed_s)).where(LivePlay.game_id == gid, LivePlay.team_id == team_id,
                                                                    LivePlay.kind == "substitution"))
            if t is not None:
                first_subs.append(float(t))
    base = {"team_id": team_id, "abbr": team.abbr, "name": team.name, "season": season, "generated_at": utcnow(),
            "method": "Computed from this platform's stored final scores and box scores for the current season."}
    if not games:
        return {**base, "available": False, "note": "No final games this season in our records."}
    w = l = hw = hl = 0
    pf = pa = 0.0
    poss = []
    for g in games:
        home = g.home_team_id == team_id
        mine, theirs = (g.home_points, g.away_points) if home else (g.away_points, g.home_points)
        if mine is None or theirs is None:
            continue
        pf, pa = pf + mine, pa + theirs
        won = mine > theirs
        w, l = w + won, l + (not won)
        if home:
            hw, hl = hw + won, hl + (not won)
        p = g.home_poss if home else g.away_poss
        if p:
            poss.append((p, mine, theirs))
    n = w + l
    record = {"games": n, "wins": w, "losses": l, "home": f"{hw}-{hl}", "away": f"{w - hw}-{l - hl}",
              "points_per_game": round(pf / n, 1) if n else None, "points_allowed_per_game": round(pa / n, 1) if n else None,
              "point_differential": round((pf - pa) / n, 1) if n else None}
    ratings = None
    if len(poss) >= 5:
        tp = sum(p for p, _, _ in poss)
        ratings = {"games_with_possessions": len(poss), "pace_possessions_per_game": round(tp / len(poss), 1),
                   "offensive_rating": round(100 * sum(m for _, m, _ in poss) / tp, 1),
                   "defensive_rating": round(100 * sum(t for _, _, t in poss) / tp, 1),
                   "note": "Per 100 of the team's own possessions as recorded by the play-by-play provider, for the games that have them."}
        ratings["net_rating"] = round(ratings["offensive_rating"] - ratings["defensive_rating"], 1)
    df = pd.DataFrame(rows, columns=["game_id", "player_id", "min", "pts", "fg3m", "fga", "fta", "tov", "starter", "date"])
    df = df[df["min"].fillna(0) > 0]
    rotation = None
    if not df.empty:
        per_game = df.groupby("game_id")
        rot_len = per_game.apply(lambda g: int((g["min"] >= 10).sum()), include_groups=False)
        known = df[df["starter"].notna()]
        fives = {}
        st_min = []
        bench_pts = []
        for gid, g in known.groupby("game_id"):
            st = g[g["starter"] == True]        # noqa: E712
            if len(st) == 5:
                key = tuple(sorted(int(x) for x in st["player_id"]))
                fives[key] = fives.get(key, 0) + 1
                st_min.append(float(st["min"].mean()))
                bench_pts.append(float(g[g["starter"] == False]["pts"].sum()))       # noqa: E712
        common = sorted(fives.items(), key=lambda kv: -kv[1])[:3]
        mpg = df.groupby("player_id").agg(g=("game_id", "nunique"), mpg=("min", "mean")).sort_values("mpg", ascending=False)
        rotation = {"games": int(df["game_id"].nunique()),
                    "players_10_plus_minutes_per_game": round(float(rot_len.mean()), 1),
                    "rotation_length_range": [int(rot_len.min()), int(rot_len.max())],
                    "games_with_confirmed_starters": int(len(st_min)),
                    "starter_minutes_avg": round(sum(st_min) / len(st_min), 1) if st_min else None,
                    "bench_points_per_game": round(sum(bench_pts) / len(bench_pts), 1) if bench_pts else None,
                    "distinct_starting_fives": len(fives),
                    "most_used_starting_fives": [{"players": [names.get(p, str(p)) for p in k], "games": v} for k, v in common],
                    "minutes_leaders": [{"player_id": int(i), "name": names.get(int(i), str(i)), "games": int(r["g"]), "mpg": round(float(r["mpg"]), 1)}
                                        for i, r in mpg.head(9).iterrows()],
                    "first_substitution": ({"games_observed_live": len(first_subs),
                                            "average_minutes_into_game": round(sum(first_subs) / len(first_subs) / 60, 1)}
                                           if first_subs else {"games_observed_live": 0, "note": "No live play-by-play held for this team yet."})}
        shot = {"three_pointers_made_per_game": round(float(df.groupby("game_id")["fg3m"].sum().mean()), 1),
                "field_goal_attempts_per_game": round(float(df.groupby("game_id")["fga"].sum().mean()), 1),
                "free_throw_attempts_per_game": round(float(df.groupby("game_id")["fta"].sum().mean()), 1),
                "turnovers_per_game": round(float(df.groupby("game_id")["tov"].sum().mean()), 1)}
    else:
        shot = None
    return {**base, "available": True, "record": record, "ratings": ratings, "shot_volume": shot, "rotation": rotation,
            "coach": {"identity": None,
                      "note": "Coach names and staff are not in our data. Rotation tendencies below describe the team this season "
                              "under whoever is coaching it; they are observations, not a forecast of future decisions."},
            "tactical_identity": {"available": False,
                                  "reason": "No play-type, shot-location or tracking data is held, so no offensive or defensive "
                                            "system is attributed to this team."},
            "not_available": ["effective field goal percentage and three-point attempt rate (three-point attempts are held only for games "
                              "observed live)", "offensive rebound rate", "transition and half-court splits", "lineup combination data before live "
                              "collection began", "coaching staff"],
            "notes": ["A team profile describes this season to date. It does not carry over after roster or coaching changes.",
                      "Small early-season samples move quickly: read every number with its games count."]}


def coverage() -> dict:
    """Real counts for the knowledge centre. Nothing here is estimated."""
    season = _season()
    with session_scope() as s:
        by_dept = dict(s.execute(select(CortexConcept.department, func.count()).group_by(CortexConcept.department)).all())
        by_ver = dict(s.execute(select(CortexConcept.verification, func.count()).group_by(CortexConcept.verification)).all())
        by_kind = dict(s.execute(select(CortexConcept.kind, func.count()).group_by(CortexConcept.kind)).all())
        players = s.scalar(select(func.count(func.distinct(PlayerBox.player_id))).where(PlayerBox.season == season)) or 0
        teams = s.scalar(select(func.count(func.distinct(PlayerBox.team_id))).where(PlayerBox.season == season)) or 0
        findings = dict(s.execute(select(ResearchFinding.status, func.count()).group_by(ResearchFinding.status)).all())
        last = s.scalar(select(func.max(CortexConcept.updated_at)))
        n_src = s.scalar(select(func.count()).select_from(CortexSource)) or 0
        opened = s.scalar(select(func.count()).select_from(CortexSource).where(CortexSource.access_result.ilike("%opened%"))) or 0
        retr = s.scalar(select(func.count()).select_from(CortexRetrievalLog)) or 0
        runs = [{"id": r.id, "kind": r.kind, "split": r.split, "model": r.model, "n": r.n, "score": r.score, "cost_usd": r.cost_usd,
                 "created_at": r.created_at} for r in s.scalars(select(CortexBenchmarkRun).order_by(CortexBenchmarkRun.id.desc()).limit(6))]
    bench = benchmark_summary()
    return {"knowledge_records": sum(by_dept.values()),
            "records_checked_against_a_source": by_ver.get("checked_against_source", 0),
            "records_authored_not_checked": by_ver.get("authored_not_checked", 0),
            "departments": [{"id": k, "name": v, "records": by_dept.get(k, 0)} for k, v in DEPARTMENTS.items()],
            "by_kind": by_kind, "sources_indexed": n_src, "sources_opened_by_author": opened,
            "player_profiles_available": players, "team_profiles_available": teams,
            "coaching_profiles_available": 0, "coaching_note": "Coach identities are not in our data; rotation tendencies are part of each team profile.",
            "research_findings": findings, "unresolved_hypotheses": findings.get("open", 0),
            "last_knowledge_update": last, "retrievals_logged": retr, "benchmark": bench, "benchmark_runs": runs, "season": season,
            "not_built": ["semantic (embedding) search: keyword search only", "possession-level reconstruction", "film study",
                          "coach identities", "knowledge graph beyond the relational links already in the database"]}


# ------------------------------------------------------------------ benchmark
def benchmark_questions() -> list[dict]:
    p = DATA / "benchmark.json"
    if not p.exists():
        return []
    try:
        rows = json.loads(p.read_text())
    except json.JSONDecodeError:
        return []
    return [q for q in rows if isinstance(q, dict) and q.get("id") and q.get("question") and q.get("type") and q.get("category")]


def benchmark_summary() -> dict:
    qs = benchmark_questions()

    def count(key):
        out: dict = {}
        for q in qs:
            out[q.get(key)] = out.get(q.get(key), 0) + 1
        return out
    return {"questions": len(qs), "target": 500, "by_category": count("category"), "by_type": count("type"), "by_split": count("split"),
            "reviewed_by_a_person": sum(1 for q in qs if q.get("reviewed") is True),
            "note": "Answer keys were written by a model and are unreviewed until a person marks them. Scores are provisional until then."}


def grade(q: dict, answer: str) -> dict:
    """Deterministic grading. No model grades its own answers."""
    a = (answer or "").strip()
    low = a.lower()
    t = q["type"]
    if t == "multiple_choice":
        m = re.search(r"\b(?:answer|final answer)\s*(?:is|:)?\s*\(?([A-D])\)?", a, re.I) or re.match(r"\s*\(?([A-D])\)?[\s.:)\-]", a + " ")
        got = m.group(1).upper() if m else None
        return {"correct": got == str(q["answer"]).upper(), "got": got}
    if t == "numeric":
        nums = [float(x.replace(",", "")) for x in re.findall(r"-?\d[\d,]*\.?\d*", a)]
        tol = float(q.get("tolerance") or 0.01)
        m = re.search(r"(?:answer|final answer)\s*(?:is|:)?\s*\$?(-?\d[\d,]*\.?\d*)", a, re.I)
        cand = [float(m.group(1).replace(",", ""))] if m else nums[-1:]
        ok = any(abs(x - float(q["answer"])) <= tol for x in cand)
        return {"correct": ok, "got": cand[0] if cand else None}
    must = [m.lower() for m in q.get("must_mention") or []]
    never = [m.lower() for m in q.get("must_not_claim") or []]
    hit, bad = [m for m in must if m in low], [m for m in never if m in low]
    # abstain: the lists are alternative wordings of one refusal, so any one is enough; short answer: every key point
    enough = (not must) or (len(hit) >= 1 if t == "abstain" else len(hit) == len(must))
    return {"correct": enough and not bad, "mentioned": hit, "claimed": bad}


def retrieval_eval(split: str = "all", store: bool = True) -> dict:
    """Free check of retrieval: for each benchmark question that names expected concepts, is one of them in the
    top five results for the question text? No model is called."""
    qs = [q for q in benchmark_questions() if q.get("expected_concepts") and (split == "all" or q.get("split") == split)]
    with session_scope() as s:
        have = set(s.scalars(select(CortexConcept.slug)))
    rows, by_cat = [], {}
    for q in qs:
        exp = [e for e in q["expected_concepts"] if e in have]
        if not exp:
            continue
        got = [r["slug"] for r in search(q["question"], limit=5, caller="benchmark", log=False)["items"]]
        ok = any(e in got for e in exp)
        rows.append({"id": q["id"], "hit": ok, "expected": exp, "got": got})
        c = by_cat.setdefault(q["category"], [0, 0])
        c[0] += ok
        c[1] += 1
    n = len(rows)
    out = {"kind": "retrieval", "split": split, "n": n, "hit_rate_top5": round(sum(r["hit"] for r in rows) / n, 3) if n else None,
           "by_category": {k: {"hits": v[0], "n": v[1]} for k, v in sorted(by_cat.items())},
           "misses": [r for r in rows if not r["hit"]][:25],
           "skipped_no_matching_concept": len(qs) - n}
    if store and n:
        with session_scope() as s:
            s.add(CortexBenchmarkRun(kind="retrieval", split=split, model=None, n=n, score=out["hit_rate_top5"], by_category=out["by_category"],
                                     details=out["misses"], cost_usd=0.0))
    return out


ANSWER_PROMPT = """You are being examined on basketball knowledge and research discipline. Answer the question using the reference notes when they are relevant and sound reasoning otherwise.
Rules: for a multiple-choice question end with a line "Answer: X" (one letter). For a calculation show the working briefly and end with a line "Answer: <number>". If the question cannot be answered responsibly (missing data, false premise, needs current information or tools you do not have here, asks for a certainty or a wager), say so plainly, say what would be needed, and do not invent a number. Be concise."""


def run_answers(limit: int = 20, split: str = "dev", mode: str = "light") -> dict:
    """Paid benchmark run against the model, inside the AI budget (development allocation). Owner-triggered only."""
    from . import ai_budget, jarvis
    from .config import get_settings
    if not jarvis.configured():
        return {"ran": False, "reason": "No API key configured."}
    cfg = get_settings()
    _, attr, _, effort = jarvis.MODES[mode]
    model, max_tokens = getattr(cfg, attr), 700
    qs = [q for q in benchmark_questions() if q.get("split") == split][:max(1, min(limit, 200))]
    rows, by_cat, cost, stopped = [], {}, 0.0, None
    for q in qs:
        ctx = search(q["question"], limit=3, caller="benchmark", log=False)["items"]
        notes = []
        for r in ctx:
            c = get_concept(r["slug"])
            notes.append(f"[{c['slug']}] {c['title']}: {c['summary']} {('Formula: ' + c['formula']) if c.get('formula') else ''}")
        body = (q["question"] + ("\n" + "\n".join(q["choices"]) if q.get("choices") else "")
                + ("\n\nReference notes:\n" + "\n".join(notes) if notes else ""))
        try:
            uid = ai_budget.reserve("dev", model, "benchmark", ai_budget.estimate_tokens(ANSWER_PROMPT + body), max_tokens,
                                    routing={"handler": "model", "mode": mode, "reason": "owner-triggered knowledge benchmark"})
        except ai_budget.BudgetDenied as e:
            stopped = e.message
            break
        try:
            with jarvis.client().messages.stream(model=model, max_tokens=max_tokens, system=ANSWER_PROMPT, output_config={"effort": effort},
                                                 messages=[{"role": "user", "content": body}]) as st:
                msg = st.get_final_message()
            cost += ai_budget.settle(uid, msg.usage, getattr(msg, "_request_id", None))
            ans = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        except Exception as e:
            ai_budget.assume(uid, type(e).__name__)
            stopped = f"provider error ({type(e).__name__})"
            break
        g = grade(q, ans)
        rows.append({"id": q["id"], "category": q["category"], "type": q["type"], "correct": g["correct"], "retrieved": [r["slug"] for r in ctx]})
        c = by_cat.setdefault(q["category"], [0, 0])
        c[0] += g["correct"]
        c[1] += 1
    n = len(rows)
    out = {"ran": n > 0, "kind": "answers", "split": split, "model": model, "n": n,
           "score": round(sum(r["correct"] for r in rows) / n, 3) if n else None,
           "by_category": {k: {"correct": v[0], "n": v[1]} for k, v in sorted(by_cat.items())}, "cost_usd": round(cost, 4),
           "stopped_early": stopped,
           "note": "Graded by fixed rules against model-written keys that no person has reviewed yet. Treat the score as provisional."}
    if n:
        with session_scope() as s:
            s.add(CortexBenchmarkRun(kind="answers", split=split, model=model, n=n, score=out["score"], by_category=out["by_category"],
                                     details=[r for r in rows if not r["correct"]][:60], cost_usd=out["cost_usd"]))
    return out
