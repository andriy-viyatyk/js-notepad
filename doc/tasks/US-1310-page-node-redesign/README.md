# US-1310: The page node redesign

Epic: [EPIC-086](../../epics/EPIC-086.md) — Task 1 of the text-and-preview editor family through `call`.

Status: Implemented

## Goal

Replace the page scripting facade's method-shaped editor API with a structural node:

```ts
page.editor              // the current editor facade, including a minimal generic facade
page.editorSwitches      // the toolbar's editor-switch node
```

`page.editor` is read-only and is narrowed by its `id`. Every facade exposes `id` and the
registry display `name`; editors without operations yet return a minimal generic facade whose
help says so explicitly. `page.editorSwitches` exposes the current editor,
the same switch candidates as the toolbar, and an unrestricted `switchTo(id)` operation.
All `as*()` page methods, their type declarations, help text, examples, and QA/documentation
references are removed or rewritten for the 5.0.0 breaking release. There is no compatibility
layer: the simplified API is changed in place.

## Background

### Current page shape and the 13 reusable facades

`src/renderer/scripting/api-wrapper/PageWrapper.ts` currently makes `editor` a writable
`EditorView`-typed property whose getter returns `currentEditorId()` (an editor-id string)
and whose setter calls `page.switchMainEditor(value)`. The same class publishes thirteen
`as*()` members in `PAGE_MEMBERS`, documents them in `PAGE_HELP`, constructs them through
`FACADE_FOR_EDITOR`, and adds only the matching facade as a live AI-vision child in
`aiChildren()`. Its `mainEditor` getter resolves `pagesModel.findPage(pageId)?.mainEditorInstance`.

The existing facade classes are reusable as-is for their editor operations. The implementation
must add metadata without duplicating those classes:

| Editor id(s) | Existing facade | Registry names (verified in `register-editors.ts`) |
|---|---|---|
| `monaco` | `TextEditorFacade` | Text Editor |
| `grid-json`, `grid-csv`, `grid-jsonl` | `GridEditorFacade` | Grid (JSON), Grid (CSV), Grid (JSONL) |
| `notebook-view` | `NotebookEditorFacade` | Notebook |
| `link-view` | `LinkEditorFacade` | Links |
| `md-view` | `MarkdownEditorFacade` | Preview |
| `svg-view` | `SvgEditorFacade` | Preview |
| `html-view` | `HtmlEditorFacade` | Preview |
| `mermaid-view` | `MermaidEditorFacade` | Mermaid |
| `graph-view` | `GraphEditorFacade` | Graph |
| `draw-view` | `DrawEditorFacade` | Drawing |
| `browser-view` | `BrowserEditorFacade` | Browser |
| `mcp-view` | `McpInspectorFacade` | MCP Inspector |
| `image-view` | `ImageEditorFacade` | Image Viewer |

Replace the current two-field `FACADE_FOR_EDITOR` metadata map with one map from editor id
to a factory. Each factory must construct the appropriate existing facade and pass or assign
the concrete id plus `editorRegistry.getById(id).name`. The map should be the single source of
construction decisions, including the three grid ids and the browser/image/MCP model casts.
Do not introduce dynamic imports or a second facade-selection table.

The registry also contains editors without one of these operation facades, including `video-view`
and `file-diff`, and custom board editor ids. The new getter must still return a
`GenericEditorFacade` with `kind: "Editor"`, only `id` and `name`, and `$help` stating that the
editor exposes no operations yet. This is an honest identity node, not an operation facade:
agents can learn what the page shows without attempting unsupported members. Browser, image, and
MCP are not exceptions to the new shape: they remain the specialized existing facade classes
selected by the factory map. The later editor-surface tasks can replace generic entries with
operation facades and extend the discriminated union.

`GroupedPageWrapper` currently only changes content access; it inherits the page editor methods.
The redesigned `.editor` and `.editorSwitches` therefore apply to grouped pages through the
same `PageWrapper` path. `PageCollectionWrapper` does not use `as*()` to create or open pages;
its changes are limited to help text and the AI-vision summary, which currently interpolates
`page.editor` as though it were a scalar.

### Toolbar switch behavior and the epic decision discrepancy

`src/renderer/editors/base/PageToolbarView.ts` contains `SwitchWidgetView`, whose
`syncSegments()` is the authoritative current toolbar projection. Its verified inputs are:

