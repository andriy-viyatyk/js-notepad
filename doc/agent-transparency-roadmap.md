# Agent Transparency Roadmap — everything through `call`

**Date:** 2026-09-05
**Builds on:** [EPIC-083](epics/completed.md) (AiVision, the `call` tool) and its evaluation,
[US-1293](tasks/US-1293-call-evaluation/README.md) — **go** for consolidation, with conditions.
**Tracking:** each epic below gets its own `doc/epics/EPIC-XXX.md` when it starts and appears on
[active-work.md](active-work.md) only while active. This document is the sequence and the rules;
it is not a dashboard.

## The goal

Persephone becomes **transparent to an agent**: the agent sees what the user sees, can do what the
user can do, and in places more (`fs`, `main.script`). One MCP tool remains at the end — `call`.
Every current tool, the browser automation family included, becomes a path under it. Highlighting
for the user is a `call` path too, reachable from whatever node owns the element.

The end state is tested before it is committed to: all tools except `call` are **disabled behind a
flag**, the QA suite is re-run with Haiku and Codex agents, and only if that passes are the old
tools deleted. If it fails, the flag is turned off and the failing surface goes back to work — the
tools are never cut over on faith.

## Three principles carried from EPIC-083

1. **Cooperative discovery.** Nodes describe themselves (`members`, `children()`, `restricted()`);
   nothing enumerates by reflection, and no getter is probed. A surface joins the tree by writing
   a descriptor next to its model.
2. **Hand-written purpose.** US-1294 (generating descriptors from typings) was declined because the
   valuable words are the ones a type cannot carry. The same holds for UI elements: an `elements`
   list says *what a control is for*, not just that it exists.
3. **Retire nothing until its replacement path passes the same test.** The `mcp-test-agent-call`
   skill (Haiku, `call` only, no guides) is the acceptance gate for every surface and every retired
   tool. A run log goes to `qa/runs/`.

## Two protocols every surface implements

Defined once in EPIC-084 and then applied surface by surface.

### Attention

Every `call` result carries an optional `attention` block when something is demanding the user's
input in the target window: a blocking dialog (Unsaved Changes, Trust this Board, password), an
open popup menu, a native OS dialog. It names the thing, quotes its title, message and buttons,
and gives the path that resolves it — `dialogs[0].click("Don't Save")`. This is the fix for the
observed stall: an agent closes a modified page, the save prompt appears, and the agent spends
several calls working out why nothing responds.

### Elements and highlight

Any node that corresponds to something on screen exposes `elements` — a hand-written list of
`{ name, purpose, selector }` with `visible` resolved live from the DOM — and
`highlight(name, message?)`, which draws the existing ring-and-tooltip overlay
(`app.ui.highlightElement`) on that element. The agent discovers what is on a screen, learns what
each control is for, and can point the user at one of them, all from the node it is already
looking at. This reverses the "editor internals have no consumer" rule in
[ui-element-contract.md](architecture/ui-element-contract.md): `data-name` coverage now has a
consumer, and the descriptor is the source of truth for which names exist.

## Epic sequence

| # | Epic | Surface | Retires (when its paths pass the gate) |
|---|---|---|---|
| 1 | **EPIC-084** — Attention, `dialogs`, `menus`, elements/highlight protocol | Cross-cutting infrastructure; the shell header strip as the protocol's first consumer | — (adds only) |
| 2 | **EPIC-085** ✅ — Shell | Tab strip, Menu Bar, status indicators, sidebar panels, Settings editor, windows | `get_app_info`, `list_windows`, `open_window`, `list_pages`, `get_active_page`, the `ui` guide's highlight instructions — **all marked retirable 2026-09-05** |
| 3 | **EPIC-086** ✅ — Text family | Monaco/text, compare, file diff, markdown, HTML, SVG, image, video, mermaid, graph | `create_page`, `get_page_content`, `set_page_content` — **all marked retirable 2026-09-06**. `open_url` is **not** marked; see the note below |
| 4 | **EPIC-087** ✅ — Data editors | Grid, notebook, REST client, env vars, log view, archive, explorer/sidebar panels, folder view, git tree | `ui_push` — **marked retirable 2026-09-06** |
| 5 | **EPIC-088** ✅ — Boards and tools | Board, board info, toolset, tools hub, MCP inspector, Mneme config/root | `create_board`, `open_board`, `board_refresh`, `create_toolset`, `refresh_toolset`, `search_tools` — **all marked retirable 2026-09-06**. `execute_tool` is **not** marked; see the note below |
| 6 | **EPIC-089** ✅ — Browser | `pages[i].editor` on browser and board pages, and `window.screen` for the app window; HTML pages answered by the app-window snapshot | all `browser_*` (**14**, not 15) and `open_url` — **all marked retirable 2026-09-06**. The `mcp.browser-tools.enabled` setting was **deleted** |
| 7 | EPIC-090 — Consolidation | Call-only flag, full QA re-run on Haiku and Codex, deletion, guide rewrite | `execute_script`, `read_guide`, and everything still standing |

