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
    pbpstats_enabled: bool = True
    provider_min_interval_s: float = 0.8
    http_timeout_s: float = 30.0
    user_agent: str = "gizer-nba-research/0.1"

    # LLM (optional; platform is fully functional without it)
    llm_provider: str = ""
    llm_monthly_budget_usd: float = 0.0

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
