# US-1167 — Reduce the `draw` editor to a minimal Excalidraw React island

## Goal

Reduce `src/renderer/editors/draw/` to one clearly named React island containing only the
Excalidraw vendor component and its required `useHandleLibrary` hook. Move the draw editor's
chrome, state projection, library-install handling, browse-link interception, persistence debounce,
and lifecycle teardown into a native `DrawBodyView`, while preserving the existing draw editor
behavior and keeping React installed for this vendor boundary.

This is US-1167 in [EPIC-073](../../epics/EPIC-073.md), under E15-1, E15-2 correction 7, E15-5
item 3, and concerns C1, C1a, C9a, C12, C13, C14, C18, and E15-8. The terminal decision is
“React only where a vendor requires it”: Excalidraw remains a sanctioned React island in `draw`.
Moving Excalidraw into `persephone-boards` is explicitly out of scope
([EPIC-073.md:280-306](../../epics/EPIC-073.md#e15-8--handoff-to-epic-f-measured)).

No implementation, tests, test harnesses, commit, or `doc/active-work.md` change is part of this
task-document thread.

## Background

### Governing decision and verified vendor constraint

The installed `@excalidraw/excalidraw` is version `0.18.1` and declares both `react` and
`react-dom` as peer dependencies (`node_modules/@excalidraw/excalidraw/package.json:1-3,57-60`).
Its package exports the main Excalidraw entry and type/CSS subpaths, but no framework-free editor
entry (`node_modules/@excalidraw/excalidraw/package.json:8-21`). The public types identify
`Excalidraw` as a React component and `useHandleLibrary` as a hook requiring an
`ExcalidrawImperativeAPI` (`node_modules/@excalidraw/excalidraw/dist/types/excalidraw/index.d.ts:1-7,24`,
`node_modules/@excalidraw/excalidraw/dist/types/excalidraw/data/library.d.ts:92-112`). The
Excalidraw props also confirm that `initialData`, `excalidrawAPI`, `onChange`, `libraryReturnUrl`,
`theme`, and `UIOptions` are the relevant integration props
(`node_modules/@excalidraw/excalidraw/dist/types/excalidraw/types.d.ts:405-445`).

Therefore the goal is not zero React roots in this editor and must not be achieved by hiding JSX in
`createElement` calls in a `.ts` file. The island remains JSX in a `.tsx` file. After Epic F's
type-surface and Storybook work, Epic F will add an ESLint rule confining `react`/`react-dom`
imports to `src/renderer/editors/draw/**` as recorded in E15-8
([EPIC-073.md:286-306](../../epics/EPIC-073.md#e15-8--handoff-to-epic-f-measured)).

### Measured draw scope

The measured folder is five JSX markers across five files: `DrawBody.tsx` is 163 lines, while
`DrawEditor.ts`, `drawExport.ts`, `drawLibrary.ts`, and `index.ts` are respectively 219, 214, 53,
and 397 lines (EPIC-073 E15-4, `EPIC-073.md:139-174`). The actual directory currently contains
exactly those five files. `DrawBody.tsx` is the only file containing the React component, hooks,
Excalidraw JSX, UIKit JSX, and the module-level asset-path side effect
(`src/renderer/editors/draw/DrawBody.tsx:1-163`). `index.ts` also has the one temporary React
`createElement` import used solely by its body wrapper (`src/renderer/editors/draw/index.ts:1-5,
338-344`); the directory-wide plan removes that import, leaving the island as the only draw file
with a React runtime import.

The irreducible React portion is:

- `<Excalidraw ... />` at `DrawBody.tsx:135-159`.
- `useHandleLibrary({ excalidrawAPI, adapter })` at `DrawBody.tsx:63-65`; its API state is held by
  `useState` at `DrawBody.tsx:44-45`, so the hook must remain inside a React component and must
  re-run when the vendor API arrives.

Everything else is a native-view responsibility:

| Existing code | Verified source | Native target |
|---|---|---|
| `editor.state.use({ loading, error, darkMode })` | `DrawBody.tsx:46-52` | One `DrawBodyView.bind()` projection installed once in `onMount()`. |
| Error and loading branches | `DrawBody.tsx:125-126` | A native warning message branch and `SpinnerView`; no `EditorError` or `EditorErrorBoundary` import. |
| Draw panel and wrapper | `DrawBody.tsx:128-134,160-161` | `createPanelElement` with the exact panel props and a native wrapper/host. |
| Browse-library click interception | `DrawBody.tsx:67-75` | `listen(wrapper, "click", ...)` with native `MouseEvent`; route to `pagesModel.openUrlInBrowserTab`. |
| API/timer cleanup | `DrawBody.tsx:54-60` | One `own()` cleanup clearing the timer and calling `editor.clearExcalidrawApi()`. |
| Library initialization/adapter | `DrawBody.tsx:62-65` | Adapter field created once; `initDefaultLibraryPath()` called once from `onMount()`. |
| Library-install URL subscription | `DrawBody.tsx:77-108` | Native `browserUrlChanged` subscription, installed once and released through `own()`. |
| Debounced save path | `DrawBody.tsx:110-123` | Native callback field plus owned timer cleanup; preserve the 500 ms delay. |

### Current native composition and related files

`draw/index.ts` already contains a native `DrawToolbarView`, with native `IconButtonView`, menu,
and export/screen-snip behavior (`src/renderer/editors/draw/index.ts:37-336`). Its remaining React
surface is the `createElement`/`EditorErrorBoundary` body wrapper at `:338-344`, and its
`DrawEditorView` passes that React element into `TextChromeView` at `:346-387`. `DrawEditorView`
must retain the toolbar and change only the body composition to own a `DrawBodyView` and pass its
stable `root` as the `children` slot. `TextChromeView` accepts native `Node` slot content
(`src/renderer/editors/base/TextChromeView.ts:18-24`) and fills that slot during its native mount
path (`TextChromeView.ts:409-433`).

`DrawEditor.ts` remains the model owner: it parses content and drives `loading`/`error`
(`src/renderer/editors/draw/DrawEditor.ts:138-155`), exposes the scene data and API bridge
(`DrawEditor.ts:157-175,200-211`), follows theme changes and persists the draw setting
(`DrawEditor.ts:82-123,192-196`), and disposes the editor model (`DrawEditor.ts:215-218`).
`drawExport.ts` remains a plain Excalidraw export/conversion helper, and `drawLibrary.ts` remains
the library persistence adapter/path helper (`drawLibrary.ts:9-53`). Neither has a React view to
convert and neither needs a change for this task.

### Native seams and lifecycle rules

`mountReactHandle(host, element)` creates the nested React root, marks the host with
`data-react-root`, retains a `render()` handle, and removes the marker on `dispose()`
(`src/renderer/uikit/shared/mount.tsx:122-157`). The native body owns the host element and the
returned handle; it must call `dispose()` from `own()` and never let an update create a second
root.

`VanillaView.bind()` applies immediately, subscribes through the view owner, and has no early
release API (`src/renderer/uikit/shared/vanilla-view.ts:202-231`). All `bind()`/`listen()` calls
therefore belong in `onMount()` exactly once, not in a repeatedly called synchronization method
(C1). `SubtreeSwap` is the established owner for conditional branches; it claims, attaches,
disposes, and detaches the outgoing branch (`src/renderer/uikit/shared/subtree-swap.ts:1-78`).
The native-view authoring rules require detached branch views to be mounted after the swap attaches
them, and require explicit ownership/cleanup (`src/renderer/uikit/CLAUDE.md:487-515,
695-738`).

The native error owner remains `AsyncEditorView`, which catches native constructor/mount/update
failures and displays `NativeEditorErrorView` (`src/renderer/ui/app/AsyncEditorView.ts:99-164`).
The draw body’s parsed-content error is a normal visible state and should be a native message
element; do not recreate either React error component.

### Human routing facts

To open the editor for the presence pass, a human opens a real JSON drawing file whose filename
ends in `.excalidraw` through the normal file-open/Explorer flow. `editor-matchers.ts` assigns
`draw-view` an extension acceptance score of 50, offers it for `.excalidraw` switch choices, only
accepts JSON as its language, and also detects content beginning with an Excalidraw JSON `type`
field (`src/renderer/editors/base/editor-matchers.ts:136-140`). The registration uses the exact
editor id `draw-view`, display name `Drawing`, `hasContentHost: true`, and lazy-loads
`./draw` (`src/renderer/editors/register-editors.ts:157-159`). A blank drawing can alternatively be
created by the sidebar Drawing tool, which calls `pagesModel.addEditorPage("draw-view", "json",
"untitled.excalidraw")` (`src/renderer/ui/sidebar/tools-editors-registry.ts:86-92`).

The reviewed references establish the verification discipline: native conversions run
`npm run typecheck`, `npm run lint`, and `npm run build-prod`, do not add tests, and scope DOM
assertions to the visible page editor (`doc/tasks/US-1166-env-vars-native/README.md:486-510`,
`doc/tasks/US-1166-env-vars-native/README.md:510-560`;
`doc/tasks/US-1168-file-diff-native/README.md:359-376,434-499`). The references also record that the available instrument
cannot reliably drive real keyboard typing or av-grid editing, and that fixed-position overlays
must be checked with `getBoundingClientRect()`/computed style rather than `offsetParent`
(`doc/tasks/US-1168-file-diff-native/README.md:533-620`; EPIC-073 `:89-137`). The same honesty applies here to actual
canvas gestures and the save path.

## Implementation Plan

### 1. Add `ExcalidrawIsland.tsx` as the only draw React file

Create `src/renderer/editors/draw/ExcalidrawIsland.tsx` and delete `DrawBody.tsx` only after all
native callers are wired. The new file must have a header comment recording all four facts:

1. It is the single sanctioned React file in the renderer for this vendor island.
2. `@excalidraw/excalidraw@0.18.1` requires React through its `react`/`react-dom` peer
   dependencies and has no non-React entry point.
3. Epic F will add an ESLint rule confining `react` imports to `editors/draw/**`.
4. The existing source comments disagree about whether `EXCALIDRAW_ASSET_PATH` is read at vendor
   module-init time or before component mount; the observable working contract is the latter, but
   this task preserves today’s ordering rather than resolving that uncertainty.

Keep the Excalidraw stylesheet import in this island, with the existing ESLint explanation, so the
CSS remains loaded when draw is lazy-loaded (`DrawBody.tsx:10-11`). Move the existing Window
augmentation and guarded asset-path assignment here unchanged (`DrawBody.tsx:24-37`):

```ts
declare global {
    interface Window {
        EXCALIDRAW_ASSET_PATH?: string;
        __EXCALIDRAW_ASSET_PATH_SET?: boolean;
    }
}

if (!window.__EXCALIDRAW_ASSET_PATH_SET) {
    window.EXCALIDRAW_ASSET_PATH = "app-asset://excalidraw/";
    window.__EXCALIDRAW_ASSET_PATH_SET = true;
}
```

Preserve the current relative ordering exactly: keep the assignment in the island module body after
its static imports, just as it is after the imports in `DrawBody.tsx:1-37`. The comments at
`DrawBody.tsx:24-25` and `:33` disagree. ES module evaluation
means the static Excalidraw import is evaluated before that module-body assignment; that is the
ordering already shipped and the only ordering with feature evidence. The second existing comment—
that the path must be set before the component mounts—is the observably true operating contract;
the module-init comment is contradictory and must be recorded as such, not silently “fixed.” Do not
hoist the assignment into an earlier-evaluated module, move it into `DrawBodyView.ts`, or put it in
a callback/effect. The relevant runtime evidence is the guarded value being present when the
component mounts and no failed `app-asset://excalidraw/...` requests.

Keep JSX in this `.tsx` file. Export the island component plus a small element factory from the
same `.tsx` module, for example `createExcalidrawIslandElement(props)`, so `DrawBodyView.ts` can
request a `ReactElement` without importing `react` or using `createElement` itself. The factory is
the boundary: its implementation stays JSX in the `.tsx` file.

The island props should be the minimum vendor-facing contract:

| Prop/data | Ownership and update rule |
|---|---|
| `theme` (`THEME.DARK`/`THEME.LIGHT`) | The only ordinary parent prop that requires `render()` when `darkMode` changes. |
| `initialData` | Construct once when the first ready branch is mounted from `editor.elements`, `editor.appState`, and `editor.files`; include the Helvetica fallback exactly as `DrawBody.tsx:141-148` does. It is initial-only per the Excalidraw contract and must not be rebuilt or relied upon to reset a scene. |
| `libraryAdapter` | Construct once as a native-view field from `createLibraryAdapter()` and pass the same object to `useHandleLibrary`; do not recreate it on a render. |
| `onApi` | Stable callback supplied by the native body. The island forwards the vendor API to it and also stores the API in local `useState` so `useHandleLibrary` re-runs when the API arrives. |
| `onChange` | Stable native callback supplied by the body; pass it unchanged to Excalidraw. It does not cause a parent render. |
| `libraryReturnUrl` and `UIOptions` | Keep the existing constant values from `DrawBody.tsx:140-158`; define/reuse stable values and do not render the island merely because these unchanged constants are re-created. |

The island component itself should only call the needed React hooks, call
`useHandleLibrary({ excalidrawAPI, adapter: libraryAdapter })`, and render `<Excalidraw>` with the
existing vendor props. It must not own native panels, timers, subscriptions, `pagesModel`, or
error/loading branches. Internal API state is deliberately allowed: it is required by the vendor
hook and does not create another root.

### 2. Add `DrawBodyView.ts` for all native behavior around the island

Create `src/renderer/editors/draw/DrawBodyView.ts` as a `VanillaView<{ model: DrawEditor }>` with
a stable `display: contents` root and a body-owned branch host. Use direct imports of
`createPanelElement`, `createTextElement`, `SpinnerView`, `SubtreeSwap`, `VanillaView`, and
`mountReactHandle`; import `SpinnerProps` only as a type if a typed prop object is needed. Do not
import `EditorError`, `EditorErrorBoundary`, or `react`.

Use a single projection binding installed in `onMount()`:

```ts
this.bind(
    this.model.state,
    (state) => ({ loading: state.loading, error: state.error, darkMode: state.darkMode }),
    (projection) => this.syncBranch(projection),
);
```

Preserve the current precedence exactly: error first, loading second, ready third
(`DrawBody.tsx:125-126`). Keep a body-owned `SubtreeSwap<"error" | "loading" | "ready">`, update
the retained branch when its key is unchanged, and mount a newly-created branch after the swap has
attached its detached root. On disposal, dispose the swap through `own()`.

Implement the branches in this file:

- Error: create the native equivalent of the old `EditorError` layout—a centered, padded panel
  with warning/pre-wrapped text whose `textContent` is the current error. Use the existing
  `createPanelElement`/`createTextElement` theme-token APIs; do not hardcode a color and do not
  import the React `EditorError`.
- Loading: own and mount `SpinnerView`, preserving the existing loading branch semantics.
- Ready: create the panel with exactly `{ name: "draw-root", direction: "column", flex: 1,
  overflow: "hidden", position: "relative" }`, then create the wrapper with exactly
  `flex: "1 1 auto"`, `width: "100%"`, and `height: "100%"`. Append a dedicated `div` island
  host to that wrapper before calling `mountReactHandle`.

The ready branch’s wrapper must register both listeners with `listen()`:

- `contextmenu`: call `stopPropagation()` exactly as before (`DrawBody.tsx:130-133`) so
  Persephone’s own context menu does not appear over the Excalidraw canvas; Excalidraw’s menu must
  remain available.
- `click`: inspect the native `event.target` with `closest("a.library-menu-browse-button")`, call
  `preventDefault()`, read `href`, and route a non-null href to
  `pagesModel.openUrlInBrowserTab(href)` (`DrawBody.tsx:67-75`).

This remains effective for clicks inside Excalidraw because the island host is a real DOM child of
the native wrapper. A click originating on an Excalidraw descendant bubbles through the React root
host to the wrapper listener; the listener sees the original descendant as `event.target`, so
`closest()` finds the vendor’s Browse libraries anchor. React’s internal component boundary does
not stop ordinary DOM bubbling. This must be a native wrapper listener, not a listener on the
island’s React component. The Browse-libraries click is a blocking presence check. If the native
wrapper listener does not see the click, use the named `ReactBrowseClickFallback`: add a React
`onClick` to the island’s wrapping div that calls the native callback prop
`onBrowseLibraries(href)` supplied by `DrawBodyView`. That restores the original event semantics
while keeping routing logic native.

The native body owns these stable fields and resources:

- `model` and one `libraryAdapter = createLibraryAdapter()` field. The adapter is not disposed by
  the view; it is a plain adapter and its file operations remain in `drawLibrary.ts`.
- One stable `handleChange` callback with a `ReturnType<typeof setTimeout> | undefined` field.
  Clear an existing timer before scheduling the 500 ms call to
  `editor.updateFromExcalidraw(elements, appState, files)` (`DrawBody.tsx:110-123`). Register one
  `own()` cleanup that clears any pending timer so disposal cannot write after the view is gone.
- One `own()` cleanup that calls `editor.clearExcalidrawApi()` together with the timer cleanup,
  preserving the existing unmount contract (`DrawBody.tsx:54-60`).
- One `onMount()` call to `initDefaultLibraryPath()` (`DrawBody.tsx:62-65`). It is fire-and-forget
  in the same lifecycle sense as the existing effect; if an error is surfaced, use the project
  `guard`/`errMessage` conventions rather than an unhandled hand-rolled catch.
- One `browserUrlChanged.subscribe()` from `onMount()`, released by an `own()` disposer. Preserve
  `LIBRARY_RETURN_URL`, hash parsing, `addLibrary` decoding, `fetch(...).then(res => res.blob())`,
  `api.updateLibrary({ libraryItems, merge: true, prompt: true, openLibraryMenu: true })`, and
  `pagesModel.showPage(hostId)` (`DrawBody.tsx:22,77-101`). Preserve the caught value as `err`
  (or `e`) and format it with `errMessage(err)` for the existing `ui.notify` error message
  (`DrawBody.tsx:103-105`).

Apply C1a precisely: return without changing `event.handled` for already-handled events, events
without this editor’s current API, URLs outside the library-return prefix, URLs without a hash, or
URLs without `addLibrary`. Set the mutable `handled` flag only for a valid event this handler
processes, as the shared event contract permits (`src/renderer/core/state/events.ts:44-51`). Do
not dispose or otherwise consume any shared event/map/registry entry that this view did not create.

The ready branch should retain a stable `initialData` object and stable callback/adapter
references. Its `onUpdate({ theme })` must call `reactHandle.render(...)` only when the theme
actually changes. Re-render with the same `initialData` reference and the same stable callbacks;
never use a new `initialData` object to attempt a scene reset. No render is needed for the adapter,
callbacks, URL, or UI options. The `useState` API transition is internal to the island and is the
reason `useHandleLibrary` can respond when the API arrives.

### 3. Replace the body composition in `draw/index.ts`

Remove the `createElement`, `EditorErrorBoundary`, and `DrawBody` imports and delete
`drawBodyElement()`. Import `DrawBodyView` and retain the existing native toolbar, export helpers,
menus, icons, and module factory. The exact composition change is:

```ts
// Before: src/renderer/editors/draw/index.ts:1-5,338-344,355-362
import { createElement } from "react";
import { EditorErrorBoundary } from "../../ui/app/EditorErrorBoundary";
import { DrawBody } from "./DrawBody";

function drawBodyElement(model: DrawEditor) {
    return createElement(
        EditorErrorBoundary,
        null,
        createElement(DrawBody, { model }),
    );
}

children: drawBodyElement(model),
```

```ts
// After: native body root is passed directly through TextChromeView's Node slot
import { DrawBodyView } from "./DrawBodyView";

const body = this.child(new DrawBodyView({ model }));
const chrome = this.child(new TextChromeView({
    model: this.props.model,
    rightToolbarContributions: toolbar.root,
    children: body.root,
}));

this.root.append(toolbar.root, body.root, chrome.root);
toolbar.mount();
body.mount();
chrome.mount();
```

Store `body` on `DrawEditorView`, update the existing body on the existing model instance, and pass
`body.root` to `chrome.update()`. Add the same model-identity guard used by the reviewed native
editor conversions: a different `DrawEditor` instance is an invariant failure, not a reason to
rebuild children in `onUpdate()` (`doc/tasks/US-1166-env-vars-native/README.md:258-331`;
`doc/tasks/US-1168-file-diff-native/README.md:286-358`). Keep
the module factory and public exports at `index.ts:390-397` unchanged apart from the view wiring.

The body root must be attached before the ready branch’s Excalidraw host is mounted, and it must be
attached before `chrome.mount()` moves the native body root into the `TextChromeView` children
slot. The body/toolbar/chrome are created once in `onMount()` and updated in place thereafter.

### 4. Verify the native cut and the intentional React boundary

Run only the existing project checks after implementation:

```text
npm run typecheck
npm run lint
npm run build-prod
```

After the `.tsx` rename/deletion and new `.tsx` island import, use a cold renderer/dev-server
restart if Vite retains an old dynamic specifier, following the conversion guidance in
`CLAUDE.md` and the reviewed US-1168 record (`doc/tasks/US-1168-file-diff-native/README.md:359-376`). Do not add unit tests,
fixtures, a harness, or a commit.

Structural checks:

- `src/renderer/editors/draw/DrawBody.tsx` is gone; `ExcalidrawIsland.tsx` is the only `.tsx` in
  `editors/draw/`.
- `ExcalidrawIsland.tsx` is the only file in `editors/draw/` with a `react` runtime import. The
  other draw files may retain Excalidraw type/value imports needed by model/export behavior, but
  no other draw file imports `react`; in particular `DrawBodyView.ts` imports the island factory,
  not React.
- `DrawBodyView.ts` contains no JSX, React import, `EditorError`, or `EditorErrorBoundary`; its
  state subscriptions/listeners are installed once from `onMount()` and all timers, subscriptions,
  and the React handle have `own()` cleanup.
- No UIKit `*.tsx` face, `src/renderer/uikit/shared/slots.ts`,
  `src/renderer/uikit/shared/fill-slot.ts`, `PopoverView.tsx`, `DialogView.tsx`,
  `TextChromeView.updateSlots`, or `React.*` type surface is modified (C12-C14).
- New renderer code uses theme/color tokens, the existing file-path utility for path work, `app.fs`
  for any newly introduced app file operation, `errMessage(e)` for caught values, and static or
  co-located CSS. This task introduces no file operation or CSS file, so `drawLibrary.ts` and its
  existing app filesystem facade remain unchanged.

## Concerns / Open questions

### Resolved decisions

1. **React is intentionally retained.** The vendor peer dependency and hook contract make the
   island irreducibly React. No Excalidraw relocation to boards and no `.ts`/`createElement`
   workaround is permitted (EPIC-073 E15-2 correction 7 and E15-8).
2. **The island’s prop surface is minimal.** Theme is the only parent-driven prop that causes a
   native `render()`; `initialData` is captured once, and stable callbacks, adapter, library URL,
   and UI options are not used as re-render triggers. Excalidraw’s API state remains inside the
   island because `useHandleLibrary` needs it.
3. **The asset side effect preserves today’s ordering.** Keep the Window augmentation, guard, and
   exact `app-asset://excalidraw/` assignment in the island module body after its static imports,
   exactly as in `DrawBody.tsx:1-37`. The existing comments at `DrawBody.tsx:24-25` and `:33`
   conflict: the module-init-time comment
   cannot describe the current sequence because the static vendor import evaluates first, while
   the before-component-mount comment is the observably true operating contract. Record that
   contradiction in the island header; do not hoist the assignment, move it to `DrawBodyView.ts`,
   or otherwise change the relative ordering. Verify effectiveness only at runtime by checking the
   exact global value and the absence of failed `app-asset://excalidraw/...` requests.
4. **The native wrapper owns browse navigation, with a named fallback.** Event bubbling from
   React-generated descendants reaches the wrapper, so the internal-browser route remains
   functional without putting any React event type or handler in native code. The mandatory check
   is `ReactBrowseClickFallback`: if the native listener does not see the click, put a React
   `onClick` on the island’s wrapping div that calls the native `onBrowseLibraries(href)` callback
   supplied by `DrawBodyView`.
5. **The native context-menu listener protects the canvas interaction.** Its purpose is to stop
   Persephone’s own context menu from appearing over the canvas, while leaving Excalidraw’s menu
   available; verify that right-clicking the canvas shows Excalidraw’s menu, not Persephone’s.
6. **Shared URL events are not owned resources.** The subscription is owned and unsubscribed by
   `DrawBodyView`; an incoming event is only marked handled after this handler recognizes a valid
   library-install URL and has a live API. No event or shared entry is disposed (C1a).
7. **Native parsed-content errors and owner-level crashes remain distinct.** The body’s `error`
   state gets a native warning message. Constructor/mount/update failures still flow through the
   existing `AsyncEditorView` → `NativeEditorErrorView` path; no React error boundary is restored.
8. **`index.ts` needs composition changes only.** Its toolbar, export menus, image/snip actions,
   model factory, and public exports are already native and remain behaviorally unchanged
   (`src/renderer/editors/draw/index.ts:37-336,346-397`).
9. **UIKit compatibility surfaces are not part of this task.** Any type-only imports that remain
   valid are expected under C12; no UIKit face or shared React compatibility helper is edited.
10. **No application-wide zero-root claim is valid.** An open draw page is expected to measure one
   `[data-react-root]` for the Excalidraw island, plus the app-wide `GlobalStyles` root while that
   boundary remains. This task’s structural proof is editor-local.

### Unverified until implementation

- A human must confirm that the visible Excalidraw canvas renders and accepts a real drawing. The
  available instrument can inspect the visible DOM, but it cannot reliably perform the pointer
  gesture needed to prove canvas drawing, so a structural canvas/root check must be recorded as
  insufficient and the gesture remains unverified until a human performs it.
- A human must draw or otherwise change scene content, wait longer than 500 ms, and confirm the
  host-backed save path writes the change. The instrument cannot reliably drive the canvas gesture
  or substitute a direct model mutation for the actual Excalidraw `onChange` → debounce path; this
  remains unverified if it cannot perform that interaction.
- Theme switching and the visible error message are clickable or inspectable checks, but they
  still require a post-implementation live pass. The Browse-libraries click is the mandatory
  blocking check above; library-install network success/failure is not a substitute for checking
  that the Browse link opens the internal browser.
- The loading branch may be too brief to capture through the available instrument; if it cannot be
  held or observed, record the loading-branch check as unverified rather than claiming it from the
  static branch key. The error branch can be exercised with malformed Excalidraw JSON if a human
  provides such a file; do not use forbidden customer-data files.
- The exact visible-editor geometry and root count require a cold renderer after the `.tsx` change.
  Select the visible page editor by a non-empty `getClientRects()` result and scope all DOM queries
  to it. For any fixed-position browser/menu overlay, use `getBoundingClientRect()` or computed
  style; never use `offsetParent` (EPIC-073 E15-3 and US-1168 verification).

### Acceptance Criteria

#### Native cut and lifecycle

- [ ] `src/renderer/editors/draw/DrawBodyView.ts` exists, is used by `DrawEditorView`, contains no
  JSX or `react` import, and owns the native error/loading/ready branches.
- [ ] `src/renderer/editors/draw/ExcalidrawIsland.tsx` is the named JSX island and its header
  comment records the vendor peer-dependency reason, Epic F’s future ESLint confinement rule, and
  the contradictory asset-path comments plus the decision to preserve today’s ordering.
- [ ] The island contains only the Excalidraw component, its required `useHandleLibrary` hook/API
  state, vendor stylesheet, asset-path side effect, and the JSX element factory; native editor
  state, timers, subscriptions, panels, and page routing are outside it.
- [ ] `DrawBody.tsx` is deleted only after the new body and island are wired. No UIKit `*.tsx` file
  is changed or deleted.
- [ ] The body uses exactly one state `bind()` installed from `onMount()`. It preserves error-over-
  loading-over-ready precedence, uses native panel/text/spinner constructs, and disposes branch
  ownership through `SubtreeSwap`/`own()`.
- [ ] The ready panel preserves `name="draw-root"`, `direction="column"`, `flex={1}`,
  `overflow="hidden"`, and `position="relative"`; its wrapper preserves the exact flex, width,
  and height values from `DrawBody.tsx:129-134`.
- [ ] **Blocking Browse-libraries check:** click Excalidraw’s `a.library-menu-browse-button` and
  confirm it prevents external navigation and calls `pagesModel.openUrlInBrowserTab(href)`. If
  the native wrapper listener does not see the click, apply the named `ReactBrowseClickFallback`:
  the island’s wrapping div gets React `onClick` that calls native `onBrowseLibraries(href)` from
  `DrawBodyView`, then rerun this check.
- [ ] **Blocking context-menu check:** right-click the visible Excalidraw canvas and confirm
  Excalidraw’s context menu appears, not Persephone’s app context menu; this verifies the native
  listener still stops the app menu from appearing over the canvas.
- [ ] `initDefaultLibraryPath()` runs once from `onMount()`, `createLibraryAdapter()` is called
  once, and the same adapter is passed to the island.
- [ ] `browserUrlChanged` is subscribed once from `onMount()` and released through `own()`. Valid
  library-return events update the API and set `handled`; unrelated/already-handled/no-API events
  are ignored and no shared event/resource is disposed.
- [ ] The native `onChange` callback preserves the 500 ms debounce and
  `editor.updateFromExcalidraw` arguments. Disposal clears a pending timer and
  `editor.clearExcalidrawApi()` through owned cleanup, so a queued callback cannot save after
  disposal.
- [ ] The React handle is created once for the ready branch with `mountReactHandle`, the host is
  marked by the shared `data-react-root` mechanism, and the handle is disposed through `own()`.
- [ ] At runtime, `window.EXCALIDRAW_ASSET_PATH === "app-asset://excalidraw/"` when the editor
  opens, and the console contains no failed `app-asset://excalidraw/...` requests. Typechecking
  does not prove that this asset path is effective.
- [ ] `theme` is the only prop change that causes the native branch to call `render()`. The
  `initialData` object is initial-only and stable; changing it is not used to reset the scene.
  Stable adapter/callback/constants do not trigger renders, and API arrival is handled by the
  island’s internal hook state.

#### Exact composition and scope guards

- [ ] `draw/index.ts` has no `createElement`, `EditorErrorBoundary`, or `DrawBody` import/function;
  it owns one `DrawBodyView`, passes `body.root` as the native `TextChromeView.children` slot,
  appends roots before mount, and updates existing children without rebuilding them.
- [ ] `DrawEditorView.onUpdate()` rejects a different model instance as an invariant failure and
  otherwise updates the existing body, toolbar, and chrome.
- [ ] `find src/renderer/editors/draw -name "*.tsx"` returns only `ExcalidrawIsland.tsx`, and a
  source import check shows no `react` import in any other draw file.
- [ ] No UIKit `*.tsx` face, `PopoverView.tsx`, `DialogView.tsx`, `slots.ts`, `fill-slot.ts`,
  `TextChromeView.updateSlots`, or `React.*` type surface is changed. `DrawEditor.ts`,
  `drawExport.ts`, `drawLibrary.ts`, editor matchers, and editor registration require no behavior
  change.
- [ ] No tests, test harnesses, fixtures, commits, or `doc/active-work.md` modifications are
  added. Existing renderer file operations continue to use the project filesystem API and no
  direct Node `fs` or `path` operation is introduced.

#### React-root and visible behavior presence checks

- [ ] With a visible `.excalidraw` page open, the visible page editor contains exactly one
  `[data-react-root]` descendant: the Excalidraw island host. The criterion is scoped to the
  visible page editor; the app-wide `GlobalStyles` root is intentional and does not fail this
  task.
- [ ] With the same visible page editor, the Excalidraw canvas renders and a human can draw on it.
  If the available instrument cannot perform the drawing gesture, that interaction is recorded as
  unverified rather than replaced by a root-count or DOM-presence claim.
- [ ] The Excalidraw theme follows the app’s dark/light state: exercise the existing draw theme
  button and confirm the canvas changes with it, then confirm app-theme changes follow the model’s
  established `DrawEditor` theme path (`DrawEditor.ts:82-123,192-196`).
- [ ] After a real drawing change, wait at least 500 ms and confirm the debounced
  `onChange` → `updateFromExcalidraw` path writes to the content host. If the available instrument
  cannot draw reliably, record this criterion as unverified.
- [ ] Observe the loading branch during a draw editor load when possible, and open malformed
  Excalidraw JSON to confirm the native error message branch. If the loading state is too brief for
  the available instrument, record it as unverified.
- [ ] Close or switch away from the draw page and confirm the island root marker disappears and no
  pending debounce saves after disposal. All overlay visibility assertions use geometry/computed
  style, never `offsetParent`.

#### Checks

- [ ] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass after a cold renderer
  restart where needed.
- [ ] All manual DOM assertions above select the visible page editor using a non-empty
  `getClientRects()` result and exclude inactive page DOM.

## Files Changed Summary

| File | Planned status | Scope |
|---|---|---|
| `doc/tasks/US-1167-draw-vendor-island/README.md` | Add | This task document only. |
| `src/renderer/editors/draw/DrawBodyView.ts` | Add | Native state branches, Excalidraw host, click/context-menu listeners, library URL subscription, debounce, and owned teardown. |
| `src/renderer/editors/draw/ExcalidrawIsland.tsx` | Add | The single named JSX React island; Excalidraw, `useHandleLibrary`, CSS, global asset-path side effect, and JSX element factory. |
| `src/renderer/editors/draw/index.ts` | Modify | Replace the boundary-wrapped React body with the owned native body root; retain the existing native toolbar and public module exports. |
| `src/renderer/editors/draw/DrawBody.tsx` | Delete | Superseded 163-line mixed React body after native composition is wired. |
| `src/renderer/editors/draw/DrawEditor.ts` | No change | Existing model parsing, theme state, API bridge, persistence, and disposal remain the owners. |
| `src/renderer/editors/draw/drawExport.ts` | No change | Existing Excalidraw export/image/Mermaid conversion helpers remain unchanged. |
| `src/renderer/editors/draw/drawLibrary.ts` | No change | Existing adapter and default library path implementation remains unchanged. |
| `src/renderer/editors/base/editor-matchers.ts` | No change | Existing `.excalidraw`/JSON draw matching is correct. |
| `src/renderer/editors/register-editors.ts` | No change | Existing `draw-view` lazy registration is correct. |
| `src/renderer/uikit/shared/mount.tsx` | No change | Use `mountReactHandle`; do not alter the shared React bridge or root marker. |
| `src/renderer/uikit/shared/slots.ts` | No change | C13 compatibility surface. |
| `src/renderer/uikit/shared/fill-slot.ts` | No change | C13 compatibility surface. |
| `src/renderer/uikit/Popover/PopoverView.tsx` | No change | C14/US-1172 scope. |
| `src/renderer/uikit/Dialog/DialogView.tsx` | No change | C14/US-1172 scope. |
| `src/renderer/editors/base/TextChromeView.ts` | No change | Use its existing native `Node` slot; do not alter `updateSlots`. |
| `src/renderer/editors/base/EditorError.tsx` | No change | Do not import or modify the shared React error component. |
| `src/renderer/ui/app/NativeEditorErrorView.ts` | No change | Existing owner-level native failure surface remains in use. |
| `doc/active-work.md` | No change | Explicitly forbidden in this task thread. |
| Tests, harnesses, fixtures, commits | None | Explicitly forbidden. |

---

## Verification record (2026-08-27)

**Gates:** `npm run typecheck`, `npm run lint`, `npm run build-prod` — all pass.

**Scope:** added `ExcalidrawIsland.tsx` (87 lines) and `DrawBodyView.ts` (327 lines); changed
`draw/index.ts`; deleted `DrawBody.tsx` (163 lines).

**Measured:** JSX markers **354 → 351**. `find src/renderer/editors/draw -name "*.tsx"` returns
**only** `ExcalidrawIsland.tsx`, and it is the **only** file under `editors/draw/` that imports
`react`. The island's entire React surface is `useState` for the vendor API, one `useCallback`,
`useHandleLibrary`, and `<Excalidraw>` — 163 lines of React became 87 lines of island plus 327
lines of native view.

The asset-path side effect is preserved in the island's module body **after** the imports, byte-for-
byte in the same relative position as `DrawBody.tsx:33-37`, per review finding H1.

**Live pass, after a cold dev-server restart**, on a `.excalidraw` fixture holding one rectangle:

| Check | Result |
|---|---|
| React roots inside the visible draw editor | **1** — and it is the island host (contains the canvas) |
| React roots app-wide | **2** (`GlobalStyles` + the island) — the intended terminal state |
| `draw-root` native panel present | yes |
| Excalidraw container + toolbar rendered | yes |
| `window.EXCALIDRAW_ASSET_PATH` | `app-asset://excalidraw/` |
| Island host / container / canvas sizes | 1507×951 / 1507×951 / **both canvases 1507×951** |

### A real defect this pass caught, and why nothing else would have

The first live run measured **1 React root on the correct host** — a perfect result by every
structural check — while the editor was **broken**: the drawing surface had zero height.

The chain measured: `draw-root` 1507×951 → wrapper 1507×951 → **island host 1507×0** →
`.excalidraw` 1507×0 → both canvases 1507×0.

Cause: the island host `div` is an element the React original did not have — `<Excalidraw>` used to
be the wrapper's direct child. Created bare, it is `display: block; height: 0`, and Excalidraw's own
container is `height: 100%`, so it resolved against zero. The plan said "append a dedicated `div`
island host" and never specified the host's own size; the implementation followed the plan exactly.
Fixed by giving the host `width: 100%; height: 100%`, with a comment recording the measured chain.

**This is the clearest C9a case the epic has produced.** Every removal-side measurement passed — the
`.tsx` count, the react-import count, the root count, even the root's identity. The feature was
still invisible. *Introducing a nesting level is a layout change, and a layout change needs a
measured presence check, not a structural one.*

**Not verified — recorded as unverified rather than replaced (C9a):**

- **Drawing on the canvas** and the debounced 500 ms save → `editor.updateFromExcalidraw` round-trip.
  Needs real pointer input.
- **The "Browse libraries" click interception** — the review's blocking check (H2). Its event path
  changed from a React `onClick` to a native wrapper listener, and the named fallback
  (`ReactBrowseClickFallback`) exists if it fails. **This is the highest-value remaining human check
  in this task.**
- **Right-click on the canvas** showing Excalidraw's menu rather than Persephone's.
- **Dark/light theme switching** driving `handle.render()` with a new `theme`.
- **The library-install URL flow** through `browserUrlChanged` (needs the internal browser and a
  library URL).
- **The loading and error branches** — neither was rendered.
- Local font loading via the asset path: the global is set correctly, but no font request was
  inspected, so "fonts resolve from `app-asset://`" is unproven.
