# US-1054 — Delete the React `Body` arm from the editor registry

Parent epic: [EPIC-060: De-React Epic E2 — The embeddable bodies](../../epics/EPIC-060.md)

This is a planning document only. It does not implement code, edit `doc/active-work.md`, edit
`doc/epics/EPIC-060.md` or `doc/de-react.md`, modify the markdown editor, or create a commit.

## Goal

Remove `EditorModule.Body?: React.ComponentType` and its E1-9 registry normalization shim now that
all five embeddable editor providers expose `BodyView`. Repoint notebook per-note dispatch to mount
the vanilla `BodyView` directly from its still-React parent, preserving the embedded body props and
the `Component`/`View` normalization shim used by the rest of the editor registry.

## Background

EPIC-060 Decisions E2-1 and E2-3 define this closing task as removal of the registry contract, not
conversion of notebook or editor chrome. The epic identifies the closed provider set as grid, html,
markdown, svg, and mermaid (EPIC-060 Decisions: lines 147-156), and fixes the replacement as
`mountVanilla(module.BodyView, …)` in notebook dispatch (EPIC-060 Decisions: lines 169-179).

### Provider-set gate

The current tree has no provider declaring `Body`; the exact registration and declaration evidence
is below. The markdown declaration is being edited by another agent, so its current `BodyView` line
is evidence of the required landing shape, not permission to modify that directory. Before this task
is implemented, rerun the provider search after US-1052 lands. Any remaining provider-side `Body`
declaration is a blocker; do not retain the registry arm as a workaround.

| Provider | Registered editor ID(s) | Module declaration evidence | Required final contract |
|---|---|---|---|
| Grid | `grid-json`, `grid-csv`, `grid-jsonl` | `src/renderer/editors/grid/index.tsx:127-138` — `makeModule` returns `BodyView: GridBodyView` at line 132 and all three exports use it at lines 136-138; lazy registrations are `src/renderer/editors/register-editors.ts:150-152` | `BodyView: GridBodyView`; no `Body` |
| Markdown | `md-view` | `src/renderer/editors/markdown/index.tsx:58-63` — `markdownModule` exposes `BodyView: MarkdownBodyView` at line 62; registration is `src/renderer/editors/register-editors.ts:154` | `BodyView: MarkdownBodyView`; after US-1052, no `Body` |
| SVG | `svg-view` | `src/renderer/editors/svg/index.tsx:82-87` — `svgModule` exposes `BodyView: SvgBodyView` at line 86; registration is `src/renderer/editors/register-editors.ts:155` | `BodyView: SvgBodyView`; no `Body` |
| HTML | `html-view` | `src/renderer/editors/html/index.tsx:67-72` — `htmlModule` exposes `BodyView: HtmlBodyView` at line 71; registration is `src/renderer/editors/register-editors.ts:156` | `BodyView: HtmlBodyView`; no `Body` |
| Mermaid | `mermaid-view` | `src/renderer/editors/mermaid/index.tsx:135-140` — `mermaidModule` exposes `BodyView: MermaidBodyView` at line 139; registration is `src/renderer/editors/register-editors.ts:157` | `BodyView: MermaidBodyView`; no `Body` |

Thus the provider-set check passes in the inspected snapshot: five provider families, with the grid
factory serving three IDs, and every provider declaration is `BodyView`-based. This task must keep
the check passing when the in-flight markdown edit is complete.

### The registry shim and the shim that stays

`EditorModuleCommon` currently declares both body arms at
`src/renderer/editors/base/editorRegistry.ts:28-34`:

~~~ts
Body?: React.ComponentType<{ model: EditorModel; editorConfig?: EditorConfig }>;
BodyView?: VanillaViewCtor<{ model: EditorModel; editorConfig?: EditorConfig }>;
~~~

`EditorRegistry.loadModule` first returns a cached module or loads the registered definition
(`src/renderer/editors/base/editorRegistry.ts:302-307`). It then keeps the sibling compatibility
normalization that synthesizes `Component` from a module that has `View` but no `Component`
(`src/renderer/editors/base/editorRegistry.ts:308-315`). Most editors still provide React
`Component`s, so this `Component`/`View` arm remains.

The body normalization is exactly `src/renderer/editors/base/editorRegistry.ts:316-323`:

~~~ts
if (module.BodyView && !module.Body) {
    const Ctor = module.BodyView;
    module = {
        ...module,
        Body: (props: { model: EditorModel; editorConfig?: EditorConfig }): React.ReactElement =>
            mountVanilla(Ctor, props),
    };
}
~~~

