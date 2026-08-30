# US-1209 — Minimap: move the DOM mirror into the view, make it incremental

## Goal

Move all Minimap DOM ownership out of `MinimapModel` and into `MinimapView`, then replace the
mutation-time full HTML serialization with an incremental `MutationRecord` applier. Preserve the
existing scaled preview, viewport indicator, scrolling, dragging, background-click navigation,
and disposal behavior.

Epic: [EPIC-077](../../epics/EPIC-077.md), Strand 1.

This document is planning only. It does not implement source changes, add tests, or add a dashboard
entry; the task is already listed by the epic/dashboard.

## Background

### Scope and verified baseline

EPIC-077 §C-1 statements 1 and 4 apply here. The current implementation violates both at
`src/renderer/uikit/Minimap/MinimapModel.ts`:

- `MinimapModel` stores `scrollContainer`, `contentMirror`, `contentContainer`, `wrapper`, and
  `MutationObserver` at lines 17–21.
- `setScrollContainer()` installs a `MutationObserver` at lines 44–60. Its callback assigns
  `contentMirror.innerHTML = scrollContainer.innerHTML` at lines 46–47, then synchronizes geometry.
- `setScrollContainer()` directly registers the source `scroll` listener at lines 51–54.
- `syncEverything()` repeats the full assignment on the empty-mirror path at lines 101–103.
- `init()` directly registers the `window` `resize` listener at lines 199–202.
- The same model method reads layout (`getBoundingClientRect()`, `scrollHeight`, `clientHeight`,
  `clientHeight`) and writes `contentContainer.style.height` and `wrapper.scrollTop` at lines
  78–131.

The relevant uikit lifecycle rule is in `src/renderer/uikit/shared/vanilla-view.ts`: `listen()`
adds a guarded DOM listener and registers its matching removal with `own()` at lines 176–197;
those disposers drain only when the view is disposed. Therefore both fixed listeners must be
registered from `MinimapView.onMount()`, never from `onUpdate()`, a mutation callback, or another
repeatable path. The observer disconnect must likewise be owned by the view.

The current view already creates the mirror DOM at
`src/renderer/uikit/Minimap/MinimapView.ts:30–43`, binds the model state at lines 76–79, and
owns model disposal at lines 19–26. It currently passes DOM references into the model through
`setWrapper`, `setContentContainer`, and `setContentMirror` at lines 45–48, and delegates pointer
and click handlers to model methods at lines 50–68.

The investigation commands used against the current tree on 2026-08-30 were:

```powershell
rg -n --glob '*.{ts,tsx}' 'Minimap(Model|View)|new Minimap|Minimap' src
rg -n --glob '*.{ts,tsx}' 'setContentMirror|setContentContainer|setWrapper|setScrollContainer|syncEverything|getScale|handleBackgroundClick|mouseEnter|handlePointer' src
rg -n --glob '*.{ts,tsx}' 'cloneNode\(|innerHTML\s*=|MutationObserver' src/renderer/uikit src/renderer/editors
rg -n --glob '*.{ts,tsx}' 'computedStyle|getComputedStyle|querySelector(All)?|getBoundingClientRect|offset|scrollHeight|clientHeight|scrollWidth' src/renderer/uikit/Minimap src/renderer/editors/markdown
```

The first two searches found no Minimap model call site outside `MinimapView`, and no Minimap
view call site outside the two rows below. The geometry search found no computed-style read in
the Minimap; its only mirror measurement is `contentMirror.getBoundingClientRect().height`.

### Consumers and verification surface

| Consumer | Construction and arguments | Role |
|---|---|---|
| `src/renderer/editors/markdown/MarkdownBodyView.ts:430–465` | `reconcileMinimap()` creates `new MinimapView({ name: "markdown-minimap", scrollContainer: this.scrollPanel })` at lines 455–460, appends it, and mounts it at lines 461–464. It releases the child when `editorConfig.hideMinimap` becomes true at lines 447–452. | The one real UIKit Minimap consumer. It is hosted by `MarkdownEditorView` in `src/renderer/editors/markdown/index.ts:152–183`, registered as editor id `md-view` at lines 199–204, and is therefore the production verification surface for Markdown preview. The retained Minimap is not updated with a different source container. |
| `src/renderer/uikit/Minimap/Minimap.story.ts:8–42` | `MinimapDemoView.onMount()` creates a local overflow `<div>` with 36 child lines at lines 21–29, then creates `new MinimapView({ name: "storybook-minimap", scrollContainer })` at lines 31–35 and mounts it at lines 37–38. | Isolated UIKit verification surface; `src/renderer/editors/storybook/storyRegistry.ts:47,73` registers the story. |

