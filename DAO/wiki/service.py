"""Company wiki backed by Space Drive (Karpathy / llm-wiki layout at ``/wiki/``)."""

from __future__ import annotations

import re
from datetime import date
from typing import Any
from uuid import UUID

from DAO.drive.storage import read_blob

WIKI_ROOT = "/wiki/"
META_FILES = frozenset({"SCHEMA.md", "index.md", "log.md"})
SECTION_LABELS: dict[str, str] = {
    "entities": "Entities",
    "concepts": "Concepts",
    "comparisons": "Comparisons",
    "queries": "Saved queries",
    "raw": "Raw sources",
}

_SCHEMA_TEMPLATE = """# Wiki Schema

## Domain
{domain}

## Conventions
- Lowercase hyphen filenames (`acme-corp.md`)
- YAML frontmatter: `title`, `created`, `updated`, `type`, `tags`, `sources`
- Cross-link pages with `[[wikilinks]]` (at least 2 outbound links on synthesis pages)
- Raw sources under `raw/` are read-only after ingest

## Tags
general, competitor, product, market, ops, research

## Page thresholds
Create entity/concept pages when material appears in 2+ sources or is central to one durable source.
"""

_INDEX_TEMPLATE = """# Wiki Index

> Content catalog. Every wiki page listed under its type with a one-line summary.
> Read this first to find relevant pages for any query.
> Last updated: {today} | Total pages: 0

## Entities

## Concepts

## Comparisons

## Queries

## Raw sources
"""

_LOG_TEMPLATE = """# Wiki Log

> Chronological record of all wiki actions. Append-only.
> Format: `## [YYYY-MM-DD] action | subject`
> Actions: ingest, update, query, lint, create, archive, delete

## [{today}] create | Wiki initialized
- Domain: {domain}
- Structure created with SCHEMA.md, index.md, log.md
"""


async def _space_display_name(conn, space_id: UUID) -> str:
    row = await conn.fetchrow("SELECT name FROM spaces WHERE id = $1", space_id)
    if row and row["name"]:
        return str(row["name"]).strip()
    return "Company knowledge"


async def ensure_wiki_initialized(
    conn,
    space_id: UUID,
    *,
    domain: str | None = None,
    produced_by_dept: str = "research",
) -> bool:
    """Backfill SCHEMA.md, index.md, and log.md when missing. Returns True if any file was created."""
    from DAO.drive.store import store_text_object

    domain_label = (domain or await _space_display_name(conn, space_id)).strip() or "Company knowledge"
    today = date.today().isoformat()
    created = False

    seeds: list[tuple[str, str]] = [
        (f"{WIKI_ROOT}SCHEMA.md", _SCHEMA_TEMPLATE.format(domain=domain_label)),
        (f"{WIKI_ROOT}index.md", _INDEX_TEMPLATE.format(today=today)),
        (f"{WIKI_ROOT}log.md", _LOG_TEMPLATE.format(today=today, domain=domain_label)),
    ]

    for path, content in seeds:
        if await read_wiki_file(conn, space_id, path) is not None:
            continue
        await store_text_object(
            conn,
            space_id,
            path,
            content,
            produced_by_dept=produced_by_dept,
        )
        created = True

    return created


def wiki_path(relative: str) -> str:
    rel = relative.strip().lstrip("/")
    if ".." in rel.split("/"):
        raise ValueError("Invalid wiki path")
    if not rel.lower().endswith(".md"):
        rel = f"{rel}.md"
    return f"{WIKI_ROOT}{rel}"


def page_key_from_path(path: str) -> str:
    """``/wiki/entities/acme.md`` → ``entities/acme``."""
    normalized = path.strip()
    if not normalized.startswith(WIKI_ROOT):
        return normalized.strip("/")
    rest = normalized[len(WIKI_ROOT) :]
    if rest.endswith(".md"):
        rest = rest[:-3]
    return rest


def section_for_path(path: str) -> str | None:
    parts = [p for p in path.strip("/").split("/") if p]
    if len(parts) < 2 or parts[0] != "wiki":
        return None
    if len(parts) == 2:
        return "_meta" if parts[1] in META_FILES else "root"
    return parts[1]


def _parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    if not content.startswith("---"):
        return {}, content
    end = content.find("\n---", 3)
    if end == -1:
        return {}, content
    block = content[3:end].strip()
    body = content[end + 4 :].lstrip("\n")
    meta: dict[str, Any] = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        meta[key.strip()] = val.strip().strip('"').strip("'")
    return meta, body


def title_from_content(content: str, path: str) -> str:
    meta, body = _parse_frontmatter(content)
    if meta.get("title"):
        return str(meta["title"])
    for line in body.splitlines():
        m = re.match(r"^#\s+(.+)$", line.strip())
        if m:
            return m.group(1).strip()
    base = path.rsplit("/", 1)[-1]
    return base.replace(".md", "").replace("-", " ").title()


