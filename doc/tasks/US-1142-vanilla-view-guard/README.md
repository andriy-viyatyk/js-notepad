# US-1142: Guard the `VanillaView` constructor/mount rule

Status: investigation complete; implementation intentionally not started.

## Goal

Make the `VanillaView` lifecycle contract mechanically enforceable before
EPIC-071 adds more native views, without turning its documented create → claim
→ mount ownership pattern into a false positive. The guard has four immediate
enforced clauses (three zero-baseline prohibitions plus Class A), one narrow
claim-twice check, and a base/caller rollback plan for failed mounts and
constructions.

US-1055 is dispositioned as not-a-defect: `MermaidBodyView` follows the same
deliberate lifecycle shape as the rest of the tree and must not be changed as
part of this task.

## Background

### Epic and absorbed-task context

EPIC-071 §E13-7.8 calls for absorbing US-1131 as E13's first task because E13
adds roughly thirty `VanillaView` subclasses. §E13-9 orders US-1142 first. The
US-1131 entry in [`doc/active-work.md`](../../active-work.md) records the four
historical reports and the EPIC-070 requirement that a failure on an unexercised
path must not leave a page permanently blank.

The written UIKit contract is [`src/renderer/uikit/CLAUDE.md`](../../../src/renderer/uikit/CLAUDE.md):

- lines 489–493 now say that whatever the constructor touches it must have
  created, while anything created by `onMount()` is touched only by `onMount()`
  and later; listeners, subscriptions, measurement, and timers remain forbidden
  in the constructor;
- lines 495–502 say that `mount()` builds child DOM/bindings, ownership is
  separate from mounting, and claimed children must be mounted exactly once;
- lines 503–506 say disposal is child-first/FIFO and does not detach `root`.

The wording was narrowed in this documentation change because the base class
and the existing views deliberately allow constructor `child()` ownership
registration; the old “must not create child DOM” sentence incorrectly treated
that prescribed create → claim → mount shape as a defect.

### Verified `VanillaView` lifecycle

The complete base implementation is
[`src/renderer/uikit/shared/vanilla-view.ts`](../../../src/renderer/uikit/shared/vanilla-view.ts).

- `root`/`props`: lines 39–42 declare the stable root and current props. The
  protected constructor at lines 49–52 stores props and uses the supplied root,
  or creates one detached `div`; it does not append or mount anything.
- `mount()`: lines 55–65 return early for disposed/already-mounted views, set
  `mounted = true` at line 62 so `bind()` can apply immediately, call
  `onMount()` at line 63, and return the stable root. There is currently no
  catch or rollback if `onMount()` throws.
- `update()`: lines 71–80 ignore disposed views, always store the latest props,
  and call `onUpdate()` only when mounted. Pre-mount updates therefore seed the
  props read by `onMount()`.
- `dispose()`: lines 90–126 are idempotent. They mark the view disposed,
  snapshot/clear children and disposers, dispose children first at lines
  115–118, run resource disposers FIFO, then call `onDispose()` only when
  `mounted` is true at lines 119–121. Every cleanup is attempted and the first
  cleanup error is rethrown. Root detachment remains the adapter/structural
  owner's responsibility (lines 87–88).
- `own()`: lines 128–132 checks that the view is active and registers a FIFO
  cleanup.
- `listen()`: lines 139–155 checks activity, guards the listener after
  disposal, installs it, and owns its removal.
- `child()`: lines 157–163 checks activity, calls `claimViewOwnership()`,
  records the child, and returns it. It does not mount or attach the child.
  `claimViewOwnership()` at lines 20–27 uses a `WeakSet`, so a view is claimed
  only once for its lifetime.
- `releaseChild()`: lines 165–186 disposes a registered child, always removes
  its root, and unregisters it even if disposal throws. It does not reverse the
  lifetime-wide ownership marker.
- `bind()`: lines 197–217 throws before mount at lines 202–204, otherwise
  applies once immediately at line 214, subscribes at line 215, and owns the
  unsubscribe at line 216. Its guarded callback tolerates disposal.
- Hooks: `onMount()` is the construction/binding hook at lines 219–220,
  `onUpdate()` updates existing DOM at lines 222–223, and `onDispose()` is the
  final cleanup hook at lines 225–226.

### The corrected incident model

