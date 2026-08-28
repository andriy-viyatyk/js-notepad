# US-1174 / US-1175 / US-1176 — the dead-React sweep

**Epic:** [EPIC-074 — De-React Epic F: React confined](../../epics/EPIC-074.md) (tasks F-a, F-b, F-c)
**Status:** Ready to implement
**Created:** 2026-08-28

One document covers all three tasks because they are disjoint pure deletions with no shared files
and no behaviour to preserve. The dashboard keeps three checkboxes; implement them in one pass.

> **Every claim below was verified against source during EPIC-074's scoping.** File paths, line
> numbers, export names and consumer counts are measured, not inferred. Do not re-investigate — but
> do re-check any line number that does not say what this document claims, and stop and report if so.

## Goal

Delete React from 20 files that produce or reference it purely as dead residue: ten `mountVanilla`
faces that nothing renders, nine hook entry points that nothing calls, and three file extensions that
imply JSX where there is none. No behaviour changes. No replacement code is written.

## Background

**Why these are dead, and why that was not obvious.** `mountVanilla` returns
`React.createElement(VanillaHost, …)`, which needs no JSX — so when EPIC-073 converted these faces
from `.tsx` to `.ts` they kept producing React while becoming invisible to that epic's
`.tsx`-filtered face instrument and its JSX-marker count. EPIC-073 therefore closed on "21 → 0
faces" while ten remained. All ten are reachable only through barrel re-exports and are rendered by
nothing; deleting them is collection work, not conversion work.

The hooks are the same story from the other side: EPIC-073 removed their last React consumers and
handed forward seven modules to "re-measure for deadness". The measurement says the **modules are
alive and only their hook entry points are dead** — `favicon-cache.ts` exports six functions of which
one is a hook. Two further entry points are class *methods*, which an export scan misses.

Relevant patterns: `createComponentModelDriver` (`core/state/model.ts:302`) is the vanilla
replacement `useComponentModel` was retired in favour of, and `createDepsGate()`
(`uikit/shared/deps-gate.ts`) replaced the effect-registration path. Nothing in this task needs
either — they are named only so a reader does not go looking for a missing replacement.

---

## Part A (US-1174) — delete the ten `mountVanilla` faces

### A1. Delete these eight files outright

Each is a face plus, in some cases, a type re-export that simply forwards from the sibling `*View`
module. Every consumer already imports from the `*View` module directly (verified per type below),
so nothing needs repointing except where noted in A3.

| File | Lines | Notes |
|---|---|---|
| `src/renderer/editors/base/ContentHostFooter.ts` | 17 | Declares `ContentHostFooterProps`, which has **no consumer outside this file**. `ContentHostFooterView` declares its own `ContentHostFooterViewProps` at `:17`. |
| `src/renderer/editors/base/EditorToolbar.ts` | 15 | Declares `EditorToolbarProps`, consumed only by the barrel (A3). `EditorToolbarView` declares its own `EditorToolbarViewProps` at `:5`. |
| `src/renderer/editors/log-view/LogBody.ts` | 7 | Face only. Zero references of any kind. |
| `src/renderer/editors/shared/ColorizedCode.ts` | 9 | Re-exports `ColorizedCodeProps`; the only consumer, `editors/markdown/CodeBlock.ts:6`, imports it from `ColorizedCodeView` directly. |
| `src/renderer/editors/shared/FindBar.ts` | 9 | Re-exports `FindBarProps`; the only consumer, `editors/markdown/MarkdownBodyView.ts:14`, imports from `FindBarView` directly. |
| `src/renderer/editors/shared/MonacoDiffEditorHost.ts` | 9 | Re-exports `MonacoDiffEditorHostProps`; no consumer outside the file. |
| `src/renderer/editors/shared/MonacoEditorHost.ts` | 9 | Re-exports `MonacoEditorHostProps`; both consumers (`editors/monaco/MonacoBodyView.ts:14`, `ui/dialogs/TextDialogView.ts:8`) import from `MonacoEditorHostView` directly. |
| `src/renderer/uikit/Popover/Popover.ts` | 10 | **Has one real consumer of its type re-export — see A3.** |