It synthesizes the React `Body` from `BodyView`; after all five providers have `BodyView`, it has no
input and must be deleted. The later invariant check that requires `Component` or `View`, followed
by module caching and return, stays at `editorRegistry.ts:324-328`.

The registry comments also describe the obsolete surface: the `EditorModuleCommon` comment mentions
`module.Body` at `editorRegistry.ts:28-31`, and the public `getModule` comment says callers read
`module.Body` and dispatch the chrome-free `Body` at `editorRegistry.ts:294-300`. Both comments must
be rewritten to describe `BodyView`; otherwise the source search will retain a stale contract claim.

### The only registry-body consumer

`src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` is the only executable consumer
of the registry's `.Body` property. `EmbeddedNoteEditor` is a React function at lines 62-99. Its
current state entry stores the model and normalized React component:

~~~tsx
const [entry, setEntry] = useState<{
    editor: EditorModel;
    Body: ComponentType<{ model: EditorModel; editorConfig?: EditorConfig }>;
} | null>(null);
~~~

The async path loads the module at lines 68-72, rejects a non-embeddable module with
`if (!module.Body)` and the `no Body slot` error at lines 73-75, creates/adopts/restores the editor at
lines 76-83, and stores `{ editor, Body: module.Body }` at lines 84-88. Rendering destructures that
entry and invokes `<Body model={editor} editorConfig={editorConfig} />` at lines 97-99.

The implementation change is:

~~~tsx
// Before: React component held in state and rendered directly.
Body: ComponentType<{ model: EditorModel; editorConfig?: EditorConfig }>;
if (!module.Body) {
    throw new Error(`Editor "${editorId}" is not embeddable (no Body slot)`);
}
setEntry({ editor, Body: module.Body });
const { editor, Body } = entry;
return <Body model={editor} editorConfig={editorConfig} />;
~~~

~~~tsx
// After: vanilla constructor held in state and mounted into the React tree.
BodyView: VanillaViewCtor<{ model: EditorModel; editorConfig?: EditorConfig }>;
if (!module.BodyView) {
    throw new Error(`Editor "${editorId}" is not embeddable (no BodyView slot)`);
}
setEntry({ editor, BodyView: module.BodyView });
const { editor, BodyView } = entry;
return mountVanilla(BodyView, { model: editor, editorConfig });
~~~

The after shape requires `mountVanilla` and the `VanillaViewCtor` type from
`src/renderer/uikit/shared/mount.tsx:5,93-107`; remove the now-unused value import of
`ComponentType`. Preserve the existing effect cleanup and host adoption: the editor is still adopted
at line 81, restored at line 82, and disposed through the existing cleanup at lines 90-94. Preserve
the supplied `editorConfig`, which comes from the React note view at
`src/renderer/editors/notebook/NoteItemView.tsx:344-353`.

This component stays React. `NoteItemActiveEditor` returns React JSX and selects `MiniTextEditor` for
Monaco at `NoteItemActiveEditor.tsx:28-37`; `mountVanilla` returns a React element at
`mount.tsx:99-107`. Its `VanillaHost` appends and mounts the vanilla view at `mount.tsx:19-38`, while
`createRoot` is used only by the opposite `mountReact` adapter at `mount.tsx:109-151`. Therefore the
React-parent/vanilla-child direction adds zero React roots, and converting `notebook` is outside this
task.

### Type and search inventory

`EditorModule` is defined by `EditorModuleCommon` plus the `Component`/`View` union at
`src/renderer/editors/base/editorRegistry.ts:19-45`. Remove only the `Body` field; keep
`BodyView?` optional. The type represents every editor module, while only the five language-gated
providers are embeddable; non-provider modules such as the notebook module expose only `Component`
at `src/renderer/editors/notebook/index.tsx:109-113`. Making `BodyView` required on the common type
would incorrectly require all modules to invent a body. A new provider-only discriminated type is
not needed for this two-file change; the runtime `if (!module.BodyView)` check remains the correct
boundary for the broad registry type.

The requested whole-`src/` searches found:

- `.Body` / `module.Body`: only the stale registry comments/type/shim at
  `editorRegistry.ts:29,32,295,316-320` and the notebook consumer at
  `NoteItemActiveEditor.tsx:22,65,73-74,85,98-99`. The other word-boundary `Body` matches are
  unrelated request/panel/content terminology, including `mcp-inspector/McpInspectorView.tsx:227`
  and REST-client body fields/comments; they are not registry property accesses.