1. For a `TextFileModel`, it takes `gitRepo`, `filePath`, and `title` from the host state.
2. It computes `filePath = hostState.filePath ?? this.model.filePath` and
   `fileName = filePath ?? hostState.title ?? editorState.title ?? ""`.
3. It calls `this.model.findCompatibleEditors()` for built-in candidates.
4. It adds eligible custom-board matches from `customEditorRegistry.getBoardsForFile(fileName)`;
   local files accept all matching boards, while non-local files accept only `content-host` boards.
5. It adds catalog/install candidates and the board-info entry when applicable, then moves the
   plus entry to the end. Labels come from a custom board name or
   `editorRegistry.getById(id)?.name ?? id`, with the plus label `"  +  "`.

The epic's Decision 2 says to source `page.editorSwitches.options` from
`editorRegistry.getSwitchOptions(language, fileName)`. The actual toolbar does not do that:
`EditorModel.findCompatibleEditors()` itself returns `[]` at `EditorModel.ts:191`; the page
toolbar exercises concrete overrides. Text/file pages reach the `TextHostEditorModel` override
(`TextHostEditorModel.ts:138`, used by `MonacoEditor` and other text-host editors), which calls
`editorRegistry.findEditorsAccepting(host)`. Board pages exercise
`BoardEditorModel.ts:372` and `BoardContentEditorModel.ts:76`; the former calls
`getSwitchOptions()` and appends its board id, while the latter uses host acceptance or its
resolved fallback and appends its board id. The toolbar can also be mounted by other editor views
whose concrete models have their own overrides, such as Archive and Board Info; the shared helper
must call the supplied model's polymorphic method and must not edit the base `[]` implementation.
`getSwitchOptions()` itself uses `def.match.switchOption`, excludes file-diff, and cannot represent
the toolbar's custom-board/catalog projection. This decision does
not survive contact with the code and is amended here: extract the toolbar's existing merged
projection into a shared helper, use it from both `SwitchWidgetView` and the new page node, and
retain `getSwitchOptions()` only where it is already part of a model's compatibility behavior.
This keeps the node genuinely identical to the toolbar rather than silently dropping Git,
content-host, board, or catalog choices.

The toolbar removes the widget when fewer than two merged candidates exist or when the current
editor is absent from the candidates. The node should still expose the computed candidate list;
UI visibility is a presentation rule, while the scripting node must describe the available
switch projection. `current` is always the current `mainEditorInstance.editorId` (with the
existing model fallback behavior used by `currentEditorId()`). `switchTo(id)` must accept any
registered editor id, not only the listed options, because the old setter accepted that latitude
and grouped output pages need it. Delegate to `switchMainEditor`, then compare the resulting
`mainEditorInstance.editorId` with the requested id. A same-id call is a legitimate no-op and
returns normally. If the call itself returns but the id differs, throw a new diagnostic error
that says the switch did not complete and names the likely causes: the release prompt was
declined, or the page has no file to rebuild over. This closes the silent-success paths in
`rebuildEditorOverFile`, the board-boundary/non-host branches, and the `!oldEditor` branch.
Unknown ids still preserve the existing `No editor registered for id: ${id}` rejection.
Document both the post-await verification and this behavior in the node's `$help`, and add the
same warning to the `switchTo` member's `caution`.

### AI-vision node and element behavior

`src/renderer/scripting/ai-vision/page-panels.ts` is the descriptor pattern to follow for a
node-owned descriptor: static members, `createElements`, merged `members`, `provide`, `elements`,
help, and summary. Add a dedicated `PageEditorSwitchesNode` descriptor and make
`editorSwitches` a `node: true` member of the Page descriptor. Its element declaration is
`page-editor-switch` with the plain `createElements` selector `[data-name="page-editor-switch"]`.
`SwitchWidgetView` puts that `data-name` on its segmented-control host. Add a TODO at the
declaration for US-1311's future page-scoped selector work; do not implement scoping or
activation/highlighting in this task.

The facade becomes the `.editor` child in `aiChildren()`. Update the shared AI-vision comments
and examples in `src/shared/ai-vision/types.ts`, `resolver.ts`, and `path-parser.ts` so paths
use `pages[i].editor`. The root help's common paths must likewise describe
`pages[0].editor` and `pages[0].editorSwitches`.

