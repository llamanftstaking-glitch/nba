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
