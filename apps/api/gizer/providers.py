"""Provider adapters.

Each adapter provides: authentication (if any), rate limiting, retries with exponential backoff, schema
validation into normalised records, usage accounting (ProviderCall rows) and source attribution.
A failed provider raises ProviderError; callers must abstain. Adapters never return substitute data.
"""
from __future__ import annotations

import hashlib
import json
import re
import threading
import time
import unicodedata
from datetime import date, datetime, timezone

import httpx
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select

from .config import ET, get_settings
from .db import ProviderCall, RawPayload, session_scope

# (nba_team_id, abbr, name, espn_abbr)
TEAMS = [
    (1610612737, "ATL", "Atlanta Hawks", "ATL"), (1610612738, "BOS", "Boston Celtics", "BOS"),
    (1610612739, "CLE", "Cleveland Cavaliers", "CLE"), (1610612740, "NOP", "New Orleans Pelicans", "NO"),
    (1610612741, "CHI", "Chicago Bulls", "CHI"), (1610612742, "DAL", "Dallas Mavericks", "DAL"),
    (1610612743, "DEN", "Denver Nuggets", "DEN"), (1610612744, "GSW", "Golden State Warriors", "GS"),
    (1610612745, "HOU", "Houston Rockets", "HOU"), (1610612746, "LAC", "LA Clippers", "LAC"),
    (1610612747, "LAL", "Los Angeles Lakers", "LAL"), (1610612748, "MIA", "Miami Heat", "MIA"),
    (1610612749, "MIL", "Milwaukee Bucks", "MIL"), (1610612750, "MIN", "Minnesota Timberwolves", "MIN"),
    (1610612751, "BKN", "Brooklyn Nets", "BKN"), (1610612752, "NYK", "New York Knicks", "NY"),
    (1610612753, "ORL", "Orlando Magic", "ORL"), (1610612754, "IND", "Indiana Pacers", "IND"),
    (1610612755, "PHI", "Philadelphia 76ers", "PHI"), (1610612756, "PHX", "Phoenix Suns", "PHX"),
    (1610612757, "POR", "Portland Trail Blazers", "POR"), (1610612758, "SAC", "Sacramento Kings", "SAC"),
    (1610612759, "SAS", "San Antonio Spurs", "SA"), (1610612760, "OKC", "Oklahoma City Thunder", "OKC"),
    (1610612761, "TOR", "Toronto Raptors", "TOR"), (1610612762, "UTA", "Utah Jazz", "UTAH"),
    (1610612763, "MEM", "Memphis Grizzlies", "MEM"), (1610612764, "WAS", "Washington Wizards", "WSH"),
    (1610612765, "DET", "Detroit Pistons", "DET"), (1610612766, "CHA", "Charlotte Hornets", "CHA"),
]
ESPN_ABBR_TO_ID = {t[3]: t[0] for t in TEAMS}
ABBR_TO_ID = {t[1]: t[0] for t in TEAMS}

_SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?")


