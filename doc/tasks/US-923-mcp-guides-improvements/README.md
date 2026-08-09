# US-923: MCP guides improvements — overview, targeting, dedup, errors

**Status:** Implemented — awaiting user testing (2026-08-09)

## Goal

Improve the agent-facing MCP documentation (the eight `read_guide` guides in `assets/mcp-res-*.md`
plus the server instructions in `src/main/mcp-http-server.ts`) based on an external review by an
independent AI agent connected through Claude Desktop. The review's source report is preserved in
[desktop-agent-report.md](desktop-agent-report.md) (Ukrainian).

## Background

An independent Claude agent (connected via `mcp-remote` from Claude Desktop) read all eight guides,
the tool descriptions, and exercised the tools in a live session, then produced a review. Overall
verdict: content 8/10, navigation/cohesion 6/10. The `tools` guide was rated a 10/10 exemplar;
the main gaps are cross-cutting: no starting map, underspecified page-targeting rules, no error
documentation, one true duplication, and a handful of small fixes.

Claims were verified against the codebase before this task was written:

| Report claim | Verified? | Evidence |
|---|---|---|
| Graph format documented twice, versions diverged | **Yes** | `assets/mcp-res-pages.md:172-233` vs `assets/mcp-res-graph.md`; `charge` default −70 vs −40; `isGroup`, `legend`, `prop#N` only in graph.md |
| One of the two graph copies is factually wrong | **Yes** | Code default is −70 (`src/renderer/editors/graph/constants.ts:5`) — `graph.md`'s −40 is wrong |
| rest-client also duplicated | **No** | There is no separate rest-client guide; `pages.md` is its only home. Dropped from scope. |
| `open_url` returns no `pageId` | **Yes** | `src/renderer/api/mcp-handler.ts:650` returns `{ opened: url }`. Same for `open_board` (`:679`). |
| `open_url` does not focus the new page | **No (collision)** | `openUrlInBrowserTab` calls `showPage()` / `showBrowserPage()` (`PagesLifecycleModel.ts:1372,1417`). The reviewer's observation was a concurrent-agent collision — another agent activated a board page at the same time. Still worth documenting, and returning `pageId` makes concurrent focus changes harmless. |
| `notepad://` URIs stale/unreachable | **Partly** | URIs are registered (`mcp-http-server.ts:273-322`) and referenced in instructions and error messages; the reviewer could not list resources through the `mcp-remote` proxy. Needs a transport-level check. |
| `boards` guide too heavy | **Fair** | 498 lines vs ≤343 for all others |
| Undocumented editors in the editor-type list | **Yes** | `pages.md:139` lists `archive-view`, `category-view`, `about-view`, `settings-view`, `mcp-view` etc. with no creatable/internal marking; `mcp-handler.ts:353-361` already has per-editor hints that could seed this |

Key files:

| What | Where |
|---|---|
| The eight guides | `assets/mcp-res-*.md` (ui-push 192, pages 311, scripting 343, notebook 160, links 95, graph 212, boards 498, tools 193 lines) |
| Guide registration + server instructions + tool descriptions | `src/main/mcp-http-server.ts` (`resourceFiles` at ~273, instructions block at ~206-253, `read_guide` at ~822, `notepad://guides/full` at ~861) |
| MCP tool handlers (renderer side) | `src/renderer/api/mcp-handler.ts` |
| Browser automation commands | `src/renderer/automation/commands.ts` |
| MCP docs QA harness | `qa/README.md` |

## Implementation plan

Ordered by the report's effort/impact priority. Steps 1–5 are the core; 6–8 are follow-ups that
can be trimmed at review.

### 1. New `overview` guide — DONE

- [x] Created `assets/mcp-res-overview.md` (~70 lines): mental model, task → tool → guide
  routing table, reading order, and "three habits" (explicit targeting, verify-don't-assume,
  read format guides first).
- [x] Registered first in `resourceFiles`; `read_guide` enum + description list it; server
  instructions gained a "New to Persephone? read_guide(\"overview\")" pointer line.