Epics 2–5 are independent of each other once EPIC-084 lands and can be reordered by demand. The
editor epics are smaller than their lists suggest: US-1291 already gave every editor a content
facade; the remaining gap is the **UI layer** — toolbars, panels, the dialogs the editor raises —
plus the `elements` list.

EPIC-089 is deliberately late. US-1293 named the browser family's open design question: the
snapshot **ref lifecycle** (`src/renderer/automation/ref.ts` keys refs on `backendDOMNodeId` per
frame, populated by each snapshot). Moving that under a page facade is a design task before it is
a descriptor task. Whether the browser tools go at all is a decision for that epic; the roadmap's
default is that they do, and the same automation surface is reused for board pages and the app
window (`pageId: "app"` today).

**One automation surface, three hosts** (user direction, 2026-09-05). The Playwright-style
operations — accessibility snapshot with refs, click, type, press key, hover, select, wait-for,
screenshot, evaluate — are implemented once and hung on every node that owns a live DOM:

| Host | Node | Today |
|---|---|---|
| A browser page (webview) | `pages[i].editor` | `browser_*` with `pageId` |
| A board or HTML page (webview / iframe) | `pages[i].editor` / `editor` — the same members | `browser_*` with `pageId` |
| **Persephone's own window** — header, tabs, Menu Bar, dialogs, every editor's DOM | **`window.screen`** (named in EPIC-089) — the same members | `browser_*` with `pageId: "app"` |

The third row is not optional. `elements` and `highlight` describe the controls a surface *chose*
to document; the snapshot of the app window is the complete, purpose-free fallback that lets an
agent see and drive anything on screen that no descriptor has reached yet — a new dialog, an
editor toolbar nobody wrote an `elements` list for, a third-party control inside Monaco. It is
also how the agent verifies that what it did through a path actually shows on screen. Refs from an
app-window snapshot must be clickable from the same node, so the ref store is per host node, not
global (`src/renderer/automation/ref.ts` is global today — that is the design task).

The **`mcp.browser-tools.enabled` setting goes with them** (user decision, 2026-09-05). It exists
for one reason — to keep fifteen tools out of the agent's context when it does not need them
(`src/renderer/api/app.ts:278`, `src/main/mcp/server-factory.ts:34`). With a single tool that
reason is gone: browser automation is a set of paths under a page, costs nothing until called, and
is on by default. The setting, its main-process mirror, and its Settings-editor row are deleted in
EPIC-089, and the browser guide's "enable browser tools first" instructions with them.

## Tool → path map (starting point, verified per epic)

| Tool today | Path under `call` | Epic |
|---|---|---|
| `get_app_info`, `list_windows`, `open_window` | **retirable** — `version`/root summary, `windows`, `windows[i].open()`; `get_app_info`'s other fields redistributed to `settings.browserProfiles`, `settings.defaultBrowserProfile`, `main.runtime.resourcesDir`, `main.runtime.demoBoardDir`, `boards.assetsBaseUrl`, `boards.manifestUrl` | 085 ✅ |
| `list_pages`, `get_active_page` | `pages`, `page` | already |
| `create_page` | **retirable** — `pages.addEditorPage(editor, language, title)`, with `addEmptyPage()`, `addDrawPage(dataUrl)`, `openLinks(links)` and `openFile(path)` for the other page kinds | 086 ✅ |
| `get_page_content`, `set_page_content` | **retirable** — `pages[i].content`, read and assigned | 086 ✅ |
| `open_url` | **retirable** — `pages.openUrlInBrowserTab(url, options)`, with two recorded return-shape deviations (see below). `pages.openUrl(url, options)` was **added** as the pipeline-routed opener the roadmap wanted under that name; it replaces no tool | 089 ✅ |
| `ui_push` | **retirable** — `pages.logView.push(entries)` on the well-known page, plus `dialogResult(id)` for answers; **non-blocking**, unlike the tool | 087 ✅ |
| `create_board`, `open_board`, `board_refresh` | **retirable** — `boards.createBoard`/`createDemoBoard`/`openBoard` (already existed; the epic added `boards.list()`, without which no root could be discovered), and `pages[i].editor.reload()` on the board facade. The planned `boards.create/open` spelling and `boards.refresh()` were **not** adopted — see the note below | 088 ✅ |
| `create_toolset`, `refresh_toolset`, `search_tools` | **retirable** — `tools.createToolset`, `tools.toolsets.refresh()`, `tools.search()` under a new root `tools` node (not `toolsets` — see below) | 088 ✅ |
| `execute_tool` | `tools.execute(toolId, args)` exists and refuses an unknown id, but is **not marked**: its rows could not be exercised without spending the user's credentials on a live service or clicking the toolset trust dialog as the agent | 088 |
| `browser_*` | **retirable** — `pages[i].editor.snapshot/click/type/...` on browser and board pages, and the same members on **`window.screen`** for the app window (not `window.ui` — see below) | 089 ✅ |
| `execute_script` | `script.execute(code)` — the renderer analogue of `main.script.execute` | 090 |
| `read_guide` | MCP resources stay (`persephone://guides/*`); prose moves into `$help` | 090 |
| `app.ui.highlightElement` via script | `<node>.highlight(name, message)` | 084, then every surface |

