# US-1220 — Narrow native contracts and shrink `dom-props.ts`

**Status:** Open · **Epic:** [EPIC-077](../../epics/EPIC-077.md) · **Strand:** 2

## Goal

Complete the type half of R6's props-pump work. Replace the broad native `Omit<…>` contracts that are demonstrably carrying native props through a UIKit view with named, minimal native contracts. Audit `src/renderer/uikit/shared/dom-props.ts` for declarations with no remaining consumer, but do not force a shrink: the re-derived starting point is 236 lines including blank lines, exactly matching EPIC-077 §C-2, and the shared vocabulary remains needed by the 21 excluded contracts and the other direct native intersections.

This document records the implementation scope and verification contract; it does not broaden the five-contract scope.

## Background

EPIC-076 delivered the R6 props-pump half and deferred the type half to this task. EPIC-077 §C-2 records the frozen 2026-08-30 baseline as 26 `Omit<Native…>` sites across 25 files, 236 lines in `dom-props.ts`, 40 renderer files touching `applyRestProps` (39 callers plus the definition), and 22 native `on*` handlers. The current worktree contains sibling-task edits, so those numbers were re-derived rather than copied.

The pre-implementation census is:

| Measurement | Command used | Current result |
| --- | --- | ---: |
| `Omit<Native…>` sites / files | `$contractSites = rg -n "Omit<Native" src/renderer/uikit --glob '*.ts' --glob '*.tsx'; $contractFiles = rg -l "Omit<Native" src/renderer/uikit --glob '*.ts' --glob '*.tsx'` | 26 / 25 |
| `dom-props.ts` lines, including blank lines | `wc -l src/renderer/uikit/shared/dom-props.ts` or `grep -c "" src/renderer/uikit/shared/dom-props.ts` | 236 |
| renderer files using `applyRestProps` | `rg -l "applyRestProps" src/renderer --glob '*.ts' --glob '*.tsx'` | 40 (39 callers + definition) |
| native event handlers | `rg -n "on[A-Z]" src/renderer/uikit/shared/dom-props.ts` restricted to `NativeEventProps` | 22 |

Correction to EPIC-077 §C-2/§C-6: `dom-props.ts` is 236 lines including blank lines, unchanged from the epic's baseline. The epic's “smaller than 236 lines” criterion is unmet, and US-1220 is not expected to meet it because narrowing five contracts does not remove shared vocabulary still consumed by 21 other contracts and the other direct Native intersections. Forcing a deletion to get under the line count would game the metric. A declaration goes only when a repository-wide consumer sweep proves it has no consumer. The criterion should be replaced in the epic; the measurable result here is the five verified contract narrowings, the 21 unchanged exclusions, and the rendered attribute-set diff.

`(Get-Content … | Measure-Object -Line).Lines` is not a valid line-count claim for this file: `Get-Content` omits blank input lines before `Measure-Object` sees them. Use `wc -l` or `grep -c ""` for the inclusive count and record 236.

The 22 handlers are declared in `NativeEventProps`, not in the body of `NativeHTMLAttributes`. The exact current handler names are `onBlur`, `onClick`, `onContextMenu`, `onFocus`, `onFocusCapture`, `onKeyDown`, `onMouseDown`, `onMouseEnter`, `onMouseLeave`, `onMouseMove`, `onMouseUp`, `onPaste`, `onPointerDown`, `onPointerLeave`, `onPointerMove`, `onPointerUp`, `onDragEnd`, `onDragEnter`, `onDragLeave`, `onDragOver`, `onDragStart`, and `onDrop`.

The exact PowerShell file-count command used alongside the site-count command was:

```powershell
$contractSites = rg -n "Omit<Native" src/renderer/uikit --glob '*.ts' --glob '*.tsx'
$contractFiles = rg -l "Omit<Native" src/renderer/uikit --glob '*.ts' --glob '*.tsx'
$contractSites.Count
$contractFiles.Count
```

After the five changes, the same `Omit<Native` census is expected to report 21 sites across 20 files; the 26/25 result above is the pre-implementation baseline required for comparison.

