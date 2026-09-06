# EPIC-088: Boards and tools through `call`, and the retirement of seven tools

## Status

**Status:** Active
**Created:** 2026-09-06
**Started:** 2026-09-06
**Roadmap:** [agent-transparency-roadmap.md](../agent-transparency-roadmap.md), epic 5 of 7

## Overview

EPIC-086 covered the editors that *show* content and EPIC-087 the editors that *hold structured
data*. This epic covers the surfaces where **the agent's own work becomes a durable artifact the
user owns**: a Board it built, a toolset it registered, an MCP server it is inspecting, a Mneme
knowledge root it is indexing. Seven MCP tools live here — more than any previous epic in this
programme — and every one of them creates or runs something with the user's privileges.

That is what makes this epic different from the three before it. EPIC-086 and EPIC-087 exposed
*state*: what is on screen and what the user could read. Here the majority of the surface is
*action*, and each action has a trust boundary attached — a board is trusted or it does not render,
a toolset is registered or its tools do not run, a tool executes a real OS process. The descriptor
work is the easy half; the hard half is making sure a path never grants a privilege that today
requires a user's click.

### The family

Counts in the "named controls in source" column are `name:` props found under the surface's folder
(UIKit emits `data-name` from a `name:` prop rather than a literal attribute — EPIC-087's finding),
so they include structural roots, splitters and section headers and are an **upper bound each task
corrects**. EPIC-086 saw image fall 9 → 3 and video 14 → 10; EPIC-087 saw the same on every surface.

| Surface | Editor id(s) | Facade today | Named controls in source | Task |
|---|---|---|---|---|
| Board page | `board-view` (+ `board-secondary:*` views, `boards` sidebar panel) | **none** | 22 | US-1325 |
| Boards root node | *not an editor* — the `boards` API namespace | descriptor exists, no listing/refresh | — | US-1326 |
| Board Info | `board-info` | **none** | 20 | US-1327 |
| Agent Tools root node | *not an editor* — `src/renderer/api/tools/` | **none** (root name `tools` is reserved and unbuilt) | — | US-1328 |
| Toolset editor / Tools hub | `toolset-view`, `tools-hub-view` (+ the tools tree) | **none** | 6 + 6 | US-1329 |
| MCP Inspector | `mcp-view` | `McpInspectorFacade`, no `elements`, no panel state | 63 | US-1330 |
| Mneme config / Mneme root | `mneme-config`, `mneme-root` (+ `mneme-tree` view) | **none** | 44 + 18 | US-1331 |

Verified against the source before the tasks were written:

- The seven editor ids above are registered at `src/renderer/editors/register-editors.ts:171-189`
  (`tools-hub-view` 171, `mcp-view` 172, `mneme-config` 173, `mneme-root` 178, `board-view` 179,
  `toolset-view` 180, `board-info` 182). `boards` (34-40), `mneme-tree` (93-96) and the
  `board-secondary:*` family (100-107) are **secondary views**, not page editors — the same
  distinction EPIC-087 hit with `explorer`/`search`/`boards`.
- Of the seven, exactly **one** has a facade: `mcp-view` → `McpInspectorFacade`
  (`PageWrapper.ts:83`). It has no `elements` and reports connection/history state only — nothing
  about the Tools, Resources or Prompts panels the user is actually looking at
  (`editors/mcp-inspector/ToolsPanel.ts`, `ResourcesPanel.ts`, `PromptsPanel.ts`).
- The `boards` **API namespace** already has a hand-written descriptor
  (`scripting/ai-vision/namespaces/boards.ts`) covering fourteen members, registered at
  `namespaces/index.ts:39`. It is the most complete namespace descriptor in the tree, and it is why
  `create_board` and `open_board` are nearly answered already — see decision 3.
- The root reserves the name **`tools`** for exactly this epic (`ai-vision/root.ts:31`,
  `RESERVED_ROOT_NAMES`), with the comment "not yet built". No renderer member has taken it.
- `src/renderer/api/tools/` holds the whole registry — `registered-tools.ts`, `tool-executor.ts`,
  `tools-manifest.ts`, `tools-trust.ts`, `tool-scaffold.ts`, `tool-stats.ts`, `tool-log.ts`,
  `dotenv.ts` — and has **no** AiVision descriptor of any kind. This surface is invisible to `call`
  today; the four tool-family MCP tools are its only access path.
- The four tool-family tools are declared in `src/main/mcp/tools/agent-tools.ts` and the three board
  tools in `src/main/mcp/tools/board-tools.ts`; all seven route through
  `src/renderer/api/mcp/command-registry.ts:18-46` into `board-commands.ts` and `tool-commands.ts`.
- **Two of these three pages cannot be opened from `call` at all.** `PagesModel` exposes
  `showMcpInspectorPage`, `showToolsHubPage` and `showMnemeConfigPage`
  (`api/pages/PagesLifecycleModel.ts:789,808,831`, re-exported at `PagesModel.ts:277-281`), but only
  the first is declared on `PageCollectionWrapper` (`PageCollectionWrapper.ts:34,225`). So an agent
  can reach the MCP Inspector and neither the Tools hub nor Mneme config. US-1329 and US-1331 add
  the two missing members — the cheapest single improvement in the epic.
- The board frame is a **cross-origin `<iframe>`**, not a webview, despite the filename
  `editors/board/BoardWebview.ts` (see its own header comment, and `iframe.src = board://…` at
  line 139). That matters for decision 7 and for EPIC-089's ref lifecycle.
- `refresh_toolset`'s `path` argument is a **hint only** — the handler calls
  `registeredTools.refresh(path)` and refreshes the whole registry regardless
  (`tool-commands.ts:91-112`). See the retirement table.

## Goals

- Every surface in the table answers `pages[i].editor` with a real facade: its state, the actions
  the user can take from that screen, and a curated `elements` list with a purpose line each.
- A root **`tools`** node makes the Agent Tools registry visible for the first time: which toolsets
  are registered, which tools each declares, what each tool takes, and how to run one — with the
  trust boundary intact.
- The `boards` namespace gains what it lacks: **which boards exist** (installed, trusted, open), and
  a reload path for a board page.
- All seven tools have a verified replacement path and are marked **retirable**. Nothing is deleted;
  deletion stays EPIC-090's.
- No path grants trust or registration that today requires a user's dialog, and no member *accepts*
  a secret value.
- `qa/surfaces/editors/boards.md` and `qa/surfaces/tools.md` exist and pass on Haiku with `call`
  alone.

## Design decisions

### 1. The root node is `tools`, not `toolsets`

The roadmap's tool→path map writes the four tool-family paths as `toolsets.*`. **This epic uses
`tools` instead**, and the reason is on disk rather than in taste: `ai-vision/root.ts:31` already
reserves `tools` at the root for this work, so every renderer member has been kept away from that
name since EPIC-083 specifically so this epic could claim it. Taking `toolsets` now would leave a
reserved-but-dead name at the root and put the collection one level away from the name the user
sees — the feature is called **Agent Tools** in the guide (`assets/mcp-res-tools.md:1`), in the
registry UI ("Tools & Editors", `register-editors.ts:171`) and in the editor's display name
("Agent Tool", `register-editors.ts:180`).

The shape follows the tool names, which are tool-level and not toolset-level:

- `tools.search(query?, maxResults?)` ← `search_tools`
- `tools.execute(toolId, args?)` ← `execute_tool`
- `tools.toolsets` — the collection; `tools.toolsets[i]` is one registered toolset, with its
  manifest state, its tool list, its root folder, and `refresh()` ← `refresh_toolset`
- `tools.toolsets.refresh()` — the whole-registry refresh (`refresh_toolset` with no `path`)
- `tools.createToolset(name, dir)` ← `create_toolset`, prompt intact (decision 5)

This is a deviation from the roadmap table and is recorded there when the epic closes.

### 2. `board_refresh` is answered on the board **page**, not on `boards`

The roadmap writes this one as `boards.refresh()`. Checking the tool before adopting the table —
principle 3, and the `open_url` precedent — says otherwise. `board_refresh` takes a `pageId` and
defaults to *the active board*, waits for the reloaded main frame to signal load, and returns
`{ refreshed, pageId, frameReady }` (`src/main/mcp/tools/board-tools.ts:28-33`). Every part of that
is page-scoped. A `boards.refresh()` with no argument would have to invent "which board", and a
`boards.refresh(pageId)` puts a page id on a namespace that otherwise speaks in board root paths.

So the replacement is **`pages[i].editor.reload()`** on the board facade, matching what the user
does (they reload *this* board), and returning the same `frameReady` signal. The frame-ready wait is
the tool's whole value — an agent that snapshots immediately after a reload must see the new content
— and US-1325 **moves** that wait rather than reimplementing it (EPIC-087's archive lesson).

`boards.refresh()` is not added. If a "reload every open board" action is ever wanted, it is a new
capability, not a tool replacement.

### 3. `create_board` and `open_board` are already answered; the epic verifies rather than adds

`boards.createBoard(name, dir)`, `boards.createDemoBoard(name, dir)` and `boards.openBoard(root)`
exist, are described member-by-member with `caution` strings, and cover `create_board` including its
`demo: true` branch (`namespaces/boards.ts`). The roadmap's `boards.create` / `boards.open` spelling
is **not** adopted: the tree's stated rule is that a path has the same name as the script API member
so that every hint doubles as a scripting tutorial (`ai-vision/root.ts`, class doc comment), and
renaming these would break that for two members while creating a second name for one action.

What is genuinely missing is **enumeration**. `boards` can create, open, trust, install and remove a
board but cannot answer "which boards do I have?" — there is no listing member at all, so an agent
must already know a root path before any of the other thirteen members are usable. US-1326 adds the
listing (installed catalog boards, trusted boards, and which are currently open as pages) and only
then are `create_board` and `open_board` marked, on live checks rather than on this paragraph.

### 4. Trust and registration state is a first-class part of every facade here

A board page renders one of three things: the board, `UntrustedBoardView`, or `BoardNotFoundView`
(`editors/board/`). An agent that reads only "editor id `board-view`, title X" cannot tell a working
board from a board the user has not trusted, and will report success for a page showing a trust
prompt. So each facade in this epic reports its trust/registration state explicitly and its `$help`
names the dialog that resolves it (`dialogs/trust-board.ts`, `dialogs/register-toolset.ts` — both
descriptors already exist under `scripting/ai-vision/dialogs/`).

`restricted()` applies where the state means the content is not the agent's to read: an **untrusted**
board's contents. A board that is merely *not found* is not restricted — it is empty, and saying so
is the useful answer.

### 5. No path may grant trust, and no member accepts a secret

Two separate rules, both absolute in this epic.

**Trust stays a user click.** `create_toolset` prompts the user to confirm registration because a
registered toolset's scripts run headlessly with their privileges; `registerBoard` shows the trust
dialog; a board Persephone did not create prompts before rendering. Every one of those dialogs
survives verbatim on the `call` path. `tools.createToolset` scaffolds and *offers* registration —
it never self-registers, and its return value distinguishes "created but declined" from "registered"
exactly as the tool does (`tool-commands.ts:155`). A member that registered a toolset silently would
be a privilege escalation dressed as a descriptor, and it is an abort condition, not a trade-off.

**Accepting a secret is forbidden; reporting a *name* is required.** This is EPIC-087 decision 7
carried forward, and the tool family already gets it right: `search_tools` returns the **names** of
required environment variables and never their values, and `.env` values never travel through MCP
(`assets/mcp-res-tools.md`, *Secrets*). The facades keep that contract precisely — `env` lists names,
never values — and no member takes a secret value as an argument (no `setEnv`, no password, no
`.env` writer). Board environment variables are the same question on the other surface;
`boardVars` already has its own namespace descriptor (`namespaces/board-vars.ts`), and US-1327 asks
the EPIC-087 question of it separately rather than assuming the toolset answer applies: *is there a
path beside this facade that already returns the value?*

### 6. `tools.execute` carries the tool family's self-repair contract, not just a `caution`

`execute_tool`'s most valuable behaviour is its **failure** shape: `{ ok:false, error, exitCode,
stderr, logs, toolsetRoot }`, which is what lets an agent fix a broken tool at its folder rather than
routing around it (`assets/mcp-res-tools.md`, *Self-repair*). A replacement that threw a string on a
non-zero exit would pass a build and destroy the feature. So `tools.execute` returns the same
structured result on failure — including `toolsetRoot` — and its `$help` states the self-repair rule
and the `##PERSEPHONE_RESULT##` marker contract. Same for `refresh()`: it returns the per-toolset
`{ name, valid, errors, toolCount }` summary that is how a manifest edit is verified before anything
is run.

`caution` on `execute`, `createToolset` and the board create/open members is necessary but not
sufficient; the contract above is the part that cannot be inferred.

### 7. Board and MCP-Inspector *content* is EPIC-089's, not this epic's

A board renders in a cross-origin iframe and a browser page in a webview. Driving what is *inside*
them — snapshot, click, type — is the one automation surface EPIC-089 builds and hangs on three
hosts, explicitly including board pages (roadmap, *One automation surface, three hosts*). This epic
stops at the **host**: the page's chrome, its toolbar, its trust state, its reload, its secondary
views, its manifest facts. The board facade's `$help` says so and points forward, so an agent asking
"what is on this board" gets an honest boundary instead of a silent empty answer.

The same line applies to a Mneme root's indexed documents: the Mneme MCP server already addresses
those, and this epic describes the **configuration screen**, not the knowledge base.

### 8. Every new facade joins `FACADE_FOR_EDITOR`; nothing is bolted onto `PageWrapper`

Unchanged from EPIC-087 decision 3. A new surface is a class in
`src/renderer/scripting/api-wrapper/`, an entry in the `FACADE_FOR_EDITOR` map
(`PageWrapper.ts:65-90`), an addition to the `EditorFacade` union (`PageWrapper.ts:57-63`) and to
`IEditorFacade` in `src/renderer/api/types/`, and a regenerated `assets/editor-types/*.d.ts`. The
`.d.ts` copies are **generated** by `editorTypesPlugin()` and are never hand-edited.

### 9. `strictNullChecks` is off, so "returns `undefined` when unavailable" is a review obligation

Carried verbatim from EPIC-086 and EPIC-087. Six new facades land here over models that may have no
board manifest, no connected server, no selected toolset, no Mneme root. **Every plan review in this
epic checks by hand that an absent value is `undefined` and not `false`, `0`, `""` or `null`.** The
compiler will not; plan review caught exactly this defect in both previous epics.

### 10. Page-scoped selectors, and the three EPIC-087 element traps

Every element declared here resolves beneath `[data-page-id="<id>"]` via `pageScopeSelector`
(`ai-vision/page-elements.ts:6-8`), and `highlight` activates the page and waits for layout. Three
failures found live in EPIC-087 are checked in every plan review of this epic, because a green build
does not catch any of them:

1. **UIKit deletes `data-name`** when a later `update()` omits the `name` prop. A control named only
   on mount is stripped on the first re-render and can never resolve.
2. **The highlight overlay rings only the first match** unless `all: true` is passed. Any purpose
   line promising "every tool in the list" must pass it.
3. **Move a handler, never reimplement it.** EPIC-087's archive facade reimplemented a click handler
   and took the wrong branch for every item. This epic has several action-heavy surfaces
   (`reload`, `connect`, tool execution, board install) where the same mistake is available.

And EPIC-087's acceptance-run lesson: **a node never silently accepts guessed input.** A misspelled
tool id, an unknown toolset name, a bad transport type — each is validated and throws with the valid
list, never rendered as an empty success.

### 11. Version stays 5.0.0; the branch keeps its name

`package.json` is already at 5.0.0. Every addition here is additive — no tool is removed and no
existing scripting member changes shape — so no further bump. Agent-visible additions are recorded in
the `## Version 5.0.0 (Upcoming)` section of `docs/whats-new.md`. The branch keeps its
`upcoming-v4.0.24` name; renaming it is the user's to do.

### 12. The `mcpHint` on every retired tool's editor is updated

`register-editors.ts:172` points the agent at `execute_script` for the MCP Inspector, and the tools
guide (`assets/mcp-res-tools.md`) instructs `search_tools` / `execute_tool` / `refresh_toolset`
throughout. A surface that tells the agent to use the tool it replaces fails the acceptance run by
construction — the same correction EPIC-087 made for `log-view`'s hint. Hints are updated in the
owning task; the **guides** (`mcp-res-tools.md`, `mcp-res-boards.md`) are updated in US-1332 once the
paths are proven, and the tools themselves are not touched.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| [US-1325](../tasks/US-1325-board-page-surface/README.md) | The board page surface — trust states, toolbar, secondary views, and `reload()` | Implemented |
| [US-1326](../tasks/US-1326-boards-enumeration/README.md) | The `boards` node completes — enumeration of installed, trusted and open boards | Implemented |
| [US-1327](../tasks/US-1327-board-info-surface/README.md) | The Board Info surface — install, version, screenshots, and the board-vars question | Implemented |
| [US-1328](../tasks/US-1328-tools-root-node/README.md) | The `tools` root node — search, execute, toolsets, refresh, and the registration prompt | Implemented |
| [US-1329](../tasks/US-1329-toolset-and-tools-hub/README.md) | The toolset editor and the Tools hub | Implemented |
| [US-1330](../tasks/US-1330-mcp-inspector-surface/README.md) | The MCP Inspector surface — elements, and the Tools/Resources/Prompts panels | Implemented |
| [US-1331](../tasks/US-1331-mneme-surfaces/README.md) | Mneme config and Mneme root | Implemented |
| [US-1332](../tasks/US-1332-boards-tools-acceptance/README.md) | Acceptance run on Haiku; the two `qa/surfaces/` files; six tools marked retirable, `execute_tool` withheld | Implemented |

US-1325 → US-1327 (boards) and US-1328 → US-1329 (tools) are two independent chains; US-1330 and
US-1331 are independent of both. US-1332 closes and is the gate for every retirement marking.

## Per-surface checklist

Every task follows the roadmap's seven steps
([agent-transparency-roadmap.md](../agent-transparency-roadmap.md), *Per-surface checklist*):
descriptor next to the model; a curated `elements` list with a purpose line and a `data-name` each;
actions as methods with `caution` where they write; the dialogs and menus the surface raises named in
`$help`; `restricted()` where privacy or trust applies; scenarios in `qa/surfaces/`; and only then
the tool marking.

Three additions specific to this epic:

8. **The absent-value audit** (decision 9). For every getter the plan adds, the review states what it
   returns when there is no manifest / no connection / no selection, and confirms that value is
   `undefined`.
9. **The trust audit** (decision 5). For every action the plan adds, the review states whether the
   equivalent user action shows a dialog, and confirms the path shows the same one.
10. **The secret audit** (decision 5). For every surface holding credentials — toolset `.env`, board
    vars, MCP stdio commands, Mneme config — the plan lists which fields are secret, confirms no
    member accepts one, and states whether a path beside the facade already returns the value.

## Retirement plan for the seven tools

Each is marked retirable in US-1332 only when every row below has been exercised **live through
`call`** — not reasoned from the routing code (principle 3, and the `open_url` correction).

| Tool | Capability | Replacement path | Verified by |
|---|---|---|---|
| `create_board` | scaffold blank board | `boards.createBoard(name, dir)` | US-1326 |
| `create_board` | `demo: true` branch | `boards.createDemoBoard(name, dir)` | US-1326 |
| `create_board` | returns `{ boardRoot }` | same return | US-1326 |
| `open_board` | open/reuse tab, activate | `boards.openBoard(root)` | US-1326 |
| `open_board` | returns `{ opened, pageId, title }` | return carries the page id | US-1326 |
| `open_board` | untrusted board prompts the user | trust dialog unchanged; facade reports the state | US-1325 |
| `board_refresh` | reload the board's frame | `pages[i].editor.reload()` (decision 2) | US-1325 |
| `board_refresh` | wait for main-frame load, `frameReady` | same wait, **moved** not reimplemented | US-1325 |
| `board_refresh` | default to the active board | `page.editor.reload()` | US-1325 |
| `search_tools` | empty query → full id+description listing | `tools.search()` | US-1328 |
| `search_tools` | `select:<toolset>/<tool>` exact lookup | `tools.search("select:…")`, or `tools.toolsets[…]` | US-1328 |
| `search_tools` | ranked term match, `maxResults` | `tools.search(query, maxResults)` | US-1328 |
| `search_tools` | env var **names** only | same, values never returned | US-1328 |
| `execute_tool` | run by id with stdin JSON args | `tools.execute(toolId, args)` | US-1328 |
| `execute_tool` | success `{ ok, result \| resultText, logs, durationMs }` | same shape | US-1328 |
| `execute_tool` | failure `{ ok:false, error, exitCode, stderr, toolsetRoot }` | same shape (decision 6) | US-1328 |
| `refresh_toolset` | refresh the registry | `tools.toolsets.refresh()` | US-1328 |
| `refresh_toolset` | `path` argument | **no equivalent needed** — the tool takes `path` but ignores it for scoping and refreshes everything (`tool-commands.ts:91-112`). A per-toolset `tools.toolsets[i].refresh()` is added only if the registry can genuinely scope; otherwise the whole-registry call is the honest answer and the argument is dropped | US-1328 |
| `refresh_toolset` | `{ name, valid, errors, toolCount }` summary | same shape | US-1328 |
| `create_toolset` | scaffold folder + starter manifest | `tools.createToolset(name, dir)` | US-1328 |
| `create_toolset` | **user confirmation prompt** | same dialog, never bypassed (decision 5) | US-1328 |
| `create_toolset` | `{ registered: false }` on decline, re-offerable | same distinction in the return | US-1328 |
| all seven | `windowIndex` targeting | `windows[i].<path>` | US-1332 |

Nothing is deleted in this epic. On completion the roadmap's epic table gains a ✅ and the seven
rows of the tool→path map are marked retirable with the date, including the two spelling deviations
(decisions 1 and 2). `src/main/mcp/tools/board-tools.ts` and `agent-tools.ts` are not touched.

If any row cannot be reached by a Haiku agent with `call` alone, **that tool's marking is withheld**
and the row stays unmarked — exactly as `open_url` was withheld in EPIC-086. A tool is never marked
on the strength of a table.

## Abort criteria

Stop the epic and record why, rather than pushing through, if any of these appear:

1. **A path would grant trust or registration without the user's dialog** (decision 5). Not a
   trade-off — the member is dropped and the tool's marking withheld.
2. **A surface's model cannot answer its own state without reaching into a view.** EPIC-086's
   `data-part` DOM-query precedent: a facade that reads the DOM to report model state works in a demo
   and fails silently when the view changes. If there is genuinely no model-side answer, the facade
   stops at `elements` and says so in `$help` rather than faking it.
3. **`reload()` cannot reproduce `board_refresh`'s frame-ready wait** from the facade's position in
   the tree. Then `board_refresh` is not marked retirable and the wait keeps its current home; the
   facade still gets the rest of its members.
4. **A secret cannot be withheld without breaking the surface.** Withholding wins; the member is
   dropped.
5. **Encoding damage from a delegated edit** that a mechanical repair does not fully reverse. Stop,
   revert the task's commit, and re-delegate with `apply_patch` only.

## Needs user check

1. **`app.boardVars.get()` returns secret values to an agent with no restriction (pre-existing, not
   this epic's).** Found during US-1327's secret audit. The board-vars store schema explicitly holds
   connection strings, API keys and passwords (`src/renderer/api/board-vars/types.ts:4-17`), and
   `boardVars.get(namespace, name, env)` returns a stored value through the ordinary `call` tree
   (`api/board-vars/admin-api.ts:36-59`); `list()` correctly returns names only.
   **Assumption taken:** out of scope here. US-1327 adds no second path and no board-vars node, and
   the epic's rule that a member must never *accept* a secret is honoured throughout. But whether an
   agent should be able to *read* a stored credential at all is a user-owned decision with a blast
   radius wider than a descriptor task, and it predates this epic. Worth deciding alongside
   EPIC-087's Needs-user-check 1 (the REST page-level boundary), since both are the same question:
   where does the boundary live when the value is already reachable by another path?

2. **`execute_tool`'s retirement marking is withheld pending one call from you (US-1332).** The
   replacement `tools.execute(toolId, args)` is implemented and behaves correctly on everything that
   could be tested: it throws on an unknown id with the valid list and spawns no process, and the
   legacy tool still returns its structured `ok:false` unchanged. What could **not** be verified is a
   tool actually running through the path, because all three registered toolsets on this machine call
   live company services with your credentials (two return PHI), and registering a harmless scratch
   toolset needs a click on the "Register this toolset?" dialog.
   **Assumption taken:** that click was deliberately not taken — an agent answering its own trust
   prompt would defeat the property this epic spent its effort defending, and a marking bought that
   way would be worthless.
   **To finish it:** run any tool you are comfortable running, e.g.
   `call path: "tools.execute" args: ["<toolset>/<tool>", { … }]`, and check the result carries
   `ok`, `logs`, `durationMs` and — on a failure — `error`, `exitCode`, `stderr` and `toolsetRoot`.
   If it matches `execute_tool`, mark its row retirable in the roadmap. A scaffolded, unregistered
   probe toolset is already at
   `%TEMP%\claude\C--projects-persephone b49c25-e41e-4c5b-b3a8-2bb110bdfc80\scratchpad	oolsets\epic088-probe`
   with an `echo.js` example tool, if you would rather register that than use a real one.

## Notes

### 2026-09-06 — epic created

Scope verified against the source before the tasks were written. Three findings changed the plan
from what the roadmap's one-line entry implied:

- The roadmap's `toolsets.*` spelling collides with the root name `tools` that has been **reserved
  for this epic since EPIC-083** (`ai-vision/root.ts:31`). Decision 1 takes the reserved name.
- `board_refresh` is **page-scoped** in every detail — `pageId` argument, active-board default,
  frame-ready wait — so the roadmap's `boards.refresh()` would have had to invent "which board".
  Decision 2 puts it on the board page facade instead.
- `create_board` and `open_board` are **already answered** by existing, well-described `boards`
  members. What `boards` actually lacks is enumeration: fourteen members that all take a board root
  path, and no way to discover one. That reframes US-1326 from "add two paths" to "make the
  namespace usable", which is a larger and more useful task.

Also verified: six of the seven surfaces have **no facade at all** — only `mcp-view` has one, and it
describes the connection while saying nothing about the three panels the user reads. This epic is
therefore construction rather than annotation, as EPIC-087 was.
