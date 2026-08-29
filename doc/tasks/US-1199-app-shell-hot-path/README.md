# US-1199 — Pilot: narrow the app-shell hot path off whole-state bindings

## Goal

Convert the app-shell state-to-view paths that currently push whole or overly broad
state updates into live child trees. `PagesView` will make its complete five-field
global dependency contract explicit (with no selector-level runtime change),
`MainPageView` will select only the Mneme indicator fields it renders,
`PageContentView` will keep its page-id ownership model while selecting only the
global page slices its sync reads, and `PageTabsView` will stop reconciling on
ordinary editor changes while preserving its safe synchronous subscription
bookkeeping.

This is a plan-only task. No implementation, tests, or `VanillaView.update()`
equality gate belongs in this task.

## Background

### Epic boundary and authoritative constraints

EPIC-076 defines the closing property as construction-time configuration in
`update(props)` and live data subscriptions in the child
(`doc/epics/EPIC-076.md:24-27`). Its
US-1199 breakdown names `PagesView`, `MainPageView`'s Mneme binding,
`PageContentView`, and `PageTabsView` as this pilot's scope
(`doc/epics/EPIC-076.md:127-156`). The epic explicitly rejects an equality gate
inside `VanillaView.update()` (`doc/epics/EPIC-076.md:179-182`) and leaves
full-DOM-rebuild work for Epic C (`doc/epics/EPIC-076.md:108-123`). The
implementation must preserve those boundaries.

The dashboard currently records US-1199 as plain text beneath EPIC-076. This
document is to replace that line with a linked, still-unchecked task entry;
epic tasks remain `[ ]` until the epic closes, as required by EPIC-076 and
`CLAUDE.md`.

### Reference shape: `PageContentView`

`PageContentView` accepts only `{ pageId }` in its public props
(`src/renderer/ui/app/PageContentView.ts:13-15`). Its mount hook subscribes to
the page model and calls `sync()` (`src/renderer/ui/app/PageContentView.ts:33-37`),
then separately subscribes to the selected page's state when the page changes
(`src/renderer/ui/app/PageContentView.ts:49-59`). `sync()` resolves the page by
the construction-time ID, reads compare membership, the two text hosts, sidebar
state, and the main editor (`src/renderer/ui/app/PageContentView.ts:49-81`).
This is the target ownership shape: `AppPageManagerView` retains a slot by ID,
and the slot constructs the page view with only that ID
(`src/renderer/components/page-manager/PageSlot.ts:31-49`).

The global subscription is broader than the page-id prop but is not a props
pump: it is the view's own live-data subscription. The implementation plan
narrows that subscription to the four global references that `sync()` reaches
through `PagesQueryModel`—`pages`, `leftRight`, `rightLeft`, and
`compareGroups`—while retaining the existing per-page and per-sidebar
subscriptions.

### State selector semantics

`TOneState.subscribe(listener, selector)` evaluates the selector once at
subscription time and on each state dispatch; it invokes the listener only when
`compareSelection(last, next)` reports a change
(`src/renderer/core/state/state.ts:74-89`). `compareSelection` compares arrays,
Maps, Sets, Dates, and other non-plain objects by identity, while recursively
comparing plain-object fields (`src/renderer/core/state/state.ts:18-40`).
Therefore a selector may safely return the existing `state.pages` array, whose
reference changes when Immer changes that collection, but must not return a new
`state.pages.map(...)` array from the selector. A plain object containing direct
array/map/set references and primitive fields is also safe. `VanillaView.bind()`
applies the selected value immediately and then installs the same selector
subscription (`src/renderer/uikit/shared/vanilla-view.ts:229-267`).