### Typings and generated editor types

`src/renderer/api/types/page.d.ts` is the canonical page declaration. It currently imports
`EditorView`, declares writable `editor: EditorView`, and declares all thirteen `as*()` methods.
Replace those with a read-only `editor: IEditorFacade` and a read-only
`editorSwitches: IPageEditorSwitches`.

Add a canonical `src/renderer/api/types/page-editor-switches.d.ts` containing the option and
node interfaces. Add `IEditorFacade` to `page.d.ts` as the union of the thirteen existing
facade interfaces. Add `readonly id` literal discriminants and `readonly name: string` to the
facade interfaces in the thirteen editor type files. The grid interface's id is the union
`"grid-json" | "grid-csv" | "grid-jsonl"`; the other ids are the single literals listed in
the table above. This permits narrowing such as:

```ts
if (page.editor.id === "grid-json") {
    page.editor.addRows(5);
}
```

Define `IFacadeEditorId` as the union of the seventeen concrete ids represented by the thirteen
operation facades (the three grid ids count separately), and define the generic built-in id as
`Exclude<EditorView, IFacadeEditorId>`. Custom board ids are runtime strings outside the closed
`EditorView` union; represent them in the generic declaration with a branded string arm, for
example `string & { readonly __genericEditorId: unique symbol }`, and cast the dynamic registry
id at that boundary. The generic's public `id` is therefore the excluded built-in ids or that
custom-id arm, while its `name` remains `string`. Keep `IEditorFacade` as a union of the thirteen
operation interfaces plus `IGenericEditor`. Show and verify the important narrowing explicitly:

```ts
const editor = page.editor;
if (editor.id === "grid-json") {
    editor.addRows(5); // editor is narrowed to IGridEditor here, not IGenericEditor
}
```

`EditorView` remains unchanged for internal `app.editors` and page-creation APIs.

`assets/editor-types/` is generated, not a hand-maintained copy. `vite.renderer.config.ts`
`editorTypesPlugin()` copies every declaration from `src/renderer/api/types` to
`assets/editor-types` at `buildStart`, writes `_imports.txt`, and watches source declarations
in development. Update canonical source declarations only, then run the normal renderer build
or equivalent generation step so `assets/editor-types/page.d.ts`, the new switch declaration,
and every generated editor declaration are synchronized. Do not hand-edit generated files.

### Documentation, MCP, QA, and other consumers

The old shape is present in the MCP server's initialize instructions and tool descriptions, the
AI-vision path hints, every facade `_HELP` line, the page and collection descriptors, the API
reference, scripting guide, editor/browser/MCP docs, architecture docs, QA script procedure,
and the specified MCP resource guides. `doc/agents-common.md` also has the “Script Context”
pattern block and must be updated. `docs/whats-new.md` already has the intended 5.0.0 breaking
section; change only that upcoming section. The shipped 4.0.23-and-earlier release notes are
historical and must remain unchanged. The additional break is that scripts which read or assign
the old scalar editor id must now read `page.editor.id` and switch through
`page.editorSwitches.switchTo(id)`.

The board scan found no `as*()` page calls in `boards-assets/`, `assets/board-template/`, or
`src/renderer/editors/board/**`. `assets/demo-board/app.js` does read `page.editor` and currently
serializes it as a scalar; update that demo to display facade metadata or null, and update its
button text in `assets/demo-board/index.html`. Internal board editor state and registry calls
are not the page scripting API and are not to be changed.

History is deliberately excluded from cleanup: `doc/tasks/**`, `doc/epics/**` history content,
and `qa/runs/**` are inventory-only. The requested tracking status change to the source epic is
the sole edit to `doc/epics/EPIC-086.md`; do not rewrite its historical decision prose.

## Implementation Plan

