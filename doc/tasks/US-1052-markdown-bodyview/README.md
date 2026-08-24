# US-1052: Convert the `markdown` editor body to `BodyView`

Related epic: [EPIC-060 — De-React Epic E2](../../epics/EPIC-060.md)

## Goal

Replace the React `MarkdownBody` body with a framework-free `MarkdownBodyView` while
preserving the standalone Markdown editor, notebook embedding, search, navigation, minimap,
scroll restoration, and editor configuration behavior. The body will own and mount
`MarkdownBlockView` directly, so the markdown body creates no React root for the renderer.

This document authorizes planning only. It does not authorize implementation, dashboard or
epic edits, fixture edits, or a commit.

## Background

### Fixed decisions and scope

EPIC-060 Decisions E2-2 and E2-3 constrain this task:

- `src/renderer/editors/markdown/index.tsx` remains a React `TextChrome` shell. Its body slot
  changes to `mountVanilla(MarkdownBodyView, ...)`; `editors/base` chrome is out of scope.
- The registry already normalizes `BodyView` to a React `Body` in
  `src/renderer/editors/base/editorRegistry.ts:316-323`. Notebook's per-note dispatch therefore
  stays unchanged; deleting the registry `Body` arm belongs to US-1054.

The current working tree includes US-1048. `MarkdownBlock.tsx:1-9` is already only a React
compatibility face around `MarkdownBlockView`; it is not the body renderer to convert again.

### Current body and renderer evidence

`src/renderer/editors/markdown/MarkdownBody.tsx:17-255` currently builds two nested UIKit
`Panel`s, an optional React `FindBar`, a React `Minimap` face, and a React `MarkdownBlock` face.
The body reads page state at lines 28-34 and host `content`/`filePath` at lines 38-40. The
renderer props at lines 238-245 are exactly the props the vanilla body must pass to
`MarkdownBlockView`.

`MarkdownBlockView` already has the required direct-view contract:

- `MarkdownBlockView.ts:162-180` is a public `VanillaView` with a stable root.
- `onMount` applies root props, installs context-menu/theme/queue bindings, starts the git-root
  lookup, and renders at `:182-191`.
- `onUpdate` updates root props, queue registration, git-root lookup, and the guarded render at
  `:193-198`.
- `onDispose` invalidates async lookup work, unregisters the request handler, disposes transient
  code/Mermaid/image views, and clears the root at `:200-206`.
- `renderIfNeeded` compares processed content, highlight text, file path, wiki root, and Mermaid
  light mode at `:306-327`; this guard must remain the protection against reparsing on unrelated
  body-state updates. The actual tree replacement is at `:329-359`.

The `track` callback at `MarkdownBlockView.ts:380-383` only claims transient-view ownership and
stores the view. `renderTree` attaches each transient root and calls `mount()` exactly once at
`:347-352`; `disposeTransientViews` disposes and removes each root at `:397-408`. The body must
follow the same distinction: `child()`/`claimViewOwnership()` do not mount or attach anything.

The direct composition is possible without `mountReact` or a React face:

```tsx
// Before: MarkdownBody.tsx:238-245
<MarkdownBlock
    commandQueue={commandQueue}
    content={content}
    highlightText={highlightText}
    compact={compact}
    filePath={filePath}
    onMatchCountChange={onMatchCountChange}
/>
```

```ts
// After: MarkdownBodyView.ts, schematic ownership sequence
this.markdownBlock = this.child(new MarkdownBlockView(this.blockProps(...)));
this.scrollPanel.append(this.markdownBlock.root);
// onMount, after the root is attached:
this.markdownBlock.mount();
```

The body passes the same six values directly: `commandQueue: model.typedQueue`, the host's
`content` and `filePath`, the effective `highlightText`, the effective `compact` flag, and a
stable `onMatchCountChange` method. The callback remains a body-owned bridge; it is not a React
callback and does not require a React root.

### Vanilla composition precedents

`src/renderer/editors/svg/SvgBodyView.ts:50-70` and
`src/renderer/editors/html/HtmlBodyView.ts:26-46` construct child views, append their roots,
mount children from `onMount`, subscribe to host state, and clean up subscriptions. They also
subscribe to the model queue only after the view that handles the relevant request channel is
mounted. `src/renderer/editors/mermaid/MermaidBodyView.ts:80-117` provides the model-subscription,
queue, child-branch, and disposal pattern for a more stateful body.

