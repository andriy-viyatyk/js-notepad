# US-1016 — `MultiListBox` vanilla conversion

**Epic:** [EPIC-056 — De-React C3](../../epics/EPIC-056.md)
**Status:** Implemented 2026-08-22

## Goal

Convert `MultiListBox` from a React component to a `VanillaView`, and in the same task remove its
use of `ListBox`'s `renderItem` escape hatch so that no consumer of that hatch remains inside
`uikit/`.

## Background

### The surface, measured

| File | Lines | What it holds |
|---|---|---|
| `src/renderer/uikit/MultiListBox/MultiListBox.tsx` | 319 | Props interface, five Emotion blocks, the component |
| `src/renderer/uikit/MultiListBox/MultiListBoxModel.ts` | 151 | Five `memo()`s, **zero** `effect()`s, two state writers, three commands |
| `src/renderer/uikit/MultiListBox/MultiListBox.story.tsx` | 89 | Storybook demo, 10 controls |
| `src/renderer/uikit/MultiListBox/index.ts` | 2 | Barrel |

Five Emotion blocks: `Root`, `SearchRow`, `SelectAllRow`, `ItemRow`, `ListWrapper`.

### The model needs no shedding

`MultiListBoxModel` registers **no** `effect()` (`MultiListBoxModel.ts:63-151`), so
`createComponentModelDriver` accepts it as-is — `mount()` only throws for a model with effects
(`core/state/model.ts:305-310`). Its five memos stay: `resolvedItems`, `selectedKeys`, `filtered`,
`listBoxItems`, `visibleSelectedCount`, plus the two derived getters `allVisibleSelected` /
`someVisibleSelected`.

The two state writers (`setSearchText`, `setActiveIndex`, `MultiListBoxModel.ts:118-124`) write
through `this.state.update`, which notifies its listeners **synchronously**
(`core/state/state.ts:66-73, 121-130`).

### Everything it composes is already vanilla

- `Input` → `InputView` (`uikit/Input/InputView.tsx`), `Input.tsx` is a `mountVanilla` shim.
- `ListBox` → `ListBoxView` (`uikit/ListBox/ListBoxView.ts`), converted in US-1014.

So `MultiListBoxView` can own both as real child views (`VanillaView.child()`), with no React root
anywhere in the component once the rows stop going through `renderItem`.

### The `renderItem` obligation from US-1014

`MultiListBox.tsx:275-311` passes an inline `renderItem` arrow to `ListBox`. In the converted
`ListBoxView` that is the `"custom"` cell kind (`ListBoxView.ts:340-352`), which routes the returned
node through `fillSlot` — i.e. **one retained React root per visible row**. Removing it is what makes
every remaining `renderItem` consumer app-layer; verified by grep, the others are
`components/tree-provider`, `editors/notebook`, `editors/rest-client`, `editors/board`,
`editors/tools`, `ui/sidebar` — all scheduled for Epics D/E.

### The `ItemRow` CSS vs `ListItem.css`, rule by rule

| `ItemRow` (Emotion, `MultiListBox.tsx:132-181`) | `[data-type="list-item"]` (`ListItem.css`) |
|---|---|
| `display: inline-flex; width: 100%; box-sizing: border-box; align-items: center` | identical |
| `gap: gap.md` (6px) | `gap: var(--gap-md, 6px)` — identical |
| `padding-left/right: spacing.sm` (4px) | identical |
| `cursor: pointer; color: text.default; overflow: hidden` | identical |
| `&[data-disabled] { opacity: .4; pointer-events: none }` | identical |
| `&[data-active] { background: bg.message }` | `[data-variant="browse"][data-active], …:hover` — same colour, plus a hover arm |
| `& > svg { 16x16; flex-shrink: 0 }` (the item icon) | `> [data-part="icon"] > svg` — same size, via the slot host |
| `& [data-part='label'] { flex 1 1 auto; min-width 0; nowrap; ellipsis }` | `> .label` — identical |
| `[data-part='check']` block (16x16, `text.light`; `text.default` on hover / active / checked) | **no equivalent — this is the new part** |

The extra `:hover` arm in `variant="browse"` is not a visual change here: `MultiListBox` passes
`onActiveChange={model.setActiveIndex}` and `ListBoxModel.onItemMouseEnter` sets `activeIndex` on
mouseenter (`ListBoxModel.ts:135-139`), so hover and active already coincide on enabled rows; on
disabled rows `pointer-events: none` means `:hover` can never match.

### DOM contract

`data-type="multi-list-item"` and `data-type="multilistbox-select-all"` have **no** references
anywhere outside `MultiListBox.tsx` — grepped across `src/`, `doc/`, `docs/`, `qa/`, `assets/`,
`boards-assets/`.

### Consumers (both stay React; the shim keeps them working)

- `src/renderer/uikit/MultiSelect/MultiSelect.tsx:141-155` — inside a `Popover`, passes
  `height="100%"` when the popover was resized and `maxVisibleItems={999}`.
- `src/renderer/uikit/AVGrid/filters/OptionsFilterContent.tsx:146-152` — `selectAll`,
  `height="100%"`, `name="avgrid-options-filter"`. Its labels are strings —
  `TDisplayOption.label` is typed `string` (`AVGrid/avGridTypes.ts:80`); the `React.ReactNode` in
  its own `onChange` signature (`OptionsFilterContent.tsx:112`) is incidental. The label path still
  needs a non-string arm because `IListBoxItem.label` is public API, but no current call site
  exercises it.

