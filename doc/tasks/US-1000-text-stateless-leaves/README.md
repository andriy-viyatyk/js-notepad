# US-1000: `Text` and the stateless leaves

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-054 — De-React Epic C1: Foundation and primitives](../../epics/EPIC-054.md)
**Created:** 2026-08-20

## Goal

Convert the eight stateless UIKit leaves — `Label`, `Tag`, `SelectableRow`, `Divider`, `Dot`,
`Spacer`, `Spinner`, and `ProgressBar` — to `VanillaView` implementations behind their existing
React-facing props and DOM contracts. Move `Text`'s styling to the static-CSS contract at the same
time, while keeping `Text` itself as the deliberate React-only styling face established by
EPIC-054 C1-1.

The task must leave every public prop, `data-*` attribute, accessibility attribute, child shape,
and caller unchanged. It is a conversion task, not an API cleanup or a call-site migration.

## Background

EPIC-054 C1 is intentionally split so the wide, stateless leaves land together. The relevant
dependency is shallow:

```text
Text.css + text attribute helper
        ↑
      Label (raw nested Text-compatible spans)

SelectableRow.css
        ↑
  SelectableRow
```

The other six conversions are self-contained apart from the shared helpers already delivered by
US-996 and the DOM icon path delivered by US-997:

- `Tag` has an icon slot, a string label, arbitrary React children, a custom remove button, and
  clickable/selected/disabled state.
- `SelectableRow` has arbitrary React children, a forwarded `ref`, and the shared focus-aware
  selection contract. Its first conversion keeps the rules in its own `SelectableRow.css`; the
  shared stylesheet is deferred until Tree/ListBox exposes the genuinely common selector shape.
- `Divider` and `Spacer` are pure DOM/layout leaves.
- `Dot` has a free-form color input and numeric or named diameter, so it exercises component-owned
  runtime custom properties.
- `Spinner` already completed the US-984 CSS pilot. US-1000 adds its `VanillaView` face without
  reopening the CSS/layer decision.
- `ProgressBar` has determinate, completed, and indeterminate states, runtime width/height/fill
  geometry, and the fourth C1 animation that was not part of the Spinner pilot.

`Panel` and `Progress` are not in scope. `Panel` is the React-only C1-1 exception and has its own
US-1003 task; `Progress`/`ProgressOverlay` is assigned to C2. `ProgressBar` is the standalone
primitive at `src/renderer/uikit/ProgressBar/ProgressBar.tsx`.

### Measured production surface

The following counts come from the current tree with story files excluded. They are a caller
inventory, not permission to edit those callers:

| Component | JSX usages | Files | Current special surface |
|---|---:|---:|---|
| `Text` | 413 | 94 | React-only face; 413 usages remain unchanged |
| `Label` | 9 | 4 | Nested `Text` output; `required` adds a second text span |
| `Tag` | 23 | 16 | `icon`, `label`, `children`, remove button, click/selection state |
| `SelectableRow` | 4 | 3 | `children`, `ref`, local selection CSS; no story exists |
| `Divider` | 22 | 7 | orientation + separator accessibility |
| `Dot` | 18 | 10 | named/free-form color, named/numeric size, internal geometry |
| `Spacer` | 23 | 20 | optional scalar flex-basis |
| `Spinner` | 14 | 13 | CSS pilot already landed; 5 UIKit, 8 editor, 2 UI usages |
| `ProgressBar` | 5 | 4 | determinate/completed/indeterminate + animation |

The pinned measurements can be re-run with the component-tag scan used during investigation:

```powershell
$components = @("Text","Label","Tag","SelectableRow","Divider","Dot","Spacer","Spinner","ProgressBar")
foreach ($component in $components) {
    rg -n --glob "*.tsx" --glob "*.ts" --glob "!*.story.tsx" --glob "!*.story.ts" `
        "<$component(?:\s|>)" src/renderer
}
```

Story files are verification surfaces and are deliberately excluded from the production counts.

## Implementation plan

### 1. Establish the shared `Text` attribute/style contract

Create the co-located `Text.css` and a small helper beside `Text` for the attributes shared by the
React face and `LabelView`:

- `src/renderer/uikit/Text/Text.css` owns all existing `Text` selectors under `@layer uikit`,
  rooted at `[data-type="text"]`.
- This is the highest-blast-radius styling move in C1: Emotion is currently unlayered, while a
  layered rule loses to any matching unlayered rule regardless of specificity. Before converting
  another component, audit the real application in both themes — at minimum a dense grid/tree/
  notebook editor, the sidebar, tabs, and dialogs — for generic descendant Emotion selectors such
  as `& span`, `& > *`, and `& > :first-of-type`. The direct-selector audit currently finds no
  external `[data-type="text"]` rules; `theme/GlobalStyles.tsx:164` targets Divider, not Text.
  Record the result in the task notes and consider landing this stylesheet as an independently
  revertible commit.
- Preserve every existing size, named-color, variant, modifier, hover, truncate, and alignment
  selector. Keep the free-form color path as an internal `style.color` write on the text span;
  named colors continue to use `data-color` and token variables in CSS.
- The helper should resolve Text's defaults and produce its full attribute set for Text itself,
  but `LabelView` must pass only the six fields Label currently forwards to Text:
  `variant`, `color`, `size`, `italic`, `bold`, and `nowrap`. Label's `preWrap`, `truncate`,
  `align`, and `hoverUnderline` props currently fall through `...rest` onto the `<label>` and are
  inert; preserve that behavior and leave their cleanup to Epic F. Add a source comment so a
  future conversion does not accidentally turn those four accepted-but-inert props into a
  behavior change.
- The helper must be usable without mounting the React `Text` component.
- `Text.tsx` imports `Text.css` and uses the helper, but remains a hand-written React component.
  Do not create `TextView`, `createText`, or a second vanilla API. This preserves C1-1 while
  allowing Label to emit Text-compatible DOM directly.

### 2. Convert `Label` while preserving its nested Text DOM

Add `src/renderer/uikit/Label/LabelView.tsx` and `Label.css`; change `Label.tsx` to export the
unchanged props and a `mountVanilla(LabelView, props)` face.

- The root remains one `<label data-type="label" data-name="...">` with the same disabled state,
  forwarded attributes, and native label behavior.
- `onMount` creates one raw `span[data-type="text"]` for `children`, using the Text attribute
  helper, and a second identical text span containing `*` with `data-color="error"` when
  `required` is true. This is an intentional raw DOM equivalent of the existing one/two React
  `<Text>` children; do not flatten them into label text or replace them with a class.
- The child content uses `fillSlot` so existing `ReactNode` children remain supported. The common
  string path must remain a direct text write; React children use the transitional React bridge.
- `Label.css` contains only the label-root layout/disabled rules. It imports or otherwise loads
  `Text.css` through the Label entry so the nested text spans are styled even when the React Text
  module is not loaded by the bundle path.
- `LabelProps` extends `React.LabelHTMLAttributes` without the sibling components' `style` /
  `className` omission. Preserve that existing exception and let the React-compat helper apply
  those attributes as it does today; do not silently narrow the public type in this conversion.
- On update, clear removed children, required-star content, attributes, and listeners just as
  React would. Register every slot disposer and ref/resource cleanup with `own()`.

### 3. Convert `Tag` with native icon, child, and remove-button regions

Add `src/renderer/uikit/Tag/TagView.tsx` and `Tag.css`; keep `Tag.tsx` as the public
`mountVanilla` face.

- Build a semantic `span[data-type="tag"]` root and preserve `data-name`, `data-variant`,
  `data-tone`, `data-size`, `data-truncate`, `data-disabled`, `data-selected`, `data-clickable`,
  `data-removable`, and `data-remove-affordance` exactly.
- Render `icon` with the DOM icon path for an `IconName`; preserve the `ReactNode` arm through
  `fillSlot` without changing the leading-icon position.
- Keep `label` as a direct span text region and route `children` through `fillSlot` so rich callers
  still render. The existing label/children ordering is icon, label, children, remove button.
- Build the remove control as a native button with the same direct-child placement, `type="button"`,
  accessible label, close icon, hover/focus styling, stop-propagation behavior, and disabled
  behavior. Do not make Tag depend on the public React `Button` wrapper.
- Preserve the root `onClick` callback semantics and all arbitrary HTML/event props through the
  React-compat helpers. Remove stale listeners/regions when `onRemove`, `onClick`, icon, label,
  children, or `removeAffordance` change.
- Translate both root and remove-button Emotion blocks to `[data-type="tag"]` / stable
  `data-part` selectors in `@layer uikit`. Keep the existing tone, selected, disabled, truncate,
  and hover/focus precedence. Keep `[data-truncate] > span` as written: it also matches the
  `fillSlot` `span[data-part="react-slot"]` wrapper, which is `display: contents` and therefore
  inert for layout. That match is intentional; verify a truncating Tag with React children rather
  than tightening the selector and changing today's child-span behavior.

### 4. Convert `SelectableRow` and preserve the selection contract

Create `src/renderer/uikit/SelectableRow/SelectableRowView.tsx`,
`src/renderer/uikit/SelectableRow/SelectableRow.css`, and a first
`src/renderer/uikit/SelectableRow/SelectableRow.story.tsx`.

- Move only SelectableRow's current rules into its own `SelectableRow.css` under `@layer uikit`.
  Keep `selection-style.ts` untouched for Tree, ListBox, CategoryList, and the later Epic D
  consumer. Create `uikit/shared/selection-style.css` only when a later task converts a second
  owner and the genuinely common selector shape is known.
- `SelectableRow.css` must preserve the row base, selected/active blurred colors, hover rule, and
  focused `:focus-within` blue/outline rules. Use the exact existing
  `[data-type="selectable-row"]`, `[data-selected]`, `[data-active]`, and
  `[data-focus-selection]` vocabulary; do not invent a generic row selector.
- `SelectableRowView` builds the same `div` root, forwards the public `ref`, and fills `children`
  through `fillSlot`. Keep the root content-height/flex behavior and do not add a percentage
  height or a wrapper that changes row layout.
- The new story must provide enough controls/content to inspect default, selected, active, hover,
  and focused-container behavior. It is a verification story, not a public API change.
- Import the local stylesheet from the owning entry so it is loaded when SelectableRow is loaded;
  do not rely on Tree or ListBox importing it first.

### 5. Convert the simple structural leaves

Add a view and co-located static stylesheet for each of these components, with the existing public
React face changed only to `mountVanilla`:

- **`Divider`** — raw `div`, `data-type="divider"`, orientation attributes, `role="separator"`,
  `aria-orientation`, and existing horizontal/vertical dimensions. `DividerProps` is the batch's
  exception: it does not omit public `style` or `className`. Preserve its current last-position
  rest spread, so caller-provided attributes retain today's precedence over component-owned
  attributes; do not apply the stronger ordering used by Dot/Spinner.
- **`Dot`** — raw `span` with `--dot-size` and `--dot-color` runtime properties, `data-clickable`,
  `data-selected`, `data-bordered`, and `data-visibility`. Preserve named-color resolution,
  arbitrary CSS color strings, border token, selection ring, and click behavior. The stylesheet
  owns layout/hover rules; JavaScript only writes the two component-scoped scalar values. The
  `:not([data-selected])` guard on the clickable hover ring is load-bearing: bordered and selected
  are inline styles today, and after conversion the CSS guard must keep hover from fighting the
  selected ring. Append `px` to numeric diameters before writing `--dot-size`; preserve a string
  diameter unchanged.
- **`Spacer`** — raw `span[data-type="spacer"]`; use a present/absent size state and a
  `--spacer-size` property so the sized branch retains the current `flex-basis` number/string
  behavior and the unsized branch retains `flex: 1 1 auto`. Append `px` when `size` is a number;
  pass a string through unchanged. CSS custom properties do not perform React's number-to-pixel
  conversion automatically.

Each view must use `applyRestProps`/`clearRestListeners` where the public type accepts native
attributes, and must clear the old runtime property or attribute when the corresponding prop is
removed. Do not normalize the JSX spread order during conversion: Text, Label, Tag, SelectableRow,
Divider, and ProgressBar currently spread caller props last, while Dot and Spinner write their
component-owned attributes/style after the spread. Preserve those per-component precedence
semantics.

### 6. Finish `Spinner`'s vanilla face on top of the US-984 CSS pilot

Add `src/renderer/uikit/Spinner/SpinnerView.tsx`; change `Spinner.tsx` to mount it while keeping
`Spinner.css` and the current props unchanged.

- Build the same `span[data-type="spinner"]` with `role="status"`, `aria-live="polite"`,
  `aria-label="Loading"`, `data-name`, and one direct `ProgressIcon` SVG child.
- Use `createIconElement("progress", ...)` for the DOM icon path; do not reintroduce the React
  `ProgressIcon` component into the vanilla view.
- Keep `--spinner-size` and optional `--spinner-color` writes exactly as US-984 defined them,
  including the `32px` and `currentColor` CSS fallbacks. Preserve all rest attributes and stale
  property cleanup.
- The story and all 14 production usages remain unchanged. Check the dense Tree/ListBox paths and
  the existing AVGrid superseded path, but do not widen this task into AVGrid conversion.

### 7. Convert `ProgressBar` with explicit state and geometry attributes

Add `src/renderer/uikit/ProgressBar/ProgressBarView.tsx` and `ProgressBar.css`; change the public
face to `mountVanilla`.

- Keep the root `div[data-type="progress-bar"]`, `data-name`, `data-state`, `data-variant`,
  `role="progressbar"`, the default/custom `aria-label`, and the current determinate,
  completed, and indeterminate ARIA attributes.
- Keep one direct fill child. Use `data-part="fill"` or an equivalent established internal part
  and preserve the direct-child selectors that make state/variant rules apply.
- Write component-owned runtime properties for width, height, and determinate fill width with
  usable CSS fallbacks. Append `px` to numeric `width` and `height` values before writing the
  custom properties; preserve string width values unchanged. Clear `--progress-bar-fill-width` in
  indeterminate mode so a previous determinate value cannot leak into a later state.
- Move the Emotion keyframes to `@keyframes persephone-progress-bar-indeterminate-slide` in
  `@layer uikit`, preserving the 1.4s linear infinite transform animation and transition rules.
- Keep `completed` overriding `variant` exactly as today and retain the existing invalid/nonfinite
  value clamping behavior. The completed selector and variant selectors have equal specificity;
  completed wins only because its rule is later, so preserve that CSS order explicitly. Preserve
  the current rest order as well: `ariaProps` are written before `...rest`, so a caller can
  override `aria-valuenow`/related ARIA attributes today; the conversion must not silently harden
  that behavior.

### 8. Preserve exports, stories, and verification boundaries

- Keep the public exports from each component `index.ts` unchanged. View classes and private style
  helpers are implementation details and do not go through `uikit/index.ts`.
- Do not change production call sites, story property definitions, package dependencies, or build
  configuration. `SelectableRow.story.tsx` is the one new story because no story existed before.
- Update `doc/architecture/key-files.md` for the new `Text/text-style.ts` owner if required by the
  key-files convention. No selection-style.css row is needed in this task because the stylesheet
  is now local to SelectableRow; keep the existing `selection-style.ts` entry while its remaining
  React consumers exist.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- In Storybook, inspect every story and compare `browser_snapshot` `data-*` output with the current
  contract. For the no-story SelectableRow, use the new story and a focused-container fixture.
- Exercise Text named/free-form colors, every size/variant/modifier, Label required/disabled,
  Tag icon/remove/selected/disabled/hover, SelectableRow focus states, Divider orientations,
  Dot named/free-form colors and sizes, Spacer sized/unsized, Spinner sizes/color, and ProgressBar
  determinate/completed/indeterminate/invalid values in both themes. Before converting the other
  seven components, walk the real app in both themes with a dense grid/tree/notebook editor, the
  sidebar, tabs, and dialogs to catch unlayered ancestor/descendant Emotion rules that Storybook
  cannot exercise.

## Concerns / Open questions

1. **Text.css changes cascade precedence across 413 usages.** Emotion is currently unlayered and
   therefore outranks every layered declaration, regardless of specificity. The new `[data-type="text"]`
   rules can lose to generic unlayered ancestor/descendant Emotion selectors even when no direct
   external Text selector exists. The real-app grid/tree/notebook, sidebar, tabs, and dialogs audit
   in step 1 is a gate before the remaining seven conversions proceed; landing the stylesheet in
   an independently revertible commit is recommended.

2. **`Text` is intentionally not a vanilla view.** This is a resolved epic decision, not an
   omission. Its 413 production usages remain React-backed until the later app/editor conversion;
   only its stylesheet and attribute helper move now. Label must therefore emit Text-compatible
   raw spans itself rather than attempting to mount the React `Text` component inside a vanilla
   view.

3. **Label's nested DOM is load-bearing.** The obvious simplification is to put label text and the
   required asterisk directly in the `<label>`. That would change the tree and bypass Text.css.
   Keep one span for normal content and add the second only for `required`, with the same Text
   attributes and color override as today.

4. **React-node slots remain a deliberate bridge.** `Tag.children`, `Tag.icon`, and
   `SelectableRow.children` can carry React subtrees. `fillSlot` must own those roots, reuse a
   React root for React-to-React updates, and dispose it only on arm changes or view disposal.
   String/icon-name paths must remain direct DOM operations so ordinary callers do not pay the
   bridge cost.

5. **Shared selection CSS is coordinated infrastructure.** Only SelectableRow is converted here;
   Tree, ListBox, CategoryList, and FolderItem still consume `selection-style.ts`. Keep this task's
   rules local to `SelectableRow.css`; create a shared stylesheet only when a later task converts a
   second owner and can see the genuinely common selector contract.

6. **Free-form and numeric values need internal, not public, styling writes.** `Dot.color` accepts
   arbitrary existing CSS values, and `Dot.size`, `Spacer.size`, `ProgressBar.width`, and
   `ProgressBar.height` accept numbers that React previously converted to px. They must be written
   to component-owned custom properties on the raw element, with explicit numeric-to-`px`
   conversion and CSS fallbacks, while the public props continue to omit `style` and `className`.
   Do not validate or narrow these existing APIs.

7. **ProgressBar has more cascade risk than Spinner.** Its fill rules combine direct-child shape,
   state, variant, completed override, transition, and animation. Translate selectors before
   simplifying them, retain ordering, and visually check all three state branches; typecheck cannot
   catch a fill that is present but no longer painted.

8. **SelectableRow has no prior visual story.** The new story is necessary to make its focus-aware
   selection contract inspectable, but it must not become a new production caller or alter the
   public props. Verify it inside a focusable `[data-focus-selection]` container because the focused
   rules are inert otherwise.

9. **Spinner's CSS pilot and vanilla conversion are separate changes.** The stylesheet and layer
   bootstrap are already supplied by US-984. US-1000 must not duplicate keyframes, move the layer,
   or change the 14 callers while adding the view boundary.

## Acceptance criteria

- [x] `Text.css` is layered and preserves the existing Text selectors; `Text` remains a React-only
      face with no `TextView` or `createText` export.
- [x] Before the remaining seven conversions proceed, real-app verification in both themes covers
      a dense grid/tree/notebook editor, sidebar, tabs, and dialogs, with no unreviewed unlayered
      descendant rule overriding Text.css; the Text stylesheet can be reverted independently.
- [x] The shared Text attribute helper is used by `Text` and `LabelView`, and free-form Text color
      still wins through the same internal color style path.
- [x] `LabelView` sends exactly `variant`, `color`, `size`, `italic`, `bold`, and `nowrap` to its
      nested Text-compatible spans; `preWrap`, `truncate`, `align`, and `hoverUnderline` remain
      inert forwarded attributes as in the current Label implementation.
- [x] `Label` renders the exact current label → one/two `data-type="text"` span shape, including
      required-star, disabled state, attributes, and child content behavior.
- [x] `Label`, `Tag`, `SelectableRow`, `Divider`, `Dot`, `Spacer`, `Spinner`, and `ProgressBar`
      each have a `VanillaView` face mounted through `mountVanilla`; no public view class is added
      to a barrel export.
- [x] `Tag` preserves icon/label/children ordering, remove-button behavior, event propagation,
      selected/disabled/tone/variant styling, and all public attributes.
- [x] `SelectableRow.css` exists in `@layer uikit`, preserves blurred, hover, selected, active,
      and focused row behavior, and leaves the existing `selection-style.ts` consumers untouched.
- [x] A SelectableRow story exists and exercises its focused-container contract without changing
      production call sites.
- [x] `Dot`, `Spacer`, `Spinner`, and `ProgressBar` use component-scoped runtime properties or
      data attributes with valid CSS fallbacks; numeric values become px before entering custom
      properties; removed props do not leave stale styles/attributes.
- [x] Each view preserves its current rest-prop precedence: caller-last for Text/Label/Tag/
      SelectableRow/Divider/ProgressBar, component-owned writes after rest for Dot/Spinner.
- [x] ProgressBar preserves determinate/completed/indeterminate ARIA, fill geometry, variant
      colors, clamping, and `persephone-progress-bar-indeterminate-slide` timing.
- [x] Spinner keeps the US-984 CSS/layer/keyframe contract and all 14 production usages compile
      unchanged.
- [x] All public component exports and story property definitions remain compatible; no production
      call site, package dependency, or build-config change is made.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass, and Storybook/browser
      verification covers the listed state matrix in light and dark themes.

## Files changed

| File or area | Change |
|---|---|
| `src/renderer/uikit/Text/Text.tsx` | Keep the React face, import static CSS, and use the shared attribute helper |
| `src/renderer/uikit/Text/Text.css` | New layered Text selectors |
| `src/renderer/uikit/Text/text-style.ts` | Shared Text data-attribute/default resolver for React and Label |
| `src/renderer/uikit/Label/Label.tsx` / `LabelView.tsx` / `Label.css` | Vanilla face and layered label rules |
| `src/renderer/uikit/Tag/Tag.tsx` / `TagView.tsx` / `Tag.css` | Vanilla face, native remove button, and layered rules |
| `src/renderer/uikit/SelectableRow/SelectableRow.tsx` / `SelectableRowView.tsx` / `SelectableRow.css` | Vanilla face and local root rules |
| `src/renderer/uikit/SelectableRow/SelectableRow.story.tsx` | First story for the previously story-less primitive |
| `src/renderer/uikit/Divider/Divider.tsx` / `DividerView.tsx` / `Divider.css` | Vanilla face and orientation rules |
| `src/renderer/uikit/Dot/Dot.tsx` / `DotView.tsx` / `Dot.css` | Vanilla face and runtime color/size rules |
| `src/renderer/uikit/Spacer/Spacer.tsx` / `SpacerView.tsx` / `Spacer.css` | Vanilla face and sized/unsized flex rules |
| `src/renderer/uikit/Spinner/Spinner.tsx` / `SpinnerView.tsx` | Vanilla face on top of US-984 CSS |
| `src/renderer/uikit/ProgressBar/ProgressBar.tsx` / `ProgressBarView.tsx` / `ProgressBar.css` | Vanilla face, geometry variables, and stable keyframes |
| `doc/architecture/key-files.md` | Record any new shared style/helper owner if required by the implementation |
| `doc/epics/EPIC-054.md` | Link US-1000 in the task table |
| `doc/active-work.md` | Link US-1000 under EPIC-054 |
| `doc/tasks/US-1000-text-stateless-leaves/README.md` | This implementation plan |

No production caller, public barrel contract, package manifest, dependency, or build configuration
is expected to change.
