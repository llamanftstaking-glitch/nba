"""Baseline schema (warehouse, ledger, queue) + immutability triggers.

Revision ID: 0001_baseline
Revises:

The baseline is created from the ORM metadata as it stood at this revision. Every later change must be an
explicit, reviewed migration. There is intentionally no destructive downgrade: dropping the ledger is an
irreversible operation that requires explicit owner approval and a verified backup.
"""
from alembic import op
from sqlalchemy import text

from gizer.db import Base, immutability_statements

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    Base.metadata.create_all(bind)
    for stmt in immutability_statements():
        bind.execute(text(stmt))


def downgrade():
    raise RuntimeError("Refusing to drop the research ledger. Restore from backup instead (see RUNBOOK.md).")
