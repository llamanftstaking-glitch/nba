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


def test_top_picks_use_main_lines_and_rank_best_value_first(monkeypatch):
    """Owner decision D-041 (supersedes D-037's floor and ordering). The shipped floor is 55% on main lines only;
    ranking is margin over the price at the conservative end of the interval."""
    import inspect
    from types import SimpleNamespace as NS

    from gizer import research as R
    assert '"top_picks": {"min_prob": 0.55, "max_per_game": 5, "main_line_only": True}' in inspect.getsource(R)
    monkeypatch.setitem(R.RISK_POLICY["top_picks"], "min_prob", 0.55)

    def sel(prob, low, be, cls="standard", ev=90, main=True):
        return NS(prob=prob, prob_low=low, breakeven=be, classification=cls, evidence_score=ev,
                  evidence={"main_line": main})
    long_shot = sel(0.30, 0.27, 0.18)
    thin_fav = sel(0.86, 0.85, 0.84)             # -525 rung: very likely, almost no margin
    value = sel(0.60, 0.58, 0.50)                # near-even main line with a real margin
    small = sel(0.57, 0.55, 0.53)
    off_ladder = sel(0.90, 0.89, 0.80, main=False)  # a far ladder rung is never a top pick
    rejected = sel(0.70, 0.66, 0.55, cls="rejected")
    watch = sel(0.62, 0.48, 0.52, cls="watchlist")
    xs = (long_shot, thin_fav, value, small, off_ladder, rejected, watch)
    assert [R.top_pick_eligible(x) for x in xs] == [False, True, True, True, False, False, False]
    ranked = sorted([x for x in xs if R.top_pick_eligible(x)], key=R._rank_key)
    assert ranked == [value, small, thin_fav]                                                    # best value first
    assert R.RISK_POLICY["standard"]["min_edge_low"] == 0.0 and R.RISK_POLICY["max_plausible_edge"] == 0.10   # other gates untouched
    assert R.RISK_POLICY["qualifying_price_band"] == [0.15, 0.85]


def test_main_line_is_the_ladder_rung_priced_closest_to_even():
    """A Kalshi ladder keeps one main line per player and stat, chosen from market prices only."""
    from types import SimpleNamespace as NS

    from gizer import research as R

    def q(line, side, be, market="player_fg3m", pid=7, book="Kalshi"):
        return NS(market=market, subject_type="player", subject_id=pid, book=book, line=line, side=side,
                  breakeven=be, evidence={})
    ladder = [q(0.5, "over", 0.90), q(0.5, "under", 0.14), q(1.5, "over", 0.62), q(1.5, "under", 0.42),
              q(2.5, "over", 0.41), q(2.5, "under", 0.63), q(3.5, "over", 0.18), q(3.5, "under", 0.85)]
    single = [q(24.5, "over", 0.52, market="player_pts", book="DK"), q(24.5, "under", 0.52, market="player_pts", book="DK")]
    game = [NS(market="total", subject_type="team", subject_id=None, book="Kalshi", line=221.5, side="over", breakeven=0.5, evidence={})]
    R.mark_main_lines(ladder + single + game)
    assert [x.line for x in ladder if x.evidence["main_line"]] == [2.5, 2.5]   # 0.41 is closest to 0.5
    assert all(x.evidence["main_line"] for x in single + game)