The body can use the existing vanilla primitives directly:

- `src/renderer/editors/shared/FindBarView.ts:26-125` is the real find-bar view. It owns
  `InputView` and three `IconButtonView` children, updates its text/match label, and mounts its
  children at `:90-99`.
- `src/renderer/uikit/Minimap/MinimapView.ts:14-120` is the real minimap view. Construct it with
  the already-created scroll-panel root, append it to the body, and mount it after all three DOM
  refs exist; its `driver.mount()` ordering requirement is explicit at `:75-80`.
- `createPanelElement`, `resolvePanelAttributes`, and `applyPanelAttributes` in
  `src/renderer/uikit/Panel/panel-style.ts:145-349` reproduce the existing Panel layout without
  importing React's `Panel` face. `src/renderer/uikit/Panel/Panel.css:1-87` already provides the
  same-layer `.panel-root[hidden] { display: none; }` counter-rule.

### Hook-to-lifecycle mapping

There is no `useMemo` in `MarkdownBody.tsx`; do not add a memoization layer to the vanilla view.
The complete body hook inventory and replacement is:

| Current source | Replacement in `MarkdownBodyView` | Cleanup / ownership |
|---|---|---|
| `useRef` `scrollRef` at `MarkdownBody.tsx:20` | A `scrollContainer` field pointing to the stable `markdown-scroll` root; call `model.setContainer` when bound. | Set the old model's container to `null` on model replacement and disposal. |
| `useRef` `scrollTopRef` at `:22` | A numeric `scrollTop` field updated by a native scroll listener. | Field dies with the view; it is deliberately not persisted. |
| `useState` `scrollEl`/`setScrollEl` at `:26` | No state mirror. `MinimapView` receives the scroll-panel element during construction/update. | `MinimapView` and its driver are owned as a child and disposed by `VanillaView`. |
| `model.state.use` at `:28-34` | `bind(model.state, projectionSelector, applyProjection)` or an equivalent explicit model subscription. The selector includes `compactMode`, `searchVisible`, `searchText`, `currentMatchIndex`, and `totalMatches`. | Unsubscribe on model replacement/disposal; apply the initial projection explicitly before subscribing. |
| `host.state.use` at `:38-40` | A host subscription selecting `{ content, filePath }`, following the `bindToHostIfNeeded` pattern in `SvgBodyView.ts:95-111`. | Unsubscribe when the model/host changes and on disposal. A missing host maps to the existing empty content/undefined path. |
| `useRef` `anchorRetryRef` at `:46` | A `requestAnimationFrame` handle field plus explicit `cancelAnchorRetry`. Keep the ten-attempt retry behavior at `:53-71`. | Cancel the pending frame and invalidate promise callbacks on model replacement/disposal. |
| `useCallback` `cancelAnchorRetry` and `scrollToAnchor` at `:47-71` | Stable class methods/arrow fields. They execute the typed queue's `scrollToAnchor` request and update the saved scroll position after a successful anchor scroll. | Guard asynchronous `.then` work against a disposed/replaced view. |
| `typedQueue.use` at `:76-79` | `typedQueue.subscribe` for `focus` and `anchor`; focus calls `scrollContainer.focus()`, anchor calls the retrying method. | Unsubscribe before replacing the model queue and on disposal. Subscribe only after the block and scroll children are mounted because `ComponentQueue.subscribe` drains queued events synchronously (`ComponentQueue.ts:33-45`). |
| First `useEffect` at `:72` | No effect; call `cancelAnchorRetry` from explicit disposal/model replacement. | `cancelAnimationFrame` and the disposed guard. |
| Focus `useEffect` at `:82-92` | Subscribe to `pagesModel.onFocus`; for the matching page, restore the saved scroll position in a microtask. | Unsubscribe on disposal and check the view is still live inside the microtask. |
| `useCallback` `onScroll` at `:95-97` | `listen(scrollContainer, "scroll", ...)` and store `scrollTop`. | `VanillaView.listen` removes the listener on disposal. |
| `useCallback` `onLinkClickCapture` at `:105-136` | A capture-phase native listener on `markdown-scroll`, preserving modified-click fall-through, `#fragment` handling, `isLocalMarkdownHref`, `pushNavBack`, and `openRawLink`. Check `maxEditorHeight` at event time so embedded behavior remains disabled. | `VanillaView.listen` removes the listener. |
| `useCallback` `onMatchCountChange` at `:145-154` | A stable body method passed directly to `MarkdownBlockView`. | The view owns the callback; no React dependency array or root is involved. |
| Match-navigation `useEffect` at `:157-161` | In `applyProjection`, when `currentMatchIndex` or `totalMatches` changes and the count is positive, execute `scrollToMatch`. | No separate subscription remains after model unsubscription. |
| Keyboard `useCallback` at `:164-178` | A native `keydown` listener on the body root, preserving Ctrl/Cmd+F, Escape, Shift+F3, and F3. | `VanillaView.listen` removes it. |
| Callback ref `useCallback` `setScrollContainer` at `:190-194` | Construct the scroll root directly, store it, and call `model.setContainer` from `onMount`; clear it in `onDispose`/model replacement. | No callback-ref attach/detach cycle or React state rerender is needed. |

