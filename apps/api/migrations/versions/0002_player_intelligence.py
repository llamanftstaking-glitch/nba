"""Player intelligence: starters, absences, lineup snapshots, player identity media, quote origin.

Revision ID: 0002_player_intelligence
Revises: 0001_baseline

Idempotent (a database created from a newer baseline already has these objects). The downgrade removes only
objects introduced here; it never touches predictions, editions, tickets or settlements.
"""
from alembic import op
from sqlalchemy import text

from gizer.db import LineupSnapshot, PlayerAbsence

revision = "0002_player_intelligence"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

ADD = [
    "ALTER TABLE players ADD COLUMN IF NOT EXISTS espn_id VARCHAR(16)",
    "ALTER TABLE players ADD COLUMN IF NOT EXISTS jersey VARCHAR(4)",
    "ALTER TABLE players ADD COLUMN IF NOT EXISTS headshot_url VARCHAR(255)",
    "CREATE INDEX IF NOT EXISTS ix_players_espn_id ON players (espn_id)",
    "ALTER TABLE games ADD COLUMN IF NOT EXISTS lineup_ingested_at TIMESTAMPTZ",
    "ALTER TABLE player_box ADD COLUMN IF NOT EXISTS starter BOOLEAN",
    "ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS origin VARCHAR(16) NOT NULL DEFAULT 'provider'",
    "ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS note VARCHAR(300)",
    "ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS source_ref VARCHAR(300)",
    "ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS created_by VARCHAR(160)",
]
TRIG = [
    "DROP TRIGGER IF EXISTS lineup_snapshots_immutable ON lineup_snapshots",
    "CREATE TRIGGER lineup_snapshots_immutable BEFORE UPDATE OR DELETE ON lineup_snapshots "
    "FOR EACH ROW EXECUTE FUNCTION gizer_reject_mutation()",
    "DROP TRIGGER IF EXISTS lineup_snapshots_notruncate ON lineup_snapshots",
    "CREATE TRIGGER lineup_snapshots_notruncate BEFORE TRUNCATE ON lineup_snapshots "
    "FOR EACH STATEMENT EXECUTE FUNCTION gizer_reject_mutation()",
]


def upgrade():
    bind = op.get_bind()
    PlayerAbsence.__table__.create(bind, checkfirst=True)
    LineupSnapshot.__table__.create(bind, checkfirst=True)
    for stmt in ADD + TRIG:
        bind.execute(text(stmt))


def downgrade():
    bind = op.get_bind()
    for stmt in ("DROP TABLE IF EXISTS lineup_snapshots", "DROP TABLE IF EXISTS player_absences",
                 "ALTER TABLE player_box DROP COLUMN IF EXISTS starter",
                 "ALTER TABLE games DROP COLUMN IF EXISTS lineup_ingested_at",
                 "DROP INDEX IF EXISTS ix_players_espn_id",
                 "ALTER TABLE players DROP COLUMN IF EXISTS espn_id, DROP COLUMN IF EXISTS jersey, DROP COLUMN IF EXISTS headshot_url"):
        bind.execute(text(stmt))
    # odds_snapshots.origin/note/source_ref/created_by are kept: the table is append-only and the columns
    # describe stored quotes; removing them would destroy provenance.
