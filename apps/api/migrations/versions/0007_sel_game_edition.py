"""Composite index for the latest-edition-per-game lookup (page load time).

Revision ID: 0007_sel_game_edition
Revises: 0006_cortex
"""
from alembic import op
from sqlalchemy import text

revision = "0007_sel_game_edition"
down_revision = "0006_cortex"
branch_labels = None
depends_on = None


def upgrade():
    op.get_bind().execute(text("CREATE INDEX IF NOT EXISTS ix_selections_game_edition ON selections (game_id, edition_id)"))


def downgrade():
    op.get_bind().execute(text("DROP INDEX IF EXISTS ix_selections_game_edition"))
