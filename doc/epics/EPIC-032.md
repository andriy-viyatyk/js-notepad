# EPIC-032: Wiki / Vector Memory — external knowledge-base service

## Status

**Status:** Draft — design under discussion, NOT final. Everything below is provisional and may change before implementation planning starts. No tasks are carved yet.
**Created:** 2026-06-13

## Overview

A personal knowledge base ("Wiki") built on a folder tree of markdown documents, indexed for both full-text and semantic (vector) search, served by a **separate standalone service application** with an HTTP REST API. Persephone integrates with it as an optional feature (off by default, Git-integration style): a tree-view editor for browsing documents, search UI, and MCP tools so AI agents can read, search, and maintain the knowledge base. The same service can later be deployed to Azure with the API unchanged.

The motivating use case: organize personal and work information in one searchable place, and let an AI agent find the proper information and help maintain the memory (add new information when needed or asked).

## Core requirements (from discussion)

1. **Documents** — markdown only, organized in a folder tree (folders = categories). Each document (not category) can have tags. Binary files may live alongside, referenced from markdown, but are not indexed.
2. **Files are the source of truth** — the wiki lives in a user-selected folder as plain `.md` files with **YAML frontmatter** (tags, created date, area, …). The search index is a derived, rebuildable artifact: a full rescan of the folder restores all metadata from the documents themselves.
3. **Search** — both simple text match and vector (semantic) search, with filters:
   - restrict to a category / subtree (path prefix)
   - documents that have / do not have specific tags
   - date range
4. **Persephone editor** — dedicated view showing the document tree (looks like the Explorer panel); click navigates to the document. Plus search UI. MarkdownView enhanced to parse the frontmatter block and display it separately (metadata bar: tag chips, date, area) instead of raw YAML.
5. **MCP exposure** — agents can do everything: create documents, search in different ways, maintain the memory.
6. **Daily logs** — besides the structured wiki, daily log documents (with an "area" parameter to include/exclude from search) and a timeline view in Persephone.
7. **Optional for Persephone** — implemented as a completely separate project; Persephone only integrates with it.
8. **Minimal installation** — the local service must require minimal installation: ideally zero extra steps when enabled from Persephone; optionally a simple dedicated installer for standalone use.
9. **Azure-compatible** — some day the service may be deployed to Azure; Persephone must work with the deployed version through the same HTTP protocol.

## Provisional design decisions