The first census command is intentionally the same narrow pattern used by the epic: it counts the 26 single-line `Omit<Native…>` sites. The repository also contains multiline direct `NativeHTMLAttributes` intersections in `Dialog/Dialog.ts`, `Dot/DotView.ts`, `ListBox/types.ts`, `Minimap/Minimap.ts`, `PathInput/PathInputModel.ts`, `Slider/SliderView.ts`, `Tag/TagView.ts`, `TagsInput/TagsInput.ts`, `Textarea/TextareaView.ts`, and `Toolbar/Toolbar.ts`. Those are not additional US-1220 `Omit<Native…>` sites. The four shared type modules called out by the epic are explicitly frozen below.

The risk is the one recorded in EPIC-077 §C-5: a narrowed type can silently reject a prop at compile time only for the changed call shape, while a prop that remains structurally present but is omitted from the forwarded rest object can disappear at runtime. In this area, a passing `typecheck` is not a behavioural proof. Every proposed narrowing therefore has two independent records: the view's actual forwarding path and a caller sweep that includes the component story. Public exports through `src/renderer/uikit/index.ts` are called out because those are API changes, not merely internal cleanup.

### Re-derived contract inventory

The following table is the working inventory. “Forwarding” means the residual object passed to `applyRestProps`, plus native values consumed directly or updated through `setRestProp`. “Callers” records the result of sweeping both named prop types and constructor/update sites with `rg`, including the story file. A blank native-residual result is evidence for exclusion, not permission to guess.