- `BodyView`: the five provider registrations listed above, the five corresponding view classes
  (`GridBodyView.ts:94`, `HtmlBodyView.ts:17`, `MarkdownBodyView.ts:105`, `MermaidBodyView.ts:67`,
  `SvgBodyView.ts:41`), the registry field/shim at `editorRegistry.ts:33,316-317`, and the existing
  direct shell mounts in `grid/index.tsx:35`, `html/index.tsx:62`, `markdown/index.tsx:53`,
  `mermaid/index.tsx:125`, and `svg/index.tsx:72`. The shell mounts remain unchanged.
- `getModule`: the registry accessor is `editorRegistry.ts:294-300`; call sites are
  `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx:72`,
  `src/renderer/ui/app/RenderEditorView.ts:50-58` (reads `Component`/`View`), and
  `src/renderer/api/pages/PagesLifecycleModel.ts:146-162` (reads `newEditorModel`). Only the
  notebook call site reads the body arm.
- `src/renderer/editors/types.ts:1-15` and `src/renderer/editors/base/IContentHost.ts:1-63` contain
  no `Body` or `BodyView` field and need no type change. No other source type references the removed
  registry field.

### Removal-ledger collection

The removal-ledger entry `React faces on converted UIKit components (Component.tsx → mountVanilla)`
in `doc/de-react.md:850-867` includes this temporary editor-body face. US-1054 collects precisely
the editor-body arm: the `EditorModule.Body` type, the `Body = mountVanilla(BodyView)` normalization
shim, the notebook's `Body` state slot, and its direct React `<Body>` render. The
`Component`/`View` normalization shim at `editorRegistry.ts:308-315` remains because most editors
still have React `Component`s; it is not part of this task's collection.

## Implementation Plan

1. **Re-run the provider gate after US-1052.** Search the five registered provider families at
   `register-editors.ts:150-157` and their module declarations. Confirm exactly the five rows above
   expose `BodyView` and none exposes `Body`. Stop and report a blocker if markdown or any other
   provider still declares `Body`.
2. **Remove the React body arm from `src/renderer/editors/base/editorRegistry.ts`.** Delete the
   `Body` field and its `EditorConfig`-only dependency if no longer used; rewrite the two comments to
   refer to `BodyView`; delete only `loadModule` lines 316-323. Keep `mountVanilla`, `VanillaViewCtor`,
   the `Component`/`View` shim at lines 308-315, the module invariant check, and caching.
3. **Repoint `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx`.** Replace the
   state entry's `Body` component with a `BodyView` `VanillaViewCtor`, change the guard/error to
   `module.BodyView`, store `module.BodyView` after the existing restore, and return
   `mountVanilla(BodyView, { model: editor, editorConfig })`. Keep this file a React parent, preserve
   host adoption/disposal and the existing `editorConfig`, and update its doc comment from `Body` to
   `BodyView`.
4. **Run static and source checks.** Confirm `EditorModule` has no `Body` property, the load shim is
   absent, the `Component`/`View` shim remains, and the only body dispatch is the notebook's
   `BodyView` mount. Run `npm run typecheck` and `npm run lint`.
5. **Run the embedded visual check below**, including positive width and height for every provider
   body and the untouched Monaco collateral check.

## Concerns

1. The markdown module is in flight. Its final declaration must remain `BodyView`-only; do not edit
   `src/renderer/editors/markdown/` from this task or work around a failed provider gate.
2. `BodyView` remains optional because `EditorModule` covers non-embeddable modules. The notebook
   guard is intentional and must not be replaced by a non-null assertion or by making every module
   provide a dummy body.
3. Do not remove the `Component`/`View` normalization block. It is independent of the body arm and
   is still needed by modules that provide vanilla `View` without a React `Component`.
4. The adapter host returned by `mountVanilla` is `display: contents` at `mount.tsx:86-90`. Geometry
   must be measured on the mounted `VanillaView.root`, not the adapter host; otherwise a structural
   presence check can miss the 0px-wide body failure that this task's verification is intended to
   catch.

## Acceptance Criteria

- The five-provider gate passes after US-1052: grid, markdown, SVG, HTML, and Mermaid expose
  `BodyView`, no provider exposes `Body`, and the grid factory still covers `grid-json`, `grid-csv`,
  and `grid-jsonl`.