The four reports are two defect classes, not four examples of one prohibition.
The latest source commit (`8914e2989`) already fixed three of the four reports;
the current source evidence is important because the guard must target defects,
not the old sentence.

| Report | Class and verified result |
|---|---|
| `NotificationView` | **Class A — read-before-create.** The former `this.iconHost.dataset` constructor read crashed before `iconHost` was created. Current `src/renderer/uikit/Notification/NotificationView.ts:81-98` creates and touches it in `onMount()`. A synchronous constructor dereference rule would have caught the historical form. |
| `BlockingBranchView` | **Class A — read-before-create.** The former constructor reads of `this.header`/`this.content` crashed before either field was created. Current `src/renderer/uikit/Progress/ProgressOverlayView.ts:122-130` creates and touches them in `onMount()`. The same synchronous dereference rule would have caught it. |
| `ProgressPillView` | **Class B — claim-twice.** The former constructor and `onMount()` both assigned `this.spinner = this.child(...)`; the current in-file comment at `src/renderer/uikit/Progress/ProgressOverlayView.ts:79-82` correctly calls this a second owned-but-never-mounted child and a leak. Current creation is only at `:84-90`. A field-identity claim-twice rule would have caught the historical form. |
| `MermaidBodyView` | **Not a defect.** `src/renderer/editors/mermaid/MermaidBodyView.ts:47-64` (`MermaidLoadingView`) and `:79-107` (`MermaidBodyView`) create child views/elements, claim them once, hand child roots to `createPanelElement`/the root, and mount the claimed children from `onMount()` (`:62-64`, `:110-117`). No field is read before creation and no field is claimed twice. US-1055 should be closed as not-a-defect. |

The current file still has ordinary permitted ownership registration in
`src/renderer/uikit/Notification/NotificationView.ts:54` and
`src/renderer/uikit/Notification/AlertItemView.tsx:31`; those are not Class A
or Class B defects. The 157 constructor `this.child(...)` calls previously
listed in this document are likewise prescribed ownership operations, including
`src/renderer/editors/monaco/index.ts:30`,
`src/renderer/ui/app/PagesView.ts:13`,
`src/renderer/ui/app/RenderEditorView.ts:19`,
`src/renderer/ui/app/MainPageView.ts:63-66`, and the E7 dialog views.

### Measured constructor baselines

The brace-matched scan covered all 197 files containing
`extends VanillaView`. It excludes the `super(...)` line when measuring child
DOM appends and excludes the base-established `this.props` and `this.root`
fields for Class A.

| Constructor clause | Current baseline | Decision |
|---|---:|---|
| Listeners: `addEventListener`, `this.listen(`, `this.bind(`, `.subscribe(` | 0 | Enable as an ESLint error immediately. |
| Timers: `setTimeout`, `setInterval`, `requestAnimationFrame`, `queueMicrotask` | 0 | Enable as an ESLint error immediately. |
| Measurement: `getBoundingClientRect`, `ResizeObserver`, `IntersectionObserver`, `offset*`, `client*` | 0 | Enable as an ESLint error immediately. |
| Child-DOM append: `append`, `appendChild`, `prepend`, `replaceChildren`, `insertBefore`, `insertAdjacent*` | 49 sites | Measure and document, but do **not** enable an append ban. Constructor-created DOM may be appended under the narrowed contract. |
| Class A synchronous child-field dereference, excluding `this.props`/`this.root` | 0 | Enable as an ESLint error immediately. |

The 49 append sites are in the dialog views, `log-view` items,
`CompareEditor`, `FindBarView`, `PageTabView`, `LogMessageView`, and
`MermaidBodyView`. Representative verified locations include
`src/renderer/ui/tabs/PageTabView.ts:114,117`,
`src/renderer/editors/log-view/LogMessageView.ts:28`,
`src/renderer/editors/compare/CompareEditor.ts:102-103`,
`src/renderer/editors/shared/FindBarView.ts`'s constructor append, and
`src/renderer/editors/mermaid/MermaidBodyView.ts:107`. These are not defects
under the corrected create-before-touch contract, so an append ban would be a
false-positive refactor rather than a guard.

Class A must be synchronous. The only two raw non-root/props hits in the scan
are `src/renderer/components/git-tree/GitTreeView.ts:245-246`, where
`this.props` appears inside arrow callbacks. Those callbacks run after
construction and must not be reported. The rule must not descend into a
function body or closure declared in the constructor; it inspects direct
synchronous constructor statements only.

