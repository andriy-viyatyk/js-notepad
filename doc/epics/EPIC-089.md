# EPIC-089: The browser and the app window through `call`, and the retirement of fifteen tools

## Status

**Status:** Active
**Created:** 2026-09-06
**Started:** 2026-09-06
**Roadmap:** [agent-transparency-roadmap.md](../agent-transparency-roadmap.md), epic 6 of 7

## Overview

Every surface epic before this one was *construction*: a screen the agent could not see, and a
facade written to make it visible. This epic is not. The automation layer already exists, it is
good, and it already drives all three hosts the roadmap asks for — a browser page, a board frame,
and Persephone's own window. `src/renderer/automation/` holds a Playwright-compatible command set
over one adapter interface (`IBrowserTarget`, `automation/types.ts:12`), with three implementations:
`BrowserTargetModel` (`editors/browser/BrowserTargetModel.ts:10`), `BoardTargetModel`
(`editors/board/BoardTargetModel.ts:40`) and `AppTargetModel` (`automation/AppTargetModel.ts:36`).
The accessibility snapshot merges cross-origin iframes and mints frame-scoped refs; navigation uses
a two-phase wait; text input works around a documented Electron webview limitation; a privacy guard
refuses private pages.

None of that is missing. What is missing is that **only one of the three hosts is reachable from
`call`, and the one that is reachable cannot use the refs its own snapshot produces.**

That is the whole epic, and it is worth stating precisely because the roadmap's one-line entry
implies otherwise.

### What is already there

- `pages[i].editor` on a browser page **already returns a described facade**: `BrowserEditorFacade`
  (`src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:61`, 343 lines), registered at
  `PageWrapper.ts:102` for `browser-view`, with a hand-written 29-member `aiVision` descriptor
  (`:18-47`) covering navigate/back/forward/reload, tabs, `evaluate`, `snapshot`, `getText` /
  `getValue` / `getAttribute` / `getHtml` / `exists`, `click` / `type` / `select` / `check` /
  `uncheck` / `clear`, `waitForSelector` / `waitForNavigation` / `wait`, and `pressKey`.
- The three targets are resolved by `getTarget()` (`automation/commands.ts:75`), with `pageId:
  "app"` explicit-only (`:105-117`) so an agent aiming at a web page cannot act on the app chrome by
  fallback.
- The privacy boundary is `src/renderer/editors/browser/agent-access.ts:18,24`
  (`agentMayAccessBrowserPage`, `privateBrowserRefusal`), already applied on three paths: automation
  (`commands.ts:169`), MCP page summaries (`api/mcp/page-commands.ts:12`) and the AiVision page node
  (`PageWrapper.ts:229,240`).

### The three gaps

1. **Ref parity.** The facade's interaction members are **selector-only**: `click(selector)`,
   `type(selector, text)`, `select(selector, value)`. Its own `snapshot()` returns Playwright-style
   refs (`[ref=e52]`, `[ref=f1-e456]`), and **nothing on the facade accepts one.** An agent that
   takes a snapshot through `call` is handed addresses it cannot use, and must reverse-engineer a
   CSS selector for a node the snapshot described by role and name. The `browser_*` tools do not
   have this problem — `refOrSelector(params)` (`commands.ts:197`) takes either. This is the single
   largest reason the tool is better than the path today, and it is the first thing to fix.
2. **Host parity.** `board-view` got a facade in US-1325 (EPIC-088) that deliberately stopped at the
   host — no snapshot, no click — and said so in its `$help`, pointing forward to this epic. The app
   window has an `IBrowserTarget` (`appTarget`, a module singleton) that **no path in the tree
   reaches at all**: `pageId: "app"` is a `browser_*` argument and nothing else.
3. **Capability parity.** Six tool capabilities have no facade member of any kind: `browser_hover`,
   `browser_take_screenshot`, `browser_network_requests`, `browser_wait_for`'s text / `textGone` /
   `time` modes, `browser_tabs`' action verbs (`new` / `close` / `select`), and `browser_close`.