`MinimapModel` has no direct consumer: `MinimapView.ts:21–25` is the only construction path, using
the model driver with `defaultMinimapState`. Today the driver receives
`{ scrollContainer: props.scrollContainer }`; after the move it should receive an empty,
DOM-free model prop object because the model no longer needs a source element.

The searches also found other features named “minimap” that are not consumers of this UIKit
component: `src/renderer/editors/notebook/note-editor/MiniTextEditorView.ts:14–21`,
`src/renderer/editors/log-view/items/TextOutputView.ts`, and `src/renderer/ui/dialogs/TextDialogView.ts`
pass `minimap` to Monaco editor options. They must not be changed by this task.

### What the mirror is used for

`src/renderer/uikit/Minimap/Minimap.css:15–29` makes the copied subtree a visual preview: the
content container has `pointer-events: none`, and the content is absolutely positioned and scaled
with `transform: scale(0.15)`, `transform-origin: top left`, `opacity: 0.7`, and `width: 666%`.
The root itself is the scrollable minimap at lines 2–11. The mirror is not hit-tested. Root clicks
are handled by `MinimapView.ts:50–57`, with indicator clicks excluded by the model's current
`handleBackgroundClick()` check at `MinimapModel.ts:178–190`; pointer drag is handled by the
indicator listeners at `MinimapView.ts:66–68`.

No consumer reads computed styles from the mirror. The only value read from it is its transformed
bounding-box height, which participates in the scale calculation at
`MinimapModel.ts:78–85`. The source pane's `scrollTop`, `scrollHeight`, and `clientHeight`, plus
the minimap wrapper's client/scroll heights, drive the geometry at lines 97–131.

The incremental mirror must therefore remain structurally and visually equivalent for the rendered
subtree: preserve element names/namespaces, child order, text, and attributes/classes that affect
layout or appearance. It does not need source event listeners or interaction state. `innerHTML`
copying does not preserve listeners either, and the mirror is intentionally non-interactive.

### Copy mechanism decision

Use `cloneNode(true)` for the initial snapshot, added subtrees, and named full-snapshot fallback.
Index each source node to its clone in a view-owned `WeakMap<Node, Node>`. `cloneNode(true)` avoids
serializing markup to a string and reparsing it, preserves the already-created DOM tree and SVG
namespaces, and has the same desirable listener behavior as the current `innerHTML` copy (source
listeners are not copied). It also avoids making HTML parsing part of every fallback.

The copied subtree is still only the source container's children, matching the current
`scrollContainer.innerHTML` contract; attributes on the source scroll-container element itself are
not copied to the mirror wrapper. Descendant attributes are copied and subsequently updated.
Because both copying mechanisms clone `id` attributes, the document contains duplicate IDs in the
source and mirror. That can affect document-wide `getElementById()` resolution and `#id` CSS
matching, but it is pre-existing behavior of the current `innerHTML` mirror. Do not strip IDs in
this refactor.

### Public surface after the move

`MinimapProps` in `src/renderer/uikit/Minimap/Minimap.ts:3–15` remains unchanged for callers:
`name`, the nullable `scrollContainer`, and the two optional callbacks remain view props. The
existing `MinimapView` constructor and its Storybook/Markdown arguments therefore remain stable.

`MinimapModel` remains an internal driver model and should have no DOM-typed props or fields. Keep
`MinimapState` unchanged (`indicatorTop`, `indicatorHeight`, and `isDragging`). Replace the current
DOM-dependent methods with a scalar geometry/input surface along these lines:

```ts
interface MinimapGeometryInput {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    wrapperHeight: number;
    wrapperScrollHeight: number;
    mirrorHeight: number;
}

interface MinimapLayout {
    scaledContentHeight: number;
    indicatorTop: number;
    indicatorHeight: number;
    wrapperScrollTop: number;
}

// Model methods: numeric inputs/outputs only; no HTMLElement, Event, window, or DOM writes.
syncGeometry(input: MinimapGeometryInput): MinimapLayout;
getScale(mirrorHeight: number, scrollHeight: number): number;
beginDrag(clientY: number, sourceScrollTop: number): void;
getDragScrollTop(clientY: number, input: DragGeometryInput): number;
endDrag(): void;
getBackgroundScrollTop(input: BackgroundClickInput): number;
```