### Class B field identity scan

The broad “field assigned in constructor and `onMount()`” search produced 54
hits, mostly normal prop pumping (`this.model = props.model`) and therefore is
not a rule. The narrow scan finds four field-name collisions involving values
from `this.child(...)`; each requires field identity and release-flow analysis:

| Source | Finding |
|---|---|
| `src/renderer/editors/base/TextChromeView.ts` (`button`) | False positive from distinct nested view classes/slots using the same field name. For example `CompareButtonView` claims its own field at `:100`; other classes have separate declarations. Key on the class member, not the spelling alone. |
| `src/renderer/editors/category/CategoryEditor.ts` (`activeItems`) | Two mutually exclusive branches in `renderItems()` at `:382` and `:398`; each calls `releaseActiveItems()` first (`:381`, `:397`), so this is valid replacement of distinct list/tile slots. |
| `src/renderer/editors/markdown/index.ts` (`button`) | Two distinct view classes use the same field name. `MarkdownToolbarBitsView` claims once at `:33`; `MarkdownBackButtonView` reclaims its own field at `:143` only after `releaseChild()` at `:127`. Both are valid. |
| `src/renderer/ui/app/RenderEditorView.ts` (`asyncEditor`) | The constructor claim at `:19` is later replaced at `:32` only after `releaseChild(previous)` at `:30`; this is valid lifecycle replacement. |

The rule must therefore report a field claimed by `this.child(...)` more than
once without an intervening `releaseChild(the same field)` on every reachable
replacement path. The historical `ProgressPillView` shape is the test case;
the four current measured cases are valid and must remain valid.

### Candidate mechanisms

#### ESLint — recommended

`eslint.config.mjs` is already ESLint 9 flat config. It imports
`@eslint/js`, `typescript-eslint`, `eslint-plugin-import`,
`eslint-plugin-react-hooks`, and `globals` at lines 1–11, with the main rules
at lines 36–91. There is no local rule directory or local plugin package.
`package.json:13` runs `eslint .`; the relevant parser/config/plugin packages
are already dev dependencies at lines 26, 35, and 39–42.

An inline flat-config plugin object is therefore cheap and needs no new
infrastructure. It should contain four enabled errors:

1. no constructor listeners/subscriptions;
2. no constructor timers;
3. no constructor measurement;
4. no synchronous constructor dereference of a child field before the
   constructor has created that field, excluding `this.props` and `this.root`.

It should also contain the narrow Class B claim-twice rule described above.
It must deliberately omit an append ban and must ignore closure bodies inside
constructors. The four historical shapes are all covered: Class A catches
`NotificationView` and `BlockingBranchView`, while Class B catches
`ProgressPillView`; `MermaidBodyView` is correctly left alone.

#### Base runtime assertion — not recommended

A construction flag at `src/renderer/uikit/shared/vanilla-view.ts` could be
cleared by `mount()` and checked by `child()`, but `child()` only performs
activity/ownership/list bookkeeping at lines 157–163. It would flag the
prescribed 157 constructor claims, would not see raw `this.iconHost.dataset` or
`this.header.dataset`, and could not intercept direct DOM calls or closures.
It therefore misses Class A, the decisive historical crash class, and is not a
guard for this contract. The renderer also has no existing development switch:
the verified search found zero `import.meta.env.DEV`, `NODE_ENV`, `__DEV__`, or
`isDev` hits. A development-only runtime assertion would require new
environment plumbing in addition to being incomplete.

## Implementation Plan

1. Add an inline AST-aware local plugin to `eslint.config.mjs`. Identify
   `VanillaView` descendants, brace/scope the constructor, ignore nested
   function bodies for synchronous checks, and enable the three zero-baseline
   lifecycle errors plus Class A. Do not add an append rule and do not forbid
   `this.child(...)`.

   ```ts
   // Before: the broad proposed guard falsely rejects prescribed ownership.
   this.child(new SpinnerView({}));
   ```

   ```ts
   // After: keep ownership legal; reject only a raw uncreated-field read.
   this.spinner = this.child(new SpinnerView({})); // allowed
   this.spinner.dataset.part = "spinner";          // allowed only if created here
   this.iconHost.dataset.part = "icon";            // error if not created here
   ```