`PagesModel`'s global state contains `pages`, `ordered`, `leftRight`,
`rightLeft`, and `compareGroups` (`src/renderer/api/pages/PagesModel.ts:20-29`).
The collection and recency arrays are replaced or Immer-mutated by lifecycle and
layout operations, while grouping maps and compare sets are replaced when
grouping/compare state changes (`src/renderer/api/pages/PagesModel.ts:133-151`,
`src/renderer/api/pages/PagesLifecycleModel.ts:231-235`,
`src/renderer/api/pages/PagesLayoutModel.ts:19-24`,
`src/renderer/api/pages/PagesLayoutModel.ts:78-123`,
`src/renderer/api/pages/PagesLayoutModel.ts:213-234`).

The page model deliberately exposes a small reactive state with `pinned`,
`mainEditorId`, `version`, `hasSidebar`, and `navBackCount`
(`src/renderer/api/pages/PageModel.ts:30-54`). `version` is bumped when editor
membership or panel contribution changes (`src/renderer/api/pages/PageModel.ts:261-283`,
`src/renderer/api/pages/PageModel.ts:367-385`), while `mainEditorId` is written
when the main editor changes (`src/renderer/api/pages/PageModel.ts:399-409`).

### `PagesView` and its consumer

`PagesView` constructs one `AppPageManagerView` with `PagesView.managerProps()`
and mounts it (`src/renderer/ui/app/PagesView.ts:7-14`,
`src/renderer/ui/app/PagesView.ts:16-19`). Its current binding is written as
`(state) => state` (`src/renderer/ui/app/PagesView.ts:16-18`), but
`OpenFilesState` has exactly five fields—`pages`, `ordered`, `leftRight`,
`rightLeft`, and `compareGroups` (`src/renderer/api/pages/PagesModel.ts:20-29`).
Because `compareSelection` recursively compares plain-object fields and compares
arrays, Maps, and Sets by identity (`src/renderer/core/state/state.ts:18-40`),
the current whole-state selector is already reference-gated on exactly those
five fields. A five-field projection therefore fires on the same dispatches,
compares the same references, and skips the same no-ops: Step 1 is a
contract/readability change with no runtime effect. It makes the actual
dependencies explicit and satisfies EPIC-076 statement 1's no-whole-state-
selector property. `managerProps()` maps `state.pages` to IDs, derives the
active and grouped-active IDs through `PagesModel` queries, and passes
`leftRight` plus `compareGroups` to the manager
(`src/renderer/ui/app/PagesView.ts:21-30`).

This corrects an overstatement in EPIC-076: it calls this the
“single worst binding” and says it “reconciles all page slots on every dispatch”
(`doc/epics/EPIC-076.md:85-86`, `doc/epics/EPIC-076.md:147-152`). The code shows
that it reconciles only when one of the five collection references changes, and
`managerProps()` reads all five, so there is no selector over-subscription to
remove. EPIC-075's rule is to record such plan corrections rather than silently
follow a claim inferred from code shape. If implementation reveals genuine work
after selection—for example, derived `pageIds` allocation or DOM work on an
ordered-only change—that must be evaluated as a derived-props optimization,
not attributed to narrowing this selector.

`AppPageManagerView.reconcile()` consumes every one of those values: it removes
missing slots, filters and creates group containers, attaches page slots,
materializes page views that have become active, controls individual visibility,
and applies compare-mode visibility (`src/renderer/components/page-manager/AppPageManagerView.ts:69-205`).
The page view itself is already constructed by ID through `PageSlot`, so this
task does not pass page models through the manager.

### `MainPageView` bindings

`MainPageView` currently binds the whole `mnemeStatusModel.state`
(`src/renderer/ui/app/MainPageView.ts:85-88`). `updateMneme()` reads only
`enabled`, `running`, and `modelReady` to set visibility, classes, title, and
the status glyph (`src/renderer/ui/app/MainPageView.ts:187-196`). The model's
state also contains `url`, which the view never reads
(`src/renderer/api/mneme-status.ts:25-40`). The proposed selector therefore
selects those three named fields. By contrast, the preceding
`app.window.state` binding is intentionally left whole-state: its typed local
state is the five fields consumed by `updateIndicators()`
(`src/renderer/ui/app/MainPageView.ts:36-42`,
`src/renderer/ui/app/MainPageView.ts:164-185`), from a small six-field window
model (`src/renderer/api/window.ts:25-43`). Narrowing that model's own small
state is explicitly out of scope under EPIC-076 B-2 correction 2
(`doc/epics/EPIC-076.md:73-87`).

