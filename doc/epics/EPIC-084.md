# EPIC-084: Agent transparency infrastructure — attention, `dialogs`, `menus`, elements/highlight

## Status

**Status:** Planned
**Created:** 2026-09-05
**Roadmap:** [agent-transparency-roadmap.md](../agent-transparency-roadmap.md), epic 1 of 7

## Overview

The first epic of the transparency roadmap builds the two protocols every later surface epic
implements, and nothing surface-specific beyond one worked consumer. **Attention** makes a blocking
dialog, popup menu or native OS dialog visible in every `call` result together with the path that
resolves it. **Elements/highlight** gives any on-screen node a hand-written list of its controls
and their purpose, with live visibility and a `highlight(name, message)` action that draws the
existing overlay. The `dialogs` and `menus` root nodes make the transient surfaces drivable.

The observed defect this epic fixes first: an agent calls `pages.closePage` on a modified page, the
Unsaved Changes prompt (`src/renderer/editors/text/TextFileActionsModel.ts:86`, buttons Save /
Don't Save / Cancel) appears, and the agent's next calls stall or return nothing useful. Today it
needs `browser_snapshot({pageId:"app"})` and `browser_click` to recover, which is exactly the
tool pair this roadmap retires.

## Goals

- A blocking dialog is never a mystery: the very next `call` result names it and how to answer it.
- Dialogs and popup menus are first-class nodes with the same discovery as everything else.
- One protocol for "what is on this screen and what is it for", implemented once in the shared
  AiVision layer, so the surface epics write lists, not mechanisms.
- Highlighting for the user moves under `call`, so the `ui` guide's script-based highlight
  instructions can retire in EPIC-085.
- Nothing removed. Additive only; the gate for removal is the roadmap's final epic.

## Design decisions

1. **Attention is computed in the renderer, per window, on every `call`.** `dialogsState`
   (`src/renderer/ui/dialogs/DialogsView.ts:10`, a `TGlobalState<IDialogViewData[]>`) and the
   popup-menu model (`src/renderer/ui/dialogs/poppers/showPopupMenu.ts`) are read after the path
   resolves and attached to `ICallResult` (`src/shared/ai-vision/resolver.ts:35`) as an optional
   `attention` field. The main process passes it through and renders it as a leading text block in
   the MCP response, before the value, so it is not missed. It appears on error results too — the
   error is often *caused* by the dialog. The `call` handler in `src/main/mcp/tools/call-tools.ts`
   already owns the response assembly.
2. **Attention is not gated by `hints`.** `HintMode` (`auto | always | never`) controls member
   lists; attention is state the agent cannot otherwise know, so `hints: "never"` still shows it.
3. **`dialogs` is a root node whose `children()` is the live `dialogsState`, indexed.** Each child
   is the `TDialogModel` instance; descriptors are per dialog class via `registerAiVision` on the
   constructor (the existing constructor-keyed registry). A common base descriptor gives every
   dialog `title`, `message`, `buttons`, `click(button)`, `cancel()`; classes add their own
   (`InputDialog.value`, `TrustBoardDialog` board name and trust scope). `click(button)` resolves
   through `TDialogModel.close(result)` (`src/renderer/core/state/model.ts:69`), so `canClose`
   validation is honoured exactly as a user click is.
4. **Password and encryption dialogs expose buttons and `cancel()` only.** No `value`. Restating
   the privacy stance of EPIC-083: the agent may dismiss, never read, a credential prompt.
5. **`menus` mirrors `dialogs` for popup menus**: `items` (label, enabled, checked, submenu),
   `click(label)`, `close()`. Context menus are how the user reaches most per-item actions, so an
   agent that can open and read them can do what the user can do without a per-item method.
6. **Elements are declared, visibility is measured.** A descriptor lists
   `{ name, purpose, selector? }`; the shared layer resolves `visible` from the DOM
   (`offsetParent` per the EPIC-083 verification gotchas) and builds `selector` from `data-name`
   when not given. No reflection over the DOM decides *what* an element is.
7. **`highlight(name, message?)` is a member of every node with `elements`**, implemented once
   and delegating to `app.ui.highlightElement(selector, message)`. `ui.highlightElement` stays as
   the raw selector form for anything not yet described.
8. **Native OS dialogs are reported, not driven.** Main wraps `dialog.showOpenDialog` /
   `showMessageBox` call sites to track open native dialogs per window; attention reports
   "a native file dialog is open; only the user can answer it".
9. **`elements` is curated, not exhaustive, and does not replace the app-window snapshot.** The
   roadmap keeps a Playwright-style automation surface on Persephone's own window (`window.ui`,
   EPIC-089) as the complete fallback; `elements` adds purpose to the controls each surface chose
   to describe. This epic's `visible` resolution and `highlight` may reuse `src/renderer/automation`
   helpers but must not move or redesign the ref store — that is EPIC-089's design task.
10. **The shell header strip is the protocol's first consumer.** Its `data-name` table already
   exists in `doc/architecture/ui-element-contract.md`, so `window.ui.elements` (or a
   `header` node — the task decides) costs only the purpose text. The rest of the shell is
   EPIC-085.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-1297 | `attention` on every `call` result: blocking dialogs and popup menus, renderer + main pass-through | Planned |
| US-1298 | `dialogs` root node — base descriptor, `click`/`cancel`, per-class descriptors for the 14 dialogs, password rule | Planned |
| US-1299 | `menus` root node — open popup menu items, `click(label)`, `close()` | Planned |
| US-1300 | Elements/highlight protocol in the shared AiVision layer, with the header strip as first consumer | Planned |
| US-1301 | Native OS dialog tracking in main and its attention report | Planned |
| US-1302 | Acceptance run on Haiku via `mcp-test-agent-call`: close a modified page and recover; find and highlight a control from its purpose | Planned |

US-1297 and US-1298 are the ones that fix the reported stall and should go first, in that order.
US-1299–US-1301 are independent of each other. US-1302 closes the epic.

## Acceptance

- Closing a modified page through `call` returns an attention block naming the Unsaved Changes
  dialog and the path to each button; `dialogs[0].click("Don't Save")` closes it.
- A Haiku agent with `call` only, given "close the active page" on a modified page, completes it
  with no `browser_*` call and no guide.
- The same agent, asked "show the user where to change the tab language", answers from
  `elements` and draws the highlight through a path.
- A credential dialog's `value` is not reachable by any path.
- Typecheck, lint, and production build pass; no tool removed.

## Notes

### 2026-09-05
- Created from the roadmap discussion. User direction: the end state is `call` alone, browser
  tools folded into the browser/board editors, highlighting reached from `call`; final proof is a
  call-only flag plus a QA re-run on Haiku and Codex before anything is deleted.
