# US-1158 — Delete the `EditorModule.Component` arm

**Epic:** [EPIC-072](../../epics/EPIC-072.md) — De-React E14: the `Component` arm dies  
**Depends on:** US-1156 (board) and US-1157 (browser)  
**Status:** Implemented; static validation complete; live editor checks pending

## Goal

Remove the React `Component` arm from the editor-module contract and delete the
registry normalization and editor-renderer code that exists only to support it.
After this task, every registered editor module supplies one required native
`View` constructor, and `AsyncEditorView` renders that native path only.

This document records the implementation plan and result. No tests or harnesses
were added, neither error component was deleted, and the dashboard entry was not
changed.

## Background

EPIC-072 statement 1 is the acceptance target: `EditorModule` has one view arm,
`editorRegistry.ts` has no React import or `React.ComponentType`, and
`loadModule()` has no `mountVanilla` normalization branch. The registry currently
still imports `React` and `mountVanilla` at
`src/renderer/editors/base/editorRegistry.ts:1,5`; its union at `:36-45`
accepts either a required React `Component` with optional `View`, or an optional
`Component` with required `View`. `loadModule()` then synthesizes a React
component from a native constructor at `:308-315` and throws for neither arm at
`:316-318`.

The working tree contains the landed US-1156/US-1157 conversions. The current
board and browser module barrels are the post-conversion shape:
`src/renderer/editors/board/index.ts:11-24` exports `View: BoardEditorView`,
and `src/renderer/editors/browser/index.ts:7-11` exports
`View: BrowserEditorView`, with no `Component` property. Both final barrels and
all module objects were re-verified before collapsing the type.

### The current render seam

`src/renderer/ui/app/RenderEditorView.ts:50-59` adapts a registry module into
the legacy `EditorViewModule` shape:

```ts
return {
    Editor: module.Component as unknown as FileEditorComponent,
    View: module.View as unknown as FileEditorView | undefined,
};
```

The `Editor` value is only the old React arm. Once `EditorModule.View` is
required and `EditorViewModule` is made native-only, the return becomes:

```ts
return { View: module.View };
```

The `EditorOrHost` cast in `asyncProps()` at `:44` is also unnecessary for its
declared union (`EditorModel` is already an `EditorOrHost` member); remove it
and the now-unused import if the tightened types continue to accept the direct
value. The important casts at `:56-57` must not be retained merely to hide a
contract mismatch: `module.View` should be assigned directly, and any type
error must be resolved in the type declaration rather than with `as unknown`.

`src/renderer/editors/types.ts:5-15` declares the legacy adapter types:

```ts
export type FileEditorComponent<...> = React.ComponentType<{ model: T }>;
export interface EditorViewModule {
    Editor: FileEditorComponent;
    View?: FileEditorView;
}
```

`FileEditorComponent` has only one value/type import (`RenderEditorView.ts:3`)
and one barrel export (`src/renderer/editors/index.ts:2`); the repository-wide
scan found no other use. Delete that alias and barrel export. Keep
`EditorViewModule`, but make its sole member `View: FileEditorView` required;
it remains the transport type used by `AsyncEditorView` and `RenderEditorView`.
`FileEditorView` itself is still needed by `AsyncEditorView.ts:2,31`.

### `AsyncEditorView` is editor-only in this codebase

The only production construction sites are
`src/renderer/ui/app/RenderEditorView.ts:19` and `:32`. Both pass the same
`AsyncEditorViewProps` shape created by `asyncProps()` (`getEditorModule`, an
editor model, and `cacheKey: editorId` at `:40-46`). The repository-wide scan
found no other `AsyncEditorView`, `AsyncEditorViewProps`, or
`getEditorModule` caller. Therefore, after `EditorViewModule` has only a
required `View`, `AsyncEditorView` does not need to retain a React root at all.

The React-only pieces are exactly:

