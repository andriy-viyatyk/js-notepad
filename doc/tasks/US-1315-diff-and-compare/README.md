# US-1315: Diff — the file-diff facade, and compare mode on `pages`

Epic: [EPIC-086](../../epics/EPIC-086.md), task 6 of 8.

Status: Investigation complete; implementation has not started.

## Goal

Expose the existing `file-diff` editor through a concrete `page.editor` facade, and
expose compare mode as `pages.compare`, so callers can answer both “which revisions
is this diff between?” and “which pages are being compared?” without
`execute_script`.

This task is an API-surface and documentation change only at planning time. It must
not redesign the file-diff editor, compare editor, page lifecycle, or page manager.

## Background

### Epic decisions and current API

EPIC-086 decision 1 establishes `page.editor` as the editor facade surface and
`src/renderer/api/types/page.d.ts` as the discriminated-union contract. Decision 8
keeps editor-specific toolbar controls on the editor facade, navigation panels on
`page.panels`, and tab controls on `page.tab`. Decision 9 explicitly makes compare a
page mode hanging from `pages`, not an editor or a property of either page. Decision
10 makes `file-diff` an ordinary facade in `FACADE_FOR_EDITOR`; its Git revisions
panel remains available through `page.panels` and is cross-referenced by the facade.

The current fallback path is in
`src/renderer/scripting/api-wrapper/PageWrapper.ts`, where an editor without a
matching `FACADE_FOR_EDITOR` entry becomes `GenericEditorFacade`. `file-diff` is not
currently mapped, so it exposes only generic identity/summary data.

The existing `pages.openDiff({ firstPath, secondPath })` entry point is in
`src/renderer/api/pages/PagesLifecycleModel.ts`. Compare state is already projected by
`src/renderer/api/pages/PagesModel.ts` through `compareGroups`, `leftRight`,
`rightLeft`, and `query.isInCompareMode`; `PagesModel.enterCompareMode` and
`PagesModel.exitCompareMode` delegate to the existing layout model. The wrapper
surface is missing only the read/command node that presents this state.

### File-diff investigation

`src/renderer/editors/file-diff/FileDiffEditor.ts` stores the selected revisions as
`state.from` and `state.to`, using `ILinkDiffRevision`. `from` is the original/left
revision and `to` is the modified/right revision. The current defaults are staged on
the left and unstaged on the right when possible; if there is no staged change, the
editor selects the latest commit as the left revision. `to.kind === "unstaged"` is
also the existing editability test used by the file-diff body.

`src/renderer/editors/file-diff/FileDiffToolbarView.ts` contributes the two revision
pickers, whose stable names are declared by
`src/renderer/editors/file-diff/RevisionPickerView.ts`:

| Named surface | Owner | One-line purpose | Conditional visibility |
| --- | --- | --- | --- |
| `file-diff-picker-from` | File-diff toolbar | Open the popover for selecting the left/original revision. | Present while the file-diff toolbar is mounted. |
| `file-diff-picker-to` | File-diff toolbar | Open the popover for selecting the right/modified revision. | Present while the file-diff toolbar is mounted. |
| `text-compare-left` | Shared `TextChromeView` | Enter compare mode with the current file as the right page when a valid left grouping exists. | Only when the owner page is the right side of a comparable pair. |
| `text-show-resources` | Shared `TextChromeView` | Extract and open HTML resources for the current host. | Only when the host language is `html`. |

These are the four editor-owned actionable controls that belong in the facade’s
`elements`. The epic table’s count of five is reconciled by the file-diff-local
surface inventory below: the fifth named item is the Git revisions panel root. It is
not a fifth facade element because decision 10 requires that panel to remain under
`page.panels`.

The remaining named file-diff surfaces are panel or structural surfaces:

| Named surface | Owner | One-line purpose | Facade treatment |
| --- | --- | --- | --- |
| `git-diff-revisions` | `GitDiffRevisionsSecondaryView` | Show file history and revision-side selection. | Cross-reference `page.panels`; do not duplicate it in `page.editor.elements`. |
| `git-diff-revisions-refresh` | Git revisions panel | Refresh the file-history tree. | Reachable below the referenced panel node. |
| `git-diff-revisions-tree` | Git revisions panel | Display commits/revisions available to the diff. | Reachable below the referenced panel node. |
| `file-diff-body` | File-diff body | Host the empty state or the two diff editors. | Structural; not an element declaration. |
| `file-diff-empty` | File-diff empty state | Explain that no diff is available and offer the text editor. | Structural; not an element declaration. |

