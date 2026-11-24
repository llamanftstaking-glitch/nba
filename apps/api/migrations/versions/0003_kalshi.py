"""Kalshi market intelligence: contract definitions and append-only price observations.

Revision ID: 0003_kalshi
Revises: 0002_player_intelligence
"""
from alembic import op
from sqlalchemy import text

from gizer.db import KalshiMarket, KalshiSnapshot

revision = "0003_kalshi"
down_revision = "0002_player_intelligence"
branch_labels = None
depends_on = None

TRIG = [
    "DROP TRIGGER IF EXISTS kalshi_snapshots_immutable ON kalshi_snapshots",
    "CREATE TRIGGER kalshi_snapshots_immutable BEFORE UPDATE OR DELETE ON kalshi_snapshots "
    "FOR EACH ROW EXECUTE FUNCTION gizer_reject_mutation()",
    "DROP TRIGGER IF EXISTS kalshi_snapshots_notruncate ON kalshi_snapshots",
    "CREATE TRIGGER kalshi_snapshots_notruncate BEFORE TRUNCATE ON kalshi_snapshots "
    "FOR EACH STATEMENT EXECUTE FUNCTION gizer_reject_mutation()",
]


def upgrade():
    bind = op.get_bind()
    KalshiMarket.__table__.create(bind, checkfirst=True)
    KalshiSnapshot.__table__.create(bind, checkfirst=True)
    for stmt in TRIG:
        bind.execute(text(stmt))


def downgrade():
    bind = op.get_bind()
    bind.execute(text("DROP TABLE IF EXISTS kalshi_snapshots"))
    bind.execute(text("DROP TABLE IF EXISTS kalshi_markets"))