2. Add the narrow Class B rule keyed by the actual class member. Track values
   returned by `this.child(...)`, permit a later claim only after
   `releaseChild(the same member)`, and handle mutually exclusive branches and
   closures without using a global field-name count. The four current cases in
   the scan must remain clean; the historical ProgressPill duplicate must be
   reported.

3. Narrow the canonical rule text in
   `src/renderer/uikit/CLAUDE.md` as recorded above. Do not change the existing
   listener, subscription, measurement, or timer prohibitions; their measured
   zero baselines make them safe to enforce immediately.

4. Add failed-`onMount()` rollback to
   `src/renderer/uikit/shared/vanilla-view.ts`. Keep `mounted = true` during
   `onMount()` so `bind()` retains its immediate-apply contract, but on throw:
   set the instance back to the not-successfully-mounted state, dispose all
   registered children and FIFO disposers, mark it inert/disposed, and preserve
   the original mount error. Do **not** call `onDispose()` on a half-built view:
   the current hook is only called when mounted (`:119-121`) and implementations
   may assume `onMount()` completed. The rollback must bypass that hook (for
   example by clearing `mounted` before the existing disposal path). Cleanup
   failures are swallowed/recorded only for cleanup purposes so they cannot
   mask the original mount error, following `PageSlot`'s precedent.

   ```ts
   // Before: mounted remains true if onMount throws; dispose then calls onDispose.
   this.mounted = true;
   this.onMount();
   return this.root;
   ```

   ```ts
   // After: registered partial state is cleaned; onDispose is skipped on failure.
   this.mounted = true;
   try {
       this.onMount();
       return this.root;
   } catch (error) {
       this.mounted = false;
       try { this.disposeRegisteredState(); } catch { /* preserve error */ }
       throw error;
   }
   ```

   The implementation must ensure the failed instance cannot be retried after
   a child claim, because `claimViewOwnership()` is lifetime-wide. A caller may
   construct a fresh view instead.

5. Fix `src/renderer/components/page-manager/PageSlot.ts` so `attach(root)`
   and `new viewConstructor(...)` are inside the same rollback scope. Current
   lines 57–58 precede the `try` at line 63, while the mount rollback at
   lines 63–75 handles only an already-constructed view. On either constructor
   or mount failure, clear `nativeView`, dispose a constructed view while
   preserving the original error, remove the view root and the attached blank
   slot state, and rethrow.

   ```ts
   // Before: construction can throw after attach() but before the try.
   this.attach(root);
   const view = new viewConstructor({ pageId: this.id });
   try { this.nativeView = view; view.mount(); } catch (error) { ... }
   ```

   ```ts
   // After: attachment, construction, and mount share rollback ownership.
   let view: VanillaView<PageSlotViewProps> | undefined;
   try {
       this.attach(root);
       view = new viewConstructor({ pageId: this.id });
       this.nativeView = view;
       this.element.append(view.root);
       view.mount();
   } catch (error) {
       this.nativeView = undefined;
       try { view?.dispose(); } catch { /* preserve original error */ }
       view?.root.remove();
       this.element.remove();
       throw error;
   }
   ```

5a. **Only detach the placeholder if this call attached it.** `attach()` is a
   no-op when `this.element.parentNode` is already set (`PageSlot.ts:28-32`), and
   the React arm's `render()` also calls it. So an unconditional
   `this.element.remove()` in the rollback can detach a placeholder that an
   earlier successful path attached — producing exactly the blank page this task
   exists to prevent, from the opposite direction. Capture whether this
   invocation performed the attachment and remove only in that case:

   ```ts
   const attachedHere = !this.element.parentNode;
   try {
       this.attach(root);
       // ...
   } catch (error) {
       // ...
       if (attachedHere) this.element.remove();
       throw error;
   }
   ```

6. Record US-1055 as not-a-defect in the task/epic tracking when the task is
   completed. Do not modify `src/renderer/editors/mermaid/MermaidBodyView.ts`:
   its `MermaidLoadingView` and `MermaidBodyView` create, claim once, attach,
   and mount correctly under the narrowed contract.

7. Verify with the existing `npm run lint`, `npm run typecheck`, and
   `npm run build-prod` commands, plus manual construction/mount failure,
   notification, blocking-progress, and Mermaid paths. Add no unit tests or
   test harnesses; this project has none.

