# EPIC-085: The application shell through `call` — windows, Menu Bar, sidebar panels, Settings

## Status

**Status:** Completed
**Created:** 2026-09-05
**Started:** 2026-09-05
**Completed:** 2026-09-05
**Roadmap:** [agent-transparency-roadmap.md](../agent-transparency-roadmap.md), epic 2 of 7

## Overview

EPIC-084 built the two protocols and proved them on one surface — the header strip's 20
`elements`. This epic applies them to the rest of the **application shell**: the parts of the window
that are there no matter which page is open. Four surfaces, in the order an agent meets them:

| Surface | Node | Today |
|---|---|---|
| Windows and app-level facts | `windows`, root | `list_windows`, `open_window`, `get_app_info` |
| Menu Bar (the Persephone glyph's sidebar) | `window.menuBar` | nothing — invisible to an agent |
| Per-page sidebar panels (secondary views) | `page.panels` | nothing — invisible to an agent |
| The Settings page | `settings` catalog + `settings.highlight(key)` | `settings.get/set` only, no UI |

The tab strip is deliberately **not** in that table. `pages` already carries every tab action a user
has — `showPage`, `moveTab`, `pinTab`, `group`, `closePage` — and EPIC-084 gave the active tab's
controls to `ui.elements`. What this epic owes the tab strip is coverage in `qa/surfaces/shell.md`,
not new API.

The gap this epic closes is narrower than the surface list suggests, and it is worth naming
precisely: **an agent can change the app but cannot see its chrome.** It can set a setting it cannot
find on screen, open a sidebar panel it cannot name, and toggle a Menu Bar whose contents it has
never been told about. Everything here is about the second half — seeing, naming, and pointing.

## Goals

- Every field `list_windows`, `open_window` and `get_app_info` return is reachable by a path, and
  each one lives where it belongs rather than in a bag named after a retired tool.
- The Menu Bar and the sidebar panel stack are nodes: what they hold, what is open, and how to
  open one — with `elements` and `highlight` so the agent can *show* the user, not only describe.
- A settings question is answerable in both directions: "change X" (already `settings.set`) and
  "where do I change X" (new — the Settings page's row, highlighted).
- Those three tools are marked **retirable** in the roadmap. Nothing is deleted; deletion is
  EPIC-090's job after the call-only flag passes.

## Design decisions

1. **`get_app_info`'s fields are redistributed, not rehomed as a lump.** The tool returns nine
   unrelated things (`src/main/mcp/tools/page-tools.ts:88`). `version`, `pageCount` and
   `activePageId` are already the root's `summarize()`. The rest go where the thing they describe
   already lives: browser profile names and the default profile under the browser/profiles surface,
   `resourcesDir` and `demoBoardDir` under `shell` or `main` (whichever actually owns the value —
   the task decides against the source), `boardsAssetsBaseUrl` / `boardsManifestUrl` under `boards`,
   next to the catalog they address. A path is a place, and an agent looking for the board catalog
   should find it under `boards`. No `appInfo` node is created.

2. **`windows` and `open_window` are already done; this epic proves it rather than rebuilds it.**
   `WindowNode` (`src/main/mcp/ai-vision/main-root.ts:104`) already exposes `index`, `status`,
   `pageCount`, `activePageId`, `pages` and `open()`/`focus()`, and `windows[i].pages[j]` forwards
   into the live window. The task is a **field-by-field parity audit** against `list_windows`'s
   output — including the browser-page identity fields — plus whatever is missing, and then the
   roadmap entry. If parity already holds, the correct outcome is a short task that says so.

3. **The Menu Bar is a node on `window`, not on `ui`.** `window` already owns
   `menuBarOpen`, `toggleMenuBar` and `openMenuBar(panelId)`
   (`src/renderer/scripting/ai-vision/namespaces/window.ts:11-13`), so `window.menuBar` is where an
   agent that found one will find the rest. It carries: `isOpen`, `open(folder?)`, `close()`, the
   list of category folders actually present (Open Tabs, Recent Files, Tools & Editors, Script
   Library, plus the user's configured folders from `menuFolders`), which one is selected, and its
   own `elements` for the ten `menubar-*` controls already in
   [ui-element-contract.md](../architecture/ui-element-contract.md).

4. **The Menu Bar backdrop is in the DOM when closed** (`MenuBarView.ts:176-179`, `display: none`
   while closed — the contract doc flags this explicitly). `elements` measures visibility with
   `offsetParent`, which correctly reports `false` for a `display: none` subtree, so this needs no
   special case — but `isOpen` must read the model, never the element, and the QA file gets a
   scenario that would catch a regression to element-presence.

5. **Sidebar panels hang off the page, because that is what owns them.** `PageModel` holds
   `secondaryViews[]`, `secondaryViewsModel` and `activePanel`
   ([secondary-views.md](../architecture/secondary-views.md)), so the node is `page.panels`:
   the panels this page currently contributes (id, label, which editor owns it, expanded or
   collapsed), `expand(panelId)`, and the stack's open/width state. Two facts
   from the architecture doc must survive into the descriptor rather than be discovered by an agent
   the hard way: a panel's rendered identity is the composite `editorId::panelId`
   (`panel-key.ts`) while the model-facing API takes the **bare** id — so the node's methods take
   bare ids and it says so; and panels appear and vanish as the page navigates, so the list is live,
   never cached.

   **Revised 2026-09-05, during US-1305's review.** `close(panelId)` is NOT part of this epic. The
   user's own close differs by registration pattern — `ArchiveSecondaryView.onCloseClick` calls
   `removeSecondaryView`, which disposes the editor, while a Pattern A panel must not be disposed
   the same way — so one uniform close would produce a state no user gesture produces. It belongs
   to each editor's surface in epics 3-5, which know what closing means for their own panel. The
   node ships `items`, `isOpen`, `width`, `expand(panelId)`, `toggleSidebar()`, `elements` and
   `highlight`.

6. **The Settings catalog lives on the `settings` node, not on a page facade.**
   `settings.get/set` stays the way to change configuration. The catalog answers the other
   question: which sections and rows exist, which row corresponds to a setting key, and
   `highlight(key)` to point at it. This is the EPIC-084 lesson applied before it costs a QA run —
   `settings.set` was never the wrong answer to "change X", so the catalog **cross-references**
   from `settings.set` rather than competing with it.

   **Revised 2026-09-05, during US-1306's investigation.** This decision originally specified
   `pages[i].asSettings()`, a facade over the Settings *page*. That is wrong for the question that
   motivates it: an agent asked "where do I change X" does not have the Settings page open, and a
   facade reachable only through an open page cannot answer it. The catalog therefore hangs off
   `settings`, which is always reachable, and `highlight(key)` opens or activates the Settings page
   itself before drawing the overlay. No `asSettings()` facade is added. The investigation also
   found that `[data-name]` on a section root is not enough: `settings.css` gives sections
   `display: contents`, so the root has no client rectangle and the highlight overlay would report
   `found: true` while drawing nothing — the same silent-success failure this epic keeps meeting.

7. **Each node carries its own `elements`; there is no growing `ui.elements`.** `ui.elements` stays
   the *header strip* — the chrome with no other owner. Menu Bar controls belong to
   `window.menuBar`, and the Settings section selectors to the `settings` catalog. The sidebar
   selectors (`secondary-views-container`, its stack and its splitter) went to `page.panels`, whose
   state is exactly what explains their presence. The rule the surface epics inherit: **an element
   list belongs to the node whose state explains why the element is or is not there.**

8. **`ui-element-contract.md` is the contract, the descriptor is the consumer.** Where a control in
   the doc has no `data-name` yet, add it to the view; where the descriptor needs a control the doc
   does not list, add the row. Neither is allowed to drift, and the doc's "editor internals have no
   consumer" rule stays reversed exactly as far as the shell — editor internals are epics 3–5.

9. **Retirable, not retired.** This epic ends with `get_app_info`, `list_windows` and `open_window`
   marked retirable in the roadmap's tool→path map and nothing removed. The `ui` guide's
   script-based highlight instructions (`assets/mcp-res-ui.md`) are likewise marked, not cut —
   EPIC-090 deletes on the strength of the call-only run, not on this epic's word.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-1303 | [`windows` parity audit and the redistribution of `get_app_info`'s fields](../tasks/US-1303-windows-and-app-info/README.md) | Reviewed |
| US-1304 | [`window.menuBar` — folders, selection, open/close, and the Menu Bar's `elements`](../tasks/US-1304-menu-bar-node/README.md) | Reviewed |
| US-1305 | [`page.panels` — the sidebar panel stack, bare-id `expand`, and its `elements`](../tasks/US-1305-page-panels-node/README.md) | Reviewed |
| US-1306 | [The `settings` catalog — sections, rows, and `highlight(key)`, cross-referenced from `settings.set`](../tasks/US-1306-settings-surface/README.md) | Reviewed |
| US-1307 | Shell acceptance run on Haiku via `mcp-test-agent-call`; extended [`qa/surfaces/shell.md`](../../qa/surfaces/shell.md) and added [`windows.md`](../../qa/surfaces/windows.md); the three tools marked retirable | Reviewed |

US-1303 is independent and can go first or last. US-1304 and US-1305 are independent of each other.
US-1306 depends on nothing but reads best after US-1304 (both answer "where is this?"). US-1307
closes the epic and is the gate for decision 9.

## Acceptance

- Every field of `list_windows` and `get_app_info` has a path, and a Haiku agent with `call` alone
  answers "how many windows are open and what is in the second one" without either tool.
- "Open the Menu Bar and tell me what's in it" is answered from `window.menuBar`, listing the
  folders actually present — not a hardcoded four.
- "What panels does this page have open?" is answered from `page.panels` on a page with an Explorer
  or archive tree, and `expand` takes the bare panel id.
- "Where do I turn off the MCP server?" points at the Settings row through a highlight, and
  "turn off the MCP server" still goes to `settings.set` — neither answer displaces the other.
- Typecheck, lint, and production build pass; no tool removed and no `data-type` renamed.

## Notes

### 2026-09-05 — implementation and plan review

All five tasks implemented (Codex, from reviewed plans). The plan-review pass earned its cost five
times; the findings worth carrying forward:

- **US-1303** proposed adding the legacy `type` field to the live `PageWrapper` as well as the
  persisted window node. `EditorType` is referenced in exactly one place outside its own
  declaration (`IEditorState.type`), nothing consumes it, and no path takes it as an argument — so
  on the live page it would be an inert second classifier beside the actionable `editor`, on the
  tree's most-visited node. It stays on the persisted path only, where `editor` is optional and
  `type` is genuinely the only classifier available.
- **US-1304** planned `open(folderId)` to preserve the legacy lenient behaviour and silently ignore
  an unknown id. Made strict, with the valid-id list in the error, on EPIC-084's S.5 precedent.
- **US-1305** planned a `close(panelId)` that mutated the owning editor's `secondaryView` array.
  The user's own close differs by registration pattern — `ArchiveSecondaryView.onCloseClick` calls
  `removeSecondaryView`, which disposes — so one uniform close would produce a state no user
  gesture produces. Cut from the epic (decision 5, revised).
- **US-1305** then answered a follow-up by proposing `toggleNavigator()` as "the existing
  whole-sidebar gesture". It is only half that: its second branch *constructs an `ExplorerEditor`*,
  and it silently no-ops when it cannot derive a root path. Replaced with a flip-only member.
- **US-1306** overturned decision 6 on the evidence, correctly: a page facade cannot answer "where
  do I change X" for an agent that does not have the page open. The catalog moved to `settings`.

### 2026-09-05 — what the QA runs changed

Every acceptance criterion passes. The runs were again worth more than the passes, and this epic's
recurring theme is one thing: **silent success**. Four separate instances, found four different
ways:

1. `menuBar.open("Recent Files")` would have accepted a label and changed nothing — caught in plan
   review.
2. `toggleNavigator()` silently no-ops when it cannot derive a root path — caught by verifying a
   claim rather than accepting its citation.
3. `page.panels.toggleSidebar()` returned success while `PageModel`'s **mandatory-open clamp**
   (`PageModel.ts:533-536`) rewrote `open: false` back to `true`. It now checks `sidebarMandatory`
   and explains — caught in live testing.
4. `settings.highlight(key)` would have reported `found: true` and drawn **nothing**, because
   `settings.css` gives section roots `display: contents` and the overlay only rings an element
   with a client rectangle. Caught by reading the overlay's hit-testing during investigation — the
   only one nobody had to hit at runtime.

**A `found: true` is not proof a highlight was visible, and a `caution` is not a guard.** Both are
recorded in `qa/surfaces/shell.md` for the four surface epics that follow, which will all hang
`elements` off editor markup nobody wrote with highlighting in mind.

The fifth instance was the acceptance run itself, and it took the app down. Asked only **where** the
MCP server is turned off, the Haiku agent found the control the intended way in three calls,
highlighted it correctly — and then called `settings.set("mcp.enabled", false)`, disabling the
server it was talking through. Recovery needed a hand-edit of `appSettings.json`, because once MCP
is off there is no route back in through MCP. `settings.set` now **refuses** the self-severing keys
when reached through `call` (`app.settings.set` is untouched), and its summary states the constraint
in situational words rather than relying on the generic caution that had failed to stop it. This is
EPIC-084's D.1 finding recurring in a second surface: the constraint has to be where the model is
deciding.

### 2026-09-05
- Created from the roadmap, after EPIC-084 closed. Two of EPIC-084's QA findings are written into
  the design here rather than being rediscovered: put the constraint before the call to action
  (attention blocks), and cross-reference from the node the agent lands on instead of redirecting
  it from the root (decision 6).
- Scope check against the source before writing: `pages` already covers the tab strip's actions and
  `WindowNode` already covers most of `list_windows`, so the epic is smaller than the roadmap's
  surface list reads. The genuinely absent surfaces are the Menu Bar, the sidebar panel stack and
  the Settings page — all three currently invisible to an agent.