### A2. Delete the face function only from these two files

Both modules are alive; only the trailing face dies.

**`src/renderer/editors/text/ScriptPanel.ts`** (344 lines) — delete the `ScriptPanel` function at
`:342-344` and the now-unused `import { mountVanilla } from "../../uikit/shared/mount";` at `:13`.
**Keep** `ScriptPanelState` (`:19`), `defaultScriptPanelState` (`:30`), `ScriptDropdownEntry`
(`:41`) and `class ScriptPanelModel` (`:50`) — `ScriptPanelView.ts:13` and
`TextEditorModel.ts:9` depend on them.

*Note:* `ScriptPanel.ts:16` uses `require("fs")` directly, against `CLAUDE.md`'s no-direct-`fs`
rule. That is **US-1111 and out of scope here.** Do not fix it and do not touch those seven call
sites.

**`src/renderer/uikit/Tree/TreeItem.ts`** (97 lines) — delete the `TreeItem` function at `:95-97`
plus the `mountVanilla` import (`:2`) and the `SlotContent` import (`:3`) *if* nothing else in the
file uses it after the edit. **Keep `TreeItemProps` (`:9`)** — it is the real props interface,
imported by `TreeItemView.ts:17` and re-exported by two barrels.

`TreeItem.ts` retains `import type React from "react"` for `React.HTMLAttributes` and `React.Ref`
inside `TreeItemProps`. **Leave that alone** — it is task F-f's work, not this task's. This file is
expected to still import React when you finish.

### A3. Barrel and import repointing

| File | Line | Change |
|---|---|---|
| `src/renderer/editors/base/index.ts` | 28, 29 | Delete both — `export { EditorToolbar }` and `export type { EditorToolbarProps }` |
| `src/renderer/editors/text/index.ts` | 2 | Remove `ScriptPanel` from the export list; **keep** `ScriptPanelModel` and `defaultScriptPanelState` |
| `src/renderer/uikit/index.ts` | 49 | Delete `export { Popover } from "./Popover";` |
| `src/renderer/uikit/index.ts` | 50 | Repoint: `export type { PopoverProps, PopoverPosition } from "./Popover/PopoverModel";` |
| `src/renderer/uikit/index.ts` | 81 | Delete `export { TreeItem } from "./Tree";` |
| `src/renderer/uikit/index.ts` | 82 | **No change** — `TreeItemProps` still resolves through `./Tree` |
| `src/renderer/uikit/Popover/index.ts` | 1 | Delete `export { Popover } from "./Popover";` |
| `src/renderer/uikit/Popover/index.ts` | 2 | Repoint to `./PopoverModel` |
| `src/renderer/uikit/Tree/index.ts` | 8 | Delete `export { TreeItem } from "./TreeItem";` |
| `src/renderer/uikit/Tree/index.ts` | 9 | **No change** — `TreeItemProps` still comes from `./TreeItem` |
| `src/renderer/ui/dialogs/poppers/types.ts` | 2 | **The one real consumer.** `import { PopoverPosition } from "../../../uikit/Popover/Popover";` → `"../../../uikit/Popover/PopoverModel"`. Note it is a **value-style import of a type**; make it `import type` while you are there. |

### A4. Remove the vanilla-to-React adapter from `uikit/shared/mount.tsx`

Delete `mountVanilla` (`:99-113`), `mountReact` (`:115-120`) and the `VanillaHost` component plus
`VanillaHostProps` that only `mountVanilla` uses. After this the file's remaining React use is
`mountReactHandle` and `createRoot`.