| Contract site | Forwarding and caller finding | Public through `uikit`? | Decision |
| --- | --- | --- | --- |
| `src/renderer/uikit/Button/ButtonView.ts` — `ButtonProps` | `applyConstructionRestProps` removes the component props and forwards the rest to the button. `applyProps` consumes `type` and `disabled`; `updateTargetedRestProps` updates `onClick`, `role`, `aria-checked`, and `tabIndex`. The sweep covers the button story and the many `ButtonView` construction/update callers in editors, dialogs, settings, menus, toolbars, and stories; no other native residual was found. | Yes, `src/renderer/uikit/index.ts` | Narrow |
| `src/renderer/uikit/IconButton/IconButtonView.ts` — `IconButtonProps` | `applyConstructionRestProps` forwards the residual to the button; `applyProps` consumes button state. `BrowserView.ts` updates `hidden`; `SelectView.ts`, `MultiSelectView.ts`, and `Input.story.ts` pass `tabIndex: -1` to icon buttons. The sweep also covers `IconButton.story.ts` and all direct app construction/update sites. | Yes | Narrow |
| `src/renderer/uikit/Input/InputView.ts` — `InputProps` | The rest object is forwarded to the inner `field`, not the wrapper. `applyProps` consumes `autoFocus`, `checked`, `defaultValue`, `disabled`, `readOnly`, `type`, and `value`; `updateTargetedRestProps` updates `placeholder`, `autoComplete`, ARIA labels/relations, `onFocus`, `onBlur`, and `onContextMenu`. `BrowserView.ts` is a live caller for `placeholder`, `autoComplete`, `onFocus`, `onBlur`, and `onContextMenu`; the sweep includes `Input.story.ts`, `DateInput.story.ts`, nested UIKit callers, and the app's direct input callers. | Yes | Narrow |
| `src/renderer/uikit/Checkbox/CheckboxView.ts` — `CheckboxProps` | `applyConstructionRestProps` forwards the residual to the label. `handleClick` deliberately checks `this.props.onClick` and preserves the prior contract in which a caller `onClick` replaces the default toggle behavior. The sweep covers `Checkbox.story.ts` and typed callers in settings, MCP, REST-client, dialogs, and Storybook; native `onClick` is the live residual signal. | Yes | Narrow |
| `src/renderer/uikit/Popover/PopoverModel.ts` — `PopoverProps` | `PopoverFloatingView.getRestProps` forwards the residual to the floating root at mount. `onKeyDown` is a component prop handled by `onRootKeyDown`, so it must not be confused with the native residual. `UrlSuggestionsDropdown.ts` currently passes native `onMouseDown` to prevent focus loss; the sweep includes `Popover.story.ts` and all direct popover callers. | Yes | Narrow |
| `src/renderer/uikit/CategoryList/CategoryList.ts` — `CategoryListProps` | `CategoryListView.applyConstructionRestProps` forwards residual props to its root; its own `tabIndex` is assigned by `applyRootProps`. The story and callers in `NotebookTagsSecondaryView`, `LinkTagsPanel`, `LinkHostnamesNavigationPanel`, and `CategoryEditor.ts` pass component props only. | Yes | Exclude |
| `src/renderer/uikit/Breadcrumb/Breadcrumb.ts` — `BreadcrumbProps` | `BreadcrumbView` forwards residual props once at construction. `Breadcrumb.story.ts`, the notebook and link-editor views, and `CategoryEditor.ts` show no native residual caller. | Yes | Exclude |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.ts` — `CollapsiblePanelProps` | `CollapsiblePanelStackView` consumes panel `id`, `title`, and `children`; residual props are forwarded only on the root path. The stack story and `SecondaryViewsView.ts` use the component fields and no native residual. | Yes | Exclude |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.ts` — `CollapsiblePanelStackProps` | `CollapsiblePanelStackView.applyRootProps` consumes stack configuration and `applyConstructionRestProps` forwards the remainder once. The story and `SecondaryViewsView.ts` pass stack configuration only. | Yes | Exclude |
| `src/renderer/uikit/Dialog/DialogContent.ts` — `DialogContentProps` | `DialogContentView` forwards residual props to the content root at construction; title and children are component fields. `Dialog.story.ts` and dialog views pass the component surface; no DialogContent native residual was found. | Yes | Exclude |
| `src/renderer/uikit/ListBox/SectionItem.ts` — `SectionItemProps` | `SectionItemView` forwards residual props to its root; `ListBoxView` supplies `id` and `label`. `ListBox.story.ts` and the internal section construction pass no native residual. | Yes | Exclude |
| `src/renderer/uikit/ListBox/ListItem.ts` — `ListItemProps` | `ListItemView` forwards residual props and assigns row ARIA/drag state itself. `ListBoxView`, sidebar/link-editor list callers, and `ListBox.story.ts` pass list-item fields; no additional native residual was found. | Yes | Exclude |
| `src/renderer/uikit/SelectableRow/SelectableRowView.ts` — `SelectableRowProps` | `SelectableRowView` forwards residual props to the row root. `SelectableRow.story.ts` and `EnvVarsBodyView.ts` use `name`, `selected`, `active`, and `children` only. This type is not re-exported by the root `uikit/index.ts`, but it is still a direct module contract. | No root export | Exclude |
| `src/renderer/uikit/MultiSelect/MultiSelectModel.ts` — `MultiSelectProps` | `MultiSelectView.restProps` forwards residual props to the root; the input's native props are explicitly constructed by `inputProps`. `MultiSelect.story.ts` is the only direct typed story caller found and uses the component surface only. | Yes | Exclude |
| `src/renderer/uikit/Label/Label.ts` — `LabelProps` | `LabelView` forwards residual props to the label root. `PropertyEditor.ts` and the dialog callers use text-style and label fields; `Label.story.ts` has no native residual. `htmlFor` is not passed by a renderer caller. | Yes | Exclude |
| `src/renderer/uikit/Notification/Notification.ts` — `NotificationProps` | `NotificationView` forwards residual props to the notification root; `onClick` is the component callback and is handled by the view. `AlertItemView.ts` and `Notification.story.ts` use the notification surface only. | Yes | Exclude |
| `src/renderer/uikit/MultiListBox/MultiListBox.ts` — `MultiListBoxProps` | `MultiListBoxView.restProps` forwards residual root props; `MultiSelectView` supplies the nested control props explicitly. `MultiListBox.story.ts` and the internal caller use the component fields only. | Yes | Exclude |
| `src/renderer/uikit/Spinner/SpinnerView.ts` — `SpinnerProps` | `SpinnerView` forwards residual props to the span once. The spinner callers in Tree, ListBox, Browser, Mermaid, Graph, Draw, Progress, and dialogs, plus `Spinner.story.ts`, use spinner fields only. | Yes | Exclude |
| `src/renderer/uikit/Select/SelectModel.ts` — `SelectProps` | `SelectView.restProps` forwards residual props to the root; `inputProps` explicitly forwards input fields and `chevronProps` explicitly sets `tabIndex: -1` on the nested icon button. The story and graph/link-dialog/MCP/settings/select-dialog/script-panel callers use Select fields only. | Yes | Exclude |
| `src/renderer/uikit/ProgressBar/ProgressBar.ts` — `ProgressBarProps` | `ProgressBarView` forwards residual props to the root; `aria-label` is a component field. `BoardInfoEditorView`, `RootsPanel`, `ModelPanel`, `ProgressOutputView`, and `ProgressBar.story.ts` show no other native residual. | Yes | Exclude |
| `src/renderer/uikit/Splitter/SplitterView.ts` — `SplitterProps` | `SplitterView` forwards residual props at construction. Its comment records native drag listeners as authoritative and says production callers do not use residual pointers. The story and app splitters use orientation/value/drag configuration only. | Yes | Exclude |
| `src/renderer/uikit/Tree/SectionItem.ts` — `SectionItemProps` | `Tree/SectionItemView` forwards residual props; `TreeView.sectionProps` supplies the component fields. `Tree.story.ts` and Tree's internal path show no native residual. | Yes, as `TreeSectionItemProps` | Exclude |
| `src/renderer/uikit/Tree/TreeItem.ts` — `TreeItemProps` | `TreeItemView` forwards residual props and Tree supplies the custom `onContextMenu`; `TreeView.itemProps` is the sole production construction path, with `Tree.story.ts` exercising Tree. No separate native residual caller was found. | Yes | Exclude |
| `src/renderer/uikit/SplitButton/SplitButton.ts` — `SplitButtonProps` | `SplitButtonView` forwards residual props to its wrapper; primary Button/IconButton props are built explicitly. `SplitButton.story.ts`, `PageTabsView.ts`, `GitTreeEditorView.ts`, and `BoardsSecondaryView.ts` use SplitButton fields only. | Yes | Exclude |
| `src/renderer/uikit/TruncatedText/TruncatedText.ts` — `TruncatedTextProps` | `TruncatedTextView` forwards residual props to the span once and owns `children`. `TruncatedText.story.ts` is the only story-level surface found; no native residual caller was found. | Yes | Exclude |
| `src/renderer/uikit/Autocomplete/AutocompleteModel.ts` — `AutocompleteProps` | `AutocompleteView.restProps` forwards residual root props; placeholder, focusability, and ARIA are explicitly supplied to the nested Input. `Autocomplete.story.ts` and `KeyValueEditorView.ts` use the Autocomplete fields only. | Yes | Exclude |