The exact private input type names may be chosen during implementation, but the boundary is fixed:
the view reads DOM measurements and event fields, the model performs the existing scale/indicator/
drag/click maths, and the view applies returned heights, scroll positions, and state presentation.
For Change 2 diagnostics, `MinimapView` also exposes a read-only `mirrorFallbackCount` getter; this
is view instrumentation, not model state or a new caller-controlled prop.
`setScrollContainer`, `setContentMirror`, `setContentContainer`, `setWrapper`, `syncEverything`
as a DOM method, `mouseEnter` as an event method, and model `init`/`dispose` listener cleanup are
removed. The driver can remain so the existing model lifecycle and state binding stay consistent;
it is constructed with `{}` rather than a DOM-containing prop object.

The consumer-visible model diff is:

| Member | Before | After | Call sites affected |
|---|---|---|---|
| `MinimapModelProps` | `{ scrollContainer: HTMLElement \| null }` | Empty DOM-free props object `{}` | Only `MinimapView.ts:21–25` changes its driver construction from `{ scrollContainer: props.scrollContainer }` to `{}`. |
| `scrollContainer`, `contentMirror`, `contentContainer`, `wrapper`, `observer` fields | Public model-held DOM references at `MinimapModel.ts:17–21` | Removed from the model; corresponding source/mirror elements, observer, and node map are private view fields | `MinimapView.ts:45–48` setter calls are removed. No Markdown or Storybook consumer change. |
| `setScrollContainer()` | Rewires the observer and source `scroll` listener, then calls DOM sync | Removed; the view binds its mount-time source once in `onMount()` | `MinimapView.ts:75,91` are removed. `MarkdownBodyView.ts:460` and `Minimap.story.ts:35` still pass the same source element. |
| `setContentMirror()`, `setContentContainer()`, `setWrapper()` | Inject DOM references into the model | Removed; the view uses its own fields | `MinimapView.ts:46–48` are removed. |
| `getScale()` | No arguments; reads `contentMirror` and `scrollContainer` DOM | Numeric arguments, such as `(mirrorHeight, scrollHeight)` | Internal model callers at `MinimapModel.ts:82,166,186` become view measurement plus scalar-model calls. |
| `syncEverything()` | No arguments; reads and writes DOM while calculating geometry | Replaced by model `syncGeometry(input): MinimapLayout`; the view owns the DOM-facing `syncEverything()` coordinator | Observer, scroll, resize, and mouse-enter paths move to `MinimapView.ts`; no external consumer calls this model method. |
| `handlePointerDown()`, `handlePointerMove()`, `handlePointerUp()` | Accept `PointerEvent` and use `currentTarget`, pointer capture, and DOM fields | Pointer capture is view-owned; model methods accept numeric drag inputs and return a source scroll position | `MinimapView.ts:66–68` keeps the listeners but changes the delegated method calls. |
| `handleBackgroundClick()` | Accepts `MouseEvent`, queries wrapper/indicator DOM, and writes source `scrollTop` | View filters the target and reads bounds; model receives numeric click geometry and returns a source scroll position | `MinimapView.ts:50–57` changes its model call; no Markdown or Storybook call changes. |
| `mouseEnter()`, `init()`, model listener cleanup in `dispose()` | DOM event check and window/source listener lifecycle in the model | Removed; view checks state, registers listeners, and owns cleanup | `MinimapView.ts:58–64,74–75,26` are adjusted; the driver remains for model lifecycle/state ownership. |
| `new MinimapView(...)` consumer props | Markdown: `{ name: "markdown-minimap", scrollContainer: this.scrollPanel }`; Storybook: `{ name: "storybook-minimap", scrollContainer }` | Exactly the same props | `MarkdownBodyView.ts:456–460` and `Minimap.story.ts:31–35` require no changes. |

The source `scrollContainer` is a mount-time dependency. Both verified consumers provide a stable
element and recreate/release the Minimap when its presence changes. `MinimapView.onUpdate()` must
not re-register a source listener or observer; changing the source element requires disposing and
creating a new view. This is required by the `listen()` ownership semantics and is the resolved
choice for the nullable-but-currently-stable prop.

## Implementation Plan

### 1. Change 1 — move DOM ownership into `MinimapView`

Do this phase first and leave the existing full-copy behavior in the view temporarily so this
boundary change can be checked independently.

