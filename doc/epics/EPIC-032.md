# EPIC-032: Mneme — Wiki / Vector Memory service

## Status

**Status:** Draft — design under discussion, NOT final. Everything below is provisional and may change before implementation planning starts. No tasks are carved yet.
**Created:** 2026-06-13

## Overview

**Mneme** (the Muse of memory; Greek *mnḗmē*, "memory") is a personal knowledge base ("Wiki") built on a folder tree of markdown documents, indexed for both full-text and semantic (vector) search, served by a **separate standalone service application** that exposes a **single MCP interface**. Persephone integrates with it as an optional feature (off by default, Git-integration style): a tree-view editor for browsing documents, search UI, and the same MCP tools/resources that AI agents use to read, search, and maintain the knowledge base. The same service can later be deployed to Azure with the MCP contract unchanged.

The motivating use case: organize personal and work information in one searchable place, and let an AI agent find the proper information and help maintain the memory (add new information when needed or asked).

## Core requirements (from discussion)

1. **Documents** — markdown only, organized in a folder tree (folders = categories). Each document (not category) can have tags. Binary files may live alongside, referenced from markdown, but are not indexed. Attachments are **documents** — diagrams (PNG/SVG), PDFs, office files; **large media (video) is out of scope** (use a dedicated service and reference it). A root may also sit inside a project folder; **both** an **include allowlist** (default `*.md`) **and** **ignore rules** (gitignore-style; defaults `.git`/`node_modules`/`.mneme`/build dirs + the root's `.gitignore`) decide which files are indexed — a file counts iff it matches include and not ignore (see D18).
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
| D4 | Index storage | **SQLite + sqlite-vec + FTS5**; one active `.db` per `(model+precision, schema version)` at `.mneme/<modelId>/index-v<schemaVer>.db` | Zero ops, maintained (sqlite-vec v0.1.9, 2026-03). Hybrid ranking = ~30 lines of app-level RRF. **Versioned path = no migration code**: a model/schema change rebuilds a fresh file; old files kept for reversible switch-back (GC'd by policy / the monitoring UI). Alternative LanceDB noted but heavier; adds nothing at this scale. |
| D5 | Embedding model | **gte-multilingual-base** ONNX via `ort` — **one artifact for both GPU and CPU** (int8 ~324 MB if it runs on DirectML, else fp16 ~600 MB); the execution provider is a runtime toggle | Multilingual (EN + UK), Apache 2.0. Pluggable embedder; the index `meta` records model **+ precision** — only a model/precision change triggers a rebuild, **not** a GPU↔CPU toggle. Upgrade path: Qwen3-Embedding-0.6B (~620 MB, current MMTEB leader). Use query/passage instruction prefixes from day one; Matryoshka dim-truncation optional. |
| D6 | Embedding locality | Local inference only by default | Privacy — work data must not go to third-party APIs. Azure OpenAI embeddings become an alternative embedder when deployed. |
| D7 | Search | Hybrid: FTS5 (BM25) + vector top-K, merged with Reciprocal Rank Fusion; metadata filters as SQL predicates | FTS catches exact identifiers/names vector search misses; vector catches paraphrases. Subtree filter = path-prefix match. |
| D8 | Chunking | By markdown headings, with a size cap | A hit points at a section — better display and better embedding quality than whole-document vectors. |
| D9 | Protocol | **Single MCP interface** (no REST) — tools = actions, resources = content; **stdio** locally, **Streamable HTTP** (bearer/OAuth) for networked/Azure | One contract defined once for both Persephone and agents; one port + one security gate to harden; stdio means zero local ports/network exposure. Revised 2026-06-13 (was REST/JSON). |
| D10 | MCP | **Native MCP server on Mneme from the start** — the sole interface. Persephone consumes it via its existing MCP client (`McpConnectionManager`) plus content-pipeline providers: **`MnemeProvider`** (read/write docs + attachments) and **`MnemeTreeProvider`** (category tree), mirroring `FileProvider`/`FileTreeProvider`. Agents hit the same server (directly or surfaced through Persephone's MCP server) | No REST adapter, no proxy, no second contract. Persephone is already an MCP client (Inspector). Revised 2026-06-13 (was: proxy first, native later). |
| D11 | Distribution | With Persephone: Settings checkbox triggers download (or ships) of service exe + model into app data; Persephone manages process lifecycle (sidecar, like Tor service). Standalone: simple installer / zip later | Zero-install default path; model (~324 MB) downloaded on first enable, not bundled — FTS works before the model arrives. |
| D12 | Multiple roots | Support multiple independent wiki roots (each its own folder + index) from the start | "Work" and "personal" can be physically separate stores, not just an `area` tag — important for work-data handling. |
| D13 | Daily logs | `log/YYYY/YYYY-MM-DD.md` with `area:` frontmatter; timeline = date-sorted query | Same document model; no special storage. |
| D14 | Dates | In-document `created` date is authoritative; file mtime only a fallback | File timestamps are unreliable (git checkout, sync, copy all reset mtime). |
| D15 | GPU acceleration | Use the GPU for embedding inference when available, via the **DirectML** execution provider (`ort` feature flag); automatic fallback to CPU; setting to force CPU | DirectML works with any DX12 GPU (NVIDIA/AMD/Intel) with zero extra installation — no CUDA/cuDNN dependency, preserving minimal-install. Main payoff: initial bulk indexing of thousands of files (~5–20×); incremental re-embeds are fine on CPU. Azure/Linux variant uses CPU (or CUDA EP on GPU SKUs) behind the same embedder interface. |
| D16 | Access model | **Agents get full access to all tools** — data *and* control-plane (init/add/remove roots, reindex, model update). No hidden methods. Per-client tool scoping (by transport / auth scope, server-side filter + denial) is **retained as an optional capability**, not enforced now | The goal is an assistant that can fully help the user and maintain the memory. Scoping stays available for future needs (remote/multi-tenant Azure, read-only guest, restricting a specific agent) without building it up front; near-term there is one full tool surface on both transports. |
| D17 | Concurrency & responsiveness | Embedding runs on a **dedicated worker** off the async runtime, fed by a **priority queue** (interactive query/edit embeds > bulk reindex); SQLite in **WAL** with a single writer + reader pool; reindex is a **cancellable background job** with MCP progress + backpressure; **per-root DBs** isolate cross-root work | Mneme must stay responsive during a large reindex — track progress, search any root, view/edit docs. Interactive embeds slip between small bulk batches; WAL + per-root DBs avoid read/write contention. Full detail in US-651's "Concurrency & responsiveness model". |
| D18 | What gets indexed (include + ignore) | An **include allowlist** of file globs (default `*.md`) picks document types; **ignore rules** prune locations (gitignore-style: built-in defaults `.mneme/`/`.git/`/`node_modules/`/build dirs + the root's `.gitignore`/`.ignore` + a `.mneme/config` list). Indexed iff **matches include AND not ignore**; both configurable per root, applied to the reconcile walk and the watcher | Allowlist = default-deny: cleaner/safer than enumerating everything to exclude, esp. inside a project folder. Path-ignore still needed (e.g. `node_modules/**/*.md`). Uses the `ignore` crate. **Default scope = markdown** (frontmatter + heading-chunking are markdown-specific). Non-md types (`.js`/`.ts`, …) **can be configured** for indexing — they're **plain-text search targets** (size-based chunking, **no frontmatter**, so no tags/date/area); `wiki_search` opts into them via an **`ext`** param (default `.md`). Only `.md` carries frontmatter metadata. |

## Draft MCP surface (sketch)

Tools (actions):

```
wiki_search   { query, mode: text|vector|hybrid, subtree, tags, excludeTags, area, dateRange, topK, root?, ext? }   # ext omitted = .md only; array or ".*" for other indexed types
wiki_tree     { root? }                         # category/document tree
wiki_read     { path, root? }                   # document + parsed frontmatter
wiki_write    { path, content, frontmatter?, root? }   # create/update
wiki_delete   { path, root? }
wiki_timeline { area?, from?, to?, root? }      # daily-log feed
```

`root?` is optional — defaults to the sole registered root; required for path-addressed tools when multiple roots exist; `wiki_search`/`wiki_timeline` default to **all roots** (merged) when omitted.

Management / control-plane tools (also available to agents per D16):

```
wiki_add_root     { path, name? }               # register a new wiki root
wiki_remove_root  { root }
wiki_list_roots   {}
wiki_reindex      { root? }                      # emits MCP progress notifications
wiki_model_update { model? }                     # download/switch embedding model + progress
wiki_status       {}                             # roots, index inventory (versioned DBs + sizes), model, reindex progress
wiki_index_delete { root, modelId, schemaVer }   # delete a stale/inactive versioned index DB
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

## Rough phase outline (NOT carved into tasks yet)

1. **Service core** — repo/project setup, file scanning, frontmatter parsing, SQLite + FTS5, MCP server (stdio), text search only. Already a usable wiki; proves the architecture.
2. **Vectors** — ONNX embedder, heading-based chunking, hybrid search, incremental reindex (file watcher).
3. **Persephone integration** — Settings toggle + service URL, sidecar lifecycle (download/launch/health), Wiki tree editor (Explorer-like), documents open via existing markdown/text editors.
4. **Search UI + MarkdownView frontmatter bar** — search panel with filter chips; metadata bar replacing raw frontmatter in rendered view.
5. **MCP tools** — `wiki_*` tool set + agent guide resource (when/how to file new information, like the existing `mcp-res-*.md` guides).
6. **Daily logs + timeline view.**
7. **Later / optional** — standalone installer, native MCP on the service, Azure deployment + auth, Azure OpenAI embedder.

## Open questions (to resolve during review/discussion)

- [x] **Index engine: build vs reuse — RESOLVED (2026-06-13): Option A, build everything ourselves** (SQLite + sqlite-vec + FTS5 + `ort` embeddings, per D4/D5). Rationale: full control over every layer and the freedom to shape the best possible Persephone integration; single process, single rebuildable `.db` file. The rejected Option B (thin service + **Meilisearch** sidecar engine — single official exe, built-in hybrid search with in-process embeddings, mature REST; Typesense as runner-up) stays recorded as a fallback: because our REST API is the stable contract, the engine could still be swapped later if owning embedding inference / relevance tuning proves too costly.
- [x] **Service name — RESOLVED (2026-06-13): Mneme** (the Muse of memory; Greek *mnḗmē* = "memory"). Used for the product name, repo/binary name (`mneme`), and CLI command (`mneme serve`, `mneme reindex`). The earlier pick *Mnema* was reverted: *Mneme* is the mythologically/semantically correct name (the Muse of memory; "Mnema" leans "memorial/monument/tomb"). The collisions that originally steered us off *Mneme* don't apply: the **crates.io** clash is irrelevant because Mneme is **not published as a crate** — it's an internal, standalone binary shipped with Persephone, so the `Cargo.toml` package name is purely local. **Trademark:** negligible practical risk — Mneme is an internal service component (the public brand is Persephone), not a marketed commercial product in "Mneme HQ"'s field; trademark concern would only arise from marketing a commercial product branded "Mneme" in that space, which this is not. (Common/mythological words *can* be trademarks within a market class — that's not the reason it's safe; the non-commercial, sub-component, Persephone-branded nature is.)
- [x] **Repo location — RESOLVED (2026-06-13): in-tree folder `mneme/` in the Persephone repo** (alongside `launcher/` and `snip-tool/`), built in CI (`cargo build --release`) and shipped via electron-builder `extraFiles`. Rationale: an established precedent already exists for in-tree Rust binaries; atomic cross-cutting commits while the REST API + Persephone client co-evolve; and zero architectural lock-in (the HTTP boundary makes repo layout pure build/release logistics). `mneme/` is kept a fully self-contained Cargo project (own README/tests, buildable in isolation) so it stays **extraction-ready** — a later `git subtree split` into its own repo is mechanical if Azure deployment or standalone open-sourcing ever demands it. **Shipping:** bundle `mneme.exe` + DLLs in the installer; download-on-first-enable remains an option if installer size becomes a concern. Azure is not blocked — a container build can use `mneme/` as its Docker context.
- [ ] **Frontmatter schema** — exact field set (`tags`, `created`, `area`, … what else? `title`? `updated`?) and which are required.
- [x] **Who watches files — RESOLVED (2026-06-13):** Mneme runs its **own always-on** recursive watcher over every root. It's essential because the files are the source of truth on local disk and may be changed outside Mneme — the user editing a `.md` in another app, a **local CLI agent/tool editing files directly**, `git pull`, or sync. Every such change is detected and reindexed (content-hash dedup avoids redundant work and `wiki_write` echoes). Self-contained — Mneme does not rely on Persephone to notify it; `wiki_reindex` remains for a forced/full rebuild. Shortly after **startup**, a **deferred background reconcile** (content-hash compare across all roots; ~5 s, non-blocking) catches any edits made **while Mneme was closed** — the offline counterpart to the watcher — so the index self-heals after downtime without delaying startup.
- [x] **Index location — RESOLVED (2026-06-13):** a **`.mneme/` folder inside each wiki root** (one per root, per D12), holding **versioned index files** (`<modelId>/index-v<schemaVer>.db` — see the versioned-index decision below). It travels with the folder — copy/sync/clone the wiki and its index comes along (or is rebuilt on first start). Mneme writes a `.mneme/.gitignore` (`*`) so the derived index self-excludes from version control. The embedding **model stays in the global mneme cache** (not per-root — no duplication).
- [x] **Editing flow — RESOLVED (2026-06-13):** Persephone reads **and writes** through a **`MnemeProvider`** (content-pipeline provider, like `FileProvider`) over **MCP** (`wiki_read`/`resources/read`; `wiki_write`/`wiki_delete`) — editing is MCP-based **from v1**, one uniform path identical for local (stdio) and Azure (HTTP), no separate write phase. Files on disk stay the **source of truth**: `wiki_write` makes *Mneme* write the file and index it synchronously. The **watcher stays essential** — it catches every direct-disk change (the user or a **local agent editing files directly**, other apps, `git pull`, sync) and reindexes; only Persephone's own `wiki_write` saves bypass it. Content-hash dedup prevents double-indexing. (The category tree is rendered by a sibling **`MnemeTreeProvider`**, like `FileTreeProvider`, from `wiki_tree`.)
- [x] **Multiple-roots addressing — RESOLVED (2026-06-13):** a separate, **optional `root` parameter** on tools (not a path prefix). **Defaults to the sole root** when exactly one is registered (simple setups never pass it). With multiple roots: path-addressed tools (`wiki_read`/`write`/`delete`/`tree`/`reindex`) **require** `root`; `wiki_search`/`wiki_timeline` **default to all roots** (results merged, filters still apply) and accept `root` to scope to one (keeps work/personal separate). Resources are always explicit: `mneme://{root}/{path}`. Roots are registered/removed via `wiki_add_root`/`wiki_remove_root`/`wiki_list_roots`; Persephone's root-selection UI is a separate UI-side detail.
- [ ] **Auth for local mode** — none on localhost vs same bearer-token mechanism everywhere.
- [ ] **Tag vocabulary** — free-form tags vs maintained tag list (autocomplete source, rename support).
- [ ] **Model download source** — where the exe + ONNX model are hosted (GitHub Releases of the service repo?), checksum verification.
- [ ] **Conflict handling** — concurrent edit via API while the file is open in Persephone (file watcher already covers external-change reload?).

## Linked Tasks

| ID | Title | Status |
|----|-------|--------|
| [US-651](../tasks/US-651-mneme-architecture/README.md) | Mneme — App architecture (process model, components, diagrams, tech choices, integration boundary) | 🔨 In progress (design) |

## Notes

### 2026-06-13 — DECISION: non-markdown search via `ext` (with metadata limitation)
- Non-`.md` extensions can be configured for indexing (D18 allowlist) and are **plain-text search targets** (size-based chunking, no frontmatter). `wiki_search` gains an optional **`ext`**: omitted → `.md` only; else an array of extensions or `".*"` for all indexed types. **Only `.md` files have frontmatter** → only they carry `tags`/`date`/`area`; those filters don't apply to non-md (documented limitation). Path/subtree filters still apply to all. The category tree stays markdown-oriented; code files surface through search.

### 2026-06-13 — DECISION: what gets indexed — include allowlist + ignore rules (D18)
- Two complementary, per-root configurable filters via the `ignore` crate: an **include allowlist** of file globs (default `*.md`) picks document types, and **ignore rules** (built-in defaults `.mneme`/`.git`/`node_modules`/build dirs + the root's `.gitignore`/`.ignore` + a `.mneme/config` list) prune locations — a file is indexed iff it matches include AND not ignore. Both apply to the reconcile walk and the watcher, so a root can live inside a project folder (e.g. the Persephone repo) without slurping vendored/`node_modules` markdown or walking huge trees. Default scope stays **markdown**; indexing code (`.js`/`.ts`) is configurable in principle but needs frontmatter-less metadata + code-aware chunking — deferred (open question).

### 2026-06-13 — DECISION: versioned index files + monitoring UI (replaces schema migrations)
- The index path encodes its compatibility identity: `.mneme/<model+precision+version>/index-v<schemaVer>.db`. A **model change or a new index-db schema version → a fresh versioned DB → full reindex** from the source files; **old DBs are kept** for reversible switch-back (no re-embedding). No in-place migration code (versioned-rebuild is the default; a same-model/new-schema migration can be added later if re-embedding ever hurts). Each DB keeps a `meta` row (model, precision, schema version). **Stale DBs** are pruned by a GC policy and via a planned **Persephone monitoring UI** that shows live reindex progress (MCP progress notifications) and lets the user delete old index DBs. Supporting tools: `wiki_status` reports the index inventory + progress; `wiki_index_delete` removes a stale DB.

### 2026-06-13 — DECISION: concurrency & responsiveness model (D17)
- Mneme stays responsive during a large reindex. Embedding runs on a **dedicated worker thread** off the tokio runtime, fed by a **priority queue** (interactive query/edit embeds preempt bulk reindex batches); SQLite runs in **WAL** with a single writer task + a read-only connection pool (reads never blocked by reindex writes); reindex is a **cancellable background job** (JobManager) emitting MCP progress notifications, with bounded-queue backpressure and single-flight per root. **Per-root `.mneme/index.db` files** make cross-root search/edit fully contention-free. Full detail in US-651's "Concurrency & responsiveness model" section.

### 2026-06-13 — DECISION: editing & tree via MnemeProvider / MnemeTreeProvider over MCP
- Persephone integrates Mneme through content-pipeline providers, all over **MCP**: **`MnemeProvider`** (like `FileProvider`) **reads and writes** document + attachment content (`wiki_read`/`resources/read`, `wiki_write`/`wiki_delete`) — existing editors open/save through it; **`MnemeTreeProvider`** (like `FileTreeProvider`) renders the category/document tree from `wiki_tree` using the Explorer-style tree component. Editing is MCP-based **from v1** (one path, local stdio = Azure HTTP), so there is **no** separate "MCP-write phase". Files on disk remain the source of truth (Mneme writes them, indexes synchronously); the **always-on watcher stays essential** for every direct-disk change made outside Mneme — the user or a **local agent editing files directly**, other apps, git, sync. Supersedes the earlier "v1 direct disk write → Phase 2 MCP write" framing from the same day.

### 2026-06-13 — DECISION: agents get full access (scoping = optional capability)
- The AI agent gets **full access** to all MCP tools, including control-plane/admin ops (initialize/add/remove wiki roots, run + track reindex, update/download the embedding model) — consistent with the goal of an assistant that helps the user do everything and maintains the memory. **No hidden-method requirement.** The per-client scoping mechanism explored earlier (control-plane vs data-plane; stdio/admin-scope vs agent-scope; server-side tool-list filtering + call denial) is **kept as an available capability** for possible future needs (remote/multi-tenant Azure, read-only guests, restricting a specific agent), not implemented now. Near-term: one full tool surface on both transports. Recorded as D16; draft MCP surface extended with management tools.

### 2026-06-13 — DECISION: single MCP interface (no REST)
- Mneme exposes **one interface — an MCP server** — consumed identically by Persephone and AI agents; the contract is defined once. Replaces the earlier "REST + later MCP proxy" plan (D9/D10 revised). Drivers: define the protocol once; a single port + single security gate for Azure; and Persephone is *already* a full MCP client (`McpConnectionManager` wraps the official SDK with stdio + Streamable HTTP, and models `image`/`resource` content), with MCP Inspector as the test harness.
- **Tools = actions** (`wiki_search`/`read`/`write`/`delete`/`tree`/`timeline`/`reindex`); **resources = content** (docs + binary attachments via `mneme://{root}/{path}`, `resources/read`). Images flow through a new **`MnemeProvider`** in Persephone's content pipeline (next to `FileProvider`/`HttpProvider`).
- **Transport:** stdio locally (zero ports — also resolves the earlier named-pipe-vs-HTTP question), Streamable HTTP for networked/Azure. Accepted tradeoff: binary attachments are base64 inside JSON-RPC (~33% inflation) — fine for Mneme's attachment scope (diagrams, PDFs, office files); **no escape-hatch — large media/video is out of scope** (use a dedicated service). US-651 architecture doc updated to match.

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
- Key provisional positions: build-own Rust single-exe service (no suitable adopt/fork candidate found); markdown + YAML frontmatter, files-as-truth; SQLite + sqlite-vec + FTS5 hybrid; gte-multilingual-base ONNX local embeddings; REST/JSON protocol; Persephone-side MCP proxy first; sidecar distribution with model downloaded on first enable.