The resulting proposal is **5 contracts to narrow and 21 contracts to exclude**. The excluded set is intentional: for each, the repository currently supplies no native residual evidence strong enough to justify changing a public or widely composed surface, and narrowing it would buy little while expanding the silent-loss risk. Exclusion is not a claim that those types are ideal; it records that they need a separate API decision or a new caller requirement.

## Implementation plan

1. Before editing, repeat the census commands above and run the caller sweep from the repository root for each contract. The sweep must include both named type references and constructor/update sites:

   ```powershell
   rg -n "\b${TypeName}\b|new ${ViewName}\b|\.update\(" src --glob '*.ts' --glob '*.tsx'
   rg --files src/renderer/uikit | rg '${Component}.*\.story\.(ts|tsx)$'
   ```

   For the five selected contracts, record any native key that appears in the caller object, then compare it with the view's rest destructuring and targeted setter path. Do not infer “not used” from a type declaration alone.

2. Keep `src/renderer/uikit/shared/dom-props.ts` unchanged unless the consumer-proof audit independently finds a dead declaration. In each selected contract, use an explicit `Pick` of the existing element-specific native type and include the existing `aria-*` and `data-*` mapped keys. Keep the existing DOM application semantics in `applyRestEntry`, `applyRestProps`, `setRestProp`, and `clearRestListeners`; this task changes the five accepted type surfaces, not event installation or attribute serialization.

   The intended before → after shape is:

   ```ts
   // Before: every non-omitted NativeHTML field is accepted.
   export interface ButtonProps
       extends Omit<NativeButtonHTMLAttributes<HTMLButtonElement>, "title" | "onKeyDown" | "children"> {
   ```

   ```ts
   // After: only fields proven by the view/caller sweep remain,
   // while the shared aria-* and data-* maps remain available.
   export interface ButtonProps
       extends Pick<NativeButtonHTMLAttributes<HTMLButtonElement>,
           "autoFocus" | "type" | "onClick" | "role" | "tabIndex" | "hidden"
           | `aria-${string}` | `data-${string}`> {
   ```

   Repeat this inline `Pick` pattern for the other four contracts. The implemented key sets are: Button — `autoFocus`, `type`, `onClick`, `role`, `tabIndex`, `hidden`, plus ARIA/data; IconButton — `autoFocus`, `type`, `hidden`, `role`, `tabIndex`, `children`, plus ARIA/data, with `disabled` remaining an explicit component field; Input — `autoFocus`, `checked`, `defaultValue`, `disabled`, `readOnly`, `type`, `value`, `min`, `max`, `step`, `placeholder`, `autoComplete`, `onClick`, `onFocus`, `onBlur`, `onContextMenu`, plus ARIA/data; Checkbox — native `onClick` plus ARIA/data, with `disabled` remaining a component field; Popover — native `onMouseDown` and `role` plus ARIA/data, with component `onKeyDown` separate. These keys are the result of the typecheck-driven caller sweep and must not be reduced further without repeating it.