**EPIC-085 marked the first three retirable (2026-09-05).** Retirable means every field and action
has a verified path and a Haiku agent reached them with `call` alone — not that anything is deleted.
Deletion stays EPIC-090's, behind the call-only flag. The `ui` guide's script-based highlight
instructions in `assets/mcp-res-ui.md` are likewise retirable but not cut.

Epic 2 also **added** three surfaces the roadmap listed as shell work: `window.menuBar`,
`page.panels`, and the `settings` catalog with `settings.highlight(key)`. None of them replaces a
tool — they were simply invisible to an agent before.

**EPIC-086 marked three more retirable (2026-09-06)**, on the same standard. `create_page` is
answered by `pages.addEditorPage(editor, language, title)` plus `addEmptyPage`, `addDrawPage`,
`openLinks` and `openFile`; `get_page_content` and `set_page_content` are answered by reading and
assigning `pages[i].content`. All three were exercised live through `call` before being marked, and
a Haiku agent with `call` alone passed the epic's acceptance scenario
([qa/runs/2026-09-06-epic-086-editor-surfaces.md](../qa/runs/2026-09-06-epic-086-editor-surfaces.md)).

Epic 3 also **added** surfaces that replace no tool: a facade for video and for file diff, both of
which had none, and `pages.compare` for compare mode.

**EPIC-087 marked `ui_push` retirable (2026-09-06)**, on the same standard: every capability was
exercised live through `call` first — all five log levels, the three text outputs, `output.grid` in
both JSON and CSV form, `output.progress`, all six `input.*` types through the *shared* validation
table, and `windows[i].pages.logView.push(...)` against a real second window — and a Haiku agent
with `call` alone found the channel and used it
([qa/runs/2026-09-06-epic-087-data-surfaces.md](../qa/runs/2026-09-06-epic-087-data-surfaces.md)).

**One replacement deliberately differs from the tool it replaces.** `ui_push` blocks until every
dialog is answered; `pages.logView.push` returns immediately with the dialog ids, raises `attention`
while any answer is outstanding, and hands the answer back through `dialogResult(id)`. That is not a
shortcut: Log View dialogs are inline *page entries*, so the `pending` + `dialogs[0]` mechanism that
rescues every other blocking call cannot reach them, and giving `call` an infinite timeout for one
path would break error reporting for the other thirty. Both paths exist side by side until EPIC-090,
which is when the change gets its second opinion.

Epic 4 also **added** surfaces that replace no tool: facades for the REST client, env vars, archive,
Folder View and Git Tree — none of which had one — and individual sidebar panel nodes under
`page.panels`, which previously reported that a panel was open and nothing about its contents.

The acceptance run also produced two fixes that were **not** descriptor work, and are worth
remembering because both were invisible until a weak model tried the surface. `call` could not
assign JSON text at all: MCP clients parse `value` as JSON, so the error message's advice to
"stringify first" was impossible to follow, and any agent filling a JSON grid page was in a dead
end. And `pages.logView.push` silently accepted a *guessed* entry type, rendering a blank entry and
returning an id, so the agent reported success while the user saw nothing — a silent success, which
is the failure class this roadmap exists to remove.