- [x] Verified live: `read_guide("overview")` returns the guide.

### 2. `open_url` / `open_board` return `pageId` — DONE

- [x] `openUrlInBrowserTab` returns `Promise<string | undefined>` (the target page id);
  `showBrowserPage` returns the created `PageModel`. Script-facing `showBrowserPage` stays
  `Promise<void>` (scripts must not receive internal models); script-facing
  `openUrlInBrowserTab` now returns the page id (`pages.d.ts` + `PageCollectionWrapper`).
- [x] `open_url` returns `{ opened, pageId, title }` (verified live); `open_board` returns the
  same, resolving the board page by normalized `boardRoot` after the openRawLink pipeline.
- [x] Tool descriptions updated; pages guide documents the return + "always pass pageId".

### 3. "Page targeting resolution" — DONE (deviation: lives in the browser guide)

- [x] Exact 4-row precedence table (app sentinel → pageId → profileName → active/first
  browser/first board) written from `automation/commands.ts getTarget()`, including the two
  gotchas: a board can win the untargeted fallback, and the active page is shared mutable state.
- [x] **Deviation from plan:** the full algorithm lives in `mcp-res-browser.md` (its natural
  home once step 6 existed); `pages.md` keeps its short targeting prose plus a pointer — no new
  duplication, per the whole point of this task.

### 4. De-duplicate the graph format — DONE

- [x] `graph.md` is the single source; its defaults fixed against `graph/constants.ts`:
  charge −40→**−70**, linkDistance 30→**40**, collide 0.5→**0.7** (and `collide` re-described
  as D3 collision *strength*, which is what the code maps it to).
- [x] `pages.md` graph section shrunk to a 6-line pointer (empty-content snippet + suffix note
  + `read_guide("graph")`).
- [x] rest-client stayed in `pages.md` (no separate guide exists).

### 5. "Errors & verification" sections — DONE (empirically grounded)

- [x] Probed the live app: `create_page` with unparseable JSON → silent success, editor shows
  parse-error text; valid JSON missing `tags` → silent success, editor shows **`Editor
  crashed` + `TypeError: note.tags is not iterable` + stack**; `get_page_content` echoes broken
  content back (not a validity check); `execute_script` exceptions return `isError: true` +
  message + full stack + capturedConsoleLogs; `page` is a reserved script global.
- [x] Sections added to all guides: pages, scripting, graph, notebook, links, ui-push, tools,
  boards (browser guide shipped with one built in).
- [x] `scripting.md` gained "Execution model & security": no sandbox / user privileges, the
  ~30 s MCP timeout (script keeps running after it), dialog blocking, result serialization.
  Also fixed gaps found while probing: `app.pages.all` and `closePage` were undocumented.
- [x] `ui-push.md` errors section answers the reviewer's two open questions: dialogs wait
  **forever** (timeout 0 when entries contain dialogs; `button: null` when the page is closed),
  and the Log View goes to the `windowIndex`-addressed window (first open when omitted).

### 6. New `browser` guide — DONE

- [x] Created `assets/mcp-res-browser.md` (~160 lines): targeting resolution table, snapshot
  format (roles, state markers, iframe merging, overlay hints, invisible-elements caveat), ref
  lifecycle from the implementation (refs are CDP backendDOMNodeIds → main-frame refs survive
  re-snapshots until the element leaves the DOM; iframe refs only valid from the latest
  snapshot), "every action returns a fresh snapshot", navigate's built-in waits (2 s + 10 s),
  `browser_wait_for` modes, evaluate semantics, tabs/screenshot/network, app-window pointer,
  and an errors table mapping every real error message to its fix.
