"""Database schema (the knowledge warehouse) and session helpers.

Design rules enforced here, not only in documentation:
* Snapshot/prediction/ledger tables are append-only. PostgreSQL triggers (see IMMUTABLE_TABLES) reject
  UPDATE and DELETE, so history cannot be silently rewritten even by application bugs.
* Every time-sensitive row carries provider, ingestion timestamp and (where the source gives one) the
  source publication timestamp, so point-in-time joins are possible.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime, timezone

from sqlalchemy import (JSON, BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String,
                        Text, UniqueConstraint, create_engine, text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import get_settings

SCHEMA_VERSION = 1
JS = JSON().with_variant(JSONB, "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


def _ts(**kw):
    return mapped_column(DateTime(timezone=True), **kw)


# ---------------------------------------------------------------- reference entities
class Season(Base):
    __tablename__ = "seasons"
    id: Mapped[str] = mapped_column(String(8), primary_key=True)  # "2026-27"
    start_year: Mapped[int] = mapped_column(Integer)


class Team(Base):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)  # NBA team id
    abbr: Mapped[str] = mapped_column(String(4), unique=True)
    name: Mapped[str] = mapped_column(String(64))
    espn_id: Mapped[str | None] = mapped_column(String(8))
    espn_abbr: Mapped[str | None] = mapped_column(String(6))
    logo_url: Mapped[str | None] = mapped_column(String(255))


class Player(Base):
    __tablename__ = "players"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)  # NBA player id
    name: Mapped[str] = mapped_column(String(96), index=True)
    name_key: Mapped[str] = mapped_column(String(96), index=True)  # normalised for cross-provider matching
    team_id: Mapped[int | None] = mapped_column(BigInteger, index=True)  # most recent team seen in a box score
    position: Mapped[str | None] = mapped_column(String(8))
    last_game_date: Mapped[date | None] = mapped_column(Date)
    espn_id: Mapped[str | None] = mapped_column(String(16), index=True)
    jersey: Mapped[str | None] = mapped_column(String(4))
    headshot_url: Mapped[str | None] = mapped_column(String(255))


class Game(Base):
    __tablename__ = "games"
    id: Mapped[str] = mapped_column(String(12), primary_key=True)  # NBA game id, e.g. 0022600001
    season: Mapped[str] = mapped_column(String(8), index=True)
    season_type: Mapped[str] = mapped_column(String(16), default="Regular Season")
    game_date: Mapped[date] = mapped_column(Date, index=True)  # America/New_York calendar date
    tipoff_utc: Mapped[datetime | None] = _ts()
    home_team_id: Mapped[int] = mapped_column(BigInteger, index=True)
    away_team_id: Mapped[int] = mapped_column(BigInteger, index=True)
    status: Mapped[str] = mapped_column(String(16), default="scheduled")  # scheduled|live|final|postponed
    home_points: Mapped[int | None] = mapped_column(Integer)
    away_points: Mapped[int | None] = mapped_column(Integer)
    home_poss: Mapped[int | None] = mapped_column(Integer)
    away_poss: Mapped[int | None] = mapped_column(Integer)
    venue: Mapped[str | None] = mapped_column(String(96))
    espn_event_id: Mapped[str | None] = mapped_column(String(16), index=True)
    provider: Mapped[str] = mapped_column(String(24))
    box_ingested_at: Mapped[datetime | None] = _ts()
    lineup_ingested_at: Mapped[datetime | None] = _ts()  # confirmed starters / DNP list ingested
    ingested_at: Mapped[datetime] = _ts(default=utcnow)
    updated_at: Mapped[datetime] = _ts(default=utcnow, onupdate=utcnow)


class PlayerBox(Base):
    __tablename__ = "player_box"
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id"), primary_key=True)
    player_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    team_id: Mapped[int] = mapped_column(BigInteger, index=True)
    opp_team_id: Mapped[int] = mapped_column(BigInteger)
    game_date: Mapped[date] = mapped_column(Date, index=True)
    season: Mapped[str] = mapped_column(String(8))
    is_home: Mapped[bool] = mapped_column(Boolean)
    minutes: Mapped[float] = mapped_column(Float)
    pts: Mapped[int] = mapped_column(Integer)
    reb: Mapped[int] = mapped_column(Integer)
    ast: Mapped[int] = mapped_column(Integer)
    fg3m: Mapped[int] = mapped_column(Integer)
    stl: Mapped[int] = mapped_column(Integer)
    blk: Mapped[int] = mapped_column(Integer)
    tov: Mapped[int] = mapped_column(Integer)
    fga: Mapped[int] = mapped_column(Integer)
    fta: Mapped[int] = mapped_column(Integer)
    usage: Mapped[float | None] = mapped_column(Float)
    starter: Mapped[bool | None] = mapped_column(Boolean)  # null = starter status not known
    provider: Mapped[str] = mapped_column(String(24))
    ingested_at: Mapped[datetime] = _ts(default=utcnow)
    __table_args__ = (Index("ix_player_box_player_date", "player_id", "game_date"),)


class PlayerAbsence(Base):
    """A team game in which a rostered player did not appear (never treated as a zero-stat appearance)."""
    __tablename__ = "player_absences"
    game_id: Mapped[str] = mapped_column(String(12), primary_key=True)
    player_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    team_id: Mapped[int] = mapped_column(BigInteger)
    game_date: Mapped[date] = mapped_column(Date, index=True)
    reason: Mapped[str | None] = mapped_column(String(160))
    provider: Mapped[str] = mapped_column(String(24))
    ingested_at: Mapped[datetime] = _ts(default=utcnow)


class LineupSnapshot(Base):
    """Append-only lineup snapshot for one team in one game. status: confirmed | projected."""
    __tablename__ = "lineup_snapshots"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    game_id: Mapped[str] = mapped_column(String(12), index=True)
    team_id: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(12))
    source: Mapped[str] = mapped_column(String(160))
    signature: Mapped[str] = mapped_column(String(64))  # hash of status + ordered starters + availability
    players: Mapped[list] = mapped_column(JS)
    change: Mapped[str | None] = mapped_column(Text)  # human-readable difference vs the previous snapshot
    verified_at: Mapped[datetime] = _ts(default=utcnow)
    ingested_at: Mapped[datetime] = _ts(default=utcnow, index=True)


class KalshiMarket(Base):
    """One Kalshi contract as discovered. Wording and rules are stored as first seen; only status/last_seen change."""
    __tablename__ = "kalshi_markets"
    ticker: Mapped[str] = mapped_column(String(80), primary_key=True)
    event_ticker: Mapped[str] = mapped_column(String(64), index=True)
    series: Mapped[str] = mapped_column(String(32), index=True)
    game_id: Mapped[str] = mapped_column(String(12), index=True)
    kind: Mapped[str] = mapped_column(String(12))  # player | game | total | spread | other
    market: Mapped[str | None] = mapped_column(String(24))  # canonical market when normalised
    stat: Mapped[str | None] = mapped_column(String(8))
    player_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    player_name: Mapped[str | None] = mapped_column(String(96))
    team_id: Mapped[int | None] = mapped_column(BigInteger)
    threshold: Mapped[float | None] = mapped_column(Float)  # exact strike as listed (e.g. 29.5 for "30+")
    comparator: Mapped[str | None] = mapped_column(String(16))
    contract_type: Mapped[str | None] = mapped_column(String(24))
    strike_type: Mapped[str | None] = mapped_column(String(24))
    interpretation: Mapped[str] = mapped_column(String(12))  # normalized | unsupported | unmatched
    interpretation_note: Mapped[str | None] = mapped_column(String(300))
    protected: Mapped[bool] = mapped_column(Boolean, default=False)
    title: Mapped[str] = mapped_column(String(300))
    yes_sub_title: Mapped[str | None] = mapped_column(String(200))
    rules_primary: Mapped[str | None] = mapped_column(Text)
    rules_secondary: Mapped[str | None] = mapped_column(Text)
    open_time: Mapped[datetime | None] = _ts()
    close_time: Mapped[datetime | None] = _ts()
    status: Mapped[str] = mapped_column(String(16))
    first_seen_at: Mapped[datetime] = _ts(default=utcnow)
    last_seen_at: Mapped[datetime] = _ts(default=utcnow)


class KalshiSnapshot(Base):
    """Append-only price/liquidity observation of one contract. Stored only when something changed."""
    __tablename__ = "kalshi_snapshots"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(80), index=True)
    observed_at: Mapped[datetime] = _ts(default=utcnow, index=True)
    yes_bid: Mapped[float | None] = mapped_column(Float)
    yes_ask: Mapped[float | None] = mapped_column(Float)
    no_bid: Mapped[float | None] = mapped_column(Float)
    no_ask: Mapped[float | None] = mapped_column(Float)
    last_price: Mapped[float | None] = mapped_column(Float)
    yes_bid_size: Mapped[float | None] = mapped_column(Float)
    yes_ask_size: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[float | None] = mapped_column(Float)
    volume_24h: Mapped[float | None] = mapped_column(Float)
    open_interest: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(16))


class RawPayload(Base):
    """Raw provider responses (where licensing permits) for reproducibility."""
    __tablename__ = "raw_payloads"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(24), index=True)
    resource: Mapped[str] = mapped_column(String(160), index=True)
    sha256: Mapped[str] = mapped_column(String(64))
    fetched_at: Mapped[datetime] = _ts(default=utcnow)
    body: Mapped[dict] = mapped_column(JS)


class ProviderCall(Base):
    """One row per outbound provider request: the basis of the cost/quota dashboard."""
    __tablename__ = "provider_calls"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(24), index=True)
    endpoint: Mapped[str] = mapped_column(String(160))
    status: Mapped[int] = mapped_column(Integer)  # HTTP status; 0 = transport failure
    ok: Mapped[bool] = mapped_column(Boolean)
    duration_ms: Mapped[int] = mapped_column(Integer)
    bytes: Mapped[int] = mapped_column(Integer, default=0)
    quota_cost: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(String(300))
    called_at: Mapped[datetime] = _ts(default=utcnow, index=True)


# ---------------------------------------------------------------- append-only snapshots
class InjurySnapshot(Base):
    __tablename__ = "injury_snapshots"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    batch_id: Mapped[str] = mapped_column(String(40), index=True)
    player_id: Mapped[int | None] = mapped_column(BigInteger, index=True)  # null = could not be matched
    player_name: Mapped[str] = mapped_column(String(96))
    team_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    status: Mapped[str] = mapped_column(String(32))  # as published by the source, e.g. Out / Day-To-Day
    detail: Mapped[str | None] = mapped_column(String(160))
    comment: Mapped[str | None] = mapped_column(Text)
    source_published_at: Mapped[datetime | None] = _ts()
    provider: Mapped[str] = mapped_column(String(24))
    source_id: Mapped[str | None] = mapped_column(String(40))
    ingested_at: Mapped[datetime] = _ts(default=utcnow, index=True)
    schema_version: Mapped[int] = mapped_column(Integer, default=SCHEMA_VERSION)
    quality: Mapped[str] = mapped_column(String(16), default="ok")  # ok | unmatched


class OddsSnapshot(Base):
    __tablename__ = "odds_snapshots"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    game_id: Mapped[str] = mapped_column(String(12), index=True)
    market: Mapped[str] = mapped_column(String(24))  # spread | total | moneyline | player_pts ...
    subject_type: Mapped[str] = mapped_column(String(8))  # team | game | player
    subject_id: Mapped[int | None] = mapped_column(BigInteger)
    side: Mapped[str] = mapped_column(String(8))  # home|away|over|under
    line: Mapped[float | None] = mapped_column(Float)
    price_american: Mapped[int | None] = mapped_column(Integer)
    book: Mapped[str] = mapped_column(String(32))
    provider: Mapped[str] = mapped_column(String(24))
    source_published_at: Mapped[datetime | None] = _ts()
    ingested_at: Mapped[datetime] = _ts(default=utcnow, index=True)
    schema_version: Mapped[int] = mapped_column(Integer, default=SCHEMA_VERSION)
    # provider = sourced automatically; owner_entered = typed in by the owner; hypothetical = research threshold
    origin: Mapped[str] = mapped_column(String(16), default="provider", server_default="provider")
    note: Mapped[str | None] = mapped_column(String(300))
    source_ref: Mapped[str | None] = mapped_column(String(300))
    created_by: Mapped[str | None] = mapped_column(String(160))
    __table_args__ = (Index("ix_odds_game_market", "game_id", "market", "ingested_at"),)


# ---------------------------------------------------------------- models and predictions
class ModelVersion(Base):
    __tablename__ = "model_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    family: Mapped[str] = mapped_column(String(32))  # e.g. player_pts, team_game
    name: Mapped[str] = mapped_column(String(48))  # e.g. minutes_rate_nb
    version: Mapped[str] = mapped_column(String(24))
    status: Mapped[str] = mapped_column(String(16), default="candidate")  # candidate|production|retired|rejected
    params: Mapped[dict] = mapped_column(JS)
    training_period: Mapped[str | None] = mapped_column(String(48))
    calibration_period: Mapped[str | None] = mapped_column(String(48))
    evaluation_period: Mapped[str | None] = mapped_column(String(48))
    limitations: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(48))
    promoted_by: Mapped[str | None] = mapped_column(String(48))
    promoted_at: Mapped[datetime | None] = _ts()
    created_at: Mapped[datetime] = _ts(default=utcnow)
    __table_args__ = (UniqueConstraint("family", "name", "version"),)


class ModelEvaluation(Base):
    __tablename__ = "model_evaluations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_version_id: Mapped[int | None] = mapped_column(Integer, index=True)
    family: Mapped[str] = mapped_column(String(32), index=True)
    model_name: Mapped[str] = mapped_column(String(48))
    kind: Mapped[str] = mapped_column(String(24))  # walk_forward | correlation | weekly | forward
    period: Mapped[str] = mapped_column(String(48))
    n_obs: Mapped[int] = mapped_column(Integer)
    metrics: Mapped[dict] = mapped_column(JS)
    passed: Mapped[bool | None] = mapped_column(Boolean)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _ts(default=utcnow)


class Prediction(Base):
    """Immutable predictive distribution for one subject/stat in one game."""
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    game_id: Mapped[str] = mapped_column(String(12), index=True)
    game_date: Mapped[date] = mapped_column(Date, index=True)
    subject_type: Mapped[str] = mapped_column(String(8))  # player | game
    subject_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    stat: Mapped[str] = mapped_column(String(16))  # pts, reb, ..., margin, total
    model_version_id: Mapped[int] = mapped_column(Integer, index=True)
    mean: Mapped[float] = mapped_column(Float)
    dist: Mapped[dict] = mapped_column(JS)  # {"family": "nbinom"|"normal", params...}
    p10: Mapped[float] = mapped_column(Float)
    p50: Mapped[float] = mapped_column(Float)
    p90: Mapped[float] = mapped_column(Float)
    features: Mapped[dict] = mapped_column(JS)  # the point-in-time feature snapshot used
    data_cutoff: Mapped[datetime] = _ts()  # nothing ingested after this instant was used
    edition_key: Mapped[str] = mapped_column(String(48), index=True)
    created_at: Mapped[datetime] = _ts(default=utcnow)


class Selection(Base):
    """Immutable evaluated market selection (one side of one quoted market) within an edition."""
    __tablename__ = "selections"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    edition_id: Mapped[int] = mapped_column(Integer, index=True)
    game_id: Mapped[str] = mapped_column(String(12), index=True)
    game_date: Mapped[date] = mapped_column(Date, index=True)
    key: Mapped[str] = mapped_column(String(80), index=True)  # stable identity across editions
    market: Mapped[str] = mapped_column(String(24))
    subject_type: Mapped[str] = mapped_column(String(8))
    subject_id: Mapped[int | None] = mapped_column(BigInteger)
    subject_name: Mapped[str] = mapped_column(String(96))
    team_id: Mapped[int | None] = mapped_column(BigInteger)
    side: Mapped[str] = mapped_column(String(8))
    line: Mapped[float | None] = mapped_column(Float)
    price_american: Mapped[int | None] = mapped_column(Integer)
    book: Mapped[str | None] = mapped_column(String(32))
    odds_snapshot_id: Mapped[int | None] = mapped_column(BigInteger)
    prediction_id: Mapped[int | None] = mapped_column(BigInteger)
    model_version_id: Mapped[int | None] = mapped_column(Integer)
    projection: Mapped[float | None] = mapped_column(Float)
    prob: Mapped[float | None] = mapped_column(Float)
    prob_low: Mapped[float | None] = mapped_column(Float)
    prob_high: Mapped[float | None] = mapped_column(Float)
    breakeven: Mapped[float | None] = mapped_column(Float)
    edge: Mapped[float | None] = mapped_column(Float)
    sample_size: Mapped[int | None] = mapped_column(Integer)
    evidence_score: Mapped[int | None] = mapped_column(Integer)  # 0-100 evidence QUALITY, not a probability
    evidence: Mapped[dict] = mapped_column(JS)  # components, supporting, opposing, checks
    classification: Mapped[str] = mapped_column(String(24), index=True)
    rejection_reasons: Mapped[list] = mapped_column(JS)
    rank_in_game: Mapped[int | None] = mapped_column(Integer)
    verified_at: Mapped[datetime] = _ts(default=utcnow)
    created_at: Mapped[datetime] = _ts(default=utcnow)


class Combo(Base):
    """Immutable candidate combination (parlay research array member)."""
    __tablename__ = "combos"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(40), index=True)  # e.g. GZ-20261124-A1-TRIPLE-003
    edition_id: Mapped[int] = mapped_column(Integer, index=True)
    game_date: Mapped[date] = mapped_column(Date, index=True)
    engine: Mapped[str] = mapped_column(String(12), index=True)  # DOUBLE..SIX
    n_legs: Mapped[int] = mapped_column(Integer)
    structure: Mapped[str] = mapped_column(String(8))  # SGP | CROSS | MIXED
    leg_selection_ids: Mapped[list] = mapped_column(JS)
    legs: Mapped[list] = mapped_column(JS)  # denormalised leg summaries as evaluated
    joint_prob: Mapped[float | None] = mapped_column(Float)
    joint_low: Mapped[float | None] = mapped_column(Float)
    joint_high: Mapped[float | None] = mapped_column(Float)
    independent_prob: Mapped[float | None] = mapped_column(Float)
    correlation: Mapped[dict] = mapped_column(JS)  # methodology, seed, draws, mc_se, pairwise, shared risks
    observed_quote: Mapped[dict | None] = mapped_column(JS)  # only ever a real observed quote
    reference_price: Mapped[dict | None] = mapped_column(JS)  # arithmetic product of leg prices, labelled
    evidence_score: Mapped[int | None] = mapped_column(Integer)
    weakest_assumption: Mapped[str | None] = mapped_column(Text)
    classification: Mapped[str] = mapped_column(String(24))
    designation: Mapped[str] = mapped_column(String(16))  # research_only | paper_testing
    rejection_reasons: Mapped[list] = mapped_column(JS)
    invalidation_conditions: Mapped[list] = mapped_column(JS)
    validated_at: Mapped[datetime] = _ts(default=utcnow)
    created_at: Mapped[datetime] = _ts(default=utcnow)


class Edition(Base):
    """A published, versioned daily research edition. Immutable; later editions supersede, never replace."""
    __tablename__ = "editions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_date: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[str] = mapped_column(String(12))  # morning|midday|afternoon|pregame|final
    version: Mapped[int] = mapped_column(Integer)
    key: Mapped[str] = mapped_column(String(48), unique=True)
    summary: Mapped[dict] = mapped_column(JS)  # sections A-E
    changes: Mapped[list] = mapped_column(JS)  # diff vs previous edition
    content_sha256: Mapped[str] = mapped_column(String(64))
    published_at: Mapped[datetime] = _ts(default=utcnow)
    __table_args__ = (UniqueConstraint("game_date", "version"),)


class ResearchEvent(Base):
    """Append-only audit events: invalidations, corrections, promotions, pauses."""
    __tablename__ = "research_events"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    ref_type: Mapped[str | None] = mapped_column(String(24), index=True)
    ref_id: Mapped[str | None] = mapped_column(String(48), index=True)
    game_date: Mapped[date | None] = mapped_column(Date, index=True)
    detail: Mapped[dict] = mapped_column(JS)
    actor: Mapped[str] = mapped_column(String(48))
    created_at: Mapped[datetime] = _ts(default=utcnow)


# ---------------------------------------------------------------- paper ledger
class PaperTicket(Base):
    __tablename__ = "paper_tickets"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(8))  # single | combo
    engine: Mapped[str] = mapped_column(String(12), index=True)  # SINGLE, DOUBLE, ... (by leg count)
    structure: Mapped[str] = mapped_column(String(8))  # SINGLE | SGP | CROSS | MIXED
    source: Mapped[str] = mapped_column(String(12))  # auto | owner | builder
    game_date: Mapped[date] = mapped_column(Date, index=True)
    combo_uid: Mapped[str | None] = mapped_column(String(40))
    edition_id: Mapped[int | None] = mapped_column(Integer)
    legs: Mapped[list] = mapped_column(JS)  # frozen leg snapshots incl. odds snapshot + model version
    model_prob: Mapped[float | None] = mapped_column(Float)
    prob_low: Mapped[float | None] = mapped_column(Float)
    prob_high: Mapped[float | None] = mapped_column(Float)
    price_decimal: Mapped[float | None] = mapped_column(Float)
    price_basis: Mapped[str] = mapped_column(String(24))  # observed_quote | leg_product_reference | none
    classification: Mapped[str] = mapped_column(String(24))
    stake_units: Mapped[float] = mapped_column(Float)
    settlement_rules: Mapped[str] = mapped_column(String(24), default="gizer-v1")
    created_by: Mapped[str] = mapped_column(String(48))
    created_at: Mapped[datetime] = _ts(default=utcnow, index=True)


class PaperSettlement(Base):
    """Append-only. A correction is a NEW row with supersedes_id set; the latest row per ticket is current."""
    __tablename__ = "paper_settlements"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(BigInteger, index=True)
    result: Mapped[str] = mapped_column(String(12))  # win|loss|push|void|unresolved
    leg_results: Mapped[list] = mapped_column(JS)
    payout_units: Mapped[float | None] = mapped_column(Float)
    pnl_units: Mapped[float | None] = mapped_column(Float)
    forensic: Mapped[dict] = mapped_column(JS)
    supersedes_id: Mapped[int | None] = mapped_column(BigInteger)
    reason: Mapped[str | None] = mapped_column(String(200))
    settled_at: Mapped[datetime] = _ts(default=utcnow)


class PredictionOutcome(Base):
    """Append-only postgame observation for a prediction (forecast error record)."""
    __tablename__ = "prediction_outcomes"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    prediction_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    game_date: Mapped[date] = mapped_column(Date, index=True)
    stat: Mapped[str] = mapped_column(String(16))
    model_version_id: Mapped[int] = mapped_column(Integer, index=True)
    actual: Mapped[float | None] = mapped_column(Float)  # null when the player did not play
    error: Mapped[float | None] = mapped_column(Float)
    pit: Mapped[float | None] = mapped_column(Float)  # probability integral transform
    in_80: Mapped[bool | None] = mapped_column(Boolean)
    context: Mapped[dict] = mapped_column(JS)  # minutes projected vs actual, DNP, etc.
    created_at: Mapped[datetime] = _ts(default=utcnow)


class ResearchFinding(Base):
    __tablename__ = "research_findings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    finding_uid: Mapped[str] = mapped_column(String(32), unique=True)
    hypothesis: Mapped[str] = mapped_column(Text)
    supporting: Mapped[list] = mapped_column(JS)
    contradicting: Mapped[list] = mapped_column(JS)
    sample_size: Mapped[int] = mapped_column(Integer)
    proposed_experiment: Mapped[str | None] = mapped_column(Text)
    result: Mapped[str | None] = mapped_column(Text)
    limitations: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="open")  # open|supported|rejected|inconclusive
    source: Mapped[str] = mapped_column(String(48))
    created_at: Mapped[datetime] = _ts(default=utcnow)
    updated_at: Mapped[datetime] = _ts(default=utcnow, onupdate=utcnow)


# ---------------------------------------------------------------- operations
class Job(Base):
    """Durable job queue (PostgreSQL, SELECT ... FOR UPDATE SKIP LOCKED)."""
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(48), index=True)
    args: Mapped[dict] = mapped_column(JS, default=dict)
    dedupe_key: Mapped[str] = mapped_column(String(120), unique=True)  # duplicate-execution prevention
    status: Mapped[str] = mapped_column(String(12), index=True, default="queued")  # queued|running|done|failed|dead
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=4)
    timeout_s: Mapped[int] = mapped_column(Integer, default=900)
    run_after: Mapped[datetime] = _ts(default=utcnow, index=True)
    locked_by: Mapped[str | None] = mapped_column(String(64))
    locked_at: Mapped[datetime | None] = _ts()
    started_at: Mapped[datetime | None] = _ts()
    finished_at: Mapped[datetime | None] = _ts()
    result: Mapped[dict | None] = mapped_column(JS)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _ts(default=utcnow)


class AgentExecution(Base):
    __tablename__ = "agent_executions"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agent: Mapped[str] = mapped_column(String(48), index=True)
    job_id: Mapped[int | None] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(12))  # ok | failed | abstained
    started_at: Mapped[datetime] = _ts(index=True)
    finished_at: Mapped[datetime] = _ts()
    duration_ms: Mapped[int] = mapped_column(Integer)
    output: Mapped[dict] = mapped_column(JS)
    error: Mapped[str | None] = mapped_column(Text)
    provider_calls: Mapped[int] = mapped_column(Integer, default=0)


class Heartbeat(Base):
    __tablename__ = "heartbeats"
    worker: Mapped[str] = mapped_column(String(64), primary_key=True)
    role: Mapped[str] = mapped_column(String(16))
    beat_at: Mapped[datetime] = _ts(default=utcnow)
    info: Mapped[dict] = mapped_column(JS, default=dict)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(48), primary_key=True)
    value: Mapped[dict] = mapped_column(JS)
    updated_at: Mapped[datetime] = _ts(default=utcnow, onupdate=utcnow)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(160), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(12), default="viewer")  # owner | viewer
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _ts(default=utcnow)


class SessionToken(Base):
    __tablename__ = "sessions"
    token_sha256: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    csrf: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = _ts()
    created_at: Mapped[datetime] = _ts(default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(64), index=True)
    detail: Mapped[dict] = mapped_column(JS)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = _ts(default=utcnow)


# Tables on which UPDATE and DELETE are rejected by database triggers.
# ---------------------------------------------------------------- JARVIS (assistant, memory, AI budget)
class AiBudgetPolicy(Base):
    """One row (id=1): the owner-authorised spending policy. Enforced in code, never by a prompt."""
    __tablename__ = "ai_budget_policy"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lifetime_cap_usd: Mapped[float] = mapped_column(Float)          # cumulative, not monthly
    suspend_at_usd: Mapped[float] = mapped_column(Float)            # ordinary requests stop here
    daily_cap_usd: Mapped[float] = mapped_column(Float)
    allocations: Mapped[dict] = mapped_column(JS)                   # bucket -> usd limit
    per_request_cap_usd: Mapped[dict] = mapped_column(JS)           # bucket -> max reserved usd for one request
    paused: Mapped[bool] = mapped_column(Boolean, default=False)    # emergency AI pause
    buffer_released: Mapped[bool] = mapped_column(Boolean, default=False)  # owner explicitly allowed the last buffer
    notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = _ts(default=utcnow)
    updated_by: Mapped[str] = mapped_column(String(64), default="system")


class AiUsage(Base):
    """One row per paid API request: reservation first, then reconciled with the provider-reported usage."""
    __tablename__ = "ai_usage"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = _ts(default=utcnow, index=True)
    settled_at: Mapped[datetime | None] = _ts()
    status: Mapped[str] = mapped_column(String(12), index=True)     # reserved|settled|released|assumed
    bucket: Mapped[str] = mapped_column(String(16), index=True)     # sonnet|haiku|opus|dev
    model: Mapped[str] = mapped_column(String(48))
    task: Mapped[str] = mapped_column(String(32), index=True)       # chat|briefing|title|verify|audit
    agent: Mapped[str] = mapped_column(String(32), default="jarvis")
    conversation_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    reserved_usd: Mapped[float] = mapped_column(Float)
    actual_usd: Mapped[float | None] = mapped_column(Float)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    cache_read_tokens: Mapped[int | None] = mapped_column(Integer)
    cache_write_tokens: Mapped[int | None] = mapped_column(Integer)
    request_id: Mapped[str | None] = mapped_column(String(64))
    routing: Mapped[dict] = mapped_column(JS, default=dict)         # why this model was chosen
    error: Mapped[str | None] = mapped_column(String(200))


class JarvisConversation(Base):
    __tablename__ = "jarvis_conversations"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    owner: Mapped[str] = mapped_column(String(120), index=True)
    title: Mapped[str] = mapped_column(String(160), default="New conversation")
    context: Mapped[dict] = mapped_column(JS, default=dict)         # validated page context identifiers
    summary: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _ts(default=utcnow)
    updated_at: Mapped[datetime] = _ts(default=utcnow, index=True)
    deleted_at: Mapped[datetime | None] = _ts()


class JarvisMessage(Base):
    __tablename__ = "jarvis_messages"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(BigInteger, index=True)
    role: Mapped[str] = mapped_column(String(12))                   # user|assistant
    content: Mapped[list] = mapped_column(JS)                       # API content blocks, replayed unchanged
    text: Mapped[str] = mapped_column(Text, default="")             # visible text only
    model: Mapped[str | None] = mapped_column(String(48))
    stop_reason: Mapped[str | None] = mapped_column(String(24))
    sources: Mapped[list] = mapped_column(JS, default=list)         # tool-derived references shown to the owner
    cost_usd: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = _ts(default=utcnow)


class JarvisToolCall(Base):
    __tablename__ = "jarvis_tool_calls"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    message_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    tool: Mapped[str] = mapped_column(String(48), index=True)
    args: Mapped[dict] = mapped_column(JS)
    ok: Mapped[bool] = mapped_column(Boolean)
    error: Mapped[str | None] = mapped_column(String(240))
    result_chars: Mapped[int] = mapped_column(Integer, default=0)
    truncated: Mapped[bool] = mapped_column(Boolean, default=False)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = _ts(default=utcnow)


class JarvisMemory(Base):
    """Structured long-term memory. Facts keep their sources and observation date; hypotheses stay hypotheses."""
    __tablename__ = "jarvis_memory"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(16), index=True)   # research|operational|preference|conversation
    status: Mapped[str] = mapped_column(String(12), default="hypothesis")  # verified|hypothesis|preference
    subject_type: Mapped[str | None] = mapped_column(String(16), index=True)  # player|team|game|market|model|system
    subject_id: Mapped[str | None] = mapped_column(String(64), index=True)
    text: Mapped[str] = mapped_column(Text)
    sources: Mapped[list] = mapped_column(JS, default=list)
    observed_on: Mapped[date | None] = mapped_column(Date)
    created_by: Mapped[str] = mapped_column(String(64))             # owner email or "jarvis"
    conversation_id: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = _ts(default=utcnow)
    deleted_at: Mapped[datetime | None] = _ts()


class JarvisBriefing(Base):
    __tablename__ = "jarvis_briefings"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)       # overnight|morning|midday|pregame|postgame
    game_date: Mapped[date] = mapped_column(Date, index=True)
    digest_hash: Mapped[str] = mapped_column(String(64))            # of the facts; unchanged facts -> no new briefing
    facts: Mapped[dict] = mapped_column(JS)                         # deterministic digest the text was written from
    text: Mapped[str] = mapped_column(Text)
    generator: Mapped[str] = mapped_column(String(48))              # "deterministic" or a model id
    cost_usd: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = _ts(default=utcnow)
    __table_args__ = (UniqueConstraint("kind", "game_date", "digest_hash", name="uq_briefing_digest"),)


class JarvisEvent(Base):
    """Deduplicated operational/research events for the assistant. Written by ordinary workers, no LLM involved."""
    __tablename__ = "jarvis_events"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    dedupe_key: Mapped[str] = mapped_column(String(160), unique=True)
    game_date: Mapped[date | None] = mapped_column(Date, index=True)
    severity: Mapped[str] = mapped_column(String(8), default="info")  # info|notice|alert
    title: Mapped[str] = mapped_column(String(200))
    detail: Mapped[dict] = mapped_column(JS, default=dict)
    occurred_at: Mapped[datetime] = _ts(default=utcnow, index=True)
    acknowledged_at: Mapped[datetime | None] = _ts()


# ---------------------------------------------------------------- GIZER LIVE (observed in-game state)
class LiveGame(Base):
    """Current observed state of one game. Mutable by design: it is an observation feed, not research.
    Pregame research (predictions, selections, editions) is never touched by live ingestion."""
    __tablename__ = "live_games"
    game_id: Mapped[str] = mapped_column(String(12), primary_key=True)
    espn_event_id: Mapped[str] = mapped_column(String(16), index=True)
    game_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(12), index=True)   # scheduled|live|halftime|end_period|overtime|final|delayed|postponed|suspended|cancelled
    provider_status: Mapped[str] = mapped_column(String(40))
    period: Mapped[int] = mapped_column(Integer, default=0)
    clock: Mapped[str | None] = mapped_column(String(12))
    home_score: Mapped[int | None] = mapped_column(Integer)
    away_score: Mapped[int | None] = mapped_column(Integer)
    linescores: Mapped[dict] = mapped_column(JS, default=dict)    # {"home": [..], "away": [..]}
    team_stats: Mapped[dict] = mapped_column(JS, default=dict)    # {"home": {...}, "away": {...}} as published
    version: Mapped[int] = mapped_column(Integer, default=0)      # bumped whenever anything observable changed
    plays_count: Mapped[int] = mapped_column(Integer, default=0)
    summaries_done: Mapped[list] = mapped_column(JS, default=list)
    provider: Mapped[str] = mapped_column(String(24), default="espn")
    provider_updated_at: Mapped[datetime | None] = _ts()          # latest event time the source reported
    observed_at: Mapped[datetime] = _ts(default=utcnow)           # last successful poll
    changed_at: Mapped[datetime] = _ts(default=utcnow)
    detail_at: Mapped[datetime | None] = _ts()                    # last successful box/play-by-play fetch
    final_detail_done: Mapped[bool] = mapped_column(Boolean, default=False)


class LivePlayerBox(Base):
    __tablename__ = "live_player_box"
    game_id: Mapped[str] = mapped_column(String(12), primary_key=True)
    espn_athlete_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    player_id: Mapped[int | None] = mapped_column(BigInteger, index=True)     # null = not matched to a canonical player
    team_id: Mapped[int] = mapped_column(BigInteger, index=True)
    name: Mapped[str] = mapped_column(String(96))
    position: Mapped[str | None] = mapped_column(String(6))
    jersey: Mapped[str | None] = mapped_column(String(4))
    starter: Mapped[bool | None] = mapped_column(Boolean)
    dnp: Mapped[bool] = mapped_column(Boolean, default=False)
    ejected: Mapped[bool] = mapped_column(Boolean, default=False)
    on_court: Mapped[bool | None] = mapped_column(Boolean)                    # null = not determinable; never assumed
    minutes: Mapped[float | None] = mapped_column(Float)
    pts: Mapped[int | None] = mapped_column(Integer)
    reb: Mapped[int | None] = mapped_column(Integer)
    ast: Mapped[int | None] = mapped_column(Integer)
    stl: Mapped[int | None] = mapped_column(Integer)
    blk: Mapped[int | None] = mapped_column(Integer)
    tov: Mapped[int | None] = mapped_column(Integer)
    pf: Mapped[int | None] = mapped_column(Integer)
    fgm: Mapped[int | None] = mapped_column(Integer)
    fga: Mapped[int | None] = mapped_column(Integer)
    fg3m: Mapped[int | None] = mapped_column(Integer)
    fg3a: Mapped[int | None] = mapped_column(Integer)
    ftm: Mapped[int | None] = mapped_column(Integer)
    fta: Mapped[int | None] = mapped_column(Integer)
    oreb: Mapped[int | None] = mapped_column(Integer)
    dreb: Mapped[int | None] = mapped_column(Integer)
    plus_minus: Mapped[int | None] = mapped_column(Integer)
    updated_at: Mapped[datetime] = _ts(default=utcnow)


class LivePlay(Base):
    """One play-by-play event. Unique per (game, provider event id); a provider correction keeps the old wording."""
    __tablename__ = "live_plays"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    game_id: Mapped[str] = mapped_column(String(12), index=True)
    event_id: Mapped[str] = mapped_column(String(24))
    sequence: Mapped[int] = mapped_column(Integer)
    period: Mapped[int] = mapped_column(Integer)
    clock: Mapped[str | None] = mapped_column(String(12))
    elapsed_s: Mapped[float | None] = mapped_column(Float)        # game seconds elapsed at the event
    team_id: Mapped[int | None] = mapped_column(BigInteger)
    kind: Mapped[str] = mapped_column(String(16), index=True)     # made|missed|free_throw|rebound|turnover|foul|substitution|timeout|period|review|jumpball|other
    type_text: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(Text)
    scoring: Mapped[bool] = mapped_column(Boolean, default=False)
    score_value: Mapped[int] = mapped_column(Integer, default=0)
    home_score: Mapped[int | None] = mapped_column(Integer)
    away_score: Mapped[int | None] = mapped_column(Integer)
    athlete_ids: Mapped[list] = mapped_column(JS, default=list)   # provider athlete ids, in the order published
    player_ids: Mapped[list] = mapped_column(JS, default=list)    # canonical ids where matched (null entries kept)
    provider_at: Mapped[datetime | None] = _ts()
    ingested_at: Mapped[datetime] = _ts(default=utcnow)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    corrections: Mapped[list] = mapped_column(JS, default=list)
    __table_args__ = (UniqueConstraint("game_id", "event_id", name="uq_live_play_event"),
                      Index("ix_live_plays_game_seq", "game_id", "sequence"))


class LiveFollow(Base):
    __tablename__ = "live_follows"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    owner: Mapped[str] = mapped_column(String(120), index=True)
    kind: Mapped[str] = mapped_column(String(8))                  # game|player|team
    ref_id: Mapped[str] = mapped_column(String(24))
    created_at: Mapped[datetime] = _ts(default=utcnow)
    __table_args__ = (UniqueConstraint("owner", "kind", "ref_id", name="uq_live_follow"),)


class LiveMilestone(Base):
    """An owner-defined tracking threshold. Progress toward it is an observation, never a forecast."""
    __tablename__ = "live_milestones"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    owner: Mapped[str] = mapped_column(String(120), index=True)
    player_id: Mapped[int] = mapped_column(BigInteger, index=True)
    stat: Mapped[str] = mapped_column(String(16))
    threshold: Mapped[float] = mapped_column(Float)
    game_date: Mapped[date] = mapped_column(Date, index=True)
    notify: Mapped[bool] = mapped_column(Boolean, default=True)
    reached_at: Mapped[datetime | None] = _ts()
    reached_value: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = _ts(default=utcnow)
    deleted_at: Mapped[datetime | None] = _ts()


LIVE_TABLES = [LiveGame, LivePlayerBox, LivePlay, LiveFollow, LiveMilestone]

# ---------------------------------------------------------------- GIZER CORTEX (basketball knowledge)
class CortexSource(Base):
    __tablename__ = "cortex_sources"
    key: Mapped[str] = mapped_column(String(48), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    publisher: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(300))
    league: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str | None] = mapped_column(Text)
    reliability: Mapped[str | None] = mapped_column(Text)
    permission: Mapped[str | None] = mapped_column(Text)
    accessed: Mapped[str | None] = mapped_column(String(16))          # date the author opened it, if they did
    access_result: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = _ts(default=utcnow)


class CortexConcept(Base):
    """One knowledge record. Original text; `verification` says whether it was checked against an opened source."""
    __tablename__ = "cortex_concepts"
    slug: Mapped[str] = mapped_column(String(80), primary_key=True)
    department: Mapped[int] = mapped_column(Integer, index=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    formula: Mapped[str | None] = mapped_column(Text)
    detail: Mapped[dict] = mapped_column(JS, default=dict)          # the remaining authored fields, as written
    ruleset: Mapped[str] = mapped_column(String(12), default="general")
    season_note: Mapped[str | None] = mapped_column(String(200))
    verification: Mapped[str] = mapped_column(String(32), index=True)
    source_keys: Mapped[list] = mapped_column(JS, default=list)
    content_sha: Mapped[str] = mapped_column(String(64))
    version: Mapped[int] = mapped_column(Integer, default=1)
    search_text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = _ts(default=utcnow)
    updated_at: Mapped[datetime] = _ts(default=utcnow)


class CortexRetrievalLog(Base):
    __tablename__ = "cortex_retrieval_log"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    query: Mapped[str] = mapped_column(String(300))
    filters: Mapped[dict] = mapped_column(JS, default=dict)
    returned: Mapped[list] = mapped_column(JS, default=list)
    method: Mapped[str] = mapped_column(String(24))
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    caller: Mapped[str] = mapped_column(String(24), default="api")
    created_at: Mapped[datetime] = _ts(default=utcnow, index=True)


class CortexBenchmarkRun(Base):
    __tablename__ = "cortex_benchmark_runs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(16))                  # retrieval | answers
    split: Mapped[str] = mapped_column(String(12))
    model: Mapped[str | None] = mapped_column(String(48))
    n: Mapped[int] = mapped_column(Integer)
    score: Mapped[float | None] = mapped_column(Float)
    by_category: Mapped[dict] = mapped_column(JS, default=dict)
    details: Mapped[list] = mapped_column(JS, default=list)
    cost_usd: Mapped[float | None] = mapped_column(Float)
    library_version: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = _ts(default=utcnow)


CORTEX_TABLES = [CortexSource, CortexConcept, CortexRetrievalLog, CortexBenchmarkRun]

JARVIS_TABLES = [AiBudgetPolicy, AiUsage, JarvisConversation, JarvisMessage, JarvisToolCall, JarvisMemory, JarvisBriefing,
                 JarvisEvent]

IMMUTABLE_TABLES = [
    "injury_snapshots", "odds_snapshots", "predictions", "selections", "combos", "editions",
    "research_events", "paper_tickets", "paper_settlements", "prediction_outcomes", "audit_log",
    "model_evaluations", "raw_payloads", "lineup_snapshots", "kalshi_snapshots",
]

IMMUTABILITY_SQL = """
CREATE OR REPLACE FUNCTION gizer_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'GIZER immutable ledger: % on % is not permitted (append a correction instead)',
    TG_OP, TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END; $$ LANGUAGE plpgsql;
