"""GIZER CORTEX: knowledge sources, concept records, retrieval log and benchmark runs.

Revision ID: 0006_cortex
Revises: 0005_live
"""
from alembic import op
from sqlalchemy import text

from gizer.db import CORTEX_TABLES

revision = "0006_cortex"
down_revision = "0005_live"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    for model in CORTEX_TABLES:
        model.__table__.create(bind, checkfirst=True)
    bind.execute(text("CREATE INDEX IF NOT EXISTS ix_cortex_concepts_fts ON cortex_concepts "
                      "USING gin (to_tsvector('english', search_text))"))


def downgrade():
    bind = op.get_bind()
    for model in reversed(CORTEX_TABLES):
        bind.execute(text(f"DROP TABLE IF EXISTS {model.__tablename__}"))