1. In `src/renderer/uikit/Minimap/MinimapModel.ts`, remove every element reference, the observer,
   direct listener registration/removal, and DOM read/write. Keep state and numeric calculations in
   the model using the scalar surface described above. Preserve the current `1.15` drag factor,
   default scale, indicator calculations, and zero/NaN handling unless a typecheck exposes a
   necessary adjustment.
2. In `src/renderer/uikit/Minimap/MinimapView.ts`, add view-owned references for the source
   container, mirror elements, observer, and source-to-mirror node map. Keep the existing root,
   content-container, content, and indicator DOM shape and rest-prop handling.
3. Move the source `scroll` and `window` `resize` registrations into `onMount()`, using
   `this.listen(...)`. Register the source listener only when the mount-time source is non-null.
   Own the observer disconnect with `this.own(...)`. The observer is created and observed once from
   `onMount()` with the current `{ childList: true, subtree: true, characterData: true }` options
   for this phase.
4. Move the DOM event adaptation into the view: pointer capture/release checks, wrapper bounds,
   source `scrollTop` reads/writes, and indicator exclusion remain view operations; pass only
   numbers to the model. The view's `syncEverything()` reads all measurements, calls
   `model.syncGeometry(...)`, writes `contentContainer.style.height` and `root.scrollTop`, and
   leaves indicator attributes/styles to the existing state binding.
5. In this phase only, the moved observer callback may still perform the old full copy in the view:

   **Before (`MinimapModel.ts:44–49`):**

   ```ts
   this.observer = new MutationObserver(() => {
       if (this.contentMirror && this.scrollContainer) {
           this.contentMirror.innerHTML = this.scrollContainer.innerHTML;
           this.syncEverything();
       }
   });
   ```

   **After, Change 1 intermediate shape (`MinimapView.ts`):**

   ```ts
   private readonly onSourceMutations = (): void => {
       const source = this.scrollContainer;
       const mirror = this.contentMirror;
       if (!source || !mirror) return;
       mirror.innerHTML = source.innerHTML; // replaced by Change 2
       this.syncEverything();
   };
   ```

   The `innerHTML` line is deliberately temporary and must not remain in the final implementation.

#### Change 1 verification — complete this before Change 2

- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Confirm with this source scan that `MinimapModel.ts` contains no DOM type, DOM global,
  `MutationObserver`, `addEventListener`, `removeEventListener`, `innerHTML`, or DOM measurement/
  write; all matching lines must be in `MinimapView.ts`:

  ```powershell
  rg -n 'HTMLElement|HTMLDivElement|MutationObserver|addEventListener|removeEventListener|innerHTML|getBoundingClientRect|scrollHeight|clientHeight|scrollTop|window|document' src/renderer/uikit/Minimap/MinimapModel.ts src/renderer/uikit/Minimap/MinimapView.ts
  ```

- Inspect that the only `this.listen(...)` calls for the source and window are in
  `MinimapView.onMount()` and that no `onUpdate()` or observer callback calls `listen()`.
- In the Minimap Storybook story, verify initial rendering, source scrolling, indicator dragging,
  background-click navigation, resize, and disposal/re-mount. Repeat the source-content check in
  the real `md-view` Markdown editor, including hide/show of the minimap. Record this as the
  boundary verification before beginning the incremental phase.

### 2. Change 2 — apply mutation records incrementally

After Change 1 has passed its verification, replace the temporary full-copy callback.

1. Add a view helper that takes a source node, calls `source.cloneNode(true)`, and indexes the
   source/clone pair and every corresponding descendant in the view-owned `WeakMap<Node, Node>`.
   Initial synchronization and fallback rebuild should create clones for each
   `scrollContainer.childNodes` entry and call `contentMirror.replaceChildren(...)`. Reinitialize
   the map for each full snapshot so stale source-to-mirror associations cannot affect later
   records.
2. On mount, perform one full clone snapshot before the first geometry synchronization. Do not use
   an `innerHTML === ""` test: an empty source is a valid synchronized state and must not cause a
   full copy on every resize or mouse-enter path.
3. Observe `attributes` in addition to the existing options:

   ```ts
   {
       childList: true,
       subtree: true,
       characterData: true,
       attributes: true,
   }
   ```

