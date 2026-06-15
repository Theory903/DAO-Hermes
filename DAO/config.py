"""DAO configuration from environment."""

from __future__ import annotations

import os
from pathlib import Path


def env(key: str, default: str | None = None) -> str | None:
    return os.environ.get(key, default)


def DAO_enabled() -> bool:
    return env("DAO_API_ENABLED", "0") == "1"


def database_url() -> str:
    url = env("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required when DAO_API_ENABLED=1")
    return url


def DAO_data_root() -> Path:
    root = Path(env("DAO_DATA_ROOT", "./data"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def DAO_deployment() -> str:
    """``local`` (loopback Postgres / dev) or ``cloud`` (hosted)."""
    explicit = env("DAO_ENV")
    if explicit in ("local", "cloud"):
        return explicit
    if explicit in ("development", "dev"):
        return "local"
    db = env("DATABASE_URL", "") or ""
    if any(h in db for h in ("localhost", "127.0.0.1", "@host.docker.internal")):
        return "local"
    return "cloud"


_WEAK_JWT_SECRETS = frozenset(
    {
        "",
        "dev-change-me",
        "dev-change-me-use-openssl-rand-hex-32",
        "changeme",
        "secret",
    }
)


def validate_production_config() -> None:
    """Fail fast when cloud deployment is misconfigured."""
    if not DAO_enabled():
        return
    deployment = DAO_deployment()
    secret = env("JWT_SECRET", "") or ""
    if deployment == "cloud":
        if secret.lower() in _WEAK_JWT_SECRETS or len(secret) < 32:
            raise RuntimeError(
                "JWT_SECRET must be a strong random value (≥32 chars) when DAO_ENV=cloud"
            )
        if env("REDIS_URL") is None:
            raise RuntimeError("REDIS_URL is required when DAO_ENV=cloud (WS tickets + SSE)")


def s3_configured() -> bool:
    return bool(env("S3_ENDPOINT") and env("S3_BUCKET"))


def s3_settings() -> dict[str, str]:
    endpoint = env("S3_ENDPOINT", "") or ""
    return {
        "endpoint_url": endpoint,
        "bucket": env("S3_BUCKET", "DAO-spaces") or "DAO-spaces",
        "access_key": env("S3_ACCESS_KEY", "") or "",
        "secret_key": env("S3_SECRET_KEY", "") or "",
        "region": env("S3_REGION", "us-east-1") or "us-east-1",
    }


def DAO_hermes_vpc_mode() -> str:
    """Hermes isolation: ``user`` (personal VPC), ``space``, or ``shared``."""
    explicit = env("DAO_HERMES_VPC")
    if explicit in ("user", "space", "shared"):
        return explicit
    if env("DAO_UNIFIED_HERMES_HOME") == "0":
        return "space"
    if env("DAO_UNIFIED_HERMES_HOME") == "1":
        return "shared"
    return "user"


def DAO_unified_hermes_home() -> bool:
    return DAO_hermes_vpc_mode() == "shared"


def jwt_secret() -> str:
    secret = env("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is required when DAO_API_ENABLED=1")
    return secret


def jwt_expiry_hours() -> int:
    raw = env("JWT_EXPIRY_HOURS", "168")
    try:
        return max(1, int(raw or "168"))
    except ValueError:
        return 168


def oauth_callback_url() -> str:
    return env("OAUTH_CALLBACK_URL", "http://localhost:9119/api/v1/auth/callback") or (
        "http://localhost:9119/api/v1/auth/callback"
    )


def google_oauth_client_id() -> str | None:
    return env("GOOGLE_OAUTH_CLIENT_ID")


def google_oauth_client_secret() -> str | None:
    return env("GOOGLE_OAUTH_CLIENT_SECRET")


def github_oauth_client_id() -> str | None:
    return env("GITHUB_OAUTH_CLIENT_ID")


def github_oauth_client_secret() -> str | None:
    return env("GITHUB_OAUTH_CLIENT_SECRET")


def redis_url() -> str | None:
    return env("REDIS_URL")


def DAO_web_url() -> str:
    return env("DAO_WEB_URL", "http://localhost:3000") or "http://localhost:3000"


def automation_cron_sync_enabled() -> bool:
    """Mirror Space automations into Hermes cron (set DAO_PLAYBOOK_SCHEDULER=0 to disable)."""
    return env("DAO_PLAYBOOK_SCHEDULER", "1") == "1"