And one design task, which the roadmap named in advance and which is the reason this epic is last:
**the ref lifecycle** (see decision 3).

### The tools

The roadmap says "all `browser_*` (15 tools)". **There are fourteen**, declared in one factory
(`src/main/mcp/tools/browser-tools.ts:8`) and dispatched in one switch (`commands.ts:535-551`), and
`doc/architecture/browser-editor.md:831` already says fourteen correctly:

`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_hover`, `browser_type`,
`browser_select_option`, `browser_press_key`, `browser_evaluate`, `browser_tabs`,
`browser_navigate_back`, `browser_wait_for`, `browser_take_screenshot`, `browser_network_requests`,
`browser_close`.

The fifteenth tool this epic retires is **`open_url`** (`src/main/mcp/tools/page-tools.ts:95`),
moved here wholly from EPIC-086 (roadmap, *The `open_url` correction*). Fifteen is the right total;
the composition in the roadmap table is not, and is corrected when this epic closes.

## Goals

- Every interaction member on every host accepts a **ref** from the host's own snapshot, explicitly
  and without guessing, alongside the CSS selectors that exist today.
- The same automation member set is answerable on **all three hosts**: a browser page
  (`pages[i].editor`), a board page (`pages[i].editor`), and Persephone's own window
  (`window.screen` — decision 1).
- Refs are **scoped to the host that minted them**, so a snapshot of one host cannot silently
  misdirect a ref belonging to another.
- The six missing capabilities land, so no `browser_*` tool has a capability with no path.
- `open_url` is answered exactly, and the genuinely missing pipeline-routed opener is added
  alongside it under a different name (decision 6).
- `mcp.browser-tools.enabled`, its main-process mirror, its Settings row and its guide instructions
  are **deleted** — and the epic states plainly what that setting did and did not protect
  (decision 7).
- All fifteen tools have a verified replacement path and are marked **retirable**. Nothing is
  deleted; tool deletion stays EPIC-090's.
- `qa/surfaces/editors/browser.md` exists, covers all three hosts, and passes on Haiku with `call`
  alone.

## Design decisions

### 1. The app-window node is `window.screen`, not `window.ui`

The roadmap left the name to this epic. **`window.ui` is rejected**: the root already has a `ui`
node whose summary is *"Dialogs, notifications, progress overlays, screen locks — and ui.elements,
which names the on-screen shell controls and what each is for"* (`ai-vision/root.ts`). A second `ui`
one level down, meaning "the raw DOM of this window", makes the root hint ambiguous exactly where an
agent is deciding which of the two to open — and the root hint is the first thing every `call`
session reads.

**`window.screen`** is taken instead. `window` is already the node that owns this window
(`namespaces/window.ts` — state, sidebar, zoom, `menuBar`), `screen` is the plain word for what a
snapshot shows, and `window.menuBar` (EPIC-085) is the precedent for hanging a live sub-node there.
The two are cross-referenced in both directions, because the pair is the roadmap's own distinction:

- `ui.elements` — **curated**: the controls the shell chose to document, each with a purpose line.
- `window.screen.snapshot()` — **complete and purpose-free**: everything on screen, including what
  no descriptor has reached. `$help` on each names the other and says when to prefer it.

`attention.ts:14` currently tells an agent to reach for `browser_snapshot` / `browser_click` with
`pageId: "app"` when a blocking dialog has no `dialogs` node. That sentence is repointed at
`window.screen` in US-1337 — it is the one place in the tree that already advertises the app-window
host, and leaving it naming a tool this epic retires would fail the acceptance run by construction.

### 2. One implementation, three hosts — by moving the command bodies, not copying them

