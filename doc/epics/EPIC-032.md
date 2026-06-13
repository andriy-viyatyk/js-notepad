# EPIC-032: Mneme — Wiki / Vector Memory service

## Status

**Status:** Design complete — all decisions resolved and independently audited; implementation phases & tasks carved (US-652…US-665). Ready to begin Phase 1.
**Created:** 2026-06-13

## Overview

**Mneme** (the Muse of memory; Greek *mnḗmē*, "memory") is a personal knowledge base ("Wiki") built on a folder tree of markdown documents, indexed for both full-text and semantic (vector) search, served by a **separate standalone service application** that exposes a **single MCP interface**. Persephone integrates with it as an optional feature (off by default, Git-integration style): a tree-view editor for browsing documents, search UI, and the same MCP tools/resources that AI agents use to read, search, and maintain the knowledge base. The same service can later be deployed to Azure with the MCP contract unchanged.

The motivating use case: organize personal and work information in one searchable place, and let an AI agent find the proper information and help maintain the memory (add new information when needed or asked).

## Core requirements (from discussion)

1. **Documents** — markdown only, organized in a folder tree (folders = categories). Each document (not category) can have tags. Binary files may live alongside, referenced from markdown, but are not indexed. Attachments are **documents** — diagrams (PNG/SVG), PDFs, office files; **large media (video) is out of scope** (use a dedicated service and reference it). A root may also sit inside a project folder; **both** an **include allowlist** (default `*.md`) **and** **ignore rules** (gitignore-style; defaults `.git`/`node_modules`/`.mneme`/build dirs + the root's `.gitignore`) decide which files are indexed — a file counts iff it matches include and not ignore (see D18).
2. **Files are the source of truth** — the wiki lives in a user-selected folder as plain `.md` files with **YAML frontmatter** (`title`, `tags`, `created`, `verified`). The search index is a derived, rebuildable artifact: a full rescan of the folder restores all metadata from the documents themselves.
3. **Search** — both simple text match and vector (semantic) search, with filters:
   - restrict to a category / subtree (path prefix)
   - documents that have / do not have specific tags
   - date range
4. **Persephone editor** — dedicated view showing the document tree (looks like the Explorer panel); click navigates to the document. Plus search UI. MarkdownView enhanced to parse the frontmatter block and display it separately (metadata bar: tag chips, created / verified dates) instead of raw YAML.
5. **MCP exposure** — agents can do everything: create documents, search in different ways, maintain the memory.
6. **Daily logs** — besides the structured wiki, daily log documents stored under `log/YYYY/YYYY-MM-DD.md`, carrying a `log` tag (plus any topic tags) to include/exclude from search, and a timeline view in Persephone.
7. **Optional for Persephone** — implemented as a completely separate project; Persephone only integrates with it.
8. **Minimal installation** — the local service must require minimal installation: ideally zero extra steps when enabled from Persephone; optionally a simple dedicated installer for standalone use.
9. **Azure-compatible** — some day the service may be deployed to Azure; Persephone must work with the deployed version through the same **MCP contract** (Streamable HTTP transport, bearer/OAuth).

## Provisional design decisions

> All decisions below are the current working position — open to revision during review.
>
> Cells are summaries; the dated **Notes** at the end carry the full, final text for each decision (and any later revisions).

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Document format | Markdown + YAML frontmatter | Ecosystem-standard (Obsidian, GitHub, Jekyll render it); self-describing files; Monaco highlights YAML. JSON `config` code block considered and rejected in favor of the standard. |
| D2 | Source of truth | Files on disk; index derived + rebuildable | Wiki stays usable without the service (grep, git, OneDrive); index rebuild is a normal operation, not a migration. |
| D3 | Service language | **Rust**, single self-contained exe | Minimal-install requirement: no runtime deps (vs Python/.NET). Repo already builds Rust (`launcher/`, `snip-tool/`). Service speed itself is irrelevant at personal scale — the choice is about deployment ergonomics. |
| D4 | Index storage | **SQLite + sqlite-vec + FTS5**; one active `.db` per `(model+precision, schema version)` at `.mneme/<modelId>-<precision>-v<modelVer>/index-v<schemaVer>.db` | Zero ops, maintained (sqlite-vec v0.1.9, 2026-03). Hybrid ranking = ~30 lines of app-level RRF. **Versioned path = no migration code**: a model/schema change rebuilds a fresh file; old files kept for reversible switch-back (GC'd by policy / the monitoring UI). Alternative LanceDB noted but heavier; adds nothing at this scale. |
| D5 | Embedding model | **gte-multilingual-base** ONNX via `ort` — **one artifact for both GPU and CPU** (int8 ~324 MB if it runs on DirectML, else fp16 ~600 MB); the execution provider is a runtime toggle | Multilingual (EN + UK), Apache 2.0. Pluggable embedder; the index `meta` records model **+ precision** — only a model/precision change triggers a rebuild, **not** a GPU↔CPU toggle. Upgrade path: Qwen3-Embedding-0.6B (~620 MB, current MMTEB leader). **Instruction prefixes: NONE for gte (revised — see Note 2026-06-13 "embedding has no instruction prefix").** gte-multilingual-base is a symmetric GTE encoder (CLS-pool + L2-norm) that uses **no** `query:`/`passage:` prefix — the prefix technique applies to the E5/Qwen families, not the chosen model. The `EmbedKind` query/passage split + empty prefix constants are retained as the upgrade seam for a future asymmetric model. Matryoshka dim-truncation optional. **Verified locally (2026-06-13):** ONNX from `onnx-community/gte-multilingual-base` (int8 340 MB / fp16 628 MB / fp32 1.25 GB); **embed dim 768**, context 8192, vocab 250k, `model_type: new`. |
| D6 | Embedding locality | Local inference only by default | Privacy — work data must not go to third-party APIs. Azure OpenAI embeddings become an alternative embedder when deployed. |
| D7 | Search | Hybrid: FTS5 (BM25) + vector top-K, merged with Reciprocal Rank Fusion; metadata filters as SQL predicates | FTS catches exact identifiers/names vector search misses; vector catches paraphrases. Subtree filter = path-prefix match. |
| D8 | Chunking | By markdown headings, with a size cap | A hit points at a section — better display and better embedding quality than whole-document vectors. |
| D9 | Protocol | **Single MCP interface** (no REST) — tools = actions, resources = content; **Streamable HTTP** for both local (loopback `127.0.0.1`, no auth) and networked/Azure (bearer/OAuth) | One contract defined once for both Persephone and agents; one port + one security gate to harden; HTTP is 1-to-many so one running Mneme serves Persephone *and* external agents concurrently — stdio would force each client to spawn its own process (conflicting watchers + SQLite writers). Revised 2026-06-13 (was REST/JSON); transport revised 2026-06-13 (dropped stdio — see Notes). |
| D10 | MCP | **Native MCP server on Mneme from the start** — the sole interface. Persephone consumes it via its existing MCP client (`McpConnectionManager`) plus content-pipeline providers: **`MnemeProvider`** (read/write docs + attachments) and **`MnemeTreeProvider`** (category tree), mirroring `FileProvider`/`FileTreeProvider`. Agents hit the same server (directly or surfaced through Persephone's MCP server) | No REST adapter, no proxy, no second contract. Persephone is already an MCP client (Inspector). Revised 2026-06-13 (was: proxy first, native later). |
| D11 | Distribution | With Persephone: Settings checkbox triggers download (or ships) of service exe + model into app data; Persephone manages process lifecycle (sidecar, like Tor service). Standalone: simple installer / zip later | Zero-install default path; model (~324 MB) downloaded on first enable, not bundled — FTS works before the model arrives. |
| D12 | Multiple roots | Support multiple independent wiki roots (each its own folder + index) from the start | "Work" and "personal" can be physically separate stores, not just an `area` tag — important for work-data handling. |
| D13 | Daily logs | `log/YYYY/YYYY-MM-DD.md` (a `log` tag); timeline = date-sorted query over the `log/` path | Same document model; no special storage. |
| D14 | Dates | In-document `created` date is authoritative; file mtime only a fallback | File timestamps are unreliable (git checkout, sync, copy all reset mtime). |
| D15 | GPU acceleration | Use the GPU for embedding inference when available, via the **DirectML** execution provider (`ort` feature flag); automatic fallback to CPU; setting to force CPU | DirectML works with any DX12 GPU (NVIDIA/AMD/Intel) with zero extra installation — no CUDA/cuDNN dependency, preserving minimal-install. Main payoff: initial bulk indexing of thousands of files (~5–20×); incremental re-embeds are fine on CPU. Azure/Linux variant uses CPU (or CUDA EP on GPU SKUs) behind the same embedder interface. |
| D16 | Access model | **Agents get full access to all tools** — data *and* control-plane (init/add/remove roots, reindex, model update). No hidden methods. Per-client tool scoping (by transport / auth scope, server-side filter + denial) is **retained as an optional capability**, not enforced now | The goal is an assistant that can fully help the user and maintain the memory. Scoping stays available for future needs (remote/multi-tenant Azure, read-only guest, restricting a specific agent) without building it up front; near-term there is one full tool surface on both transports. |
| D17 | Concurrency & responsiveness | Embedding runs on a **dedicated worker** off the async runtime, fed by a **priority queue** (interactive query/edit embeds > bulk reindex); SQLite in **WAL** with a single writer + reader pool; reindex is a **cancellable background job** with MCP progress + backpressure; **per-root DBs** isolate cross-root work | Mneme must stay responsive during a large reindex — track progress, search any root, view/edit docs. Interactive embeds slip between small bulk batches; WAL + per-root DBs avoid read/write contention. Full detail in US-651's "Concurrency & responsiveness model". |
| D18 | What gets indexed (include + ignore) | An **include allowlist** of file globs (default `*.md`) picks document types; **ignore rules** prune locations (gitignore-style: built-in defaults `.mneme/`/`.git/`/`node_modules/`/build dirs + the root's `.gitignore`/`.ignore` + a `.mneme/config` list). Indexed iff **matches include AND not ignore**; both configurable per root, applied to the reconcile walk and the watcher | Allowlist = default-deny: cleaner/safer than enumerating everything to exclude, esp. inside a project folder. Path-ignore still needed (e.g. `node_modules/**/*.md`). Uses the `ignore` crate. **Default scope = markdown** (frontmatter + heading-chunking are markdown-specific). Non-md types (`.js`/`.ts`, …) **can be configured** for indexing — they're **plain-text search targets** (size-based chunking, **no frontmatter**, so no tags/created/verified); `wiki_search` opts into them via an **`ext`** param (default `.md`). Only `.md` carries frontmatter metadata. |

## Draft MCP surface (sketch)

Tools (actions) — shaped after the tools an agent already knows, so the wiki feels native: **file-like** tools mirror Read/Write/Edit/Glob/Grep; **semantic** search is modeled on WebSearch:

```
# File-like — operate on the wiki exactly as on local files.  path = "{root}/{path}".
wiki_read   { path, offset?, limit? }                       # ≈ Read  — content + parsed frontmatter
wiki_write  { path, content }                               # ≈ Write — content = the WHOLE file (frontmatter is YAML text at the top)
wiki_edit   { path, old_string, new_string, replace_all? }  # ≈ Edit  — exact string replacement
wiki_delete { path }                                        # remove a document
wiki_glob   { pattern, path? }                              # ≈ Glob  — find docs by path/name pattern ("work/**/*.md")
wiki_grep   { pattern, path?, -i?, -n?, context?, output_mode?, tags?, dateRange? }   # ≈ Grep — literal/regex match (+ optional wiki filters)

# Semantic — modeled on WebSearch (agents already know it): query in → ranked results
# out (title + mneme:// link + snippet).  The value raw files don't give.
wiki_search { query, mode?: text|vector|hybrid, subtree?, tags?, excludeTags?, dateRange?, topK?, ext? }   # semantic/hybrid relevance (mode default hybrid; topK default 10); subtree "{root}/…" scopes (omit = all roots); ext omitted = .md only

# Views.
wiki_tree     { path? }                        # category/document tree (UI); "{root}/sub" scopes; omit = all roots
wiki_timeline { tags?, from?, to?, subtree? }  # daily-log feed (date-sorted over log/)
wiki_tags     { subtree? }                     # distinct tags + counts (autocomplete / free-form vocabulary)
```

**Root is part of the path, never a separate tool parameter.** Every document address is `{root}/{path-within-root}` — the same form as the resource/link URI `mneme://{root}/{path}` — where `root` is the registered root **name** (uniqueness enforced by `wiki_add_root`). This makes every `mneme://` link globally unique and self-contained. Path tools (`wiki_read`/`write`/`delete`) take that full path; scope-able tools (`wiki_search`/`wiki_tree`/`wiki_timeline`/`wiki_tags`/`wiki_reindex`) take an **optional `{root}/…` path prefix** — named `subtree` on `wiki_search`/`wiki_timeline`/`wiki_tags`, `path` on `wiki_tree`/`wiki_reindex` — to scope to a root or sub-category, and span **all roots** when omitted (search/timeline merge results). Management tools (`wiki_remove_root` / `wiki_index_delete`) identify a root by its **name** — a root identifier, not a document address.

Management / control-plane tools (also available to agents per D16):

```
wiki_add_root     { folder, name? }              # register a new wiki root; folder = OS path, name = root id used in URIs (default: basename)
wiki_remove_root  { root }                        # root = registered root name
wiki_list_roots   {}
wiki_reindex      { path? }                       # path "{root}" or "{root}/sub" scopes; omit = all roots. emits MCP progress notifications
wiki_model_update { model? }                     # download/switch embedding model + progress
wiki_status       {}                             # roots, index inventory (versioned DBs + sizes), model, reindex progress
wiki_index_delete { root, modelId, schemaVer }   # root = registered root name; delete a stale/inactive versioned index DB
```

Resources (content): `mneme://{root}/{path}` — documents and binary attachments, read via `resources/read`. Live status can also be a subscribable resource (`mneme://status`).


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

**Conclusion:** adopt-as-is is confirmed dead; the real choice is *build the index ourselves (D4/D5)* vs *reuse Meilisearch (or Typesense) as a managed sidecar engine behind our thin service*. Either way our own interface (now the MCP server — see the MCP-interface decision below) is the stable contract, so the engine is swappable later.

## Implementation phases & tasks

**Delivery principle (value-first):** Mneme is built to **full functionality first** (Phases 1–2) and is immediately useful via MCP — an AI agent maintains and searches the wiki, while the user reviews/edits the markdown with Persephone's *existing* file editing. Native Persephone integration (Phases 3–6) layers on after. Mneme is testable through MCP at every step — including by connecting its HTTP server straight to a Claude chat or MCP client.

### Phase 1 — Mneme core service (text search, MCP-testable)
- **US-652** — Project scaffold + config + Document Store: `mneme/` Cargo project + CI build; config (roots, include/ignore globs); Document Store (read/write/edit/glob/grep, root-in-path, safe path resolution, attachment serving).
- **US-653** — Frontmatter + chunker + SQLite schema: YAML frontmatter parse (title/tags/created/verified + read-time fallbacks materialized in the index), heading chunker, SQLite (bundled + FTS5 + sqlite-vec) schema at the versioned index path, `meta` row.
- **US-654** — Indexer + watcher + reconcile: always-on `notify` watcher, deferred startup reconcile (mtime+size fast-path → content-hash), content-hash dedup, single-flight per root.
- **US-655** — MCP server (Streamable HTTP, loopback) + agent guide: full tool surface in **text-search mode** (file-like `read`/`write`/`edit`/`glob`/`grep`, `wiki_search` FTS, `tree`/`timeline`/`tags`, management tools) over `rmcp`; `wiki_*` agent guide resource.
- ✅ *Milestone: a usable text-search wiki, fully driveable via MCP — connect its HTTP server to a Claude chat / MCP client to test.*

### Phase 2 — Mneme embeddings + hybrid search (full functionality)
- **US-656** — Model Provisioner: download model + tokenizer from our hosted release (sha256-pinned, resumable, offline/local-path override) into the cache dir; FTS works before it arrives.
- **US-657** — Embedding Engine: `ort` session + `tokenizers`, DirectML→CPU EP selection, query/passage prefixes, `Embedder` trait.
- **US-658** — Hybrid search: chunk-vector upserts into sqlite-vec, pre-filter candidate-id KNN, RRF merge, `wiki_search` vector/hybrid modes.
- **US-659** — Concurrency & responsiveness: dedicated embedding worker + priority queue, WAL single-writer + reader pool, cancellable background reindex job + progress notifications + backpressure.
- ✅ *Milestone: full Mneme — semantic + hybrid search; agent-complete.*

### Phase 3 — Persephone settings + sidecar auto-launch
- **US-660** — Settings toggle (off by default) + main-process Mneme child lifecycle (spawn / health / graceful shutdown, Tor-style); connects over loopback HTTP (parent assigns port via CLI flag, waits for the stdout readiness line before connecting); enabling the feature auto-runs Mneme.

### Phase 4 — Persephone content integration
- **US-661** — `McpConnectionManager` subscription support (`subscribeResource`/`unsubscribeResource` + `resources/updated` & `list_changed` handlers).
- **US-662** — `MnemeProvider` (content-pipeline provider): read/write/edit over MCP + live-refresh via the existing reload path.
- **US-663** — `MnemeTreeProvider` + Explorer-like sidebar panel (tree from `wiki_tree`, `list_changed` refresh). *(Optional: MarkdownView frontmatter metadata bar.)*

### Phase 5 — Mneme config & monitoring editor
- **US-664** — In-Persephone config / monitoring editor: add/remove/list roots, include/ignore config, reindex trigger + live progress, index inventory + delete stale versioned DBs, model update.

### Phase 6 — Installer + first release
- **US-665** — Ship it: electron-builder `extraFiles` (mneme.exe + onnxruntime/DirectML DLLs), CI `cargo build --release`, model download-on-first-enable wiring, release process.

### Backlog (deferred — not in the first release)
Persephone search-UI panel + filter chips; timeline view UI; bearer/OAuth for networked/Azure HTTP; Azure container + Azure OpenAI embedder; multi-type / code indexing (`ext`); frontmatter `created` backfill; per-client tool scoping.

## Open questions (to resolve during review/discussion)

- [x] **Index engine: build vs reuse — RESOLVED (2026-06-13): Option A, build everything ourselves** (SQLite + sqlite-vec + FTS5 + `ort` embeddings, per D4/D5). Rationale: full control over every layer and the freedom to shape the best possible Persephone integration; single process, single rebuildable `.db` file. The rejected Option B (thin service + **Meilisearch** sidecar engine — single official exe, built-in hybrid search with in-process embeddings, mature REST; Typesense as runner-up) stays recorded as a fallback: because our REST API is the stable contract, the engine could still be swapped later if owning embedding inference / relevance tuning proves too costly.
- [x] **Service name — RESOLVED (2026-06-13): Mneme** (the Muse of memory; Greek *mnḗmē* = "memory"). Used for the product name, repo/binary name (`mneme`), and CLI command (`mneme serve`, `mneme reindex`). The earlier pick *Mnema* was reverted: *Mneme* is the mythologically/semantically correct name (the Muse of memory; "Mnema" leans "memorial/monument/tomb"). The collisions that originally steered us off *Mneme* don't apply: the **crates.io** clash is irrelevant because Mneme is **not published as a crate** — it's an internal, standalone binary shipped with Persephone, so the `Cargo.toml` package name is purely local. **Trademark:** negligible practical risk — Mneme is an internal service component (the public brand is Persephone), not a marketed commercial product in "Mneme HQ"'s field; trademark concern would only arise from marketing a commercial product branded "Mneme" in that space, which this is not. (Common/mythological words *can* be trademarks within a market class — that's not the reason it's safe; the non-commercial, sub-component, Persephone-branded nature is.)
- [x] **Repo location — RESOLVED (2026-06-13): in-tree folder `mneme/` in the Persephone repo** (alongside `launcher/` and `snip-tool/`), built in CI (`cargo build --release`) and shipped via electron-builder `extraFiles`. Rationale: an established precedent already exists for in-tree Rust binaries; atomic cross-cutting commits while the REST API + Persephone client co-evolve; and zero architectural lock-in (the HTTP boundary makes repo layout pure build/release logistics). `mneme/` is kept a fully self-contained Cargo project (own README/tests, buildable in isolation) so it stays **extraction-ready** — a later `git subtree split` into its own repo is mechanical if Azure deployment or standalone open-sourcing ever demands it. **Shipping:** bundle `mneme.exe` + DLLs in the installer; download-on-first-enable remains an option if installer size becomes a concern. Azure is not blocked — a container build can use `mneme/` as its Docker context.
- [x] **Frontmatter schema — RESOLVED (2026-06-13):** four optional fields — `title`, `tags`, `created`, `verified` — **none required** for v1 (local; the Azure/multi-tenant variant may require some later). All resolved at **read time**: `title` → first H1, else filename; `created` → file birthtime, else mtime; `tags` → `[]`; `verified` = the "valid / verified as of" freshness date. **Reindex stays read-only** — fallbacks are computed, never written back (backfill deferred — see Notes). Open schema (unknown keys preserved on rewrite, for Obsidian/Jekyll interop). `area` was dropped (use a tag and/or a separate wiki root). Full block in the Notes decision below.
- [x] **Who watches files — RESOLVED (2026-06-13):** Mneme runs its **own always-on** recursive watcher over every root. It's essential because the files are the source of truth on local disk and may be changed outside Mneme — the user editing a `.md` in another app, a **local CLI agent/tool editing files directly**, `git pull`, or sync. Every such change is detected and reindexed (content-hash dedup avoids redundant work and `wiki_write` echoes). Self-contained — Mneme does not rely on Persephone to notify it; `wiki_reindex` remains for a forced/full rebuild. Shortly after **startup**, a **deferred background reconcile** (content-hash compare across all roots; ~5 s, non-blocking) catches any edits made **while Mneme was closed** — the offline counterpart to the watcher — so the index self-heals after downtime without delaying startup.
- [x] **Index location — RESOLVED (2026-06-13):** a **`.mneme/` folder inside each wiki root** (one per root, per D12), holding **versioned index files** (`<modelId>/index-v<schemaVer>.db` — see the versioned-index decision below). It travels with the folder — copy/sync/clone the wiki and its index comes along (or is rebuilt on first start). Mneme writes a `.mneme/.gitignore` (`*`) so the derived index self-excludes from version control. The embedding **model stays in the global mneme cache** (not per-root — no duplication).
- [x] **Editing flow — RESOLVED (2026-06-13):** Persephone reads **and writes** through a **`MnemeProvider`** (content-pipeline provider, like `FileProvider`) over **MCP** (`wiki_read`/`resources/read`; `wiki_write`/`wiki_delete`) — editing is MCP-based **from v1**, one uniform path identical for local (loopback HTTP) and Azure (HTTP), no separate write phase. Files on disk stay the **source of truth**: `wiki_write` makes *Mneme* write the file and index it synchronously. The **watcher stays essential** — it catches every direct-disk change (the user or a **local agent editing files directly**, other apps, `git pull`, sync) and reindexes; only Persephone's own `wiki_write` saves bypass it. Content-hash dedup prevents double-indexing. (The category tree is rendered by a sibling **`MnemeTreeProvider`**, like `FileTreeProvider`, from `wiki_tree`.)
- [x] **Multiple-roots addressing — RESOLVED (2026-06-13, revised): root is part of the path, not a separate parameter.** Every document address is `{root}/{path-within-root}` — identical to the resource/link URI `mneme://{root}/{path}` — so every link is globally unique and self-contained, never colliding across roots (`root` = registered root **name**, uniqueness enforced by `wiki_add_root`). Path tools (`wiki_read`/`write`/`delete`) take that full path; scope-able tools (`wiki_search`/`wiki_tree`/`wiki_timeline`/`wiki_tags`/`wiki_reindex`) take an **optional `{root}/…` path prefix** (`subtree` / `path`) to scope to a root or sub-category, and span **all roots** when omitted (search/timeline merge). Management tools (`wiki_remove_root` / `wiki_index_delete`) identify a root by **name** (a root identifier, not a document address). **Supersedes** the earlier "separate optional `root` parameter" decision from the same day — the path-embedded form yields unique links and one consistent addressing scheme. Roots are registered/removed via `wiki_add_root`/`wiki_remove_root`/`wiki_list_roots`; Persephone's root-selection UI is a separate UI-side detail.
- [x] **Auth for local mode — RESOLVED (2026-06-13): no auth for local.** Mneme binds on **loopback `127.0.0.1` only** (Streamable HTTP transport), relying on loopback-only isolation — no authentication needed for local use. Bearer/OAuth applies **only** to the networked/Azure HTTP endpoint — the single security gate. (Justification revised 2026-06-13: was "stdio inherits process/OS isolation"; now "loopback-only bind on the single HTTP transport". Outcome unchanged — no local auth. US-651 reflects this.)
- [x] **Tag vocabulary — RESOLVED (2026-06-13):** free-form for v1 (no maintained list / rename). `wiki_tags { subtree? }` returns distinct tags + counts as the autocomplete source. A curated vocabulary / rename support can be added later without a schema change.
- [x] **Model download source — RESOLVED (2026-06-13): our own hosted location.** Mneme downloads the vetted, **compatible** ONNX model + tokenizer from a location **we control** — **GitHub Release assets** (stored separately from git history; **not committed to the repo, not part of a clone**), ideally on a **dedicated model release/tag** (e.g. `models-v1`) so the ~300 MB model isn't re-uploaded on every app build and keeps a stable URL — pinned and **sha256-verified** via a `models.json` manifest (`name, version, url, sha256, dims, precision`); resumable, with an offline/local-path override. HuggingFace is only the *upstream we convert/quantize from*, **not** the runtime URL. **Out of scope for this epic:** searching/downloading arbitrary other compatible models — a future enhancement; v1 ships only the model(s) we host.
- [x] **Conflict handling — RESOLVED (2026-06-13): live refresh via MCP resource subscriptions; last-write-wins, no locking.** Mneme advertises the `resources.subscribe` capability; `MnemeProvider` calls `resources/subscribe { mneme://{root}/{path} }` when a document opens. When that document changes — an **AI agent's `wiki_write`**, or any **direct-disk edit caught by Mneme's always-on watcher** — Mneme emits `notifications/resources/updated { uri }`; `MnemeProvider.watch()` forwards it to Persephone's existing reload path (`ContentPipe.watch` → `TextFileIOModel.onFileChanged`), which **silently reloads a clean editor** and **preserves unsaved local edits** — identical UX to `FileProvider`. Tree add/remove/rename rides `notifications/resources/list_changed` → `MnemeTreeProvider` refresh. No custom protocol — this is MCP's standard subscription primitive. **Small client addition:** `McpConnectionManager` gains `subscribeResource`/`unsubscribeResource` passthroughs + `setNotificationHandler` for the two notifications (the SDK `Client` already exposes them; ~3 wiring points).

## Linked Tasks

| ID | Title | Status |
|----|-------|--------|
| [US-651](../tasks/US-651-mneme-architecture/README.md) | Mneme — App architecture (process model, components, diagrams, tech choices, integration boundary) | ✅ Design complete |
| [US-652](../tasks/US-652-mneme-scaffold/README.md) | P1 · Project scaffold + config + Document Store | ✅ Done |
| [US-653](../tasks/US-653-mneme-index-schema/README.md) | P1 · Frontmatter + chunker + SQLite schema (FTS5 + sqlite-vec) | Implemented (unreviewed) |
| [US-654](../tasks/US-654-mneme-indexer-watcher/README.md) | P1 · Indexer + watcher + reconcile | Implemented (unreviewed) |
| [US-655](../tasks/US-655-mneme-mcp-server/README.md) | P1 · MCP server (Streamable HTTP, loopback, text-search mode) + agent guide | Implemented (unreviewed) |
| [US-656](../tasks/US-656-mneme-model-provisioner/README.md) | P2 · Model Provisioner (download + sha256 + cache) | Implemented (unreviewed) |
| [US-657](../tasks/US-657-mneme-embedding-engine/README.md) | P2 · Embedding Engine (`ort`, DirectML→CPU) | Implemented (unreviewed) |
| [US-658](../tasks/US-658-mneme-hybrid-search/README.md) | P2 · Hybrid search (sqlite-vec KNN + RRF) | Implemented (unreviewed) |
| [US-659](../tasks/US-659-mneme-concurrency/README.md) | P2 · Concurrency & responsiveness (worker, WAL, reindex job) | Implemented (unreviewed) |
| [US-666](../tasks/US-666-mneme-grep-filters-status-resource/README.md) | P1/2 gap · `wiki_grep` tags/dateRange/-n + `mneme://status` resource (+ FTS heading/title indexing, server identity, tool-description examples) | ✅ Done |
| US-660 | P3 · Persephone settings + sidecar auto-launch | Planned |
| US-661 | P4 · `McpConnectionManager` subscription support | Planned |
| US-662 | P4 · `MnemeProvider` (read/write/edit + live-refresh) | Planned |
| US-663 | P4 · `MnemeTreeProvider` + Explorer-like sidebar panel | Planned |
| US-664 | P5 · Mneme config & monitoring editor | Planned |
| US-665 | P6 · Installer + first release | Planned |

## Notes

### 2026-06-13 — REVISION (post-implementation review): embedding has no instruction prefix
The original D5 / research line "use query/passage instruction prefixes from day one" was written when the model choice was still generic and the research surveyed prefix-using families (E5, Qwen3). The chosen model — **gte-multilingual-base** — is a **symmetric GTE encoder** (sentence embedding = CLS token, L2-normalized) that takes **no** `query:`/`passage:` prefix; prepending one would *degrade* relevance. The implementation (`embed/mod.rs`) therefore sets both `QUERY_PREFIX` and `PASSAGE_PREFIX` to `""` and keeps the `EmbedKind::Query`/`Passage` split + the two empty constants purely as the **upgrade seam** for a future asymmetric model (e.g. Qwen3). This is the correct behaviour for the chosen model — D5 amended accordingly; the code is **not** a defect.

### 2026-06-13 — design-review pass: tool contracts, gap resolutions, known risks
An independent fresh-context review of this epic + US-651 produced these resolutions (all now reflected in US-651):
- **Tool result shapes defined.** `wiki_search` → `{ uri, title, tags, snippet, score }`, one result per document (best chunk wins the snippet), `topK` default 10, `mode` default `hybrid`. `wiki_tree` → flat `{ uri, name, isDir, depth }` (depth-first). `wiki_timeline` → `{ uri, title, date, tags }` newest-first, where `date` is parsed from the `YYYY-MM-DD` filename and entries are files carrying the `log` tag. `wiki_grep` mirrors Grep (`files_with_matches` / `content` with line + context / `count`).
- **`wiki_grep` backend = a streaming scan over indexed files** (the Grep analogy; regex-capable) — **never** FTS5 (FTS5 backs `wiki_search` text-mode only). `wiki_glob`/`wiki_grep` operate over **indexed files only** (include-allowlist); binary attachments are reached via `resources/read`, not glob/grep.
- **`wiki_add_root` invariants:** `folder` must already exist; `name` is unique (normalized); overlapping roots (one a path-prefix of another) are rejected at registration.
- **Versioned-index GC policy:** keep **2 DBs per root** (active + one prior) by default; manual removal via `wiki_index_delete` + the monitoring UI.
- **Config:** app-data `mneme.toml` (roots, model, transport, token, gpu, per-root include/ignore); as a Persephone sidecar, the config path is passed to `mneme.exe` via a CLI flag.
- **`wiki_model_update` v1:** re-download / checksum-verify the currently configured model (`model?` reserved; parameterized switching deferred).
- **Reindex progress payload:** `progressToken = "reindex:{root}"`, `total` = file count, `progress` = files processed, final notification carries status (`complete` / `error`).
- **Known implementation risks recorded in US-651** (verify at build time — not blockers): sqlite-vec filtered KNN uses a **pre-filter candidate-id** strategy (filtered-KNN isn't free); interactive-embed latency floor = one in-flight bulk batch (no mid-batch preemption); `rmcp` Streamable HTTP maturity to be verified (`axum` + manual JSON-RPC fallback); startup reconcile uses an **mtime+size fast-path** before hashing.

### 2026-06-13 — local dev model downloaded (for testing)
The int8 ONNX of gte-multilingual-base + tokenizer are downloaded to `temp/mneme-model/` (gitignored) so embedding/tokenization can be exercised before any service code exists. Source: HF **`onnx-community/gte-multilingual-base`** (`onnx/model_int8.onnx` 340 MB, sha256 `ab2bd164ebd8ca9003dc49a981b611e849b5d326f504c8873ba76e07fa6c0082`; `tokenizer.json` 17 MB; `config.json` + tokenizer configs). Facts: **embed dim 768**, max context **8192**, vocab 250k, `model_type: new` (GTE NewModel). Note: the base `Alibaba-NLP/gte-multilingual-base` repo ships **only safetensors** — ONNX comes from the onnx-community export; relevant to the "model download source" decision (we host our own vetted copy, converting/re-quantizing from this upstream). fp16 (628 MB) is available from the same repo if int8 underperforms on DirectML.

### 2026-06-13 — DECISION: tool surface mirrors agent file tools + a WebSearch-like semantic search
The MCP tools are shaped after the tools an agent already uses, so the wiki feels native — **file-like** `wiki_read`/`wiki_write`/`wiki_edit`/`wiki_glob`/`wiki_grep`/`wiki_delete` (≈ Read/Write/Edit/Glob/Grep), plus **`wiki_search`** modeled on **WebSearch** (query → ranked results with title + `mneme://` link + snippet) for the semantic/hybrid layer raw files don't provide. `wiki_grep` (literal/regex) and `wiki_search` (semantic) stay **separate** — different result shapes, mirroring how an agent picks Grep vs a conceptual search. Each extends with optional wiki filters (`tags`, `dateRange`, `subtree`, `ext`).
- **`wiki_write` frontmatter semantics RESOLVED:** `content` is the **whole file** (frontmatter is YAML text at the top, exactly like a real file) — the earlier separate `frontmatter?` param is **dropped**. `wiki_edit` (string replace) covers surgical changes without a full rewrite.
- Views (`wiki_tree`/`wiki_timeline`/`wiki_tags`) and the management/control-plane tools are unchanged.

### 2026-06-13 — DECISION (revised): root embedded in path, not a separate tool parameter
Reverses the earlier same-day "separate optional `root` parameter" decision. Every document address is now `{root}/{path}`, identical to the resource/link URI `mneme://{root}/{path}` (`root` = registered root **name**). Rationale: a `mneme://` link must be **globally unique and self-contained** — embedding the root in the path guarantees no cross-root collision and gives one consistent addressing scheme. Path tools (`wiki_read`/`write`/`delete`) take the full path; scope-able tools (`wiki_search`/`wiki_tree`/`wiki_timeline`/`wiki_tags`/`wiki_reindex`) take an optional `{root}/…` prefix (`subtree`/`path`) and span all roots when omitted. `wiki_remove_root`/`wiki_index_delete` still name a root by its identifier (name). `wiki_add_root` takes `{ folder, name? }` (folder = OS path; name = the root id used in URIs).

### 2026-06-13 — DECISION: frontmatter schema (`title`, `tags`, `created`, `verified`); `area` dropped
Four optional fields, **none required** for v1 (local; the Azure/multi-tenant variant may require some later). Open schema — unknown keys preserved verbatim on rewrite (Obsidian/Jekyll interop).

```yaml
---
title:    My Document        # optional → read-time fallback: first H1, else filename
tags:     [work, postgres]   # optional → default []
created:  2026-01-15         # optional → read-time fallback: file birthtime, else mtime
verified: 2026-06-13         # optional → "valid / verified as of" freshness / decay date
---
```

- **Effective values are materialized into the SQLite index** (`documents` table) at index time: the frontmatter value if present, else the computed fallback (filename / birthtime). All search & filtering (tags, `created`/`verified` date ranges, title) then runs against the index — files are not re-read for filtering.
- **`area` removed** — a tag (e.g. `work`) plus the multiple-root capability (D12) cover the same need; daily logs (D13) use a `log` tag instead of `area:`. Cascaded through req 1/4/6, D13, `wiki_search`/`wiki_timeline`.
- **`verified`** chosen over `validAsOf` / `asOf` / `reviewed` — short, pairs with `created`, documented as a date.
- **`wiki_tags { subtree? }`** added (distinct tags + counts) = the free-form tag vocabulary + autocomplete source.

### 2026-06-13 — DECISION: reindex stays read-only (frontmatter backfill deferred)
Indexing **never writes to source files**. Missing `title`/`created` are filled from filename / file-create-time **only in the index**, not in the `.md`. Chosen for simplicity — the indexer has no write path, no echo-suppression, and never dirties an in-repo root. **Accepted tradeoff:** the index-stored `created` is a fallback, not pinned in the file, so it could change after a birthtime reset on a content-changing reindex; fine for v1 (users who care set `created:` explicitly). **Deferred enhancement (build if needed):** backfill `created` into the file once to freeze it (echo-suppressed write, per-root opt-in). Supersedes the earlier D19 backfill proposal from the same discussion.

### 2026-06-13 — DECISION: model downloaded from our own hosted location
The embedding model + tokenizer are downloaded from a location **we control** — **GitHub Release assets** (separate from git history, **never committed to the repo / not in a clone**), ideally a **dedicated model release/tag** so the big binary isn't re-uploaded per app build — not pulled live from HuggingFace. (Alternatives recorded: our own HuggingFace model repo; Azure Blob for the future Azure variant.) We host the exact vetted, **compatible** quantization (int8/fp16 per D5); a `models.json` manifest pins `{name, version, url, sha256, dims, precision}` and the provisioner verifies sha256, supports resume, and accepts an offline/local-path override. HuggingFace is only the upstream we convert/quantize from. **Out of scope for this epic:** searching/downloading arbitrary other compatible models (a future enhancement) — v1 ships only the model(s) we host.

### 2026-06-13 — DECISION: non-markdown search via `ext` (with metadata limitation)
- Non-`.md` extensions can be configured for indexing (D18 allowlist) and are **plain-text search targets** (size-based chunking, no frontmatter). `wiki_search` gains an optional **`ext`**: omitted → `.md` only; else an array of extensions or `".*"` for all indexed types. **Only `.md` files have frontmatter** → only they carry `tags`/`created`/`verified`; those filters don't apply to non-md (documented limitation). Path/subtree filters still apply to all. The category tree stays markdown-oriented; code files surface through search.

### 2026-06-13 — DECISION: what gets indexed — include allowlist + ignore rules (D18)
- Two complementary, per-root configurable filters via the `ignore` crate: an **include allowlist** of file globs (default `*.md`) picks document types, and **ignore rules** (built-in defaults `.mneme`/`.git`/`node_modules`/build dirs + the root's `.gitignore`/`.ignore` + a `.mneme/config` list) prune locations — a file is indexed iff it matches include AND not ignore. Both apply to the reconcile walk and the watcher, so a root can live inside a project folder (e.g. the Persephone repo) without slurping vendored/`node_modules` markdown or walking huge trees. Default scope stays **markdown**; indexing code (`.js`/`.ts`) is configurable in principle but needs frontmatter-less metadata + code-aware chunking — deferred (open question).

### 2026-06-13 — DECISION: versioned index files + monitoring UI (replaces schema migrations)
- The index path encodes its compatibility identity: `.mneme/<model+precision+version>/index-v<schemaVer>.db`. A **model change or a new index-db schema version → a fresh versioned DB → full reindex** from the source files; **old DBs are kept** for reversible switch-back (no re-embedding). No in-place migration code (versioned-rebuild is the default; a same-model/new-schema migration can be added later if re-embedding ever hurts). Each DB keeps a `meta` row (model, precision, schema version). **Stale DBs** are pruned by a GC policy and via a planned **Persephone monitoring UI** that shows live reindex progress (MCP progress notifications) and lets the user delete old index DBs. Supporting tools: `wiki_status` reports the index inventory + progress; `wiki_index_delete` removes a stale DB.

### 2026-06-13 — DECISION: concurrency & responsiveness model (D17)
- Mneme stays responsive during a large reindex. Embedding runs on a **dedicated worker thread** off the tokio runtime, fed by a **priority queue** (interactive query/edit embeds preempt bulk reindex batches); SQLite runs in **WAL** with a single writer task + a read-only connection pool (reads never blocked by reindex writes); reindex is a **cancellable background job** (JobManager) emitting MCP progress notifications, with bounded-queue backpressure and single-flight per root. **Per-root `.mneme/index.db` files** make cross-root search/edit fully contention-free. Full detail in US-651's "Concurrency & responsiveness model" section.

### 2026-06-13 — DECISION: editing & tree via MnemeProvider / MnemeTreeProvider over MCP
- Persephone integrates Mneme through content-pipeline providers, all over **MCP**: **`MnemeProvider`** (like `FileProvider`) **reads and writes** document + attachment content (`wiki_read`/`resources/read`, `wiki_write`/`wiki_delete`) — existing editors open/save through it; **`MnemeTreeProvider`** (like `FileTreeProvider`) renders the category/document tree from `wiki_tree` using the Explorer-style tree component. Editing is MCP-based **from v1** (one path, local loopback HTTP = Azure HTTP), so there is **no** separate "MCP-write phase". Files on disk remain the source of truth (Mneme writes them, indexes synchronously); the **always-on watcher stays essential** for every direct-disk change made outside Mneme — the user or a **local agent editing files directly**, other apps, git, sync. Supersedes the earlier "v1 direct disk write → Phase 2 MCP write" framing from the same day.

### 2026-06-13 — DECISION: agents get full access (scoping = optional capability)
- The AI agent gets **full access** to all MCP tools, including control-plane/admin ops (initialize/add/remove wiki roots, run + track reindex, update/download the embedding model) — consistent with the goal of an assistant that helps the user do everything and maintains the memory. **No hidden-method requirement.** The per-client scoping mechanism explored earlier (control-plane vs data-plane; stdio/admin-scope vs agent-scope; server-side tool-list filtering + call denial) is **kept as an available capability** for possible future needs (remote/multi-tenant Azure, read-only guests, restricting a specific agent), not implemented now. Near-term: one full tool surface on both transports. Recorded as D16; draft MCP surface extended with management tools.

### 2026-06-13 — DECISION: single MCP interface (no REST)
- Mneme exposes **one interface — an MCP server** — consumed identically by Persephone and AI agents; the contract is defined once. Replaces the earlier "REST + later MCP proxy" plan (D9/D10 revised). Drivers: define the protocol once; a single port + single security gate for Azure; and Persephone is *already* a full MCP client (`McpConnectionManager` wraps the official SDK with stdio + Streamable HTTP, and models `image`/`resource` content), with MCP Inspector as the test harness.
- **Tools = actions** (`wiki_search`/`read`/`write`/`delete`/`tree`/`timeline`/`reindex`); **resources = content** (docs + binary attachments via `mneme://{root}/{path}`, `resources/read`). Images flow through a new **`MnemeProvider`** in Persephone's content pipeline (next to `FileProvider`/`HttpProvider`).
- **Transport:** **Streamable HTTP** on loopback `127.0.0.1` locally (no auth — loopback isolation), Streamable HTTP with bearer/OAuth for networked/Azure. The named-pipe-vs-HTTP question is moot (single HTTP transport; see the transport-revision Note below). Accepted tradeoff: binary attachments are base64 inside JSON-RPC (~33% inflation) — fine for Mneme's attachment scope (diagrams, PDFs, office files); **no escape-hatch — large media/video is out of scope** (use a dedicated service). US-651 architecture doc updated to match.

### 2026-06-13 — DECISION (revised): single transport = Streamable HTTP (stdio dropped)
- **Supersedes the stdio half of D9** and the "Transport" bullet in the "single MCP interface" Note above.
- **Decision:** Mneme exposes **one MCP transport: Streamable HTTP**. The stdio transport is **dropped entirely**.
- **Rationale (1-to-many vs 1-to-1):** HTTP is inherently 1-to-many — one running Mneme instance serves Persephone *and* external AI agents (e.g. Claude Code) concurrently over HTTP. With stdio, each client would spawn its own `mneme.exe` process, giving multiple file watchers and SQLite writers on the same roots — a conflict. Single Streamable HTTP is therefore the correct model, not just a simplification.
- **Local mode:** Mneme binds **`127.0.0.1` (loopback) only, with NO auth**. Loopback isolation is the security boundary. This preserves the "no auth for local mode" stance from the auth open-question RESOLVED above — the justification changes from "stdio process isolation / zero ports" to "loopback-only bind on the single HTTP transport." The parent process (Persephone) assigns the port via a `--config` / CLI flag; Mneme prints a startup readiness line (e.g. `listening on 127.0.0.1:<port>`) to **stdout** so the spawner knows it is ready before connecting. **stdout is no longer an MCP channel** — it carries only this readiness line; logs go to stderr.
- **Networked/Azure mode:** the same Streamable HTTP endpoint, secured with bearer/OAuth as the single security gate. Unchanged from the prior design.
- **Persephone main** still spawns `mneme.exe` as a managed child process (Tor-style lifecycle) but **connects over loopback HTTP** instead of stdio.
- This decision also moots the named-pipe-vs-HTTP question (no longer a separate question — there is only HTTP).

### 2026-06-13 — DECISION: repo location = in-tree `mneme/`
- Mneme lives **in the Persephone repo** as a self-contained `mneme/` folder, following the `launcher/` + `snip-tool/` precedent: built in CI via `cargo build --release` (per `publish.yml`), shipped through electron-builder `extraFiles`. Chosen for the existing build pattern, atomic cross-cutting commits, and zero lock-in (HTTP boundary). Kept extraction-ready (independent Cargo project) for a possible future split if Azure/standalone needs it. Binary + DLLs bundled in the installer; the model still downloads on first enable.

### 2026-06-13 — DECISION: service named "Mneme" (reverted from Mnema)
- The service is named **Mneme** — the Muse of memory (Greek *mnḗmē* = "memory"). This reverts the earlier "Mnema" pick: Mneme is the mythologically/semantically correct name ("Mnema" means memorial/monument). The crates.io collision that originally steered us away from Mneme is moot — Mneme ships as a standalone binary, never published as a crate, so the package name is local-only. Trademark risk is negligible: it's an internal service component under the Persephone brand, not a marketed commercial product in "Mneme HQ"'s field. Product name / `mneme` binary / `mneme` CLI. Epic title + overview + task US-651 (folder + diagram) renamed accordingly. Repo location remains open.

### 2026-06-13 — GPU acceleration added (D15)
- New requirement from review: use the GPU when available to speed up bulk indexing. Decided direction: ONNX Runtime **DirectML** execution provider (any DX12 GPU, no CUDA install — keeps minimal-install) with automatic CPU fallback and a force-CPU setting. **Resolved 2026-06-13:** use **one model artifact for both EPs** — GPU/CPU is a runtime toggle with **no reindex on toggle**; precision is int8 if it runs acceptably on DirectML, else fp16 (verified at implementation). `meta` records model + precision; only a model/precision change reindexes — never a GPU/CPU switch.

### 2026-06-13 — DECISION: build everything ourselves (Option A)
- The user chose to build the full stack in-house (own index per D4/D5) rather than reuse Meilisearch/Typesense as a sidecar engine — full control and the best possible Persephone integration outweigh the saved effort. D4 (SQLite + sqlite-vec + FTS5) and D5 (gte-multilingual-base via `ort`) are hereby firmed up from "provisional" to "decided direction"; Meilisearch remains a documented fallback only.

### 2026-06-13 — second research pass: adopt-as-is dead; engine-reuse alternative added
- Deep-dived QMD, memsearch, SilverBullet, Meilisearch, Typesense + a fresh GitHub sweep (engraph, kb-mcp, codesearch, markdown-vdb, ostk-recall). No project can be adopted as-is (each misses REST, Windows, filters, or maturity). New top open question recorded: build our own index (D4/D5) vs reuse **Meilisearch** as a managed sidecar engine behind our thin service. QMD kept as a design reference.

### 2026-06-13 — epic created (draft)
- Created from a design discussion + a three-way web-research pass (embedding models, vector stores, reusable projects). Status set to **Draft**: the user will review, the discussion continues, and the design may change before implementation planning starts.
- Key provisional positions: build-own Rust single-exe service (no suitable adopt/fork candidate found); markdown + YAML frontmatter, files-as-truth; SQLite + sqlite-vec + FTS5 hybrid; gte-multilingual-base ONNX local embeddings; REST/JSON protocol; Persephone-side MCP proxy first; sidecar distribution with model downloaded on first enable. *(REST/JSON and MCP-proxy-first were superseded by D9/D10 — see the MCP-only decision above; recorded here as history.)*