> All decisions below are the current working position — open to revision during review.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Document format | Markdown + YAML frontmatter | Ecosystem-standard (Obsidian, GitHub, Jekyll render it); self-describing files; Monaco highlights YAML. JSON `config` code block considered and rejected in favor of the standard. |
| D2 | Source of truth | Files on disk; index derived + rebuildable | Wiki stays usable without the service (grep, git, OneDrive); index rebuild is a normal operation, not a migration. |
| D3 | Service language | **Rust**, single self-contained exe | Minimal-install requirement: no runtime deps (vs Python/.NET). Repo already builds Rust (`launcher/`, `snip-tool/`). Service speed itself is irrelevant at personal scale — the choice is about deployment ergonomics. |
| D4 | Index storage | **SQLite + sqlite-vec + FTS5**, one `.db` file | Single data file, zero ops, maintained (sqlite-vec v0.1.9, 2026-03). Hybrid ranking = ~30 lines of app-level RRF. Alternative LanceDB (Rust SDK 1.0, built-in hybrid) noted but heavier; adds nothing at this scale. |
| D5 | Embedding model | **gte-multilingual-base**, int8 ONNX (~324 MB), via `ort` crate | Multilingual (EN + UK), Apache 2.0, CPU-friendly. Pluggable embedder interface; model name/version recorded in the index — mismatch triggers rebuild. Upgrade path: Qwen3-Embedding-0.6B (~620 MB, current MMTEB leader). Use query/passage instruction prefixes from day one; Matryoshka dim-truncation optional. |
| D6 | Embedding locality | Local inference only by default | Privacy — work data must not go to third-party APIs. Azure OpenAI embeddings become an alternative embedder when deployed. |
| D7 | Search | Hybrid: FTS5 (BM25) + vector top-K, merged with Reciprocal Rank Fusion; metadata filters as SQL predicates | FTS catches exact identifiers/names vector search misses; vector catches paraphrases. Subtree filter = path-prefix match. |
| D8 | Chunking | By markdown headings, with a size cap | A hit points at a section — better display and better embedding quality than whole-document vectors. |
| D9 | Protocol | REST/JSON over HTTP + bearer token | Same API for `localhost` and Azure; trivial to call from Persephone, scripts, tests. |
| D10 | MCP | Phase 1: Persephone's MCP server exposes `wiki_*` tools proxying the REST API. Later: native MCP (HTTP) on the service itself | Agents get access through existing integration first; direct service MCP matters once Azure-deployed / Persephone-independent. |
| D11 | Distribution | With Persephone: Settings checkbox triggers download (or ships) of service exe + model into app data; Persephone manages process lifecycle (sidecar, like Tor service). Standalone: simple installer / zip later | Zero-install default path; model (~324 MB) downloaded on first enable, not bundled — FTS works before the model arrives. |
| D12 | Multiple roots | Support multiple independent wiki roots (each its own folder + index) from the start | "Work" and "personal" can be physically separate stores, not just an `area` tag — important for work-data handling. |
| D13 | Daily logs | `log/YYYY/YYYY-MM-DD.md` with `area:` frontmatter; timeline = date-sorted query | Same document model; no special storage. |
| D14 | Dates | In-document `created` date is authoritative; file mtime only a fallback | File timestamps are unreliable (git checkout, sync, copy all reset mtime). |

## Draft REST surface (sketch)

```
GET    /tree                         # category/document tree
GET    /doc/{path}                   # document + parsed frontmatter
PUT    /doc/{path}                   # create/update
DELETE /doc/{path}
POST   /search                       # { query, mode: text|vector|hybrid,
                                     #   subtree, tags, excludeTags, area, dateRange, topK }
GET    /timeline?area=...&from=...   # daily-log feed
POST   /reindex
```

## Research summary (web research, 2026-06-13)

Three parallel research passes (local embedding models; embedded vector stores; reusable off-the-shelf projects). Conclusions:

- **No existing project is worth adopting.** ~20 projects surveyed (Microsoft Kernel Memory, mem0, Letta, Zep/Graphiti, khoj, R2R, AnythingLLM, cognee, PrivateGPT, LlamaIndex/LlamaDeploy, Haystack/hayhooks, Chroma/Qdrant MCP servers, library-mcp, knowledge-mcp, mcp-local-rag, …). Nearly all *ingest copies* of documents into their own store — violating files-as-truth. The closest match, **basic-memory** (markdown-as-truth + FTS5/vector hybrid + native MCP, actively maintained), is Python (fails minimal-install), has no REST API, and lacks frontmatter filters, subtree filtering, and timeline queries. Worth skimming for design ideas (markdown conventions, MCP tool surface), not for code.
- **sqlite-vec** is alive and maintained; SQLite-based vector+FTS5 in one file remains a recommended pattern at personal scale. **LanceDB** (Rust SDK 1.0, native hybrid+RRF, Azure Blob storage path) is the noted alternative if requirements outgrow SQLite.
- **Embedding shortlist** (mid-2026): `gte-multilingual-base` int8 ONNX (324 MB, Apache 2.0) as the starting model; `Qwen3-Embedding-0.6B` Q8 GGUF (620 MB, MMTEB leader) as the quality upgrade; `bge-m3` if heavy code/structured content. `jina-embeddings-v3` excluded (non-commercial license). Techniques to bake in: instruction prefixes (`query:` / `passage:`), MRL dim-truncation, pluggable runtime (`ort` for ONNX; llama.cpp HTTP server if a GGUF model is chosen).