The `file-diff` facade should therefore expose `from`, `to`, `hasStaged`, and
`readOnly` as live state, plus the four editor-owned controls above. Until the
file-diff host is attached and revision/default initialization has completed, all
four state getters return `undefined`; they must not expose the model defaults
(`{ kind: "staged" }`, `{ kind: "unstaged" }`, or `false`) as if they were resolved
revisions. Once resolved, `from` and `to` return the selected `ILinkDiffRevision`
values, `hasStaged` returns the detected boolean, and `readOnly` returns
`to.kind !== "unstaged"`. It should not
re-list the Git revisions panel or invent a name for its individual row-side
toggles, which do not have stable `data-name` attributes. The page already supplies
the file path, so a duplicate facade `filePath` member is unnecessary.

`src/renderer/editors/base/TextChromeView.ts` confirms that the shared compare and
HTML-resource controls are mounted for text-host editors, including `FileDiffEditor`.
Its script controls are not applicable because `FileDiffEditor` does not implement
`runScript`. The file-diff registry in
`src/renderer/editors/register-editors.ts` already uses dynamic `import()` for the
file-diff editor module and already registers `git-diff-revisions` as a secondary
view.

### Compare investigation and DOM scope

The source path named by the epic has moved: the implementation is
`src/renderer/ui/app/PageContentView.ts`. Its `sync()` calls
`pagesModel.query.isInCompareMode(page.id)`. When the returned pair is active, only
when `compareInfo.leftId === page.id` does it call `updateCompare(...)` and append a
`CompareEditor` to that `PageContentView`; the right page clears its compare view.
`CompareEditor` is constructed with the left model, right/grouped model, and
`leftPageId`.

`PageContentView.root` is appended to the page slot by
`src/renderer/components/page-manager/PageSlot.ts`. That slot carries
`data-name="page-slot"` and `data-page-id=<page id>`. Consequently, although compare
is conceptually a mode for a pair, the live `CompareEditor` DOM is physically inside
one page slot: the left slot. `GroupContainer.ts` keeps the right slot hidden while
compare mode is active. The right slot contains no `CompareEditor` DOM.

This answers the first required scoping question: `pages.compare.elements` must use
`pageScopeSelector(leftPageId)` for the active pair. It must not scope to the right
page, and it must not use an unscoped document selector. If there is no active pair,
there is no live compare root and the compare elements are not visible.

`src/renderer/editors/compare/CompareEditor.ts` already provides exactly two stable
controls:

| Named surface | One-line purpose | Conditional visibility |
| --- | --- | --- |
| `compare-root` | Identify the mounted compare surface containing the side-by-side diff and its toolbar. | Only while the active pair is in compare mode, under the left page slot. |
| `compare-exit` | Leave compare mode for the active pair. | Only while `compare-root` is mounted. |

`compare-exit` calls `pagesModel.exitCompareMode(this.leftPageId)`. The compare node
should preserve this two-control inventory; the left/right labels and Monaco host
are useful content inside the root but have no stable named element contract today.
No `data-name` additions are required for the requested surface, and existing
`data-type` attributes must not be renamed.

The compare node’s `pairs` projection should iterate the left ids in
`PagesModel.compareGroups`, resolve the right id through `leftRight`, and filter out
missing pages. Each record should state the pair unambiguously with
`leftPageId`, `rightPageId`, `leftTitle`, `rightTitle`, and the corresponding
`leftFilePath`/`rightFilePath` values when available. This makes side identity
explicit instead of requiring a caller to infer it from map direction. The existing
`rightLeft` map remains useful for accepting either page id in commands and for
resolving an active pair.

This answers the second required scoping question: highlighting a compare element
must use the same activate-then-wait-for-layout treatment established by US-1311.
The target is the left page, because that is the slot containing `CompareEditor`.
When the active page is the right member, `highlight` must activate/show the left
page and wait for its `[data-page-id][data-name="page-slot"]` layout before
highlighting. It must never activate the right page for this purpose. When no
compare pair is active, the normal not-found result is appropriate.

### Existing resolver and type patterns