### `PageTabsView` current paths

The page-model binding already selects a named projection: the direct
`state.pages` array and the active ID derived from `state.ordered`
(`src/renderer/ui/tabs/PageTabsView.ts:102-109`). `updateTabs()` stores the page
list, synchronizes layout subscriptions, reconciles the `KeyedList`, recalculates
scroll controls, and scrolls to the active tab
(`src/renderer/ui/tabs/PageTabsView.ts:139-145`). That projection should remain
identity-safe; the selector must continue returning `state.pages` directly.

The second path is the hot defect. `syncPageLayoutSubscriptions()` subscribes
without selectors to every page state and every current main-editor state
(`src/renderer/ui/tabs/PageTabsView.ts:155-177`). Any editor state dispatch,
including a document edit, therefore calls `refreshTabLayout()`, which reads the
whole page collection and calls `tabs.update(state.pages)` for the entire strip
(`src/renderer/ui/tabs/PageTabsView.ts:147-153`). The narrowed subscriptions
must retain only the page fields that affect layout (`pinned`, `mainEditorId`,
and the `version` signal for editor membership) and the editor's effective tab
encryption projection, so ordinary title/content/modified dispatches do not
reconcile the strip. Individual `PageTabView` instances remain responsible for
their own live editor projection; that view already has a targeted page binding
for `pinned`/`mainEditorId` (`src/renderer/ui/tabs/PageTabView.ts:174-181`) and
an editor projection containing its displayed fields
(`src/renderer/ui/tabs/PageTabView.ts:22-75`).

The effective encryption values need care: `PageTabView` reads the text host's
`encrypted` and `decrypted` getters when laying out/rendering a tab
(`src/renderer/ui/tabs/PageTabView.ts:242-265`), and those getters derive from
text `content` and whether `password` is present
(`src/renderer/editors/text/TextFileEncryptionModel.ts:7-19`). The load-bearing
invariant is `TextEditorModel.changeContent()`, which writes
`state.encrypted = shell.encryption.isEncrypted(newContent)` on every content
edit (`src/renderer/editors/text/TextEditorModel.ts:273-277`, especially
`:276`). The text model therefore updates the persisted `encrypted` flag
together with content in normal edit and load/encryption paths
(`src/renderer/editors/text/TextEditorModel.ts:273-277`,
`src/renderer/editors/text/TextFileIOModel.ts:225-230`,
`src/renderer/editors/text/TextFileEncryptionModel.ts:44-50`), and updates
`password` on decrypt/lock transitions
(`src/renderer/editors/text/TextFileEncryptionModel.ts:114-119`,
`src/renderer/editors/text/TextFileEncryptionModel.ts:186-190`). The verified
state-only projection is `{ encrypted: state.encrypted === true, decrypted:
state.password !== undefined }`: all text-model content writes that can change
the effective encryption mode also write `encrypted`
(`src/renderer/editors/text/TextEditorModel.ts:272-279`,
`src/renderer/editors/text/TextFileIOModel.ts:225-230`,
`src/renderer/editors/text/TextFileEncryptionModel.ts:44-50`,
`src/renderer/editors/text/TextFileEncryptionModel.ts:87-91`,
`src/renderer/editors/text/TextFileEncryptionModel.ts:114-119`,
`src/renderer/editors/text/TextFileEncryptionModel.ts:136-140`), while the
only `makeUnencrypted()` state write changes password without changing content
(`src/renderer/editors/text/TextFileEncryptionModel.ts:163-190`). This boolean
projection therefore changes on mode transitions but not on ordinary content
typing, and it defaults to false for non-text editor state. If a future change
stops `changeContent()` from maintaining `state.encrypted`, this projection will
silently produce wrong pinned-tab offsets and encrypted-tab widths; no selector
error or crash will identify the omission.

