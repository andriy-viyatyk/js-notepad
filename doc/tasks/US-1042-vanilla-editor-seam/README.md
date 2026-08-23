# US-1042: Vanilla editor registration seam + convert the toolset editor

Parent epic: [EPIC-059: De-React Epic E1 — Editor foundations](../../epics/EPIC-059.md)

## Goal

Add an additive vanilla View arm to editor registration, normalize it into a stable React compatibility arm, and mount vanilla full editors directly. Prove the seam by converting the chrome-free toolset editor to ToolsetEditorView, so its module is vanilla-only and exercises the direct AsyncEditorView path without creating a React root.

## Background

### Current contracts and call sites

src/renderer/editors/base/editorRegistry.ts:18-34 currently requires Component: React.ComponentType<{ model: EditorModel }> and optionally accepts Body: React.ComponentType<{ model: EditorModel; editorConfig?: EditorConfig }>.

src/renderer/editors/types.ts:4-10 currently defines FileEditorComponent<T> as React.ComponentType<{ model: T }> and EditorViewModule as { Editor: FileEditorComponent }. The additive type change must preserve those React-facing signatures.

Every current arm read is:

- src/renderer/ui/app/RenderEditorView.ts:54 reads module.Component and adapts it to EditorViewModule.Editor.
- src/renderer/ui/app/AsyncEditorView.ts:93 invokes the adapted module.Editor through React.createElement.
- src/renderer/ui/app/AsyncEditor.tsx:59 also invokes module.Editor, but AsyncEditor.tsx is exported from src/renderer/ui/app/index.ts:4 and has no renderer call site; it is unreferenced and out of scope.
- src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx:72-75 loads a module and checks module.Body; line 85 stores it, and line 99 invokes it as <Body model={editor} editorConfig={editorConfig} />.

There are no other EditorModule.Component or EditorModule.Body reads. src/renderer/api/pages/PagesLifecycleModel.ts:158-160 calls the registry only for newEditorModel, not an editor arm. The existing 31 Component: providers and five Body: providers remain untouched. The toolset provider is the one intentional full-editor conversion.

### Registry return value and normalization

src/renderer/editors/base/editorRegistry.ts:287-289 defines getModule(id) as a delegation to private loadModule(id). The cache is in loadModule() at lines 291-298:

~~~ts
private async loadModule(id: string): Promise<EditorModule> {
    let module = this.modules.get(id);
    if (module) return module;
    // resolve the definition and load it
    module = await def.loadModule();
    this.modules.set(id, module);
    return module;
}
~~~

Normalize immediately before this.modules.set(id, module), not in getModule(). This is one wrapper identity per editor id for the application lifetime. It also covers the other private-loader callers: the preload loop at editorRegistry.ts:276 and createEditor() at line 237. Normalizing in getModule() would synthesize a fresh React wrapper on every call and could make React remount the editor subtree.

The source module needs a compile-time invariant that at least one full-editor arm exists. Use the discriminated union below, with the body arm additive:

~~~ts
type EditorModuleCommon = {
    createEditor(): EditorModel;
    newEditorModel?(filePath?: string): Promise<EditorModel>;
    Body?: React.ComponentType<{ model: EditorModel; editorConfig?: EditorConfig }>;
    BodyView?: VanillaViewCtor<{ model: EditorModel; editorConfig?: EditorConfig }>;
};

export type EditorModule = EditorModuleCommon & (
    | { Component: React.ComponentType<{ model: EditorModel }>; View?: VanillaViewCtor<{ model: EditorModel }> }
    | { Component?: React.ComponentType<{ model: EditorModel }>; View: VanillaViewCtor<{ model: EditorModel }> }
);
~~~

This exact shape was temporarily applied to editorRegistry.ts, then npm run typecheck was run. It exited 0 with no edits to the 31 Component: providers, five Body: providers, register-editors.ts, or any reader. Therefore choose the union: it makes a missing full-editor arm a compile-time error without changing existing providers. The only meaningful union-aware read is registry normalization. Body and BodyView remain independent optional capabilities because a full editor is not necessarily embeddable.

