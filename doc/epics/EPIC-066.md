# EPIC-066 — Delete the synthetic-event round trip (De-React E8)

**Status:** Complete
**Created:** 2026-08-25
**Completed:** 2026-08-26
**Roadmap slot:** E8 of the [De-React programme](../de-react.md)

## Closing property

**Corrected during US-1097 — see E8-13. The original wording was wrong and is kept here struck
through, because this epic's own discipline is that a corrected claim is more useful than a tidy
one.**

> ~~`uikit/shared/react-compat.ts` no longer exports `toPublicEvent` or `PublicEventHandler`~~; no
> converted view wraps a native event to satisfy its own prop type; `ContextMenuEvent.fromNativeEvent`
> and `getTraitDragDataFromEvent` are single-armed; and the wrap/unwrap/cast counts below all read
> **0**.

`toPublicEvent` and `PublicEventHandler` **cannot be deleted**: `react-compat.ts:117` calls both from
inside `applyRestProps`, which E8-7 explicitly preserves. The achievable form is that they become
**module-private** — no importer outside `react-compat.ts` — which is what actually kills the
contract. The rest of the original property stands.

**What must not be claimed at close.** This epic does **not** remove React from `uikit/`, does not
move the Rule 4 root count (see E8-4), and does not delete `react-compat.ts` — `applyRestProps`,
`clearRestListeners` and `bindRef` survive deliberately (E8-7). Three consecutive epics have now had
to correct an over-reaching closing property at close (E6-11 corrected E6's own, E7 corrected E5's
axis claim, E5 corrected E4's). The counts in E8-2 are the whole claim; anything beyond them is not
this epic's result.

---

## E8-1 — The contract, and the search that found it

E5-1 requires every epic to run its own contract search rather than inherit an axis from the folder
its predecessor touched. E7 (EPIC-065) deliberately named no E8 candidate for exactly this reason.

The search was run over the whole renderer import graph, not per folder. Starting counts:

| Measure | Count |
|---|---|
| Non-story `.tsx` files | 229 |
| …of which contain JSX at all | 193 |
| Files importing `react`/`react-dom` (non-story) | 235 |
| **Already-vanilla `.ts` files that still import React** | **65** |
| Non-story Emotion importers | 1 (`theme/GlobalStyles.tsx`) |

That fourth row is the lead: 65 files that were *already converted* still carry a React import. The
census of what they use it for names the contract:

| Symbol | Uses | Kind |
|---|---|---|
| `React.MouseEvent` | 23 | **event type** |
| `React.ReactNode` | 22 | value contract |
| `React.Ref` | 20 | ref contract |
| `React.createElement` | 17 | genuine React bridge |
| `React.DragEvent` | 13 | **event type** |
| `React.CSSProperties` | 10 | style type |
| `React.Fragment` | 9 | genuine React bridge |
| `React.KeyboardEvent` | 8 | **event type** |
| `React.HTMLAttributes` | 7 | rest-props contract |
| `React.SyntheticEvent` | 4 | **event type** |

**48 of the uses are event types.** The contract is therefore: *the public props of converted views
are typed with React event types*, which forces a converted view to wrap the native event it already
has, and forces its caller to unwrap it again. The seam that does the wrapping is `toPublicEvent` in
`uikit/shared/react-compat.ts`.

## E8-2 — The measurement, and why it is decisive

| Measure | Now | At close |
|---|---|---|
| `toPublicEvent(...)` call sites | **27** | 0 |
| …of which are followed by a cast | **27 (100%)** | — |
| …of which use the double `as unknown as` | **17** | 0 |
| `.nativeEvent` read sites (excl. `react-compat.ts`) | **32** (27 in `.ts`) | 0 in `.ts` |
| Lossy `nativeEvent as KeyboardEvent` / `as MouseEvent` casts | **11** | 0 |
| Dual-armed `"nativeEvent" in event ? … : …` accessors | **2** | 0 |
| Dead exports | **1** (`PublicEventHandler`) | 0 |

**Every one of the 27 wrap sites is cast, and 17 use `as unknown as`.** That double cast is the
compiler stating plainly that the value does not have the type the prop demands. This is not a
stylistic preference being tidied — it is 17 places where type checking has been switched off to
keep a React-shaped signature alive on a view that has no React in it.

The round trip in full, from `ui/dialogs/InputDialogView.ts:87`:

```text
native KeyboardEvent
  → toPublicEvent(event)          // allocate a Proxy over the native event
  → as KeyboardEvent              // …and lie about its type, because the prop wants React's
  → onKeyDown prop                //    (React.KeyboardEvent)
  → event.nativeEvent             // …which the handler immediately unwraps
  → model.handleKeyDown(native)   // back to the event we started with
```

Nine of the eleven lossy casts are in `ui/dialogs/*View.ts`, all of the shape
`(event) => model.handleKeyDown(event.nativeEvent as KeyboardEvent)`.

### The runtime cost is not only types

`toPublicEvent` allocates **two objects per event** — an `Object.create(null)` target with nine
`defineProperties` accessors, wrapped in a `Proxy` whose `get` trap re-binds every function it
returns. This runs on every click, keydown, drag, paste and focus routed through the 13 views that
call it, including `TreeModel`, `ListBoxModel` and `MinimapView`, which are the hot paths in
virtualized lists and drag interactions.

### The tell

`core/events/context-menu.ts:62` and `core/traits/dnd.ts:89` both read:

```ts
const native = "nativeEvent" in e ? e.nativeEvent : e;
```

A dual-armed accessor over "React event or native event" is the exact shape of every contract this
programme has deleted — `Views.registerView` (E7), `ReactSecondaryViewDefinition` (E5),
`IconRef = IconName | ReactNode` (E6), `EditorModule.Body` (E2). Finding it again one layer down, in
the two accessors *every* context menu and *every* drop target funnels through, is the strongest
single piece of evidence that the event shape is the remaining contract.

## E8-3 — Rejected rivals, on numbers

The search surfaced four alternatives. Each was priced before being set aside, so a later epic does
not have to re-derive them:

| Rival | Measurement | Verdict |
|---|---|---|
| `uikit/Tree/types.ts` + `ListBox/types.ts` — `renderItem?: (ctx) => ReactNode` | Real callers outside the two views' own destructure-and-drop lines: **0** | **Dead arm, not a contract.** Same finding as E7's `trailing?: React.ReactNode` (5 sites, 0 JSX). Delete as a task, not an epic. |
| `uikit/shared/highlight.ts` — `highlight()` returning `ReactNode` | **1** caller: `editors/graph/GraphBody.tsx`. The DOM form `highlightInto` already serves `ListItemView`, `TreeItemView`, `NoteItemView`, `ExpandedNoteView` | Real removal-ledger entry, but **blocked behind the graph editor**. Collect when graph converts. |
| `graph` editor | 8,100 lines across the folder, 8 `.tsx` | **Line count, no contract.** E4-1 permits line count only when no contract exists. One does. |
| `applyRestProps` / `clearRestListeners` | **39 / 38** consumer files — the largest react-compat surface by far | **Deliberately out of scope — see E8-7.** |

The `renderItem` rejection is worth stating as a rule, because it is now the third time it has
occurred: **an exported type parameter with no caller is a dead arm, and a dead arm is cheap to
delete and worthless to build an epic around.** Grep for callers before scoping, every time.

## E8-4 — Rule 4 does not move, and that is correct

The programme's headline metric is React roots. **This epic will not change it.** `toPublicEvent`
creates no root; it translates an event. A Rule 4 measurement taken before and after will read
identically, and reporting that as "no progress" would be reading the wrong instrument.

E7 already established the principle when its own roots existed only while a dialog was open: **the
metric has to match how the cost is incurred.** Here the cost is incurred per event and per cast, so
the metric is the E8-2 table — wrap sites, unwrap sites, casts, dual arms — plus the structural count
of vanilla `.ts` files that still import React.

This is the second consecutive epic to need a metric other than the root count, which is itself worth
recording: **the root count measures the React that renders, not the React that types.** The
remaining work in this programme is increasingly the latter.

## E8-5 — Ordering: hardest first, because the seam's shape is the risk

The 13 wrap-site files split two ways, and the split — not the line count — sets the order:

| Kind | Files | Wrap sites |
|---|---|---|
| **Pure vanilla** — no React face at all | 8 (`CategoryViewImpl`, `TreeProviderViewImpl`, `LinksListView`, `LinksTilesView`, `FolderItemView`, `ListBoxModel`, `MinimapView`, `TreeModel`) | 17 |
| **React-faced** — a live `.tsx` arm whose JSX callers pass real React events | 5 (`DialogView.tsx`, `TextareaView.tsx`, `ToolbarView.tsx`, `NotificationView.tsx`, `TreeItem.tsx`) | 10 |

The pure-vanilla eight are mechanical: retype the prop as the native event, delete the wrap and the
cast. The React-faced five are the actual design problem — their prop type must satisfy a JSX caller
*and* a vanilla caller at once, which is the whole question this epic has to answer.

So the pilot is a React-faced view, deliberately against the usual instinct to start easy. E7 found
that **line count picks the surface, not the order of tasks within it**; this epic adds the
corollary: **when one decision governs every remaining site, the first task is the one that can
disprove it.** Converting the eight easy files first would produce a large green diff and only then
discover whether the chosen prop shape works at all.

**Pilot: `uikit/Textarea/TextareaView.tsx`.** It is the sharpest test available, because one of its
two wraps is a `ClipboardEvent` — and `react-compat.ts`'s own comment records that WebIDL accessors
like `ClipboardEvent.clipboardData` brand-check their receiver and throw when read from an
`Object.create(event)`. That is precisely why the Proxy exists. If the seam's replacement handles
clipboard correctly, it handles everything; if it cannot, the epic learns that in task one rather
than task five.

## E8-6 — Concerns

1. ~~**The React-faced five may genuinely need both shapes.**~~ **RESOLVED before US-1093 was
   implemented — see E8-11. The concern was based on a false premise and dissolves entirely.**
   All five "React-faced" views (`Dialog.tsx`, `Textarea.tsx`, `Toolbar.tsx`, `Notification.tsx`,
   `Tree.tsx`) are `mountVanilla(View, props)` pass-throughs. React never creates these events for
   *any* caller, JSX included, because the DOM node belongs to the vanilla view. The React event
   types are therefore nominal at every call site, and the prop goes native with no adapter and no
   union.
2. **`nativeEvent.contextMenuPromise` is a real protocol, not waste.** Four sites in
   `CategoryViewModel.ts` and `TreeProviderViewModel.ts` stash a promise on the event so a
   context-menu handler can await asynchronous item construction. Those sites read `.nativeEvent`
   only because the handler is handed a React event — once it is handed the native one, the expando
   is read directly. **The protocol survives; only the hop is removed.** Do not "simplify" it away.
3. **`PageTabView.ts:415` reads `ctrlKey` through a cast.** `(event.nativeEvent as MouseEvent).ctrlKey`
   gates ctrl-click tab behaviour. A wrong native type here silently disables a real feature rather
   than failing to compile. Verify by interaction, not by `tsc`.
4. **Nine of the eleven lossy casts are in `ui/dialogs/`, which E7 just rewrote.** The contract itself
   lives in `uikit/shared/`, and its 27 sites span `uikit`, `editors`, `components`, `ui` and `core`
   — so this is not polishing the last epic's output. But the overlap is real and is stated here
   rather than left for a reviewer to discover.
5. **`toPublicEvent`'s Proxy may be masking a latent bug.** Its `get` trap binds returned functions to
   the native event. Any caller relying on that indirection — for instance calling a method on a
   stored reference to the public event after the native event has been dispatched — changes
   behaviour when the Proxy goes. Grep for public events retained past their handler.
6. **`React.SyntheticEvent` pooling semantics are long gone** (React 17+), so `persist()` and
   `isPersistent()` in the facade are no-ops preserved for shape only. The search found **0** callers
   outside `react-compat.ts`; confirm at the site before deleting.
7. **The one uncast `toPublicEvent` match is the definition line**, not a call site. Recorded so a
   future reader re-running the grep gets 28 and does not conclude the table is wrong.

## E8-7 — Non-goals, with reasons

- **`applyRestProps` / `clearRestListeners` (39 / 38 files) stay.** This is the largest react-compat
  surface, and it is load-bearing *because* React callers still spread JSX-shaped props (`className`,
  `onClick`, `aria-expanded`, `draggable`) into converted views. It is the compatibility layer that
  made incremental conversion possible at all. It can only go after the last JSX caller does, which
  places it with the 24 `<TextChrome>` call sites at the **end** of the programme (E1-8). Attacking
  it now would mean converting those callers, i.e. a different epic wearing this one's name.
- **`bindRef` (17 files) stays**, for the same reason: `React.Ref` on a converted view's props exists
  to serve React callers.
- **`React.CSSProperties` (10 uses) stays.** It is a structurally identical style dictionary; swapping
  it for `Partial<CSSStyleDeclaration>` is churn with no removal behind it.
- **`react-compat.ts` is not deleted**, only narrowed. Saying otherwise would repeat E6-11's
  over-reach.
- **The graph editor, the browser editor and `<TextChrome>` stay unscheduled.**

## E8-8 — Task breakdown

| Task | Scope | Sites |
|---|---|---|
| US-1093 | **Pilot + seam decision.** `uikit/Textarea/TextareaView.tsx` (clipboard + keyboard). Establish the prop shape for a React-faced view and record the decision in this document before proceeding. | 2 |
| US-1094 | **The remaining React-faced four, plus the callers of the props they retype.** `DialogView.tsx`, `ToolbarView.tsx`, `NotificationView.tsx`, `TreeItem.tsx` — and the **13 `ui/dialogs/*View.ts` `.nativeEvent` unwraps** of `DialogProps.onKeyDown`, which cannot be deferred (see the note below). | 8 + 13 |
| US-1095 | **`uikit` pure vanilla.** `ListBoxModel.ts`, `TreeModel.ts`, `MinimapView.ts`. Hot paths — the per-event allocation removal lands here. | 4 |
| US-1096 | **`components/tree-provider`.** `CategoryViewImpl.ts`, `TreeProviderViewImpl.ts`, plus the four `contextMenuPromise` expando reads in the two view-models (concern 2). | 5 + 4 |
| US-1097 | **`editors/link-editor` + `ui/sidebar`.** `LinksListView.ts`, `LinksTilesView.ts`, `FolderItemView.ts`. Carries `SelectEvent` / `ContextMenuEvent` / `PublicDragEvent` aliases that need retyping too. | 8 |
| US-1098 | **The close.** `MenuView.ts`, `MenuBarView.ts`, `PageTabView.ts` (concern 3), `FindBarView.ts`, `EditLinkDialogView.ts`; single-arm `context-menu.ts` and `dnd.ts`; delete `toPublicEvent` and `PublicEventHandler`; re-measure the E8-2 table. The 13 dialog unwraps moved to US-1094. | remainder |

Each task's brief must state that a green `tsc --noEmit` and a clean `npm run lint` are **completion
conditions**, not follow-ups, and that any `.tsx` → `.ts` rename is an explicit requirement rather
than an option.

### Correction to this breakdown, found while briefing US-1094

The original split put `DialogView.tsx` in US-1094 and the 13 `ui/dialogs/*View.ts` callers that
unwrap its event in US-1098. **That split cannot compile.** `DialogProps.onKeyDown` is not declared
by `Dialog.tsx` at all — it is inherited from `React.HTMLAttributes<HTMLDivElement>`
(`uikit/Dialog/Dialog.tsx:11-12`), so retyping it means adding it to that `Omit` list and redeclaring
it natively, and every caller passing `event.nativeEvent` breaks in the same compile.

Since green `tsc` is a completion condition of every task, **retyping a prop and fixing that prop's
callers are one atomic change.** The task axis for this epic is therefore *the prop*, not the folder.
Two of the six tasks were scoped by folder and had to be re-cut; the remaining ones should be checked
against this rule before they are briefed.

This also distinguishes `Textarea` from the rest: `TextareaProps` **already** `Omit`s and redeclares
its two handlers, which is why US-1093 was a six-line change. `Dialog`, `Toolbar` and `Notification`
inherit theirs from `React.HTMLAttributes`, so each needs an `Omit` entry added first — and that
inherited-prop distinction, not the React-faced/pure-vanilla split, is what actually predicts a
site's difficulty.

### The rule had to be sharpened twice more

The correction above said the atomic unit is the prop rather than the folder. That was still too
weak, and the epic hit the boundary twice more:

- **US-1095** absorbed `components/file-list` and `ui/sidebar/MenuBarView.ts`, because they declare or
  supply the `onContextMenu` handler it retyped.
- **US-1096 landed with a RED `typecheck`** — two errors at `editors/category/CategoryEditor.tsx:137`
  and `:139`. `CategoryEditor.tsx:116-140` forwards one `itemProps` bundle into *both*
  `<LinksList>`/`<LinksTiles>` (the link-editor chain, still React at that moment) and the
  tree-provider chain US-1096 had just made native. US-1097 had to be pulled forward to restore
  green.

**The final form of the rule: the atomic unit is the connected component of the prop-type graph.** Not
the folder, and not even a single prop chain — two chains that meet at one forwarding caller are one
unit, and no amount of care about *which* prop a task owns will find that join. Only tracing the
graph does.

The generalisable point for future epics: **when a change's blast radius is decided by the type
graph, the task boundary has to be computed from the type graph before the tasks are written, not
inferred from where the files live.** Every one of this epic's three mis-cuts came from scoping by
directory. The cost was one red build, caught by the completion condition exactly as intended — which
is the argument for keeping green `tsc` a per-task gate rather than an end-of-epic one.

## E8-9 — Progress

| Task | Status | Notes |
|---|---|---|
| US-1093 | **Implemented** | Six changed lines across 3 files + the `.tsx` → `.ts` rename. `TextareaProps.onKeyDown`/`onPaste` are native; `TextareaView.ts` imports no React. `VideoView.tsx:60` needed **no edit** — its parameter type was inferred. Verified live: handlers receive real `KeyboardEvent`/`ClipboardEvent` (`constructor.name`), `clipboardData` readable. The rename wedged HMR and needed a cold restart — not a defect (see E8-12). |
| US-1094 | **Implemented** | The 4 React-faced views plus all 14 dialog callers — the 14th, `EditLinkDialogView.ts:341`, was found by Codex and was outside my original list. 3 renames. `TreeItem`'s dead React `onChevronClick` arm deleted; `DialogProps.onClick` found to have **zero** callers. |
| US-1095 | **Implemented** | Absorbed `components/file-list` and `ui/sidebar/MenuBarView.ts` — the prop chain, not the folder. Both misleading "frozen prop" comments removed after confirming C3-5 is EPIC-056's *scoping* rule (`EPIC-056.md:197`), not a permanent API freeze. Minimap's two retyped props had no callers at all. |
| US-1096 | **Implemented** | Landed with a RED `typecheck` (2 errors at `CategoryEditor.tsx:137,139`) — the trigger for the connected-component rule. Two scope-creep renames rejected at plan review. `contextMenuPromise` protocol preserved; only the `.nativeEvent` hop removed. |
| US-1097 | **Implemented** | Pulled forward to restore green. The three `Parameters<>`-derived aliases in `LinksTilesView.ts` needed no edit and became unused; the shadowing `ContextMenuEvent` alias was removed. `CategoryEditor.tsx` needed nothing beyond its existing forward. |
| US-1098 | **Implemented** | `toPublicEvent` / `PublicEventHandler` made module-private; 8 rest-props handlers retyped via the components' existing `Omit` lists without touching `applyRestProps`; `dnd.ts` collapsed, `context-menu.ts` retained (E8-14). Final counts in E8-10. |

## E8-11 — The React-faced/pure-vanilla split was not a real distinction

Recorded during US-1093's plan review, because it invalidates this epic's own E8-5 ordering premise
and supplies the mechanical rule E8-8 said the pilot had to produce.

E8-5 asserted that the five React-faced views "are the actual design problem — their prop type must
satisfy a JSX caller *and* a vanilla caller at once". **That premise is false.** `Textarea.tsx` is,
in its entirety:

```ts
export function Textarea(props: TextareaProps): React.ReactElement {
    return mountVanilla(TextareaView, props);
}
```

It is a pass-through, not a React implementation — and `Dialog.tsx`, `Toolbar.tsx`,
`Notification.tsx` and `Tree.tsx` all call `mountVanilla` too. The consequence:

> **React never creates these events, for any caller.** The DOM node belongs to the vanilla view, so
> the vanilla view's own listener fires and calls the prop. A JSX caller's handler is invoked with the
> same `toPublicEvent` Proxy a vanilla caller's is. The React event types on these props have never
> described the value that actually arrives.

So there is no boundary to adapt and no union to introduce. **The rule for the remaining 26 sites:**

1. Is the view's React face `mountVanilla(View, props)`? If yes, the React event types on its props
   are nominal → retype the prop to the native event, delete the wrap and the cast, done.
2. Update each caller's handler *parameter type* only. Verify the members it reads exist on the
   native event — for the four Textarea handler call sites (`RequestBuilder.tsx:291,292`,
   `MnemeRootEditorView.tsx:103`, `VideoView.tsx:60`) every read is `key`, `shiftKey`, `ctrlKey`,
   `altKey`, `preventDefault()`, `clipboardData.getData()` — **all native, zero React-only members.**
3. Only if a face renders real JSX and receives real SyntheticEvents does concern 1's original
   question arise. ~~**No such face was found.**~~ **Corrected at US-1098: none was found among the
   five uikit faces in scope, but such components do exist elsewhere in the app** — the unconverted
   React editors. `editors/browser/BrowserTabsPanel.tsx:263`,
   `editors/link-editor/LinkItemList.tsx:76`, `LinkItemTiles.tsx:64` and `PinnedLinksPanel.tsx:179`
   attach their handlers as genuine JSX `onContextMenu` attributes on React-owned elements, so React
   really does create those events. That is why one dual arm survives (E8-14). The sentence was
   written as an absolute about the app when the evidence only supported a claim about `uikit/`.

### The clipboard case argues *for* the change, not against it

E8-5 chose `Textarea` as pilot because `ClipboardEvent.clipboardData` brand-checks its receiver.
Reading the code settles it in the opposite direction from the worry:

- `TextareaView.tsx:194` already reads the clipboard off the **native** event
  (`(event as ClipboardEvent).clipboardData?.getData(...)`), not through the Proxy. The view was
  never exposed to the hazard.
- `RequestBuilder.tsx:163` — `e.clipboardData.getData("text")` — reads it **through** the Proxy, and
  works only because the `get` trap re-resolves the property against the native event as receiver.
  That is a live dependency on the trap, and going native removes it rather than risking it.

**The general lesson, and the one worth carrying past this epic:** a facade that has to re-bind
property access to the object it wraps is not insulating callers from that object — it is a
dependency on the wrapped object with extra steps. The brand check was evidence the wrapper was
wrong, not evidence it was needed.

## E8-12 — The pilot's cost, measured against the alternative that was proposed

US-1093's implementation is **six changed lines** plus a rename:

| File | Change |
|---|---|
| `uikit/Textarea/Textarea.tsx` | 2 lines — `onKeyDown`/`onPaste` retyped to `(event: KeyboardEvent) => void` / `(event: ClipboardEvent) => void` |
| `editors/rest-client/RequestBuilder.tsx` | 2 lines — `React.KeyboardEvent` → `KeyboardEvent`, `React.ClipboardEvent` → `ClipboardEvent` |
| `editors/mneme-root/MnemeRootEditorView.tsx` | 2 lines — `type KeyboardEvent` dropped from the React import; generic argument dropped from the annotation |
| `uikit/Textarea/TextareaView.tsx` → `.ts` | Rename required; no React import, no cast, no `toPublicEvent` |
| `editors/video/VideoView.tsx` | **No edit** — its handler parameter type was inferred |

Worth recording because the first draft of the plan proposed the opposite trade: keep the React
types on the public prop and add a "boundary adapter" in `Textarea.tsx`, specifically to avoid these
caller edits. That would have **relocated** the two casts rather than removing them, left E8-2's cast
count unmoved, and — the real defect — left four call sites declaring `React.KeyboardEvent` while
receiving a native event, so a caller writing the `e.nativeEvent` the type promises would get
`undefined` instead of today's working Proxy value.

**The general lesson: a compatibility adapter that preserves a type which was already wrong does not
preserve compatibility — it preserves the error and removes the thing that was covering for it.** The
cost of being honest here was three one-line edits, one of which the compiler did for free.

### The rename wedges HMR, and that is not a defect

The `.tsx` → `.ts` rename left the renderer blank with renderer-side MCP calls timing out while
main-process calls still answered. A main-process rebuild did not recover it; a full restart did, and
the code then worked on the first cold start. This is the failure mode `CLAUDE.md` §7 describes, and
`.claude/skills/codex-dev/SKILL.md` §5a's rule applied exactly as written: **a wedged renderer is not
a defect until a cold start reproduces it.** Expect it once per task in US-1094 … US-1098, since each
carries at least one rename.

## E8-13 — The closing property was wrong, and `applyRestProps` is why

Measured after US-1097: **0 `toPublicEvent` call sites remain outside `react-compat.ts`.** The wrap
side of E8-2 is complete — all 27 are gone. But the last caller is not gone, it is *internal*:

```ts
// react-compat.ts:117, inside applyRestProps
(value as PublicEventHandler)(toPublicEvent(event));
```

`applyRestProps` is the JSX rest-props bridge that **E8-7 deliberately preserves** until the last JSX
caller is gone. So both symbols this epic promised to delete are load-bearing for a function it
promised to keep. The two non-goals were in direct contradiction and nobody noticed until the count
hit one.

The achievable outcome is that both become **module-private**. That is not a consolation prize: an
un-exported `toPublicEvent` cannot pin a single caller, which is the entire point — *what makes a
contract a contract is that other modules can reach it.*

This also refines E8-2's "dead exports: 1". `PublicEventHandler` genuinely is a dead **export** —
nothing imports it — while being a live internal cast target. Those are different properties, and the
table conflated them.

### What this leaves, and why it is not a failure

10 `.nativeEvent` reads remain, and they are a different mechanism from the 27 wraps:

| Kind | Count | Where |
|---|---|---|
| Dual-armed accessors | 2 | `core/events/context-menu.ts:62`, `core/traits/dnd.ts:89` |
| Reads on the `Input`/`Button` **rest-props** path | 8 | `MenuView.ts` ×2, `PageTabView.ts` ×2, `FindBarView.ts`, `PathInputView.tsx`, `PopoverView.tsx`, `SegmentedControlView.tsx` |

Those 8 do not unwrap something their own view wrapped. They unwrap an event **`applyRestProps`
synthesized**, because they pass `onKeyDown` / `onPointerDown` through the rest-props channel of
another uikit component whose props inherit `React.HTMLAttributes`. Removing them means adding those
names to `InputProps` / `ButtonProps`'s existing `Omit` lists and handling them explicitly — which
does **not** modify `applyRestProps` and so does not breach E8-7. E8-7 preserves the bridge, not
every prop that happens to travel over it.

**The lesson: "delete the contract" and "keep the compatibility layer" are only compatible while the
layer does not itself use the contract.** Check that before writing a closing property — the
contradiction is invisible until the last external caller is removed, which is the point of maximum
sunk cost.

## E8-14 — One dual arm survives, legitimately

US-1098 collapsed `core/traits/dnd.ts`'s `getTraitDragDataFromEvent` to the native arm. It **could
not** collapse `core/events/context-menu.ts:62`, and that is the right answer rather than a shortfall
in the work.

Four callers still pass a genuine React event:

| Caller | Why it is real |
|---|---|
| `editors/browser/BrowserTabsPanel.tsx:263` | JSX `onContextMenu={…}` on a React-owned element |
| `editors/link-editor/LinkItemList.tsx:76` | same, via `:153` |
| `editors/link-editor/LinkItemTiles.tsx:64` | same, via `:141` |
| `editors/link-editor/PinnedLinksPanel.tsx:179` | same |

These are not `mountVanilla` faces. React renders the element, React's own event system creates the
`SyntheticEvent`, and Rule 1 protects them — they belong to the browser editor (1,692 lines) and the
link-editor's remaining React islands, both **explicitly unscheduled** by this epic and its
predecessors. The arm is therefore blocked behind converting those editors, not behind anything
EPIC-066 could have done.

**The distinction worth keeping:** a dual arm over "React event or native event" is dead weight when
both arms are fed by the same vanilla listener — which was true at 27 sites — and load-bearing when
one arm is fed by React itself. Those look identical in the source. Only tracing who *dispatches* the
event tells them apart, and this epic's central rule (E8-11) is exactly that test.

## E8-10 — Result

All six tasks implemented; `npm run typecheck`, `npm run lint` and `npm run build-prod` green at each
one.

### Live verification, on a cold-started app with 7 pages open

Every converted seam was driven with a real native event and asserted on `e.constructor.name` — the
check that distinguishes a native event from a facade, since the old `toPublicEvent` Proxy targeted an
`Object.create(null)` and could never report a DOM class:

| Seam | Task | Event class received |
|---|---|---|
| `DialogView.onKeyDown` | US-1094 | `KeyboardEvent` |
| `DialogView.onClick` | US-1094 | `MouseEvent` |
| `ToolbarView.onKeyDown` | US-1094 | `KeyboardEvent` |
| `TextareaView.onKeyDown` | US-1093 | `KeyboardEvent` |
| `TextareaView.onPaste` | US-1093 | `ClipboardEvent`, `clipboardData` readable |
| `ListBoxView.onContextMenu` | US-1095 | `MouseEvent` |
| `TreeView.onContextMenu` | US-1095 | `MouseEvent` |
| `InputView.onKeyDown` | US-1098 | `KeyboardEvent` |
| `ButtonView.onKeyDown` | US-1098 | `KeyboardEvent` |

The last two matter most: they are the rest-props path, the retype that had to move those props off
`applyRestProps` **without changing the bridge**. Receiving a native `KeyboardEvent` there is the
evidence that the E8-7 boundary was respected rather than crossed.

Shell painted: 6 root children, 7 visible tabs. **React roots: 7** — unchanged in character, exactly
as E8-4 predicted; they are the genuine React islands in the unconverted editors, not event facades.

### The E8-2 table, re-measured

| Measure | At E8-1 | Now |
|---|---|---|
| `toPublicEvent(...)` call sites outside `react-compat.ts` | 27 | **0** |
| …using the double `as unknown as` | 17 | **0** |
| Exported `toPublicEvent` / `PublicEventHandler` | 2 | **0** (module-private; still used internally by `applyRestProps`) |
| Lossy `nativeEvent as KeyboardEvent` / `as MouseEvent` casts | 11 | **0** |
| `.nativeEvent` read sites (excl. `react-compat.ts`) | 32 | **1** (the surviving dual arm) |
| Dual-armed `"nativeEvent" in e` accessors | 2 | **1** (`dnd.ts` collapsed; `context-menu.ts` blocked — E8-14) |
| Already-vanilla `.ts` files importing React | 65 | **58** |

### Findings that outlast the epic

1. **A `mountVanilla` face is not a React implementation** (E8-11). React never creates events for a
   view whose DOM node belongs to a vanilla view, so React event types on such props are nominal for
   *every* caller. This is the test that separates a dead dual arm from a load-bearing one, and it
   turned the epic's predicted design problem into a mechanical rule.
2. **The atomic unit is the connected component of the prop-type graph** (E8-8's correction). Not the
   folder, not even one prop chain — two chains meeting at one forwarding caller are one unit. Three
   mis-cuts, one red build. Compute task boundaries from the type graph, not the directory tree.
3. **"Delete the contract" and "keep the compatibility layer" only coexist while the layer does not
   use the contract** (E8-13). `applyRestProps` calls `toPublicEvent`, so this epic's two non-goals
   contradicted each other — invisible until the external count hit zero, i.e. at maximum sunk cost.
4. **A facade that re-binds property access to the object it wraps is a dependency on that object,
   not insulation from it** (E8-12). The `ClipboardEvent` brand check was evidence the wrapper was
   wrong, not evidence it was needed.
5. **A compatibility adapter that preserves an already-wrong type preserves the error and removes
   what was covering for it** (E8-12). The rejected US-1093 plan would have left four call sites
   declaring `React.KeyboardEvent` while receiving a native event — a working Proxy replaced by
   `undefined`.

### Not done, deliberately

- **`applyRestProps` / `clearRestListeners` (39/38 files) and `bindRef` (17)** — the JSX rest-props
  bridge. E8-7; goes with `<TextChrome>` at the end of the programme.
- **`core/events/context-menu.ts`'s dual arm** — blocked behind the browser editor and the
  link-editor React islands (E8-14).
- **2 `as unknown as React` casts** in `uikit/Tree/TreeDndModel.ts` (drag-start contract) and
  `editors/graph/GraphLegendPanel.tsx` (React-node conversion) — neither is an event facade.
- **`components/tree-provider/CategoryView.tsx` and `TreeProviderView.tsx`** — JSX-free `mountVanilla`
  faces, left for a deliberate sweep of the JSX-free-`.tsx` population EPIC-064 measured, rather than
  renamed because they happened to sit in a folder this epic touched.
- **`React.CSSProperties` (10 uses)** — churn with no removal behind it.