"""


def immutability_statements() -> list[str]:
    out = [IMMUTABILITY_SQL]
    for t in IMMUTABLE_TABLES:
        out.append(f"DROP TRIGGER IF EXISTS {t}_immutable ON {t}")
        out.append(f"CREATE TRIGGER {t}_immutable BEFORE UPDATE OR DELETE ON {t} "
                   f"FOR EACH ROW EXECUTE FUNCTION gizer_reject_mutation()")
        out.append(f"DROP TRIGGER IF EXISTS {t}_notruncate ON {t}")
        out.append(f"CREATE TRIGGER {t}_notruncate BEFORE TRUNCATE ON {t} "
                   f"FOR EACH STATEMENT EXECUTE FUNCTION gizer_reject_mutation()")
    return out


_engine = None
_Session = None


def get_engine():
    global _engine, _Session
    if _engine is None:
        _engine = create_engine(get_settings().database_url, pool_pre_ping=True, pool_size=5, max_overflow=10)
        _Session = sessionmaker(_engine, expire_on_commit=False)
    return _engine


def reset_engine():
    global _engine, _Session
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _Session = None


@contextmanager
def session_scope():
    get_engine()
    s = _Session()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def create_all_for_tests():
    """Tests build the schema directly; production uses Alembic (which runs the same statements)."""
    eng = get_engine()
    Base.metadata.create_all(eng)
    with eng.begin() as c:
        for stmt in immutability_statements():
            c.execute(text(stmt))


def get_setting(s, key: str, default=None):
    row = s.get(Setting, key)
    return row.value if row else default


def set_setting(s, key: str, value: dict):
    row = s.get(Setting, key)
    if row:
        row.value = value
    else:
        s.add(Setting(key=key, value=value))