`src/renderer/scripting/ai-vision/elements.ts` accepts a `scopeSelector` and resolves
visibility against that scope. `src/renderer/scripting/ai-vision/page-elements.ts`
provides `pageScopeSelector(pageId)` and
`activatePageAndWaitForLayout(pageId)`. `PagePanelsNode` and `PageEditorSwitchesNode`
are the page-scoped precedents; `TextEditorFacade` is the editor-facade precedent.
The new file-diff facade and compare node should reuse these helpers.

`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` declares pages members
through `PAGES_MEMBERS`, exposes child nodes through getters, and resolves them via
`aiVision`. The new `compare` child belongs there, alongside the existing page
collection commands. It is not a child of `PageWrapper`.

`src/renderer/api/types/` is canonical. The generated declarations under
`assets/editor-types/` must never be edited by hand. The generation command is
`npm run build-prod`: `vite.renderer.config.ts` runs the editor-types plugin at Vite
`buildStart`, copying canonical declarations and maintaining `_imports.txt`.
Implementation verification should regenerate the expected files with that command
and check that the generated output is synchronized.

## Implementation Plan

### 1. Add the file-diff facade

Create
`src/renderer/scripting/api-wrapper/FileDiffEditorFacade.ts`, following the
page-scoped `TextEditorFacade` pattern and importing `FileDiffEditor` as a type so
facade loading does not pull editor code into the API bundle.

The facade should:

- expose `id: "file-diff"`, the registered display `name`, live `from`, `to`,
  `hasStaged`, and `readOnly` values;
- expose `elements` and `highlight` for the four editor-owned controls;
- scope element selectors to the owning page using `pageScopeSelector`; and
- include `$help` that names the two picker popovers, explains the conditional shared
  controls, and cross-references `page.panels` for `git-diff-revisions` rather than
  presenting a duplicate panel API.

The facade should use the editor’s public state/getters rather than reaching into
DOM text. The `$help` should name the File History panel and its
`git-diff-revisions-refresh` and `git-diff-revisions-tree` descendants as panel-owned
controls. The picker controls open popovers, not dialogs or menus; the help should
say so without claiming a dialog/menu surface that does not exist. `text-show-resources`
opens the extracted resource pages, and `text-compare-left` enters compare mode.

Because `FileDiffEditor` currently initializes `from`, `to`, and `hasStaged` with
placeholder defaults before asynchronous repository/revision discovery completes,
add a small derived readiness signal to
`src/renderer/editors/file-diff/FileDiffEditor.ts` (or an equivalent public
resolved-state getter). It must be false while the host is detached, Git/file
identity is unresolved, or `initDiffDefaults()` is still pending, and true only
after the revision state has been resolved. The facade gates all four state getters
on that signal; it must not expose the placeholder values as facts. This is a
lifecycle/readiness support change, not a change to the diff UI or revision
semantics.

Relevant shape before implementation:

```ts
// PageWrapper.ts — current fallback
const factory = FACADE_FOR_EDITOR[editor.id];
return factory ? factory(editor, id, name) : new GenericEditorFacade(editor, id, name);
```

Required shape after implementation:

```ts
// FileDiffEditorFacade.ts — proposed facade-owned inventory
const FILE_DIFF_ELEMENTS = [
  { name: "text-compare-left", purpose: "Compare with the grouped left page." },
  { name: "text-show-resources", purpose: "Open resources extracted from HTML." },
  { name: "file-diff-picker-from", purpose: "Choose the original revision." },
  { name: "file-diff-picker-to", purpose: "Choose the modified revision." },
];
```

The actual declarations must use the existing `createElements` contract and real
selectors, not this shortened planning snippet. Do not add hardcoded colours or new
visual styling.

### 2. Map `file-diff` in `PageWrapper`

Update `src/renderer/scripting/api-wrapper/PageWrapper.ts` to:

- import the concrete `FileDiffEditor` model as a type;
- import `FileDiffEditorFacade` as the runtime facade implementation;
- add the facade to the `EditorFacade` union; and
- add a `"file-diff"` entry to `FACADE_FOR_EDITOR`.

Current `PageWrapper.ts:40-64` (the real pre-change excerpt):

