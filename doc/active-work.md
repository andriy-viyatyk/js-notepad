# Active Work Dashboard

Overview of all active and planned epics and tasks.

- Epic docs live in [`/doc/epics/`](epics/)
- Task details tracked in [`/doc/tasks/completed.md`](tasks/completed.md) after completion
- Ideas and future concepts in [`/doc/tasks/backlog.md`](tasks/backlog.md)

## Active
- [ ] [US-672: Provider icon in the text-editor footer](tasks/US-672-provider-icon-footer/README.md) *(design for review)*
- **EPIC-032** — [Mneme — Wiki / Vector Memory service](epics/EPIC-032.md) *(design locked — implementing in phases)*
  - [ ] [US-651: Mneme — App architecture](tasks/US-651-mneme-architecture/README.md) *(design complete)*
  - [x] [US-652: [Phase 1] Project scaffold + config + Document Store](tasks/US-652-mneme-scaffold/README.md)
  - [ ] [US-653: [Phase 1] Frontmatter + chunker + SQLite schema (FTS5 + sqlite-vec)](tasks/US-653-mneme-index-schema/README.md) *(implemented, unreviewed)*
  - [ ] [US-654: [Phase 1] Indexer + watcher + reconcile](tasks/US-654-mneme-indexer-watcher/README.md) *(implemented, unreviewed)*
  - [ ] [US-655: [Phase 1] MCP server (Streamable HTTP, loopback, text-search mode) + agent guide](tasks/US-655-mneme-mcp-server/README.md) *(implemented, unreviewed)*
  - [ ] [US-656: [Phase 2] Model Provisioner (download + sha256 + cache)](tasks/US-656-mneme-model-provisioner/README.md) *(implemented, unreviewed)*
  - [ ] [US-657: [Phase 2] Embedding Engine (ort, DirectML→CPU)](tasks/US-657-mneme-embedding-engine/README.md) *(implemented, unreviewed)*
  - [ ] [US-658: [Phase 2] Hybrid search (sqlite-vec KNN + RRF)](tasks/US-658-mneme-hybrid-search/README.md) *(implemented, unreviewed)*
  - [ ] [US-659: [Phase 2] Concurrency & responsiveness (worker, WAL, reindex job)](tasks/US-659-mneme-concurrency/README.md) *(implemented, unreviewed)*
  - [x] [US-666: [Phase 1/2 gap] wiki_grep tags/dateRange/-n + mneme://status resource](tasks/US-666-mneme-grep-filters-status-resource/README.md)
  - [ ] [US-660: [Phase 3] Persephone settings + sidecar auto-launch](tasks/US-660-mneme-settings-sidecar/README.md) *(implemented, unreviewed)*
  - [ ] [US-671: [Bug] MCP connection auto-reconnect (Mneme editor drops to "Disconnected" after ~5 min)](tasks/US-671-mcp-connection-auto-reconnect/README.md) *(implemented, unreviewed)*
  - [ ] [US-670: [Phase 4 prereq] Mneme resource-subscription emit (capability + subscribe/unsubscribe + watcher fan-out) — blocks US-661](tasks/US-670-mneme-resource-subscription-emit/README.md) *(implemented, unreviewed)*
  - [ ] [US-661: [Phase 4] McpConnectionManager subscription support (client wiring) — needs US-670](tasks/US-661-mcp-subscription-support/README.md) *(implemented, unreviewed)*
  - [ ] [US-662: [Phase 4] MnemeProvider (read/write/edit + live-refresh)](tasks/US-662-mneme-provider/README.md) *(implemented, unreviewed)*
  - [ ] [US-673: [Phase 4][Bug] Mneme MCP client — single shared connection (fix wiki_status timeouts / yellow indicator)](tasks/US-673-mneme-single-connection/README.md) *(implemented, unreviewed)*
  - [ ] [US-663: [Phase 4] MnemeTreeProvider + Explorer-like sidebar panel (open Mneme editor on `.mneme` folder click)](tasks/US-663-mneme-tree-provider/README.md) *(implemented, unreviewed)*
  - [ ] [US-674: [Phase 4] Mneme tree editing — create/rename/delete files & folders](tasks/US-674-mneme-tree-editing/README.md) *(implemented, unreviewed)*
  - [ ] [US-675: [Phase 4] Mneme tree — drag-and-drop file upload from the OS](tasks/US-675-mneme-tree-file-drop/README.md) *(implemented, unreviewed)*
  - [ ] [US-676: [Phase 4] Mneme root main view — search with displayed results](tasks/US-676-mneme-root-search-view/README.md) *(implemented, unreviewed)*
  - [ ] [US-678: [Phase 4] Mneme search — tag & date filters (follow-up to US-676)](tasks/US-678-mneme-search-filters/README.md) *(implemented, unreviewed)*
  - [ ] US-679: [Phase 4][Bug] Mneme `wiki_search` — sanitize FTS5 query (hyphens/operators no longer error text & hybrid modes); `mneme/src/index/mod.rs` `to_fts_match` + regression test *(implemented, unreviewed)*
  - [ ] [US-680: [Phase 4] Mneme search results — render as markdown via MarkdownBlock](tasks/US-680-mneme-search-results-markdown/README.md) *(implemented, unreviewed)*
  - [ ] US-681: [Phase 4] Mneme `wiki_search` — lower default `topK` 10→5 (conserve agent context) + document `topK` default and `subtree` sub-path scoping in the tool description; `mneme/src/mcp/{mod,params,server}.rs` *(implemented, unreviewed)*
  - [ ] [US-685: [Phase 4] Mneme — decouple wiki file set from index set (full filesystem navigability)](tasks/US-685-mneme-filesystem-navigability/README.md) *(implemented, unreviewed)*
  - [ ] [US-686: [Phase 4] Mneme — `wiki_read` returns images as vision blocks (like `Read`) + `wiki_upload`](tasks/US-686-mneme-binary-tools/README.md) *(implemented, unreviewed)*
  - [ ] [US-687: [Phase 4] Mneme — relative `mneme://` links open attachments in the Image viewer (+ `writeBinary` → `wiki_upload`)](tasks/US-687-mneme-relative-links/README.md) *(implemented, unreviewed)*
  - [ ] [US-683: [Phase 4] Mneme — rename `wiki_*` tools to bare names (`read`/`write`/…) + de-wiki wording](tasks/US-683-mneme-wiki-naming-generalization/README.md) *(implemented, unreviewed)*
  - [ ] [US-668: [Phase 5 prereq] Mneme wiki_root_config tool (live include/ignore) — blocks US-664](tasks/US-668-mneme-root-config-tool/README.md) *(implemented, unreviewed)*
  - [ ] [US-664: [Phase 5] Mneme config & monitoring editor (+ header indicator) — needs US-668](tasks/US-664-mneme-config-editor/README.md) *(implemented, unreviewed)*
  - [ ] [US-677: [Phase 5] Mneme config editor — single-page redesign + toolbar cleanup](tasks/US-677-mneme-config-redesign/README.md) *(implemented, unreviewed)*
  - [ ] [US-669: [Phase 5] Mneme async long-running ops + live progress (add-root, model download, log file)](tasks/US-669-mneme-async-add-root-indexing/README.md) *(implemented, unreviewed)*
  - [ ] [US-688: [Phase 4] Mneme tree — own drag-drop (intra-root move + cross-root / cross-window copy)](tasks/US-688-mneme-tree-cross-root-dnd/README.md) *(implemented, unreviewed)*
  - [ ] US-665: [Phase 6] Installer + first release

## Planned
- **EPIC-027** — [Script-Driven UI and Custom Editors](epics/EPIC-027.md) *(carved out of EPIC-025 Phase 6; blocked on EPIC-025 close)*
  - [ ] US-436: Script UI API — expose new component library to scripting engine
  - [ ] US-435: Storybook — script tab for building and testing UI via scripts
  - [ ] US-544: Script-registered custom editor framework — registration, lifecycle, persistence *(placeholder — task spec TBD when epic starts)*
- **EPIC-022** — [LinkEditor Embedded Scripts](epics/EPIC-022.md)
  - [ ] US-396: Data model — `LinkScriptItem` type and `scripts` field in `LinkEditorData`
  - [ ] US-397: ScriptRunner — `runWithScope()` for custom context variable injection
  - [ ] US-398: LinkEditorScriptProvider — virtual IProvider backed by LinkViewModel
  - [ ] US-399: Resolver — handle `link-editor-script://` URL scheme
  - [ ] US-400: Scripts panel UI — collapsible panel with tree view in LinkEditor
  - [ ] US-401: Add/Edit Script dialog
  - [ ] US-402: Script execution engine — event matching and execution in LinkViewModel
  - [ ] US-403: Script types and facade for script API
- **EPIC-014** — [Claude AI Chat Panel](epics/EPIC-014.md)
  - [ ] US-385: Right panel slot in Pages.tsx layout
  - [ ] US-386: ClaudeChatModel + SDK integration (query, streaming, abort)
  - [ ] US-387: Chat UI — message list, input, markdown rendering
  - [ ] US-388: MCP auto-registration + page context injection
  - [ ] US-389: Conversation persistence + session resume
  - [ ] US-390: Settings: API key, model, system prompt
  - [ ] US-391: PowerShell shortcut (Ctrl+\`) — open shell at cwd
- **EPIC-011** — [Chrome Extension Support for Built-in Browser](epics/EPIC-011.md)
- *(no epic)*
  - [ ] [US-454: DrawIO Viewer — read-only viewer for `.drawio` files](tasks/US-454-drawio-viewer/README.md)


---

## How This Dashboard Works

### Structure

Each section (Active / Planned) lists epics as top-level items and tasks as sub-items:

```
- **EPIC-XXX** — [Title](epics/EPIC-XXX.md)
  - [ ] US-YYY: Task title
  - [x] US-ZZZ: Completed task title
- *(no epic)*
  - [ ] US-AAA: Standalone task
```

### Starting work

1. Move an epic or task from **Planned** to **Active**
2. Mark the task `[ ]` → `[x]` when done

### Completing a standalone task (no epic)

1. Mark task `[x]` in Active section
2. Move it to [`/doc/tasks/completed.md`](tasks/completed.md)
3. Remove from this dashboard

### Completing an epic

1. All tasks under the epic should be `[x]`
2. Move the entire epic block (with tasks) to [`/doc/epics/completed.md`](epics/completed.md)
3. Remove from this dashboard

### Creating new work

- **New epic:** Add to Planned with link to its doc in `/doc/epics/`
- **New task (with epic):** Add as sub-item under the epic
- **New task (standalone):** Add under `*(no epic)*`

### Task ID Format

`US-XXX` — sequential number. `EPIC-XXX` — sequential number.
