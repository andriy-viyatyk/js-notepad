# US-1225 — The React archaeology sweep

## Goal

Remove or restate stale React archaeology in the renderer so every remaining React reference is
either a real, load-bearing contract or an explicitly non-framework lexical match. The sanctioned
React island under `src/renderer/editors/draw/**` and all work owned by the neighbouring epic tasks
remain outside this task.

## Background

EPIC-078 §D-2 correction 6 is authoritative for this task. Its clean-tree baseline contained 194
exact-token occurrences outside `editors/draw/`; the current worktree, after neighboring task
changes, contains 192 occurrences on 187 matching source lines. After the explicit
US-1222/US-1223/EPIC-077 exclusions below, 180 occurrences remain on 175 source lines. The known
`CategoryViewModel.ts` citation is a separate stale `.tsx` path and is included because the epic
names it explicitly. The measured task inventory therefore contains 180 target occurrences
represented by 176 numbered rows, plus the explicitly permitted no-change note for the already
corrected `fill-slot.ts:41` wording.

The old `doc/de-react.md` path in two current comments is dead, and `doc/de-react-refactoring.md`
does not contain a §6.1. The surviving masked-defect explanation is in
`doc/epics/completed.md:625-632` (EPIC-067's four fixes and their real channels), with the two
remaining live examples at `doc/epics/completed.md:653-656`. Repoint both comments to the live
completed-epic path/EPIC-067 heading; do not remove their local explanation of the failure mode.

The dangerous false-positive set is the project's own reactive-state vocabulary. It is 79
occurrences outside the draw island, and must remain byte-for-byte unchanged. A compile, lint, or
build result cannot prove this: changing `reactive` to nonsense still typechecks. The inventory below
is deliberately line-based so an implementer can account for every source hit before editing.

### Search contract

Use this exact-token search for the React inventory; do not replace it with `grep -i react`:

```text
rg -n --pcre2 --glob '*.ts' --glob '!editors/draw/**' \
  '(?<![A-Za-z])(?:React|react)(?![A-Za-z])' src/renderer
```

The exact exclusion is `src/renderer/editors/draw/**`, expressed relative to the `src/renderer`
search root as `--glob '!editors/draw/**'`. This excludes the Excalidraw island, including
`react-island.ts`; it does not authorize changing any other renderer file.

Use this separate decoy verification search:

```text
rg -n --pcre2 --glob '*.ts' --glob '!editors/draw/**' \
  '(?i)(?<![A-Za-z])(?:reactive|reactivity|reactions?|reacts|reactively)(?![A-Za-z])' src/renderer
```

The negative letter boundaries make the pattern exact for the listed vocabulary. Do not edit,
rename, or reflow any of its 79 matches. `react-slot`, `data-react-root`, and `.tsx` are checked by
their own rules, not by broadening the React search.

### Explicit exclusions from this inventory

Do not include or modify these sites in US-1225:

- all of `src/renderer/editors/draw/**`;
- `data-part="react-slot"` (US-1223), including the writers in `DialogView.ts` and `TagView.ts`;
- `data-react-root` (the live island marker);
- the adapter comments in `src/renderer/uikit/shared/vanilla-view.ts`;
- `src/renderer/core/utils/performance-janitor.ts`;
- `src/renderer/ui/dialogs/poppers/grid-context-menu.ts` (US-1222 investigation);
- `ActiveNodeSlot`/`generation` machinery in `src/renderer/uikit/shared/fill-slot.ts` (US-1222).
  The one wording-only comment at the current `fill-slot.ts:41` (originally `:40`) is intentionally included below;
- `src/renderer/components/tree-provider/TreeProviderViewModel.ts` (EPIC-077 US-1221).

The explicit exclusions remove 12 exact-token occurrences from the 192-match search result. The
two `react-slot` writer hits are not part of the React inventory; `data-react-root` is only in the
excluded draw island. The `CategoryViewModel.ts` `.tsx` citation is found by this supplementary
check and must be handled with the inventory even though it has no standalone `React` token:

```text
rg -n '\.tsx' src/renderer/components/tree-provider/CategoryViewModel.ts
```

## Implementation plan

1. Capture the exact-token result and the 79-decoy result before edits. Use the inventory as the
   change list; inspect the surrounding method before deleting any comment that explains behavior.
2. Apply the table actions. `Delete` is only for pure historical prose. `Reword` must retain the
   actual DOM, lifecycle, identity, ordering, event, sizing, or navigation reason stated by the
   old comment. `Keep` is limited to an ordinary-English word, sample data, a Monaco enum, or the
   explicit historical path/contract that is not a React mechanism.
3. In `automation/commands.ts:81` and `automation/AppTargetModel.ts:7`, change only the stale
   description of the app surface. The nearby CDP waits and their `navigate()`-async justifications
   are not this task and must not be changed.
4. Re-run both exact searches and compare the decoy output with the pre-edit snapshot. Review the
   diff for any changed line containing a decoy term. No unit tests are to be added; this task is
   documentation/comment archaeology and its verification is textual.

### Representative before → after wording

These snippets show the required kind of edit; the inventory is authoritative for every row.

```ts
// before: React passed no `style` at all when all three were undefined, leaving `Select.css`'s
// after:  When width, minWidth, and maxWidth are undefined, leave the inline width empty so
//         Select.css's `width: 100%` remains the active rule.
```

```ts
// before: Persephone's own React UI. Explicit only: the fallback branch must NEVER return it
// after:  Persephone's own application UI. Explicit only: the fallback branch must NEVER return it
```

```ts
// before: based solely on the item's href/isDirectory. This ... flow ... tree-context-menus.tsx
// after:  based solely on the item's href/isDirectory. This ... flow ... tree-context-menus.ts
```

## Complete inventory

The current text column gives the exact matched phrase or code, with unrelated continuation omitted
where a line is long. `—` in the replacement column means the comment line is removed. Rows marked
`Keep` remain unchanged and explain why the exact-token match is not a framework claim.

The 176 target rows split into `Delete` 2, `Reword` 156, and `Keep` 18. They contain 180 exact
tokens; the extra four are repeated tokens on already-listed lines, and the `CategoryViewModel.ts`
row adds one stale `.tsx` citation without an exact React token. The separately permitted
`fill-slot.ts:41` no-change note is row 124 and is not part of that split.

| Classification | Target rows |
|---|---:|
| Delete | 2 |
| Reword | 156 |
| Keep | 18 |

| # | File:line | Current text | Action | Replacement wording |
|---:|---|---|---|---|
| 1 | `src/renderer/index.ts:24` | `AlertsBar` is only a React face over `AlertsBarView` | Reword | `AlertsBar` is already a native face over `AlertsBarView`. |
| 2 | `src/renderer/index.ts:25` | would create a React root purely to wrap a vanilla view | Reword | mounting a wrapper would create an unnecessary framework root purely to wrap a vanilla view |
| 3 | `src/renderer/index.ts:26` | The startup path creates no React root at all. | Reword | The startup path creates no extra framework root. |
| 4 | `src/renderer/api/app.ts:146` | Called from bootstrap (`renderer.tsx`) before React renders. | Reword | Called during renderer bootstrap before the initial UI is built. |
| 5 | `src/renderer/api/pages/PageModel.ts:57` | Stable page UUID — tab identity, React key, cache key. Never changes. | Reword | Stable page UUID — tab identity and cache key. Never changes. |
| 6 | `src/renderer/api/pages/PageModel.ts:462` | Editors may react — e.g., ArchiveEditor self-evicts | Keep | Ordinary-English verb; it means “respond,” not the React framework. |
| 7 | `src/renderer/api/setup/configure-monaco.ts:156` | `jsx: monaco.typescript.JsxEmit.React,` | Keep | Monaco’s `JsxEmit.React` enum value; not an application framework reference. |
| 8 | `src/renderer/automation/AppTargetModel.ts:7` | `browser_*` MCP automation tools drive the app's React UI itself | Reword | `browser_*` MCP automation tools drive the app's own UI |
| 9 | `src/renderer/automation/commands.ts:81` | Persephone's own React UI. Explicit only: the fallback branch must NEVER return | Reword | Persephone's own UI. Explicit only: the fallback branch must NEVER return |
| 10 | `src/renderer/components/git-tree/branch-tree-cell.ts:7` | everything the React version had to paint for itself — the absolute box, the forwarded | Reword | everything the earlier renderer had to paint for itself — the absolute box, the forwarded |
| 11 | `src/renderer/components/git-tree/branch-tree-cell.ts:56` | (`stroke-width`, not React's `strokeWidth`) | Reword | (`stroke-width`, not the camel-case property name) |
| 12 | `src/renderer/components/git-tree/git-ref-color.ts:8` | Palette colours shared by the native grid renderer and the React ref chip. | Reword | Palette colours shared by the native grid renderer and the ref chip. |
| 13 | `src/renderer/components/git-tree/git-refs-tree.ts:15` | only React-backed values are the explicit `SlotText`/`IconRef` arms on | Reword | only slot-backed values are the explicit `SlotText`/`IconRef` arms on |
| 14 | `src/renderer/components/git-tree/git-refs-tree.ts:16` | `GitRefNode.label`/`icon`; the builder itself creates no React elements. | Reword | `GitRefNode.label`/`icon`; the builder itself creates no elements. |
| 15 | `src/renderer/components/git-tree/load-more-footer.ts:11` | the four positioning declarations the React version hand-wrote are gone | Reword | the four positioning declarations the earlier renderer hand-wrote are gone |
| 16 | `src/renderer/components/git-tree/side-select-cell.ts:10` | Why spans with no listeners, and not the React `<button>`s this replaced | Reword | Why spans with no listeners, rather than the buttons this replaced |
| 17 | `src/renderer/components/git-tree/side-select-cell.ts:28` | navigation until the user clicked a cell. The React version had that wart. | Reword | navigation until the user clicked a cell. The earlier renderer had that wart. |
| 18 | `src/renderer/components/git-tree/side-select-cell.ts:58` | matching the React version's `data-active` behavior | Reword | preserving the prior renderer's `data-active` behavior |
| 19 | `src/renderer/components/page-manager/AppPageManagerView.ts:23` | Native application-page host with deferred React page islands and CSS grouping. | Reword | Native application-page host with deferred page views and CSS grouping. |
| 20 | `src/renderer/components/page-manager/ImperativeSplitter.ts:2` | Imperative vertical splitter for use outside React's component tree. | Reword | Imperative vertical splitter for the native page layout. |
| 21 | `src/renderer/components/page-manager/PageManagerView.ts:10` | Render function — receives page ID, returns a React node. | Reword | Page factory — receives a page ID and returns a native page view. |
| 22 | `src/renderer/components/page-manager/PageManagerView.ts:16` | Native host for browser internal tabs with one retained React island per tab. | Reword | Native host for browser internal tabs with one retained page view per tab. |
| 23 | `src/renderer/core/traits/dnd.ts:85` | Accepts a React drag events. | Reword | Accepts internal and OS drag events. |
| 24 | `src/renderer/editors/archive/ArchiveEditor.ts:142` | React to panel expansion — reveal current entry when "archive-tree" becomes active. | Keep | Ordinary-English verb; the sentence means “respond to panel expansion.” |
| 25 | `src/renderer/editors/board/board-glyph-element.ts:4` | Create the non-React board glyph used by DOM-owned file-icon surfaces. | Reword | Create the native board glyph used by DOM-owned file-icon surfaces. |
| 26 | `src/renderer/editors/board/board-icon-cache.ts:72` | Subscribe non-React owners to board icon probe/invalidation notifications. | Reword | Subscribe DOM-owning consumers to board icon probe/invalidation notifications. |
| 27 | `src/renderer/editors/board/BoardEditorModel.ts:562` | can run without a clean React unmount (forced close / window teardown) | Reword | can run without the normal board-frame teardown (forced close / window teardown) |
| 28 | `src/renderer/editors/board/BoardEditorView.ts:125` | gives it the same remount semantics as React's keyed element. | Reword | gives it stable-key replacement semantics: a changed key gets a fresh board element. |
| 29 | `src/renderer/editors/board/boards-tree-build.ts:4` | Single-child folder compaction. No React, no filesystem walk | Reword | Single-child folder compaction. No filesystem walk |
| 30 | `src/renderer/editors/browser/BrowserView.ts:88` | The React original deleted unconditionally | Reword | The earlier implementation deleted unconditionally |
| 31 | `src/renderer/editors/explorer/ExplorerEditorModel.ts:189` | React to main editor changes — highlight and reveal file if within root. | Keep | Ordinary-English verb; it means “respond to main editor changes.” |
| 32 | `src/renderer/editors/explorer/ExplorerEditorModel.ts:211` | React to panel expansion — reveal current file when "explorer" panel becomes active. | Keep | Ordinary-English verb; it means “respond to panel expansion.” |
| 33 | `src/renderer/editors/graph/ForceGraphRenderer.ts:339` | Canvas event handlers (bound for React) | Delete | — |
| 34 | `src/renderer/editors/graph/GraphBodyView.ts:405` | The React original did this in its `canvasRef` callback | Reword | The previous view did this in its canvas-ref callback |
| 35 | `src/renderer/editors/grid/GridEditor.ts:97` | where the old React grid would fail the grid outright | Reword | where the grid now fails outright |
| 36 | `src/renderer/editors/grid/components/ColumnsOptions.ts:27` | under the React grid, where it only affected the | Reword | under the previous grid, where it only affected the |
| 37 | `src/renderer/editors/grid/components/ColumnsOptions.ts:278` | the order matters now, where it did not under the React | Reword | the order matters now, where it did not in the previous grid |
| 38 | `src/renderer/editors/html/HtmlBodyView.ts:73` | React only wrote the attribute when the value actually changed | Reword | the previous view wrote the attribute only when the value actually changed |
| 39 | `src/renderer/editors/link-editor/tor-src.ts:7` | ordinary React in the app renderer, so its `<img src="https://…">` would go out | Reword | an app-rendered `<img src="https://…">`, so the URL would go out |
| 40 | `src/renderer/editors/notebook/category-tree.ts:18` | The React implementation had left the name collapsed | Reword | The previous implementation had left the name collapsed |
| 41 | `src/renderer/editors/notebook/NoteItemView.ts:434` | React's `onFocus`/`onBlur`, which this was converted from, are delegated through the bubbling pair | Reword | the former delegated `onFocus`/`onBlur` behavior is represented by the bubbling pair |
| 42 | `src/renderer/editors/notebook/note-editor/NoteItemActiveEditorView.ts:41` | because the React component this replaces contributed no DOM | Reword | because the component this replaces contributed no DOM |
| 43 | `src/renderer/editors/rest-client/panels/RestRequestTreeView.ts:42` | because the React `RequestTree` this replaces returned `<Tree>` | Reword | because the replaced `RequestTree` returned `<Tree>` |
| 44 | `src/renderer/editors/tools/tools-tree-build.ts:4` | No React, no filesystem walk — the input is the | Reword | No filesystem walk — the input is the |
| 45 | `src/renderer/editors/video/VideoEditor.ts:289` | cause React to batch-render with a stale selectedLinkId snapshot. | Reword | cause the navigation update and selection update to observe different selectedLinkId snapshots. |
| 46 | `src/renderer/editors/video/VideoEditor.ts:315` | ensure React has flushed the navigation render | Reword | ensure the navigation update has reached the DOM |
| 47 | `src/renderer/theme/theme-state.ts:10` | so non-React consumers can subscribe | Reword | so native consumers can subscribe |
| 48 | `src/renderer/theme/theme-state.ts:11` | to the same synchronous notification path as React views. | Reword | to the same synchronous notification path as other renderer views. |
| 49 | `src/renderer/ui/app/MainPageView.ts:130` | where the React component read `themeState.use()` and re-rendered on a flip. | Reword | whereas the previous component read `themeState.use()` and refreshed on a flip. |
| 50 | `src/renderer/ui/sidebar/PinnedRailView.ts:243` | The React original captured `index` in a render | Reword | The previous renderer captured `index` during rendering |
| 51 | `src/renderer/ui/tabs/PageTabView.ts:410` | The React original was immune because `isActive` was a value | Reword | The previous renderer was immune because `isActive` was a value |
| 52 | `src/renderer/uikit/Autocomplete/AutocompleteModel.ts:63` | directly with no React root. Forwarded verbatim to `InputProps.startSlot`. | Reword | directly as a DOM node. Forwarded verbatim to `InputProps.startSlot`. |
| 53 | `src/renderer/uikit/Autocomplete/AutocompleteModel.ts:147` | replaces React's `useId` (C3-5). | Reword | replaces the former generated-ID source (C3-5). |
| 54 | `src/renderer/uikit/Autocomplete/AutocompleteModel.ts:290` | the React implementation deferred this on a microtask to | Reword | the previous implementation deferred this on a microtask to |
| 55 | `src/renderer/uikit/Autocomplete/AutocompleteView.ts:139` | Replaces the `Panel` + `Spacer` composition the React implementation used | Reword | Replaces the `Panel` + `Spacer` composition the previous implementation used |
| 56 | `src/renderer/uikit/Autocomplete/AutocompleteView.ts:141` | `fillSlot`'s own React container is, so the header content and the action stay flex items of | Reword | `fillSlot`'s slot host is, so the header content and the action stay flex items of |
| 57 | `src/renderer/uikit/Autocomplete/AutocompleteView.ts:142` | the row exactly as they were when React rendered them as direct children. | Reword | the row as direct children. |
| 58 | `src/renderer/uikit/Autocomplete/AutocompleteView.ts:172` | The React implementation forwarded | Reword | The previous implementation forwarded |
| 59 | `src/renderer/uikit/Autocomplete/AutocompleteView.ts:263` | what the React implementation did. | Reword | what the previous implementation did. |
| 60 | `src/renderer/uikit/Button/ButtonView.ts:141` | the React root it caches per host is discarded and the | Reword | the cached slot state is discarded and the |
| 61 | `src/renderer/uikit/Button/ButtonView.ts:162` | keep a DOM icon outside React while the label may | Reword | keep a DOM icon separate from the label while the label may |
| 62 | `src/renderer/uikit/Button/ButtonView.ts:163` | remain a React subtree. Both hosts stay layout-transparent | Reword | remain in its own subtree. Both hosts stay layout-transparent |
| 63 | `src/renderer/uikit/Button/ButtonView.ts:190` | children host can own a live React root (fillSlot's React arm) plus focused content | Reword | children host can own focused content plus the slot-managed subtree |
| 64 | `src/renderer/uikit/Checkbox/CheckboxView.ts:85` | JSX spread was last in the React implementation, so a caller's | Reword | JSX spread was last in the previous implementation, so a caller's |
| 65 | `src/renderer/uikit/DataGrid/cell-tooltip.ts:4` | The React grid this replaces wrapped every string cell in `<TruncatedText>` | Reword | The previous grid wrapped every string cell in `<TruncatedText>` |
| 66 | `src/renderer/uikit/DataGrid/types.ts:78` | The only way a React host reaches the imperative surface. | Reword | The only supported host path reaches the imperative surface. |
| 67 | `src/renderer/uikit/IconButton/IconButtonView.ts:10` | stylesheet has to travel with the DOM rather than with the React face | Reword | stylesheet has to travel with the DOM-owning view |
| 68 | `src/renderer/uikit/IconButton/IconButtonView.ts:123` | the React root it caches per host is discarded and the | Reword | the cached slot state is discarded and the |
| 69 | `src/renderer/uikit/ImageViewport/ImageViewport.ts:148` | called from native event listener, not React | Delete | — |
| 70 | `src/renderer/uikit/Input/InputView.ts:6` | stylesheet has to travel with the DOM rather than with the React face. | Reword | stylesheet has to travel with the DOM-owning view. |
| 71 | `src/renderer/uikit/Input/InputView.ts:34` | with no React root — that is how a vanilla parent supplies a composed view's root | Reword | as a DOM node — that is how a native parent supplies a composed view's root |
| 72 | `src/renderer/uikit/Input/InputView.ts:71` | a React element built inline is always a new object, so a genuinely-changed subtree always has a new identity. | Reword | an inline subtree value is always new, so a genuinely changed subtree has a new identity. |
| 73 | `src/renderer/uikit/Label/LabelView.ts:51` | The React Label has always forwarded them to `<label>` | Reword | The previous Label implementation forwarded them to `<label>` |
| 74 | `src/renderer/uikit/ListBox/ListBoxModel.ts:121` | replaces React's `useId` (EPIC-056 C3-5). | Reword | replaces the former generated-ID source (EPIC-056 C3-5). |
| 75 | `src/renderer/uikit/ListBox/ListBoxView.ts:34` | why the row index never has to appear as a `data-*` attribute (the React DOM had none either). | Reword | why the row index never has to appear as a `data-*` attribute. |
| 76 | `src/renderer/uikit/ListBox/ListBoxView.ts:53` | which is exactly what the React version did, and what the repaint gate exists to stop. | Reword | which would repaint every visible cell on every update, and what the repaint gate exists to stop. |
| 77 | `src/renderer/uikit/ListBox/ListBoxView.ts:54` | React returned three different | Reword | The prior implementation returned three different |
| 78 | `src/renderer/uikit/ListBox/ListBoxView.ts:57` | React did too. Keeping it alive behind `display: none` | Reword | The prior implementation did too. Keeping it alive behind `display: none` |
| 79 | `src/renderer/uikit/ListBox/ListBoxView.ts:181` | `contextmenu` is on all three React arms; `keydown` and `mouseleave` were on | Reword | `contextmenu` is on all three arms; `keydown` and `mouseleave` were on |
| 80 | `src/renderer/uikit/ListBox/ListBoxView.ts:229` | React expressed the arms as three | Reword | The prior implementation expressed the arms as three |
| 81 | `src/renderer/uikit/ListBox/ListBoxView.ts:340` | React would have added the unit itself. | Reword | the old style writer would have added the unit itself. |
| 82 | `src/renderer/uikit/ListBox/ListBoxView.ts:488` | which is what the React version's `setTimeout(0)` was approximating | Reword | which is what the previous `setTimeout(0)` was approximating |
| 83 | `src/renderer/uikit/ListBox/ListBoxView.ts:531` | React adds `px` to a bare number in a style value; a DOM prop typed as a string cannot. | Reword | A DOM property typed as a string does not add `px` to a bare number; normalize numeric lengths before writing it. |
| 84 | `src/renderer/uikit/ListBox/ListItemView.ts:16` | the `ListItem` React face that once wrapped this class for | Reword | the `ListItem` face that once wrapped this class for |
| 85 | `src/renderer/uikit/ListBox/ListItemView.ts:24` | `fillSlot` caches per-host state and re-renders an existing React root rather than building a new | Reword | `fillSlot` caches per-host state and updates the existing slot rather than building a new |
| 86 | `src/renderer/uikit/ListBox/ListItemView.ts:26` | list create React roots only during warm-up and none at all once it settles. | Reword | list create new slot subtrees only during warm-up and none once it settles. |
| 87 | `src/renderer/uikit/ListBox/ListItemView.ts:30` | a documented, layout-neutral deviation from React's | Reword | a documented, layout-neutral deviation from the earlier DOM |
| 88 | `src/renderer/uikit/ListBox/ListItemView.ts:206` | `IconName` never needs a React root | Reword | `IconName` is rendered directly as an SVG |
| 89 | `src/renderer/uikit/ListBox/ListItemView.ts:232` | An icon *name* becomes a DOM `svg` with no React root. | Reword | An icon *name* becomes a DOM `svg`. |
| 90 | `src/renderer/uikit/ListBox/ListItemView.ts:286` | Transcribed from the React default-trailing expression | Reword | Transcribed from the default-trailing expression |
| 91 | `src/renderer/uikit/ListBox/SectionItemView.ts:9` | React root and no tooltip. | Reword | DOM subtree and no tooltip. |
| 92 | `src/renderer/uikit/Menu/MenuModel.ts:88` | Prop-driven state transitions replace the former React-timed effects. | Reword | Prop-driven state transitions replace the former deferred effects. |
| 93 | `src/renderer/uikit/MultiListBox/MultiListBoxModel.ts:155` | masked defect of `doc/de-react.md` §6.1 | Reword | masked-defect class recorded in `doc/epics/completed.md` under `## EPIC-067 — De-React Epic E9: the editor chrome contract`; keep the local explanation that an unrelated input can self-heal the stale selection |
| 94 | `src/renderer/uikit/MultiListBox/MultiListBoxView.ts:31` | a settled scroll here creates zero React roots. | Reword | a settled scroll here creates no new slot subtrees. |
| 95 | `src/renderer/uikit/MultiListBox/MultiListBoxView.ts:212` | React passed no `style` at all when both were undefined | Reword | When both width values are undefined, leave the inline width empty |
| 96 | `src/renderer/uikit/MultiListBox/MultiListBoxView.ts:267` | The React version derived it three times from two getters | Reword | The earlier implementation derived it three times from two getters |
| 97 | `src/renderer/uikit/MultiListBox/MultiListBoxView.ts:286` | an `IconName` needs no React root. | Reword | an `IconName` is rendered directly as an SVG. |
| 98 | `src/renderer/uikit/MultiListBox/MultiListBoxView.ts:368` | React adds `px` to a bare number in a style value; a DOM write cannot. | Reword | A DOM property typed as a string does not add `px` to a bare number; normalize numeric lengths before writing it. |
| 99 | `src/renderer/uikit/MultiSelect/MultiSelectModel.ts:111` | replaces React's `useId` (C3-5). | Reword | replaces the former generated-ID source (C3-5). |
| 100 | `src/renderer/uikit/MultiSelect/MultiSelectView.ts:37` | React implementation. C3-5 obliges this task | Reword | previous implementation. C3-5 obliges this task |
| 101 | `src/renderer/uikit/MultiSelect/MultiSelectView.ts:133` | React passed no `style` at all when all three were undefined | Reword | When all three width values are undefined, leave the inline width empty |
| 102 | `src/renderer/uikit/MultiSelect/MultiSelectView.ts:225` | `createIconElement`, no React root. The React implementation passed | Reword | `createIconElement`; the previous implementation passed |
| 103 | `src/renderer/uikit/MultiSelect/MultiSelectView.ts:226` | `renderIcon("chevron-down")`, so every `MultiSelect` on screen carried a retained React root | Reword | `renderIcon("chevron-down")`, so every `MultiSelect` carried a retained icon subtree |
| 104 | `src/renderer/uikit/MultiSelect/MultiSelectView.ts:299` | literal translation of the React `useCallback` | Reword | literal translation of the previous stable callback |
| 105 | `src/renderer/uikit/MultiSelect/MultiSelectView.ts:353` | React adds `px` to a bare number in a style value; a DOM write cannot. | Reword | A DOM property typed as a string does not add `px` to a bare number; normalize numeric lengths before writing it. |
| 106 | `src/renderer/uikit/Notification/NotificationView.ts:136` | Match the React component: residual attributes are applied after the owned markers. | Reword | Residual attributes are applied after the owned markers so callers can override them. |
| 107 | `src/renderer/uikit/PathInput/PathInputModel.ts:286` | after the nested React | Reword | after the nested view |
| 108 | `src/renderer/uikit/Popover/PopoverView.ts:156` | ordering remains the same as the React implementation. | Reword | ordering remains: the size middleware is the last writer for viewport max-height and anchor width. |
| 109 | `src/renderer/uikit/ProgressBar/ProgressBarView.ts:99` | ariaProps precede residual props in the React face, so callers can override these attrs. | Reword | `ariaProps` precede residual props, so callers can override these attributes. |
| 110 | `src/renderer/uikit/Select/SelectModel.ts:71` | caller needs to react to the cancel beyond | Keep | Ordinary-English verb; it means “respond to the cancel.” |
| 111 | `src/renderer/uikit/Select/SelectModel.ts:169` | masked defect of `doc/de-react.md` §6.1 | Reword | masked-defect class recorded in `doc/epics/completed.md` under `## EPIC-067 — De-React Epic E9: the editor chrome contract`; keep the local explanation that an error arm from an unsubscribed field appears only after unrelated state moves |
| 112 | `src/renderer/uikit/Select/SelectModel.ts:208` | Replaces React's `useId` (EPIC-056 C3-5). | Reword | Replaces the former generated-ID source (EPIC-056 C3-5). |
| 113 | `src/renderer/uikit/Select/SelectModel.ts:469` | where React detached it after the | Reword | where the previous renderer detached it after the |
| 114 | `src/renderer/uikit/Select/SelectView.ts:23` | **Zero React roots, open or closed.** | Reword | **Zero retained slot subtrees, open or closed.** |
| 115 | `src/renderer/uikit/Select/SelectView.ts:25` | rather than a React node. The latter is a change in kind: the React implementation | Reword | rather than an icon subtree. The latter is a change in kind: the previous implementation |
| 116 | `src/renderer/uikit/Select/SelectView.ts:26` | passed `renderIcon("chevron-down")`, so every `Select` on screen carried a retained React root | Reword | passed `renderIcon("chevron-down")`, so every `Select` carried a retained icon subtree |
| 117 | `src/renderer/uikit/Select/SelectView.ts:153` | React passed no `style` at all when all three were undefined | Reword | When all three width values are undefined, leave the inline width empty |
| 118 | `src/renderer/uikit/Select/SelectView.ts:249` | `createIconElement`, no React root. | Reword | `createIconElement`, with no retained slot subtree. |
| 119 | `src/renderer/uikit/Select/SelectView.ts:250` | DOM incomparable to the React implementation an agent may be querying. | Reword | DOM incomparable to the implementation an agent may be querying. |
| 120 | `src/renderer/uikit/Select/SelectView.ts:324` | literal translation of the React `useCallback` | Reword | literal translation of the previous stable callback |
| 121 | `src/renderer/uikit/Select/SelectView.ts:333` | the React `useCallback([model, ref])` re-bound too. | Reword | the previous `[model, ref]` callback re-bound too. |
| 122 | `src/renderer/uikit/Select/SelectView.ts:379` | React adds `px` to a bare number in a style value; a DOM write cannot. | Reword | A DOM property typed as a string does not add `px` to a bare number; normalize numeric lengths before writing it. |
| 123 | `src/renderer/uikit/shared/element-id.ts:6` | Replaces React's `useId` in converted components | Reword | Replaces the former generated-ID source in converted components |
| 124 | `src/renderer/uikit/shared/fill-slot.ts:41` | Append `SlotContent`'s native values; active-record cleanup prevents stale handles from clearing | Excluded | Already corrected by US-1222; no US-1225 change. |
| 125 | `src/renderer/uikit/shared/highlight.ts:4` | DOM form of the former React highlighter | Reword | DOM form of the former highlighter |
| 126 | `src/renderer/uikit/shared/highlight.ts:7` | highlights identically to the former React implementation. | Reword | highlights identically to the former implementation. |
| 127 | `src/renderer/uikit/shared/highlight.ts:66` | Mirrors the former React path. | Reword | Mirrors the former highlighting path. |
| 128 | `src/renderer/uikit/shared/overlayLayer.ts:9` | host remains available for future non-React views. | Reword | host remains available for future native views. |
| 129 | `src/renderer/uikit/Tree/SectionItemView.ts:20` | direct flex item of the row exactly as it was in the React DOM. | Reword | direct flex item of the row. |
| 130 | `src/renderer/uikit/Tree/SectionItemView.ts:24` | That matches the React `SectionItem`, which | Reword | That matches the earlier `SectionItem`, which |
| 131 | `src/renderer/uikit/Tree/tree-indents.ts:23` | matching the React | Reword | matching the earlier row renderer |
| 132 | `src/renderer/uikit/Tree/TreeItemView.ts:23` | the `TreeItem` React face that once wrapped this class for | Reword | the `TreeItem` face that once wrapped this class for |
| 133 | `src/renderer/uikit/Tree/TreeItemView.ts:35` | strand mounted React roots on detached trees | Reword | strand mounted slot subtrees on detached trees |
| 134 | `src/renderer/uikit/Tree/TreeItemView.ts:39` | boxes in the React DOM (`<span className="tree-icon">` / `"tree-trailing"`) | Reword | boxes in the earlier DOM (`<span className="tree-icon">` / `"tree-trailing"`) |
| 135 | `src/renderer/uikit/Tree/TreeItemView.ts:40` | React rendered each only when its content was present | Reword | The earlier renderer attached each only when its content was present |
| 136 | `src/renderer/uikit/Tree/TreeItemView.ts:143` | must not enter the React-compatible residual-prop listener path. | Reword | must not enter the residual-prop listener path. |
| 137 | `src/renderer/uikit/Tree/TreeItemView.ts:223` | Transcribed from the React ternary chain | Reword | Transcribed from the former ternary chain |
| 138 | `src/renderer/uikit/Tree/TreeItemView.ts:303` | An icon *name* becomes a DOM `svg` with no React root. | Reword | An icon *name* becomes a DOM `svg`. |
| 139 | `src/renderer/uikit/Tree/TreeItemView.ts:354` | React rendered `{trailing != null && <span className="tree-trailing">…}`. | Reword | The earlier renderer attached `<span className="tree-trailing">…` when trailing content was present. |
| 140 | `src/renderer/uikit/Tree/TreeModel.ts:125` | replaces React's `useId` (EPIC-056 C3-5). | Reword | replaces the former generated-ID source (EPIC-056 C3-5). |
| 141 | `src/renderer/uikit/Tree/TreeModel.ts:762` | path that was NOT a React workaround. | Reword | path that was not a framework workaround. |
| 142 | `src/renderer/uikit/Tree/TreeView.ts:31` | the React DOM had none | Reword | the DOM contract has none |
| 143 | `src/renderer/uikit/Tree/TreeView.ts:51` | which is what the React version did, and what the repaint gate exists to stop. | Reword | which would repaint every visible cell on every update, and what the repaint gate exists to stop. |
| 144 | `src/renderer/uikit/Tree/TreeView.ts:56` | React returned three different | Reword | The prior implementation returned three different |
| 145 | `src/renderer/uikit/Tree/TreeView.ts:59` | React did. Keeping it alive behind `display: none` | Reword | The prior implementation did. Keeping it alive behind `display: none` |
| 146 | `src/renderer/uikit/Tree/TreeView.ts:138` | `contextmenu` is on all three React arms | Reword | `contextmenu` is on all three arms |
| 147 | `src/renderer/uikit/Tree/TreeView.ts:179` | React got that for free by re-rendering the whole root. | Reword | the previous renderer got that by rebuilding the whole root. |
| 148 | `src/renderer/uikit/Tree/TreeView.ts:219` | React expressed the arms as three | Reword | The prior implementation expressed the arms as three |
| 149 | `src/renderer/uikit/Tree/TreeView.ts:256` | all three React arms (Tree.tsx's three Root variants). | Reword | all three arms of the former tree renderer. |
| 150 | `src/renderer/uikit/Tree/TreeView.ts:344` | React would have added the unit itself. | Reword | the old style writer would have added the unit itself. |
| 151 | `src/renderer/uikit/Tree/TreeView.ts:373` | React wrote `draggable={canDrag || undefined}`. | Reword | The prior renderer omitted the attribute when dragging was disabled. |
| 152 | `src/renderer/uikit/Tree/TreeView.ts:485` | behaviourally identical to React's `undefined` handler | Reword | behaviorally identical to having no handler |
| 153 | `src/renderer/uikit/Tree/TreeView.ts:567` | what the React version's `setTimeout(0)` was approximating | Reword | what the previous `setTimeout(0)` was approximating |
| 154 | `src/renderer/uikit/Tree/TreeView.ts:616` | React adds `px` to a bare number in a style value; a DOM prop typed as a string cannot. | Reword | A DOM property typed as a string does not add `px` to a bare number; normalize numeric lengths before writing it. |
| 155 | `src/renderer/uikit/Tree/types.ts:168` | without a React root. Keep its identity stable while the same row remains visible. | Reword | without rebuilding its DOM subtree. Keep its identity stable while the same row remains visible. |
| 156 | `src/renderer/uikit/Tree/types.ts:175` | Optional right-side React compatibility slot for the default row renderer. | Reword | Optional right-side compatibility slot for the default row renderer. |
| 157 | `src/renderer/uikit/TruncatedText/TruncatedTextView.ts:70` | the React root it caches per host is discarded and the | Reword | the cached slot state is discarded and the |
| 158 | `src/renderer/uikit/VirtualGrid/types.ts:79` | model surface shared by the React and vanilla grid engines. | Reword | model surface shared by the imperative and DOM grid engines. |
| 159 | `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:12` | `rerender()` bumps state so React repaints | Reword | `rerender()` used state to request a repaint |
| 160 | `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:13` | `React.UIEvent` \| `Event` | Reword | `UIEvent` source \| `Event` source |
| 161 | `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:167` | `setProps` on every React render | Reword | `setProps` on every framework render |
| 162 | `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:171` | React's render phase — React was about to repaint regardless. | Reword | the render phase — a repaint was about to happen regardless. |
| 163 | `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:293` | reference relied on React re-running `setProps` to do this. | Reword | reference relied on `setProps` being run again to do this. |
| 164 | `src/renderer/uikit/VirtualGrid/VirtualGridView.ts:49` | the way a React host or a story reaches the imperative surface | Reword | the way an imperative host or a story reaches the imperative surface |
| 165 | `src/renderer/uikit/Autocomplete/Autocomplete.story.ts:17` | `"react hooks tutorial"`, `"react server components"` | Keep | Story sample search terms; not framework documentation or a mechanism. |
| 166 | `src/renderer/uikit/PathInput/PathInput.story.ts:25` | `"react"` | Keep | Story sample input; not a framework reference. |
| 167 | `src/renderer/uikit/Tag/Tag.story.ts:43` | `this.tagProps("react", true, this.props)` | Keep | Story sample tag value; not a framework reference. |
| 168 | `src/renderer/uikit/Tag/Tag.story.ts:60` | `this.tagProps("react", true, props)` | Keep | Story sample tag value; not a framework reference. |
| 169 | `src/renderer/uikit/Tag/Tag.story.ts:74` | `props.label ?? "react"` | Keep | Story sample label; not a framework reference. |
| 170 | `src/renderer/uikit/Tag/Tag.story.ts:81` | `props.label ?? "react"` | Keep | Story sample label; not a framework reference. |
| 171 | `src/renderer/uikit/Tag/Tag.story.ts:82` | `props.label ?? "react"` | Keep | Story sample label; not a framework reference. |
| 172 | `src/renderer/uikit/Tag/Tag.story.ts:98` | `default: "react"` | Keep | Story default label; not a framework reference. |
| 173 | `src/renderer/uikit/TagsInput/TagsInput.story.ts:9` | `flat: ["react", "typescript", ...]` | Keep | Story sample tag list; not a framework reference. |
| 174 | `src/renderer/uikit/TagsInput/TagsInput.story.ts:32` | `private tags: string[] = [..., "react"]` | Keep | Story sample tag list; not a framework reference. |
| 175 | `src/renderer/uikit/shared/drag-enter-counter.ts:3` | consumers should react only to the | Keep | Ordinary-English verb; it means “respond,” not the React framework. |
| 176 | `src/renderer/uikit/shared/tooltipRegistry.ts:62` | Capture phase also lets us react before downstream handlers. | Keep | Ordinary-English verb; it means “respond,” not the React framework. |
| 177 | `src/renderer/components/tree-provider/CategoryViewModel.ts:661` | handlers registered in `tree-context-menus.tsx` | Reword | handlers registered in `tree-context-menus.ts` |

The story rows with multiple sample values account for all 11 story-file occurrences; no additional
rows are needed for tokens on those lines. The two `react-slot` writer lines,
the three `vanilla-view.ts` lines, the four grid-context-menu lines, the two janitor lines, and the
two TreeProviderViewModel lines are intentionally absent from this table.

## Decoy inventory — 79 occurrences, untouched

The following per-file counts are the expected result of the decoy search above. This is a separate
inventory, not a change list. A post-edit verification must report the same 79 count and the same
matched source text per file; line numbers may move when a preceding comment is removed.

| File | Count | File | Count | File | Count |
|---|---:|---|---:|---|---:|
| `src/renderer/api/autoload-service.ts` | 1 | `src/renderer/api/board-install-registry.ts` | 1 | `src/renderer/api/board-trust.ts` | 3 |
| `src/renderer/api/board-updates.ts` | 3 | `src/renderer/api/internal/WindowStateService.ts` | 1 | `src/renderer/api/mneme-status.ts` | 1 |
| `src/renderer/api/pages/IPageHost.ts` | 2 | `src/renderer/api/pages/NavBackStack.ts` | 1 | `src/renderer/api/pages/PageModel.ts` | 4 |
| `src/renderer/api/published-boards.ts` | 3 | `src/renderer/api/tools/registered-tools.ts` | 2 | `src/renderer/api/tools/tool-log.ts` | 1 |
| `src/renderer/api/tools/tool-stats.ts` | 1 | `src/renderer/api/tools/tools-trust.ts` | 3 | `src/renderer/api/types/window.d.ts` | 2 |
| `src/renderer/api/window.ts` | 1 | `src/renderer/components/file-search/FileSearchModel.ts` | 1 | `src/renderer/editors/archive/ArchiveEditor.ts` | 1 |
| `src/renderer/editors/base/EditorModel.ts` | 4 | `src/renderer/editors/base/IContentHost.ts` | 1 | `src/renderer/editors/board/BoardEditorModel.ts` | 2 |
| `src/renderer/editors/board/ busy-boards.ts` | 2 | `src/renderer/editors/board/custom-editor-registry.ts` | 4 | `src/renderer/editors/board-info/BoardInfoEditorModel.ts` | 1 |
| `src/renderer/editors/explorer/ExplorerEditorModel.ts` | 3 | `src/renderer/editors/graph/GraphEditor.ts` | 1 | `src/renderer/editors/grid/GridEditor.ts` | 4 |
| `src/renderer/editors/link-editor/LinkEditor.ts` | 2 | `src/renderer/editors/link-editor/tor-src.ts` | 1 | `src/renderer/editors/log-view/LogViewEditor.ts` | 3 |
| `src/renderer/editors/markdown/MarkdownEditor.ts` | 2 | `src/renderer/editors/mermaid/MermaidEditor.ts` | 1 | `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts` | 2 |
| `src/renderer/editors/notebook/NotebookEditor.ts` | 1 | `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` | 1 | `src/renderer/editors/rest-client/RestClientEditor.ts` | 1 |
| `src/renderer/editors/toolset/ToolsetEditorModel.ts` | 1 | `src/renderer/ui/secondary-views/SecondaryViewsModel.ts` | 1 | `src/renderer/uikit/ListBox/ListBoxModel.ts` | 1 |
| `src/renderer/uikit/Select/SelectModel.ts` | 1 | `src/renderer/uikit/Select/SelectView.ts` | 1 | `src/renderer/uikit/shared/vanilla-view.ts` | 1 |
| `src/renderer/uikit/Tree/TreeModel.ts` | 3 | `src/renderer/uikit/Tree/types.ts` | 1 | `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts` | 1 |

The displayed file name `src/renderer/editors/board/ busy-boards.ts` has a formatting space only
to keep the table cell readable; the real path is `src/renderer/editors/board/busy-boards.ts`.
The table sums to 79 after excluding the one decoy in `editors/draw/DrawEditor.ts`.

## Concerns

- Do not turn “React” into “native” mechanically. For example, the `ListBox`/`Tree` comments
  preserve real reasons about pooled DOM identity, attribute removal, event gating, first usable
  measurement, and numeric CSS lengths; those reasons must survive in concrete wording.
- Do not alter the automation waits. Correction 2 says their reason is asynchronous CDP
  navigation, not a React effect. Only the two stale app-description strings are in this task.
- The stories contain user-visible sample values equal to `react`; changing them would change demo
  data without removing framework archaeology. Keep them and explain them as sample data.
- `src/renderer/editors/git-tree/**` was searched separately and has no exact-token hits. The nine
  historical comparisons named by EPIC-078 are in `src/renderer/components/git-tree/**`; do not
  assume the similarly named editor folder is the one to edit.
- No hit remains unclassified. The only non-source-path caveat is the explicit `CategoryViewModel`
  `.tsx` citation, which is classified as `Reword`.

## Acceptance criteria

1. The exact-token search and the supplementary `CategoryViewModel.ts` `.tsx` check have been
   accounted for by the inventory; every target row is `Delete`, `Reword`, or `Keep`.
2. Every `Reword` preserves the concrete behavior or constraint described in its replacement, and
   every `Delete` is pure archaeology.
3. The decoy search returns exactly 79 occurrences with the per-file counts above. Verification
   explicitly compares the pre-edit and post-edit matched text per file and confirms no decoy line
   was changed; target-hit removal alone is not sufficient.
4. `src/renderer/editors/draw/**`, `data-react-root`, both `react-slot` writers, and the explicit
   US-1222/EPIC-077 files are unchanged by US-1225.
5. The automation CDP waits and their `navigate()`-async justifications are unchanged.
6. No unit tests are added and no source behavior is implemented by this task; only the listed
   comments and the stale `.tsx` documentation citation are candidates for implementation.

## Files that need no changes

| Area | Files / paths |
|---|---|
| Sanctioned island | `src/renderer/editors/draw/**` |
| Other-task ownership | `src/renderer/uikit/shared/vanilla-view.ts`, `src/renderer/core/utils/performance-janitor.ts`, `src/renderer/ui/dialogs/poppers/grid-context-menu.ts`, `src/renderer/components/tree-provider/TreeProviderViewModel.ts` |
| DOM markers | `data-react-root`; `data-part="react-slot"` writers in `DialogView.ts` and `TagView.ts` |
| Git-tree folder with no hits | `src/renderer/editors/git-tree/**` |
| Sample-data rows | `Autocomplete.story.ts`, `PathInput.story.ts`, `Tag.story.ts`, `TagsInput.story.ts` — preserve their `react` sample values |

## Files Changed summary

| File / group | Planned change |
|---|---|
| `src/renderer/index.ts`, `src/renderer/api/app.ts`, `src/renderer/api/pages/PageModel.ts`, `src/renderer/theme/theme-state.ts` | Reword stale framework descriptions while retaining startup, identity, and synchronous-theme reasons. |
| `src/renderer/automation/commands.ts`, `src/renderer/automation/AppTargetModel.ts` | Reword app-surface descriptions only; no wait changes. |
| `src/renderer/components/page-manager/**`, `src/renderer/components/git-tree/**` | Reword native page-manager and prior-renderer comparisons. |
| `src/renderer/editors/archive/**`, `board/**`, `browser/**`, `explorer/**`, `graph/**`, `grid/**`, `html/**`, `link-editor/**`, `notebook/**`, `rest-client/**`, `tools/**`, `video/**` | Apply the line-level archaeology actions above; preserve behavior explanations. |
| `src/renderer/ui/app/MainPageView.ts`, `src/renderer/ui/sidebar/PinnedRailView.ts`, `src/renderer/ui/tabs/PageTabView.ts` | Reword prior-renderer explanations. |
| `src/renderer/uikit/Autocomplete/**`, `Button/**`, `Checkbox/**`, `DataGrid/**`, `IconButton/**`, `ImageViewport/**`, `Input/**`, `Label/**`, `ListBox/**`, `Menu/**`, `MultiListBox/**`, `MultiSelect/**`, `Notification/**`, `PathInput/**`, `Popover/**`, `ProgressBar/**`, `Select/**`, `Tree/**`, `TruncatedText/**`, `VirtualGrid/**`, `shared/element-id.ts`, `shared/highlight.ts`, `shared/overlayLayer.ts` | Delete or reword stale React comparisons and retain DOM/lifecycle/identity/sizing constraints. |
| `src/renderer/uikit/shared/fill-slot.ts` | No US-1225 change; its wording-only line was already corrected by US-1222. |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | Reword the deleted-file citation from `tree-context-menus.tsx` to `tree-context-menus.ts`. |
| Story files listed under “Files that need no changes” | No changes; sample values are kept. |