```ts
type EditorOrHost = EditorModel | TextFileModel;
type EditorFacade =
    | TextEditorFacade | GridEditorFacade | NotebookEditorFacade | LinkEditorFacade
    | MarkdownEditorFacade | SvgEditorFacade | HtmlEditorFacade | MermaidEditorFacade
    | GraphEditorFacade | DrawEditorFacade | BrowserEditorFacade | McpInspectorFacade
    | ImageEditorFacade | GenericEditorFacade;
type EditorFacadeFactory = (editor: EditorModel, id: string, name: string) => EditorFacade;

const FACADE_FOR_EDITOR: Record<string, EditorFacadeFactory> = {
    "monaco": (editor, id, name) => new TextEditorFacade(editor as MonacoEditor, id, name),
    "grid-json": (editor, id, name) => new GridEditorFacade(editor as GridEditor, id, name),
    "grid-csv": (editor, id, name) => new GridEditorFacade(editor as GridEditor, id, name),
    "grid-jsonl": (editor, id, name) => new GridEditorFacade(editor as GridEditor, id, name),
    "notebook-view": (editor, id, name) => new NotebookEditorFacade(editor as NotebookEditor, id, name),
    "link-view": (editor, id, name) => new LinkEditorFacade(editor as LinkEditor, id, name),
    "md-view": (editor, id, name) => new MarkdownEditorFacade(editor as MarkdownEditor, id, name),
    "svg-view": (editor, id, name) => new SvgEditorFacade(editor as SvgEditor, id, name),
    "html-view": (editor, id, name) => new HtmlEditorFacade(editor as HtmlEditor, id, name),
    "mermaid-view": (editor, id, name) => new MermaidEditorFacade(editor as MermaidEditor, id, name),
    "graph-view": (editor, id, name) => new GraphEditorFacade(editor as GraphEditor, id, name),
    "draw-view": (editor, id, name) => new DrawEditorFacade(editor as DrawEditor, id, name),
    "browser-view": (editor, id, name) => new BrowserEditorFacade(editor as unknown as BrowserEditorModel, id, name),
    "mcp-view": (editor, id, name) => new McpInspectorFacade(editor as unknown as McpInspectorEditorModel, id, name),
    "image-view": (editor, id, name) => new ImageEditorFacade(editor as unknown as ImageEditor, id, name),
};
```

Required edit to that real excerpt:

```ts
type EditorFacade =
    // ...the fourteen existing members above...
    | ImageEditorFacade | FileDiffEditorFacade | GenericEditorFacade;

const FACADE_FOR_EDITOR: Record<string, EditorFacadeFactory> = {
    // ...the existing entries above remain unchanged...
    "file-diff": (editor, id, name) => new FileDiffEditorFacade(editor as FileDiffEditor, id, name),
};
```

Use the repository’s existing typing style for the factory map rather than weakening
it with broad casts. The result must be reachable as `page.editor` for a page whose
editor id is `file-diff`.

### 3. Add canonical file-diff types and regenerate declarations

Create `src/renderer/api/types/file-diff-editor.d.ts` with an `IFileDiffEditor`
discriminated by `id: "file-diff"`, importing `ILinkDiffRevision` from
`io.link-data` and the existing highlight result type from `ui`. Add that interface
to the `IEditorFacade` union and add `"file-diff"` to `IFacadeEditorId` in
`src/renderer/api/types/page.d.ts`.

Before:

```ts
export type IEditorFacade =
  | ITextEditor
  | IMarkdownEditor
  // ...existing concrete facades
  | IGenericEditor;
```

After:

```ts
export type IEditorFacade =
  | ITextEditor
  | IFileDiffEditor
  | IMarkdownEditor
  // ...existing concrete facades
  | IGenericEditor;
```

The new interface should make the readiness-aware state explicit:

```ts
readonly from: ILinkDiffRevision | undefined;
readonly to: ILinkDiffRevision | undefined;
readonly hasStaged: boolean | undefined;
readonly readOnly: boolean | undefined;
```

Before revision resolution, all four are `undefined`. After resolution, `readOnly`
is derived from the resolved `to` value as `to.kind !== "unstaged"`. Also expose
`elements` and `highlight` with the existing element contract. Do not hand-edit
`assets/editor-types/`; after the canonical source changes, run `npm run build-prod`
to regenerate its copies and `_imports.txt`.

### 4. Add `pages.compare` and its canonical types

Create `src/renderer/scripting/ai-vision/page-compare.ts` with a
`CompareModeNode`. It should be a global pages child, use the existing `PagesModel`
query/state/actions, and expose:

