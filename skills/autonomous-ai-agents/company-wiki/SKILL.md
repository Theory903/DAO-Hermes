---
name: company-wiki
description: "Space company wiki — llm-wiki pattern on Drive at /wiki/ (entities, concepts, index, log)."
version: 1.0.0
author: DAO OS
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [DAO, wiki, knowledge-base, drive, research, company]
    category: autonomous-ai-agents
    related_skills: [llm-wiki, DAO-os]
---

# Company Wiki (Space Drive)

Build and maintain a **compounding company knowledge base** as interlinked markdown on the Space **Drive** at **`/wiki/`**.

This is the Karpathy [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern — adapted for DAO OS:

| Layer | Path | Purpose |
|-------|------|---------|
| Schema | `/wiki/SCHEMA.md` | Domain, conventions, tag taxonomy |
| Index | `/wiki/index.md` | Sectioned catalog with one-line summaries |
| Log | `/wiki/log.md` | Append-only activity log |
| Raw | `/wiki/raw/...` | Immutable sources (articles, papers, transcripts) |
| Wiki pages | `/wiki/entities/`, `concepts/`, `comparisons/`, `queries/` | Agent-owned, cross-linked pages |

**Do not confuse with Brain:** compiled reuse truths go to **`/knowledge/{slug}/compiled.md`** via `DAO_store_knowledge` (Brain entities, never-do-twice). The **wiki** is the full interlinked research graph; Brain holds distilled facts worth reusing in tasks.

## Tools (always use these — not local `~/wiki`)

| Tool | When |
|------|------|
| `DAO_wiki_read` | Orientation and before edits (`SCHEMA`, `index`, `log`, any page) |
| `DAO_wiki_write` | Create or update any `/wiki/` markdown file |
| `DAO_store_knowledge` | Only for high-confidence compiled truths → Brain + `/knowledge/` |
| `DAO_navigate(screen="wiki")` | Open Brain → Wiki tab |

Folders under `/wiki/` are created **lazily** on first write — never pre-seed empty trees.

## Resuming (every session)

Before ingesting or filing pages:

1. `DAO_wiki_read(path="SCHEMA")`
2. `DAO_wiki_read(path="index")`
3. `DAO_wiki_read(path="log")` — scan recent entries

If `SCHEMA` is missing, the wiki is uninitialized — run **Initialize** below.

## Initializing a new Space wiki

1. Ask the Board what **domain** the wiki covers (market, product, competitors, ops playbooks, etc.).
2. Write only three root files via `DAO_wiki_write`:
   - `SCHEMA.md` — domain + conventions (see template in `llm-wiki` skill)
   - `index.md` — empty section headers (Entities, Concepts, Comparisons, Queries, Raw sources)
   - `log.md` — creation entry with date
3. Confirm ready; suggest first sources to ingest.
4. `DAO_navigate(screen="wiki")` so the Board can browse in Brain.

**Do not** create `raw/`, `entities/`, etc. until the first file needs them.

## Lazy directories

| First action | Path pattern |
|--------------|--------------|
| Ingest source | `raw/articles/…`, `raw/papers/…`, `raw/transcripts/…` |
| Entity page | `entities/{slug}.md` |
| Concept page | `concepts/{slug}.md` |
| Comparison | `comparisons/{slug}.md` |
| Saved query | `queries/{slug}.md` |

## Page conventions

- Lowercase hyphen filenames (`acme-corp.md`)
- YAML frontmatter: `title`, `created`, `updated`, `type`, `tags`, `sources`
- Use `[[wikilinks]]` between pages (minimum 2 outbound links on synthesis pages)
- After creating/updating a page: update `index.md` and append one line to `log.md`
- Raw sources are **read-only** after ingest

## When to create a page

Create when material is **durable**, **non-duplicate**, and **useful for future work**. Skip ephemeral chat, duplicate entities, or one-off notes better suited for a single `DAO_store_knowledge` call.

## Ingest workflow

1. Orient (SCHEMA, index, log)
2. Search existing pages via index / `DAO_wiki_read` on likely slugs
3. Store raw source under `raw/…` if keeping provenance
4. Create or update entity/concept pages with cross-links
5. Update `index.md` and append `log.md`
6. For a single crisp fact the whole company should reuse in tasks → also `DAO_store_knowledge`

## Query workflow

When the Board asks a research question and a wiki exists:

1. Orient
2. Read relevant pages from index
3. Synthesize in chat; file under `queries/` only if worth keeping
4. Navigate to wiki when deliverable is browseable

## Lint / health

Periodically check: orphan pages not in index, broken `[[links]]`, stale `updated` dates, `contested: true` frontmatter. Log lint actions in `log.md`.

## Reload this skill when

- Setting up company research memory
- Competitor / market intelligence projects
- Onboarding a new Space
- User says "company wiki", "knowledge base", or "document what we learned"