- `src/renderer/editors/base/editorRegistry.ts` no longer declares `EditorModule.Body`, contains no
  `Body = mountVanilla(BodyView)` normalization, and has no stale `module.Body`/`Body`-arm comments.
  Its `Component`/`View` normalization at `editorRegistry.ts:308-315` is unchanged in behavior.
- `NoteItemActiveEditor.tsx` checks `module.BodyView`, stores `{ editor, BodyView }`, and returns
  `mountVanilla(BodyView, { model: editor, editorConfig })`; its host lifecycle and error behavior
  remain intact. It remains a React component hosting a vanilla child with zero additional React
  roots.
- `BodyView` remains optional on the broad `EditorModule` type; no `Body` field is added to
  `editors/types.ts`, `IContentHost.ts`, or another type.
- `npm run typecheck` and `npm run lint` pass, and a final `rg` search confirms there is exactly one
  registry-body consumer: the notebook dispatch, now using `BodyView`.

### Embedded-body verification

Open a `.note.json` notebook containing at least one note for each provider: `grid-json`, `md-view`,
`svg-view`, `html-view`, and `mermaid-view`. Use non-empty valid content: a JSON array for grid, a
Markdown heading/paragraph, an SVG with a visible shape, an HTML document with visible content, and a
valid Mermaid flowchart. For the grid provider, optionally repeat with `grid-csv` and `grid-jsonl`;
all three IDs share the `GridBodyView` factory at `grid/index.tsx:127-138`.

If no notebook exists, create one through the documented `.note.json` flow (`docs/notebook.md:7-13`)
or create valid JSON matching `src/renderer/editors/notebook/notebookTypes.ts:12-16,22-33,51-55`:
the root has `notes` and `state`; each note has `id`, `title`, `category`, `tags`, `content`, and ISO
dates; and each `content` has `language`, `content`, and the selected `editor`. Set the five editor
IDs above explicitly, then open the file in Notebook. Add a sixth note with `editor: "monaco"` for
the collateral check.

For every embedded provider note, wait for its body to finish mounting and inspect the actual
`VanillaView.root` attached by `mount.tsx:32-38`. Assert both `getBoundingClientRect().width > 0`
and `getBoundingClientRect().height > 0` (or equivalent `offsetWidth`/`offsetHeight`) for each
embedded body. Element presence alone is insufficient: EPIC-059 already shipped a Monaco diff editor
that was present but 0px wide and therefore passed structural checks. Confirm no extra page chrome is
inside the note and switch between the five notes to exercise the async create/adopt/restore/cleanup
path.

As collateral damage, leave the sixth note on untouched `monaco` and open it in the same notebook.
`NoteItemActiveEditor.tsx:31-33` still routes Monaco to `MiniTextEditor`; assert that it renders with
positive width and height and remains editable. This task does not touch Monaco or that branch.

## Deliberately not changed

- `src/renderer/editors/markdown/` — owned by the in-flight US-1052 work; its landing contract is
  `BodyView` only, but this task does not modify it.
- `src/renderer/editors/grid/index.tsx`, `html/index.tsx`, `svg/index.tsx`, and `mermaid/index.tsx`,
  plus all five `*BodyView` implementations — provider conversions are complete/in flight and this
  task only consumes their `BodyView` contract.
- `src/renderer/editors/register-editors.ts` — registrations already identify the closed provider
  set; no registration logic changes.
- `src/renderer/editors/types.ts` and `src/renderer/editors/base/IContentHost.ts` — search found no
  registry-body type reference.
- `src/renderer/uikit/shared/mount.tsx` — the existing React-to-vanilla adapter is the required
  boundary; it is not changed.
- Notebook model/view files other than `note-editor/NoteItemActiveEditor.tsx` — notebook remains a
  React editor and only its per-note dispatch changes.
- `doc/de-react.md`, `doc/active-work.md`, `doc/epics/EPIC-060.md`, tests, and all user documentation
  — this planning task records the removal-ledger collection and verification, but makes no changes
  to those files.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/base/editorRegistry.ts` | Remove `EditorModule.Body`, its E1-9 `BodyView`→`Body` normalization block, and stale `module.Body` comments; retain the `Component`/`View` shim and optional `BodyView`. |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` | Store the `BodyView` constructor, check the `BodyView` embeddability contract, mount it with `mountVanilla`, and update the React component comment/imports. |

No other source or documentation files are planned to change; the explicit deliberately-not-changed
list above is part of the scope.