**EPIC-088 marked six more retirable (2026-09-06)**, on the same standard, and withheld one. Every
row was exercised live through `call` first, and a Haiku agent with `call` alone passed the epic's
scenario with **no wrong turns** — the first surface epic to produce none
([qa/runs/2026-09-06-epic-088-boards-and-tools.md](../qa/runs/2026-09-06-epic-088-boards-and-tools.md)).

`execute_tool` is **withheld**, and the reason is worth stating because it is not a defect in the
replacement. `tools.execute` exists and behaves correctly on the paths that could be tested. But its
three capability rows — run by id, the success shape, the failure shape — need a tool that can
actually be run, and on this machine every registered toolset calls a live company service with the
user's credentials (two of them return PHI). The alternative, registering a scratch toolset, needs a
click on the "Register this toolset?" dialog. **That click was not taken.** An agent answering its
own trust prompt would defeat exactly the property this epic exists to protect, and a marking bought
that way would be worthless. So the row stays unmarked until a human runs one tool through the path,
which is a single `call`.

Two spelling deviations from the table above, both decided against the code rather than the plan:

- The root node is **`tools`**, not `toolsets`. `ai-vision/root.ts` has reserved the name `tools`
  since EPIC-083 specifically so this epic could claim it, and the user-facing feature is called
  Agent Tools. Taking `toolsets` would have left a reserved-but-dead name at the root.
- `board_refresh` became **`pages[i].editor.reload()`**, not `boards.refresh()`. The tool is
  page-scoped in every detail — a `pageId` argument, an active-board default, and a frame-ready wait
  — so a `boards`-level member would have had to invent "which board".

And two facts about the boards half that the table hid: `create_board` and `open_board` were
**already answered** by existing `boards` members, so no aliases were added; what `boards` actually
lacked was **enumeration**, since all fourteen of its members took a root path and nothing could
produce one. `boards.list()` is the real content of that retirement.

Epic 5 also **added** surfaces that replace no tool: facades for the board page, Board Info, the
toolset editor, the Tools hub, and Mneme config and root — none of which had one — the panel state
the MCP Inspector facade never reported, and the two page openers (`pages.showToolsHubPage`,
`pages.showMnemeConfigPage`) that existed on the model but had never been declared, so an agent
could not open either screen.

It also closed a privilege hole that predated it: `command` and `args` were **writable** on the MCP
Inspector facade, so an agent could set a command line of its own choosing and call `connect()`,
spawning a process with the user's privileges and no dialog. Both setters are gone; `url` stays.

Two `call`-wide fixes came out of the run, neither of them descriptor work. **`MAX_DEPTH` in the
result shaper was 4**, which truncated every tool's `inputSchema` to `{ note: "depth limit" }` — an
agent could read a tool's description but not learn how to call it, making the replacement strictly
worse than `search_tools`. And **a key set to `undefined` reaches an agent as `null`** across the
MCP boundary, so absent optionals must be *omitted*, not assigned. Both are general to every surface
and now apply to the rest of the roadmap.

**EPIC-089 marked fifteen tools retirable (2026-09-06)** — the fourteen `browser_*` tools and
`open_url` — on the same standard, and a Haiku agent with `call` alone passed the epic's scenario
([qa/runs/2026-09-06-epic-089-browser-surfaces.md](../qa/runs/2026-09-06-epic-089-browser-surfaces.md)).

Four corrections this epic made to the table above, each decided against the code rather than the plan:

- **There are fourteen `browser_*` tools, not fifteen.** The fifteenth tool this epic retires is
  `open_url`. `doc/architecture/browser-editor.md` had the count right all along.
- **The app-window node is `window.screen`, not `window.ui`.** The root already has a `ui` node
  ("dialogs, notifications… and `ui.elements`"), and a second `ui` one level down meaning "the raw
  DOM of this window" would make the root hint ambiguous exactly where an agent chooses between
  them. `window` already owns this window and `window.menuBar` was the precedent.
- **HTML pages get no facade of their own.** An HTML preview renders in an iframe inside
  Persephone's own webContents, and the app-window snapshot already merges iframe accessibility
  trees, so preview content is reachable through `window.screen` for free. A fourth automation
  target would have been a second way to do the same thing with its own bugs.
