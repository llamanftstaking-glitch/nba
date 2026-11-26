"""Governance documents and code must agree; the constitution must stay complete."""
import os
import re

from gizer import jobs, research

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))


def read(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read()


def test_constitution_has_all_25_rules():
    rules = re.findall(r"^\| (\d\d) \|", read("RESEARCH-CONSTITUTION.md"), flags=re.M)
    assert rules == [f"{i:02d}" for i in range(1, 26)]


def test_risk_policy_document_matches_code():
    doc = read("RISK-POLICY.md")
    p = research.RISK_POLICY
    assert p["version"] in doc
    assert f"{p['max_quote_age_hours']} hours" in doc and f"{p['max_injury_age_hours']} hours" in doc
    assert f"evidence ≥ {p['standard']['min_evidence']}" in doc and f"evidence ≥ {p['high_confidence']['min_evidence']}" in doc
    assert f"≥ {p['high_confidence']['min_forward_settled']} settled" in doc
    assert f"{int(p['max_plausible_edge'] * 100)} percentage points" in doc


def test_agents_document_lists_every_agent():
    doc = read("AGENTS.md")
    for a in jobs.AGENTS:
        assert f"| {a.number:02d} |" in doc


def test_governing_files_exist():
    for f in ["CLAUDE.md", "AGENTS.md", "PROJECT-STATE.md", "ARCHITECTURE.md", "ROADMAP.md", "CHANGELOG.md", "SECURITY.md",
              "DATA-SOURCES.md", "MODEL-CARDS.md", "RISK-POLICY.md", "DEPLOYMENT.md", "RUNBOOK.md",
              "RESEARCH-CONSTITUTION.md", "README.md", "docs/DECISIONS.md", "docs/research/REPOSITORY-AUDIT.md"]:
        assert os.path.exists(os.path.join(ROOT, f)), f


def test_product_source_has_no_certainty_marketing():
    banned = re.compile(r"guaranteed winner|free money|risk-free bet|can't lose|sure thing", re.I)
    for base, _, files in os.walk(os.path.join(ROOT, "apps", "web", "app")):
        for fn in files:
            if fn.endswith((".tsx", ".ts")):
                with open(os.path.join(base, fn), encoding="utf-8") as f:
                    assert not banned.search(f.read()), fn


def test_top_picks_require_sixty_five_percent_and_rank_most_likely_first(monkeypatch):
    """Owner decision D-037. The shipped constant is 65%; a selection below it is never ranked, whatever its margin."""
    import inspect
    from types import SimpleNamespace as NS

    from gizer import research as R
    assert '"top_picks": {"min_prob": 0.65, "max_per_game": 5}' in inspect.getsource(R)        # the production value
    monkeypatch.setitem(R.RISK_POLICY["top_picks"], "min_prob", 0.65)

    def sel(prob, low, be, cls="standard", ev=90):
        return NS(prob=prob, prob_low=low, breakeven=be, classification=cls, evidence_score=ev)
    long_shot = sel(0.30, 0.27, 0.18)            # big margin over the price, unlikely to happen
    coin_flip = sel(0.58, 0.55, 0.50)
    likely = sel(0.72, 0.68, 0.64)
    very_likely = sel(0.81, 0.77, 0.74)
    rejected = sel(0.90, 0.88, 0.80, cls="rejected")
    watch = sel(0.75, 0.70, 0.72, cls="watchlist")
    assert [R.top_pick_eligible(x) for x in (long_shot, coin_flip, likely, very_likely, rejected, watch)] == [False, False, True, True, False, False]
    ranked = sorted([x for x in (long_shot, coin_flip, likely, very_likely) if R.top_pick_eligible(x)], key=R._rank_key)
    assert ranked == [very_likely, likely]                                                      # most likely first
    old_order = sorted([long_shot, likely, very_likely], key=lambda x: -(x.prob_low - x.breakeven))
    assert old_order[0] is long_shot                                                            # what 1.1 would have put on top
    assert R.RISK_POLICY["standard"]["min_edge_low"] == 0.0 and R.RISK_POLICY["max_plausible_edge"] == 0.10   # other gates untouched
    assert R.RISK_POLICY["qualifying_price_band"] == [0.15, 0.85]