### Existing infrastructure to reuse (do not rebuild)

| Need | Use |
|---|---|
| Lifecycle, child ownership, listeners, state binding | `VanillaView` (`shared/vanilla-view.ts`) |
| Model without React | `createComponentModelDriver` (`core/state/model.ts:278`) |
| React-shaped rest props / events | `applyRestProps`, `toPublicEvent` (`shared/react-compat.ts`) |
| DOM icon, no React root | `createIconElement` (`shared/slots.ts:47`) — `checked` / `unchecked` / `indeterminate` are all string-body icons and therefore have DOM builders (`theme/icons.tsx:378-388`) |
| String-label highlighting | `highlightInto` (`shared/highlight.ts:40`) |
| Node/React slot | `fillSlot` (`shared/fill-slot.ts`) |
| Repaint gate | `createDepsGate` (`shared/deps-gate.ts`) |
| React call sites | `mountVanilla` (`shared/mount.tsx`) |

### Files that need NO changes

- `src/renderer/uikit/MultiSelect/*` — consumes the React shim only.
- `src/renderer/uikit/AVGrid/filters/OptionsFilterContent.tsx` — same.
- `src/renderer/uikit/VirtualGrid/*` — `scrollToRowAfterPaint` already exists (US-1015).
- `src/renderer/uikit/Input/*` — already vanilla.
- `src/renderer/core/state/*` — no primitive changes needed.
- `src/renderer/uikit/shared/*` — no new shared helper is required.

## Decisions

Three questions went to independent review. The reasoning was weighed against the code; where it
was wrong on a fact, the decision follows the code and the correction is recorded here.

### D1 — The rows become ordinary `ListItem` rows with a leading checkbox

`ListItemProps` gains `checkbox?: boolean`; `ListBoxProps` forwards it; `MultiListBox` passes no row
renderer at all.

`ListItemView` is already documented as the single source of truth for the row's DOM
(`ListItemView.ts:18-37`), and a checkbox row differs from a `ListItem` by **one leading glyph**.
Everything else it needs already exists there and would have to be re-implemented in any new row
class: `applyRestProps`, the unconditionally-attached tooltip (`ListItemView.ts:75`), the
string-label `highlightInto` path (`:156-169`), the icon-name→`svg` path with no React root
(`:144-154`), and the `update()` contract the cell pool depends on (`ListBoxView.ts:337`).

Rejected: a vanilla row-view hook on `ListBoxView` (a second row implementation to keep in sync, and
US-1014 already rejected a `renderItemDom` prop on the same grounds), and driving `VirtualGridView`
from `MultiListBoxView` (re-implements the three arms, the engine create/dispose, the pool's kind
branching, `aria-activedescendant`, and the two scroll entry points — ~490 lines, to change one
glyph).

Also rejected: passing a `DocumentFragment` of two `svg`s as `item.icon`. It works mechanically, but
`IconRef = IconName | ReactNode` (`shared/slots.ts:6`) makes a DOM node type-unclean and it would put
live DOM nodes inside item *data*, rebuilt on every selection change.

**Correction to the review's arithmetic.** It claimed this removes "two React roots per row". It
removes **one** — the custom row is a single `fillSlot` root per cell (`ListBoxView.ts:340-352`), and
the `highlight()` nodes render *inside* that same root. The win is one root per visible row, not two.

### D2 — The `browse` hover background is carved out for checkbox rows