1. **Redesign the page wrapper.** In `src/renderer/scripting/api-wrapper/PageWrapper.ts`:
   - Remove `FACADE_FOR_EDITOR`'s segment/kind table, all `as*()` methods, `ensureEditor()`,
     `compatibleEditorIds()`, and imports used only by those methods.
   - Add one editor-id-to-factory map covering the thirteen operation facades plus a generic
     fallback. Construct operation facades from `mainEditorInstance`, set their `id` to the
     actual editor id, and set `name` from `editorRegistry.getById(id).name`. Construct
     `GenericEditorFacade` for every registered/editor-state id with no operation factory.
   - Make `get editor()` return the factory result for the current main editor and remove the
     setter. Preserve `mainEditorInstance` and current-editor resolution semantics.
   - Replace the old Page members/help with read-only `editor` and node `editorSwitches` entries.
     Make the editor facade the `.editor` child in `aiChildren()` and make summaries use its id,
     not object stringification. Keep grouped-page behavior and verify no grouped helper relied
     on the deleted setter or methods.
2. **Implement the switch node and share the toolbar projection.** Add
   `src/renderer/scripting/ai-vision/page-editor-switches.ts` (or the repository's settled
   equivalent singular/plural filename) following `page-panels.ts`. It must expose `current`,
   `options`, `switchTo`, and `elements`, with an independent descriptor and summary. Extract
   the exact merged option calculation from `SwitchWidgetView.syncSegments()` into a helper under
   `src/renderer/editors/base/`, then statically import it from both `PageToolbarView.ts` and the
   new node. The helper must depend only on editor-base/registry, board/catalog model contracts,
   and shared utilities; it must not import either toolbar or scripting/AI-vision modules. The
   static imports are `PageToolbarView.ts` → helper and the new page node → helper; the helper
   never points back to either consumer. This keeps the dependency one-way and avoids a
   renderer→editors cycle that eslint could flag (the current `eslint.config.mjs` has no
   `import/no-cycle` rule, but the boundary must remain acyclic). Pass
   the exact host,
   language, file path, title, local-file, board, catalog, and installation/trust inputs already
   used by the widget. Keep labels and ordering identical. Add the plain `page-editor-switch`
   element declaration and a TODO for US-1311. Delegate `switchTo` without pre-filtering ids,
   verify the post-await editor id, and report a diagnostic on a normal-return/no-switch result;
   preserve the original `switchMainEditor` rejection reason for thrown failures.
3. **Add facade metadata and rewrite facade help.** Update the constructors or shared base
   mechanism in all thirteen files under `src/renderer/scripting/api-wrapper/`:
   `BrowserEditorFacade.ts`, `DrawEditorFacade.ts`, `GraphEditorFacade.ts`,
   `GridEditorFacade.ts`, `HtmlEditorFacade.ts`, `ImageEditorFacade.ts`, `LinkEditorFacade.ts`,
   `MarkdownEditorFacade.ts`, `McpInspectorFacade.ts`, `MermaidEditorFacade.ts`,
   `NotebookEditorFacade.ts`, `SvgEditorFacade.ts`, and `TextEditorFacade.ts`. Add `id` and
   `name` members, and replace each `_HELP` sentence that says “Obtain via page.asX()” with
   `.editor` plus an id-narrowing example. Add `GenericEditorFacade.ts` with `kind: "Editor"`,
   only `id` and `name`, and `$help` explaining that the current editor exposes no operations
   yet. Preserve each operation facade's existing descriptor members, behavior, and validation.
4. **Update canonical typings.** Modify `src/renderer/api/types/page.d.ts` and the thirteen
   canonical facade declarations (`browser-editor.d.ts`, `draw-editor.d.ts`,
   `graph-editor.d.ts`, `grid-editor.d.ts`, `html-editor.d.ts`, `image-editor.d.ts`,
   `link-editor.d.ts`, `markdown-editor.d.ts`, `mcp-inspector-editor.d.ts`,
   `mermaid-editor.d.ts`, `notebook-editor.d.ts`, `svg-editor.d.ts`, `text-editor.d.ts`),
   add `generic-editor.d.ts` and `page-editor-switches.d.ts`. Use literal id discriminants,
   the generic excluded-built-in/custom-id type, readonly metadata, the union, and
   `Promise<void>` for `switchTo`. Generate/synchronize the corresponding
   `assets/editor-types/*.d.ts` outputs with the project plugin; do not hand-edit them.
5. **Update descriptors and AI-vision paths.** Change `PAGE_MEMBERS`, `PAGE_HELP`, collection
   help/summaries, `root.ts`, `src/shared/ai-vision/types.ts`, `resolver.ts`, and `path-parser.ts`.
   Remove all facade-method language from `aiChildren()` and replace the facade child with
   `.editor`. Ensure the new switch node is marked `node: true` and its element provider is
   included in its descriptor.