- `pairs`: live records with explicit left/right page ids, titles, and paths;
- `enter(pageId)`: resolve either a left or right member, preflight that a grouped
  pair exists and that `query.canCompare(leftPageId, rightPageId)` succeeds, then
  delegate to the existing `PagesModel.enterCompareMode(pageId)`. On missing
  grouping, throw a diagnostic naming the requested/resolved page id and stating
  that no grouped pair exists. On a failed `canCompare` check, throw a diagnostic
  naming both resolved page ids and stating that the pair is not comparable. If a
  state race makes the delegated action return `false` after those checks, throw a
  diagnostic rather than returning a bare `false`; successful entry returns `void`.
- `exit(pageId)`: require that the requested page belongs to a pair and that the
  pair is currently in compare mode, then call `PagesModel.exitCompareMode(pageId)`
  and return `void`. If there is no pair or compare mode is inactive, throw a
  diagnostic naming the requested/resolved page ids. `exitCompareMode` itself is
  already documented at `PagesLayoutModel.ts:238-239` as accepting either side, so
  no side normalization is needed before this call; it has no boolean return value.
- `elements`/`highlight`: exactly `compare-root` and `compare-exit`, scoped to the
  active pair’s left page.

The node should derive pair membership from `compareGroups`, `leftRight`, and
`rightLeft`, rather than maintaining another compare registry. It should tolerate a
stale/missing page while projecting `pairs` and omit incomplete records. The active
pair can be resolved from `pagesModel.activePage?.id` on either side; the selector
scope is then `pageScopeSelector(leftPageId)`. Pass
`beforeHighlight: () => activatePageAndWaitForLayout(leftPageId)` to
`createElements` when an active pair exists. This is the only activation required:
if the active page is right, activate the left slot; if it is already left, wait for
that same left slot. Do not activate both pages or mutate compare state merely to
highlight.

Create `src/renderer/api/types/compare.d.ts` for `IComparePair` and `ICompareMode`,
and add `readonly compare: ICompareMode` to `src/renderer/api/types/pages.d.ts`.
The pair type should carry explicit side fields, for example:

```ts
export interface IComparePair {
  readonly leftPageId: string;
  readonly rightPageId: string;
  readonly leftTitle: string;
  readonly rightTitle: string;
  readonly leftFilePath?: string;
  readonly rightFilePath?: string;
}
```

The canonical mode contract must describe both commands as `void` operations whose
successful completion is implicit; neither returns the underlying layout model’s
boolean (and `exitCompareMode` has no boolean to return):

```ts
import type { IHighlightResult } from "./ui";

export interface ICompareMode {
  readonly pairs: readonly IComparePair[];
  enter(pageId: string): void;
  exit(pageId: string): void;
  readonly elements: readonly {
    readonly name: string;
    readonly purpose: string;
    readonly selector: string;
    readonly visible: boolean;
  }[];
  highlight(name: string, message?: string): Promise<IHighlightResult>;
}
```

The runtime node preflights both commands and throws the diagnostics described
above for an absent pair, failed comparability, or inactive compare mode.

Update `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` by adding a
`compare` member descriptor to `PAGES_MEMBERS`, adding the corresponding getter, and
including help that points callers to `pages.compare.pairs`, `enter`, `exit`, and the
two compare elements. Keep `pages.openDiff({ firstPath, secondPath })` documented as
an existing path-based entry point that opens/groups pages and enters compare mode;
the new node is the inspection/control surface, not a replacement for that method.

Before:

```ts
const PAGES_MEMBERS = [
  // page collection members and existing actions
];

// PageCollectionWrapper has no compare getter
```

After:

```ts
const PAGES_MEMBERS = [
  // existing members
  { name: "compare", kind: "property", node: true },
];

get compare(): CompareModeNode {
  return new CompareModeNode(this.pagesModel);
}
```

Use the wrapper’s actual model property/getter names when implementing; the snippet
shows the required resolver shape, not a license to introduce a second model. The
node is intentionally not exposed from `PageWrapper`.

### 5. Preserve loading and error conventions

Keep editor module loading dynamic: any editor implementation/view imports added by
this task must use `import()`, consistent with `register-editors.ts`. Facades should
use `import type` for editor models wherever possible. If a boundary catches an
unknown value, report it through the project’s `errMessage` helper rather than
assuming it is an `Error`. Use `file-path` for path manipulation; do not add
`require("path")` or a Node path dependency to renderer scripting code.

No unit tests or test harnesses are in scope. Verification is limited to type/lint or
production-build checks appropriate to the implementation, generated declaration
synchronization, and the manual surface scenarios below.

### 6. Add manual surface QA

