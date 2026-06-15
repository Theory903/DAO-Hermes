"""Drive blob storage — local filesystem with optional S3-compatible backend."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from uuid import UUID

from DAO.config import s3_configured, s3_settings
from DAO.paths import space_drive_dir

_log = logging.getLogger(__name__)


def space_drive_root(space_id: UUID) -> Path:
    return space_drive_dir(space_id)


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _s3_key(space_id: UUID, blob_key: str) -> str:
    return f"{space_id}/{blob_key}"


def _s3_client():
    import boto3
    from botocore.client import Config

    cfg = s3_settings()
    return boto3.client(
        "s3",
        endpoint_url=cfg["endpoint_url"],
        aws_access_key_id=cfg["access_key"],
        aws_secret_access_key=cfg["secret_key"],
        region_name=cfg["region"],
        config=Config(signature_version="s3v4"),
    )


def store_blob(space_id: UUID, logical_path: str, data: bytes) -> tuple[str, str]:
    blob_key = logical_path.lstrip("/").replace("/", "__")
    digest = content_hash(data)

    if s3_configured():
        cfg = s3_settings()
        client = _s3_client()
        client.put_object(
            Bucket=cfg["bucket"],
            Key=_s3_key(space_id, blob_key),
            Body=data,
            ContentType="application/octet-stream",
        )
        return blob_key, digest

    root = space_drive_root(space_id)
    dest = root / blob_key
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return blob_key, digest


def read_blob(space_id: UUID, blob_key: str) -> bytes:
    if s3_configured():
        cfg = s3_settings()
        client = _s3_client()
        try:
            obj = client.get_object(Bucket=cfg["bucket"], Key=_s3_key(space_id, blob_key))
            return obj["Body"].read()
        except Exception as exc:
            from botocore.exceptions import ClientError

            if isinstance(exc, ClientError) and exc.response.get("Error", {}).get("Code") == "NoSuchKey":
                raise FileNotFoundError(blob_key) from exc
            raise

    path = space_drive_root(space_id) / blob_key
    if not path.exists():
        raise FileNotFoundError(blob_key)
    return path.read_bytes()


def delete_blob(space_id: UUID, blob_key: str) -> None:
    if s3_configured():
        cfg = s3_settings()
        client = _s3_client()
        try:
            client.delete_object(Bucket=cfg["bucket"], Key=_s3_key(space_id, blob_key))
        except Exception as exc:
            _log.debug("S3 delete skipped %s: %s", blob_key, exc)
        return

    path = space_drive_root(space_id) / blob_key
    if path.exists():
        path.unlink()