6. **Clean MCP implementation strings and hints.** Update the exact old-shape references in
   `src/main/mcp/manifest.ts`, `src/main/mcp/tools/call-tools.ts`,
   `src/main/mcp/tools/guide-tools.ts`, `src/main/mcp/tools/page-tools.ts`, and
   `src/renderer/api/mcp/page-commands.ts`. Paths and examples should use `.editor`,
   `.editor.id`, or `.editorSwitches.switchTo(...)` as appropriate.
7. **Rewrite user and developer documentation.** Update the MCP resources
   `assets/mcp-res-pages.md`, `assets/mcp-res-scripting.md`, `assets/mcp-res-overview.md`,
   and `assets/mcp-res-graph.md`; API/user docs `docs/api/page.md`, `docs/api/index.md`,
   `docs/api/io.md`, `docs/scripting.md`, `docs/editors.md`, `docs/browser.md`,
   `docs/mcp-setup.md`, and only the Version 5.0.0 (Upcoming) section of `docs/whats-new.md`;
   architecture docs
   `doc/architecture/scripting.md`, `pages-architecture.md`, `editors.md`,
   `browser-editor.md`, `overview.md`, and `folder-structure.md`; the Script Context block in
   `doc/agents-common.md`; and current roadmap wording in `doc/agent-transparency-roadmap.md`.
   Update `qa/mcp-test-execute-script.md` and review `qa/surfaces/*.md` for relevant current
   examples. Keep the 5.0.0 breaking notice explicit without documenting a compatibility alias.
8. **Update demo and verify other consumers.** Rewrite the `page.editor` serialization in
   `assets/demo-board/app.js` and its label in `assets/demo-board/index.html`. Confirm that
   `boards-assets/`, `assets/board-template/`, and `src/renderer/editors/board/**` contain no
   page-API `as*()` calls; leave internal editor state untouched.
9. **Perform the cleanup and verification pass.** Run the prescribed search again, classify
   every result, and remove all actionable current-code/docs/type/QA hits. The exact command
   requested by the task was attempted, but this PowerShell environment has no `grep` executable;
   use the equivalent `rg` invocation with hidden files and the same exclusions. Verify links,
   generated type synchronization, formatting/type-check/build paths used by the repository, and
   manually exercise the documented scenarios: a grid facade narrowed by id, a generic editor
   with no operations, matching switch options, unrestricted `switchTo`, same-id no-op,
   declined-release/no-file diagnostic failure, and an unknown-id rejection preserving its
   reason. Do not add unit tests or a test harness; this project does not use them.

## Before → after

### Page editor access

```ts
// Before
const grid = await page.asGrid();
page.editor = "grid-json";

// After
if (page.editor.id === "grid-json") {
    page.editor.addRows(5);
}
await page.editorSwitches.switchTo("grid-json");
```

### Page descriptor

```ts
// Before
{ name: "editor", writable: true, summary: "Current editor id..." }
{ name: "asGrid", method: true, ... }

// After
{ name: "editor", summary: "Current editor facade..." }
{ name: "editorSwitches", node: true, ... }
```

### Facade identity

```ts
// Before
// Obtain via pages[i].asGrid().

// After
// Access via pages[i].editor; its id tells whether operations are available.
readonly id: "grid-json" | "grid-csv" | "grid-jsonl";
readonly name: string;
```

### Typing and switching

```ts
// Before
interface IPage { editor: EditorView; asText(): Promise<ITextEditor>; }

// After
interface IPage {
    readonly editor: IEditorFacade;
    readonly editorSwitches: IPageEditorSwitches;
}
interface IPageEditorSwitches {
    readonly current: string;
    readonly options: readonly IEditorSwitchOption[];
    switchTo(id: string): Promise<void>;
}
```

## Concerns and resolved decisions

- **Decision 1 survives, with a generic identity branch.** The source has the thirteen concrete
  facade classes and `mainEditorInstance`, so a factory map is supported. The current registry
  also has `video-view`, `file-diff`, and custom board ids without an operation facade; those
  return `GenericEditorFacade` with truthful `id`/`name` metadata and explicit no-operations help.
  This is not an operation compatibility fallback.