The React hooks in `markdown/index.tsx` remain only in the required `TextChrome` shell: the
toolbar's `state.use` and `useOptionalState` are not body hooks and are deliberately retained.

### Async git-root resolution

`detectGitRoot` is asynchronous (`src/renderer/editors/markdown/detect-git-root.ts:17-35`). The
body must pass `filePath` into `MarkdownBlockView` without moving this lookup into the body.
`MarkdownBlockView.startWikiRootLookup` increments `lookupGeneration` at `:284-294`, checks the
generation in both success and failure callbacks at `:295-303`, and invalidates it in
`onDispose` at `:200-202`. The plan must preserve that guard: a result arriving after disposal or
after a newer file path must not set `wikiRoot`, re-walk the DOM, or log an obsolete failure.

### Queue and match-count data flow

The markdown queue has two independent channels (`MarkdownEditor.ts:7-13`): event delivery for
`focus`/`anchor`, and request/reply handling for `scrollToMatch`/`scrollToAnchor`. The body owns
the event subscription. `MarkdownBlockView` owns the request registration at
`MarkdownBlockView.ts:222-250`; the body must mount that block before subscribing to events so
queued `anchor`/`focus` events can be drained safely.

Match count flows one way from rendered DOM to editor state:

1. `MarkdownBlockView.updateMatchCount` counts `.highlighted-text` nodes and suppresses duplicate
   notifications at `MarkdownBlockView.ts:388-395`.
2. The body's `onMatchCountChange` compares against `model.state.get().totalMatches`, calls
   `model.setMatchCount`, clamps the current index, and requests `scrollToMatch` as in
   `MarkdownBody.tsx:145-154`.
3. The model state subscription updates the find bar and navigation projection. A current-index
   change also requests `scrollToMatch`, preserving the existing next/previous behavior.

This cannot loop: the block does not notify when its DOM count is unchanged; the body does not
call `setMatchCount` when state already has the count; `setMatchCount` does not change the block's
render inputs; and `MarkdownBlockView.renderIfNeeded` rejects an unchanged parse. A scroll request
changes DOM classes/scroll position, not match count.

### Scroll position and navigation findings

The scroll container is the `markdown-scroll` Panel at `MarkdownBody.tsx:224-236`; the Markdown
block is its child. `MarkdownBlockView.renderTree` replaces only the block's children
(`MarkdownBlockView.ts:329-358`), not the scroll container, and neither the body nor the block
writes `scrollTop` during a normal render. The existing saved position is view-local and is
restored only on page focus (`MarkdownBody.tsx:81-92`). The anchor path deliberately records the
new position after a successful `scrollIntoView` (`MarkdownBody.tsx:59-68`) so the following page
focus event does not snap navigation back to zero.