## Selector coverage table

The table is the implementation contract. Every proposed selector is tied to
the exact reads observed above; no selector may be narrowed further without
repeating this coverage proof.

| Site | Current selector/subscription | Proposed selector/subscription | Exact state fields read by the view | Coverage proof |
|---|---|---|---|---|
| `src/renderer/ui/app/PagesView.ts:18` | `(state) => state` on `pagesModel.state` | A named plain-object projection returning direct references to `state.pages`, `state.ordered`, `state.leftRight`, `state.rightLeft`, and `state.compareGroups`; derive manager props in the apply callback, not with `.map()` inside the selector | `pages` for displayed IDs; `ordered` for active page; `leftRight`/`rightLeft` for grouped-active lookup and grouping; `compareGroups` for compare visibility (`src/renderer/ui/app/PagesView.ts:21-30`, `src/renderer/api/pages/PagesQueryModel.ts:32-51`) | The projection contains every global field used by `managerProps()`, including `rightLeft`, which `groupedPage` reads even though the current method only visibly names `groupedPage`. Because `OpenFilesState` contains exactly these five keys and each is compared by the same reference/recursive semantics, this proposed projection is behaviorally equivalent to the current whole-state selector: it fires on the same dispatches and skips the same no-ops. Step 1 is therefore contract/readability only, with no runtime effect; it makes the dependencies explicit and satisfies EPIC-076 statement 1. Derived `pageIds` are created only after the selector fires. |
| `src/renderer/ui/app/MainPageView.ts:87` | `(state) => state` on `mnemeStatusModel.state` | `{ enabled: state.enabled, running: state.running, modelReady: state.modelReady }` | `enabled`, `running`, `modelReady` (`src/renderer/ui/app/MainPageView.ts:187-196`) | Those are the only three reads in `updateMneme()`; `url` is present in the model but unused (`src/renderer/api/mneme-status.ts:25-40`). Plain-object recursive comparison prevents a fresh projection from firing when these values are unchanged. |
| `src/renderer/ui/app/PageContentView.ts:35` | `pagesModel.state.subscribe(() => this.sync())` | A named plain-object projection of direct `pages`, `leftRight`, `rightLeft`, and `compareGroups` references; keep the existing per-page and sidebar subscriptions | `pages` for `findPage`; `leftRight`/`rightLeft`/`compareGroups` for `isInCompareMode` (`src/renderer/ui/app/PageContentView.ts:49-80`, `src/renderer/api/pages/PagesQueryModel.ts:15-19`, `src/renderer/api/pages/PagesQueryModel.ts:116-134`) | `sync()` reads no active-page/recency state, so `ordered` is deliberately excluded. All global reads are covered by the four selected references. Page/editor/sidebar live changes remain covered by the subscriptions at `src/renderer/ui/app/PageContentView.ts:54-57` and `:91-95`. |
| `src/renderer/ui/tabs/PageTabsView.ts:102-109` | `{ pages: state.pages, activeId: state.ordered[...] }` | Keep the existing direct-array/primitive projection; do not map `pages` inside it | `pages` for tab order; `ordered` for active-tab scrolling (`src/renderer/ui/tabs/PageTabsView.ts:139-145`) | The current selector already selects exactly the two global values used by this path, and `state.pages` is returned by identity. The proposed work changes only the per-page/per-editor layout subscriptions below. |
| `src/renderer/ui/tabs/PageTabsView.ts:167-168` | Unfiltered `page.state.subscribe()` and `editor.state.subscribe()` | Page projection `{ pinned, mainEditorId, version }`; editor projection `{ encrypted: state.encrypted === true, decrypted: state.password !== undefined }` | Page `pinned`, `mainEditorId`, and editor-membership `version`; current main editor's encryption/decryption status (`src/renderer/ui/tabs/PageTabsView.ts:155-192`) | `pinnedLeft()` reads page pinning and each candidate's main-editor encryption status. `mainEditorId` plus `version` cover the reactive signals for the plain `mainEditor` getter and editor membership (`src/renderer/api/pages/PageModel.ts:162-185`, `:261-283`). `TextFileModel` exposes `encrypted`/`password` in its extended state (`src/renderer/editors/text/TextEditorModel.ts:21-29`), and the verified write paths keep the booleans synchronized; non-text state yields false values. A keystroke writes `content`, `modified`, `encrypted`, and `temp` (`src/renderer/editors/text/TextEditorModel.ts:273-277`); none appear in this projection except `encrypted`, whose boolean value is unchanged by an ordinary edit because `changeContent()` recomputes it from the new content. Thus a content-only dispatch does not refresh the parent tab-strip layout. |