VanillaViewCtor is exported from src/renderer/uikit/shared/mount.tsx:5. mountVanilla(ctor, props) from lines 100-107 returns a React.ReactElement, not a component. The synthesized React arm must therefore be the explicit .ts-safe function `(props: { model: EditorModel }): React.ReactElement => mountVanilla(Ctor, props)`. Preserve authored React arms and expose vanilla constructors directly. The same normalization rule applies to BodyView → Body.

The React-facing notebook dispatch needs no edit. Its language-gated switch list at src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx:16-27 chooses the note editor id; the presence of Body is checked only after that choice at line 73. Normalization supplies the React Body where a module has a true embeddable BodyView, so the existing line 99 remains valid unchanged.

Body/BodyView specifically means a chrome-free embeddable notebook body. An internal body view must never be registered as BodyView: it is a false capability claim and may omit required actions. The shared BodyView arm is declared here because it belongs to the registry seam; its proving consumer is US-1046 (mermaid). toolset has no Body or embeddable role and registers no BodyView.

### Other registry path and lazy loading

src/renderer/editors/board/custom-editor-registry.ts:44-67,188-214 stores file masks, priorities, source capability, and editor ids. It does not store or load EditorModule, Component, Body, View, or BodyView; no arm belongs there. The board virtual-id mapping remains in src/renderer/ui/app/RenderEditorView.ts.

src/renderer/editors/register-editors.ts:213 assigns loadModule: e.load, the raw dynamic-import thunk. It is not definition-level memoization; module identity is stable in practice because repeated ES-module imports return the same namespace object. Switching RenderEditorView from def.loadModule() to editorRegistry.getModule() preserves that existing stability only because normalization occurs once before the cache write.

Keep RenderEditorView's getById check and its board-editor: virtual-id mapping. The registry's getModule()/loadModule() error "No editor registered for id: <id>" should remain for callers that reach it directly. RenderEditorView's existing "No editor registered for id: <editorId>" remains the user-facing error after the getById check; the same missing-definition path does not reach both throws.

### Vanilla lifecycle, adapters, and errors

src/renderer/uikit/shared/vanilla-view.ts was read in full. mount() calls onMount() once, update() only updates after mounting, and dispose() disposes owned children and resources before onDispose(). Important ordering: VanillaView.update() assigns this.props = props before calling onUpdate(props), so this.props is never the previous value inside that hook. Converted views must store any previous identity/value explicitly.

src/renderer/uikit/shared/mount.tsx was read in full. mountVanilla creates a React adapter element but no React root; mountReactHandle is the adapter that calls createRoot. Pattern references read in full are src/renderer/components/file-list/FileListView.ts, src/renderer/components/git-tree/GitTreeView.ts, src/renderer/ui/tabs/PageTabsView.ts, and src/renderer/uikit/Notification/NotificationView.tsx. They show owned children, subscriptions, explicit previous-value fields, and co-located static CSS.

src/renderer/editors/base/EditorError.tsx:5-22 is React-only: a centered Panel named editor-error containing warning-colored, pre-wrapped Text. It has no vanilla factory. The vanilla branch must create the equivalent DOM in AsyncEditorView.ts with createPanelElement and createTextElement; it must not wrap the vanilla constructor in EditorErrorBoundary, because that would create the React root this seam avoids. Caught values are unknown and must be formatted with errMessage/guard per project rules.

No current editor-root code relies on React context, error-boundary descendants, or Suspense. A search found no createContext, useContext, or Suspense in src/renderer/editors. AsyncEditor.tsx is unreferenced and is not a loader contract for this change.

### Toolset proving consumer

src/renderer/editors/toolset/index.tsx:11-28 currently defines ToolsetEditorComponent and registers it as Component. Replace that provider with View: ToolsetEditorView; remove the now-unnecessary adapter function. This is the vanilla-only module that proves registry normalization creates its React compatibility arm while AsyncEditorView consumes the direct vanilla arm.

src/renderer/editors/toolset/ToolsetEditorView.tsx is chrome-free: its directory contains no TextChrome, PageToolbar, or @monaco-editor/react. It is therefore the correct whole-editor pilot. Its root marker moves to `data-name="toolset-editor"` — see below.

