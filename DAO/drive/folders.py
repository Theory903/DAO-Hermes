"""Drive folder paths — created lazily when objects are stored (no static seeding)."""

from __future__ import annotations

from uuid import UUID


def parent_folder_paths(object_path: str) -> list[str]:
    """Return every parent folder for a Drive object path, e.g. ``/a/b/c.md`` → ``/a/``, ``/a/b/``."""
    normalized = object_path.strip()
    if not normalized.startswith("/"):
        normalized = "/" + normalized
    parts = [p for p in normalized.strip("/").split("/") if p]
    if len(parts) <= 1:
        return []
    folders: list[str] = []
    acc = ""
    for part in parts[:-1]:
        acc += f"/{part}/"
        folders.append(acc)
    return folders


def folder_under_path(root: str, folder: str) -> bool:
    """True when ``folder`` is ``root`` or a descendant folder."""
    if root == "/":
        return True
    prefix = root if root.endswith("/") else f"{root.rstrip('/')}/"
    return folder.startswith(prefix)


async def ensure_folder_paths(conn, space_id: UUID, object_path: str) -> None:
    """Insert ``drive_folders`` rows for each parent directory of ``object_path``."""
    for folder in parent_folder_paths(object_path):
        await conn.execute(
            """
            INSERT INTO drive_folders (space_id, path)
            VALUES ($1, $2)
            ON CONFLICT (space_id, path) DO NOTHING
            """,
            space_id,
            folder,
        )