The `app.window.state` binding at `src/renderer/ui/app/MainPageView.ts:85` is a
deliberate no-change item: it binds a model's own small state and
`updateIndicators()` consumes nearly all of the relevant fields. It is not a
target selector in this task.

## PageTabsView re-entrancy finding

The mutable subscription map is `pageLayoutSubscriptions`, a
`Map<string, PageLayoutSubscription>` owned by `PageTabsView`
(`src/renderer/ui/tabs/PageTabsView.ts:28-42`). It is mutated in
`syncPageLayoutSubscriptions()`: stale page IDs are released and deleted, and
new/current page IDs replace entries whose `page` or `editor` identity changed
(`src/renderer/ui/tabs/PageTabsView.ts:155-177`).

The dispatch path is synchronous. A page-state listener installed at line 167
calls `refreshTabLayout()`; that method immediately calls
`syncPageLayoutSubscriptions()` (`src/renderer/ui/tabs/PageTabsView.ts:147-177`).
For example, `PageModel.setMainEditor()` writes `mainEditorId` through
`page.state.update()` (`src/renderer/api/pages/PageModel.ts:399-409`), so while
that page's `TOneState.stateChanged()` is iterating its listeners
(`src/renderer/core/state/state.ts:52-60`), the PageTabs listener can release the
old editor subscription and replace the map entry. The page-model binding has
the same shape: its apply callback calls `updateTabs()`, which calls the same
map-mutating synchronizer while `pagesModel.state` is dispatching
(`src/renderer/ui/tabs/PageTabsView.ts:102-109`,
`src/renderer/ui/tabs/PageTabsView.ts:139-145`).

The mutation timing is real, but it is not an unsafe iteration in this code.
`TOneState.stateChanged()` uses `this.listeners.forEach(...)`
(`src/renderer/core/state/state.ts:52-54`), and both unsubscribe paths replace
the listener array with `this.listeners.filter(...)` rather than mutating the
array currently being traversed (`src/renderer/core/state/state.ts:87-95`). A
released listener may therefore fire once more in the current dispatch, where
its `refreshTabLayout()` call is idempotent; a newly added listener is not called
until the next dispatch, and it is created from current state so it has no
missed change to catch up on. `syncPageLayoutSubscriptions()` is also the only
iterator of `pageLayoutSubscriptions`, and its work dispatches no state, so the
Map cannot re-enter itself through this path.

Consequently, the previously proposed `queueMicrotask` does not fix a hazard
that exists here and would introduce an unnecessary timing change across the
pilot. Do not add a microtask or equivalent post-dispatch queue. Preserve
synchronous refreshes and fix the actual hot path by filtering the page/editor
subscriptions as specified in the table. A synchronous re-entrancy guard is
also unnecessary unless implementation uncovers a concrete callback that
dispatches while `syncPageLayoutSubscriptions()` runs; the current source has
no such path.

## Implementation Plan