- **Decision 2 does not survive literally.** The toolbar calls `findCompatibleEditors()` and
  merges board/catalog/install choices; it does not call only `getSwitchOptions(language,fileName)`.
  The implementation plan therefore amends the decision to share the real toolbar projection.
  If the epic requires registry-only options, it would no longer mirror the current widget and
  would need a separate product decision.
- **Metadata must be runtime identity, not a facade class identity.** For grid pages, `id` is
  the concrete `grid-json`, `grid-csv`, or `grid-jsonl`; `name` is looked up from the registry
  each time the factory constructs the facade. This keeps narrowing and display names aligned.
- **Read-only editor access is intentional, but switching must not report false success.** The
  old setter's switching capability moves to `editorSwitches.switchTo`, while its permissive id
  acceptance and native thrown rejection reason are retained. Because `switchMainEditor` also
  has normal-return/no-switch paths, the node compares `mainEditorInstance.editorId` after the
  await, permits only the same-id no-op to complete silently, and diagnoses a differing id.
- **Elements are intentionally unscoped.** The plain selector is what `createElements` currently
  supports. Page scoping, activation, and `page.tab` belong to US-1311 and must remain a TODO.
- **Generated declarations are an output, not a second source.** The canonical declarations
  under `src/renderer/api/types/` are edited first; the renderer type plugin regenerates the
  matching `assets/editor-types/` files.
- **No tests are to be introduced.** Verification is static search, type/build checks, link
  checks, and focused manual script/UI scenarios.

## Acceptance Criteria

- [x] `PageWrapper.editor` returns the current editor's existing operation facade or
  `GenericEditorFacade`, has no setter, and never returns `undefined` for a live page.
- [x] The one editor-id-to-factory map covers exactly the thirteen existing operation facades,
  including all three grid ids and the browser/image/MCP facades, with a generic fallback for
  every other registered/state editor id.
- [x] Every returned facade exposes the concrete editor `id` and registry `name`; its public
  behavior and existing editor-specific descriptors remain intact.
- [x] `page.editorSwitches` is a Page `node: true` member with its own descriptor and exposes
  `current`, merged toolbar-identical `{id,label}` options, `switchTo`, and `elements`.
- [x] `switchTo` accepts any registered editor id and propagates the exact
  `switchMainEditor` rejection reason; it is not restricted to `options`. After a normal return,
  it compares `mainEditorInstance.editorId` with the requested id, permits same-id no-ops, and
  throws a diagnostic naming release-prompt decline or missing rebuild file when they differ.
- [x] The switch element uses `[data-name="page-editor-switch"]` and has a TODO for US-1311's
  page-scoped selector work.
- [x] `PAGE_MEMBERS`, `PAGE_HELP`, `aiChildren()`, `PageCollectionWrapper`, root/shared
  AI-vision help, all facade `_HELP` blocks, MCP strings/hints, namespaces, and current source
  docs contain no obsolete page `as*()` API references.
- [x] `IPage.editor` is a read-only discriminated `IEditorFacade` union with literal operation
  ids plus the generic excluded-built-in/custom-id branch, `IPage.editorSwitches` is declared,
  and generated editor types are synchronized.
- [x] The named MCP guides, user/API docs, architecture docs, Script Context, QA procedure,
  roadmap wording, and demo board use the new API; `docs/whats-new.md` accurately documents
  the 5.0.0 break.
- [x] The required search inventory is resolved except for documented false positives and
  excluded history (`doc/tasks/**`, `doc/epics/**` history content, `qa/runs/**`); no board
  package uses a page `as*()` call.
- [x] No unit tests or harnesses are added.

## Prescribed search inventory

The exact requested `grep -rn` command was run first and failed because `grep` is not installed
in this PowerShell environment. The following is the complete output inventory from the
equivalent `rg -n -uuu` search with the requested `*.ts`, `*.md`, and `*.d.ts` globs and exclusions,
captured before this task document was created. Line numbers are the baseline locations.

### Current code, declarations, docs, guides, and QA to rewrite

