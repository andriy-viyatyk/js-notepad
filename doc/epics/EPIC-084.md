# EPIC-084: Agent transparency infrastructure — attention, `dialogs`, `menus`, elements/highlight

## Status

**Status:** Active
**Created:** 2026-09-05
**Started:** 2026-09-05
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

1. **Attention is computed in the renderer, per window, on every `call`, and a call that a
   dialog blocks returns *pending* instead of hanging.** `dialogsState`
   (`src/renderer/ui/dialogs/DialogsView.ts:10`, a `TGlobalState<IDialogViewData[]>`) and the app
   popup-menu popper (`src/renderer/ui/dialogs/poppers/showPopupMenu.ts`) are read by the renderer
   `call` entry (`src/renderer/scripting/ai-vision/call.ts`) and attached to `ICallResult`
   (`src/shared/ai-vision/resolver.ts:35`) as an optional `attention` field. The main process passes
   it through and renders it as a leading text block, before the value, on error results too.
   **Revised 2026-09-05 after US-1297's investigation:** "after the path resolves" cannot work for
   the very case that motivates the epic — `pages.closePage` awaits `PageModel.close`, which awaits
   the Unsaved Changes prompt, so `resolveCall` never returns while the dialog is open and the MCP
   request dies on the renderer-bridge timeout. Resolution: the renderer entry races `resolveCall`
   against a *blocking-dialog watcher*. If a new dialog appears while the action is still pending
   (after a short grace so a dialog that opens and closes on its own is not reported), the entry
   returns `{ path, pending: true, attention }` with `isError: false`; the underlying action keeps
   running and completes when the dialog is answered, exactly as it would for a user. The agent's
   next call (`dialogs[0].click("Don't Save")`) finishes the original action; the original call's
   value is not delivered later — the agent re-reads state, which is how it would learn the
   outcome anyway. `app.call` and `persephone.call` keep their plain-value contracts from US-1296:
   they are script APIs whose callers can await a dialog like any other awaited action, and they
   carry no result envelope to render attention in. Main-local routes (`main.*`, the `windows`
   root) have no window and carry no attention; that is documented, not hidden.
2. **Attention is not gated by `hints`.** `HintMode` (`auto | always | never`) controls member
   lists; attention is state the agent cannot otherwise know, so `hints: "never"` still shows it.
3. **`dialogs` is a root node whose `children()` is the live `dialogsState`, indexed; each child is
   an *adapter* keyed by the entry's `viewId`, not the raw model.** Revised 2026-09-05 after
   US-1298's investigation found two facts the original wording missed: four dialogs
   (Confirmation, NamespaceCollision, RegisterToolset, TrustBoard) construct a bare `TDialogModel`,
   so a constructor-keyed descriptor cannot tell them apart; and the resolver reads real members
   (`target[name]`, `resolver.ts:88-141`), so a descriptor cannot invent `title`/`click` on a model
   that lacks them. Both are solved by the same move: the child at `dialogs[i]` is a small adapter
   object built from `IDialogViewData` (`dialog-view-registry.ts:16-25`), selected by `viewId` —
   the key the view registry already uses — that *implements* `aiVision` directly (no registry
   lookup) and exposes the normalised surface `title`, `message`, `buttons`, `click(button)`,
   `cancel()` plus that dialog's safe fields. No dialog model or view changes; the 14 model/view
   pairs stay as they are. `click(button)` maps the visible label to the same `close(result)` the view's
   button calls (Confirmation closes with the label itself; boolean dialogs with `true`/`false`;
   Input/Text/Commit through their existing submit paths), so `canClose` validation is honoured
   exactly as a user click is. `cancel()` is always `close(undefined)`. Non-closing controls
   (Browse, Tor Reconnect) are not buttons and `click` rejects them. There are **14** dialog
   classes: 13 under `src/renderer/ui/dialogs/` and the editor-owned `EditLinkDialog` at
   `src/renderer/editors/link-editor/EditLinkDialog.ts`; the password prompt is the encryption
   dialog.
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
| US-1297 | `attention` on every `call` result: blocking dialogs and popup menus, renderer + main pass-through | Implemented |
| US-1298 | [`dialogs` root node — `click`/`cancel`, 14 viewId-keyed adapters, password rule](../tasks/US-1298-dialogs-node/README.md) | Implemented |
| US-1299 | [`menus` root node — open popup menu items, `click(label)`, `close()`](../tasks/US-1299-menus-node/README.md) | Implemented |
| US-1300 | [Elements/highlight protocol in the shared AiVision layer, with the header strip as first consumer](../tasks/US-1300-elements-highlight/README.md) | Implemented |
| US-1301 | [Native OS dialog tracking in main and its attention report](../tasks/US-1301-native-dialog-attention/README.md) | Implemented |
| US-1302 | Acceptance run on Haiku via `mcp-test-agent-call`: close a modified page and recover; find and highlight a control from its purpose. Starts the per-surface QA layout in [`qa/surfaces/`](../../qa/surfaces/README.md) | Implemented |

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