def summary_from_body(body: str, *, max_len: int = 140) -> str:
    text = body.strip()
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("---"):
            continue
        plain = re.sub(r"\[\[([^\]]+)\]\]", r"\1", stripped)
        plain = re.sub(r"`([^`]+)`", r"\1", plain)
        plain = re.sub(r"\*\*([^*]+)\*\*", r"\1", plain)
        if len(plain) > max_len:
            return plain[: max_len - 1].rstrip() + "…"
        return plain
    return ""


async def _latest_object(conn, space_id: UUID, path: str):
    return await conn.fetchrow(
        """
        SELECT id, path, blob_key, created_at, size
        FROM drive_objects
        WHERE space_id = $1 AND path = $2
        ORDER BY created_at DESC
        LIMIT 1
        """,
        space_id,
        path,
    )


async def read_wiki_file(conn, space_id: UUID, path: str) -> str | None:
    row = await _latest_object(conn, space_id, path)
    if not row:
        return None
    try:
        return read_blob(space_id, row["blob_key"]).decode("utf-8", errors="replace")
    except FileNotFoundError:
        return None


async def list_wiki_pages(conn, space_id: UUID) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT DISTINCT ON (path)
            id, path, created_at, size
        FROM drive_objects
        WHERE space_id = $1
          AND path LIKE '/wiki/%'
          AND path LIKE '%.md'
        ORDER BY path, created_at DESC
        """,
        space_id,
    )
    pages: list[dict[str, Any]] = []
    for row in rows:
        path = row["path"]
        section = section_for_path(path)
        if section in ("_meta", None):
            continue
        if section == "root" and path.rsplit("/", 1)[-1] in META_FILES:
            continue
        content = await read_wiki_file(conn, space_id, path)
        if content is None:
            continue
        meta, body = _parse_frontmatter(content)
        pages.append(
            {
                "id": str(row["id"]),
                "path": path,
                "page_key": page_key_from_path(path),
                "section": section,
                "title": title_from_content(content, path),
                "summary": summary_from_body(body),
                "tags": meta.get("tags"),
                "updated_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
        )
    pages.sort(key=lambda p: (p["section"], p["title"].lower()))
    return pages


async def wiki_snapshot(conn, space_id: UUID) -> dict[str, Any]:
    await ensure_wiki_initialized(conn, space_id)
    schema = await read_wiki_file(conn, space_id, f"{WIKI_ROOT}SCHEMA.md")
    index = await read_wiki_file(conn, space_id, f"{WIKI_ROOT}index.md")
    log_raw = await read_wiki_file(conn, space_id, f"{WIKI_ROOT}log.md") or ""
    pages = await list_wiki_pages(conn, space_id)

    initialized = bool(schema or index or pages)
    domain = None
    if schema:
        m = re.search(r"^## Domain\s*\n+(.+)$", schema, re.MULTILINE)
        if m:
            domain = m.group(1).strip().splitlines()[0]

    sections: dict[str, list[dict[str, Any]]] = {}
    for page in pages:
        sections.setdefault(page["section"], []).append(page)

    section_list = [
        {
            "id": sid,
            "label": SECTION_LABELS.get(sid, sid.replace("-", " ").title()),
            "pages": sections[sid],
        }
        for sid in sorted(sections.keys(), key=lambda s: (s not in SECTION_LABELS, s))
    ]

    log_lines = [ln.strip() for ln in log_raw.splitlines() if ln.strip() and not ln.startswith("#")]
    recent_log = log_lines[-12:]

    stats = {
        "pages": len(pages),
        "entities": len(sections.get("entities", [])),
        "concepts": len(sections.get("concepts", [])),
        "raw_sources": sum(len(sections.get(k, [])) for k in sections if k.startswith("raw")),
    }

    return {
        "initialized": initialized,
        "domain": domain,
        "stats": stats,
        "sections": section_list,
        "index_markdown": index,
        "schema_markdown": schema,
        "recent_log": recent_log,
        "pages": pages,
    }


async def get_wiki_page(conn, space_id: UUID, page_key: str) -> dict[str, Any]:
    await ensure_wiki_initialized(conn, space_id)
    path = wiki_path(page_key)
    row = await _latest_object(conn, space_id, path)
    if not row:
        raise KeyError(page_key)
    content = await read_wiki_file(conn, space_id, path)
    if content is None:
        raise KeyError(page_key)
    meta, body = _parse_frontmatter(content)
    return {
        "id": str(row["id"]),
        "path": path,
        "page_key": page_key_from_path(path),
        "section": section_for_path(path),
        "title": title_from_content(content, path),
        "content": content,
        "body": body,
        "frontmatter": meta,
        "updated_at": row["created_at"].isoformat() if row["created_at"] else None,
    }
