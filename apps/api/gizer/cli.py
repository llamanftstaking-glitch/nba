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
    sub.add_parser("quickstart", help="fast first pass: today's slate, injuries, projected lineups, Kalshi markets and an edition")
    p = sub.add_parser("ingest-starters", help="confirmed starters + DNPs from box scores"); p.add_argument("--since", required=True); p.add_argument("--max-games", type=int)
    p = sub.add_parser("backtest", help="walk-forward evaluation of all model families"); p.add_argument("--no-register", action="store_true")
    p = sub.add_parser("edition", help="publish a research edition"); p.add_argument("--date"); p.add_argument("--kind", default="morning")
    p = sub.add_parser("settle"); p.add_argument("--date")
    p = sub.add_parser("run-job", help="run one named job inline"); p.add_argument("name"); p.add_argument("--args", default="{}")
    sub.add_parser("worker", help="run the durable job worker")
    sub.add_parser("scheduler", help="run the scheduler")
    sub.add_parser("bootstrap-owner", help="create/update the owner account from GIZER_OWNER_EMAIL/PASSWORD")
    sub.add_parser("status")
    jv = sub.add_parser("jarvis-verify")
    jv.add_argument("--ping", action="store_true")
    sub.add_parser("model-cards", help="render MODEL-CARDS.md content from the registry")
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
    elif a.cmd == "ingest-starters":
        _print(ingestion.ingest_confirmed_starters(date.fromisoformat(a.since), max_games=a.max_games))
    elif a.cmd == "quickstart":
        from .jobs import run_inline
        from .lineups import refresh_lineups
        r = ingestion.quickstart()
        lu = refresh_lineups(ingestion.today_et())
        r["lineups"] = {k: lu.get(k) for k in ("confirmed", "projected", "unknown", "fallback_teams", "provider_errors")}
        try:
            ed = run_inline("edition", {"kind": "update"})
            r["edition"] = {k: ed.get(k) for k in ("edition", "selections", "qualified", "combos")}
        except Exception as e:
            r["edition"] = {"error": str(e)[:200]}
        _print(r)
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
    elif a.cmd == "model-cards":
        from .modelcards import render
        print(render())
    elif a.cmd == "status":
        from .jobs import operations_status
        _print(operations_status())
    elif a.cmd == "jarvis-verify":
        # Free check of the key and the configured model ids. --ping also sends one tiny paid request (well under
        # one cent, taken from the development allocation) to prove a real answer comes back and is accounted for.
        from . import ai_budget, jarvis
        if not jarvis.configured():
            print("ANTHROPIC_API_KEY is not set in this environment. Nothing was called.")
            return 1
        out = {"models": jarvis.verify_models(force=True)}
        if a.ping and out["models"]["ok"]:
            model = out["models"]["models"]["light"]
            uid = ai_budget.reserve("dev", model, "verify", 200, 64)
            try:
                with jarvis.client().messages.stream(model=model, max_tokens=64, output_config={"effort": "low"},
                                                     messages=[{"role": "user", "content": "Reply with the single word: ready"}]) as st:
                    msg = st.get_final_message()
                cost = ai_budget.settle(uid, msg.usage, getattr(msg, "_request_id", None))
                out["ping"] = {"reply": "".join(b.text for b in msg.content if b.type == "text")[:40], "stop_reason": msg.stop_reason,
                               "cost_usd": cost, "input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens}
            except Exception as e:
                ai_budget.assume(uid, type(e).__name__)
                out["ping"] = {"error": type(e).__name__}
        out["budget"] = {k: v for k, v in ai_budget.status().items() if k in ("spent_usd", "remaining_usd", "usable_usd", "state")}
        _print(out)
        return 0 if out["models"]["ok"] and "error" not in out.get("ping", {}) else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
