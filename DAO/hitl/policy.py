"""HITL policy evaluation — map tool intents to ai_lead_config.hitl_policy gates."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any

_DEPLOY_CMD = re.compile(
    r"\b(deploy|kubectl\s+apply|kubectl\s+rollout|terraform\s+apply|"
    r"fly\s+deploy|vercel\s+deploy|netlify\s+deploy|docker\s+push|"
    r"helm\s+upgrade|serverless\s+deploy|cdk\s+deploy|pulumi\s+up|"
    r"modal\s+deploy|gcloud\s+run\s+deploy|aws\s+cloudformation)\b",
    re.I,
)
_DNS_CMD = re.compile(
    r"\b(route53|cloudflare|dns\s+record|nsupdate|dig\s+@|"
    r"az\s+network\s+dns|gcloud\s+dns)\b",
    re.I,
)
_SPEND_KEYS = ("amount", "cost", "usd", "budget", "price", "spend", "total")
# Terminal commands often contain ports, PIDs, issue numbers, etc. — only treat
# explicit monetary notation as spend (not bare digits).
_TERMINAL_USD_PATTERNS = (
    re.compile(r"\$\s*(\d+(?:\.\d{1,2})?)", re.I),
    re.compile(r"\b(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?)\b", re.I),
)
_EMAIL_PLATFORMS = frozenset({"email", "smtp", "gmail", "outlook", "mail"})


@dataclass(frozen=True)
class HitlMatch:
    policy_key: str
    action_summary: str
    fingerprint: str


def hitl_fingerprint(policy_key: str, tool_name: str, args: dict | None) -> str:
    payload = {
        "policy_key": policy_key,
        "tool": tool_name,
        "args": _fingerprint_args(args),
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def evaluate_hitl_policy(
    tool_name: str,
    args: dict | None,
    policy: dict[str, Any] | None,
) -> HitlMatch | None:
    """Return a gate match when the tool should require human approval."""
    if not policy:
        return None

    name = (tool_name or "").lower()
    argd = args if isinstance(args, dict) else {}

    if policy.get("deploy"):
        match = _match_deploy(name, argd)
        if match:
            return _make_match("deploy", match, tool_name, argd)

    if policy.get("dns_change"):
        match = _match_dns(name, argd)
        if match:
            return _make_match("dns_change", match, tool_name, argd)

    threshold = _spend_threshold(policy.get("spend_over_usd"))
    if threshold is not None:
        amount = _extract_usd_amount(name, argd)
        if amount is not None and amount > threshold:
            summary = f"Spend ${amount:.2f} exceeds policy limit ${threshold:.2f} ({tool_name})"
            return _make_match("spend_over_usd", summary, tool_name, argd)

    if policy.get("external_email"):
        match = _match_external_email(name, argd)
        if match:
            return _make_match("external_email", match, tool_name, argd)

    if policy.get("delete_drive"):
        match = _match_delete_drive(name, argd)
        if match:
            return _make_match("delete_drive", match, tool_name, argd)

    if policy.get("workflow_promote"):
        match = _match_workflow_promote(name, argd)
        if match:
            return _make_match("workflow_promote", match, tool_name, argd)

    return None


def _make_match(policy_key: str, summary: str, tool_name: str, args: dict) -> HitlMatch:
    fp = hitl_fingerprint(policy_key, tool_name, args)
    return HitlMatch(policy_key=policy_key, action_summary=summary, fingerprint=fp)


def _fingerprint_args(args: dict | None) -> dict[str, Any]:
    if not args:
        return {}
    out: dict[str, Any] = {}
    for key in sorted(args.keys()):
        if key in ("command", "message", "to", "target", "platform", "path", "intent", "amount", "cost"):
            out[key] = args[key]
    return out


def _terminal_command(args: dict) -> str:
    cmd = args.get("command") or args.get("cmd") or ""
    return str(cmd).strip()


def _match_deploy(tool_name: str, args: dict) -> str | None:
    if "deploy" in tool_name:
        return f"Deploy tool blocked pending approval: {tool_name}"
    if tool_name == "terminal":
        cmd = _terminal_command(args)
        if cmd and _DEPLOY_CMD.search(cmd):
            preview = cmd[:120] + ("…" if len(cmd) > 120 else "")
            return f"Deploy command blocked pending approval: {preview}"
    return None


def _match_dns(tool_name: str, args: dict) -> str | None:
    if "dns" in tool_name:
        return f"DNS change blocked pending approval: {tool_name}"
    if tool_name == "terminal":
        cmd = _terminal_command(args)
        if cmd and _DNS_CMD.search(cmd):
            preview = cmd[:120] + ("…" if len(cmd) > 120 else "")
            return f"DNS change blocked pending approval: {preview}"
    return None


def _spend_threshold(raw: Any) -> float | None:
    if raw is None or raw is False:
        return None
    if raw is True:
        return 0.0
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _extract_usd_amount(tool_name: str, args: dict) -> float | None:
    for key in _SPEND_KEYS:
        val = args.get(key)
        if val is None:
            continue
        try:
            return float(val)
        except (TypeError, ValueError):
            continue
    if tool_name == "terminal":
        cmd = _terminal_command(args)
        amounts: list[float] = []
        for pat in _TERMINAL_USD_PATTERNS:
            for m in pat.finditer(cmd):
                try:
                    amounts.append(float(m.group(1)))
                except ValueError:
                    continue
        if amounts:
            return max(amounts)
    return None


def _match_external_email(tool_name: str, args: dict) -> str | None:
    if tool_name != "send_message":
        return None
    platform = str(args.get("platform") or args.get("channel") or "").lower()
    if platform in _EMAIL_PLATFORMS:
        target = args.get("to") or args.get("target") or args.get("chat_id") or ""
        return f"External email blocked pending approval to {target or '(recipient)'}"
    target_ref = str(args.get("target_ref") or args.get("to") or "")
    if "@" in target_ref and not target_ref.endswith("@internal"):
        return f"External email blocked pending approval to {target_ref}"
    return None


def _match_delete_drive(tool_name: str, args: dict) -> str | None:
    if "drive" in tool_name and any(k in tool_name for k in ("delete", "remove", "trash")):
        path = args.get("path") or args.get("object_id") or ""
        return f"Drive delete blocked pending approval: {path or tool_name}"
    if tool_name in ("write_file", "patch") and args.get("delete") is True:
        return f"Drive delete blocked pending approval: {args.get('path', '')}"
    return None


def _match_workflow_promote(tool_name: str, args: dict) -> str | None:
    if "workflow" in tool_name and "promote" in tool_name:
        return f"Workflow promote blocked pending approval: {tool_name}"
    if args.get("promote") is True or args.get("action") == "promote":
        wf = args.get("workflow_id") or args.get("name") or tool_name
        return f"Workflow promote blocked pending approval: {wf}"
    return None