3. Update only the five selected contract declarations and their imports: `src/renderer/uikit/Button/ButtonView.ts`, `src/renderer/uikit/IconButton/IconButtonView.ts`, `src/renderer/uikit/Input/InputView.ts`, `src/renderer/uikit/Checkbox/CheckboxView.ts`, and `src/renderer/uikit/Popover/PopoverModel.ts`. Do not change view forwarding logic unless type narrowing exposes a real mismatch between the verified rest path and the helper. Do not edit any excluded contract site merely to make the census look cleaner.

4. In `src/renderer/uikit/shared/dom-props.ts`, audit the native vocabulary after the selected contracts and the full non-target Native intersections have been rechecked. The current file has 236 lines including blank lines, unchanged from EPIC-077's baseline, and no shrink is expected merely as a consequence of narrowing five contracts: the shared vocabulary is still used by the 21 excluded contracts and the other direct Native intersections. Remove a declaration only if a repository-wide source and story sweep proves it has no consumer; otherwise leave `dom-props.ts` unchanged. Never force a line-count reduction to satisfy the unmet line-count criterion.

5. Verify the silent-risk boundary with an executable rendered before/after attribute diff. Do this once before the type edits and once after them in the Storybook host, rendering the existing `src/renderer/uikit/Button/Button.story.ts` and `src/renderer/uikit/Input/Input.story.ts` fixtures. Also repeat the capture for the `IconButton`, `Checkbox`, and `Popover` stories when checking their selected contracts. In the active Storybook story's browser console, capture sorted attribute-name lists with:

   ```js
   const names = (selector) => {
     const element = document.querySelector(selector);
     if (!element) throw new Error(`Missing ${selector}`);
     return element.getAttributeNames().sort();
   };
   JSON.stringify({
     root: names('[data-type="button"]'),
   });
   ```

   Run the same expression in the Input story with `root: names('[data-type="input"]')` and `field: names('[data-type="input"] input')`; in the IconButton and Checkbox stories use `[data-type="icon-button"]` and `[data-type="checkbox"]`. In the Popover story, open the floating surface first and use its verified `[data-type="popover"]` root. The Button and Input stories are the mandatory widest-surface samples. Save the JSON from the pre-edit checkout and post-edit checkout and compare the sorted arrays exactly; a missing or new name fails the verification. For the running app, repeat the Input capture against `[data-name="url-input"]` and its inner `input`, and the Popover capture against `[data-name="url-suggestions"]` after it opens, as described by `doc/architecture/ui-element-contract.md`. Also exercise update paths for `ButtonView`, `InputView`, and the Browser popover, because some native keys are applied through targeted setters.