```text
assets/editor-types/browser-editor.d.ts:4,10
assets/editor-types/draw-editor.d.ts:4
assets/editor-types/graph-editor.d.ts:4,11
assets/editor-types/grid-editor.d.ts:4,8
assets/editor-types/html-editor.d.ts:4,7
assets/editor-types/image-editor.d.ts:4,7
assets/editor-types/link-editor.d.ts:4,7
assets/editor-types/markdown-editor.d.ts:4,7
assets/editor-types/mcp-inspector-editor.d.ts:4,8
assets/editor-types/mermaid-editor.d.ts:4,7,28
assets/editor-types/notebook-editor.d.ts:4,7
assets/editor-types/page.d.ts:79,87,93,99,105,111,117,123,129,135,138,141,147
assets/editor-types/svg-editor.d.ts:4,7,19
assets/mcp-res-graph.md:64,69,149,169,175,181,187,194,200,208,224
assets/mcp-res-overview.md:27
assets/mcp-res-pages.md:14,199
assets/mcp-res-scripting.md:76,80,254,257,267,270,283,286,299,302,309,312,319,323,329,333,334,341,346,417
doc/agents-common.md:229
doc/agent-transparency-roadmap.md:67,88,89,119
doc/architecture/browser-editor.md:793,796
doc/architecture/editors.md:405-417
doc/architecture/folder-structure.md:36
doc/architecture/overview.md:204
doc/architecture/scripting.md:26,96-108,472-484,503,545
docs/api/index.md:30,38,48,56,61,72,75-77,80,87,91
docs/api/io.md:305
docs/api/page.md:77,81,87,104,111,129,143,162,171,186,193,260,288,298,306,316,322,332,344,357,364,416,436,449,464,473,482,489,535
docs/browser.md:363,366,419
docs/editors.md:159,193,220,391,427,833
docs/mcp-setup.md:229
docs/scripting.md:64-69,434
docs/whats-new.md:13,16
qa/mcp-test-execute-script.md:37
src/main/mcp/manifest.ts:34,116
src/main/mcp/tools/call-tools.ts:71,112,124
src/main/mcp/tools/guide-tools.ts:23
src/main/mcp/tools/page-tools.ts:12
src/renderer/api/mcp/page-commands.ts:16,169
src/renderer/api/types/browser-editor.d.ts:4,10
src/renderer/api/types/draw-editor.d.ts:4
src/renderer/api/types/graph-editor.d.ts:4,11
src/renderer/api/types/grid-editor.d.ts:4,8
src/renderer/api/types/html-editor.d.ts:4,7
src/renderer/api/types/image-editor.d.ts:4,7
src/renderer/api/types/link-editor.d.ts:4,7
src/renderer/api/types/markdown-editor.d.ts:4,7
src/renderer/api/types/mcp-inspector-editor.d.ts:4,8
src/renderer/api/types/mermaid-editor.d.ts:4,7,28
src/renderer/api/types/notebook-editor.d.ts:4,7
src/renderer/api/types/page.d.ts:79,87,93,99,105,111,117,123,129,135,138,141,147
src/renderer/api/types/svg-editor.d.ts:4,7,19
src/renderer/editors/base/EditorModel.ts:304
src/renderer/editors/graph/GraphContextMenu.ts:76,78
src/renderer/editors/markdown/MarkdownBlockView.ts:175,188,315,323,331
src/renderer/editors/monaco/MonacoEditor.ts:66
src/renderer/scripting/ai-vision/root.ts:67
src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:48
src/renderer/scripting/api-wrapper/DrawEditorFacade.ts:16
src/renderer/scripting/api-wrapper/GraphEditorFacade.ts:32
src/renderer/scripting/api-wrapper/GridEditorFacade.ts:17
src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts:8
src/renderer/scripting/api-wrapper/ImageEditorFacade.ts:9,16
src/renderer/scripting/api-wrapper/LinkEditorFacade.ts:15
src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts:9
src/renderer/scripting/api-wrapper/McpInspectorFacade.ts:28
src/renderer/scripting/api-wrapper/MermaidEditorFacade.ts:12,37
src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts:19
src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:46
src/renderer/scripting/api-wrapper/PageWrapper.ts:58-70,87-101,283-403
src/renderer/scripting/api-wrapper/SvgEditorFacade.ts:10
src/renderer/scripting/api-wrapper/TextEditorFacade.ts:14
src/shared/ai-vision/path-parser.ts:8,61
src/shared/ai-vision/resolver.ts:174
src/shared/ai-vision/types.ts:49
```