`variant="browse"` is the correct variant (its `[data-active]` rule is byte-identical to `ItemRow`'s),
but it also paints `:hover` (`ListItem.css:44-46`) and `ItemRow` has **no** hover background rule.

For the mouse the two are indistinguishable — `MultiListBox` sets `activeIndex` on mouseenter, so
hover and active coincide, and a disabled row's `pointer-events: none` matches neither. They diverge
in exactly one state: keyboard navigation moves `activeIndex` while the pointer rests on a different
row (or rows scroll under a stationary pointer, which fires no mouseenter). Today one row is
highlighted; with the browse hover, two would be.

The row writes `data-checkbox` when `checkbox` is true, and the browse hover rule is gated with
`:not([data-checkbox])`. The epic's rule for a conversion is faithfulness — a visual improvement is a
separate, visible decision, exactly as US-1015 preserved two CSS defects rather than fixing them
mid-conversion. `data-checkbox` also replaces the retired `data-type="multi-list-item"` as the row's
addressable marker.

### D3 — `checkbox` suppresses the default trailing selection icon

A checkbox row shows its selected state in the leading box, so `ListItemView.setTrailing` must not
also render the trailing check. A caller-supplied `item.trailing` still wins, as it does today.

This avoids plumbing `showSelectionIcon` through `ListBoxProps` (it exists on `ListItemProps` only,
`ListItem.tsx:67`) — one flag, one meaning.

### D4 — Selection repaints through a memoized `isSelected` identity

`MultiListBoxModel.isSelected` becomes a `memo` whose deps are
`[this.selectedKeys.value, this.resolvedItems.value]`.

Today it is a stable bound method (`MultiListBoxModel.ts:126`). `MultiListBox` never passes `value`
to `ListBox`, so **no slot** in `repaintSignature()` moves when the user checks a row: `items` comes
from `listBoxItems` (deps `[props.items, filtered.sources]`, untouched by selection), `activeIndex`
and `searchText` are unchanged, `renderItem` is gone, and `selectedKey` is null. The gate would
report no change, `grid.model.update({all: true})` would never run, and the checkbox would stay stale
until the user moved the mouse — the §6.1 masked defect, in its self-healing form.

The predicate *is* the only thing `ListBox` can legally observe about a parent-owned selection
(`types.ts:79-85`), so making its identity track the selection makes the existing `isSelected` slot
truthful rather than permanently frozen. It satisfies the signature's own rules: fixed length, no
reactive state, and "compare the memo output when the memo genuinely derives something."

Cost is bounded: `props.isSelected` is read in exactly two places — live inside `isSelectedAt`
(`ListBoxModel.ts:103`, not memoized on it) and the signature slot (`:258`). It is not a dependency
of `resolved`, `selectedKey`, `gridProps`, or the engine's `inputChanged()`. So a moved identity buys
exactly one repaint and nothing else.

Rejected: a `revision`/`renderKey` prop (a proxy for a signal that already has a channel, whose
failure mode is a forgotten bump with no compiler or runtime signal), and a public
`ListBoxView.repaint()` (moves the repaint decision outside the one place that owns it, violates the
`DepsGate` "at most once per update" rule, and becomes the escape hatch used instead of adding a
missing slot).

Both current consumers already memoize their `value` array (`OptionsFilterContent.tsx:106-111`,
`MultiSelect.tsx:143`), so no normalised-key dep is needed. If a future consumer churns `value`
identity per render, the fix is local: interpose a sorted-key string as the memo's dep, following the
`selectedKey` precedent.

`props.checkbox` is added as a **tenth** signature slot — it changes cell DOM, which is exactly the
admission test.

### D5 — State is read with one compound `bind`, not a `mutate`/`onStateApplied` funnel

`MultiListBoxView` binds the pair `{ searchText, activeIndex }` and applies it through a single
private `syncChildren()`, the shape `MenuView` already uses (`Menu/MenuView.ts:87-91`).

`Tree`'s funnel exists for conditions that are all absent here. Tree has ~8 write sites across three
files and its state is *internal* — no child takes it as a prop, and the consequence is a whole
render pass including root attributes (`aria-activedescendant`). `MultiListBoxModel` has **two** write
sites, both two-line setters in one file, and both fields are literally child props. Rule 9 says it
directly: "State-driven arms belong in `bind()`." Rule 9's "why not a subscription" argument is about
a state-driven *blanket repaint*, not about a state field that is a child's prop.

`bind` also filters through `compareSelection` (`state.ts:138-150`), which compares a plain object
key-wise — so a no-op write costs nothing, where `mutate()` would run the full consequence
regardless. And it applies once immediately at install, seeding the first sync for free.

Three rules come with it:

1. **Both paths call the same `syncChildren()`.** The tri-state header derives from `filtered`, whose
   deps include `state.searchText`, *and* from `props.value` — so narrowing the filter can flip the
   header with no prop change at all. A bind that updated only the Input and the ListBox would
   reproduce the masked defect inside this very task.
2. **No per-field guards (`lastSearchText`, `lastActiveIndex`) in this view.** A guard maintained on
   one of the two paths either re-pushes forever or skips a needed push. The children's own gates
   absorb the duplicate: `InputView` writes `field.value` only when it differs, and `ListBoxView`
   gates on its `DepsGate` and `lastActiveIndex`.
3. **`applyRestProps` stays off the state path** (Rule 9). Root attributes and rest props are written
   from `onUpdate` only; `syncChildren()` touches children and the select-all row.

The duplicate push on keyboard nav is real and harmless: `ListBoxModel.onKeyDown` calls
`onActiveChange` and then `gridRef.scrollToRow(target)`, so the re-entrant parent sync issues an
identical scroll request to the same target first.

### D6 — The select-all row is inline DOM in `MultiListBoxView`

Not its own view class. Every `*View` in `uikit/` has a matching public `.tsx` face — verified, with
`VirtualGrid/VirtualGridView.ts` the single documented exemption — and a view class with no face
would be the second exception in the library without earning it. Non-reusable subelements are built
inline with `data-part` throughout: `ListBoxView`'s message host, `InputView`'s slots,
`BreadcrumbView`'s segments. Separate row classes exist only where the thing is a pooled, recycled
row primitive with a public face; the select-all row is a single instance, never recycled.

Specifics:

- `data-type="multilistbox-select-all"` is **kept** — it is already in the shipped DOM.
  `data-part="select-all"` is added for the parent's own selectors.
- The tri-state value is computed **once** into `"true" | "mixed" | "false"` and written to both
  `data-checked` and `aria-checked`. The React version computes it three times
  (`MultiListBox.tsx:271-277`).
- The glyph is `createIconElement("checked" | "indeterminate" | "unchecked")` — direct DOM, never
  `fillSlot` (Rule 9: an `IconName` becomes an `svg` with no root). Unlike `CheckboxView.updateIcon`,
  the swap is **gated on the applied value**, so a re-sync does not rebuild the `svg`.
- `CheckboxView` is not reusable here: `Checkbox` has no indeterminate/`mixed` state at all.

### D7 — `ListBoxState.revision` is left in place with a warning comment

It is dead (`ListBoxModel.ts:19-22`; nothing reads or writes it) and it is exactly the trap D4
rejects — a state slot in a repaint signature is dead code in a vanilla driver. Deleting it would
leave an empty state interface for no gain, so it gets a one-line comment instead.

### D8 — `ListBoxProps.isSelected`'s doc comment is rewritten

`types.ts:79-85` currently says the predicate "does NOT introduce multi-select semantics — only one
row should typically return `true`." With `checkbox` that is no longer true. The rewrite states the
actual contract: the flag is **presentational**; `ListBox` still emits one `onChange(source)` per
click (`ListBoxModel.ts:126-131`) and the caller owns the set.
## Implementation plan

### Step 1 — `ListBox/ListItem.tsx`: the new prop

Add after `showSelectionIcon`:

```ts
    /**
     * Renders a leading checkbox glyph reflecting `selected`, and suppresses the default trailing
     * selection icon (the leading box already says it). A caller-supplied `trailing` still wins.
     *
     * Presentational only — it does not change how the row reports clicks. The owner of a
     * multi-select set drives it through `ListBox`'s `isSelected` predicate.
     */
    checkbox?: boolean;
```

### Step 2 — `ListBox/ListItemView.ts`: the check host

New fields beside the other hosts:

```ts
    private checkHost!: HTMLSpanElement;
    private checkGlyph: SVGElement | undefined;
    /** Last value written to the glyph, so a re-render does not rebuild the `svg`. */
    private appliedChecked: boolean | undefined;
```

`onMount` — create the host but do not attach it (the row has no checkbox by default):

```ts
        this.checkHost = document.createElement("span");
        this.checkHost.dataset.part = "check";
```

It is a **real box** (`inline-flex`, 16x16, `flex-shrink: 0`), unlike the `display: contents` icon and
trailing hosts, because the Emotion block it replaces gave `[data-part='check']` its own size.

`applyProps` — destructure `checkbox`, then, before `setIcon`:

```ts
        toggleAttr(root, "data-checkbox", !!checkbox);
        …
        this.setCheck(!!checkbox, !!selected);
        this.setIcon(icon);
        this.setLabel(label, searchText);
        this.setTrailing(trailing, selected, showSelectionIcon, selectionStyle, !!checkbox);
```

New method — the glyph is direct DOM (no `fillSlot`), and the swap is gated:

```ts
    /**
     * A checkbox row's leading glyph. `createIconElement` is used directly rather than `fillSlot`
     * because an `IconName` never needs a React root, and the gate on `appliedChecked` is what keeps
     * a scroll from rebuilding an `svg` per pooled cell per repaint.
     */
    private setCheck(enabled: boolean, checked: boolean): void {
        if (!enabled) {
            if (this.checkGlyph) {
                this.checkHost.remove();
                this.checkHost.replaceChildren();
                this.checkGlyph = undefined;
                this.appliedChecked = undefined;
            }
            return;
        }
        if (!this.checkHost.isConnected) {
            this.root.insertBefore(this.checkHost, this.iconHost);
        }
        if (this.appliedChecked === checked && this.checkGlyph) return;
        const next = createIconElement(checked ? "checked" : "unchecked");
        if (this.checkGlyph) this.checkHost.replaceChild(next, this.checkGlyph);
        else this.checkHost.append(next);
        this.checkGlyph = next;
        this.appliedChecked = checked;
    }
```

`setTrailing` gains the parameter and the default-icon branch requires `!checkbox`:

```ts
        // before
        if (selected && showSelectionIcon && selectionStyle !== "focus") {
        // after
        if (selected && showSelectionIcon && selectionStyle !== "focus" && !checkbox) {
```

### Step 3 — `ListBox/ListItem.css`: check rules and the hover carve-out

Gate the browse hover (D2):

```css
/* before */
[data-type="list-item"][data-variant="browse"][data-active],
[data-type="list-item"][data-variant="browse"]:hover {

/* after */
[data-type="list-item"][data-variant="browse"][data-active],
[data-type="list-item"][data-variant="browse"]:not([data-checkbox]):hover {
```

with a comment naming the reason: a checkbox row sets `activeIndex` on mouseenter, so hover feedback
already arrives through `[data-active]`; keeping the `:hover` arm as well would highlight two rows at
once when the keyboard moved the active row away from the pointer, which the row this replaced never
did.

Add, after the icon-sizing block (translated from `MultiListBox.tsx:156-171`, following
`Checkbox.css:10-24`):

```css
    [data-type="list-item"] > [data-part="check"] {
        display: inline-flex;
        flex-shrink: 0;
        width: var(--size-icon-md, 16px);
        height: var(--size-icon-md, 16px);
        color: var(--color-text-light, currentColor);
    }

    [data-type="list-item"]:hover > [data-part="check"],
    [data-type="list-item"][data-active] > [data-part="check"],
    [data-type="list-item"][data-selected] > [data-part="check"] {
        color: var(--color-text-default, currentColor);
    }

    [data-type="list-item"] > [data-part="check"] > svg {
        width: var(--size-icon-md, 16px);
        height: var(--size-icon-md, 16px);
    }
```

The three brightening arms are the old `&:hover`, `&[data-active]` and `&[data-checked]` — the last
one becomes `[data-selected]`, which is the same information under `ListItem`'s vocabulary. The colour
is set explicitly (not inherited) exactly as before, so a `variant="select"` row's hover text colour
cannot bleed into the box.

### Step 4 — `ListBox/types.ts`: forward the prop, fix the contract text

Add to `ListBoxProps`:

```ts
    /**
     * Renders every default row with a leading checkbox reflecting its selected state, and
     * suppresses the default trailing selection icon. Presentational only — see `isSelected`.
     * Ignored when a custom `renderItem` is supplied.
     */
    checkbox?: boolean;
```

Rewrite the tail of `isSelected`'s comment (D8):

```
     * Used when selection state is derived externally. It does not change how the list reports
     * interaction: `ListBox` emits one `onChange(source)` per click and never mutates a set. A
     * multi-select caller keeps its own array, returns membership here, and pairs it with
     * `checkbox` for the visual — `MultiListBox` is that caller.
     *
     * The predicate's *identity* is a repaint input (see `repaintSignature`): a caller whose
     * selection changed must hand over a new function, or the rows will not redraw.
```

That last paragraph is the load-bearing one — it is what makes D4's requirement discoverable from the
prop rather than only from the model.

### Step 5 — `ListBox/ListBoxModel.ts`: the tenth slot and the dead-state comment

```ts
        return [
            this.props.items,
            this.selectedKey.value,
            this.props.activeIndex,
            this.props.searchText,
            this.props.renderItem,
            this.props.isSelected,
            this.props.getTooltip,
            this.props.variant,
            this.props.selectionStyle,
            this.props.checkbox,
        ];
```

Extend the doc comment's third rule with: `checkbox` is present because it adds and removes a child
of every row; and note that a caller-owned selection travels through `isSelected`'s **identity**,
which is why a stable bound method is a bug in a multi-select parent (D4).

On `ListBoxState`:

```ts
export interface ListBoxState {
    /**
     * Unused. Kept only so the model has a state object. Do **not** wire it into
     * `repaintSignature()`: a state change does not pump props in a vanilla driver, so a state slot
     * in the signature is dead code (uikit/CLAUDE.md, Rule 9).
     */
    revision: number;
}
```

### Step 6 — `ListBox/ListBoxView.ts`: forward it

`itemProps` gains one line:

```ts
            selectionStyle: this.props.selectionStyle,
            checkbox: this.props.checkbox,
```

and `restProps` gains `checkbox: _checkbox` to its destructuring exclusions, so the flag never lands
on the root as an attribute.

### Step 7 — `MultiListBox/MultiListBoxModel.ts`

`isSelected` becomes a memo (D4):

```ts
    // before
    isSelected = (source: T): boolean =>
        this.selectedKeys.value.has(this.resolvedItems.value.extractValue(source));

    // after
    /**
     * The row-selected predicate handed to `ListBox`.
     *
     * A `memo`, not a stable bound method, because `ListBox` repaints its cells only when a slot of
     * `repaintSignature()` moves — and this predicate is the *only* slot that can carry a
     * parent-owned selection, since `value` is never forwarded. A stable identity here means a
     * checked box that does not redraw until the pointer moves.
     */
    isSelected = this.memo<(source: T) => boolean>(
        () => {
            const keys = this.selectedKeys.value;
            const { extractValue } = this.resolvedItems.value;
            return (source: T) => keys.has(extractValue(source));
        },
        () => [this.selectedKeys.value, this.resolvedItems.value],
    );
```

`toggle` and `toggleSelectAll` already read `selectedKeys` directly and need no change. Nothing else
in the model changes: the five memos, the two setters and the two derived getters stay as they are.

### Step 8 — new `MultiListBox/MultiListBoxView.ts`

Skeleton (the class doc must record D5's three rules and D6):

```ts
export class MultiListBoxView<T = IListBoxItem> extends VanillaView<MultiListBoxProps<T>> {
    private readonly driver: ComponentModelDriver<…>;
    private readonly restPropsState = createRestPropsState();

    private searchRow!: HTMLDivElement;
    private selectAllRow!: HTMLDivElement;
    private selectAllIconHost!: HTMLSpanElement;
    private selectAllLabelHost!: HTMLSpanElement;
    private listWrapper!: HTMLDivElement;
    private input!: InputView;
    private list!: ListBoxView<T>;
    private appliedCheckState: "true" | "mixed" | "false" | undefined;
    private selectAllGlyph: SVGElement | undefined;

    public constructor(props) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "multilistbox";
        this.driver = createComponentModelDriver(props, MultiListBoxModel …);
        this.own(() => this.driver.dispose());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onMount(): void {
        // structure: search row, select-all row, list wrapper (always last, and the insert anchor)
        …
        this.input = this.child(new InputView(this.inputProps()));
        this.searchRow.append(this.input.root);
        this.input.mount();

        this.list = this.child(new ListBoxView<T>(this.listProps()));
        this.listWrapper.append(this.list.root);
        this.list.mount();

        this.listen(this.selectAllRow, "click", () => this.model.toggleSelectAll());

        this.applyRoot(this.props);
        this.driver.mount();
        // Applies once immediately, so this seeds the first sync; then fires on every state write.
        this.bind(
            this.model.state,
            (state) => ({ searchText: state.searchText, activeIndex: state.activeIndex }),
            () => this.syncChildren(),
        );
    }

    protected onUpdate(props): void {
        this.driver.update(props);
        this.applyRoot(props);   // root attributes, inline size, rest props — never on the state path
        this.syncChildren();
    }
}
```

Details that are easy to get wrong:

- **Both children are created unconditionally**, and `showSearch` only attaches/detaches
  `searchRow`. `this.child()` claims a view for its whole lifetime, so create/dispose on a prop flip
  would grow the children array; an unattached `InputView` costs one detached `<input>` and no
  consumer sets `showSearch: false` outside the story.
- **`listWrapper` is always present and last**, so the two conditional rows are attached with
  `this.root.insertBefore(row, this.listWrapper)` and order needs no bookkeeping.
- **`applyRoot`** writes `data-name`, `data-disabled`, `data-readonly`, the inline `width`/`height`
  (`""` when the prop is undefined, so the stylesheet's `width: 100%` applies exactly as it did when
  React passed no `style`), and `applyRestProps` last.
- **`syncChildren()`** is the single consequence of both paths. It reads `this.props` and
  `this.model.state.get()`, then: updates the select-all row's attachment, tri-state and label;
  `this.input.update(this.inputProps())`; `this.list.update(this.listProps())`.
- **The tri-state is computed once**:
  `const checkState = model.allVisibleSelected ? "true" : model.someVisibleSelected ? "mixed" : "false";`
  written to `data-checked` and `aria-checked`, with the glyph swapped only when
  `appliedCheckState` differs (`checked` / `indeterminate` / `unchecked`).
- **`listProps()`** returns exactly the named props `ListBoxView` destructures — never the parent's
  rest props, or every keystroke would reinstall the inner list's root listeners:

```ts
    private listProps() {
        const { rowHeight = 24, maxVisibleItems = 10, height, emptyMessage } = this.props;
        const { searchText, activeIndex } = this.model.state.get();
        return {
            items: this.model.listBoxItems.value,
            isSelected: this.model.isSelected.value,
            onChange: this.model.toggle,
            activeIndex,
            onActiveChange: this.model.setActiveIndex,
            searchText,
            checkbox: true,
            variant: "browse" as const,
            keyboardNav: true,
            rowHeight,
            growToHeight: height === undefined ? maxVisibleItems * rowHeight : undefined,
            emptyMessage: emptyMessage ?? "no rows",
        };
    }
```

  `selectionStyle` is deliberately unset: its default (`"check"`) no longer renders a trailing icon
  once `checkbox` is true (D3), and none of its selection backgrounds apply to the `check` style.

- **Disposal order.** `VanillaView.dispose()` runs children before registered disposers, so the
  `ListBoxView` and `InputView` go before `driver.dispose()`, which is the same ordering
  `ListBoxView` establishes for its own grid.

### Step 9 — new `MultiListBox/MultiListBox.css`

Under `@layer uikit`, translated from the five Emotion blocks:

- `[data-type="multilistbox"]` — `display: flex; flex-direction: column; min-width: 0; min-height: 0;
  width: 100%; background-color: var(--color-bg-default, transparent)`.
- `[data-type="multilistbox"][data-disabled]` — `opacity: .6; pointer-events: none`.
- `> [data-part="search"]` — `flex-shrink: 0; padding: var(--space-xs, 2px)`.
- `> [data-type="multilistbox-select-all"]` — `inline-flex`, `align-items: center`,
  `gap: var(--gap-md, 6px)`, `flex-shrink: 0`, `height: 24px`, `box-sizing: border-box`,
  `padding-left/right: var(--space-sm, 4px)`, `cursor: pointer`,
  `color: var(--color-text-default)`, `border-bottom: 1px solid var(--color-border-light)`,
  `user-select: none`; `:hover` → `background-color: var(--color-bg-message)`; its
  `[data-part="icon"]` block (16x16, `--color-text-light`, `--color-text-default` on row hover, and
  `svg` sizing); its `[data-part="label"]` block (`flex: 1 1 auto; min-width: 0; nowrap; ellipsis`).
- `> [data-part="list"]` — `display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0`.

The row height stays the literal `24px` it is today, not a token — it is not `height.controlSm`
semantically, it matches the default `rowHeight`.

### Step 10 — `MultiListBox/MultiListBox.tsx` becomes a shim

Keep `MultiListBoxProps` verbatim (C3-5 freezes the public prop shape). Drop the five styled blocks,
the `renderIcon`/`highlight`/`Input`/`ListBox`/`useComponentModel` imports and the two default
constants (they move to the view). Body becomes the same generic-preserving shim as `ListBox.tsx`:

```tsx
function MultiListBoxShim<T = IListBoxItem>(props: MultiListBoxProps<T>) {
    return mountVanilla(
        MultiListBoxView as unknown as new (props: MultiListBoxProps<T>) => MultiListBoxView<T>,
        props,
    );
}

export const MultiListBox = MultiListBoxShim as <T = IListBoxItem>(
    props: MultiListBoxProps<T>,
) => React.ReactElement | null;
```

### Step 11 — story

`MultiListBox.story.tsx` needs no change to compile. Add one control — `keyboardNav`-style
verification is not a prop, so instead add nothing and verify D2 by hand in the story (arrow keys with
the pointer parked on another row).

### Step 12 — docs

- `doc/epics/EPIC-056.md` — US-1016 row → Implemented; a `### 2026-08-22 — US-1016 (MultiListBox)`
  notes block recording: the `renderItem` obligation discharged (and that `uikit/` now has zero
  consumers), D1/D2/D4's reasoning, the `isSelected`-identity rule as the general contract for a
  parent-owned selection, and the correction that this removes one root per row rather than two.
- `src/renderer/uikit/CLAUDE.md` — Rule 9: a short subsection distinguishing the two state
  mechanisms (a state field that is a *child's prop* belongs in `bind()`; the `mutate`/`onStateApplied`
  funnel is for state whose consequence is a render pass the children cannot express), plus the
  `isSelected`-identity rule beside the repaint-signature rules.
- `doc/architecture/styling-inventory.md` — **no change.** The document is an explicitly frozen
  2026-08-18 snapshot ("never updated in place"), and it still lists already-converted files such as
  `ListBox.tsx` and `Input.tsx`. US-1015 edited it only to correct a claim about a file it had
  *deleted* (`shared/selection-style.ts`), which is a different thing from ticking off a conversion.
- `doc/active-work.md` — US-1016 entry under EPIC-056, left `[ ]` (implemented, unreviewed).

## Concerns

1. **`checkbox` widens `ListItem` / `ListBox`'s public API with a multi-select notion.** Accepted
   under D1/D8: the flag is presentational, the click contract is unchanged, and it *retires* a
   renderer hatch rather than adding a second one. Epic F owns the final API shape.
2. **The hover carve-out couples `ListItem.css` to a checkbox concept.** One selector, commented at
   the site. The alternative — accepting two highlighted rows — is a visible behaviour change inside a
   conversion, which the epic's faithfulness rule forbids.
3. **Every checkbox row now gets a tooltip attachment.** `ListItemView` attaches one
   unconditionally (`:75`) and the custom row had none. It is the disabled arm and already true for
   every other converted list, but it is one `attachTooltip` per pooled cell that did not exist here
   before; worth a glance at the tooltip registry during verification.
4. **`data-type="multi-list-item"` is retired.** No references anywhere in the repo, but it is an
   agent-visible DOM change: rows become `[data-type="list-item"][data-checkbox]` inside
   `[data-type="multilistbox"]`. Recorded in the epic notes.
5. **Emotion `label:` names leave the class list**, so devtools no longer shows
   `MultiListBoxItemRow`. Same trade every converted component made; `data-part` is the replacement.
6. **A future consumer that rebuilds `value` identity per render** repaints the visible window on
   every pump. Both current consumers memoize. Fallback is documented in D4.
7. **An `InputView` exists even when `showSearch` is false** (D6/Step 8). One detached `<input>`; the
   alternative is create/dispose churn against `child()`'s one-owner-for-life rule.
8. **`MultiListBoxModel` keeps two `state.update` call sites**, so the `grep "state.update"` → 1 rule
   that holds inside `uikit/Tree/` deliberately does not apply here. D5 explains why; the acceptance
   criteria assert **2**, not 0, so a later reader does not "fix" it into a funnel.

## Acceptance criteria

### Static

- `npx tsc --noEmit` clean; `npm run lint` clean; `git diff --check` clean.
- `grep -rn "@emotion" src/renderer/uikit/MultiListBox/` → only `MultiListBox.story.tsx`.
- `grep -rn "renderItem" src/renderer/uikit/` → `ListBox`'s own prop and plumbing, plus the
  `ListBox` and `Tree` **stories**, which exist to demonstrate the public prop. **No component
  inside `uikit/` consumes it.**
- `grep -rn "state.update" src/renderer/uikit/MultiListBox/` → exactly 2 (the two setters, D5).
- `grep -rn "this.effect(" src/renderer/uikit/MultiListBox/` → nothing.
- `grep -rn "multi-list-item" src/` → nothing.

### Runtime (offscreen probes, the method established in US-1014/US-1015)

1. **The D4 defect is actually fixed:** click a row, and with **no pointer movement and no further
   update**, the row's leading glyph is the `checked` icon. (Assert the `svg` changed, not just
   `aria-selected`.)
2. **Tri-state header follows the filter, with no prop change:** with a subset selected, type a
   filter that leaves only selected rows visible → header goes `mixed` → `true`; clear it → back to
   `mixed`. This is D5's rule 1.
3. **Select-all respects the filter:** with a filter active, `toggleSelectAll` adds only the visible
   rows and, when all visible are selected, removes only those.
4. **One highlighted row under keyboard nav (D2):** park the pointer on row 2, arrow down to row 5 →
   exactly one row carries a background. Also confirm the reverse (`variant="browse"` rows in a
   non-checkbox list still highlight on hover).
5. **Trailing icon suppressed (D3):** a selected checkbox row has no `[data-part="trailing"]` content;
   an item with an explicit `trailing` still shows it.
6. **Zero React roots once settled:** scroll a 500-row list; `[data-part="react-slot"]` count inside
   the list is 0 (the search input, select-all and rows are all DOM).
7. **Glyph is not rebuilt per repaint:** capture a row's `svg` element, trigger a repaint that does
   not change that row's checked state, and assert the same element object is still in place.
8. **Disabled / readOnly:** `disabled` → root `pointer-events: none`, clicks do nothing, search input
   disabled; `readOnly` → rows do nothing, search still typable.
9. **Sizing:** with no `height`, the list grows to `maxVisibleItems * rowHeight`; with
   `height="100%"` (the `MultiSelect` resized-popover and AVGrid filter case) the root fills its
   parent and the list scrolls.
10. **Both real consumers by hand:** the AVGrid options filter (open, filter, select-all, apply,
    clear) and the `MultiSelect` dropdown (open, type, check several, resize the popover).

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/ListBox/ListItem.tsx` | + `checkbox?: boolean` prop |
| `src/renderer/uikit/ListBox/ListItemView.ts` | + check host, `setCheck()`, `setTrailing` suppression, `data-checkbox` |
| `src/renderer/uikit/ListBox/ListItem.css` | + `[data-part="check"]` rules; browse hover gated with `:not([data-checkbox])` |
| `src/renderer/uikit/ListBox/types.ts` | + `checkbox?: boolean` on `ListBoxProps`; `isSelected` contract rewritten |
| `src/renderer/uikit/ListBox/ListBoxModel.ts` | + tenth signature slot; `ListBoxState.revision` warning comment |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | forward `checkbox` in `itemProps`; exclude it from rest props |
| `src/renderer/uikit/MultiListBox/MultiListBoxModel.ts` | `isSelected` → `memo` |
| `src/renderer/uikit/MultiListBox/MultiListBoxView.ts` | **new** — the view |
| `src/renderer/uikit/MultiListBox/MultiListBox.css` | **new** — five translated blocks |
| `src/renderer/uikit/MultiListBox/MultiListBox.tsx` | → `mountVanilla` shim; props interface kept verbatim |
| `src/renderer/uikit/Input/Input.tsx` → `InputView.tsx` | `import "./Input.css"` moved to the view that owns the DOM |
| `src/renderer/uikit/CLAUDE.md` | Rule 9: the two-mechanism table (`bind` vs funnel); fifth repaint-signature rule (callback identity) |
| `doc/de-react.md` | §6.1 third instance — the missing input was a callback's identity, not a prop |
| `doc/epics/EPIC-056.md` | US-1016 status + notes block |
| `doc/active-work.md` | US-1016 entry under EPIC-056 |

## Verification record (2026-08-22)

### Static

- `npx tsc --noEmit` — clean. `npm run lint` — clean.
- `grep -rln "@emotion" src/renderer/uikit/MultiListBox/` — **nothing**. The folder is Emotion-free
  including its story (it composes `Panel` / `Text`).
- `grep -rn "renderItem" src/renderer/uikit/` — `ListBox`'s prop and plumbing plus the `ListBox` and
  `Tree` stories. No component consumer inside `uikit/`.
- `grep -rn "state.update" src/renderer/uikit/MultiListBox/` — 2 (the two setters, as D5 intends).
- `grep -rn "this.effect(" src/renderer/uikit/MultiListBox/` — nothing.
- `grep -rn "multi-list-item" src/` — nothing.

### Runtime — offscreen probes

Structure and rows: children in order `search` / `select-all` / `list`; rows are
`[data-type="list-item"][data-checkbox][data-variant="browse"]` with a `[data-part="check"] > svg`,
`aria-selected="false"`, and an **empty** trailing host (D3).

**D4, the masked defect.** Clicking a row and then applying only the controlled prop pump — no pointer
movement, no other input touched — flips the glyph (`path` count 0 → 1), `aria-selected` → `"true"`,
and the header → `mixed`. This is the assertion the memoized predicate exists for; with the previous
stable bound method no signature slot would have moved.

**Glyph not rebuilt per repaint.** An untouched row's `svg` is the *same element object* after a full
repaint caused by another row's change.

**Zero React roots.** `[data-part="react-slot"]` inside the component: 0.

**D5 rule 1 — state-only writes.** Select one row → `mixed`; `setSearchText` narrowing to just that
row (a state write, no prop pump) → `true`; clear → `mixed`; narrow to 11 rows with none selected →
`false`. Select-all with a filter active adds exactly the 11 visible (total 12) and removes exactly
those 11 again, leaving `[7]`.

**D2 hover carve-out**, tested through the selector because `:hover` cannot be dispatched: the
`:not([data-checkbox]):hover` rule is present in the shipped stylesheets; a checkbox row does **not**
match the hover arm; a plain `variant="browse"` row **does**; the checkbox row still matches the
active arm.

**Sizing.** No `height` → root 292px = 240 list (`10 x 24` grow) + search + header chrome; `height:
300` → root 300, list 248. A bare `ListBox` control with the same `growToHeight` renders the same 11
rows, so the row count is the engine's normal behaviour, not something this shell changed. *(A first
reading of 3 rows was a measurement artefact — two animation frames is not enough for the
grow-to-height measure to settle; six is.)*

**Disabled / read-only.** `disabled` → `pointer-events: none`, `opacity: 0.6`, input disabled,
`data-disabled` present. `readOnly` → row click ignored, input still enabled, pointer events normal.

### Runtime — both consumers through their real React parents

**`MultiSelect`** (mounted with a real React root, dropdown opened through the chevron): popover
mounts the vanilla `MultiListBox`, 11 checkbox rows, 11 check glyphs, select-all present, search
present, list 240px, **0 React slots**. Clicking a row: glyph 0 → 1 paths, `value.length` 1, trigger
reads `"(1) selected"`, header `mixed`, trailing host empty.

**AVGrid options filter** (real `grid-json` page, filter opened from the `category` column header
button): four distinct options, 4 check glyphs, select-all labelled "Select all", **0 React slots in
rows**, root 152px / list 100px. Clicking `alpha` → checked, `aria-selected="true"`, header `mixed`.
Screenshot confirms the visual result — 16px boxes, correct spacing, indeterminate select-all, bottom
border on the header.

Probe artifacts cleaned up: temp page closed, temp file deleted, no stray DOM.