6. Run the repository verification commands exactly as defined in `package.json`: `npm run typecheck`, `npm run lint`, and `npm run build-prod`. Then rerun the four census measurements, record whether the consumer-proof audit changed `dom-props.ts` (no change is the expected result), and confirm the four frozen shared type modules remain absent from the diff.

### Public-surface decision

The five selected types are re-exported by their component barrels — `src/renderer/uikit/Button/index.ts`, `src/renderer/uikit/IconButton/index.ts`, `src/renderer/uikit/Input/index.ts`, `src/renderer/uikit/Checkbox/index.ts`, and `src/renderer/uikit/Popover/index.ts` — and again by the root `src/renderer/uikit/index.ts`. They are therefore API changes in principle. In practice, `uikit/` is an internal library: the caller sweep found no consumer outside this repository, and every in-repository direct type import, constructor/update path, and story is in scope for the sweep. The closed consumer set makes these five changes safe, provided the verified native fields and the `aria-*`/`data-*` maps are retained. No further re-export barrel was found. `SelectableRowProps` is not root-exported, but it remains excluded because its direct internal contract has no native residual evidence. No new barrel exports are needed.

### Files needing NO changes

The following 21 contract sites are explicitly excluded and must not be edited by this task:

- `src/renderer/uikit/CategoryList/CategoryList.ts` — no native residual in story or callers; public-surface risk outweighs the small narrowing gain.
- `src/renderer/uikit/Breadcrumb/Breadcrumb.ts` — no native residual in story or callers.
- `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.ts` — both `CollapsiblePanelProps` and `CollapsiblePanelStackProps` are excluded; callers use component fields only.
- `src/renderer/uikit/Dialog/DialogContent.ts` — public content contract has no native residual caller.
- `src/renderer/uikit/ListBox/SectionItem.ts` and `src/renderer/uikit/ListBox/ListItem.ts` — row/section callers use the custom list surface; residual forwarding is still part of a public row contract.
- `src/renderer/uikit/SelectableRow/SelectableRowView.ts` — internal-only contract with no native residual caller.
- `src/renderer/uikit/MultiSelect/MultiSelectModel.ts` and `src/renderer/uikit/MultiListBox/MultiListBox.ts` — composed controls have no root residual caller and nested input forwarding is explicit.
- `src/renderer/uikit/Label/Label.ts` — no `htmlFor` or other native residual caller.
- `src/renderer/uikit/Notification/Notification.ts` — `onClick` is component behavior, not an unused native contract to retag.
- `src/renderer/uikit/Spinner/SpinnerView.ts` — callers use spinner props only.
- `src/renderer/uikit/Select/SelectModel.ts` — nested input and chevron props are explicit; no Select-root residual caller.
- `src/renderer/uikit/ProgressBar/ProgressBar.ts` — no native residual beyond the named ARIA field.
- `src/renderer/uikit/Splitter/SplitterView.ts` — the view documents native drag listeners as authoritative and callers do not use residual pointers.
- `src/renderer/uikit/Tree/SectionItem.ts` and `src/renderer/uikit/Tree/TreeItem.ts` — Tree supplies its row fields and custom context-menu behavior; no separate native residual caller.
- `src/renderer/uikit/SplitButton/SplitButton.ts` — wrapper residuals have no caller evidence and child button contracts are separate.
- `src/renderer/uikit/TruncatedText/TruncatedText.ts` — story-only custom surface with no native residual caller.
- `src/renderer/uikit/Autocomplete/AutocompleteModel.ts` — root residuals are unused; nested Input forwarding is explicit.

Also leave these existing direct `NativeHTMLAttributes` intersections untouched: `src/renderer/uikit/Dialog/Dialog.ts`, `src/renderer/uikit/Dot/DotView.ts`, `src/renderer/uikit/Divider/Divider.ts`, `src/renderer/uikit/Minimap/Minimap.ts`, `src/renderer/uikit/PathInput/PathInputModel.ts`, `src/renderer/uikit/Slider/SliderView.ts`, `src/renderer/uikit/Tag/TagView.ts`, `src/renderer/uikit/TagsInput/TagsInput.ts`, `src/renderer/uikit/Textarea/TextareaView.ts`, and `src/renderer/uikit/Toolbar/Toolbar.ts`. They are outside the measured `Omit<Native…>` set and need their own caller evidence. In particular, do not touch `src/renderer/uikit/Tree/types.ts`, `src/renderer/uikit/VirtualGrid/types.ts`, `src/renderer/uikit/ListBox/types.ts`, or `src/renderer/uikit/DataGrid/types.ts`; EPIC-077 requires all four shared `types.ts` modules to remain untouched.

