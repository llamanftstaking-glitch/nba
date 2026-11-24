"""Operator CLI: `gizer <command>`. Every command is reproducible and safe to re-run."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date


def _print(x):
    print(json.dumps(x, indent=2, default=str))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gizer")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init-db", help="create schema + immutability triggers (dev/test; production uses alembic)")
    sub.add_parser("seed", help="seed reference teams/seasons")
    p = sub.add_parser("ingest-results"); p.add_argument("--season"); p.add_argument("--max-boxes", type=int)
    p = sub.add_parser("ingest-slate"); p.add_argument("--date")
    sub.add_parser("ingest-injuries")
    p = sub.add_parser("backtest", help="walk-forward evaluation of all model families"); p.add_argument("--no-register", action="store_true")
    p = sub.add_parser("edition", help="publish a research edition"); p.add_argument("--date"); p.add_argument("--kind", default="morning")
    p = sub.add_parser("settle"); p.add_argument("--date")
    p = sub.add_parser("run-job", help="run one named job inline"); p.add_argument("name"); p.add_argument("--args", default="{}")
    sub.add_parser("worker", help="run the durable job worker")
    sub.add_parser("scheduler", help="run the scheduler")
    sub.add_parser("bootstrap-owner", help="create/update the owner account from GIZER_OWNER_EMAIL/PASSWORD")
    sub.add_parser("status")
    a = ap.parse_args(argv)

    from . import ingestion
    from .config import get_settings
    from .db import create_all_for_tests

    d = lambda v: date.fromisoformat(v) if v else ingestion.today_et()  # noqa: E731
    if a.cmd == "init-db":
        create_all_for_tests(); print("schema ready")
    elif a.cmd == "seed":
        ingestion.seed_reference(); print("seeded")
    elif a.cmd == "ingest-results":
        for season in ([a.season] if a.season else get_settings().season_list):
            _print(ingestion.ingest_results(season, a.max_boxes))
    elif a.cmd == "ingest-slate":
        _print(ingestion.ingest_slate(d(a.date)))
    elif a.cmd == "ingest-injuries":
        _print(ingestion.ingest_injuries())
    elif a.cmd == "backtest":
        from .modeling import run_all_backtests
        _print(run_all_backtests(register=not a.no_register))
    elif a.cmd == "edition":
        from .research import publish_edition
        _print(publish_edition(d(a.date), a.kind))
    elif a.cmd == "settle":
        from .ledger import settle_date
        _print(settle_date(d(a.date)))
    elif a.cmd == "run-job":
        from .jobs import run_inline
        _print(run_inline(a.name, json.loads(a.args)))
    elif a.cmd == "worker":
        from .jobs import worker_loop
        worker_loop()
    elif a.cmd == "scheduler":
        from .jobs import scheduler_loop
        scheduler_loop()
    elif a.cmd == "bootstrap-owner":
        from .security import bootstrap_owner
        print(bootstrap_owner())
    elif a.cmd == "status":
        from .jobs import operations_status
        _print(operations_status())
    return 0


if __name__ == "__main__":
    sys.exit(main())
