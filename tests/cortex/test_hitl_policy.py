"""Unit tests for HITL policy evaluation."""

from __future__ import annotations

from DAO.hitl.policy import evaluate_hitl_policy, hitl_fingerprint


def test_deploy_terminal_command_matches():
    policy = {"deploy": True}
    match = evaluate_hitl_policy(
        "terminal",
        {"command": "fly deploy --remote-only"},
        policy,
    )
    assert match is not None
    assert match.policy_key == "deploy"
    assert "fly deploy" in match.action_summary.lower()


def test_deploy_disabled_skips():
    assert evaluate_hitl_policy("terminal", {"command": "fly deploy"}, {"deploy": False}) is None


def test_spend_threshold_blocks():
    policy = {"spend_over_usd": 50}
    match = evaluate_hitl_policy("checkout", {"amount": 120}, policy)
    assert match is not None
    assert match.policy_key == "spend_over_usd"


def test_spend_under_threshold_allows():
    policy = {"spend_over_usd": 50}
    assert evaluate_hitl_policy("checkout", {"amount": 25}, policy) is None


def test_terminal_bare_numbers_do_not_trigger_spend():
    policy = {"spend_over_usd": 50}
    assert evaluate_hitl_policy(
        "terminal",
        {"command": "lsof -tiTCP:9119 | xargs kill -9; git log --oneline -5"},
        policy,
    ) is None
    assert evaluate_hitl_policy(
        "terminal",
        {"command": "grep 46294 fix/bedrock infra/migrations"},
        policy,
    ) is None


def test_terminal_explicit_usd_triggers_spend():
    policy = {"spend_over_usd": 50}
    match = evaluate_hitl_policy(
        "terminal",
        {"command": "stripe charges create --amount $120.00"},
        policy,
    )
    assert match is not None
    assert match.policy_key == "spend_over_usd"

    match = evaluate_hitl_policy(
        "terminal",
        {"command": "transfer 200 usd to vendor"},
        policy,
    )
    assert match is not None
    assert match.policy_key == "spend_over_usd"


def test_external_email_send_message():
    policy = {"external_email": True}
    match = evaluate_hitl_policy(
        "send_message",
        {"platform": "email", "to": "ceo@example.com"},
        policy,
    )
    assert match is not None
    assert match.policy_key == "external_email"


def test_dns_terminal_command():
    policy = {"dns_change": True}
    match = evaluate_hitl_policy(
        "terminal",
        {"command": "aws route53 change-resource-record-sets ..."},
        policy,
    )
    assert match is not None
    assert match.policy_key == "dns_change"


def test_fingerprint_stable_for_same_intent():
    args = {"command": "kubectl apply -f deploy.yaml"}
    fp1 = hitl_fingerprint("deploy", "terminal", args)
    fp2 = hitl_fingerprint("deploy", "terminal", args)
    assert fp1 == fp2