1. **Make `PagesView`'s global dependencies explicit.** In
   `src/renderer/ui/app/PagesView.ts`, introduce a named projection type/helper
   that returns the five direct state references listed in the coverage table.
   This is a contract/readability change only: because the current whole-state
   selector already covers exactly those five `OpenFilesState` fields by
   reference, the proposed selector has no runtime effect. Change the binding
   callback to build `AppPageManagerProps` from that selected projection. Derive
   `pageIds` and the active/grouped IDs in the callback, and retain
   `PageContentView` as the `pageView` constructor. Do not allocate a mapped ID
   array inside the selector, and do not alter `AppPageManagerView` or `PageSlot`.

   Before:

   ```ts
   this.bind(pagesModel.state, (state) => state, () => this.manager.update(PagesView.managerProps()));
   ```

   After (shape; use the repository's exact types and formatting):

   ```ts
   this.bind(
       pagesModel.state,
       (state) => ({
           pages: state.pages,
           ordered: state.ordered,
           leftRight: state.leftRight,
           rightLeft: state.rightLeft,
           compareGroups: state.compareGroups,
       }),
       (projection) => this.manager.update(PagesView.managerProps(projection)),
   );
   ```

   `managerProps(projection)` must cover the same reads documented in the first
   table row, with `pageIds` mapped only after selection has changed. Do not
   claim selector-level performance improvement here; any genuine waste found
   in derived props or reconciliation must be separately gated on those derived
   values.

2. **Narrow the Mneme indicator only.** In
   `src/renderer/ui/app/MainPageView.ts`, select `enabled`, `running`, and
   `modelReady` for `updateMneme()`. Leave the `app.window.state` binding and
   `updateIndicators()` unchanged because it is the small-state exception
   documented above. No change to `mneme-status.ts` is needed.

   Before:

   ```ts
   this.bind(mnemeStatusModel.state, (state) => state, (state) => this.updateMneme(state));
   ```

   After:

   ```ts
   this.bind(
       mnemeStatusModel.state,
       (state) => ({ enabled: state.enabled, running: state.running, modelReady: state.modelReady }),
       (state) => this.updateMneme(state),
   );
   ```

3. **Make `PageContentView`'s global subscription exact.** In
   `src/renderer/ui/app/PageContentView.ts`, retain `{ pageId }` as the only
   construction-time prop and retain the existing page/nav subscription
   lifecycle. Change only the `pagesModel.state` subscription to select direct
   `pages`, `leftRight`, `rightLeft`, and `compareGroups` references. Do not
   select `ordered`, and do not change the content/compare/secondary DOM
   reconciliation; full-rebuild concerns remain Epic C.

   Before:

   ```ts
   this.own(pagesModel.state.subscribe(() => this.sync()));
   ```

   After:

   ```ts
   this.own(pagesModel.state.subscribe(
       () => this.sync(),
       (state) => ({
           pages: state.pages,
           leftRight: state.leftRight,
           rightLeft: state.rightLeft,
           compareGroups: state.compareGroups,
       }),
   ));
   ```

4. **Stop `PageTabsView` parent reconciliation on irrelevant editor dispatches.**
   In `src/renderer/ui/tabs/PageTabsView.ts`, keep the existing
   `pagesModel.state` projection because it already returns the stable page
   array and active ID. Change `page.state.subscribe()` to the exact page
   projection in the table. Change `editor.state.subscribe()` to a stable plain
   object containing only the effective encryption/decryption booleans required
   by `pinnedLeft()`. Do not select `content`, `modified`, title, language, or
   any other editor field: content changes are the explicit hot-path case that
   must not call the parent tab-strip reconcile.

   Before:

   ```ts
   const pageUnsubscribe = page.state.subscribe(() => this.refreshTabLayout());
   const editorUnsubscribe = editor?.state.subscribe(() => this.refreshTabLayout());
   ```

   After (projection shape; verify the concrete editor-state typing while
   implementing):

   ```ts
   const pageUnsubscribe = page.state.subscribe(
       () => this.refreshTabLayout(),
       (state) => ({ pinned: state.pinned, mainEditorId: state.mainEditorId, version: state.version }),
   );
   const editorUnsubscribe = editor?.state.subscribe(
       () => this.refreshTabLayout(),
       (state) => ({
           encrypted: (state as { encrypted?: boolean }).encrypted === true,
           decrypted: (state as { password?: unknown }).password !== undefined,
       }),
   );
   ```

   The effective booleans must use the verified text-host state contract, remain
   false for non-text editors, and be tested through lock/unlock transitions.
   Do not use an array projection because arrays are identity-compared by
   `TOneState`.

5. **Preserve synchronous tab-layout refreshes.** Do not add a microtask,
   post-dispatch queue, or re-entrancy flag. The state implementation is
   copy-on-write: listener-array unsubscribe replaces the array being traversed,
   and `syncPageLayoutSubscriptions()` does not dispatch or iterate the Map from
   a nested path (`src/renderer/core/state/state.ts:52-54`, `:87-95`; see the
   re-entrancy finding above). Keep the callbacks in Step 4 synchronous and
   retain the existing stale-release and changed-editor replacement behavior.
   The actual change in this step is the selector filtering; verify that it
   still releases removed page/editor subscriptions, updates `currentPages`,
   reconciles `KeyedList`, updates scroll controls, and scrolls to the current
   active tab without lost or duplicate subscriptions.

6. **Leave non-targets unchanged.** Do not edit
   `src/renderer/uikit/shared/vanilla-view.ts`; its `update()` equality behavior
   is intentionally unchanged. Do not edit
   `src/renderer/components/page-manager/AppPageManagerView.ts`,
   `src/renderer/components/page-manager/PageSlot.ts`, or the page model state
   implementations. Do not repair full-DOM rebuilds in `PageContentView` or its
   children unless a change is genuinely unavoidable as a trivial consequence;
   record any such exception in the task notes.

## Concerns

- **Effective encryption projection:** `TextFileEncryptionModel.encrypted` is
  derived from content while `decrypted` is derived from password presence
  (`src/renderer/editors/text/TextFileEncryptionModel.ts:10-15`). The resolved
  projection is the stored `encrypted` flag plus password presence, supported by
  `TextEditorModel.changeContent()` maintaining that flag on every edit
  (`src/renderer/editors/text/TextEditorModel.ts:273-277`, especially `:276`)
  and by the cited load/encryption write paths. Selecting `content` would
  satisfy correctness but violate the task's primary tab-strip performance
  check; selecting only a stored flag would omit decrypt state. This remains a
  silent-failure risk if that invariant is ever removed.
- **Synchronous subscription mutation:** Mutation during a dispatch is safe here
  because `TOneState` uses copy-on-write listener arrays, and the subscription
  synchronizer does not dispatch or re-enter its Map iteration
  (`src/renderer/core/state/state.ts:52-54`, `:87-95`). No microtask or timing
  change is justified. If a future callback dispatches from inside
  `syncPageLayoutSubscriptions()`, document that concrete interleaving before
  introducing a synchronous guard.
- **No equality gate:** `VanillaView.update()` must remain an unconditional
  update hook (`src/renderer/uikit/shared/vanilla-view.ts:84-97`). The fix is at
  the bindings and subscription ownership sites so later pump call sites remain
  visible to their own tasks.
- **Full rebuild boundary:** `PageContentView.sync()` clears and rebuilds content
  in several branches (`src/renderer/ui/app/PageContentView.ts:61-80`,
  `src/renderer/ui/app/PageContentView.ts:159-174`). That is not part of this
  pilot; changing subscription timing must not be presented as an Epic B rebuild
  fix.
- **Silent selector omissions:** A selector can stop a view updating without an
  exception. The coverage table and manual checks below are mandatory, especially
  the grouped/compare and encryption paths.

## Acceptance Criteria

- [ ] `PagesView` uses an explicit selector returning direct references for all
      five `OpenFilesState` fields used to build manager props, with no `.map()`
      allocation inside that selector. This is recorded as a contract/readability
      change only: its dispatch firing behavior is unchanged because the current
      whole-state selector already compares those same five references.
- [ ] `MainPageView` selects exactly `enabled`, `running`, and `modelReady` for
      the Mneme indicator. The `app.window.state` binding remains unchanged.
- [ ] `PageContentView` still accepts only `{ pageId }`, retains its per-page and
      sidebar subscription lifecycle, and its global selector covers exactly the
      `pages`/grouping/compare fields read by `sync()`.
- [ ] `PageTabsView` keeps the stable `pages`/active projection, no longer calls
      the parent tab-strip reconcile for content-only editor dispatches, and
      still refreshes layout when pinning, main-editor identity, or effective
      encryption/decryption state changes.
- [ ] `pageLayoutSubscriptions` retains its synchronous stale-release and
      replacement behavior without lost or duplicate subscriptions. The plan
      does not add a post-dispatch queue: copy-on-write listener arrays make the
      current in-dispatch subscription mutation safe, and timing remains
      attributable to the selector-filtering pilot.
- [ ] No equality gate is added to `VanillaView.update()`, no full-DOM-rebuild
      remediation is included, no tests or test harnesses are added, and no
      unrelated small model selector is narrowed.

### Manual verification checklist

- [ ] Open tabs, including a new empty page and a file/editor page.
- [ ] Close tabs, including the active tab and the last-tab behavior.
- [ ] Reorder tabs by drag and confirm the displayed order and active tab.
- [ ] Group two tabs and confirm the left/right split and both page contents.
- [ ] Ungroup a pair and confirm the standalone layout returns.
- [ ] Pin and unpin tabs, including multiple pinned tabs and their offsets.
- [ ] Enter and exit compare mode for a grouped text pair; confirm both sides.
- [ ] Type into a document and confirm the tab strip does not reconcile. The
      individual tab may update its modified/title state, but the parent
      `PageTabsView` layout reconciliation must not run for content-only edits.
- [ ] Change a text document's encryption/decryption state and confirm encrypted
      tab width/indicator and pinned offsets remain correct.
- [ ] Navigate between pages while changing the main editor and confirm no
      listener errors, lost tab updates, or duplicate subscriptions.

## Files Changed Summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1199-app-shell-hot-path/README.md` | This investigation and implementation plan. |
| `doc/active-work.md` | Replace the plain US-1199 dashboard line with a linked `[ ]` task entry under EPIC-076. |
| `src/renderer/ui/app/PagesView.ts` | Make the five-field global PagesModel contract explicit; runtime selector behavior is unchanged. |
| `src/renderer/ui/app/MainPageView.ts` | Narrow only the Mneme status projection; leave `app.window.state` unchanged. |
| `src/renderer/ui/app/PageContentView.ts` | Select the exact global page/group/compare references while retaining page-id ownership. |
| `src/renderer/ui/tabs/PageTabsView.ts` | Narrow layout subscriptions and preserve synchronous, copy-on-write-safe subscription-map maintenance. |

### Files explicitly requiring no changes

| File | Reason |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | The epic rejects an equality gate in `update()`. |
| `src/renderer/components/page-manager/AppPageManagerView.ts` | Its consumer contract already receives IDs, grouping, and compare state correctly. |
| `src/renderer/components/page-manager/PageSlot.ts` | It already constructs `PageContentView` with `{ pageId }`, the reference shape. |
| `src/renderer/api/pages/PagesModel.ts` | Existing state shape and mutation paths supply the required identity signals. |
| `src/renderer/api/pages/PageModel.ts` | Existing page-level signals (`pinned`, `mainEditorId`, `version`) are sufficient for the planned subscription. |