### Second research pass (2026-06-13) — "is it already built?" + engine-reuse alternative

Targeted deep-dive into niche candidates and reusable search engines:

- **QMD** (tobi/qmd, ~26.5k ⭐, TypeScript): closest existing product in spirit — hybrid BM25 + local embeddings over markdown, files-as-truth, MCP. Not adoptable: no REST API, no file watcher, no tag/date filters, Node 22 required, Windows install broken (mid-2026). **Keep as a design reference** (model choices: EmbeddingGemma-300M + Qwen3-Reranker; MCP tool surface).
- **memsearch** (zilliztech, ~2k ⭐): markdown-as-truth + live watcher + hybrid, but Python, no native Windows (WSL2 only), no REST. Rejected.
- **SilverBullet** (~2.4k ⭐): self-hosted markdown wiki, files-as-truth, but no stable REST search endpoint (UI/Lua only), semantic search only via third-party plug + Ollama. Rejected.
- **Meilisearch** (~50k ⭐, Rust, very active): NOT a wiki, but a production-grade index engine that natively provides everything in D4+D5+D7: single official `meilisearch.exe`, built-in hybrid search (BM25 + vector, tunable ratio), **in-process CPU embedding** with a configurable HuggingFace ONNX model auto-downloaded on first use, filterable attributes (tags arrays, path prefix, date ranges), first-class versioned REST API. Does not watch folders or parse markdown — that stays our service's job. → recorded as the **engine-reuse alternative** in Open Questions.

- **Typesense** (~26k ⭐, C++, active): same shape as Meilisearch — native Windows exe, built-in local ONNX embedding (incl. `ts/multilingual-e5-small`), first-class tag/date filters, REST. Weaker spot: bundled models are 2022–23 generation, no native path-prefix/glob filter. Second engine-reuse candidate behind Meilisearch.
- **Fresh GitHub sweep** (small/new projects): `devwhodevs/engraph` (Rust, ~145 ⭐ — hybrid 5-lane search + watcher + 26 REST endpoints + llama.cpp embeddings; **no Windows binary**, would need building from source); `alphabet-h/kb-mcp` (Rust, brand-new ~1 ⭐ — on paper hits everything incl. Windows zip, FTS5+sqlite-vec, watcher, tag/date/path filters, but MCP-over-HTTP rather than REST and zero maturity); `flupkede/codesearch`, `geckse/markdown-vdb`, `os-tack/ostk-recall` (each misses REST or Windows). None mature enough to adopt; engraph + kb-mcp validate that our D3–D8 stack is the pattern others converge on.

**Conclusion:** adopt-as-is is confirmed dead; the real choice is *build the index ourselves (D4/D5)* vs *reuse Meilisearch (or Typesense) as a managed sidecar engine behind our thin service*. Either way our REST API is the stable contract, so the engine is swappable later.

## Rough phase outline (NOT carved into tasks yet)

1. **Service core** — repo/project setup, file scanning, frontmatter parsing, SQLite + FTS5, REST API, text search only. Already a usable wiki; proves the architecture.
2. **Vectors** — ONNX embedder, heading-based chunking, hybrid search, incremental reindex (file watcher).
3. **Persephone integration** — Settings toggle + service URL, sidecar lifecycle (download/launch/health), Wiki tree editor (Explorer-like), documents open via existing markdown/text editors.
4. **Search UI + MarkdownView frontmatter bar** — search panel with filter chips; metadata bar replacing raw frontmatter in rendered view.
5. **MCP tools** — `wiki_*` tool set + agent guide resource (when/how to file new information, like the existing `mcp-res-*.md` guides).
6. **Daily logs + timeline view.**
7. **Later / optional** — standalone installer, native MCP on the service, Azure deployment + auth, Azure OpenAI embedder.