The `docs/api/page.md`, `assets/mcp-res-scripting.md`, and related guide hits include both
facade sections and examples; all of those references must be rewritten, not merely hidden.
The old `docs/scripting.md` assignment `page.editor = "grid-json"` is also in scope even though
it is not matched by the prescribed `as*()` expression.

### Inventory-only history or epic records — do not edit

These hits were included in the required search output but are historical records or the epic
decision source. They are listed to make the inventory complete and must remain untouched except
for the explicitly requested EPIC-086 status cell:

```text
doc/epics/completed.md:121,173,1083,1086
doc/epics/EPIC-021.md:44,222,232
doc/epics/EPIC-026.md:65,69-72,306
doc/epics/EPIC-028.md:102
doc/epics/EPIC-067.md:342,370,536,542
doc/epics/EPIC-082.md:237
doc/epics/EPIC-083.md:16,122,123,173,224,268,287,291,385,450,451
docs/whats-new.md:341,722,1008,1068,1253,1273,1303
doc/epics/EPIC-086.md:19,24,28,181,186
doc/tasks/US-1289-ai-vision-core/README.md:68
doc/tasks/US-1291-facade-descriptors/README.md:15,64,206,381-393,425,471,473-474,475,478,480-481,485,490,509-510,555-556,558,590-591
doc/tasks/US-1292-app-namespaces/README.md:672
doc/tasks/US-1293-call-evaluation/README.md:49
qa/runs/2026-09-05-epic-083-call-vs-tools.md:40-43,76
```

### False positives and intentional non-page API matches

The required expression also matches substrings such as `hasTextSelection`, `hasLinks`, and
`renderedHasMermaid`, plus unrelated editor implementation identifiers. These are not page
facade references and must not be renamed:

```text
doc/architecture/pages-architecture.md:448
src/renderer/editors/base/EditorModel.ts:304
src/renderer/editors/graph/GraphContextMenu.ts:76,78
src/renderer/editors/markdown/MarkdownBlockView.ts:175,188,315,323,331
src/renderer/editors/monaco/MonacoEditor.ts:66
```

`src/renderer/scripting/ai-vision/namespaces/*`, `src/shared/ai-vision/help-search.ts`,
`src/renderer/api/types/editors.d.ts`, `src/renderer/api/types/common.d.ts`, and
`src/renderer/api/types/page-panels.d.ts` were checked and have no obsolete page `as*()` shape;
they need no changes for this task. The same applies to `qa/surfaces/*.md` after review.

## Files Changed Summary

| File or area | Planned change |
|---|---|
| `doc/tasks/US-1310-page-node-redesign/README.md` | This implementation-ready task document |
| `doc/active-work.md` | Link the active US-1310 entry to this document |
| `doc/epics/EPIC-086.md` | Set US-1310 to `Planned (doc written)` as requested |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts`, `PageCollectionWrapper.ts` | Structural editor node, switch node member, help/summary/child cleanup |
| `src/renderer/scripting/api-wrapper/*Facade.ts` (13 files), `GenericEditorFacade.ts` | Add facade `id`/`name`; rewrite help access paths; add explicit generic identity facade |
| `src/renderer/scripting/ai-vision/page-editor-switches.ts` | New switch node descriptor and elements |
| `src/renderer/editors/base/` switch-option helper and `PageToolbarView.ts` | Share the exact toolbar option projection |
| `src/renderer/api/types/` page, facade, generic, and switch declarations | Canonical discriminated typings |
| `assets/editor-types/` generated declarations | Generated synchronization output only |
| `src/shared/ai-vision/` path/help comments and `root.ts` | New `.editor` paths and root help |
| `src/main/mcp/` and `src/renderer/api/mcp/page-commands.ts` | Remove old API from instructions, schemas, and hints |
| `assets/mcp-res-*.md`, `docs/`, `doc/architecture/`, `doc/agents-common.md` | Rewrite current guides, user docs, architecture, and Script Context |
| `qa/mcp-test-execute-script.md`, `qa/surfaces/*.md` | Update/review current QA references |
| `assets/demo-board/app.js`, `assets/demo-board/index.html` | Consume/display editor facade metadata |
| `boards-assets/`, `assets/board-template/`, `src/renderer/editors/board/**` | Verified; no page-API changes planned |
| `doc/epics/**` history, existing `doc/tasks/**`, `qa/runs/**` | Inventory only; no cleanup edits |