4. Apply records in callback order and return a failure reason from the record applier when its
   mapping assumptions fail. Handle the three configured record types as follows:

   | Record type | Incremental operation |
   |---|---|
   | `childList` | Resolve `record.target` to the mirrored parent (`scrollContainer` maps to `contentMirror`; descendants use the node map). Remove each `removedNodes` clone. Clone/index each `addedNodes` subtree and insert it before the mapped `nextSibling`, or append when `nextSibling` is null. This preserves batch order and source order, including reorders represented by removal plus insertion records. |
   | `characterData` | Resolve the source text node in the map and copy its current `data` to the mirrored text node. |
   | `attributes` | Resolve the source descendant element in the map. For a set/change, copy the current attribute value, preserving `record.attributeNamespace` where present; for removal, remove the corresponding namespaced or unnamespaced attribute. A record whose target is the source scroll-container root is intentionally ignored for mirroring because root attributes were excluded by the existing `innerHTML` contract, but geometry is still synchronized afterward. |

   A missing mapped target/parent, a missing mapped `nextSibling`, a removed node whose clone is
   absent or not under the expected parent, a missing attribute name, or an unexpected record type
   is an explicit incremental-application failure.

5. On any failure, call the named full-snapshot fallback: reset the node map, clone all current
   source child nodes, replace the mirror children, then run the normal geometry synchronization.
    Increment a cheap view-owned fallback counter and, under `if (import.meta.env.DEV)`, emit a
    `console.warn` containing the `MutationRecord.type` and the precise mapping-failure reason. Expose
    the counter through a read-only `MinimapView` diagnostic getter so the Storybook verification can
    assert that it remains zero. Follow the existing `src/renderer/uikit/Toolbar/ToolbarView.ts` at
    lines 45, 58, and 108–116 for the `import.meta.env.DEV`/`console.warn` precedent. This is the
    only permitted full child replacement, and it is
   justified because the incremental mapping no longer describes the source. A successful mutation
   batch must never serialize the full pane or rebuild all children.
6. After every successful batch and fallback, call the view's `syncEverything()` so the mirror's
   new layout and the source's current scroll metrics update the model geometry. Scroll and resize
   listeners continue to call geometry synchronization without touching the mirror.

#### Change 2 verification

- Run `npm run typecheck`, `npm run lint`, and `git diff --check` after the incremental change.
- Run the development build with the browser console visible. Open a real Markdown document in the
  `md-view` preview with its backing Markdown document available for editing. Type into the source,
  add and delete blocks, change text and attributes/classes, and let a Mermaid block render. Confirm
  the minimap updates and that no `[MinimapView] incremental mirror fallback` warning appears.
- Read the mounted view's `mirrorFallbackCount` diagnostic getter from the Storybook/debug surface
  before and after the same operations; it must remain `0`. If it increments, capture the warning's
  record type and reason, fix the mapping rather than accepting the fallback, and repeat the check.
- Repeat the interaction checks in the Minimap Storybook story, including an empty source and
  source-node reorder/removal, and confirm that the final mirror child structure and attributes
  match the source children while the counter remains zero.

**Before (temporary Change 1 callback):**

```ts
mirror.innerHTML = source.innerHTML;
this.syncEverything();
```

**After (Change 2 callback shape):**

```ts
private readonly onSourceMutations = (records: MutationRecord[]): void => {
    let failure: { record: MutationRecord; reason: string } | undefined;
    const applied = records.every((record) => {
        const reason = this.applyMutationRecord(record);
        if (!reason) return true;
        failure = { record, reason };
        return false;
    });
    if (!applied && failure) {
        this.recordMirrorFallback(failure.record.type, failure.reason);
        this.rebuildMirrorFromSource();
    }
    this.syncEverything();
};
```

The `every(...)` short-circuit is deliberate: once one record cannot be applied, later records must
not mutate a mirror/map whose assumptions are already invalid; the full rebuild discards the
partially applied batch and reconstructs from the current source.

The final code may use equivalent helper names, but the record types, source-to-mirror lookup,
fallback condition, and post-batch geometry synchronization must remain explicit.

## Concerns

- **Mapping and batch ordering:** Mutation records are delivered after source changes. Apply them
  in array order, and use each record's `nextSibling` at application time. If any expected mapping
  is unavailable, use the full clone fallback rather than guessing an insertion point.
- **Root attributes:** The source scroll-container element itself is not part of
  `scrollContainer.innerHTML`, so copying its attributes would change the existing contract. Ignore
  only root attribute mirror operations, but still measure geometry after the batch because a root
  class/style change can affect source dimensions.