### 2026-09-05 — implementation and acceptance
- US-1299, US-1300 and US-1301 implemented (Codex, from reviewed plans). Plan review caught three
  design errors worth recording: US-1300's original mechanism threaded a renderer *runtime* through
  `resolveCall`, which every present and future caller would have had to pass — replaced with a
  descriptor-owned `provide(name)` hook, one line in the resolver, and four files dropped from the
  change list. US-1301 assumed a native modal stops the renderer answering; it does not (async
  pickers are window-modal, so the renderer still replies), so attention now rides on an ordinary
  result and `pending` is reserved for the bridge-timeout branch. The two *synchronous* native
  dialogs block main's event loop and are unreportable by design — documented, not worked around.
- **Verified live, in the running app:** `dialogs` recovery from a pending close; `menus[0].items`
  on a 15-item tab menu with disabled entries excluded from the suggested actions, and
  `menus[0].click("Copy File Path")` running the real callback (clipboard checked) and closing the
  popup; `ui.elements` with correct live visibility for every conditional control; `ui.highlight`
  and its self-correcting unknown-name error; native-dialog attention appearing on an unrelated
  call and clearing on dismissal (the user dismissed the OS dialog — an agent cannot).
- The header list gained the four active-tab controls (`page-tab`, `tab-language`, `tab-close`,
  `tab-sound`), which also exercises the explicit-selector branch. 20 declarations in total.

### 2026-09-05 — what the QA runs changed
Both acceptance criteria pass, but the runs were worth more than the passes:

- **Answering a dialog is a decision.** Told only "close the active page", Haiku answered Unsaved
  Changes with "Don't Save" and discarded the user's work. Adding a caution *below* the
  `Resolve it with …` line changed nothing — the model acts on the first actionable line it reads.
  Moving the same text *above* it made the next run stop and ask the user. Attention blocks now put
  the constraint before the call to action.
- **Cross-reference beats redirection.** "Show me where to change the tab language" was answered
  with `page.language` three runs running. Indexing element purposes in `helpSearch`, rewriting the
  root `ui` summary, and adding a root `$help` common path all failed — the agent never called
  `helpSearch` and never re-read the root. Putting the pointer on `page.language` itself, the node
  it lands on every time, fixed it in one run. `page.language` was never a wrong answer; three
  attempts went into steering a model away from a correct one.
- Findings are recorded per test in [`qa/surfaces/`](../../qa/surfaces/README.md), which this epic
  starts: `dialogs.md`, `shell.md`, `menus.md`, plus a README explaining the per-surface layout.

### 2026-09-05 — epic close
- `/review` found a real gap US-1298's investigation missed: `EditLinkDialog`
  (`src/renderer/editors/link-editor/EditLinkDialog.ts`) also enters `dialogsState` via
  `showDialog`, so the inventory is **14** dialog classes, not 13. Codex added the adapter; the
  claim was verified against the source before accepting it (`dialogTitle` at :14, `save()` at :79,
  view buttons Cancel/Save at :314/:320).
- That instance exposed a worse class of failure, fixed separately in
  `dialogs/unknown.ts`: `getAdapter` **threw** on an unregistered `viewId`, so a single missed
  registration broke `dialogs[i]`, `children()` and every attention block for *all* open dialogs at
  once. It now degrades to an `UnknownDialog` adapter that can still be dismissed. Deliberately, it
  reflects over nothing — an unknown dialog may be holding a credential, and guessing at its
  members is what decision 4 forbids. Verified live: the dialog reports as `UnknownDialog`, still
  raises attention, and `cancel()` dismisses it.
- Remaining known limitation, documented not worked around: the two **synchronous** native dialogs
  (download save picker, browser unload message box) block main's event loop, so no `call` can run
  or be annotated while one is open.

### 2026-09-05
- Codex's US-1297/US-1298 investigation found two design decisions wrong against the source, both
  amended above: (1) attention "after the path resolves" cannot fire while the action itself awaits
  the dialog — resolved with a *pending* result; (3) constructor-keyed dialog descriptors cannot
  distinguish the four bare `TDialogModel` dialogs and cannot add members the model lacks —
  resolved with `viewId`-keyed adapter children. The inventory is 14 dialog classes: 13 shared
  dialog classes plus the editor-owned `EditLinkDialog`.
- Created from the roadmap discussion. User direction: the end state is `call` alone, browser
  tools folded into the browser/board editors, highlighting reached from `call`; final proof is a
  call-only flag plus a QA re-run on Haiku and Codex before anything is deleted.
