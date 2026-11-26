"""Runtime configuration. All secrets come from the environment; nothing here is a secret."""
from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict

ET = ZoneInfo("America/New_York")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GIZER_", env_file=".env", extra="ignore")

    env: str = "development"  # development | test | production
    database_url: str = "postgresql+psycopg://gizer:gizer_dev@localhost:5432/gizer_nba"
    public_origin: str = "http://localhost:3000"

    # auth
    owner_email: str = ""
    owner_password: str = ""  # only used by `gizer bootstrap-owner`; never stored in plaintext
    session_hours: int = 12
    cookie_secure: bool = True
    login_max_attempts: int = 8  # per 15 minutes per client

    # providers
    odds_api_key: str = ""  # The Odds API; empty => player-prop quotes are reported unavailable
    odds_api_monthly_quota: int = 500  # free tier; hard cap enforced in code
    odds_api_monthly_cost_usd: float = 0.0
    espn_enabled: bool = True
    kalshi_enabled: bool = True          # public read-only market data; no key, no trading
    kalshi_poll_minutes: int = 5         # observation cadence while games are upcoming (polling; not real-time)
    availability_poll_minutes: int = 20  # injury + lineup refresh cadence between editions
    watch_hours_before_tipoff: int = 14
    pbpstats_enabled: bool = True
    provider_min_interval_s: float = 0.8
    http_timeout_s: float = 30.0
    user_agent: str = "gizer-nba-research/0.1"

    # GIZER LIVE (server-side polling of the public ESPN feed; observations are delayed, never "real time")
    live_enabled: bool = True
    live_poll_seconds: int = 15            # while a game is in progress
    live_pregame_poll_seconds: int = 45    # within 20 minutes of tipoff, or everything at halftime
    live_idle_poll_seconds: int = 180      # games later today
    live_stale_seconds: int = 90           # a live game not observed for this long is labelled stale

    # LLM (optional; platform is fully functional without it)
    llm_provider: str = ""
    llm_monthly_budget_usd: float = 0.0

    # JARVIS. The API key is read from ANTHROPIC_API_KEY by the SDK itself and never stored or logged here.
    jarvis_enabled: bool = True
    jarvis_lifetime_cap_usd: float = 100.0      # owner-authorised cumulative budget (D-024); not a monthly figure
    jarvis_suspend_at_usd: float = 95.0
    jarvis_daily_cap_usd: float = 2.0
    jarvis_model_sonnet: str = "claude-sonnet-5-5"
    jarvis_model_haiku: str = "claude-haiku-5-5"
    jarvis_model_opus: str = "claude-opus-5-5"
    jarvis_max_tool_rounds: int = 6
    jarvis_request_timeout_s: float = 120.0
    jarvis_briefings_use_llm: bool = True

    # research
    paper_unit: float = 1.0
    sim_draws: int = 20000
    seasons: str = "2025-26,2026-27"

    @property
    def season_list(self) -> list[str]:
        return [s.strip() for s in self.seasons.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