`automation/commands.ts` is where the behaviour actually lives: the two-phase navigation wait
(`:207`, `:401`), the overlay hint (`:186`), the visible-element preference and native-setter fill
(`input.ts:316`), the `StaticText` ref coercion (`ref.ts:121-125`), the board readiness gate
(`BoardTargetModel.ts:123`). Every one of those is a bug fixed once, in a place with a comment
explaining why. **The facades call the same functions.** `handleBrowserCommand` (`commands.ts:520`)
keeps its dispatch table and keeps working; what changes is that each command body becomes a
function taking an `IBrowserTarget` plus typed arguments, callable from both the tool dispatcher and
a facade.

This is EPIC-087's standing rule stated for this epic: **move a handler, never reimplement it** —
and remove nothing from its original home that the original caller still needs. EPIC-087 left a
duplicate guard that broke Explorer clicks; the surface here is far larger and the same mistake is
available fourteen times over.

The shared member set (`snapshot`, `click`, `hover`, `type`, `select`, `pressKey`, `evaluate`,
`waitFor`, `screenshot`, `networkRequests`) is declared **once** as a shared descriptor fragment and
spliced into each host's `members` list, so the three hosts cannot drift in wording. The members a
host genuinely does not have are **absent from its list**, not present-and-throwing: the app window
has no navigation and no tabs (`AppTargetModel.ts:31,34` throw `NAV_MSG` / `TAB_MSG`), so
`window.screen` does not declare them, and its `$help` says where Persephone pages are opened
instead. The board host likewise omits navigation (`BoardTargetModel.ts:66-75`) but **keeps** tabs,
because a board's "tabs" are its secondary-view frames and switching one is a real action.

### 3. Refs become per-host; the module-global frame map is the defect being fixed

`automation/ref.ts:21` holds `let frameSessionMap = new Map<number, string>()` at **module scope**,
written only by `setFrameSessions()` (`:24`) from `buildSnapshot` (`snapshot.ts:67` clears it,
`:94` populates it). Frame index `1` therefore means "the first iframe of whichever host was
snapshotted most recently". Today the tools snapshot-then-act inside one command, which mostly hides
it. The moment three hosts hold refs concurrently — an agent snapshots the app window, then a
browser page, then clicks an app-window `f1-e456` — the ref resolves in the wrong CDP session. That
is a silent wrong action, which is the failure class this roadmap exists to remove.

So the store becomes **per host**: keyed by the host identity (browser page id + tab id, board page
id + frame id, the `"app"` sentinel — the same key shape `browserNetworkRequests` already builds at
`commands.ts:501`), written by the snapshot that produced it, read by the resolution of a ref handed
to *that* host's node. Main-frame refs (`e123`) are already per-session because they resolve through
the `CdpSession` the caller passes; only the frame-index map is global, so the change is contained
to `ref.ts`, `snapshot.ts` and their callers. `parseRef`'s format, the ref spelling, and both
stale-ref messages (`ref.ts:78,83`) are unchanged — an agent must see no difference except that a
ref stops being wrong.

Abort criterion 3 covers the case where iframe refs cannot be scoped without breaking the merged
snapshot.

### 4. A ref is passed as `{ ref: "e52" }`; a plain string is always a CSS selector

The tools take `{ ref?, selector? }` as separate parameters. A facade method takes positional
arguments, so the two forms must be distinguishable — and **they must not be distinguished by
guessing.** A heuristic ("looks like `e\d+`, so it is a ref") is precisely the silent-guess failure
EPIC-087's acceptance run turned up, where a node accepted a guessed value and reported success.

So: `click("#submit")` is a selector, `click({ ref: "e52" })` is a ref, and anything else throws
naming both forms. This adds no members, breaks no existing script, and leaves `IBrowserEditor`'s
existing string signatures valid. Each member's `signature` in the descriptor shows both forms, and
`snapshot`'s summary says the refs it just returned are passed this way — the one sentence whose
absence is the current gap.

### 5. HTML preview is answered by `window.screen`, not by a fourth target

