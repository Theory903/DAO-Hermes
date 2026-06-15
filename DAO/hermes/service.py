"""Hermes operations within the active DAO VPC runtime context."""

from __future__ import annotations

import logging
from typing import Any

import yaml

from DAO.runtime import get_runtime_context

_log = logging.getLogger(__name__)


def _strip_internal(config: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in config.items() if not str(k).startswith("_")}


def runtime_summary() -> dict[str, Any]:
    ctx = get_runtime_context()
    if ctx is None:
        return {"bound": False}
    return {
        "bound": True,
        "user_id": str(ctx.user_id),
        "space_id": str(ctx.space_id) if ctx.space_id else None,
        "org_id": str(ctx.org_id) if ctx.org_id else None,
        "tier": ctx.tier,
        "deployment": ctx.deployment,
        "vpc_mode": ctx.vpc_mode,
        "personal_home": str(ctx.personal_home),
        "space_shared": str(ctx.space_shared) if ctx.space_shared else None,
        "org_shared": str(ctx.org_shared) if ctx.org_shared else None,
    }


def get_config() -> dict[str, Any]:
    from hermes_cli.config import load_config

    return _strip_internal(load_config())


def get_config_raw() -> dict[str, str]:
    from hermes_cli.config import get_config_path

    path = get_config_path()
    if not path.exists():
        return {"yaml": "", "path": str(path)}
    return {"yaml": path.read_text(encoding="utf-8"), "path": str(path)}


def save_config_raw(yaml_text: str) -> None:
    from hermes_cli.config import save_config

    parsed = yaml.safe_load(yaml_text)
    if not isinstance(parsed, dict):
        raise ValueError("YAML must be a mapping")
    save_config(parsed)


def get_model_info() -> dict[str, Any]:
    from hermes_cli.config import load_config

    cfg = load_config()
    model_cfg = cfg.get("model", "")
    if isinstance(model_cfg, dict):
        model_name = model_cfg.get("default", model_cfg.get("name", ""))
        provider = model_cfg.get("provider", "")
        base_url = model_cfg.get("base_url", "")
        config_ctx = model_cfg.get("context_length")
    else:
        model_name = str(model_cfg) if model_cfg else ""
        provider = ""
        base_url = ""
        config_ctx = None

    auto_ctx = 0
    if model_name:
        try:
            from agent.model_metadata import get_model_context_length

            auto_ctx = get_model_context_length(
                model=model_name,
                base_url=base_url,
                provider=provider,
                config_context_length=None,
            )
        except Exception:
            _log.debug("model context lookup failed", exc_info=True)

    config_ctx_int = config_ctx if isinstance(config_ctx, int) and config_ctx > 0 else 0
    effective_ctx = config_ctx_int if config_ctx_int > 0 else auto_ctx

    return {
        "model": model_name,
        "provider": provider,
        "base_url": base_url,
        "auto_context_length": auto_ctx,
        "config_context_length": config_ctx_int,
        "effective_context_length": effective_ctx,
    }


def set_main_model(*, model: str, provider: str = "", base_url: str = "") -> dict[str, Any]:
    from hermes_cli.config import load_config, save_config

    cfg = load_config()
    model = model.strip()
    if not model:
        raise ValueError("model is required")

    existing = cfg.get("model")
    if isinstance(existing, dict):
        entry = dict(existing)
        entry["default"] = model
        if provider:
            entry["provider"] = provider.strip()
        if base_url:
            entry["base_url"] = base_url.strip()
        cfg["model"] = entry
    else:
        cfg["model"] = {"default": model, **({"provider": provider} if provider else {})}

    save_config(cfg)
    return {"ok": True, "model": model, "provider": provider}


def list_skills() -> list[dict[str, Any]]:
    from hermes_cli.config import load_config
    from hermes_cli.skills_config import get_disabled_skills
    from tools.skills_tool import _find_all_skills

    config = load_config()
    disabled = get_disabled_skills(config)
    skills = _find_all_skills(skip_disabled=True)
    for s in skills:
        s["enabled"] = s["name"] not in disabled
    return skills


def toggle_skill(name: str, enabled: bool) -> dict[str, Any]:
    from hermes_cli.config import load_config
    from hermes_cli.skills_config import get_disabled_skills, save_disabled_skills

    config = load_config()
    disabled = get_disabled_skills(config)
    if enabled:
        disabled.discard(name)
    else:
        disabled.add(name)
    save_disabled_skills(config, disabled)
    try:
        from agent.prompt_builder import clear_skills_system_prompt_cache

        clear_skills_system_prompt_cache(clear_snapshot=True)
    except Exception:
        pass
    return {"ok": True, "name": name, "enabled": enabled}


def list_sessions(*, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    from hermes_state import SessionDB

    db = SessionDB()
    try:
        return db.list_sessions_rich(
            limit=max(1, min(limit, 200)),
            offset=max(0, offset),
            min_message_count=0,
            archived_only=False,
            include_archived=False,
            order_by_last_active=True,
        )
    finally:
        db.close()


def list_cron_jobs() -> list[dict[str, Any]]:
    from cron.jobs import load_jobs

    return load_jobs()


def list_mcp_servers() -> list[dict[str, Any]]:
    from hermes_cli.mcp_config import _get_mcp_servers

    servers = _get_mcp_servers()
    out: list[dict[str, Any]] = []
    for name, cfg in sorted(servers.items()):
        item = {"name": name, **(cfg if isinstance(cfg, dict) else {})}
        out.append(item)
    return out


def get_status() -> dict[str, Any]:
    from gateway.status import get_running_pid, read_runtime_status
    from hermes_cli.config import get_config_path, load_config
    from hermes_state import SessionDB

    gateway_pid = get_running_pid()
    gateway_running = gateway_pid is not None
    runtime = read_runtime_status() or {}
    gateway_state = runtime.get("gateway_state")
    if gateway_running and gateway_state in {None, "stopped"}:
        gateway_state = "running"

    session_count = 0
    try:
        db = SessionDB()
        try:
            session_count = len(db.list_sessions_rich(limit=500, offset=0))
        finally:
            db.close()
    except Exception:
        _log.debug("session count failed", exc_info=True)

    cfg = load_config()
    model_info = get_model_info()

    return {
        "gateway_running": gateway_running,
        "gateway_pid": gateway_pid,
        "gateway_state": gateway_state,
        "gateway_platforms": runtime.get("platforms") or {},
        "session_count": session_count,
        "config_path": str(get_config_path()),
        "model": model_info.get("model"),
        "provider": model_info.get("provider"),
        "hermes_home": str(get_config_path().parent),
        "runtime": runtime_summary(),
    }


def get_cli_catalog() -> list[dict[str, str]]:
    """Surface areas the web Agent Studio covers (CLI parity map)."""
    return [
        {"id": "config", "label": "Configuration", "cli": "hermes config"},
        {"id": "models", "label": "Models", "cli": "hermes model"},
        {"id": "skills", "label": "Skills", "cli": "hermes skills"},
        {"id": "sessions", "label": "Sessions", "cli": "hermes sessions"},
        {"id": "cron", "label": "Cron / Automations", "cli": "hermes cron"},
        {"id": "mcp", "label": "MCP Servers", "cli": "hermes mcp"},
        {"id": "gateway", "label": "Gateway", "cli": "hermes gateway"},
        {"id": "chat", "label": "Interactive chat", "cli": "hermes chat / TUI"},
    ]
