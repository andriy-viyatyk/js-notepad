# US-1018 — `MultiSelect` and `Autocomplete` vanilla conversion

**Epic:** [EPIC-056 — De-React C3](../../epics/EPIC-056.md) · **Status:** planned ·
**Created:** 2026-08-22

## Goal

Convert the last two dropdown composites in `uikit/` to hand-written vanilla views, deleting the
final two `effect()` calls in the epic (C3-6 #9 and #10) and evicting `Panel` from `uikit/`
altogether. At close, the only Emotion left in the library is `AVGrid/` plus the React-only
`RenderGrid`, and no `uikit/` component imports `Panel`.

## Background

### The surface, measured

Measured 2026-08-22 against `upcoming-v4.0.23` at commit `debdf3c7` (US-1017 implemented).

| File | Lines | What it holds |
|---|---:|---|
| `src/renderer/uikit/MultiSelect/MultiSelect.tsx` | 161 | Props re-export, one Emotion `Root`, the component |
| `src/renderer/uikit/MultiSelect/MultiSelectModel.ts` | 224 | Props interface, 1 `memo`, **1 `effect`**, 7 `state.update` sites |
| `src/renderer/uikit/MultiSelect/MultiSelect.story.tsx` | 126 | 13 controls |
| `src/renderer/uikit/Autocomplete/Autocomplete.tsx` | 162 | One Emotion `Root`, the component, the last `Panel` consumer in `uikit/` |
| `src/renderer/uikit/Autocomplete/AutocompleteModel.ts` | 370 | Props interface, 2 `memo`s, **1 `effect`**, 14 `state.update` sites, 2 real `queueMicrotask` calls |
| `src/renderer/uikit/Autocomplete/Autocomplete.story.tsx` | 179 | 14 controls, and it *does* exercise `header`/`headerAction`/`emptyMessage` |

Hooks to remove: `useId` ×2, `useComponentModel` ×2, `useCallback` ×2, `state.use` ×2. No
`useEffect`, no `useRef`, no `useState` in either production file.

`grep -c queueMicrotask AutocompleteModel.ts` returns **3** but only **2** are calls — the third is
the word inside `commitFromIndex`'s comment. Both calls go (see D6 and D2).

### Four findings that correct or sharpen the epic

1. **`MultiSelect`'s `aria-controls` points at nothing.** `MultiSelectModel.popoverId` is passed to
   the trigger `Input` as `aria-controls` (`MultiSelect.tsx:114`) and **no element in the component
   ever carries that id** — the `Popover` gets `name="multiselect-popover"` and no `id`, and the
   inner `MultiListBox` gets no `id` either. C3-5 promises each task "asserts the aria pairing still
   resolves"; for `MultiSelect` that assertion is unsatisfiable by a verbatim port. See D8.
2. **`Autocomplete`'s `header`/`headerAction` have zero call sites, in production *and* in the
   story's default state.** The one production consumer is
   `editors/rest-client/KeyValueEditor.tsx:112`, which passes neither, and no `startSlot`/`endSlot`
   or `emptyMessage` either. The story's `withHeader` / `withHeaderAction` / `withEmptyMessage`
   toggles are the only exercise of the header row that this conversion touches — which makes the
   story, again, the real exposure. The doc comments' "Browser URL bar" consumer **does not exist**:
   grep finds no other importer. Treat the comments as design intent, not as a live call site.
3. **The `Panel` header row cannot be styled from the `Autocomplete` root.** It lives inside the
   popover's floating branch, which portals into `#persephone-overlay-layer`, so
   `[data-type="autocomplete"] [data-part="header"]` matches nothing — the same trap C3-9 records
   for the mutation counters. It needs a root-level hook of its own. See D4.
4. **`MultiSelect`'s trigger `Input` is `readOnly` unconditionally** (`MultiSelect.tsx:107`), and
   `props.readOnly` reaches only the root's `data-readonly` and the inner `MultiListBox`. It also
   has **no** `onChange` — there is no in-trigger search here, unlike `Select`. And `tryOpen`
   checks `disabled` only, so a `readOnly` `MultiSelect` still opens (by design: rows are
   inspectable but not toggleable). `Select` checks both. Preserve the asymmetry; it is C3-5's
   business, not this task's.

### DOM contract (both components, unchanged unless D8 says otherwise)

| Element | Attributes |
|---|---|
| `MultiSelect` root | `data-type="multiselect"`, `data-name`, `data-id="multiselect-N"`, `data-state="open"\|"closed"`, `data-disabled`, `data-readonly`, inline `width`/`min-width`/`max-width` |
| `MultiSelect` trigger | `[data-type="input"]` with `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls="multiselect-N-popover"`, `aria-label`/`aria-labelledby`; `readOnly` always |
| `MultiSelect` chevron | `[data-type="icon-button"]`, `tabindex="-1"`, `disabled` when `props.disabled` |
| `MultiSelect` dropdown | `[data-type="popover"][data-name="multiselect-popover"]` → `[data-type="multilistbox"]` |
| `Autocomplete` root | `data-type="autocomplete"`, `data-name`, `data-id="autocomplete-N"`, `data-state`, `data-disabled`, `data-readonly`. **No inline width** — `width`/`minWidth`/`maxWidth` are forwarded to the inner `Input`, not written to the root |
| `Autocomplete` trigger | `[data-type="input"]` with `aria-haspopup="listbox"`, `aria-expanded`, `aria-autocomplete="list"`, `aria-controls="autocomplete-N-listbox"` |
| `Autocomplete` dropdown | `[data-type="popover"]` (no `data-name`) → optional header row, then `[data-type="list-box"][id="autocomplete-N-listbox"]` |

`Autocomplete`'s popover opens on a *derived* condition — `open && (filteredItems.length > 0 ||
emptyMessage != null)` (`Autocomplete.tsx:91`) — so `data-state="open"` and "the popover exists" are
**not** the same thing. Preserve that: typing a query with no matches leaves `data-state="open"` on
a root with no floating branch.

### Existing infrastructure to reuse (do not rebuild)

| Need | Use |
|---|---|
| Lifecycle, child ownership, listeners, state binding | `VanillaView` (`shared/vanilla-view.ts`) |
| Model without React | `createComponentModelDriver` (`core/state/model.ts:275`) |
| React-shaped rest props / events | `applyRestProps`, `toPublicEvent`, `bindRef` (`shared/react-compat.ts`) |
| Stable per-instance id (replaces `useId`) | `nextElementId(prefix)` (`shared/element-id.ts`) |
| DOM icon, no React root | `createIconElement` / an `IconName` string through `IconButtonView` |
| React or `Node` slot content | `fillSlot` (`shared/fill-slot.ts`), type `SlotContent` |
| Vanilla popover with native children | `PopoverView`'s `contentView` seam (`Popover/PopoverView.tsx:31`) |
| React call sites | `mountVanilla` (`shared/mount.tsx`) |

The reference implementation for everything structural here is **`Select/SelectView.ts`**
(US-1017). Read it before starting: the ref split, the native-event unwrap, the `applyRoot`-off-the-
state-path rule and the `contentView` factory are all the same shapes.

### Files that need NO changes

- `MultiSelect/index.ts`, `Autocomplete/index.ts` — the shims keep the same exports.
- `uikit/index.ts` — barrel unchanged.
- Both `*.story.tsx` — they render the public component; `mountVanilla` keeps them working.
- `editors/rest-client/KeyValueEditor.tsx` — the only production consumer, and C3-5 forbids touching it.
- `MultiListBox/*`, `ListBox/*`, `Input/*`, `IconButton/*`, `Popover/*`, `Spacer/*` — every composed
  child is already vanilla and every prop this task needs already exists. **`Panel/*` is not
  modified either**: it stays React-only on Epic F's removal ledger, it simply loses its last
  `uikit/` consumer.

## Decisions

Every question below was put to an independent agent with no conversation context; the reasoning it
returned is recorded, and where I departed from its recommendation the reason is stated. Reverse a
decision by amending this section, not by diverging from it in code.

### D1 — `Autocomplete`'s popover content is one private view that **adopts the popover host as its root**

`contentView` returns exactly one `IOwnedView`, but `Autocomplete`'s popover holds **two** siblings:
an optional header row and the `ListBox`. Four shapes were considered.

`AutocompleteContentView extends VanillaView<AutocompleteContentProps>` with a public constructor
`(props, host)` calling `super(props, host)` — the `MenuContentView` precedent
(`Menu/MenuView.ts:61-65`). It appends the header row and `this.list.root` to its own root, which
*is* the host, so `PopoverFloatingView.onMount`'s refusal to append what the factory returns
(`Popover/PopoverView.tsx:76-82`) is satisfied for free.

Why not the alternatives:

- **Its own wrapper root.** A real flex column inserts a box that becomes the popover's sole flex
  item, moving the `overflow: hidden` and shrink semantics down a level; `display: contents`
  preserves layout but the header and the list stop being *direct children* of `.popover-shell`, so
  a `:scope >` query or an agent reading the tree sees something different from React. C3-5 forbids
  both.
- **No wrapper: append a plain header `div` and return the `ListBoxView`.** DOM-identical, but it
  leaves the header element *and* its `fillSlot` React root owned by the long-lived
  `AutocompleteView` while the branch containing them is destroyed by the popover with no
  notification. That is exactly Rule 9's "an unmounted-but-undisposed root keeps its subscriptions
  alive on a detached tree" trap, on the keystroke path.

**Adoption's cost, stated so it stays paid.** Two views share one element, enforced only by
convention. `PopoverFloatingView.applyProps`/`applyVisualState` reassert `dataset.type="popover"`,
`data-name`, `data-scroll`, `data-resizable`, `data-resized`, `data-placement`,
`classList.toggle("scroll-container")` and `style.maxHeight/width/height/zIndex` on **every** update
(`PopoverView.tsx:164-206`), and `updateNativeResizeHandle` appends the resize handle to the same
root *after* the content mounts (`:242`). So the content view must never write `dataset.type`, never
assign `className`, and never call `replaceChildren` on its root. None of those is anything it
wants; the class comment names all three so a later edit cannot make the mistake quietly. (Getting
it wrong fails silently — the popover simply reasserts its attribute on the next update.)

**Updates.** The popover forwards nothing to a content view. `AutocompleteView` therefore keeps a
**bare** reference (a second `child()` claim throws on the shared marker) and pushes a typed props
object from its single `syncChildren()`:

```ts
interface AutocompleteContentProps {
    header: SlotContent;
    headerAction: SlotContent;
    list: ListBoxProps<IListBoxItem>;
}
```

`activeIndex` and the filtered items ride inside `list`, so one push carries both and
`ListBoxView`'s own gate picks `scrollToRowAfterPaint` correctly (Rule 9, "Scrolling after a change
that resizes the content").

**Churn.** Because the derived open condition flips whenever the filter empties, the content view is
built and destroyed during ordinary typing. Each build creates one header host and at most one React
root; disposal runs children first, then the view's FIFO disposers, then `PopoverFloatingView`
detaches the root (`PopoverView.tsx:127`) — so the header's `fillSlot` cleanup runs while the host is
still attached, which is the order `fillSlot` expects.

### D2 — The two `effect()`s are deleted into draft mutators, as US-1017 did

Both are C3-6's "close reset" shape and both were `queueMicrotask`-wrapped React workarounds.

`MultiSelectModel.ts:210` resets `popoverResized` on close. `AutocompleteModel.ts:356` resets
`activeIndex` on close. In each model the reset moves into a `closeInto(s)` **draft mutator** —
a private method that mutates an immer draft and never calls `state.update` itself, so every close
path stays exactly one write (US-1017's `SelectModel.closeInto`, and the reason is the scroll
entry-point choice in Rule 9, not tidiness).

`MultiSelect` close sites: `onPopoverClose`, `onInputKeyDown`'s `Escape`, and **`onChevronClick`,
which is a toggle** (`s.open = !s.open`). The toggle is rewritten as an explicit branch — a draft
mutator cannot be applied to a state whose direction is not yet known, and "reset on the close leg
only" is not expressible in `s.open = !s.open`.

`Autocomplete` close sites: `onPopoverClose`, `commitFromIndex`, and two arms of `onInputKeyDown`
(`Enter`'s submit branch and `Escape`). All but `onPopoverClose` **already** set
`activeIndex = null`, so the deleted effect was doing real work in exactly one place. Routing all
four through `closeInto` makes that visible instead of leaving a reader to check each site.

### D3 — `MultiSelect`'s chevron takes an `IconName` string, not `renderIcon(...)`

`MultiSelect.tsx:118` passes `icon={renderIcon(open ? "chevron-up" : "chevron-down")}`, so every
`MultiSelect` on screen carries a retained React root inside its chevron even while closed. Passing
the bare string takes `IconButtonView.updateIcon`'s `createIconElement` branch and its
applied-icon-name gate (both added in US-1017), so the closed control measures **0**
`[data-part="react-slot"]`. Identical to what US-1017 did for `Select`, and it is why
`IconButtonView` already has the gate this needs.

### D4 — The `Panel` header row becomes a view-owned `div` with its own `data-type`, and the `Spacer` becomes a bare `<span>`

What React emits today for `<Panel direction="row" align="center" paddingY="sm" paddingX="md">`
(`Panel.tsx:352-378`, `tokens.ts:15-23`, `Panel.css:2-6`):

```html
<div class="panel-root" data-type="panel" data-direction="row"
     style="padding-top:4px;padding-bottom:4px;padding-left:8px;padding-right:8px;align-items:center">
```

`data-direction="row"` matches **no** rule (`Panel.css` only styles `column` and the two
`*-reverse` values), and the class contributes only `display: flex` and `box-sizing: border-box`.
So the whole computed box is `display:flex; box-sizing:border-box; align-items:center; padding:4px
8px`. That translates to five declarations in `Autocomplete.css`, values as `var(--space-sm, 4px)`
/ `var(--space-md, 8px)` per C3-8.

**The hook is a root-level `[data-type="autocomplete-header"]`, not a descendant selector.** Finding
3 above is why: the element is portalled out of the `Autocomplete` root. A `[data-type="popover"] >
[data-part="header"]` selector would reach it but would also claim every other component's popover
header, and `data-name` is explicitly not a styling mechanism
([ui-element-contract.md](../../architecture/ui-element-contract.md)). The precedent for a
root-level `data-type` on an element that lives inside someone else's floating branch already
exists: `[data-type="popover-resize-handle"]` (`Popover.css:19`). No collision — the value is new
(38 `data-type` values are in use in `uikit/` CSS today).

**Losing `panel-root` and Panel's `data-*` is not a C3-5 violation, and the evidence is empirical.**
`panel-root` is selected only by `Panel.css` itself and is documented there as a private marker
because `className` is not in `PanelProps`; `ui-element-contract.md` states outright that
`className` is not an addressing mechanism and `data-name` is the handle — and this element has no
`data-name`. `data-direction` is selected only by `Panel.css` and by `Toolbar.css` inside its own
class scope. The one cross-component selector that reaches a `[data-type="panel"]` descendant is
`CollapsiblePanelStack.css`'s `[data-part="header"] [data-type="panel"]`, which cannot reach a node
portalled into the overlay layer. Automation snapshots read `className` only as an overlay-label
fallback, never as a selector. Preserving `panel-root` would instead resurrect a private class whose
only stylesheet is on the removal ledger — a guaranteed dangling reference.

**The `Spacer` is a hand-made `<span data-type="spacer">`**, with `Spacer.css` imported by the view.
`Spacer.css` is one unanchored rule (`[data-type="spacer"] { flex: 1 1 auto; }`), so a hand-made
span inherits it verbatim at any depth, and `SpacerView`'s entire job is translating `name`/`size`
into attributes — neither of which this call site passes. A `child()` claim, a disposal slot and a
prop pump for a no-op is ceremony. The DOM is identical either way: `Spacer` is already
`mountVanilla(SpacerView)`, so React also renders a bare `<span data-type="spacer">`. The borrowed
`Spacer.css` import follows the `Notification`/`SplitButton` precedent — the import line is local
evidence that this view composes that DOM directly.

**Selector-depth scan (C3-8's guard).** The proposed rules contain no `>`, `:empty`, `:nth-child`,
`+` or `~`. Of `Panel.css`'s guarded rules, `:empty` needs `data-hide-when-empty` and
`[data-reveal-on-hover] [data-visibility]` needs an attribute this element never had — neither is
carried. `Popover.css`'s one `>` (`[data-type="popover-resize-handle"] > svg`) is unaffected by a new
sibling under `.popover-shell`, which is `flex-direction: column`, so the header still stacks above
the list.

### D5 — `AutocompleteProps`' four `ReactNode` slots widen to `SlotContent`

`header`, `headerAction`, `startSlot`, `endSlot`. `InputProps.startSlot`/`endSlot` already widened to
`SlotContent` in US-1017, so the two passthroughs are currently *narrower than what they forward
into*; `header`/`headerAction` are filled with `fillSlot`, which accepts `SlotContent` too. A pure
widening breaks no call site (C3-5 holds) and removes a type that lies about what the view accepts.
`emptyMessage` stays `SlotText` — it is forwarded to `ListBoxProps.emptyMessage`, which is `SlotText`.

### D6 — `commitFromIndex`'s `queueMicrotask` is deleted; `focus()` is called inline, and **no** `_suppressFocusOpen` flag is added

The comment says the deferral "defers past the popover close". That reason does not survive reading
the code, in either driver:

- The close is not a focus operation. `PopoverFloatingView.onDispose` removes listeners, cancels
  positioning and detaches its root; it never touches `document.activeElement`
  (`PopoverView.tsx:108-131`).
- The trigger `Input` is a *sibling* of the `Popover`, not inside the closing branch, so detaching
  the branch cannot invalidate `inputRef`.
- Under React the ordering was already the same — a discrete event flushes its update inside the
  root listener, before the microtask checkpoint — so React also ran `focus()` with the branch gone.
  The deferral changed *when* focus landed, never *whether*.

`SelectModel.commitSelection` is the converted precedent and calls `focus()` inline.

**The re-open the flag would prevent is pre-existing, and out of scope.** With `openOnFocus` set, a
*mouse* commit blurs the input (rows are plain `div`s and nothing `preventDefault`s their
`mousedown`; the nearest focusable ancestors are `tabindex="-1"`, which Chromium does focus), so the
subsequent `focus()` fires a real `focus` event, `onInputFocus` calls `tryOpen`, and the dropdown
re-opens. That happens under React today — the microtask delayed it, it never prevented it — and
`Select`'s `_suppressFocusOpen` exists because `SelectModel.onInputFocus` opens
*unconditionally*, where `Autocomplete`'s is gated on a prop no production caller sets. Adding the
flag would be a behaviour change smuggled into a mechanical conversion, so it is recorded as a
follow-up instead, on the same grounds US-1017 deferred its IME finding.

An `Enter` commit never blurs the input, so `focus()` is a no-op there and nothing fires.

**Residual risk, stated.** The deleted microtask also happened to defer past the *consumer's*
re-render: `props.onChange(next)` runs before `focus()`, and a consumer that replaced the input
element in response would leave focus on a detached node. Both `InputView` and React keep a stable
element for a stable position, `KeyValueEditor`'s `keyOptions` does not change on a value edit, and
`Select` already ships the inline call. If it ever bites, the fix is a targeted re-focus at the
consumer, not a blanket deferral inside the primitive.

### D7 — `popoverOpen` becomes a model getter

`Autocomplete.tsx:91` computes it in the render body from a memo (`filtered`), a prop
(`emptyMessage`) and state (`open`). It is logic, and it belongs beside `rowHeight` and
`maxVisibleItems`, which are already getters on `AutocompleteModel`. The view reads
`this.model.popoverOpen` in `popoverProps()`.

### D8 — `MultiSelect`'s dangling `aria-controls` is **fixed**, as its own step

This is a different bug class from US-1017's `aria-expanded` fix. That one was a *fidelity* defect —
`applyRestProps` failed to emit what React emitted — so the migration rule *required* the fix. This
one is a defect in the React original, so a faithful port reproduces it and the rule points the
other way: fixing it produces a snapshot delta the rule nominally forbids.

Fixing anyway, for one decisive reason: **C3-5 obliges every task in this epic to assert that the
aria pairing still resolves**, and for `MultiSelect` that assertion cannot be satisfied by a verbatim
port. A task cannot honour both C3-5's DOM promise and C3-5's acceptance obligation here; the
obligation wins, because a dangling `aria-controls` in the component whose *only* consumer is a story
is a defect nothing will ever surface on its own.

The delta is provably **one attribute on one element**: `id="multiselect-N-popover"` on the
`[data-type="multilistbox"]` root, present only while the dropdown is open. `MultiListBoxProps`
extends `HTMLAttributes` and `MultiListBoxView.restProps` does not destructure `id`, so it lands in
`...rest` then `applyRestProps` then the root, and the inner `ListBox` keeps its own generated
`rootId` (`ListBoxModel.ts:62`), so `aria-activedescendant` and the per-item ids are untouched. No
CSS, automation selector or test reads an id here.

It gets its own implementation step and its own acceptance row so it is visible in review rather
than smuggled into a conversion whose diff is supposed to be empty.

**Not in scope, and not a bug:** both components' `aria-controls` dangle while *closed*, because the
referenced element lives in the conditional floating branch. `Select` behaves identically after
US-1017. That is standard combobox practice and needs no change.

### D9 — One compound `bind` per component, no `DepsGate`, no per-field guards

`MultiSelect`'s state is `{open, popoverResized}`; `Autocomplete`'s is `{open, activeIndex}`. Every
field is a child's prop, which is the case Rule 9 sends to `bind()` — `Tree`'s `mutate()` funnel is
for internal state whose consequence is a render pass the children cannot express, and neither of
these has any. Both bind compounds feed one `syncChildren()`, and both keep `applyRestProps` off the
state path (`data-state` is the one state-derived root attribute and is written from
`syncChildren()`). No `DepsGate`: the inputs that move here are reactive state, and Rule 9 forbids
state in a signature.

## Implementation plan

Order: `MultiSelect` first (it is the simpler of the two and has no new seam), then `Autocomplete`.
Both halves are independent — nothing in `Autocomplete` reads `MultiSelect`.

### Step 1 — `MultiSelect/MultiSelectModel.ts`

1. **Ids.** Rename `_reactId` to `_elementId` and `setReactId` to `setElementId`. `multiSelectId`
   returns `this._elementId` **directly** — the `multiselect-` prefix moves into the view's
   `nextElementId("multiselect")` call. (US-1017 correction 3: leaving the prefix in the getter
   produces `multiselect-multiselect-1`.) `popoverId` stays `` `${this.multiSelectId}-popover` ``.
2. **Draft mutators.** Add two private methods that mutate a draft and never call `state.update`:

   ```ts
   private openInto(s: MultiSelectState): void { s.open = true; }
   private closeInto(s: MultiSelectState): void { s.open = false; s.popoverResized = false; }
   ```

3. **Rewrite every open/close site through them.** `tryOpen` and the `ArrowDown`/`Enter`/`Space` arm
   use `openInto`; `onPopoverClose` and the `Escape` arm use `closeInto`. `onChevronClick` becomes an
   explicit branch:

   ```ts
   onChevronClick = () => {
       if (this.props.disabled) return;
       const open = this.state.get().open;
       this.state.update((s) => (open ? this.closeInto(s) : this.openInto(s)));
       this.inputRef?.focus();
   };
   ```

   Read `open` **before** the update, not from the draft — the draft is the state being written and
   `this.state.get()` inside a producer returns the pre-write value (Rule 9).
4. **Delete `init()` entirely.** The whole body is C3-6 #9, now covered by `closeInto`. Nothing else
   was in it. `grep "this.effect(" MultiSelect/` must return nothing afterwards.
5. **Native event types.** `onChevronMouseDown(e: MouseEvent)` and
   `onInputKeyDown(e: KeyboardEvent)` — the view unwraps `event.nativeEvent`, the
   `PathInputView`/`SelectView` seam. Drop the now-unused `React` import if nothing else needs it
   (`MultiSelectProps` extends `React.HTMLAttributes`, so it stays).
6. **Doc comments.** `resizable`'s "Forwarded to the inner Popover" is still true. Nothing else in
   this file makes a claim the conversion falsifies — check `items`, `value` and the width trio
   against the new view before finishing.

### Step 2 — new `MultiSelect/MultiSelectView.ts`

Model it directly on `Select/SelectView.ts`; the differences are listed here and nowhere else.

- Root `div`, `dataset.type = "multiselect"`, driver from `createComponentModelDriver`, three
  disposers registered in the constructor in the same order as `SelectView` (driver, rest
  listeners, caller-ref cleanup).
- `onMount`: build the chevron first (its root is the input's `endSlot`), then the `InputView`, then
  the `PopoverView`; `applyRoot`; `driver.mount()`; then the compound bind:

  ```ts
  this.bind(
      this.model.state,
      (state) => ({ open: state.open, popoverResized: state.popoverResized }),
      () => this.syncChildren(),
  );
  ```

- `applyRoot(props)`: `data-name`, `data-id` (`this.model.multiSelectId`), `data-disabled`,
  `data-readonly`, inline `width`/`minWidth`/`maxWidth` written with `cssLength` and cleared with
  `""`, then `applyRestProps`. **Not** `data-state` — that is state-derived and belongs in
  `syncChildren()`.
- `syncChildren()`: write `data-state`, then `chevron.update`, `input.update`, `popover.update`, and
  `if (open) this.listView?.update(this.listProps()) else this.listView = undefined`.
- `inputProps()`: `size`, `value: this.model.displayText.value`, `placeholder`, `disabled`,
  **`readOnly: true` unconditionally** (finding 4), `onFocus: this.model.onInputFocus`,
  `onClick: this.model.onInputClick`, `onKeyDown: this.handleInputKeyDown`,
  `aria-haspopup="listbox"`, `aria-expanded: open`, `aria-controls: this.model.popoverId`,
  `aria-label`, `aria-labelledby`, `endSlot: this.chevron.root`, `ref: this.setInputElement`.
- `chevronProps()`: `icon: open ? "chevron-up" : "chevron-down"` (D3), `size: "sm"`, `tabIndex: -1`,
  `disabled: props.disabled` — **not** `|| readOnly`; `Select` disables on both, `MultiSelect` does
  not, and C3-5 says preserve.
- `popoverProps()`: `name: "multiselect-popover"`, `open`, `onClose`, `elementRef: this.root`,
  `placement: "bottom-start"`, `offset: [0, 2]`, `matchAnchorWidth: props.matchAnchorWidth ?? true`
  (a real prop here, unlike `Select` where it is hardcoded), `resizable`, `onResize`,
  `scroll: false`, `outsideClickIgnoreSelector` built from `multiSelectId`, and the `contentView`
  factory that constructs a `MultiListBoxView`, appends its root to the host, stores the bare
  reference and returns it.
- `listProps()` returns `MultiListBoxProps<T>`: `items`, `value`, `onChange`, `disabled`, `readOnly`,
  `filterMode`, `rowHeight`, `maxVisibleItems: popoverResized ? 999 : props.maxVisibleItems`,
  `selectAll`, `selectAllLabel`, `emptyMessage`, `height: popoverResized ? "100%" : undefined`, and
  `id: this.model.popoverId` (Step 5).
- The ref split verbatim from `SelectView`: a stable `setInputElement` field plus
  `syncCallerRef(force)` keyed on `props.ref` identity. Do not inline a merged closure per update.
- `handleInputKeyDown` / `handleChevronMouseDown` as bound fields unwrapping `event.nativeEvent`.
- `restProps(props)` destructures out every named prop, exactly as `SelectView.restProps` does.
  Missing one leaks it onto the root as an attribute.

### Step 3 — new `MultiSelect/MultiSelect.css`

The `Root` Emotion block is three declarations, identical to `Select`'s:

```css
@layer uikit {
    [data-type="multiselect"] {
        display: flex;
        width: 100%;
        min-width: 0;
    }
}
```

Include the same comment `Select.css` carries: `width: 100%` is the cascade default the view must
not overwrite, which is why `applyRoot` writes `""` and not `"100%"` when the prop is absent.

### Step 4 — `MultiSelect/MultiSelect.tsx` becomes a shim

Delete the Emotion import, `Root`, `useId`, `useComponentModel`, `useCallback`, `state.use`, the
destructure and all JSX. What remains is the `mountVanilla` shim plus the type re-export — copy
`Select/Select.tsx`'s 25-line shape, including the `SelectShimProps` generic-ref pattern.

### Step 5 — the `aria-controls` fix (D8)

One line: `id: this.model.popoverId` in `MultiSelectView.listProps()`. Keep it a distinct commit hunk
and mention it in the commit message; it is the task's only intentional DOM delta.

### Step 6 — `Autocomplete/AutocompleteModel.ts`

1. **Ids.** Same rename as Step 1; `autocompleteId` returns `this._elementId`, prefix moves to
   `nextElementId("autocomplete")`. `listboxId` unchanged.
2. **Widen the four slot props to `SlotContent`** (D5) and add
   `import type { SlotContent } from "../shared/fill-slot";`.
3. **`closeInto` draft mutator** and route `onPopoverClose`, `commitFromIndex`, the `Enter` submit
   branch and `Escape` through it:

   ```ts
   private closeInto(s: AutocompleteState): void { s.open = false; s.activeIndex = null; }
   ```

4. **Delete `init()`.** C3-6 #10, now covered.
5. **Delete `commitFromIndex`'s `queueMicrotask`** and call `this.inputRef?.focus()` inline (D6).
   Replace the comment: it must no longer claim to defer past the popover close, and it should say
   why the call is inline and what the residual risk is.
6. **`popoverOpen` getter** (D7):

   ```ts
   get popoverOpen(): boolean {
       const { open } = this.state.get();
       return open && (this.filtered.value.filteredItems.length > 0
           || this.props.emptyMessage != null);
   }
   ```

7. **`onInputKeyDown(e: KeyboardEvent)`** — native. Both `preventDefault` and `stopPropagation`
   exist on the native event, so every arm ports unchanged.
8. **Doc comments.** `openOnFocus`, `header` and `headerAction` all name a "Browser URL bar"
   consumer that does not exist (finding 2). Rewrite them to describe the intended shape without
   asserting a live call site, and note on `header` that the row is styled by
   `[data-type="autocomplete-header"]` because it is portalled out of the component root.

### Step 7 — new `Autocomplete/AutocompleteView.ts`

Two classes in one file.

**`AutocompleteContentView extends VanillaView<AutocompleteContentProps>`** (D1), declared first,
not exported:

- `public constructor(props, host)` → `super(props, host)`. Class comment must state the three
  writes it may never make (`dataset.type`, any `className` assignment, `replaceChildren`) and why.
- `onMount`: create the `ListBoxView` via `this.child(new ListBoxView(props.list))`, append its
  root, mount it, then `this.sync(this.props)`.
- `sync(props)`: create the header row lazily on first need
  (`div[data-type="autocomplete-header"]` containing `headerHost`, `span[data-type="spacer"]`,
  `actionHost` — the two hosts are plain `span`s owned by `fillSlot`); attach it with
  `insertBefore(row, this.list.root)` when `props.header` is present and `remove()` it when not;
  `fillSlot(headerHost, props.header)` / `fillSlot(actionHost, props.headerAction)` each time,
  **never** running the previous cleanup first (Rule 9 / `fill-slot.ts`); then
  `this.list.update(props.list)`.
- Register the two cleanups once in `onMount` with `this.own(() => this.headerCleanup?.())` and
  reassign the stored cleanup on each `fillSlot` call.
- `onUpdate(props)` → `this.sync(props)`.

**`AutocompleteView extends VanillaView<AutocompleteViewProps>`**: the `SelectView` shape, with these
differences:

- No chevron. `onMount` builds the `InputView` and the `PopoverView` only.
- `applyRoot` writes `data-name`, `data-id`, `data-disabled`, `data-readonly` and **no inline
  width** — the width trio goes to `inputProps()` (DOM contract table above). Then
  `applyRestProps`.
- `inputProps()`: `size`, `value: props.value`, `onChange: this.model.onInputChange`, `placeholder`,
  `disabled`, `readOnly`, `autoFocus`, `onFocus`, `onClick`, `onKeyDown: this.handleInputKeyDown`,
  `startSlot`, `endSlot`, `width`, `minWidth`, `maxWidth`, `aria-haspopup="listbox"`,
  `aria-expanded: open`, `aria-autocomplete="list"`, `aria-controls: this.model.listboxId`,
  `aria-label`, `aria-labelledby`, `ref: this.setInputElement`.
- `popoverProps()`: `open: this.model.popoverOpen`, `onClose`, `elementRef: this.root`,
  `placement: "bottom-start"`, `offset: [0, 2]`, `matchAnchorWidth: true`, `scroll: false`,
  `outsideClickIgnoreSelector` from `autocompleteId`, and the `contentView` factory:

  ```ts
  contentView: (host) => {
      const content = new AutocompleteContentView(this.contentProps(), host);
      this.contentView = content;
      return content;
  },
  ```

  Note the absence of a `host.append(...)` — the content view adopts the host, so there is nothing to
  attach. This is the one place `Autocomplete` deviates from `SelectView`'s factory, and the comment
  must say so or a reader will "fix" it back.
- `syncChildren()`: `data-state` from `state.open` (**not** from `popoverOpen` — they differ), then
  `input.update`, `popover.update`, then `if (this.model.popoverOpen) this.contentView?.update(...)`
  else clear the reference.
- `listProps()`: `id: this.model.listboxId`, `items: filteredItems`, `activeIndex`,
  `onActiveChange`, `onChange: this.model.onListChange`, `rowHeight: this.model.rowHeight`,
  `growToHeight: this.model.maxVisibleItems * this.model.rowHeight`, `emptyMessage`,
  `keyboardNav: false`. **No `searchText`** — `Autocomplete` does not highlight matched substrings
  and adding it would be a visual change.
- Same ref split and same `restProps` discipline as Step 2.
- Imports `./Autocomplete.css` **and** `../Spacer/Spacer.css` (D4).

### Step 8 — new `Autocomplete/Autocomplete.css`

```css
@layer uikit {
    [data-type="autocomplete"] {
        display: flex;
        width: 100%;
        min-width: 0;
    }

    [data-type="autocomplete-header"] {
        display: flex;
        box-sizing: border-box;
        align-items: center;
        padding: var(--space-sm, 4px) var(--space-md, 8px);
    }
}
```

The header rule needs a comment recording that it is a verbatim relocation of what `Panel` computed
for `direction="row" align="center" paddingY="sm" paddingX="md"`, that `flex-direction: row` is the
CSS default and therefore omitted, and that the selector is root-level because the element is
portalled into the overlay layer.

### Step 9 — `Autocomplete/Autocomplete.tsx` becomes a shim

As Step 4. This is the line that removes `Panel` and `Spacer` from `uikit/`'s import graph.

### Step 10 — docs

- **`uikit/CLAUDE.md`**, Rule 9 "Structural helpers and React boundaries": extend the `contentView`
  bullet with the third shape — a content view that **adopts** the host, when the popover's content
  is more than one sibling, naming the three writes it must never make and pointing at both
  precedents (`MenuContentView` reads its model live; `AutocompleteContentView` is pushed typed
  props).
- **`uikit/CLAUDE.md`**, styling: one line recording that a component styling an element inside a
  *portalled* branch needs a root-level `data-type` hook, because a descendant selector anchored on
  the component root cannot reach the overlay layer. `[data-type="popover-resize-handle"]` and
  `[data-type="autocomplete-header"]` are the two instances.
- **`EPIC-056.md`**: status to "all six tasks implemented"; the US-1018 row to Implemented with a
  link; a Notes block (effects, the `Panel` eviction, the adopted-host seam, the `aria-controls`
  delta, the closing secondary counts, and the C3-9 Emotion correction to **10**).
- **`doc/active-work.md`**: replace the US-1018 placeholder line with the real linked entry, left
  `[ ]` per the epic's deferred-review model.

## Concerns

1. **The adopted host is a convention, not a constraint.** D1 accepts a shared element. The class
   comment is the whole mitigation, and it fails silently if ignored. Mitigated further by there
   being nothing the content view *wants* to write on the root — but a future "let me tag this for
   styling" edit is exactly the shape that breaks it.
2. **`Autocomplete`'s content view churns on the keystroke path.** The derived open condition
   destroys and rebuilds the branch whenever the filter empties and refills. Each rebuild constructs
   a `ListBoxView` and a `VirtualGrid`. That is what React did too (the popover children remounted),
   so it is not a regression — but if the Rule 4 style measurement is ever repeated on this
   component, this is the first thing to look at.
3. **`MultiSelect` has no production call site, so the story is the only exposure.** C3-10 and the
   epic's Verification section both say so; repeating it here so it is not discovered at review. The
   `resizable` + `popoverResized` path in particular (`maxVisibleItems: 999`, `height: "100%"`) has
   never run outside a story.
4. **`header`/`headerAction` are only reachable from the story.** The `Panel` translation in D4 is
   therefore verified against a story toggle, not against a consumer. If the intended Browser URL bar
   consumer ever lands and wants different padding, it needs an `Autocomplete` prop — Rule 7 forbids
   Emotion at the app layer, and `@layer uikit` gives it a fixed value it cannot override.
5. **Deleting `Autocomplete`'s focus microtask changes timing** (D6's residual risk). The failure
   mode is a dead Tab after a mouse commit, with no error. The manual check is in the acceptance
   criteria.
6. **`onChevronClick`'s toggle rewrite is the only place a behaviour could shift silently.**
   Reading `open` before the write instead of negating inside the draft is equivalent *only* because
   nothing else writes `open` between the read and the update; `TOneState.update` is synchronous, so
   nothing can. Stated because the equivalence is not visible from the diff.

## Acceptance criteria

### Static

- `npx tsc --noEmit` clean; `npm run lint` clean; `git diff --check` clean.
- `grep -rn "this.effect(" MultiSelect/ Autocomplete/` → **nothing**. Both `init()`s gone.
- `grep -rn "queueMicrotask(" MultiSelect/ Autocomplete/` → **nothing**. (Bare `queueMicrotask`
  still appears in both models' comments, which record what the deleted effect used to do on one —
  grep for the call, not the word.)
- `grep -rln "@emotion" src/renderer/uikit --include=*.ts --include=*.tsx` → **10** production files
  (9 `AVGrid/` + `RenderGrid/RenderGrid.tsx`), plus `Tree/Tree.story.tsx`, which is a story and
  outside the production count. This is C3-9's corrected target.
- `grep -rn "Panel" src/renderer/uikit --include=*.ts --include=*.tsx | grep -v "^src/renderer/uikit/Panel/" | grep -v story` → **nothing**. `Panel` consumers inside `uikit/` reach **0**.
- `grep -rn "s.open = " MultiSelect/` → the two draft mutators only. **`Autocomplete` keeps four
  `s.open = true` sites** and that is correct: it has no `openInto`, because each of its open paths
  seeds `activeIndex` differently (`null` from `tryOpen` and `onInputChange`, `0` from ArrowDown,
  last row from ArrowUp), so a single mutator would have to take the seed as a parameter and would
  buy nothing. Only closing is uniform, which is why only `closeInto` exists.
- No `DepsGate`, no `mutate()`/`onStateApplied`, no per-field `last*` guards in either view.
- Both `*.story.tsx` and `editors/rest-client/KeyValueEditor.tsx` unchanged.

### Runtime — `MultiSelect` (story)

- Closed: `div[data-type="multiselect"][data-name][data-id="multiselect-N"][data-state="closed"]` →
  `[data-type="input"]` → `input[readonly]` + `[data-part="end-slot"]` → `[data-type="icon-button"]`
  → `svg`. **`[data-part="react-slot"]` count 0** (D3 is what makes this true).
- Open: the popover's only direct child is `[data-type="multilistbox"]`, and it carries
  `id="multiselect-N-popover"` (D8), so the trigger's `aria-controls` **resolves**. Search box,
  tri-state select-all and checkbox rows all behave; `aria-expanded="true"`.
- Toggling a row calls `onChange` with the new array and leaves the dropdown open; the trigger text
  follows `formatSelection` (both story variants).
- `resizable`: dragging the handle sets `popoverResized`, after which the list takes `height: 100%`
  and `maxVisibleItems: 999`; **closing and reopening resets it** — that is the deleted effect's job,
  now done by `closeInto`. Verify explicitly through all three close paths: outside click
  (`onPopoverClose`), `Escape`, and the chevron.
- `disabled` refuses to open and disables the chevron; `readOnly` **still opens** and leaves the
  chevron enabled (finding 4) — assert the asymmetry rather than "fixing" it.
- Unmounting while open leaves `#persephone-overlay-layer` empty.

### Runtime — `Autocomplete` (story + `KeyValueEditor`)

- Typing filters the list; `data-state="open"` while the popover exists, and — with
  `withEmptyMessage` off — typing a non-matching query leaves `data-state="open"` with **no**
  floating branch. With it on, the branch stays and shows the empty message.
- `header` on: the popover's first direct child is
  `div[data-type="autocomplete-header"]`, followed by `[data-type="list-box"]`, with the
  header's computed style `display: flex`, `align-items: center`, `padding: 4px 8px` — the D4 numbers
  measured, not assumed. `headerAction` sits after a `span[data-type="spacer"]` with
  `flex: 1 1 auto`, so it is right-aligned.
- Toggling `withHeader` off while open removes the row and leaves the list in place; toggling it on
  re-inserts it **above** the list.
- Keyboard: ArrowDown/ArrowUp open with the right seed, PageDown/PageUp step by 9, Home/End,
  `Enter` on a highlighted row commits, `Enter` with nothing highlighted fires `onSubmit`, `Escape`
  fires `onEscape` and closes. `aria-activedescendant` resolves to a live row id at each step.
- `aria-controls="autocomplete-N-listbox"` resolves to the `[data-type="list-box"]` root while open.
- Commit by mouse: `onChange` fires with the commit string, the popover closes, focus is on the
  `<input>` **synchronously**, and pressing Tab moves to the next control. Repeat with
  ArrowDown+Enter. With `openOnFocus` on, note (do not fix) whether the mouse commit re-opens —
  D6 predicts it does, as it does under React.
- `KeyValueEditor` in a `.rest.json` page: the key column's autocomplete suggests header names,
  commits on click and on Enter, and Tab moves to the value cell.
- Unmounting while open leaves the overlay layer empty and no stray `[data-type="autocomplete"]`.

### Both

- `browser_snapshot` before and after, diffed on `data-*` output. The **only** expected delta across
  both components is D8's single `id` attribute; everything else must be identical, including the
  disappearance of the chevron's `react-slot` in `MultiSelect` being the *absence* of a node React
  created rather than a changed attribute.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/MultiSelect/MultiSelectModel.ts` | id rename, `openInto`/`closeInto`, explicit chevron toggle, `init()` deleted, native event types |
| `src/renderer/uikit/MultiSelect/MultiSelectView.ts` | **new** — the vanilla view |
| `src/renderer/uikit/MultiSelect/MultiSelect.css` | **new** — the `Root` block, three declarations |
| `src/renderer/uikit/MultiSelect/MultiSelect.tsx` | 161 lines → `mountVanilla` shim + type re-export |
| `src/renderer/uikit/Autocomplete/AutocompleteModel.ts` | id rename, `SlotContent` widening, `closeInto`, `init()` deleted, inline focus, `popoverOpen` getter, native event type, doc comments |
| `src/renderer/uikit/Autocomplete/AutocompleteView.ts` | **new** — `AutocompleteContentView` + `AutocompleteView` |
| `src/renderer/uikit/Autocomplete/Autocomplete.css` | **new** — root block + the relocated `Panel` header rule |
| `src/renderer/uikit/Autocomplete/Autocomplete.tsx` | 162 lines → shim; removes `Panel` and `Spacer` from `uikit/`'s graph |
| `src/renderer/uikit/CLAUDE.md` | `contentView` adopted-host shape; portalled-element styling hook |
| `doc/epics/EPIC-056.md` | status, task row, Notes, C3-9 Emotion target corrected to 10 |
| `doc/active-work.md` | US-1018 entry |

## Corrections to this plan, made during implementation

Three places where the plan was wrong or incomplete.

1. **Two acceptance greps were unsatisfiable as written** and are corrected above: `queueMicrotask`
   still appears as a *word* in both models' comments (which is the point — they record what the
   deleted effect used to do), and `Autocomplete` legitimately keeps four `s.open = true` sites
   because it has no `openInto`. Only the close path is uniform enough for a mutator.
2. **`Panel` consumers inside `uikit/` reach zero in *production* only.** The plan and C3-9 both read
   as though the count going to 0 makes `Panel` deletable. It does not: **30 `uikit/` stories import
   `Panel` as their layout host.** The epic's C3-9 row now says so, and the story sweep belongs to
   Epic F's ledger entry rather than to C3.
3. **The `Autocomplete` header row needs two slot hosts, which React did not have.** `fillSlot` owns
   the host element it is given, so `header` and `headerAction` each need one. Both are `display:
   contents` (set inline, following `fillSlot`'s own React container), so the content stays a flex
   item of the row exactly as React's direct children were — measured, not assumed. The extra spans
   are the sanctioned migration seam, the same one `[data-part="react-slot"]` is.

## Verification record (2026-08-22)

### Static

- `npx tsc --noEmit` clean; `npm run lint` clean.
- `grep "this.effect(" MultiSelect/ Autocomplete/` → **nothing**. Both `init()`s gone; C3's ten-effect
  ledger is closed.
- `grep "queueMicrotask(" MultiSelect/ Autocomplete/` → **nothing**.
- `@emotion` importers in `uikit/`: **10** production (9 `AVGrid/` + `RenderGrid/RenderGrid.tsx`),
  plus `Tree/Tree.story.tsx`. C3-9's corrected target, hit.
- `Panel` imported by **no** production file in `uikit/` — only 30 stories and the barrel.

### Runtime — `MultiSelect`

Driven through an offscreen React root (`mountReactHandle`, React taken from Vite's pre-bundled dep so
the probe shares the app's instance), 50 items, `selectAll` and `resizable` on.

- Closed: `div[data-type="multiselect"][data-name][data-id="multiselect-N"][data-state="closed"]` →
  `[data-type="input"][data-readonly]` → `input[readonly][aria-expanded="false"]` +
  `[data-part="end-slot"]` → `[data-type="icon-button"]` → `span[data-part="icon"]` → `svg`.
  **`[data-part="react-slot"]` count 0** — D3 is what makes that true.
- Open: popover children are exactly `[multilistbox, popover-resize-handle]`; popover 402px against a
  400px anchor; listbox 240px with 11 rows for `maxVisibleItems` 10 × 24; search box and tri-state
  select-all present; **0 react-slots in the dropdown with 50 items**.
- **D8 verified:** `aria-controls="multiselect-N-popover"` resolves, and its target is the
  `[data-type="multilistbox"]` root.
- Selection is additive across separate frames (`[5]` → `[5,2,7]`, trigger `"(3) selected"`, three
  rows `aria-selected`). Two clicks dispatched in *one* task produce one net change — a probe
  artifact of `MultiListBox` deriving the next array from `props.value`, not a component defect.
- **The deleted effect, exercised.** A real pointer drag on the resize handle (dispatched on the
  popover root, which is where `PopoverModel` listens after `setPointerCapture`) grows it to 468×450
  with the listbox at 396px / 17 rows. Closing and reopening resets it to 240px / 11 rows through
  **all three** paths — `Escape`, the chevron toggle, and outside click.
- `disabled`: `data-disabled`, input disabled, chevron disabled, does not open. `readOnly`:
  `data-readonly`, input **not** disabled, chevron **not** disabled, and it **opens**. The input is
  `readOnly` in all three states. Finding 4's asymmetry, asserted rather than reconciled.
- Disposal while open → overlay layer empty, no stray `[data-type="multiselect"]`.

### Runtime — `Autocomplete`

- Closed: `data-id="autocomplete-N"`, `aria-autocomplete="list"`,
  `aria-controls="autocomplete-N-listbox"`, and **no inline style on the root** — `width: 360`
  arrived as `--input-width: 360px` on the inner `[data-type="input"]`, whose box measures 360px.
  The React forwarding preserved.
- Typing `acc` → popover whose only direct child is `[data-type="list-box"]`, 3 rows
  (`Accept`, `Accept-Charset`, `Accept-Encoding`), `aria-controls` resolving.
- **The derived-open divergence:** `zzz` with no `emptyMessage` → `data-state="open"` and **no
  floating branch**. With an `emptyMessage` → branch present, 0 rows, the node rendered.
- **The header row, measured.** Popover children `[autocomplete-header, list-box]`, header first;
  `getComputedStyle` gives `display: flex`, `align-items: center`, `padding: 4px 8px`,
  `box-sizing: border-box`, `flex-direction: row` — exactly what `Panel` computed. The spacer reads
  `flex: 1 1 auto` from the borrowed `Spacer.css`, and the action element sits flush against its right
  edge (0px gap), so it is right-aligned.
- A keystroke rebuilds **neither** the header row nor the list element (same objects) and adds no
  React root — `fillSlot` reuses both. Toggling `header` off while open removes the row and leaves the
  list element identical; toggling it on re-inserts it **above** the same list element.
- Keyboard: ArrowDown seeds row 0, ArrowDown advances, `End` → last, `Home` → first, `PageDown`
  clamps, and `aria-activedescendant` resolves to a live row id derived from `listboxId` at every
  step. `Enter` on a highlight commits and closes with focus retained; `Enter` with no highlight fires
  `onSubmit`; `Escape` fires `onEscape` and closes.
- **D6 verified:** a row click leaves the popover already removed, `onChange` already fired and focus
  already on the `<input>` — all observed *before* any await, i.e. synchronously.
- `openOnFocus`: focusing the input opens the dropdown.
- Disposal while open → overlay layer empty, no stray `[data-type="autocomplete"]` and no orphaned
  `[data-type="autocomplete-header"]`.

### Runtime — the production consumer

A `.rest.json` page's `KeyValueEditor`: `[data-name="kv-row-key"][data-type="autocomplete"]` at
`data-size="sm"`, typing `cont` suggests four header names, `aria-controls` resolves, and clicking a
row lands the value with the popover gone and focus on the input synchronously. The probe page was
closed (declining the save prompt) and the user's four original pages left untouched; overlay layer
empty, no strays.

### Not verifiable synthetically

The `openOnFocus` mouse-commit re-open (D6). A dispatched `click` does not move focus the way a real
mousedown does, so the probe cannot make the input lose focus in the first place — which is also why
the behaviour is recorded as a pre-existing follow-up rather than asserted either way.