The roadmap lists "board/HTML page facades" as hosts. Checking before adopting it: there are exactly
three `IBrowserTarget` implementations, and `html-view` (`register-editors.ts:155`) is not one. It
does not need to be. An HTML preview renders in an iframe **inside Persephone's own webContents**,
and the app-window snapshot already merges iframe accessibility trees under their placeholder node
with frame-scoped refs (`snapshot.ts:143-176`). So HTML preview content is reached through
`window.screen` today, for free, and a fourth target would be a second way to do the same thing with
its own bugs.

The HTML page facade's `$help` says this explicitly rather than leaving an agent to discover it, and
`qa/surfaces/editors/browser.md` carries a scenario that proves it. The roadmap's wording is
corrected when the epic closes.

One caveat to verify rather than assume: `snapshot.ts:78` skips iframes below `MIN_IFRAME_NODES`, so
a nearly empty HTML preview may not appear at all. US-1337 states the threshold and its consequence
in the facade's `$help` instead of leaving an agent to conclude the preview is blank.

### 6. `open_url` is answered by `pages.openUrlInBrowserTab`; `pages.openUrl` is an addition, not a rename

`handleOpenUrl` (`api/mcp/page-commands.ts:192-202`) calls `pagesModel.openUrlInBrowserTab(url, {
profileName, incognito, openedByAgent: true })` unconditionally and returns `{ opened, pageId,
title }`. It has no non-browser branch — the roadmap already corrected itself on this — so its exact
replacement is the member with the same name and the same meaning: **`pages.openUrlInBrowserTab`**
(`PagesModel.ts:285` → `PagesLifecycleModel.ts:865` → `editors/browser/browser-pages.ts:107`).
Renaming it to `pages.openUrl` would be a lie: the tree's stated rule is that a path has the same
name as the script API member so every hint doubles as a scripting tutorial, and `openUrl` promises
routing that `openUrlInBrowserTab` does not perform.

Two things that member must carry, both easy to lose and both load-bearing:

- **`openedByAgent: true`.** This is the provenance flag the privacy guard reads
  (`agent-access.ts:5`): a private page the *agent itself* opened stays accessible to that agent,
  and one the user opened does not. It also decides tab reuse for incognito pages
  (`browser-pages.ts:128`). A replacement path that omits it produces a page the agent just opened
  and then cannot read.
- **The page id in the return.** `open_url`'s whole ergonomic value is that the caller gets a
  `pageId` to target next.

Separately, the capability the roadmap wanted under the name `openUrl` is **genuinely missing** and
is added as its own member: **`pages.openUrl(url, options)`**, routing through the content-delivery
pipeline via `app.openRawLink(href, { editor })` (`api/app.ts:113-117`), so a URL naming an image, a
markdown file or an archive lands in the editor the pipeline chooses rather than in a browser tab.
It replaces no tool and is marked as an addition. `$help` on each names the other in one line, since
the choice between them is the only thing an agent can get wrong here.

`openRawLink` returns `Promise<void>` and the resolvers (`content/resolvers.ts:75,79,84`) route on
into `openUrlInBrowserTab` for web URLs, so whether `pages.openUrl` can report which page it opened
is an **open implementation question, not an assumption**: US-1338's plan states the answer before
it is built, and if it cannot report one, it says so in its own `$help` and `open_url`'s retirement
still rests entirely on `openUrlInBrowserTab`.

### 7. The setting is deleted — and it protected less than its wording claims

`mcp.browser-tools.enabled` (default `false`, `api/settings.ts:141`) is read in two places:
`handleBrowserCommand` (`commands.ts:524`) refuses every `browser_*` command when it is off, and
`createMcpServer` (`main/mcp/server-factory.ts:15,34`) omits the whole tool group from `tools/list`.
Its user-facing help says it controls whether an agent can "drive the built-in browser, boards, and
Persephone's own window" (`api/settings.ts:107`).