The view has two reactive sources. The model projection at lines 15-21 reads toolsetRoot, manifest, valid, errors, and title; toolsTrust.useIsTrusted(root) at line 22 depends on the first source's root. In vanilla form, bind the model first, store the current root, compute initial trust from toolsTrust.isTrusted(root), then subscribe to toolsTrust.subscribePaths. On model updates, assign the new root before reading trust or rebuilding the trust-dependent controls. This ordering prevents a trust callback from reading a stale root. Dispose both subscriptions through VanillaView ownership.

The keyed tools.map((t) => …) list at lines 105-129 is keyed by t.name. Use KeyedList from src/renderer/uikit/shared/keyed-list.ts, retaining keyed child DOM and updating/removing entries rather than rebuilding the subtree. Use SubtreeSwap from src/renderer/uikit/shared/subtree-swap.ts for the !s.valid && errors.length > 0 error-panel/tool-list ternary at lines 91-131; do not call replaceChildren on every state change.

### Icons: the toolset view is verified React-free

All four icons the view uses have icon-registry **names**, so nothing needs a React arm:

| JSX today | Registry name | Source |
|---|---|---|
| `<ToolsIcon width={20} height={20}/>` (line 58) | `"tools"` | `theme/icon-registry.ts:129` |
| `<RefreshIcon/>` (line 69) | `"refresh"` | `theme/icon-registry.ts:180` |
| `<FolderOpenIcon/>` (line 83) | `"folder-open"` | `theme/icon-registry.ts:188` |
| `<LogIcon/>` (line 86) | `"log"` | `theme/icon-registry.ts:206` |

`ButtonView`/`IconButtonView` take `icon: IconRef` and handle a **string name** through
`createIconElement` (`IconButtonView.tsx:97-98`), taking the React `fillSlot` arm only for a
`ReactNode`. So pass the name strings, never JSX. For the standalone header icon use
`createIconElement("tools", { width: 20, height: 20 })` from `uikit/shared/slots.ts:46`.

Consequence: **`ToolsetEditorView` contains no JSX and must be renamed `ToolsetEditorView.ts`**
(and `toolset/index.tsx` → `index.ts`, since removing `ToolsetEditorComponent` leaves no JSX there
either). Update the import in the module file; the dynamic import in `register-editors.ts` omits the
extension, so it is unaffected. A `.tsx` file with no JSX would be the one place a later reader
assumes React is still involved.

### The root marker moves from `data-type` to `data-name`

`ToolsetEditorView.tsx:46` passes `data-type="toolset-editor"` to `<Panel>`, overriding the
primitive's own `data-type`. Do **not** reproduce that. Two reasons, both verified:

1. `applyPanelAttributes` (`panel-style.ts:304-307`) assigns `element.dataset.type = "panel"`
   unconditionally, so an override written before/through `createPanelElement` is silently lost.
2. Overriding a UIKit primitive's own `data-type` is the hazard EPIC-058 recorded — every rule in a
   primitive's stylesheet keys on it. `Panel.css` happens to contain **no** `data-type` selector, so
   the current override is harmless today, but reproducing the pattern in new code is not.

Use `createPanelElement({ name: "toolset-editor", … })`, which emits `data-name="toolset-editor"` —
the actual addressing attribute in
[ui-element-contract.md](../../architecture/ui-element-contract.md). Verified safe: `rg toolset-editor`
across `src/` matches only `ToolsetEditorView.tsx:46`, no CSS and no query anywhere, and the root
Panel currently carries no `name`, so nothing is lost.

The converted composition is pure UIKit. Verified vanilla forms are createPanelElement from src/renderer/uikit/Panel/panel-style.ts:342-349, createTextElement(value: string, props?: TextStyleProps) from src/renderer/uikit/Text/text-style.ts:100-108, ButtonView from src/renderer/uikit/Button/ButtonView.tsx, IconButtonView from src/renderer/uikit/IconButton/IconButtonView.tsx, and SpacerView from src/renderer/uikit/Spacer/SpacerView.tsx. Use their static CSS/direct imports as required; no Emotion, hardcoded colors, or arbitrary inline styles.