**Do NOT delete `VanillaViewCtor` (`:5`) and do not delete the file.** That type has **13 consumers**
across eight subsystems (`editorRegistry.ts:32,36`, `dialog-view-registry.ts:30`,
`secondary-view-registry.ts:34`, `LazySecondaryViewView.ts`, the three `page-manager` files,
`BrowserView.ts:383,408`, `editors/types.ts:10`, `storyTypes.ts:44`). Relocating it is task F-h.

Verify `useLayoutEffect` / `useRef` imports are dropped if `VanillaHost` was their only user.

---

## Part B (US-1175) — delete the nine dead hook entry points

Delete the function and its `react` import; **keep every other export in the module.** Where a
`/* eslint-disable react-hooks/rules-of-hooks */` or `exhaustive-deps` suppression exists only to
cover the deleted code, delete the suppression too.

| # | File | Entry point | Line | Keep |
|---|---|---|---|---|
| 1 | `src/renderer/api/board-updates.ts` | `useBoardUpdates` | 75 | `BoardUpdate`, `getBoardUpdate`, `listBoardUpdates`, `isBoardIdle` |
| 2 | `src/renderer/components/icons/favicon-cache.ts` | `useFavicons` | 168 | the other five exports |
| 3 | `src/renderer/core/state/model.ts` | `useModel` | 235 | `effect`/`memo` and the whole model layer — **18 live `effect(` call sites** |
| 4 | `src/renderer/core/state/model.ts` | `useComponentModel` | 252 | as above; `createComponentModelDriver` stays |
| 5 | `src/renderer/editors/board/board-icon-cache.ts` | `useBoardIcon` | 75 | `getBoardIconPathSync`, `invalidateBoardIcon`, `subscribeBoardIconChanges` |
| 6 | `src/renderer/editors/board/board-usage-cache.ts` | `useBoardStandalone` | 72 | `getBoardUsageSync`, `invalidateBoardUsage` |
| 7 | `src/renderer/ui/sidebar/pinned-items.ts` | `usePinnedRefs` | 71 | the other eight exports |
| 8 | `src/renderer/core/state/ComponentQueue.ts` | **method** `use()` | 55 | `class ComponentQueue`, `subscribe`, `register`, `ComponentQueueEvent` |
| 9 | `src/renderer/core/state/ComponentQueue.ts` | **method** `useRequest()` | 103 | as above |

`ComponentQueue.ts` should have **no `react` import at all** when finished — `useEffect`/`useRef`
at `:1` exist only for those two methods. Delete the four suppression comments at `:54`, `:58-59`,
`:102`, `:106-107`.

**Verification note — do not be misled by a comment.** `useComponentModel` appears to have a
consumer at `components/git-tree/GitTreeModel.ts:8`. That line is **prose**: *"NOT created via
`useComponentModel`"*. Leave the comment as it is; it is still accurate.

---

## Part C (US-1176) — three extension renames

`git mv` these to `.ts`. None imports React and none contains JSX.

| File | JSX markers | Note |
|---|---|---|
| `src/renderer.tsx` | 0 | The renderer entry point. |
| `src/renderer/content/tree-context-menus.tsx` | 0 | — |
| `src/renderer/ui/dialogs/poppers/grid-context-menu.tsx` | 1 | The single marker is `<DataGrid rows={rows} … />` **inside a doc comment at `:86`**. Not code. |

`src/renderer/index.tsx` is **not** in this list — it still calls `React.createElement`. It renames
in task F-d.

**Vite gotcha (EPIC-072):** after a `.tsx` → `.ts` rename a dynamic importer can report
`Failed to fetch dynamically imported module` because Vite caches the old specifier resolution.
Touch the importing files (or restart the dev server) — a renderer reload alone does not clear it.
Check whether anything references these paths with an explicit extension, and whether
`src/renderer.tsx` is named in `index.html`, `vite.config.*` or `scripts/dev.mjs` / `scripts/build-prod.mjs`.

---

## Files that need NO changes

Do not investigate these; they were checked during scoping.