Create `qa/surfaces/editors/diff.md`, following the heading and
`**Preparation:**` / `**Call:**` / `**Verify:**` format in
`qa/surfaces/page.md`. The planned scenarios are:

## Test D.1 — file-diff revision identity

**Preparation:** Open a repository file with the `file-diff` editor and ensure both
revision pickers have initialized.

**Call:** Resolve `page.editor` and inspect `id`, `from`, `to`, `hasStaged`, and
`readOnly`.

**Verify:** `id` is `file-diff`; `from` and `to` identify the actual revisions shown
by the diff; and `readOnly` agrees with whether `to.kind` is `unstaged`. No
`execute_script` is needed.

## Test D.2 — file-diff controls and panel cross-reference

**Preparation:** Keep the file-diff page active, with a repository that has file
history available.

**Call:** Inspect `page.editor.elements`, highlight each available editor-owned
control, then inspect `page.panels` and expand `git-diff-revisions`.

**Verify:** The facade exposes the two revision pickers and only the applicable shared
controls; the Git revisions panel is reachable once through `page.panels`, with its
refresh/tree descendants, and is not duplicated in `page.editor.elements`.

## Test D.3 — compare pair identity and entry/exit

**Preparation:** Open two compatible text pages, or call
`pages.openDiff({ firstPath, secondPath })`.

**Call:** Inspect `pages.compare.pairs`, call `pages.compare.enter(pageId)` with each
side in turn, inspect `pages.compare.elements`, highlight `compare-root` and
`compare-exit`, then call `pages.compare.exit(pageId)` from either side. Also attempt
`enter()` on an ungrouped page, on a grouped but non-comparable pair, and `exit()` on
a page with no active compare mode.

**Verify:** Each pair identifies left and right page ids/titles/paths explicitly;
enter/exit accepts either member; failed `enter()` calls throw diagnostics that
distinguish missing grouping from failed comparability and name the resolved page
ids; failed `exit()` calls throw a diagnostic for the missing/inactive pair; the
compare elements become visible only while the pair is in compare mode; and leaving
compare removes the compare surface. The inspection answers which pages are
compared without `execute_script`.

## Test D.4 — compare highlight scope from the right page

**Preparation:** Enter compare mode and make the right page the active/selected page
if the page manager permits that state.

**Call:** Highlight `pages.compare`’s `compare-root` or `compare-exit`.

**Verify:** The left page slot is activated/shown and allowed to lay out before the
highlight is resolved; the target is found under the left page’s `data-page-id`; the
right slot is not incorrectly used as the selector scope; and no second
`CompareEditor` is mounted.

The QA file is a task-owned surface file. `qa/surfaces/README.md` remains unchanged
here; its aggregate index entry belongs to the epic’s documented index task (US-1317)
following the existing surface-task precedent.

## Concerns

### Resolved scope questions

- **Which slot owns compare DOM?** `CompareEditor` is appended by the left page’s
  `PageContentView`, and that view is under the left `PageSlot`. The right slot is
  hidden and has no compare editor. `pages.compare.elements` therefore use
  `pageScopeSelector(leftPageId)`.
- **Does compare highlight activate a page?** Yes. It uses
  `activatePageAndWaitForLayout(leftPageId)` as `createElements.beforeHighlight`.
  This applies whether the current active page is the left or right member. It never
  activates the right page for compare highlighting.
- **What does the epic’s file-diff count mean?** The facade’s `elements` list has
  four entries. The verified local named inventory has five meaningful file-diff
  surfaces only when the `git-diff-revisions` panel root is counted. The epic table’s
  five is therefore an over-count for the facade specifically; the orchestrator
  should add that correction/note to the epic table, not this task document editing
  `doc/epics/EPIC-086.md`. The panel root and its children stay under `page.panels`
  by decision 10. Compare’s epic count of two is confirmed by the two stable names
  in `CompareEditor.ts` and needs no correction.
- **What do file-diff state getters return before resolution?** `from` and `to`
  return `undefined` until the host is attached and revision/default initialization
  completes; `hasStaged` returns `undefined` until index-vs-HEAD detection completes;
  and `readOnly` returns `undefined` until `to` is resolved. Afterward they return,
  respectively, the selected revisions, the detected boolean, and
  `to.kind !== "unstaged"`. The facade must not leak the model’s initial staged,
  unstaged, or `false` placeholders.
- **Are new `data-name` attributes needed?** No. The two compare names and four
  file-diff/shared actionable names already exist. `file-diff-body` and
  `file-diff-empty` are structural names, and `data-type` values remain untouched.