- **`open_url`'s replacement is `pages.openUrlInBrowserTab`, and `pages.openUrl` is an addition.**
  Renaming the browser-only member to `openUrl` would have promised routing it does not perform.
  Two return-shape deviations are recorded rather than glossed: `opened` merely echoed the caller's
  own argument, and `title` is the generic browser title at return time, because the page id comes
  back **before** the document loads. `pages.openUrl(url, options)` — the pipeline-routed opener the
  roadmap wanted under that name — was added separately; it returns `void`, because the content
  pipeline genuinely cannot report which page it opened (`sendAsync` yields a boolean, `ILinkData`
  has no output id field, and inferring "the active page" afterwards is a race).

Epic 6 also **deleted** a setting rather than only marking tools: `mcp.browser-tools.enabled` is
gone. It read as a privacy switch and was not one — it gated only the `browser_*` tools, never `call`
or `execute_script`, so the browser facade's `snapshot()` and `click()` had worked with it off since
`call` shipped. The real boundary is `agent-access.ts` and is untouched. Until EPIC-090 deletes the
tools, the fourteen now appear in every agent's manifest by default; that is a context cost, not a
privilege change.

The design task this epic was scheduled late for turned out to be **narrower than feared**. Main-frame
refs already resolved per CDP session; only `ref.ts`'s module-level frame-index map was global, so a
`f1-e456` ref meant "the first iframe of whichever host was snapshotted last". The store is now keyed
by CDP registration key, which is exact for a browser tab, a board frame and the app-window sentinel.

Two `call`-wide improvements came out of the epic, neither of them descriptor work — the same pattern
as EPIC-088's `MAX_DEPTH` and absent-key findings. **`call` can now return an image**: its handler
detects an image payload and emits metadata text plus a real MCP image content block, following
`toPageContentResult`'s precedent. Without it `screenshot()` would have returned base64 inside JSON,
truncated by `maxLength` and invisible to the model, and `browser_take_screenshot` could not have
been marked. And **`pages.showPage` now refuses an unknown page id** instead of silently leaving the
previous page active — found because `window.screen`'s privacy refusal tells the agent to recover
with exactly that call.

Epic 6 also produced two ordinary bug fixes, both found by the surfaces themselves rather than by
reading code, which is the UI-regression property this document predicted the per-surface files would
have. The browser `elements` list reported `toolbar-tor-info` as visible on a non-Tor page — and it
was right, because `IconButtonView` dropped the `hidden` prop on update, so a "Tor connection info"
button rendered on every browser page (US-1341). And a board secondary frame that had loaded and then
been collapsed answered CDP with an **empty** accessibility tree, so `snapshot({ tabId })` returned
`""` while reporting success — a silent empty, fixed by making the readiness gate ensure visibility
rather than trusting a registration flag.

### The `open_url` correction (2026-09-06)

This document said EPIC-086 retires "`open_url` **for non-browser targets**". **That premise was
wrong, and nothing was marked on the strength of it.** `open_url` has no non-browser branch: its
handler (`src/renderer/api/mcp/page-commands.ts:192-202`) calls `pagesModel.openUrlInBrowserTab`
unconditionally, with no test of URL kind, extension or content type, so a URL pointing at an image
or a markdown file lands in a browser tab and the content-delivery pipeline is never consulted.
There is therefore no non-browser half of this tool for the editor epic to replace, and `open_url`
belongs wholly to **EPIC-089**.

Two facts to carry into that epic:

- The planned unified member `pages.openUrl(url, options)` **does not exist**. `pages` has
  `openUrlInBrowserTab` (browser-only) and `openFile` (file-path-typed); neither takes a URL and
  lets the pipeline choose a target editor.
- That capability *does* exist, but on the wrong node: `app.openRawLink(href, { editor })`
  (`src/renderer/api/app.ts:113-117`) is the Layer-1 entry point, and it is the function OS deep
  links already use. EPIC-089 should decide whether `pages.openUrl` becomes a `pages`-level wrapper
  over it or whether `open_url` simply becomes `pages.openUrlInBrowserTab`.

Principle 3 is what caught this: the tool was scheduled for retirement by a table, and checking the
replacement path before marking it is the only reason the mistake did not ship as a promise.

## Per-surface checklist (the template every task in epics 2–6 follows)

1. Descriptor for the surface's model, next to it, registered like the existing ones.
2. `elements` list: every control the user can see, its purpose in one line, its `data-name`.
   Add missing `data-name`s to the view; never rename an existing load-bearing `data-type`.
3. Actions the user can take from that screen, as methods, with `caution` where they write.
4. Dialogs and popup menus the surface raises: covered by the `dialogs`/`menus` nodes, but the
   surface's `$help` names them so the agent expects them.