The conversion must keep the stable scroll root, preserve the guarded render policy, retain the
saved-position field and page-focus microtask, and retain the post-anchor capture. When updating
the block for host/highlight/file changes, record the current scroll position before the update
and restore it afterward if the DOM write changed it; normal browser clamping when content becomes
shorter is acceptable. Do not perform that restoration after an explicit `scrollToMatch` or
`scrollToAnchor` request; those requests intentionally own the resulting scroll position.

Heading anchors remain generated by `rehypeHeadingIds` and resolved by
`findAnchorTarget` (`MarkdownBlockView.ts:95-110`). Queue anchor requests use exact id,
case-insensitive id, and slug matching before calling `scrollIntoView` at `:245-249`.
Local markdown-link interception remains the body concern and continues to use
`markdown-nav.ts:17-24`; same-document fragments scroll in place, while local markdown files use
the page back-stack and `openRawLink` flow.

### Layout and `maxEditorHeight`

Preserve the current Panel geometry exactly. The body root is a row panel named
`markdown-view-root`, `overflow: hidden`, `tabIndex: -1`, `flex: 1`/`height: 0` when standalone,
and `maxHeight: editorConfig.maxEditorHeight` in all modes (`MarkdownBody.tsx:196-205`). Its
find-column child is a column panel with `flex: 1` and `width: 0`; its scroll child uses the
embedded/non-embedded flex and height split, embedded `maxHeight`, horizontal/vertical overflow,
compact/non-compact horizontal padding, and hidden/auto scrollbar choice from `:207-236`.

Use `editorConfig.maxEditorHeight !== undefined` as the embedded discriminator, matching the
SVG and Mermaid body precedents. Do not replace it with a truthiness check. `Panel.css` already
has the required same-`@layer` `[hidden]` counter-rule for the flex roots; the markdown CSS
already has scoped hidden rules for its author-display code/image roots at
`MarkdownBlock.css:14`. No new unscoped hidden rule is needed.

## Implementation Plan

### 1. Replace the React body with `MarkdownBodyView`

Rename `src/renderer/editors/markdown/MarkdownBody.tsx` to
`src/renderer/editors/markdown/MarkdownBodyView.ts`. Implement
`MarkdownBodyView extends VanillaView<MarkdownBodyViewProps>` with a public constructor and a
stable panel root. Use `createPanelElement` for the root, find column, and scroll panel; set the
root `tabIndex` to `-1` and preserve all names/data attributes used by the current `Panel`s.

Construct and own these views:

- A `MarkdownBlockView` with the direct props listed above. Append its root to the scroll panel,
  then call `mount()` once from `onMount` after the root is in the DOM.
- A lazily created `MinimapView` with `scrollContainer` equal to the scroll-panel root when
  minimap is enabled. Append it after the find column and mount it only after its wrapper/content
  refs are available. On `hideMinimap` changes, release/dispose/remove the child when hidden and
  create/append/mount it when shown, preserving the current scrollbar choice without creating a
  React face.
- A lazily created `FindBarView` when the own-search bar becomes visible. Use `child()` to claim
  ownership, append its root before `mount()`, and use `releaseChild()` to dispose and remove it
  when hidden. Never mount a hidden find bar just to retain a child reference, because its
  `onMount` focuses the input (`FindBarView.ts:90-99`).

Implement explicit `onMount`, `onUpdate`, and `onDispose` lifecycle methods:

- Mount all already-attached child roots, bind the model and host projections, set the model's
  container, install native keyboard/scroll/capture listeners, then subscribe to the event queue
  last. The queue subscription must be after `MarkdownBlockView.mount()` because subscribe drains
  queued events synchronously.
- On props/model/host changes, update panel attributes, rebind subscriptions, update the block
  and find bar with current props, reconcile the minimap, and re-register the queue event handler
  for a replacement model. Dispose the old model's subscriptions and clear its container before
  binding the new one.
- On disposal, mark the view inactive, cancel retry frames, unsubscribe model/host/page-focus/
  queue bindings, clear the model container, and rely on owned-child disposal for the block,
  minimap, and active find bar. Every child root that is replaced must be removed explicitly;
  `VanillaView.dispose()` itself does not detach roots (`vanilla-view.ts:82-90`).

Before/after lifecycle shape:

```tsx
// Before: React effects and callback ref
useEffect(() => {
    const sub = pagesModel.onFocus.subscribe(...);
    return () => sub.unsubscribe();
}, [model]);
```

```ts
// After: explicit vanilla lifecycle
protected onMount(): void {
    this.markdownBlock.mount();
    this.bindModel();
    this.bindHostIfNeeded();
    this.queueSubscription = this.model.typedQueue.subscribe(this.handleQueueEvent);
}

protected onDispose(): void {
    this.disposed = true;
    this.cancelAnchorRetry();
    this.queueSubscription?.();
    this.pageFocusSubscription?.unsubscribe();
    this.model.setContainer(null);
}
```

The exact field names may follow local style, but the ownership and ordering semantics are
mandatory.

### 2. Port state, events, search, and callbacks without React

Use `VanillaView.bind` for the model projection and a selector-based host subscription. Keep
`applyProjection` responsible for:

- `compact`: `editorConfig.compact || state.compactMode`;
- effective highlight text: own visible search text takes priority over
  `editorConfig.highlightText`;
- own find-bar visibility: `searchVisible && !editorConfig.highlightText`;
- find-bar props (`searchText`, `currentMatchIndex`, `totalMatches`, and the existing model
  mutators);
- `MarkdownBlockView.update` with current content/path/highlight/compact/callback props; and
- `scrollToMatch` when the current match index/total changes.

Replace every React event callback with native `listen` calls. Preserve the exact keyboard
shortcuts, modified-click fall-through, fragment decode fallback, local-file back-stack behavior,
`target: "md-view"`, `sourceId: "markdown-link"`, and `model.setContainer` facade updates.

Pass `this.onMatchCountChange` directly to `MarkdownBlockView`. Before calling `block.update`,
save the scroll container's `scrollTop`; restore it after the update if needed, while allowing
the queued match/anchor request to establish an intentional new position afterward. Do not
reparse on an update whose block render inputs are unchanged; rely on and preserve
`MarkdownBlockView.renderIfNeeded`'s existing guard.

### 3. Update the React shell and module contract

Change only the body seam in `src/renderer/editors/markdown/index.tsx`:

```tsx
// Before: React body and React Body arm
<MarkdownBody model={md} />
// ...
Body: MarkdownEmbeddedBody,
```

```tsx
// After: React TextChrome shell with one vanilla body root
{mountVanilla(MarkdownBodyView, { model: md })}
// ...
BodyView: MarkdownBodyView,
```

Keep `MarkdownEditorView`, `TextChrome`, toolbar contributions, `MarkdownEditor` exports, and
`MarkdownBlock` re-exports. `MarkdownEmbeddedBody` is removed because the registry's E2-3 shim
will expose `BodyView` to existing React consumers. Do not add a registry change or a notebook
dispatch change.

### 4. Correct the stale model comment

`src/renderer/editors/markdown/MarkdownEditor.ts:103-105` needs no runtime or state change. Revise
only its stale React wording
from “`host.state.use` directly” / “MarkdownBlock re-renders ... via React props” to say that the
vanilla body subscribes to `host.state` and updates its owned `MarkdownBlockView`. Keep
`adoptHost`, `setContainer`, queue types, setters, and facade accessors unchanged.

### 5. Verify behavior and collateral damage

Use the fixed input `doc/tasks/US-1048-hast-dom-markdown/rule4-fixture.md` without editing it.
Open it in the standalone Markdown Preview and in a notebook-embedded Markdown body. Exercise:

- initial render, editing content, compact mode, external notebook highlighting, own search,
  next/previous/close/F3/Escape/Ctrl+F, and minimap scrolling;
- same-document heading fragments, delayed first-mount anchor events, heading ids, local markdown
  links, back navigation, modified clicks, and page focus restoration;
- relative links/images, Mermaid fences, fenced code copy, colorized code, task-list icons,
  context menus, and an async git-root resolution followed by closing/replacing the view; and
- reopening the grid editor (a representative JSON Grid page) as the collateral-damage check.
  This task must not touch `src/renderer/editors/grid`.

For the converted host, use an assertion that checks geometry, not only presence:

```ts
const host = document.querySelector<HTMLElement>(
    '[data-type="panel"][data-name="markdown-view-root"]',
);
if (!host) throw new Error("Markdown body host is missing");
expect(host.offsetWidth).toBeGreaterThan(0);
expect(host.offsetHeight).toBeGreaterThan(0);
```

For the fixed Rule 4 corpus, compare the candidate with the recorded baseline using this exact
element-count assertion (the current rendered `.markdown-block` baseline is 253 descendants):

```ts
const recordedBaseline = 253;
const markdownBlock = host.querySelector<HTMLElement>('.markdown-block');
if (!markdownBlock) throw new Error("Markdown block is missing");
expect(markdownBlock.querySelectorAll('*').length).toBe(recordedBaseline);
```

Record the baseline before conversion with the same selector/count procedure if the harness
captures both faces, and require the candidate count to equal that recorded value of 253. The
fixture itself is a fixed epic input and must remain byte-for-byte unchanged.

Also verify that a non-navigation content update does not reset a nonzero scroll position, while
an explicit heading or match request is allowed to move it. This is the regression check for the
stable scroll root and the body/block update guard; structural presence and element-count checks
alone are insufficient.

Run the applicable project lint/type checks and inspect the final diff. No implementation,
dashboard/epic/fixture/grid edit, or commit is part of this task-document phase.

## Concerns

### Ownership and synchronous queue drain

`claimViewOwnership` and `child()` only record ownership (`vanilla-view.ts:20-27,157-163`);
they do not attach or mount. The body must append each root and call `mount()` exactly once.
Because `ComponentQueue.subscribe` installs the handler and immediately drains its event queue
(`ComponentQueue.ts:33-45`), subscribing before `MarkdownBlockView.mount()` can process an early
anchor before the request handler exists. The plan therefore mounts the block first, then
subscribes to queue events, and unregisters before model replacement.

### Async disposal

Git-root lookup can resolve after a body has been replaced or disposed. The existing generation
guard in `MarkdownBlockView` is the required defense; the body must dispose that block and must
not add a second unguarded lookup. Anchor promise continuations and focus microtasks need the
body's own live/disposed guard as well.

### Render writes and scroll preservation

An unconditional body update could call into the full markdown parse for every search-index or
focus-state change. The existing block guard prevents that, and the body-level scroll snapshot /
restore prevents a real block replacement from accidentally losing the reader's position. The
restore must not run after explicit queue navigation, which intentionally calls
`scrollIntoView`.

### Hidden layout and geometry

Panel roots set author `display: flex`, so the HTML `hidden` attribute requires the existing
same-layer counter-rule in `Panel.css`. The acceptance check must also catch a present but
zero-width/zero-height body, the failure mode recorded by the Monaco diff precedent.

### No nested React roots

The body must import `FindBarView`, `MinimapView`, and `MarkdownBlockView`, not the React faces
`FindBar`, `Minimap`, or `MarkdownBlock`. `MarkdownBlock.tsx` remains a React adapter for its
unrelated consumers. The result is one React root for the `TextChrome` shell and zero React roots
for the body or its markdown block.

## Acceptance Criteria

- `MarkdownBody.tsx` is replaced by `MarkdownBodyView.ts`, a public `VanillaView` with a stable
  panel root and no React runtime imports or hooks.
- The body directly constructs, appends, mounts, updates, and disposes `MarkdownBlockView`.
  It never reaches the block through `MarkdownBlock.tsx`, `mountReact`, or another React face.
- `FindBarView` and `MinimapView` are composed directly as vanilla children; dynamic find-bar
  replacement uses explicit release/dispose/remove behavior.
- All former body hooks have explicit replacements: refs become fields, the one `useState`
  becomes direct minimap wiring, model/host `state.use` become subscriptions/bindings, all three
  effects become explicit cleanup/subscription logic, callbacks become stable methods/listeners,
  and `typedQueue.use` becomes a correctly ordered `typedQueue.subscribe`. There is no new
  `useMemo` because none existed in the body.
- Queue events and requests preserve focus routing, delayed anchor retry, heading-anchor lookup,
  match navigation, and disposal behavior. The event subscription is installed after the block's
  request handler is mounted.
