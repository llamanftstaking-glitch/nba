"""Database migration test: Alembic builds the same schema the ORM declares, with immutability triggers."""
import os
import subprocess
import sys

from sqlalchemy import inspect, text

from conftest import reset_schema
from gizer import db as gdb


def test_alembic_upgrade_builds_full_schema_and_is_idempotent():
    gdb.reset_engine()
    with gdb.get_engine().begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    root = os.path.dirname(os.path.dirname(__file__))
    for _ in range(2):
        r = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=root, capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
    insp = inspect(gdb.get_engine())
    tables = set(insp.get_table_names())
    assert set(gdb.Base.metadata.tables) <= tables and "alembic_version" in tables
    with gdb.get_engine().connect() as c:
        trig = {r[0] for r in c.execute(text("select tgname from pg_trigger where not tgisinternal"))}
        assert c.execute(text("select version_num from alembic_version")).scalar() == "0006_cortex"
    for t in gdb.IMMUTABLE_TABLES:
        assert f"{t}_immutable" in trig and f"{t}_notruncate" in trig
    # 0002 is reversible and re-appliable without touching research tables
    al = lambda *a: subprocess.run([sys.executable, "-m", "alembic", *a], cwd=root, capture_output=True, text=True)  # noqa: E731
    assert al("downgrade", "0001_baseline").returncode == 0
    insp = inspect(gdb.get_engine())
    assert "lineup_snapshots" not in insp.get_table_names() and "predictions" in insp.get_table_names()
    assert "starter" not in {c["name"] for c in insp.get_columns("player_box")}
    assert al("upgrade", "head").returncode == 0
    insp = inspect(gdb.get_engine())
    assert "lineup_snapshots" in insp.get_table_names() and "starter" in {c["name"] for c in insp.get_columns("player_box")}
    r = subprocess.run([sys.executable, "-m", "alembic", "downgrade", "base"], cwd=root, capture_output=True, text=True)
    assert r.returncode != 0 and "Refusing" in (r.stderr + r.stdout)
    reset_schema()