- [x] Registered in `resourceFiles` + `read_guide` enum.
- [x] **Deviation from plan:** profile *fields* stayed in `pages.md` (they're page metadata);
  the browser guide summarizes and links instead of wholesale moving the prose.

### 7. Small fixes + scheme rename — DONE

- [x] `pages.md` editor list split into **creatable** (the 14 content-hosting editors) vs
  **standalone** (a table with how to open each: `open_url`, `open_board`,
  `app.pages.openFile`, `showMcpInspectorPage`, …), sourced from the registry's
  `hasContentHost` flags. (Found in passing: the mcp-handler hint for `log-view` is dead code —
  log-view has `hasContentHost: true`; left as-is, harmless.)
- [x] `notepad://` → `persephone://` everywhere: `mcp-http-server.ts`, `mcp-handler.ts`,
  `assets/mcp-res-pages.md`, `qa/mcp-test-create-page.md`. Zero grep hits remain in `src/`,
  `assets/`, `qa/`.
- [x] `resources/list` **verified working over HTTP** (curl probe returned all guides with the
  new URIs) — the Desktop reviewer's empty listing was an mcp-remote/client-side issue, so the
  URI mentions stay.
- [x] Stale-doc fixes found along the way: `set_page_content` description and `read_guide`'s
  error message both referenced a nonexistent `todo` guide — removed.

### 8. QA pass — DONE (scenarios updated; agent run pending app restart)

- [x] `qa/mcp-test-create-page.md` URIs renamed; `qa/README.md` stale `todo` references removed.
- [x] New tests added to `qa/mcp-test-page-operations.md`: 4.11 (open_url pageId → explicit
  targeting past an active board), 4.12 (overview guide as entry point), 4.13 (graph
  single-source with `isGroup`), 4.14 (verifying rendering, not just content echo).
- [x] Ran the mcp-test-agent flow on **Haiku** against the live dev instance — 9 tests:
  7 PASS, 2 PARTIAL, 0 docs failures. Full log: `qa/runs/2026-08-09-haiku.md`. Harness fixes
  made along the way: skill contract tightened to persephone-tools-only (it could previously
  use Write/Artifact), `read_guide` + `browser_*` added to its allowed-tools, model set to
  `haiku` (weakest model = strongest docs test — rationale recorded in qa/README.md), stale
  `claude --agent` runner command replaced with the Skill invocation, new
  `qa/mcp-test-browser.md` scenario file (7 tests) + create-page tests 1.12–1.14.

### Explicitly deferred (recorded, not in this task)

- **Splitting `boards` into quickstart + reference** — changes the `read_guide` surface and
  interacts with the three-way board-doc sync rule in `/document`; do as its own task if wanted.
- **Versioning / "since version" markers / changelog guide** — worthwhile but a policy decision;
  needs the user's take on how much version discipline the guides should carry.

## Concerns / Open questions

All resolved at user review (2026-08-09):

1. **Step 2 code change** — RESOLVED: keep in this task; improve the code as well.
2. **Overview guide vs longer server instructions** — RESOLVED: separate guide + one pointer
   line in instructions (guides are opt-in context; instructions cost tokens every session).
3. **Browser guide (step 6)** — RESOLVED: keep in scope. Noted: it is the only step whose
   content must be *discovered* (ref invalidation rules, snapshot limits, wait semantics require
   reading `src/renderer/automation/` and empirical verification against a live page), not just
   written down. If the investigation turns out deeper than expected, report back rather than
   publish guessed lifecycle rules — a wrong ref-lifecycle claim is worse than none.
4. **`notepad://` scheme** — RESOLVED: rename to `persephone://` now, while there are near-zero
   external consumers; no alias needed. Folded into step 7.
5. **Well-rated guides** (ui-push 9, notebook 9, links 9, tools 10) get only the
   "Errors & verification" addition — no rewriting what already works.

## Acceptance criteria

- [x] `read_guide("overview")` exists, is registered, and is pointed to from server instructions
- [x] `open_url` / `open_board` responses include `pageId` (+ title); guides updated
- [x] Page-targeting resolution documented as an exact algorithm matching the code (browser guide)
- [x] Graph format lives only in `graph.md`, with defaults matching `graph/constants.ts`
- [x] Every guide has an "Errors & verification" section grounded in actually-observed behavior
- [x] `browser` guide exists with ref-lifecycle rules read from the implementation (`ref.ts`/`snapshot.ts`)
- [x] Editor-type list marks creatable vs standalone, sourced from registry `hasContentHost` flags
- [x] `notepad://` fully renamed to `persephone://` (zero grep hits in `src/`, `assets/`, `qa/`); `resources/list` over HTTP verified working — URI mentions kept
- [x] `npm run typecheck` + `npm run lint` pass; QA scenarios in `qa/` updated (agent-run pass pending app restart)

## Files Changed (actual)

| File | Change |
|---|---|
| `assets/mcp-res-overview.md` | **New** — mental model + task→tool→guide routing + three habits |
| `assets/mcp-res-browser.md` | **New** — targeting resolution, snapshot format, ref lifecycle, waiting, evaluate, errors table |
| `assets/mcp-res-pages.md` | Editor list split creatable/standalone; graph section → pointer; open_url pageId example; targeting pointer to browser guide; errors section; scheme rename |
| `assets/mcp-res-graph.md` | Defaults fixed (charge −70, linkDistance 40, collide 0.7); errors section |
| `assets/mcp-res-scripting.md` | New "Execution model & security" section; `app.pages.all`/`closePage`/openUrlInBrowserTab-returns-id documented; errors section |
| `assets/mcp-res-ui-push.md` | Errors section (dialog timeout semantics, windowIndex, `button: null`) |
| `assets/mcp-res-notebook.md`, `-links.md` | Errors sections (empirical crash/parse-error behavior + recovery) |
| `assets/mcp-res-tools.md`, `-boards.md` | Errors sections (consolidating each guide's failure contract) |
| `src/main/mcp-http-server.ts` | overview+browser registered; `read_guide` enum/list updated (stale `todo` removed); overview pointer in instructions; open_url/open_board descriptions; scheme rename |
| `src/renderer/api/mcp-handler.ts` | `open_url` → `{ opened, pageId, title }`; `open_board` → same via boardRoot lookup; scheme rename in error messages |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | `openUrlInBrowserTab` → `Promise<string \| undefined>`; `showBrowserPage` → `Promise<PageModel \| undefined>` |
| `src/renderer/api/types/pages.d.ts` | `openUrlInBrowserTab` return type + doc comment |
| `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` | openUrlInBrowserTab passes id through; showBrowserPage stays void for scripts |
| `qa/README.md` | Stale `todo` references removed; runner section rewritten (Skill invocation, model-choice rationale, live-instance cleanup rule) |
| `qa/mcp-test-create-page.md` | Scheme rename; new tests 1.12 rest-client, 1.13 JSONL grid, 1.14 standalone-editor refusal |
| `qa/mcp-test-page-operations.md` | New tests 4.11–4.14 (pageId targeting, overview entry point, graph single-source, render verification) |
| `qa/mcp-test-browser.md` | **New** — 7 browser-automation scenarios (targeting, refs, evaluate, wait_for, screenshot, app window, stale-ref recovery) |
| `qa/runs/2026-08-09-haiku.md` | **New** — Haiku run log: 9 tests, 7 PASS / 2 PARTIAL / 0 docs failures |
| `.claude/skills/mcp-test-agent/SKILL.md` | Contract tightened (persephone-tools-only, no Write/Artifact); `read_guide` + `browser_*` in allowed-tools; `model: haiku` |

**Not changed (by design):** `src/renderer/automation/commands.ts` and
`src/renderer/editors/graph/constants.ts` (read-only sources of truth);
`assets/board-template/CLAUDE.md`, `assets/demo-board/`, `assets/mcp-res-boards.md` create/open
lifecycle prose (no board-facing behavior changed).

**Checks:** `npm run typecheck` clean, `npm run lint` clean, `grep notepad://` → 0 hits in
`src/`+`assets/`+`qa/`, `resources/list` + `read_guide("overview")` + `open_url` pageId all
verified against the live dev instance.