## Concerns / Open Questions

- **Resolved rule scope:** constructor `this.child(...)` is explicitly legal.
  The 157 calls across 59 classes are not migration work and must not be put in
  an allow-list or refactored.
- **Resolved append scope:** the measured 49 constructor append sites are not
  an error under “constructor-created may be touched”. Enforcing an append ban
  would contradict the corrected contract and create a large false-positive
  refactor.
- **Resolved Class A scope:** only synchronous constructor dereferences count.
  `this.props`/`this.root` are base-established, and the two `GitTreeView`
  callback reads at `:245-246` are post-construction closures.
- **Resolved Class B scope:** member identity plus release flow is required.
  Name-only or constructor-vs-`onMount()` assignment counts misclassify the
  four verified valid cases.
- **Rollback hook hazard:** `mounted` is deliberately true during `onMount()`;
  blindly calling public `dispose()` after a throw would invoke `onDispose()` on
  a half-built view and could mask the original error. The chosen plan skips
  `onDispose()` for failed mounts, disposes registered children/disposers, and
  preserves the mount error.
- **Constructor failure ownership:** the base class cannot catch a constructor
  exception because no instance exists. `PageSlot` must own its attachment and
  construction rollback; adapters/structural helpers retain their own root
  detachment responsibilities.
- **Development-only runtime mode:** no existing dev-mode convention exists,
  and the runtime flag would miss Class A. ESLint is the complete guard.
- **No test infrastructure:** validation is lint/typecheck/build plus manual
  failure-path inspection only.

## Acceptance Criteria

- [ ] `src/renderer/uikit/CLAUDE.md` states: “Whatever the constructor touches,
      the constructor must have created; whatever `onMount()` creates, only
      `onMount()` and later may touch,” explains why the wording was narrowed,
      and retains the listener/subscription/measurement/timer prohibitions.
- [ ] `eslint.config.mjs` enables errors for constructor listeners/subscriptions,
      timers, measurement, and synchronous Class A child-field dereferences.
- [ ] The ESLint guard does not report constructor `this.child(...)`, the 49
      constructor append sites, `this.props`/`this.root`, or function/closure
      bodies declared in constructors.
- [ ] The Class B rule keys on the actual class member and requires release
      before re-claim; the four verified cases remain valid and the historical
      `ProgressPillView` duplicate is covered.
- [ ] The four historical reports are documented as Class A, Class A, Class B,
      and not-a-defect respectively; US-1055 is closed as not-a-defect and
      `MermaidBodyView.ts` is unchanged by this task.
- [ ] Failed `VanillaView.mount()` disposes registered children and FIFO
      disposers, does not invoke `onDispose()` on a half-built view, leaves the
      instance inert, and preserves the original mount error.
- [ ] `PageSlot.renderNative()` rolls back both constructor and mount failures;
      `attach()` and construction are inside the rollback scope.
- [ ] `mountVanilla`, `AsyncEditorView`, and `SubtreeSwap` remain ownership-safe
      and do not double-dispose or leak roots after the base rollback change.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run build-prod` pass after
      implementation, with manual verification of the named failure/live paths.
- [ ] No unit-test or test-harness files are added, and `doc/active-work.md` is
      not changed; the epic and dashboard already list US-1142.

## Files Changed Summary

| File | Planned change |
|---|---|
| `eslint.config.mjs` | Add the local AST rule with four immediate errors and the narrow Class B rule. |
| `src/renderer/uikit/CLAUDE.md` | Narrow only the over-strict child-DOM sentence and document the create-before-touch rationale. |
| `src/renderer/uikit/shared/vanilla-view.ts` | Roll back failed `onMount()` state without invoking `onDispose()` or masking the original error. |
| `src/renderer/components/page-manager/PageSlot.ts` | Put attach, construction, and mount in one rollback scope. |

Files that need no changes for this task: `src/renderer/editors/mermaid/MermaidBodyView.ts`,
`src/renderer/uikit/shared/subtree-swap.ts`, `src/renderer/uikit/shared/keyed-list.ts`,
`src/renderer/uikit/shared/mount.tsx`, and the existing `VanillaView` subclasses
whose constructor `child()` claims are the documented ownership pattern.