Move handleRefresh, handleOpenFolder, and handleOpenLog from lines 24-41 onto the view or model without changing behavior. Refresh still refreshes registered tools and reloads the model; folder opening still calls pagesModel.addEmptyPageWithNavPanel(root); log opening still calls model.getLogPath(), checks fs.exists, calls ui.notify("No execution log yet — run a tool first.", "info") when absent, and opens the file when present.

## Implementation Plan

### 1. Add additive arms and normalize before caching

Modify src/renderer/editors/base/editorRegistry.ts and import VanillaViewCtor from src/renderer/uikit/shared/mount.tsx.

Before:

~~~ts
Component: React.ComponentType<{ model: EditorModel }>;
Body?: React.ComponentType<{ model: EditorModel; editorConfig?: EditorConfig }>;
~~~

After, use the common-plus-union shape shown above, adding View and BodyView with matching props. In loadModule(), after await def.loadModule() and immediately before this.modules.set(id, module), synthesize missing React arms with `(props: { model: EditorModel }): React.ReactElement => mountVanilla(Ctor, props)`. Keep View/BodyView direct, preserve authored arms, and throw with the editor id if runtime data somehow violates the compile-time full-editor invariant. This produces one normalized wrapper per cached id.

### 2. Carry both full-editor arms through the adapter

Modify src/renderer/editors/types.ts:

~~~ts
export type FileEditorView<T extends EditorOrHost | IContentHost = EditorOrHost | IContentHost> =
    VanillaViewCtor<{ model: T }>;

export interface EditorViewModule {
    Editor: FileEditorComponent;
    View?: FileEditorView;
}
~~~

Editor remains the normalized React compatibility component. View is the optional direct constructor for AsyncEditorView.

### 3. Switch lazy rendering to the normalized registry result

Modify src/renderer/ui/app/RenderEditorView.ts.

Before:

~~~ts
const module = await def.loadModule();
return { Editor: module.Component as unknown as FileEditorComponent };
~~~

After:

~~~ts
const module = await editorRegistry.getModule(defId);
return {
    Editor: module.Component as unknown as FileEditorComponent,
    View: module.View as unknown as FileEditorView | undefined,
};
~~~

Retain the getById guard and board-editor: mapping. The getModule() switch is safe only because C3's before-cache normalization preserves stable identity.

### 4. Add the direct vanilla branch to AsyncEditorView

Modify src/renderer/ui/app/AsyncEditorView.ts. Keep generation, live, activeCacheKey, the loading UI, and the existing microtask-deferred onDispose structure.

Before, every module follows:

~~~ts
React.createElement(EditorErrorBoundary, null, React.createElement(module.Editor, { model }));
mountReactHandle(this.editorHost, element);
~~~

After, if module.View exists, construct new module.View({ model }), append view.root to this.editorHost, and call view.mount() inside try/catch. Do not use EditorErrorBoundary or mountReactHandle for this branch. Catch construction and mount failures, dispose/remove a partial view, and show the EditorError equivalent built with createPanelElement and createTextElement; format the caught value with errMessage/guard. The React branch remains unchanged.

Track the active vanilla view and its constructor. Reuse it only when constructor and activeCacheKey are unchanged, calling update({ model }); otherwise dispose the old React or vanilla resource before mounting the new arm. Clear active fields synchronously, then preserve the existing generation-guarded microtask disposal so stale disposal cannot touch a newly mounted resource.

### 5. Convert the toolset whole editor

Modify src/renderer/editors/toolset/index.tsx:

Before:

~~~ts
Component: ToolsetEditorComponent,
~~~

After:

~~~ts
View: ToolsetEditorView,
~~~

Remove only the unnecessary ToolsetEditorComponent; retain createEditor, newEditorModel, and exports.

Rewrite src/renderer/editors/toolset/ToolsetEditorView.tsx as VanillaView while preserving the existing model projection, title, root data-type, controls, labels, handlers, error content, and keyed tool fields. Use model-first/trust-second subscription ordering, KeyedList for t.name entries, and SubtreeSwap for the invalid/error versus valid/tool-list branch. Own all child views and subscriptions through the vanilla lifecycle. Use createPanelElement, createTextElement, ButtonView, IconButtonView, and SpacerView only after the verified APIs above; retain UIKit semantic props and static CSS imports.

## Concerns