- All ten `*View.ts` siblings of the deleted faces — they are the live implementations.
- `src/renderer/uikit/Popover/PopoverView.ts`, `PopoverModel.ts` — the canonical Popover.
- `src/renderer/uikit/Tree/TreeItemView.ts` — keeps importing `TreeItemProps` from `TreeItem.ts`.
- `src/renderer/editors/text/ScriptPanelView.ts`, `TextEditorModel.ts` — depend only on kept exports.
- `src/renderer/editors/storybook/*` — F-g's work, not this task's.
- `src/renderer/theme/GlobalStyles.tsx`, `src/renderer/index.tsx` — F-d's work.
- `src/renderer/uikit/shared/react-compat.ts` — F-e and F-f's work.
- `boards-assets/`, `assets/`, `qa/`, `docs/` — verified free of every symbol deleted here.

## Concerns

1. **Barrel deletions have no in-repo compiler signal for external consumers.** Nothing in `src/`,
   `boards-assets/`, `assets/`, `qa/` or `docs/` references the removed names, but user-authored
   scripts reach uikit through the scripting API's type surface. **Check `assets/editor-types/`**
   for `Popover`, `TreeItem`, `EditorToolbar` or `ScriptPanel` before finishing, and report if any
   appears rather than deciding alone.
2. **`ScriptPanel.ts` is a 344-line live module.** The edit is three lines plus an import. Do not
   refactor anything else in it, and do not touch its `require("fs")` calls (US-1111).
3. **`model.ts` and `ComponentQueue.ts` are load-bearing.** They are the state primitives every
   view depends on. Deleting the hooks must not disturb `effect`, `memo`,
   `createComponentModelDriver`, `subscribe` or `register`.
4. **A file-extension filter is not a language filter** (EPIC-074 C20). When you verify at the end,
   match constructs (`return mountVanilla(`, `import … from "react"`), not file extensions, and
   strip comments before counting.

## Acceptance criteria

1. `grep -rn "return mountVanilla(" src/ --include=*.ts --include=*.tsx` returns **nothing**.
2. `grep -rn "mountVanilla\|mountReact\b" src/` returns **nothing** outside comments.
3. `VanillaViewCtor` still resolves for all 13 consumers; `mountReactHandle` still exists.
4. The nine hook entry points are gone; `ComponentQueue.ts` imports no React; the four
   `react-hooks` suppressions are gone.
5. `src/renderer/core/state/model.ts` still exports `effect`, `memo` and
   `createComponentModelDriver`, and the 18 `effect(` call sites still compile.
6. No `.tsx` file remains at the three Part C paths; `src/renderer/index.tsx` still exists.
7. `npm run typecheck`, `npm run lint`, `npm run build-prod` all pass.
8. **Presence check, not just absence:** the app starts, and a text editor page shows its toolbar and
   footer, a log-view page renders entries, a tree renders rows, and a Popover opens (the browser's
   downloads popup or a grid's column options). These exercise `EditorToolbarView`,
   `ContentHostFooterView`, `LogBodyView`, `TreeItemView` and `PopoverView` — the five live
   implementations whose faces were deleted. A green build does not prove any of them still mounts.

## Files changed

| File | Change |
|---|---|
| 8 face modules (A1) | deleted |
| `editors/text/ScriptPanel.ts` | face function + one import removed |
| `uikit/Tree/TreeItem.ts` | face function + one or two imports removed |
| `uikit/shared/mount.tsx` | `mountVanilla`, `mountReact`, `VanillaHost` removed |
| `editors/base/index.ts`, `editors/text/index.ts`, `uikit/index.ts`, `uikit/Popover/index.ts`, `uikit/Tree/index.ts` | barrel entries removed or repointed |
| `ui/dialogs/poppers/types.ts` | import repointed to `PopoverModel` |
| 7 hook modules (B) | nine entry points + React imports + four suppressions removed |
| 3 files (C) | renamed `.tsx` → `.ts` |