- The match-count bridge preserves DOM → `MarkdownEditor` state → find-bar/navigation flow,
  suppresses duplicate state writes, and does not loop.
- `detectGitRoot` results that arrive after disposal or a newer path are ignored by the existing
  generation guard; no stale result re-renders the block.
- Content/highlight/path changes preserve the block's guarded render policy. A normal update does
  not reset the saved scroll position; explicit anchor/match navigation is still allowed to
  change it. Page-focus restoration and post-anchor scroll capture remain functional.
- Standalone and embedded layout preserve `editorConfig.maxEditorHeight`, compact padding,
  minimap visibility, scrollbar mode, keyboard focus, and local-link interception semantics.
- `markdown/index.tsx` remains a React `TextChrome` shell and registers `BodyView: MarkdownBodyView`.
  No `editors/base`, registry, notebook, or per-note dispatch change is made.
- The converted host passes the exact geometry assertions `offsetWidth > 0` and
  `offsetHeight > 0`.
- With the unedited fixed fixture, `markdownBlock.querySelectorAll('*').length` equals the
  recorded baseline assertion `253`; the rendered structure and visual behavior remain stable.
- The grid editor opens and renders correctly as the collateral-damage check.
- No changes are made to `doc/active-work.md`, `doc/epics/EPIC-060.md`,
  `doc/tasks/US-1048-hast-dom-markdown/rule4-fixture.md`, or anything under
  `src/renderer/editors/grid`; no commit is created.

### Deliberately not changed

- `src/renderer/editors/markdown/MarkdownBlock.tsx:1-9` remains the nine-line React
  `mountVanilla(MarkdownBlockView, props)` face. It is still required by these four call sites:
  - `src/renderer/editors/mcp-inspector/McpInspectorView.tsx:389`;
  - `src/renderer/editors/mcp-inspector/ResourceContentView.tsx:86`;
  - `src/renderer/editors/log-view/items/MarkdownOutputView.tsx:33`; and
  - `src/renderer/editors/mneme-root/MnemeRootEditorView.tsx:247`.
- `src/renderer/editors/markdown/MarkdownBlockView.ts` and its existing helpers
  (`hast-dom.ts`, `rehypeMarkdownOverrides.ts`, `CodeBlock.ts`, `MarkdownImage.ts`,
  `rehypeHeadingIds.ts`, `rehypeHighlight.ts`, `detect-git-root.ts`, and `markdown-nav.ts`) are
  consumed directly and are not re-converted or duplicated.
- `src/renderer/editors/base/TextChrome` and all `editors/base` chrome remain unchanged.
- `src/renderer/editors/base/editorRegistry.ts`, `src/renderer/editors/notebook`, and
  `NoteItemActiveEditor.tsx` remain unchanged; E2-3 already covers their `BodyView` normalization.
- `src/renderer/editors/markdown/MarkdownEditor.ts` has no runtime/state/API change; only its
  stale React-specific explanatory comment is corrected as described in Implementation Plan 4.
- `src/renderer/uikit/Panel/Panel.css`, `src/renderer/editors/markdown/MarkdownBlock.css`,
  `FindBarView`, and `MinimapView` are reused as-is.
- `doc/active-work.md`, `doc/epics/EPIC-060.md`, the fixed Rule 4 fixture, and all files under
  `src/renderer/editors/grid` are outside the change set.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/markdown/MarkdownBody.tsx` → `src/renderer/editors/markdown/MarkdownBodyView.ts` | Replace the React body with a direct vanilla composition of panels, `FindBarView`, `MinimapView`, and `MarkdownBlockView`; port state, queue, navigation, match-count, scroll, async guards, and cleanup. |
| `src/renderer/editors/markdown/index.tsx` | Keep the React `TextChrome` shell, mount `MarkdownBodyView` with `mountVanilla`, and expose `BodyView` instead of `Body`. Preserve toolbar and `MarkdownBlock` exports. |
| `src/renderer/editors/markdown/MarkdownEditor.ts` | Comment-only correction describing the vanilla body's direct host subscription; no behavior or public contract change. |
| `doc/tasks/US-1052-markdown-bodyview/README.md` | This implementation plan and verification record. |