- **DOM state that cloneNode does not copy:** Event listeners, JS-only properties, and canvas pixel
  buffers are not copied. The current `innerHTML` path also drops listeners and is used only for a
  non-interactive Markdown preview; the verified Minimap source is rendered Markdown DOM, whose
  visual contract is tags, attributes, text, and layout. No computed-style consumer was found.
- **Duplicate IDs:** `cloneNode(true)` copies descendant `id` attributes, so source and mirror can
  both match the same `#id` selector and document-wide `getElementById()` can encounter a duplicate.
  `innerHTML` already creates the same duplicate-ID condition; preserving it is required to keep
  this task focused on ownership and incremental synchronization. Do not strip IDs.
- **Source-container replacement:** `listen()` cleanup is lifetime-owned and cannot be safely
  accumulated from `onUpdate()`. The two current consumers never repoint a mounted view; source
  replacement is intentionally handled by disposing/recreating the view. Any future repointing API
  would require a separate, explicitly releasable listener design and is outside US-1209.
- **Fallback cost:** A fallback remains O(size of the mirrored subtree), but it is limited to named
  mapping failures. The ordinary child, text, and attribute mutation path is proportional to the
  records and affected subtrees.

## Acceptance Criteria

1. **Change 1 boundary:** `MinimapModel.ts` contains only state, numeric data, and geometry/input
   maths; it has no element references, `MutationObserver`, DOM listeners, DOM reads, or DOM writes.
   `MinimapView.ts` owns the source/mirror/wrapper elements, observer, and both source/window
   listeners. The source and window listeners are registered once from `onMount()` through
   `listen()` and are released on view disposal.
2. **Change 1 is separately verified:** Its typecheck/lint/diff checks and the Storybook plus
   Markdown smoke checks are recorded and pass before the incremental implementation begins.
3. **Incremental mirror:** The final observer handles `childList`, `characterData`, and
   `attributes` records through the source-to-mirror node map. It preserves order, text, element
   names/namespaces, and descendant attributes/classes without full serialization for successful
   records.
4. **Named fallback:** Missing mappings, invalid insertion/removal relationships, missing
   attribute names, or an unexpected record type trigger the explicit `cloneNode(true)` full
   snapshot fallback, increment its diagnostic counter, and warn in development with the record type
   and failure reason. The final Minimap implementation contains no `innerHTML` copy and no empty-
   mirror full-copy path. The real Markdown exercise must leave the counter at zero.
5. **Geometry and interaction:** After initial copy, mutation batches, scroll, and resize, the
   minimap has the same scaled content height and indicator geometry as before. Background clicks,
   indicator pointer dragging, source scrolling, mouse-enter initialization, minimap hide/show,
   disposal, and remount continue to work in the Storybook story and the Markdown `md-view`.
6. **Verification commands:** `npm run typecheck`, `npm run lint`, and `git diff --check` pass
   after each phase. No unit tests or test harnesses are added; this project does not use them.

## Files needing NO changes

- `src/renderer/uikit/Minimap/Minimap.ts` — the public `MinimapProps` contract remains unchanged.
- `src/renderer/uikit/Minimap/index.ts` and `src/renderer/uikit/index.ts` — only the existing
  `MinimapProps` type is exported; no model API is barrel-exported.
- `src/renderer/uikit/Minimap/Minimap.css` — the existing scaled, pointer-inert mirror DOM shape
  remains valid.
- `src/renderer/uikit/Minimap/Minimap.story.ts` — its construction arguments are unchanged; it
  is a verification surface, not a source change.
- `src/renderer/editors/markdown/MarkdownBodyView.ts` and
  `src/renderer/editors/markdown/index.ts` — the one production UIKit consumer passes the same
  stable `scrollPanel` and owns Minimap creation/release already.
- `src/renderer/editors/storybook/storyRegistry.ts` — the existing Minimap story registration is
  unchanged.
- `src/renderer/editors/notebook/note-editor/MiniTextEditorView.ts`,
  `src/renderer/editors/log-view/items/TextOutputView.ts`, and
  `src/renderer/ui/dialogs/TextDialogView.ts` — these use Monaco's separate minimap option.
- `doc/active-work.md` — no new dashboard entry is required.

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/uikit/Minimap/MinimapModel.ts` | Remove DOM ownership and expose scalar geometry/interaction maths only. |
| `src/renderer/uikit/Minimap/MinimapView.ts` | Own DOM references, observer, node map, lifecycle-managed listeners, incremental record application, full clone fallback, DOM measurement, and DOM writes. |