- `src/renderer/ui/app/AsyncEditorView.ts:1` — the default `React` import;
- `:8` — `mountReactHandle` and `MountedReactRoot` imports;
- `:12` — `EditorErrorBoundary` import;
- `:29` — the `handle: MountedReactRoot` field;
- `:67-79` — the `handle` snapshot and React disposal half of `onDispose()`;
- `:139-146` — the no-`View` React element, boundary, retained handle render,
  and `mountReactHandle` creation;
- `:150-155` — the React half of `disposeActiveResource()`.

The remaining native lifecycle is not dead code: `moduleCache` at `:14`, the
`module` field at `:32`, `vanillaView`/`vanillaViewCtor` at `:30-31`, the
generation guards, and the constructor/update/mount path at `:98-136` still
serve every editor. The `module.View` condition becomes an unconditional
native path. Cache-key changes must still dispose the current native view,
remove the host, show the loading panel, and load the new module; this is what
keeps switching between editor ids in one page safe.

This conclusion is specific to `AsyncEditorView`. React roots remain required
elsewhere, but not in the page-slot wrapper after US-1157: the former
`PageSlot.render()` method at
`src/renderer/components/page-manager/PageSlot.ts:35-49` had zero callers and
was removed. `AppPageManagerView.ts:157` and `PageManagerView.ts:72` both call
`renderNative`; before removal, the only remaining `.render(...)` in
`PageSlot.ts` was the self-call at `:43` on the dead React handle. After
removing that method,
`mountReactHandle` still has live callers in `renderer/index.tsx:15`,
`uikit/Toolbar/ToolbarView.ts:43`, `uikit/Popover/PopoverView.ts:101`,
`uikit/shared/fill-slot.ts:110`, and `editors/storybook/LivePreview.ts:167`.
The registry uses `mountVanilla` only, not `mountReactHandle`. `mountVanilla` in
`src/renderer/uikit/shared/mount.tsx:99-107` stays: it has roughly thirty
callers and remains the framework boundary primitive. Only the registry's use
of it is removed.

## Verified contract and dependency inventory

### Registered module objects

The scan of every `: EditorModule` declaration found a `View` initializer in
each object/factory. The exact declarations are:

| Module source | Module declaration | `View` initializer |
|---|---:|---:|
| `src/renderer/editors/about/index.ts` | 6 | 9 |
| `src/renderer/editors/archive/index.ts` | 7 | 10 |
| `src/renderer/editors/board/index.ts` | 11 | 14 |
| `src/renderer/editors/board-info/index.ts` | 9 | 12 |
| `src/renderer/editors/browser/index.ts` | 7 | 10 |
| `src/renderer/editors/category/index.ts` | 10 | 13 |
| `src/renderer/editors/draw/index.ts` | 390 | 393 |
| `src/renderer/editors/env-vars/index.ts` | 50 | 53 |
| `src/renderer/editors/file-diff/index.ts` | 91 | 94 |
| `src/renderer/editors/git-tree/index.ts` | 8 | 11 |
| `src/renderer/editors/graph/index.ts` | 216 | 219 |
| `src/renderer/editors/grid/index.ts` | 293 | 297 |
| `src/renderer/editors/html/index.ts` | 206 | 209 |
| `src/renderer/editors/image/index.ts` | 11 | 14 |
| `src/renderer/editors/link-editor/index.ts` | 440 | 443 |
| `src/renderer/editors/log-view/index.ts` | 181 | 184 |
| `src/renderer/editors/markdown/index.ts` | 199 | 202 |
| `src/renderer/editors/mcp-inspector/index.ts` | 9 | 12 |
| `src/renderer/editors/mermaid/index.ts` | 286 | 289 |
| `src/renderer/editors/mneme-config/index.ts` | 13 | 16 |
| `src/renderer/editors/mneme-root/index.ts` | 11 | 14 |
| `src/renderer/editors/monaco/index.ts` | 45 | 48 |
| `src/renderer/editors/notebook/index.ts` | 299 | 302 |
| `src/renderer/editors/rest-client/index.ts` | 50 | 53 |
| `src/renderer/editors/settings/index.ts` | 6 | 9 |
| `src/renderer/editors/storybook/index.ts` | 9 | 12 |
| `src/renderer/editors/svg/index.ts` | 152 | 155 |
| `src/renderer/editors/tools-hub/index.ts` | 6 | 9 |
| `src/renderer/editors/toolset/index.ts` | 11 | 14 |
| `src/renderer/editors/video/index.ts` | 8 | 11 |

