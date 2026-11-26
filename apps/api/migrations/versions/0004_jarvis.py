"""JARVIS: conversations, messages, tool calls, memory, briefings, events, AI usage ledger and budget policy.

Revision ID: 0004_jarvis
Revises: 0003_kalshi
"""
from alembic import op
from sqlalchemy import text

from gizer.db import JARVIS_TABLES

revision = "0004_jarvis"
down_revision = "0003_kalshi"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    for model in JARVIS_TABLES:
        model.__table__.create(bind, checkfirst=True)


def downgrade():
    bind = op.get_bind()
    for model in reversed(JARVIS_TABLES):
        bind.execute(text(f"DROP TABLE IF EXISTS {model.__tablename__}"))