- The discriminated union was not adopted speculatively: the exact proposed shape passed npm run typecheck with no provider, registration, or reader edits. Keep the runtime guard only as defensive protection for dynamically loaded data.
- Normalization must remain before the cache write. Moving it to getModule() changes wrapper identity on repeated calls and risks React remounts.
- The trust subscription depends on model state. Store the current root from the model projection before evaluating trust or responding to trust-path changes.
- SubtreeSwap requires detached branch roots and explicit branch mounting; it is the correct subtree transition primitive, while replaceChildren is reserved for replacing the complete editor-error presentation.
- AsyncEditorView must clean up constructor and mount failures without introducing a React root. Use errMessage/guard for caught unknown values and semantic UIKit styling.
- Rule 1 is preserved: the whole toolset editor is converted because it has no React chrome parent; the notebook body contract is only declared here and is proven later by US-1046.

Files intentionally unchanged: src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx, src/renderer/editors/board/custom-editor-registry.ts, src/renderer/editors/base/EditorError.tsx, every src/renderer/editors/base/ chrome file, src/renderer/uikit/shared/vanilla-view.ts, src/renderer/uikit/shared/mount.tsx, src/renderer/ui/app/AsyncEditor.tsx, all existing React provider files other than the toolset provider, src/renderer/editors/register-editors.ts, doc/active-work.md, and doc/epics/EPIC-059.md.

## Acceptance Criteria

- EditorModule has the compile-time full-editor union (Component or View) and additive Body/BodyView arms with matching props; all existing React providers compile unchanged.
- FileEditorComponent and EditorViewModule preserve the React signature and carry the optional vanilla constructor.
- loadModule() normalizes before this.modules.set; getModule() returns the cached normalized module, including stable (props) => mountVanilla(Ctor, props) compatibility wrappers.
- NoteItemActiveEditor.tsx requires no edit and its current Body dispatch remains valid; the custom board registry requires no arm changes.
- RenderEditorView uses getModule(), retains the virtual board-id mapping and its single user-facing missing-definition check, and forwards both normalized arms.
- AsyncEditorView mounts vanilla views directly, never wraps them in EditorErrorBoundary, preserves generation/live/cache-key behavior, and disposes vanilla resources through the existing deferred lifecycle.
- Vanilla construction/mount errors are cleaned up and shown with the semantic equivalent of EditorError, using errMessage/guard and no hardcoded colors.
- toolset registers `View: ToolsetEditorView` and no `Component`; the files are renamed to `.ts` (no JSX remains); the root carries `data-name="toolset-editor"` via `createPanelElement({ name })` and does **not** override the primitive's `data-type`.
- Every icon is passed as a registry **name** string (`"tools"`, `"refresh"`, `"folder-open"`, `"log"`), so the converted editor contains no React element at all.
- The toolset view binds both model projection and trust-path changes in dependency order, uses KeyedList keyed by tool name, uses SubtreeSwap for the conditional branch, and preserves all three async handler behaviors including fs.exists and ui.notify.
- No unit tests are added. Before implementation is handed off, use the project gates npm run typecheck, npm run lint, and npm run build-prod, plus manual vanilla editor mount/update/switch/close checks.
- This planning task makes no source implementation, dashboard/epic edit, or commit.

## Files Changed

| File | Planned change |
|---|---|
| src/renderer/editors/base/editorRegistry.ts | Add the discriminated full-editor arms, additive body arms, and before-cache normalization. |
| src/renderer/editors/types.ts | Add the vanilla constructor type and optional EditorViewModule.View. |
| src/renderer/ui/app/RenderEditorView.ts | Load normalized modules through editorRegistry.getModule() and forward both arms. |
| src/renderer/ui/app/AsyncEditorView.ts | Mount vanilla views directly, preserve React behavior, and handle vanilla errors/disposal. |
| src/renderer/editors/toolset/index.tsx | Replace the unnecessary React adapter registration with View: ToolsetEditorView. |
| src/renderer/editors/toolset/ToolsetEditorView.tsx | Convert the chrome-free toolset editor to a bound VanillaView with keyed lists and subtree swaps. |

No new body-view file is planned. No editors/base chrome file, board custom registry, notebook dispatch file, legacy unreferenced AsyncEditor.tsx, or tracking document changes.