5. `restricted()` where privacy or trust applies (private browser pages, untrusted boards).
6. Scenarios added to the surface's file under `qa/surfaces/`, run on Haiku via
   `mcp-test-agent-call`, logged in `qa/runs/`. Each scenario covers one thing the user sees and
   one thing the user can do on that screen, and ends by verifying the on-screen result — so the
   file doubles as a UI regression test (see *QA suite* below).
7. Only then: the tool(s) the surface replaces are marked *retirable* in this document.

## QA suite: reorganised per surface, reusable as UI regression tests

User direction, 2026-09-05. The QA files in `qa/` are grouped by *tool* today
(`mcp-test-create-page.md`, `mcp-test-browser.md`, …), which is the axis being retired. As each
surface epic lands, its scenarios go into a per-surface file instead — `qa/surfaces/shell.md`,
`qa/surfaces/dialogs.md`, `qa/surfaces/editors/grid.md`, and so on — one file per screen or
editor, each scenario naming the paths it expects the agent to reach and the on-screen outcome.

That grouping makes the suite two things at once:

- **The acceptance gate** for the surface (principle 3): a Haiku agent with `call` alone must pass
  the file before the surface's old tools are marked retirable.
- **A UI regression suite** independent of the MCP question: because every scenario ends by
  verifying what is on screen (through the app-window snapshot, `elements`, or the page's own
  facade), re-running a surface's file after an unrelated change is a functional test of that
  screen. Discrepancies found this way are ordinary bugs, filed as tasks, not roadmap work.

EPIC-084 (US-1302) starts the layout with `qa/surfaces/dialogs.md` and moves the "Reproducing"
notes from the EPIC-083 run into it. EPIC-090 retires the per-tool files once every surface file
exists. The runner instructions in `qa/README.md` gain a "run one surface" and "run all surfaces"
procedure; the model stays Haiku for the gate, with Codex as the second model family at EPIC-090.

## The final gate (EPIC-090)

1. A flag (settings or environment) hides every tool except `call` from the MCP manifest.
2. The full QA suite in `qa/` is re-written for `call` and run twice: Haiku via
   `mcp-test-agent-call`, and Codex as a second model family.
3. Pass → delete the tool implementations, the guide-tool, the standalone highlight instructions
   in `assets/mcp-res-ui.md`, and the per-tool QA files; rewrite the manifest instructions.
4. Fail → the flag stays off, the failing surface's epic reopens, and nothing is deleted.

## The `call("")` overview — the agent's first step (recorded 2026-09-06, for EPIC-090)

User observation: the `call` tool's manifest marks `path` as **required**, so a fresh agent has to
guess a first path instead of being invited to start empty. The handler already treats a missing
`path` as `""` (`src/main/mcp/tools/call-tools.ts`), so the fix is only the schema: `path` becomes
optional, described as "omit for the overview".

The overview itself should do more than list root member names. `call("")` (or `call` with no
arguments) is the natural home for a **high-level path map**: one line per top-level area — `pages`,
`page`, `windows`, `tools`, `boards`, `settings`, `dialogs`, `menus`, `main`, `helpSearch`, … — with a
short description of what each path is for and one example path under it, so an agent can pick the
most suitable branch and dig down from there. The existing per-node hints and `$help` stay as the
next level of detail; the overview is the map that points at them.

EPIC-090 owns this: it is the epic that hides every tool except `call` and rewrites the manifest
instructions, so the first thing a `call`-only agent sees is decided there. Requirements for the task:

1. `path` optional in the manifest; no path ≡ `""`.
2. `call("")` returns the path map (area → purpose → example path) before the raw member list, kept
   short enough to be cheap on every session.
3. The tool description's "Start with path \"\"" line becomes "Start with no path".
4. The QA re-run in the final gate starts every scenario from `call` with no path and records
   whether the map led the agent to the right branch without a wrong turn.

## Out of scope / recorded concerns

- **Native OS dialogs** (file pickers, main-process message boxes) can be *reported* by attention
  but not driven. The agent is told to ask the user.
- **Passwords and encryption dialogs**: buttons and cancel only; a typed value is never readable.
- **Coverage vs cost**: 37 editors and 14 dialogs is months of descriptor writing if done
  exhaustively. Rarely used editors (storybook, about, category, link editor) may stop at the
  facade plus a minimal `elements` list, and the roadmap does not promise full coverage of them.
- **App-window snapshot vs `elements`**: both survive by design. The snapshot is complete but
  purpose-free; `elements` is curated. See *One automation surface, three hosts*.