**It does not, and has not since `call` shipped.** `BrowserEditorFacade.snapshot()`, `.click()`,
`.evaluate()` and the rest are reachable through `call` and through `execute_script` with the
setting off — neither path passes through `handleBrowserCommand`. The real boundary is, and always
was, `agent-access.ts`. Deleting the setting therefore removes a control that reads as a privacy
switch and is not one, which is worse than removing nothing: a user who reads that row believes
something untrue.

Deleted with it: the key, default and help text (`api/settings.ts:36,107,141`), the actuation branch
and live mirror (`api/app.ts:284,329`), the Settings row and toggle
(`editors/settings/sections/McpSection.ts:214,241`, `McpSectionModel.ts:113`), the settings-catalog
entry (`ai-vision/namespaces/settings.ts:90`), the guide instructions
(`assets/mcp-res-browser.md:11,149`, `assets/mcp-res-ui.md:214,223`), and the user-doc rows
(`docs/api/settings.md:68,87`, `docs/mcp-setup.md:251`). The main-process gate goes; the group is
listed unconditionally.

**The consequence is stated rather than hidden:** until EPIC-090 deletes them, the fourteen
`browser_*` tools appear in every agent's manifest by default, where today they appear only for
users who opted in. That is a context cost, not a privilege change — the privacy guard is untouched
and every command still passes it. The user directed this deletion explicitly (roadmap, 2026-09-05)
and the exposed window is one epic wide.

### 8. Privacy is `agent-access.ts`, and every new path must go through it — including the new one

Three rules, all existing, all easy to lose while adding hosts:

1. **Private browser pages.** Incognito and Tor pages the user opened are refused to `browser_*`
   (`commands.ts:169`) and to `call` (`PageWrapper.ts:229,240`); a private page the *agent* opened
   is accessible to that agent, and the provenance is not persisted, so a restored page is private
   again.
2. **The app window is refused while the active page is private** (`commands.ts:106-116`). An app
   snapshot includes the active page's content, so the app host would otherwise be a bypass.
   `window.screen` is a **new code path** and must apply the same check — this is the single most
   likely privilege regression in the epic and is checked by hand in US-1337's plan review, not left
   to the build.
3. **A refusal names the boundary** and suggests what to do instead (`privateBrowserRefusal`).
   Refusals are not silent empties.

Note that `restricted()` today lives on the **page** node, not on `BrowserEditorFacade` — only
`BoardEditorFacade.ts:83,178` declares one. US-1335 states which node carries the gate for each new
member rather than assuming the page-level gate covers a facade member reached by a longer path.

Secrets follow EPIC-087 decision 7 unchanged: no member *accepts* a secret, and returning one is
allowed only where the existing surface already exposes it — `snapshot` and `evaluate` already
return page content on the tool path, so they do here too. A password field's snapshot line carries
its role and name, never its value; US-1335's plan states that as a verified fact, not an
assumption.

### 9. Browser page *chrome* is `elements`; browser page *content* is the snapshot

A browser page has two layers of UI and an agent will confuse them. The address bar (`url-input`,
`url-navigate`, `url-bookmark-toggle`), the toolbar buttons (`toolbar-back`, `toolbar-forward`,
`toolbar-reload`, `toolbar-home`, `toolbar-bookmarks`, `toolbar-more`, `toolbar-devtools`,
`toolbar-close`, and the Tor-only `toolbar-tor-info`), the internal tab strip (`tabs-panel-host`)
and the popup-blocked bar are **Persephone's** controls; they already carry `data-name`s
(`BrowserView.ts:274-335,418-451`) and they belong in the facade's curated `elements` list, scoped
by `pageScopeSelector` (`ai-vision/page-elements.ts:6-8`). Everything inside the webview is the
**web page**, reachable only through `snapshot()` and never present in `elements`.

The 73 `name:` props under `editors/browser/` are an **upper bound**, as in every previous epic —
they include structural roots, splitters and download/bookmark popups that are not on screen by
default. US-1335 curates down from that list and states what it dropped and why. The facade's
`$help` states the chrome/content split in one sentence, because an agent looking for the address
bar in a `snapshot()` result finds nothing and has no way to learn why.