- **What is conditional?** Picker visibility follows the mounted file-diff toolbar;
  `text-compare-left` requires a valid comparable left grouping;
  `text-show-resources` requires HTML language; compare elements require an active
  compare pair and are scoped to its left page; the Git revisions panel follows
  panel registration/adoption and repository availability.
- **Are there dialogs or menus?** The revision pickers are popovers containing a
  tree. The file-history panel is a panel, and compare exit is an inline button.
  `$help` must name these actual surfaces and must not promise dialog/menu nodes.
- **What is the generated-type boundary?** Canonical declarations are only under
  `src/renderer/api/types/`; `assets/editor-types/` is build output from
  `npm run build-prod` and must not be hand-edited.
- **What happens when an action cannot proceed?** `pages.compare.enter()` and
  `pages.compare.exit()` preflight their inputs and throw diagnostics naming the
  requested/resolved page ids and failed condition. They do not turn a failed action
  into a bare `false` or silent no-op.

### Implementation risks and constraints

- Pair maps are directional. `compareGroups` contains left ids, so pair projection
  must use `leftRight`; command methods must normalize either side through
  `leftRight`/`rightLeft` before invoking the existing model actions.
- Compare DOM is transient. Element declarations should be recomputed or resolved
  against the current active pair rather than caching a page id across page switches.
- A compare root is inside a page slot whose parent may be hidden until page-manager
  activation completes. The existing US-1311 layout wait is required before
  highlighting.
- File-diff revision state is asynchronous during repository adoption and default
  initialization. The facade should expose the live model values and allow the
  normal unavailable/empty state; it should not infer revisions from labels or DOM.
- Keep the implementation free of hardcoded colours. Reuse existing UI contracts and
  highlighter behavior.
- Do not add unit tests or a test harness for this task. Manual QA is the required
  surface verification.
- Use `errMessage` for caught values, `file-path` instead of `require("path")`, and
  dynamic `import()` for editor code.
- `doc/active-work.md` and `doc/epics/EPIC-086.md` are orchestrator-owned and are
  explicitly outside this task’s edits.

## Acceptance Criteria

- [ ] A page using editor id `file-diff` returns a concrete `FileDiffEditorFacade`
  from `page.editor`, with discriminant `id: "file-diff"`, rather than
  `GenericEditorFacade`.
- [ ] `page.editor.from` and `page.editor.to` expose the actual
  `ILinkDiffRevision` values shown by the diff after resolution, while both return
  `undefined` before the host/revisions are ready. `hasStaged` likewise returns
  `undefined` until detection completes, then exposes the detected boolean;
  `readOnly` returns `undefined` until `to` is resolved, then reflects
  `to.kind !== "unstaged"`.
- [ ] `page.editor.elements` contains the four editor-owned named controls:
  `file-diff-picker-from`, `file-diff-picker-to`, `text-compare-left`, and
  `text-show-resources`, with one-line purposes, real selectors, and conditional
  visibility. The inventory does not pretend that structural roots are controls.
- [ ] `$help` explains the picker popovers and shared controls and cross-references
  `page.panels` for `git-diff-revisions`, including its refresh/tree descendants.
  The revision question is answerable without `execute_script`.
- [ ] `pages.compare` resolves as a child of the pages collection, not as a page
  member, and its `pairs` records explicitly identify both compared pages and their
  left/right sides.
- [ ] `pages.compare.enter(pageId)` and `pages.compare.exit(pageId)` accept either
  member of a pair and delegate to existing compare-mode state/actions. `enter()`
  preflights grouping and `canCompare`, throwing diagnostics that distinguish those
  failures and name resolved ids; `exit()` returns `void` on success and throws for
  no pair or inactive compare mode. The existing `pages.openDiff({ firstPath,
  secondPath })` flow remains valid.
- [ ] `pages.compare.elements` exposes exactly `compare-root` and `compare-exit`,
  with selectors scoped to the active pair’s left `data-page-id`. It is empty/not
  visible without an active pair.
- [ ] Highlighting a compare element activates the left page slot and waits for
  layout, including when the right page was active; it never scopes to or activates
  the right slot and does not mount a duplicate compare editor.
- [ ] Canonical declarations under `src/renderer/api/types/` include the new
  discriminated file-diff facade and compare node, and `npm run build-prod`
  regenerates synchronized `assets/editor-types/` output. Generated files are not
  hand-edited.
