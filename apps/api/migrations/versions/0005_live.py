"""GIZER LIVE: observed game state, live box scores, play-by-play, follows and milestones.

Revision ID: 0005_live
Revises: 0004_jarvis
"""
from alembic import op
from sqlalchemy import text

from gizer.db import LIVE_TABLES

revision = "0005_live"
down_revision = "0004_jarvis"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    for model in LIVE_TABLES:
        model.__table__.create(bind, checkfirst=True)


def downgrade():
    bind = op.get_bind()
    for model in reversed(LIVE_TABLES):
        bind.execute(text(f"DROP TABLE IF EXISTS {model.__tablename__}"))