### 10. `strictNullChecks` is off, so "returns `undefined` when unavailable" is a review obligation

Carried verbatim from EPIC-086 → EPIC-088. Every getter added here — a URL with no loaded page, a
title before load, an active tab on a host that has none (`AppTargetModel` fabricates one; the board
may have none), a screenshot on a detached target — returns `undefined` when absent, never `false`,
`0`, `""` or `null`, and **absent keys are omitted from `call` answers rather than assigned
`undefined`**, which crosses the MCP boundary as `null` (EPIC-088's finding). Checked by hand in
every plan review; the compiler will not.

### 11. The three element traps, carried forward

Checked in every plan review, because a green build catches none of them:

1. **UIKit deletes `data-name`** when a later `update()` omits the `name` prop — a control named
   only on mount is stripped on the first re-render and can never resolve.
2. **The highlight overlay rings only the first match** unless `all: true`.
3. **Move a handler, never reimplement it** — decision 2, and the largest risk in this epic.

And: **a node never silently accepts guessed input.** A malformed ref, an unknown tab id, an
unsupported wait mode — each validates and throws with the valid forms listed.

### 12. Facade registration is unchanged; `.d.ts` stays generated

A new surface is a class in `src/renderer/scripting/api-wrapper/`, an entry in `FACADE_FOR_EDITOR`
(`PageWrapper.ts:65-90`), an addition to the `EditorFacade` union and to `IEditorFacade` in
`src/renderer/api/types/`, and a **regenerated** `assets/editor-types/*.d.ts`. Those copies are
produced by `editorTypesPlugin()` and are never hand-edited.

### 13. Version stays 5.0.0; the branch keeps its name

`package.json` is already at 5.0.0. The setting deletion is recorded under **Breaking Changes** in
the `## Version 5.0.0 (Upcoming)` section of `docs/whats-new.md`; the new paths under
**Improvements**. The branch keeps its `upcoming-v4.0.24` name; renaming it is the user's to do.

### 14. Every retired tool's `mcpHint` and guide text is updated in the acceptance task

`register-editors.ts:163` points the browser editor's `mcpHint` at `open_url`, and
`assets/mcp-res-browser.md` instructs `browser_*` throughout — including the "enable it first"
preamble at `:11`. A surface that tells the agent to use the tool it replaces fails the acceptance
run by construction (EPIC-087's `log-view` correction, EPIC-088 decision 12). Hints move in the
owning task; the guide is rewritten in US-1340 once the paths are proven. The fourteen tools
themselves are **not** touched.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| [US-1334](../tasks/US-1334-ref-lifecycle/README.md) | Per-host ref stores, and the automation command bodies made callable from a facade | Implemented |
| [US-1335](../tasks/US-1335-browser-page-surface/README.md) | The browser page surface — refs, the six missing capabilities, and the chrome/content split | Planned |
| [US-1336](../tasks/US-1336-board-page-automation/README.md) | The board page host — the same member set on the board facade, with the readiness gate | Planned |
| [US-1337](../tasks/US-1337-window-screen-node/README.md) | `window.screen` — Persephone's own window as an automation host, and its privacy rule | Planned |
| [US-1338](../tasks/US-1338-page-open-url/README.md) | `pages.openUrlInBrowserTab` as `open_url`'s replacement, and `pages.openUrl` as the pipeline-routed opener | Planned |
| [US-1339](../tasks/US-1339-retire-browser-setting/README.md) | Delete `mcp.browser-tools.enabled`, its mirror, its Settings row, and its guide instructions | Planned |
| [US-1340](../tasks/US-1340-browser-acceptance/README.md) | Acceptance run on Haiku; `qa/surfaces/editors/browser.md`; fifteen tools marked retirable | Planned |

US-1334 is the foundation and blocks US-1335 → US-1337. US-1338 and US-1339 are independent of all
of them. US-1340 closes and is the gate for every retirement marking.

## Per-surface checklist

Every task follows the roadmap's seven steps
([agent-transparency-roadmap.md](../agent-transparency-roadmap.md), *Per-surface checklist*):
descriptor next to the model; a curated `elements` list with a purpose line and a `data-name` each;
actions as methods with `caution` where they write; the dialogs and menus the surface raises named
in `$help`; `restricted()` where privacy applies; scenarios in `qa/surfaces/`; and only then the
tool marking.

Four additions specific to this epic:

8. **The absent-value audit** (decision 10). For every getter, the plan states what it returns when
   there is no loaded page / no active tab / no attached session, and confirms that value is
   `undefined` and omitted from the answer.
9. **The privacy audit** (decision 8). For every path added, the plan names which of the three rules
   applies and cites the guard call that enforces it. A path with no citation is not implemented.
10. **The ref audit** (decisions 3 and 4). For every member that takes a target, the plan states
    which host's ref store resolves it, and that a plain string is a selector.
11. **The move audit** (decision 2). For every command body reused, the plan names the original
    function, states that the tool dispatcher now calls the same one, and confirms no second copy
    exists.

## Retirement plan for the fifteen tools

Each is marked retirable in US-1340 only when every row has been exercised **live through `call`** —
not reasoned from the routing code (principle 3, and the `open_url` correction that principle
caught).

| Tool | Capability | Replacement path | Verified by |
|---|---|---|---|
| `browser_snapshot` | accessibility snapshot with refs | `<host>.snapshot()` on all three hosts | US-1335/6/7 |
| `browser_snapshot` | merged iframe subtrees, `f1-e…` refs | same, per-host ref store | US-1334 |
| `browser_snapshot` | overlay hint line (`commands.ts:186`) | same body, moved | US-1334 |
| `browser_click` | by ref | `<host>.click({ ref })` | US-1335 |
| `browser_click` | by selector | `<host>.click(selector)` (exists) | US-1335 |
| `browser_click` | `StaticText` ref coercion | same body, moved | US-1334 |
| `browser_hover` | hover by ref or selector | `<host>.hover(...)` — **new member** | US-1335 |
| `browser_type` | fill, `slowly`, `submit` | `<host>.type(...)` (exists; gains ref form) | US-1335 |
| `browser_type` | visible-match preference, native-setter fill | same body, moved | US-1334 |
| `browser_select_option` | `value` and `values[]` alias | `<host>.select(...)` | US-1335 |
| `browser_press_key` | compound keys | `<host>.pressKey(...)` (exists) | US-1335 |
| `browser_evaluate` | `expression` + `function` alias, auto-invoke | `<host>.evaluate(...)` (exists) | US-1335 |
| `browser_navigate` | navigate + two-phase wait | `pages[i].editor.navigate(...)` + the moved wait | US-1335 |
| `browser_navigate_back` | back + two-phase wait | `pages[i].editor.back()` + the moved wait | US-1335 |
| `browser_wait_for` | `text` / `selector` | `<host>.waitFor({ text \| selector })` | US-1335 |
| `browser_wait_for` | `time` (seconds) / `textGone` aliases | same member, both modes | US-1335 |
| `browser_tabs` | `list` | `pages[i].editor.tabs` (exists) | US-1335 |
| `browser_tabs` | `new` / `close` / `select` | `addTab` / `closeTab` / `switchTab` (exist) | US-1335 |
| `browser_take_screenshot` | PNG of the host | `<host>.screenshot()` — **new member** | US-1335 |
| `browser_network_requests` | recorded request list | `<host>.networkRequests()` — **new member** | US-1335 |
| `browser_close` | closes the active **browser tab** (`target.closeTab()`, `commands.ts:509`) — not the Persephone page | `pages[i].editor.closeTab()` (exists) | US-1335 |
| all fourteen | board target, `ensureReady()` gate | same members on the board facade | US-1336 |
| all fourteen | `pageId: "app"` target | `window.screen.<member>` | US-1337 |
| all fourteen | privacy refusal for private pages | `agent-access.ts`, unchanged, cited per path | US-1335/6/7 |
| all fourteen | `windowIndex` targeting | `windows[i].<path>` | US-1340 |
| `open_url` | open/reuse a browser tab for a URL | `pages.openUrlInBrowserTab(url, options)` | US-1338 |
| `open_url` | `profileName`, `incognito` | same options | US-1338 |
| `open_url` | `openedByAgent` provenance | same flag, set on the path (decision 6) | US-1338 |
| `open_url` | returns `{ opened, pageId, title }` | return carries the page id | US-1338 |

Nothing is deleted in this epic **except the setting** (decision 7), which is not a tool. On
completion the roadmap's epic table gains a ✅, the `browser_*` and `open_url` rows are marked
retirable with the date, and the "15 tools" count and the "HTML page facade" wording are corrected.

If any row cannot be reached by a Haiku agent with `call` alone, **that tool's marking is withheld**
and the row stays unmarked — as `open_url` was withheld in EPIC-086 and `execute_tool` in EPIC-088.
A tool is never marked on the strength of a table.

## Abort criteria

Stop and record why, rather than pushing through, if any of these appear:

1. **A new path reaches a private page, or the app window while a private page is active.** Not a
   trade-off — the member is dropped and the marking withheld (decision 8).
2. **A command body ends up duplicated** rather than moved, so the tool and the path can diverge
   (decision 2). Revert and redo; two copies of the two-phase navigation wait is a defect that
   surfaces months later.
3. **Iframe refs cannot be scoped per host** without breaking the merged snapshot (decision 3). Then
   the ref store stays global, `f…-e…` refs are documented as valid only until the next snapshot of
   *any* host, and the snapshot rows keep their markings while the iframe rows are withheld.
4. **The setting cannot be removed without changing what a *connected* agent already sees
   mid-session** in a way that breaks it. Then the deletion moves to EPIC-090 with the tools it
   gates, and the epic records why.
5. **`pages.openUrl` cannot route through the pipeline** from `pages`' position (decision 6). It is
   dropped; `openUrlInBrowserTab` alone carries `open_url`'s retirement and the roadmap note stands.
6. **Encoding damage from a delegated edit** that a mechanical repair does not fully reverse. Stop,
   revert the task's commit, and re-delegate with `apply_patch` only.

## Needs user check

*(none yet — added as they arise)*

## Notes

### 2026-09-06 — epic created

Scope verified against the source before the tasks were written. Four findings changed the plan from
what the roadmap's one-line entry implied:

- **There are fourteen `browser_*` tools, not fifteen** (`browser-tools.ts:8`, `commands.ts:535-551`).
  The fifteenth tool this epic retires is `open_url`.
- **The browser page already has a full, described facade.** `BrowserEditorFacade` predates this
  programme and carries 29 described members. This epic is not construction, as EPIC-087 and
  EPIC-088 were; it is **parity** — refs, hosts, and six missing capabilities.
- **The app window already has an `IBrowserTarget`** (`appTarget`, `AppTargetModel.ts:36`), complete
  with its own privacy rule and a CDP sentinel that resolves to the calling window. Nothing in the
  tree reaches it. `window.screen` is a node over an adapter that already works, not new automation.
- **`mcp.browser-tools.enabled` never gated `call` or `execute_script`.** The facade's `snapshot()`
  and `click()` work with the setting off. That makes the deletion the roadmap asked for a
  *correction* rather than a loosening, and decision 7 says so in the terms a user would need to
  hear it.

The ref lifecycle the roadmap flagged as "a design task before it is a descriptor task" is real and
narrower than feared: main-frame refs are already per-session, and only `ref.ts:21`'s module-level
`frameSessionMap` is global. That is US-1334, and it is the epic's first task because the other
three host tasks all mint refs.