- [ ] `qa/surfaces/editors/diff.md` contains the four manual scenarios in the
  project’s page-surface format. No unit tests or test harnesses are added.
- [ ] Implementation follows the stated constraints: no hardcoded colours,
  `errMessage` for caught values, `file-path` over `require("path")`, and dynamic
  `import()` for editor code.

## Files that need NO changes

The following files were verified and should remain unchanged by US-1315 because
existing behavior already provides the required source of truth or the file is owned
by another task:

- `src/renderer/api/pages/PagesModel.ts`,
  `src/renderer/api/pages/PagesQueryModel.ts`,
  `src/renderer/api/pages/PagesLayoutModel.ts`, and
  `src/renderer/api/pages/PagesLifecycleModel.ts` — compare maps, queries, enter/exit
  actions, and `openDiff` already exist.
- `src/renderer/ui/app/PageContentView.ts`, `src/renderer/ui/app/PagesView.ts`,
  `src/renderer/components/page-manager/PageSlot.ts`, and
  `src/renderer/components/page-manager/GroupContainer.ts` — existing mounting and
  left-slot ownership are sufficient.
- `src/renderer/editors/compare/CompareEditor.ts` — `compare-root` and
  `compare-exit` already have stable names.
- `src/renderer/editors/file-diff/FileDiffToolbarView.ts`,
  `RevisionPickerView.ts`, `GitDiffRevisionsSecondaryView.ts`, and
  `src/renderer/editors/file-diff/index.ts` — existing controls, panel, and module
  boundaries are sufficient for a facade. `FileDiffEditor.ts` is intentionally
  excluded because it needs the small readiness signal described in the plan.
- `src/renderer/editors/register-editors.ts` — `file-diff` and its secondary panel
  are already registered, with dynamic editor loading.
- `src/renderer/scripting/ai-vision/elements.ts`, `page-elements.ts`, and
  `page-panels.ts` — US-1311’s scoped-element and layout-wait helpers already apply.
- `doc/architecture/ui-element-contract.md` — the page-slot scope and existing names
  are already covered; no contract rename or new attribute is needed.
- `assets/mcp-res-ui-editors.md`, `docs/editors.md`, and
  `docs/tabs-and-navigation.md` — existing user-facing documentation already
  describes Git Diff and Compare Mode; this task adds the scripting surface.
- `qa/surfaces/README.md` — the aggregate editor index entry is deferred to US-1317,
  consistent with the existing surface-task precedent.
- `assets/editor-types/` — generated output is a build artifact and is never edited
  directly.
- `doc/active-work.md` and `doc/epics/EPIC-086.md` — explicitly owned by the
  orchestrator and prohibited from this task.

## Files Changed Summary

| File | Planned change |
| --- | --- |
| `src/renderer/scripting/api-wrapper/FileDiffEditorFacade.ts` | New concrete file-diff facade, readiness-aware state projection, four editor-owned elements, scoped highlight, and help. |
| `src/renderer/editors/file-diff/FileDiffEditor.ts` | Expose/maintain the derived revision-readiness signal so placeholder defaults are not surfaced as resolved state. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Add the file-diff facade to the union and `FACADE_FOR_EDITOR`. |
| `src/renderer/api/types/file-diff-editor.d.ts` | New canonical `IFileDiffEditor` contract. |
| `src/renderer/api/types/page.d.ts` | Add the `file-diff` discriminant and facade union member. |
| `src/renderer/scripting/ai-vision/page-compare.ts` | New global `pages.compare` node with pair projection, commands, elements, and left-slot scope. |
| `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` | Declare and expose the `compare` child and its help. |
| `src/renderer/api/types/compare.d.ts` | New canonical compare pair/mode contract. |
| `src/renderer/api/types/pages.d.ts` | Add `pages.compare` to the canonical pages contract. |
| `qa/surfaces/editors/diff.md` | New manual QA scenarios D.1–D.4 in the page-surface format. |
| `assets/editor-types/file-diff-editor.d.ts`, `compare.d.ts`, updated `page.d.ts`, `pages.d.ts`, `_imports.txt` | Generated by `npm run build-prod`; never hand-edited. |
| `doc/tasks/US-1315-diff-and-compare/README.md` | This investigation and implementation plan. |

No product implementation, generated declaration, QA, epic, or active-work file has
been changed while preparing this task document.