There is no registered BodyView-only module. `BodyView` remains optional on
`EditorModuleCommon` at `editorRegistry.ts:19-34`. It is supplied by the grid
factory (three exported modules), HTML, Markdown, Mermaid, and SVG modules;
each of those also has a required-looking `View` initializer in the table
above. `NoteItemActiveEditorView.ts:144-169` deliberately checks optional
`module.BodyView`, creates the embedded editor with `module.createEditor()`,
and mounts only that body constructor. The Component removal does not alter
this per-note dispatch or the `BodyView` contract.

### `getModule()` and registration consumers

The exact `editorRegistry.getModule()` consumers are:

| Caller | Verified use | Effect of required `View` |
|---|---|---|
| `src/renderer/ui/app/RenderEditorView.ts:54` | adapts the module for `AsyncEditorView` | change adapter to `{ View: module.View }` |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditorView.ts:146-165` | reads `BodyView` and `createEditor` | no change; optional `BodyView` remains |
| `src/renderer/api/pages/PagesLifecycleModel.ts:158-160` | reads `newEditorModel` only | no change |

`src/renderer/editors/register-editors.ts:122-130` types each row's `load`
as `() => Promise<EditorModule>`, and `:132-203` supplies the dynamic loaders;
the registration loop at `:205-215` stores them as `EditorDefinition`s. No row
object supplies a module directly and no registration code reads `Component`.
Once the type is collapsed, this existing loader contract will make a missing
`View` a compile-time error. With the verified current module list, no row is
expected to fail solely because of the collapse.

### Deletion list, in dependency order

This is the complete arm-specific deletion list. The evidence column is the
repository-wide value-use scan for each symbol; it distinguishes the last
shell use from independent consumers that must remain.

| Order | File and current lines | Delete or simplify | Evidence of last use / safe boundary |
|---:|---|---|---|
| 1 | `src/renderer/editors/types.ts:5-12` | Delete `FileEditorComponent`; remove `EditorViewModule.Editor`; make `EditorViewModule.View` required. | `FileEditorComponent` is referenced only by its declaration, `editors/index.ts:2`, and `RenderEditorView.ts:3,56`. `EditorViewModule` remains used by `RenderEditorView` and `AsyncEditorView`. |
| 2 | `src/renderer/editors/index.ts:1-4` | Remove only the `FileEditorComponent` barrel export. | The repository-wide scan found no import of that barrel symbol beyond `RenderEditorView`, which is changed in order 6; the `EditorViewModule` export remains live. |
| 3 | `src/renderer/editors/base/editorRegistry.ts:1,5,36-45` | Remove the type-only React import and the two-arm `Component`/`View` union; retain one required `View` constructor. | `Component` appears in this file only in the union and its loader normalization at `:308-317`; no module object or registration reads it. `VanillaViewCtor` remains needed for `View` and `BodyView`. |
| 4 | `src/renderer/editors/base/editorRegistry.ts:302-318` | Remove the `mountVanilla` synthesis branch and neither-arm throw; keep load, cache, and return. | The registry is the only `mountVanilla` caller in this file, and the new required type makes the neither-arm state impossible. The helper itself has many independent callers and is not deleted. |
| 5 | `src/renderer/components/page-manager/PageSlot.ts:1-2,8,12,35-49,82-115` | Delete the uncalled React `render()` method, `reactHandle`, React imports, and React disposal half; retain native disposal after placeholder removal. | Current callers are only `AppPageManagerView.ts:157` and `PageManagerView.ts:72`, both `renderNative`. The only remaining `.render(...)` is `this.reactHandle.render(element)` at `:43` inside the method itself. `mountReactHandle` remains live in the five callers listed above. |
| 6 | `src/renderer/ui/app/RenderEditorView.ts:3,50-59` | Stop importing `FileEditorComponent`/the unnecessary `FileEditorView` adapter and return `{ View: module.View }`; remove the `Editor` property and double casts. | `getEditorModule()` is the only producer of `EditorViewModule`; its only consumer is the `AsyncEditorView` instance created at `:19,32`. The only `EditorViewModule.Editor` read is `AsyncEditorView.ts:143`, removed in order 7; no other `module.Component` read exists beyond the registry normalization and this adapter. |
| 7 | `src/renderer/ui/app/AsyncEditorView.ts:1,8,12,29,67-79,139-146,150-155` | Remove React, `MountedReactRoot`, `mountReactHandle`, `EditorErrorBoundary`, `handle`, and all React disposal/render code; make the existing native branch unconditional. | `AsyncEditorView` has only the two `RenderEditorView` construction sites. Other `mountReactHandle` callers are independently enumerated above, and other `EditorErrorBoundary` consumers are enumerated below. |

No other file is deleted for this task. In particular, the type name
`EditorModuleCommon` is not unused: its `createEditor`, `newEditorModel`, and
optional `BodyView` members are consumed by the registry, page lifecycle, and
notebook paths.

## Implementation plan

These changes were applied in dependency order. The line numbers below refer
to the verified pre-implementation source and document the removed symbols.

1. **Remove the obsolete adapter type.** In
   `src/renderer/editors/types.ts:5-12`, delete `FileEditorComponent`, remove
   `EditorViewModule.Editor`, and change `EditorViewModule.View` from optional
   to required. Keep `FileEditorView` at `:14-15`. In
   `src/renderer/editors/index.ts:1-4`, remove only the `FileEditorComponent`
   barrel export and retain `EditorViewModule`.

2. **Collapse the registry contract.** In
   `src/renderer/editors/base/editorRegistry.ts:1,5,36-45`, remove the
   `React` type import and replace the two-arm union with one
   `View: VanillaViewCtor<{ model: EditorModel }>` member alongside
   `EditorModuleCommon`. Keep the optional `BodyView` member and its separate
   `EditorConfig` shape.

   Before → after:

   ```ts
   // Before
   export type EditorModule = EditorModuleCommon & (
       | { Component: React.ComponentType<{ model: EditorModel }>; View?: VanillaViewCtor<{ model: EditorModel }> }
       | { Component?: React.ComponentType<{ model: EditorModel }>; View: VanillaViewCtor<{ model: EditorModel }> }
   );

   // After
   export type EditorModule = EditorModuleCommon & {
       View: VanillaViewCtor<{ model: EditorModel }>;
   };
   ```

3. **Delete registry-only normalization.** In
   `src/renderer/editors/base/editorRegistry.ts:302-320`, after
   `module = await def.loadModule()`, remove the `!module.Component` branch
   that calls `mountVanilla` and remove the neither-arm throw. Keep module
   caching at `:319-320`; `def.loadModule()` now has a type contract requiring
   `View`, so no runtime arm-normalization is needed. Remove `mountVanilla`
   from this file's import while retaining `VanillaViewCtor` for the type.

   Before → after:

   ```ts
   // Before
   module = await def.loadModule();
   if (!module.Component && module.View) {
       const Ctor = module.View;
       module = {
           ...module,
           Component: (props: { model: EditorModel }): React.ReactElement =>
               mountVanilla(Ctor, props),
       };
   }
   if (!module.Component && !module.View) {
       throw new Error(`Editor "${id}" has neither a React Component nor a vanilla View.`);
   }

   // After
   module = await def.loadModule();
   this.modules.set(id, module);
   return module;
   ```

4. **Remove the dead React arm from `PageSlot`.** In
   `src/renderer/components/page-manager/PageSlot.ts:1-2,8,12,35-49,82-115`,
   first re-run the current caller search and require that only
   `AppPageManagerView.ts:157` and `PageManagerView.ts:72` call `renderNative`.
   Then delete `render(root, content: ReactNode)`, `reactHandle`, the React
   imports, and the React disposal half. Keep `nativeView`, `disposed`, and
   native disposal ordering exactly as it is: remove the placeholder at `:94`
   before calling `nativeView.dispose()` at `:101-103`. The `generation` field
   and local exist only for the removed queued React disposal and can also be
   removed. Update the class comment from two-arm ownership to native-page
   ownership.

   Before → after for disposal:

   ```ts
   // Before
   const reactHandle = this.reactHandle;
   this.reactHandle = undefined;
   const nativeView = this.nativeView;
   this.nativeView = undefined;
   this.element.remove();
   try {
       if (nativeView) nativeView.dispose();
   } finally {
       if (reactHandle) queueMicrotask(() => reactHandle.dispose());
   }

   // After
   const nativeView = this.nativeView;
   this.nativeView = undefined;
   this.element.remove();
   if (nativeView) nativeView.dispose();
   ```

5. **Make the render adapter native-only.** In
   `src/renderer/ui/app/RenderEditorView.ts:1-7,40-46,50-59`, remove
   `FileEditorComponent`, `FileEditorView`, and the `EditorOrHost` imports.
   Return only `{ View: module.View }`, with no `as unknown as` casts. The
   direct model value is assignable because `EditorModel` is already a member
   of `EditorOrHost`; no compatibility cast is needed. Do not change board-id
   resolution, `cacheKey`, child release, or model-id switching.

6. **Remove the dead React arm from `AsyncEditorView`.** In
   `src/renderer/ui/app/AsyncEditorView.ts`, make the following native-only
   simplification without changing the pre-existing missing `.catch()` in
   `load()` (that defect belongs to US-1160):

   - remove the React, `mountReactHandle`, `MountedReactRoot`, and
     `EditorErrorBoundary` imports;
   - remove `handle`;
   - simplify `onDispose()` to snapshot/clear/dispose only `vanillaView`, while
     preserving its generation-guarded microtask behavior;
   - make `renderEditor()` use the existing `module.View` constructor path
     unconditionally, preserving the update reuse check, constructor/mount
     cleanup, and `showVanillaError()`;
   - simplify `disposeActiveResource()` to clear/dispose/remove only the
     native view; and
   - retain the cache-key invalidation and `module.View` constructor identity
     check, since they are needed when one page switches between editor ids.

   Before → after for the arm selection:

   ```ts
   // Before
   if (module.View) {
       // native construction/update path
       return;
   }
   // React.createElement(EditorErrorBoundary, ..., module.Editor)

   // After
   // native construction/update path, using the required module.View
   ```

7. **Leave shared React infrastructure and error components intact.** Do not
   edit or delete `src/renderer/uikit/shared/mount.tsx`,
   `src/renderer/components/page-manager/PageSlot.ts`'s native disposal path,
   `src/renderer/editors/base/EditorError.tsx`, or
   `src/renderer/ui/app/EditorErrorBoundary.tsx`. `EditorErrorBoundary`
   still has consumers at `draw/index.ts:2,340`, `env-vars/index.ts:2,24,42`,
   `file-diff/index.ts:2,55,60,78,83`, `graph/index.ts:2,147`,
   `rest-client/index.ts:2,24,42`, and `storybook/LivePreview.ts:2,178`;
   those belong to E15 (the current Async shell import is the one removed by
   this task). The registry's `mountVanilla` use is the only mount helper use
   deleted here.

## Concerns

### Native failure behavior is intentionally handed to US-1160

Before this change, `AsyncEditorView.ts:139-146` gives only the React arm an
`EditorErrorBoundary`; the native arm already uses `showVanillaError()` at
`:162-175`. After this change every editor uses the native arm, so the native
failure path is universal and there is no error boundary in `AsyncEditorView`.
That makes US-1160 necessary rather than optional: it owns the user-visible
native failure path and the pre-existing missing `.catch()` in
`AsyncEditorView.load()`. US-1158 must not add a replacement boundary, alter
`showVanillaError()`, or fix the missing catch, and the two tasks must not be
reordered.

`EditorError.tsx` and `EditorErrorBoundary.tsx` are not Component-arm-only
files. The consumer scan verified that `editors/base/EditorError.tsx` is used
by `draw/DrawBody.tsx:14,125`, `graph/GraphBody.tsx:4,511`, and
`rest-client/RestClientBody.tsx:2,28` (the `grid/GridEditor.ts:438` match is
only a comment), while neither board nor browser imports either error file.
E15 editor bodies and Storybook still use them, so both are explicitly
no-change files for US-1158.

### Type-check fallout to inspect explicitly

The collapse is compile-wide even though the current modules are already
native-shaped. The implementation must inspect compiler output for these
surfaces rather than treating the registry edit as local:

- all 30 module declarations/factories listed above, especially board and
  browser after US-1157 is complete;
- all five BodyView-capable module sources and the notebook dispatch;
- `EditorViewModule` construction in `RenderEditorView` and all
  `AsyncEditorView` props/fields/methods;
- the three `getModule()` callers listed above; and
- `EditorRow.load` and every dynamic loader in `register-editors.ts`.

The expected compiler result is that no module object or registration row needs
a new `View`, because every verified object already supplies one. The project
compiler has `strict` disabled in `tsconfig.json`, and the existing
`FileEditorView` constructor type is structurally compatible with the registry
constructor; the direct `View` assignment therefore needs no `as unknown as`
bridge. If implementation changes either side's generic, keep both declarations
aligned rather than restoring a cast or widening the registry contract.
`BodyView` stays optional and is not part of the one-arm collapse.

### Resource ownership and switching

`AsyncEditorView` still owns a native view and its host, and `RenderEditorView`
still replaces the whole async child when `model.id` changes at
`:27-37`. Within one async instance, `cacheKey` is the editor id at
`RenderEditorView.ts:45`; its change triggers disposal and reload at
`AsyncEditorView.ts:52-64`. The implementation must preserve both mechanisms.
Live verification must include switching between two different editor ids in
one page, not only opening one native editor.

## Acceptance criteria

- [x] `EditorModule` is one required native `View` arm; it has no `Component`
      member and no `React.ComponentType` reference.
- [x] `src/renderer/editors/base/editorRegistry.ts` has no `react` import, and
      `grep -n "Component" src/renderer/editors/base/editorRegistry.ts` returns
      only unrelated words (for example comments or identifiers), with no
      `Component` field or normalization code.
- [x] `loadModule()` no longer synthesizes a component with `mountVanilla` and
      no longer throws for a missing arm; it still loads, caches, and returns
      the registered module.
- [x] `EditorViewModule` has only required `View`; `FileEditorComponent` and
      its barrel export are gone; `RenderEditorView` returns `View` directly
      without the old double casts.
- [x] `AsyncEditorView` has no React import, React handle field, React disposal
      path, `mountReactHandle` import, or `EditorErrorBoundary` import; its
      native update/mount/disposal, generation, and cache-key behavior remain.
- [x] `BodyView` remains optional and notebook per-note dispatch still mounts
      it; no BodyView-only module is introduced.
- [x] `mountVanilla`, `mountReactHandle`, `PageSlot`,
      `src/renderer/editors/base/EditorError.tsx`, and
      `src/renderer/ui/app/EditorErrorBoundary.tsx` remain available for their
      other consumers.
- [x] Type-check the full renderer and inspect the compiler output against the
      module, BodyView, getModule, notebook, and registration inventory above.
- [ ] Start a cold app/dev server and verify that at least one native editor
      mounts successfully.
- [ ] In one page, switch between two different editor ids and verify the old
      native view is disposed, the new view mounts, and no stale view/root is
      left behind. This exercises the simplified arm selection and `cacheKey`
      lifecycle.
- [x] Do not fix `AsyncEditorView.load()`'s missing `.catch()`, add tests or
      harnesses, delete either error component, modify the dashboard, or commit.

### Validation record

`npm run typecheck`, `npm run lint`, and `npm run build-prod` all passed. The
production build emitted existing Vite warnings about `import.meta`, ineffective
dynamic imports, plugin timings, and large chunks, but ended with
`Production build complete.` The statement-1 search found no `Component` match
in `editorRegistry.ts` and no React import there. Live native-editor mounting
and switching between two editor ids were not exercised in this session; those
remain the final manual checks.

## Files changed

| File | Planned change |
|---|---|
| `src/renderer/editors/types.ts` | Delete `FileEditorComponent`; make `EditorViewModule.View` the required sole member. |
| `src/renderer/editors/index.ts` | Remove the `FileEditorComponent` barrel export; retain `EditorViewModule`. |
| `src/renderer/editors/base/editorRegistry.ts` | Collapse `EditorModule` to required `View`; remove React import and registry `mountVanilla` normalization. |
| `src/renderer/ui/app/RenderEditorView.ts` | Return native `View` directly; remove obsolete adapter imports/casts. |
| `src/renderer/ui/app/AsyncEditorView.ts` | Remove the dead React editor arm and retain the native lifecycle/cache path. |
| `src/renderer/components/page-manager/PageSlot.ts` | Remove its uncalled React page arm; keep native placeholder-removal-before-disposal ordering. |
| `src/renderer/uikit/shared/mount.tsx` | **No change.** `mountVanilla` and independent React-root helpers remain shared infrastructure. |
| `src/renderer/ui/app/EditorErrorBoundary.tsx` | **No change.** E15 and Storybook consumers remain. |
| `src/renderer/editors/base/EditorError.tsx` | **No change.** Its E15 editor-body consumers remain. |
| `src/renderer/editors/register-editors.ts` | **No change expected.** Its loader contract is checked by the collapsed type. |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditorView.ts` | **No change expected.** It consumes optional `BodyView`, not `Component`. |
| `doc/active-work.md` | **No change.** The US-1158 epic entry already exists. |