## Open questions (to resolve during review/discussion)

- [x] **Index engine: build vs reuse — RESOLVED (2026-06-13): Option A, build everything ourselves** (SQLite + sqlite-vec + FTS5 + `ort` embeddings, per D4/D5). Rationale: full control over every layer and the freedom to shape the best possible Persephone integration; single process, single rebuildable `.db` file. The rejected Option B (thin service + **Meilisearch** sidecar engine — single official exe, built-in hybrid search with in-process embeddings, mature REST; Typesense as runner-up) stays recorded as a fallback: because our REST API is the stable contract, the engine could still be swapped later if owning embedding inference / relevance tuning proves too costly.
- [ ] **Service name** (and repo location: separate GitHub repo vs folder in the Persephone repo like `launcher/`).
- [ ] **Frontmatter schema** — exact field set (`tags`, `created`, `area`, … what else? `title`? `updated`?) and which are required.
- [ ] **Who watches files** — the service watches its roots (self-contained) vs Persephone notifies on save (simpler service)? Probably service-side watcher + explicit `/reindex`.
- [ ] **Index location** — inside the wiki folder (travels with it) vs app data (keeps wiki folder clean)? Leaning: inside, e.g. `.wiki-index/` (gitignored).
- [ ] **Editing flow** — does Persephone edit wiki files directly on disk (existing file editors) with the service just indexing, or do all writes go through the service API? Leaning: direct file edits locally + API writes for agents/remote; the watcher reconciles. But the Azure variant has no shared disk — remote mode may need API-only editing.
- [ ] **Multiple roots UX** — how roots are registered/selected in Persephone and addressed in the API (root id prefix in paths?).
- [ ] **Auth for local mode** — none on localhost vs same bearer-token mechanism everywhere.
- [ ] **Tag vocabulary** — free-form tags vs maintained tag list (autocomplete source, rename support).
- [ ] **Model download source** — where the exe + ONNX model are hosted (GitHub Releases of the service repo?), checksum verification.
- [ ] **Conflict handling** — concurrent edit via API while the file is open in Persephone (file watcher already covers external-change reload?).

## Linked Tasks

No tasks yet — tasks will be carved only after the design is reviewed and settles.

| ID | Title | Status |
|----|-------|--------|
| — | *(pending design review)* | — |

## Notes

### 2026-06-13 — DECISION: build everything ourselves (Option A)
- The user chose to build the full stack in-house (own index per D4/D5) rather than reuse Meilisearch/Typesense as a sidecar engine — full control and the best possible Persephone integration outweigh the saved effort. D4 (SQLite + sqlite-vec + FTS5) and D5 (gte-multilingual-base via `ort`) are hereby firmed up from "provisional" to "decided direction"; Meilisearch remains a documented fallback only.

### 2026-06-13 — second research pass: adopt-as-is dead; engine-reuse alternative added
- Deep-dived QMD, memsearch, SilverBullet, Meilisearch, Typesense + a fresh GitHub sweep (engraph, kb-mcp, codesearch, markdown-vdb, ostk-recall). No project can be adopted as-is (each misses REST, Windows, filters, or maturity). New top open question recorded: build our own index (D4/D5) vs reuse **Meilisearch** as a managed sidecar engine behind our thin service. QMD kept as a design reference.

### 2026-06-13 — epic created (draft)
- Created from a design discussion + a three-way web-research pass (embedding models, vector stores, reusable projects). Status set to **Draft**: the user will review, the discussion continues, and the design may change before implementation planning starts.
- Key provisional positions: build-own Rust single-exe service (no suitable adopt/fork candidate found); markdown + YAML frontmatter, files-as-truth; SQLite + sqlite-vec + FTS5 hybrid; gte-multilingual-base ONNX local embeddings; REST/JSON protocol; Persephone-side MCP proxy first; sidecar distribution with model downloaded on first enable.