## Concerns

- The type system cannot detect a caller whose native prop is supplied through an untyped spread, an inferred object, or a future external consumer. The caller sweep must inspect direct constructor/update object shapes, named prop types, and each story rather than relying on `rg` results for the interface name alone.
- `applyRestProps` is mostly construction-time in these views. A before/after typecheck can therefore pass while a runtime attribute disappears. The browser attribute diff is mandatory and is the primary protection against the §C-5 failure mode.
- `NativeHTMLAttributes` currently carries `aria-*` and `data-*` mapped attributes alongside event and element fields. The replacement helper must retain those maps or it will break the `data-name` addressing contract and accessibility attributes even if ordinary HTML attributes look correct.
- `NativeEventProps` has 22 handlers, but the handler count is not a list of safe removals. `onKeyDown` is component-owned in Button/Popover and `onClick` is component-owned or behaviourally significant in several views. Remove handlers only after tracing every unchanged direct Native intersection and every `applyRestProps` caller.
- `dom-props.ts` is 236 lines including blank lines, exactly EPIC-077's frozen measurement. The line-count criterion is unmet and is not expected to be met here; the implementation must not force a deletion or claim success from an alternate blank-line-excluding count.
- This task closes none of EPIC-077's four statements. It is strand-2 type-contract work scheduled last because its failure signal is otherwise only a green `typecheck`.

## Acceptance criteria

- The five selected contracts are narrowed to the native fields verified in their forwarding and caller records; the 21 excluded contracts remain unchanged and are not silently broadened or narrowed.
- `src/renderer/uikit/shared/dom-props.ts` is changed only when the consumer-proof audit identifies a declaration with no remaining source or story consumer; no shrink is required, and the current 236-line figure is recorded as unchanged from EPIC-077's baseline.
- The five selected contracts accept exactly the native fields verified by their forwarding paths and closed caller sweep; the 21 excluded contracts are unchanged.
- The sorted `getAttributeNames()` output is identical before and after for the Button and Input Storybook fixtures (including the inner Input field), and for the selected IconButton, Checkbox, and Popover samples plus the stable running-app `data-name` samples where exercised.
- `npm run typecheck` is green.
- `npm run lint` is green.
- `npm run build-prod` is green.
- `src/renderer/uikit/Tree/types.ts`, `src/renderer/uikit/VirtualGrid/types.ts`, `src/renderer/uikit/ListBox/types.ts`, and `src/renderer/uikit/DataGrid/types.ts` are untouched.
- No dashboard entry is added; EPIC-077 already lists US-1220.

## Files Changed summary

| File | Planned change |
| --- | --- |
| `src/renderer/uikit/shared/dom-props.ts` | Consumer-proof audit only; no change is expected. Preserve the 236-line shared vocabulary and rest-prop runtime behavior unless a declaration is independently proven dead. |
| `src/renderer/uikit/Button/ButtonView.ts` | Replace the broad `ButtonProps` native `Omit` with the verified narrow helper. |
| `src/renderer/uikit/IconButton/IconButtonView.ts` | Replace the broad `IconButtonProps` native `Omit` with the verified narrow helper. |
| `src/renderer/uikit/Input/InputView.ts` | Replace the broad `InputProps` native `Omit` with the verified narrow input helper. |
| `src/renderer/uikit/Checkbox/CheckboxView.ts` | Replace the broad `CheckboxProps` native `Omit` with the verified narrow label helper, retaining native `onClick`. |
| `src/renderer/uikit/Popover/PopoverModel.ts` | Replace the broad `PopoverProps` native `Omit` with the verified narrow helper, retaining native `onMouseDown` and component `onKeyDown` separately. |