def name_key(name: str) -> str:
    """Normalise a player name for cross-provider matching (accents, punctuation, suffixes)."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = _SUFFIX.sub("", s)
    return re.sub(r"[^a-z]", "", s)


class ProviderError(RuntimeError):
    pass


class ProviderDisabled(ProviderError):
    pass


class QuotaExceeded(ProviderError):
    pass


_locks: dict[str, threading.Lock] = {}
_last_call: dict[str, float] = {}


class BaseProvider:
    name = "base"
    base_url = ""
    store_raw = False
    max_retries = 3

    def __init__(self, client: httpx.Client | None = None, sleep=time.sleep):
        self.settings = get_settings()
        self.client = client or httpx.Client(timeout=self.settings.http_timeout_s,
                                             headers={"User-Agent": self.settings.user_agent})
        self._sleep = sleep

    # -- hooks
    def auth_params(self) -> dict:
        return {}

    def check_quota(self, cost: int):
        return None

    def _throttle(self):
        lock = _locks.setdefault(self.name, threading.Lock())
        with lock:
            wait = self.settings.provider_min_interval_s - (time.monotonic() - _last_call.get(self.name, 0.0))
            if wait > 0:
                self._sleep(wait)
            _last_call[self.name] = time.monotonic()

    def _log(self, endpoint, status, ok, ms, nbytes, cost, error=None):
        try:
            with session_scope() as s:
                s.add(ProviderCall(provider=self.name, endpoint=endpoint[:160], status=status, ok=ok,
                                   duration_ms=ms, bytes=nbytes, quota_cost=cost,
                                   error=(error or None) and str(error)[:300]))
        except Exception:  # usage logging must never mask the provider result
            pass

    def get_json(self, path: str, params: dict | None = None, *, cost: int = 0, raw_key: str | None = None):
        self.check_quota(cost)
        url = self.base_url + path
        q = {**(params or {}), **self.auth_params()}
        last_err: Exception | None = None
        for attempt in range(self.max_retries + 1):
            self._throttle()
            t0 = time.monotonic()
            try:
                r = self.client.get(url, params=q)
                ms = int((time.monotonic() - t0) * 1000)
                _last_call[self.name] = time.monotonic()  # space requests from completion, not start
                if r.status_code == 200:
                    data = r.json()
                    self._log(path, 200, True, ms, len(r.content), cost)
                    if self.store_raw and raw_key:
                        with session_scope() as s:
                            s.add(RawPayload(provider=self.name, resource=raw_key[:160], body=data,
                                             sha256=hashlib.sha256(r.content).hexdigest()))
                    return data
                self._log(path, r.status_code, False, ms, len(r.content), 0, f"HTTP {r.status_code}")
                last_err = ProviderError(f"{self.name} {path}: HTTP {r.status_code}")
                if r.status_code in (400, 401, 403, 404, 422):
                    break  # not retryable
            except (httpx.HTTPError, json.JSONDecodeError) as e:
                self._log(path, 0, False, int((time.monotonic() - t0) * 1000), 0, 0, repr(e))
                last_err = ProviderError(f"{self.name} {path}: {type(e).__name__}")
            if attempt < self.max_retries:
                self._sleep(min(30.0, 1.5 * 2 ** attempt))
        raise last_err or ProviderError(f"{self.name} {path}: failed")


# ---------------------------------------------------------------- normalised records
class GameRec(BaseModel):
    provider: str
    nba_game_id: str | None = None
    espn_event_id: str | None = None
    season: str
    game_date: date
    tipoff_utc: datetime | None = None
    home_team_id: int
    away_team_id: int
    status: str
    home_points: int | None = None
    away_points: int | None = None
    home_poss: int | None = None
    away_poss: int | None = None
    venue: str | None = None


class PlayerBoxRec(BaseModel):
    player_id: int
    name: str
    team_id: int
    opp_team_id: int
    is_home: bool
    minutes: float
    pts: int = 0
    reb: int = 0
    ast: int = 0
    fg3m: int = 0
    stl: int = 0
    blk: int = 0
    tov: int = 0
    fga: int = 0
    fta: int = 0
    usage: float | None = None


class InjuryRec(BaseModel):
    provider: str
    source_id: str | None
    player_name: str
    team_id: int | None
    status: str
    detail: str | None = None
    comment: str | None = None
    position: str | None = None
    source_published_at: datetime | None = None


class OddsRec(BaseModel):
    provider: str
    book: str
    espn_event_id: str | None = None
    home_team_id: int | None = None
    away_team_id: int | None = None
    game_date: date | None = None
    market: str
    subject_type: str
    subject_name: str | None = None
    side: str
    line: float | None = None
    price_american: int | None = None
    source_published_at: datetime | None = None


def season_for_date(d: date) -> str:
    y = d.year if d.month >= 8 else d.year - 1
    return f"{y}-{str(y + 1)[2:]}"


def _minutes(v) -> float:
    if v in (None, ""):
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    m, _, sec = str(v).partition(":")
    return round(int(m) + (int(sec or 0) / 60.0), 2)


def _american(v) -> int | None:
    if v in (None, "", "OFF"):
        return None
    s = str(v).strip().upper()
    if s in ("EVEN", "EV"):
        return 100
    try:
        return int(s.replace("+", ""))
    except ValueError:
        return None


# ---------------------------------------------------------------- PBP Stats
class PbpStatsProvider(BaseProvider):
    """api.pbpstats.com public API: completed games and per-game player totals."""
    name = "pbpstats"
    base_url = "https://api.pbpstats.com"

    def games(self, season: str, season_type: str = "Regular Season") -> list[GameRec]:
        if not self.settings.pbpstats_enabled:
            raise ProviderDisabled("pbpstats disabled")
        data = self.get_json("/get-games/nba", {"Season": season, "SeasonType": season_type})
        out = []
        try:
            for g in data["results"]:
                out.append(GameRec(provider=self.name, nba_game_id=str(g["GameId"]), season=season,
                                   game_date=date.fromisoformat(g["Date"]),
                                   home_team_id=int(g["HomeTeamId"]), away_team_id=int(g["AwayTeamId"]),
                                   status="final", home_points=int(g["HomePoints"]),
                                   away_points=int(g["AwayPoints"]), home_poss=g.get("HomePossessions"),
                                   away_poss=g.get("AwayPossessions")))
        except (KeyError, TypeError, ValueError, ValidationError) as e:
            raise ProviderError(f"pbpstats games: schema validation failed ({type(e).__name__}: {e})") from e
        return out

    def player_box(self, nba_game_id: str) -> list[PlayerBoxRec]:
        data = self.get_json("/get-game-stats", {"GameId": nba_game_id, "Type": "Player"})
        try:
            home_id, away_id = int(data["home_team_id"]), int(data["away_team_id"])
            out = []
            for side, team, opp in (("Home", home_id, away_id), ("Away", away_id, home_id)):
                for p in data["stats"][side]["FullGame"]:
                    if str(p.get("EntityId")) == "0":
                        continue  # team-level row
                    mins = _minutes(p.get("Minutes"))
                    if mins <= 0:
                        continue
                    out.append(PlayerBoxRec(
                        player_id=int(p["EntityId"]), name=p["Name"], team_id=team, opp_team_id=opp,
                        is_home=side == "Home", minutes=mins, pts=p.get("Points", 0), reb=p.get("Rebounds", 0),
                        ast=p.get("Assists", 0), fg3m=p.get("FG3M", 0), stl=p.get("Steals", 0),
                        blk=p.get("Blocks", 0), tov=p.get("Turnovers", 0),
                        fga=p.get("FG2A", 0) + p.get("FG3A", 0), fta=p.get("FTA", 0), usage=p.get("Usage")))
        except (KeyError, TypeError, ValueError, ValidationError) as e:
            raise ProviderError(f"pbpstats box {nba_game_id}: schema validation failed ({e})") from e
        if len(out) < 10:
            raise ProviderError(f"pbpstats box {nba_game_id}: only {len(out)} player rows (rejected as invalid)")
        return out


# ---------------------------------------------------------------- ESPN
class EspnProvider(BaseProvider):
    """ESPN public site API: schedule/scoreboard, consensus game odds shown by ESPN, injuries.

    Unofficial endpoint (no published contract). See DATA-SOURCES.md for the licensing caveat.
    """
    name = "espn"
    base_url = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"

    def scoreboard(self, d: date) -> tuple[list[GameRec], list[OddsRec]]:
        if not self.settings.espn_enabled:
            raise ProviderDisabled("espn disabled")
        # A US game day in ET can spill into the next UTC date; ESPN's `dates` parameter is ET-based.
        data = self.get_json("/scoreboard", {"dates": d.strftime("%Y%m%d")})
        games, odds = [], []
        try:
            for ev in data.get("events", []):
                comp = ev["competitions"][0]
                if ev.get("season", {}).get("type") not in (2, 3, None):
                    continue  # skip preseason / all-star
                sides = {c["homeAway"]: c for c in comp["competitors"]}
                h = ESPN_ABBR_TO_ID.get(sides["home"]["team"]["abbreviation"])
                a = ESPN_ABBR_TO_ID.get(sides["away"]["team"]["abbreviation"])
                if not h or not a:
                    continue  # non-NBA-franchise exhibition
                tip = datetime.fromisoformat(ev["date"].replace("Z", "+00:00"))
                st = comp["status"]["type"]
                nm = st.get("name", "")
                status = ("final" if st.get("completed") else "postponed" if "POSTPONED" in nm or "CANCEL" in nm
                          else "live" if st.get("state") == "in" else "scheduled")
                gdate = tip.astimezone(ET).date()
                final = status == "final"
                games.append(GameRec(
                    provider=self.name, espn_event_id=str(ev["id"]), season=season_for_date(gdate),
                    game_date=gdate, tipoff_utc=tip, home_team_id=h, away_team_id=a, status=status,
                    home_points=int(sides["home"]["score"]) if final else None,
                    away_points=int(sides["away"]["score"]) if final else None,
                    venue=(comp.get("venue") or {}).get("fullName")))
                if status != "scheduled":
                    continue  # pregame quotes only
                for o in comp.get("odds") or []:
                    book = (o.get("provider") or {}).get("name")
                    if not book:
                        continue
                    common = dict(provider=self.name, book=book, espn_event_id=str(ev["id"]), home_team_id=h,
                                  away_team_id=a, game_date=gdate)
                    ps, tot, ml = o.get("pointSpread") or {}, o.get("total") or {}, o.get("moneyline") or {}
                    for side in ("home", "away"):
                        cl = (ps.get(side) or {}).get("close") or {}
                        if cl.get("line") not in (None, ""):
                            odds.append(OddsRec(**common, market="spread", subject_type="team", side=side,
                                                line=float(str(cl["line"]).replace("+", "")),
                                                price_american=_american(cl.get("odds"))))
                        mcl = (ml.get(side) or {}).get("close") or {}
                        if _american(mcl.get("odds")) is not None:
                            odds.append(OddsRec(**common, market="moneyline", subject_type="team", side=side,
                                                price_american=_american(mcl.get("odds"))))
                    for side in ("over", "under"):
                        cl = (tot.get(side) or {}).get("close") or {}
                        if cl.get("line"):
                            odds.append(OddsRec(**common, market="total", subject_type="game", side=side,
                                                line=float(str(cl["line"]).lstrip("ou")),
                                                price_american=_american(cl.get("odds"))))
        except (KeyError, TypeError, ValueError, ValidationError) as e:
            raise ProviderError(f"espn scoreboard: schema validation failed ({type(e).__name__}: {e})") from e
        return games, odds

    def injuries(self) -> list[InjuryRec]:
        if not self.settings.espn_enabled:
            raise ProviderDisabled("espn disabled")
        data = self.get_json("/injuries")
        out = []
        try:
            for team in data["injuries"]:
                for i in team.get("injuries", []):
                    ath = i.get("athlete") or {}
                    tabbr = (ath.get("team") or {}).get("abbreviation")
                    det = i.get("details") or {}
                    detail = " ".join(x for x in (det.get("side"), det.get("type"), det.get("detail")) if x) or None
                    pub = i.get("date")
                    out.append(InjuryRec(
                        provider=self.name, source_id=str(i.get("id")) if i.get("id") else None,
                        player_name=ath["displayName"], team_id=ESPN_ABBR_TO_ID.get(tabbr),
                        status=i.get("status") or "Unknown", detail=detail, comment=i.get("shortComment"),
                        position=(ath.get("position") or {}).get("abbreviation"),
                        source_published_at=datetime.fromisoformat(pub.replace("Z", "+00:00")) if pub else None))
        except (KeyError, TypeError, ValueError, ValidationError) as e:
            raise ProviderError(f"espn injuries: schema validation failed ({type(e).__name__}: {e})") from e
        return out


# ---------------------------------------------------------------- The Odds API
PROP_MARKETS = {"player_points": "player_pts", "player_rebounds": "player_reb", "player_assists": "player_ast",
                "player_threes": "player_fg3m"}


class OddsApiProvider(BaseProvider):
    """The Odds API v4 (requires GIZER_ODDS_API_KEY). Monthly quota is a hard cap enforced before each call.

    NOT VERIFIED against the live service in this repository's CI: no key was available. The parser is
    covered by a contract test built from the provider's published response shape.
    """
    name = "oddsapi"
    base_url = "https://api.the-odds-api.com/v4"

    def auth_params(self) -> dict:
        if not self.settings.odds_api_key:
            raise ProviderDisabled("GIZER_ODDS_API_KEY is not configured")
        return {"apiKey": self.settings.odds_api_key}

    def month_usage(self) -> int:
        start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        with session_scope() as s:
            return int(s.scalar(select(func.coalesce(func.sum(ProviderCall.quota_cost), 0)).where(
                ProviderCall.provider == self.name, ProviderCall.called_at >= start)) or 0)

    def check_quota(self, cost: int):
        if cost and self.month_usage() + cost > self.settings.odds_api_monthly_quota:
            raise QuotaExceeded("The Odds API monthly quota cap reached; price-dependent research is unavailable")

    def events(self) -> list[dict]:
        return self.get_json("/sports/basketball_nba/events", cost=0)

    def player_props(self, event_id: str, markets=tuple(PROP_MARKETS), regions: str = "us") -> list[OddsRec]:
        data = self.get_json(f"/sports/basketball_nba/events/{event_id}/odds",
                             {"regions": regions, "markets": ",".join(markets), "oddsFormat": "american"},
                             cost=len(markets))
        return self.parse_props(data)

    def parse_props(self, data: dict) -> list[OddsRec]:
        out = []
        try:
            h, a = name_to_team(data["home_team"]), name_to_team(data["away_team"])
            gdate = datetime.fromisoformat(data["commence_time"].replace("Z", "+00:00")).astimezone(ET).date()
            for bk in data.get("bookmakers", []):
                for m in bk.get("markets", []):
                    market = PROP_MARKETS.get(m["key"])
                    if not market:
                        continue
                    pub = m.get("last_update")
                    for o in m.get("outcomes", []):
                        out.append(OddsRec(
                            provider=self.name, book=bk["title"], home_team_id=h, away_team_id=a, game_date=gdate,
                            market=market, subject_type="player", subject_name=o["description"],
                            side=o["name"].lower(), line=float(o["point"]), price_american=int(o["price"]),
                            source_published_at=datetime.fromisoformat(pub.replace("Z", "+00:00")) if pub else None))
        except (KeyError, TypeError, ValueError, ValidationError) as e:
            raise ProviderError(f"oddsapi props: schema validation failed ({type(e).__name__}: {e})") from e
        return out


def name_to_team(full_name: str) -> int | None:
    for tid, _, name, _ in TEAMS:
        if name.lower() == full_name.lower() or (name == "LA Clippers" and full_name == "Los Angeles Clippers"):
            return tid
    return None