---

## Verification (2026-08-27, after a cold dev-server restart)

**Statement 1's instrument passes.**

| Check | Result |
|---|---|
| `grep -n "Component" src/renderer/editors/base/editorRegistry.ts` | **no matches at all** |
| `react` import in `editorRegistry.ts` | none |
| `EditorModule` shape | `EditorModuleCommon & { View: VanillaViewCtor<{ model: EditorModel }> }` — one required arm |
| `Component:` across every editor module barrel | **0** |
| React references in `components/page-manager/PageSlot.ts` | **none** |

**Live: native mounting and editor switching both work.**

| Step | visible editor elements | `.monaco-editor` present | spinners | error panels | app React roots |
|---|---:|---|---:|---:|---:|
| markdown open | 61 | no | 0 | 0 | 1 |
| switch → monaco | 711 | yes | 0 | 0 | 1 |
| switch → md-view | 61 | no | 0 | 0 | 1 |
| switch → monaco (warm module cache) | 711 | yes | 0 | 0 | 1 |

The warm-cache switch is byte-for-byte the same shape as the cold one, which exercises
`AsyncEditorView`'s `cacheKey` path — the code this task simplified. No spinner and no error panel at
any point means neither the async load nor the native construct/mount path regressed.

Only the visible `page-editor` was measured. A first attempt read the first matching node instead and
reported an identical element count for two different editors — a reminder that on a surface where
inactive pages stay in the DOM, "the element" and "the visible element" are different queries.

### `PageSlot` is now fully native — a consequence, not a scope expansion

US-1157 switched `PageManagerView` to `renderNative`, and `AppPageManagerView` already used it, so
`PageSlot.render()` — the React arm of the per-page mount path — had zero callers repo-wide by the time
this task ran. It is deleted along with its `reactHandle` field, the React half of its disposal, and its
`React` / `ReactNode` / `mountReactHandle` / `MountedReactRoot` imports. The native disposal ordering is
unchanged: the placeholder is removed **before** the view is disposed, which is deliberate and correct
for a webview.

This is worth more than the arm itself. `PageSlot` is what every editor in the application mounts
through, and it now contains no React at all.
