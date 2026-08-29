# US-1206 — `applyRestProps` at construction only

## Goal

Make `applyRestProps` run once for each DOM element during its initial construction/mount pass,
never from `VanillaView.update()` or any state-driven update path. Preserve residual attributes,
ARIA, native listeners, disposal, and the existing enumerated-attribute semantics. This is a
planning document: this pass makes no source implementation and adds no tests or harnesses.

The working recommendation is to treat the initial `onMount()` configuration pass as the
construction pass. `VanillaView` deliberately creates only the root in its constructor and builds
DOM/installations in `mount()` ([`vanilla-view.ts:32-40`](../../../src/renderer/uikit/shared/vanilla-view.ts#L32-L40)); moving listener installation into a JavaScript constructor would violate UIKit Rule 9.

## Background

EPIC-076 B-1 statement 4 requires the behavioral property: one residual-props application per
element at construction, with no update-path re-spread, while residual ARIA/native listeners and
enumerated values continue to work ([`EPIC-076.md:24-44`](../../epics/EPIC-076.md#b-1--the-closing-property)). The epic explicitly leaves the `dom-props.ts` type surface intact; narrowing
`NativeHTMLAttributes` is the type half of R6 and belongs with Epic C ([`EPIC-076.md:114-123`](../../epics/EPIC-076.md#b-3--what-this-epic-deliberately-leaves-behind)).

The current helper owns two pieces of state: the attribute-name `Set` and listener-entry `Map`
inside `RestPropsState` ([`dom-props.ts:114-127`](../../../src/renderer/uikit/shared/dom-props.ts#L114-L127)). Every current call removes stale previous attributes/listeners, then re-adds or replaces every
entry ([`dom-props.ts:163-205`](../../../src/renderer/uikit/shared/dom-props.ts#L163-L205)). That is the listener-identity churn this task removes; it is not permission to discard the state object.

### Re-measured census

Measured against the current working tree on 2026-08-29 with this instrument:

```powershell
rg -l --glob '*.ts' --glob '*.tsx' 'applyRestProps\(' src/renderer/uikit
rg -n --glob '*.ts' --glob '*.tsx' 'applyRestProps\(' src/renderer/uikit
rg -n --glob '*.ts' --glob '*.tsx' 'applyRestProps\(' src/renderer/uikit src/renderer/editors/shared/ColorizedCodeView.ts
```

The second result was filtered to exclude the declaration `export function applyRestProps` in
`shared/dom-props.ts:155`. The uikit-only result is **39 invocation expressions in 38 component
files**. The repo-wide census also includes the missed non-uikit
[`ColorizedCodeView.ts`](../../../src/renderer/editors/shared/ColorizedCodeView.ts), so the
pre-conversion population is **40 invocation expressions in 39 component files** (41 raw matches
in 40 files including the shared declaration). After deleting Minimap row 17b and converting
ColorizedCodeView, the implementation retains **39 construction-only invocations in 39 component
files** (40 raw matches in 40 files including the declaration). Therefore the old EPIC-076 baseline
of 40/40 was wrong rather than a source reduction caused by US-1203A/B, US-1204, or US-1205.

What has changed since the inherited baseline is the surrounding implementation: US-1203A/B
collapsed many retained-child paths, US-1204 removed `ElementRef`/`bindRef` from the renderer, and
US-1205 removed the memo sites. Before this conversion, 38 of the 39 uikit expressions were in
methods reachable from an `onUpdate()` path; the first Minimap call was already mount-only, while
its second call was the update-path duplicate. The complete census also included ColorizedCodeView's
mount and update calls. The current source has removed both update-path duplicates and retains one
construction-only call in each of the 39 component files
([`MinimapView.ts:70-90`](../../../src/renderer/uikit/Minimap/MinimapView.ts#L70-L90)).

The line-by-line census and verdicts below are the conversion inventory. “Construction-only” means
the residual payload is applied during the initial mounted-element setup and is not re-spread when
ordinary configuration or live state changes. “Needs a targeted setter” means the named residual
field has a verified consumer that changes after mount and must be projected directly.

## Per-site classification

| # | Current call site | Current path | Verdict and evidence | Verified surface |
|---:|---|---|---|---|
| 1 | [`AutocompleteView.ts:264`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L264) | `applyRoot`, called by mount/update | **Construction-only** for the root. Dynamic input ARIA/placeholder values are projected into `InputView`, not this root ([`AutocompleteView.ts:320-342`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L320-L342)). | REST-client key autocomplete ([`KeyValueEditorView.ts:160-177`](../../../src/renderer/editors/rest-client/KeyValueEditorView.ts#L160-L177)) |
| 2 | [`BreadcrumbView.ts:54`](../../../src/renderer/uikit/Breadcrumb/BreadcrumbView.ts#L54) | `applyProps` | **Construction-only**; label/link structure is the component configuration and no residual field is a live output. | Category, link-editor, and notebook breadcrumbs; Storybook registration ([`storyRegistry.ts:17-18`](../../../src/renderer/editors/storybook/storyRegistry.ts#L17-L18)) |
| 3 | [`ButtonView.ts:94`](../../../src/renderer/uikit/Button/ButtonView.ts#L94) | `applyProps` | **Needs targeted setters:** `onClick`; and `role`, `aria-checked`, `tabIndex` where supplied as residual props. `ButtonView` consumes `onKeyDown`/title itself but leaves `onClick` in `rest` ([`ButtonView.ts:78-97`](../../../src/renderer/uikit/Button/ButtonView.ts#L78-L97)). | Segmented-control buttons update all four fields ([`SegmentedControlView.ts:44-50,86-100`](../../../src/renderer/uikit/SegmentedControl/SegmentedControlView.ts#L44-L50)); SplitButton primary buttons also update `onClick` ([`SplitButtonView.ts:99-107`](../../../src/renderer/uikit/SplitButton/SplitButtonView.ts#L99-L107)). |
| 4 | [`CategoryListView.ts:291`](../../../src/renderer/uikit/CategoryList/CategoryListView.ts#L291) | `applyRootProps` | **Construction-only**; the changing category/search data is handled by the list/model path, while residual root props are configuration. | Link hostnames/tags and notebook tags |
| 5 | [`CheckboxView.ts:59`](../../../src/renderer/uikit/Checkbox/CheckboxView.ts#L59) | `applyProps` | **Construction-only** for residual props. `checked`, `disabled`, and the toggle callback are direct fields/owned behavior; the real caller changes those explicitly ([`CheckboxView.ts:79-85`](../../../src/renderer/uikit/Checkbox/CheckboxView.ts#L79-L85)). | REST-client, MCP tool forms, settings, grid CSV, dialogs ([`ToolArgForm.ts:207-217`](../../../src/renderer/editors/mcp-inspector/ToolArgForm.ts#L207-L217)) |
| 6 | [`CollapsiblePanelStackView.ts:94`](../../../src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts#L94) | `applyRootProps` | **Construction-only**; stack descriptors are the live child channel and no dynamic residual is produced. | Secondary views and Storybook ([`storyRegistry.ts:10-11`](../../../src/renderer/editors/storybook/storyRegistry.ts#L10-L11)) |
| 7 | [`DialogContentView.ts:110`](../../../src/renderer/uikit/Dialog/DialogContentView.ts#L110) | `applyProps` | **Construction-only**; icon/header/close changes are targeted child updates, not residual root props. | Commit, confirmation, create-board, link-editor, and other dialogs |
| 8 | [`DialogView.ts:117`](../../../src/renderer/uikit/Dialog/DialogView.ts#L117) | `applyProps` | **Construction-only**; dialog model/visibility/content paths are explicit. | Application dialogs and link-editor dialog |
| 9 | [`DividerView.ts:36`](../../../src/renderer/uikit/Divider/DividerView.ts#L36) | `applyProps` | **Construction-only**; orientation is owned directly and residual overrides are not live in callers. | About, settings, Git, MCP, log, and Mneme panels |
| 10 | [`DotView.ts:78`](../../../src/renderer/uikit/Dot/DotView.ts#L78) | `applyProps` | **Construction-only** in current surfaces. `onClick` is part of the residual bridge, but the verified update-dot consumer creates/removes the dot and does not update its callback ([`BoardToolbar.ts:191-203`](../../../src/renderer/editors/board/BoardToolbar.ts#L191-L203)). If a future caller re-pushes a live dot's `onClick`, it will silently retain the stale callback. | Board toolbar, browser, boards, MCP, Mneme, and settings status dots |
| 11 | [`IconButtonView.ts:81`](../../../src/renderer/uikit/IconButton/IconButtonView.ts#L81) | `applyProps` | **Construction-only** for residual props. `onClick` is explicitly consumed by the stable owned listener and reads current props ([`IconButtonView.ts:64-81,128-135`](../../../src/renderer/uikit/IconButton/IconButtonView.ts#L64-L81)). | Browser, sidebar, editors, toolbars, dialogs, Git, graph, image, and notebook |
| 12 | [`InputView.ts:130`](../../../src/renderer/uikit/Input/InputView.ts#L130) | `applyProps` | **Needs targeted setters:** `placeholder`, `autoComplete`, `aria-label`, `aria-labelledby`, `aria-haspopup`, `aria-expanded`, `aria-autocomplete`, `aria-controls`; and residual `onFocus`, `onBlur`, `onContextMenu` listener replacement. Autocomplete and PathInput re-push these values after mount ([`AutocompleteView.ts:320-342`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L320-L342); [`PathInputView.ts:202-221`](../../../src/renderer/uikit/PathInput/PathInputView.ts#L202-L221)); Browser re-pushes the URL input and its residual listeners ([`BrowserView.ts:285,320`](../../../src/renderer/editors/browser/BrowserView.ts#L285-L320)). | Browser URL bar, file/search inputs, category/tree search, REST key/value editor, Select/Autocomplete/PathInput, dialogs, settings, graph, notebook, and MCP forms |
| 13 | [`LabelView.ts:55`](../../../src/renderer/uikit/Label/LabelView.ts#L55) | `applyProps` | **Construction-only**; the intentionally residual label attributes are not changed by the verified label consumers, while text/required children are targeted separately ([`LabelView.ts:47-55`](../../../src/renderer/uikit/Label/LabelView.ts#L47-L55)). | Password/library dialogs and Storybook |
| 14 | [`ListBoxView.ts:282`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L282) | `applyArm` | **Construction-only** for root residual props. Active/selection/ARIA arm fields remain explicit; state refresh must not re-spread residual props. | File list, open tabs, built-in editors, browser URL suggestions, MCP tools, links, and Select/MultiSelect dropdowns |
| 15 | [`ListItemView.ts:172`](../../../src/renderer/uikit/ListBox/ListItemView.ts#L172) | pooled row `applyProps` | **Construction-only for the current residual payload.** `ListBoxView.itemProps()` supplies explicit row fields and no residual spread ([`ListBoxView.ts:417-440`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L417-L440)). Preserve `ListItemView.update()` because it is the virtualized row re-point, not a removable configuration update ([`ListItemView.ts:12-20,98-101`](../../../src/renderer/uikit/ListBox/ListItemView.ts#L12-L20)). | File/link/MCP/list dropdown rows |
| 16 | [`ListBox/SectionItemView.ts:39`](../../../src/renderer/uikit/ListBox/SectionItemView.ts#L39) | pooled section `applyProps` | **Construction-only for the current payload**; the section factory supplies `name`, `id`, and `label`, with no live residual fields. | Group headers in ListBox consumers |
| 17a | [`MinimapView.ts:70`](../../../src/renderer/uikit/Minimap/MinimapView.ts#L70) | `onMount` | **Construction-only; retain this one initial application.** Markdown passes only static `name` and `scrollContainer` ([`MarkdownBodyView.ts:455-464`](../../../src/renderer/editors/markdown/MarkdownBodyView.ts#L455-L464)). | Markdown editor minimap |
| 17b | [`MinimapView.ts:90`](../../../src/renderer/uikit/Minimap/MinimapView.ts#L90) | `onUpdate` | **Construction-only; delete this duplicate update-path application.** `name` and scroll-container changes are direct fields at [`MinimapView.ts:81-93`](../../../src/renderer/uikit/Minimap/MinimapView.ts#L81-L93). | Markdown editor minimap |
| 18 | [`MultiListBoxView.ts:216`](../../../src/renderer/uikit/MultiListBox/MultiListBoxView.ts#L216) | `applyRoot` | **Construction-only**; search/selection/state are child/model channels and the root residual payload is configuration. | MultiSelect dropdown and MultiListBox story ([`MultiSelectView.ts:182-201`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L182-L201); [`storyRegistry.ts:55-56`](../../../src/renderer/editors/storybook/storyRegistry.ts#L55-L56)) |
| 19 | [`MultiSelectView.ts:138`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L138) | `applyRoot` | **Construction-only**; selected text, open state, and the retained list are explicit child/model updates ([`MultiSelectView.ts:145-167`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L145-L167)). | MultiSelect surfaces and Storybook ([`storyRegistry.ts:55-56`](../../../src/renderer/editors/storybook/storyRegistry.ts#L55-L56)) |
| 20 | [`NotificationView.ts:127`](../../../src/renderer/uikit/Notification/NotificationView.ts#L127) | `applyProps` | **Construction-only** for residual props. `onClick` is consumed by the owned root listener, and type/message/close are explicit updates ([`NotificationView.ts:79-100,103-127`](../../../src/renderer/uikit/Notification/NotificationView.ts#L79-L127)). | Toasts via `AlertItemView`, progress/error overlays |
| 21 | [`PathInputView.ts:290`](../../../src/renderer/uikit/PathInput/PathInputView.ts#L290) | `applyRootProps` | **Construction-only** for the PathInput root. Placeholder and live ARIA values are targeted into its child Input ([`PathInputView.ts:202-229`](../../../src/renderer/uikit/PathInput/PathInputView.ts#L202-L229)). | Notebook/link-editor category paths and TagsInput |
| 22 | [`PopoverView.ts:188`](../../../src/renderer/uikit/Popover/PopoverView.ts#L188) | floating-root `applyProps` | **Construction-only**; anchor, placement, open state, and positioning are explicit, while residual floating-root props have no verified live producer. | Browser downloads/tabs/URL suggestions, board toolbar, grid options, revision picker, menus, Select, MultiSelect, Autocomplete, and PathInput |
| 23 | [`ProgressBarView.ts:80`](../../../src/renderer/uikit/ProgressBar/ProgressBarView.ts#L80) | `applyProps` | **Construction-only** for residual props. `aria-label`, busy, value, and fill are direct writes before the residual override ([`ProgressBarView.ts:44-80`](../../../src/renderer/uikit/ProgressBar/ProgressBarView.ts#L44-L80)). | Board info, log progress, and Mneme configuration |
| 24 | [`SegmentedControlView.ts:76`](../../../src/renderer/uikit/SegmentedControl/SegmentedControlView.ts#L76) | `applyRootProps` | **Construction-only and vacuous:** the residual object is always `{}`. Remove the update-path call; preserve child Button updates ([`SegmentedControlView.ts:86-100`](../../../src/renderer/uikit/SegmentedControl/SegmentedControlView.ts#L86-L100)). | Page/tool/editor, environment, Git, MCP, notebook, REST, Storybook, and tools-hub controls |
| 25 | [`SelectView.ts:158`](../../../src/renderer/uikit/Select/SelectView.ts#L158) | `applyRoot` | **Construction-only** for the Select root. The changing placeholder/ARIA values belong to the child Input path, while list/open state belongs to `syncChildren()` ([`SelectView.ts:130-166`](../../../src/renderer/uikit/Select/SelectView.ts#L130-L166)). | Script panel, settings, graph, link editor, logs, MCP, Mneme, and Storybook |
| 26 | [`SelectableRowView.ts:53`](../../../src/renderer/uikit/SelectableRow/SelectableRowView.ts#L53) | `applyProps` | **Construction-only**; selection/active state are explicit dataset fields and the verified environment-variable row has no changing residual prop. | Environment-variable editor and Storybook |
| 27 | [`SliderView.ts:48`](../../../src/renderer/uikit/Slider/SliderView.ts#L48) | `applyProps` | **Construction-only**; value/min/max/step/onChange are explicit input behavior and residual props are not live in the graph/video consumers. | Graph tuning and video audio controls |
| 28 | [`SpinnerView.ts:38`](../../../src/renderer/uikit/Spinner/SpinnerView.ts#L38) | `applyProps` | **Construction-only**; loading ARIA and visual state are owned directly after the residual pass ([`SpinnerView.ts:34-47`](../../../src/renderer/uikit/Spinner/SpinnerView.ts#L34-L47)). | Async editors, browser/Tor, graph, draw, Mermaid, and Mneme loading surfaces |
| 29 | [`SplitButtonView.ts:175`](../../../src/renderer/uikit/SplitButton/SplitButtonView.ts#L175) | `applyRootProps` | **Construction-only** for the split-button root. Primary/caret child callbacks and disabled/title values are separate child props; Button’s targeted `onClick` setter covers its dynamic primary child. | Git tree, explorer boards, page tabs, and Storybook |
| 30 | [`SplitterView.ts:87`](../../../src/renderer/uikit/Splitter/SplitterView.ts#L87) | `applyProps` | **Construction-only**; native drag listeners are authoritative and the source explicitly records no production caller for residual pointer callbacks ([`SplitterView.ts:75-87`](../../../src/renderer/uikit/Splitter/SplitterView.ts#L75-L87)). | Browser, bookmarks, Git, link editor, MCP, REST, Storybook, text, sidebar, and secondary-view splitters |
| 31 | [`TagView.ts:86`](../../../src/renderer/uikit/Tag/TagView.ts#L86) | `applyProps` | **Needs targeted setters:** `onClick` and `title`. Trusted Boards creates and later updates `tagProps` with a new update callback and version title; both currently remain in `rest` ([`TagView.ts:75-86`](../../../src/renderer/uikit/Tag/TagView.ts#L75-L86); [`TrustedBoardsListView.ts:186-197`](../../../src/renderer/ui/sidebar/TrustedBoardsListView.ts#L186-L197)). Label/tone/disabled are direct fields. | Trusted Boards update badges; Git, MCP, Mneme, tools-hub, and link tags |
| 32 | [`TagsInputView.ts:186`](../../../src/renderer/uikit/TagsInput/TagsInputView.ts#L186) | `applyRootProps` | **Construction-only** for residual root props. Root `aria-label` is already a targeted direct write and tag/input changes are separate channels ([`TagsInputView.ts:95-125,159-186`](../../../src/renderer/uikit/TagsInput/TagsInputView.ts#L95-L186)). | Link-editor and Mneme tag editing |
| 33 | [`TextareaView.ts:150`](../../../src/renderer/uikit/Textarea/TextareaView.ts#L150) | `applyProps` | **Construction-only** for residual props. Placeholder, editable mode, spellcheck, and owned handlers are direct/targeted; `contentEditable` and `spellcheck` are explicitly written ([`TextareaView.ts:127-157`](../../../src/renderer/uikit/Textarea/TextareaView.ts#L127-L157)). | REST client, link editor, notebook, settings, video, MCP, and dialogs |
| 34 | [`ToolbarView.ts:83`](../../../src/renderer/uikit/Toolbar/ToolbarView.ts#L83) | `applyProps` | **Construction-only**; orientation/background/disabled and keyboard/focus callbacks are owned directly ([`ToolbarView.ts:65-83`](../../../src/renderer/uikit/Toolbar/ToolbarView.ts#L65-L83)). | Category, board, browser, draw, Git, text, compare, and Storybook toolbars ([`storyRegistry.ts:13-14`](../../../src/renderer/editors/storybook/storyRegistry.ts#L13-L14)) |
| 35 | [`Tree/SectionItemView.ts:83`](../../../src/renderer/uikit/Tree/SectionItemView.ts#L83) | pooled section `applyProps` | **Construction-only for the current payload**; `TreeView` section props provide explicit section fields and no residual dynamic field. | Provider, boards/tools, notebook, REST request, Git, and Storybook trees |
| 36 | [`Tree/TreeItemView.ts:185`](../../../src/renderer/uikit/Tree/TreeItemView.ts#L185) | pooled row `applyProps` | **Construction-only for the current payload.** All row ARIA/state fields and callbacks are explicit, and the residual spread must not replace the pooled row update ([`TreeItemView.ts:114-185`](../../../src/renderer/uikit/Tree/TreeItemView.ts#L114-L185)). | The same provider/boards/notebook/REST/Git tree surfaces |
| 37 | [`TreeView.ts:277`](../../../src/renderer/uikit/Tree/TreeView.ts#L277) | `applyArm` | **Construction-only** for root residual props. State refresh already deliberately omits `applyRestProps`; split root residual setup from arm/state rendering while retaining `aria-activedescendant` and both repaint gates ([`TreeView.ts:172-204,222-277`](../../../src/renderer/uikit/Tree/TreeView.ts#L172-L277)). | Provider, boards/tools, notebook categories, REST request, Git refs, and Storybook trees |
| 38 | [`TruncatedTextView.ts:57`](../../../src/renderer/uikit/TruncatedText/TruncatedTextView.ts#L57) | `applyProps` | **Construction-only**; text/measurement/tooltip updates are explicit and no production caller supplies a changing residual field. | Storybook truncated-text surface ([`storyRegistry.ts:32-33`](../../../src/renderer/editors/storybook/storyRegistry.ts#L32-L33); [`TruncatedTextView.ts:47-61`](../../../src/renderer/uikit/TruncatedText/TruncatedTextView.ts#L47-L61)) |
| 39 | [`ColorizedCodeView.ts:50`](../../../src/renderer/editors/shared/ColorizedCodeView.ts#L50) | `onMount` | **Construction-only**; verified consumers update only `code`, `language`, and `tabSize`, while Markdown creates the view once from code-block properties. No consumer re-pushes a residual attribute or listener after mount. | Tor status log ([`TorStatusOverlay.ts:39`](../../../src/renderer/editors/browser/TorStatusOverlay.ts#L39)), MCP request/response ([`McpRequestView.ts:100-101`](../../../src/renderer/editors/log-view/items/McpRequestView.ts#L100-L101)), MCP settings ([`McpSection.ts:273`](../../../src/renderer/editors/settings/sections/McpSection.ts#L273)), and Markdown code blocks ([`CodeBlock.ts:67-72`](../../../src/renderer/editors/markdown/CodeBlock.ts#L67-L72)) |

### Targeted setters to add

The implementation should add narrow state-aware helpers in `shared/dom-props.ts` for one
attribute or one listener at a time, rather than calling `applyRestProps` with a one-key object.
The helper must use the same `attributeName`, `isEnumeratedAttribute`, `RestPropsState.attributes`,
and `RestPropsState.listeners` bookkeeping as the initial application. The three component
consumers are:

| Component | Targeted fields | Consumer evidence | Required behavior |
|---|---|---|---|
| `InputView` | `placeholder`, `autoComplete`, `aria-label`, `aria-labelledby`, `aria-haspopup`, `aria-expanded`, `aria-autocomplete`, `aria-controls`; `onFocus`, `onBlur`, `onContextMenu` | Autocomplete and PathInput update these input props ([`AutocompleteView.ts:320-342`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L320-L342); [`PathInputView.ts:202-221`](../../../src/renderer/uikit/PathInput/PathInputView.ts#L202-L221)); Browser updates the URL input and listener props ([`BrowserView.ts:285,320`](../../../src/renderer/editors/browser/BrowserView.ts#L285-L320)). | Update/remove each named attribute without touching unrelated residual fields; replace only the named listener entry and keep its `RestPropsState.listeners` record current. `disabled`, `value`, and owned `input`/`keydown` handlers remain their existing direct paths. |
| `ButtonView` | `onClick`, `role`, `aria-checked`, `tabIndex` | SegmentedControl re-points pooled button views with changing selection and callback props ([`SegmentedControlView.ts:44-50,86-100`](../../../src/renderer/uikit/SegmentedControl/SegmentedControlView.ts#L44-L50)); SplitButton supplies a fresh primary callback on update ([`SplitButtonView.ts:99-107`](../../../src/renderer/uikit/SplitButton/SplitButtonView.ts#L99-L107)). | Update only these residual entries; preserve ordinary boolean versus enumerated handling for `aria-checked`, and listener removal/replacement for `onClick`. Direct `disabled`, `title`, and `onKeyDown` behavior remains unchanged. |
| `TagView` | `onClick`, `title` | Trusted Boards changes both the update callback and version title in the `tagProps` object passed to `record.tag.update()` ([`TagView.ts:75-86`](../../../src/renderer/uikit/Tag/TagView.ts#L75-L86); [`TrustedBoardsListView.ts:186-197`](../../../src/renderer/ui/sidebar/TrustedBoardsListView.ts#L186-L197)). | Update/remove the root click listener and clickable dataset state together, and update/remove the native title attribute; do not re-spread all residual props. |

No targeted setter is proposed for `disabled` or `title`: current UIKit implementations consume
those directly or through a tooltip/owned listener. No type narrowing is part of this task.

## Listener disposal and `RestPropsState`

Keep one `RestPropsState` per view/element, including for construction-only components. Initial
application records every residual attribute key and every installed listener entry. `clearRestListeners`
must continue to iterate the listener map, call `removeEventListener`, and clear the map
([`dom-props.ts:211-216`](../../../src/renderer/uikit/shared/dom-props.ts#L211-L216)). Each view keeps its existing `own()` cleanup and any explicit `onDispose()` cleanup; representative
registration is visible in [`InputView.ts:86-105`](../../../src/renderer/uikit/Input/InputView.ts#L86-L105) and [`ListItemView.ts:87-100`](../../../src/renderer/uikit/ListBox/ListItemView.ts#L87-L100).

The initial application must happen after the element and any owned child hosts exist, then cleanup
must be registered immediately. Targeted setters must remove a prior listener before installing a
replacement, delete the map entry when the value is absent, and keep the attribute `Set` in sync.
They must not clear the whole map or attribute set, because unrelated construction-time listeners
still need to be removed on dispose. Idempotent disposal remains supplied by `VanillaView` and the
view-level cleanup; no new throw guard is needed ([`vanilla-view.ts:88-116`](../../../src/renderer/uikit/shared/vanilla-view.ts#L88-L116)).

For ListBox/Tree, split residual-root setup from arm/state work. Their state paths may continue to
repaint rows and state-derived ARIA, but must not call `applyRestProps`. Tree already documents
this invariant ([`TreeView.ts:181-204`](../../../src/renderer/uikit/Tree/TreeView.ts#L181-L204)); the implementation must preserve it when moving the one construction call. Do not collapse pooled `ListItemView`/`TreeItemView` re-points.

## Enumerated-attribute preservation

The current behavior must be factored, not reinterpreted:

1. `ENUMERATED_ATTRIBUTES` contains lowercase `draggable`, `spellcheck`, and `contenteditable`
   ([`dom-props.ts:129-139`](../../../src/renderer/uikit/shared/dom-props.ts#L129-L139)).
2. `isEnumeratedAttribute()` lowercases the key and separately recognizes `aria-*`
   ([`dom-props.ts:141-152`](../../../src/renderer/uikit/shared/dom-props.ts#L141-L152)).
3. The current comment records the trap: camelCase `spellCheck`/`contentEditable` must not be
   matched case-sensitively, because `spellCheck={true}` would take the ordinary boolean path and
   write `""`; on an enumerated attribute that means `auto`, silently the opposite requested value
   ([`dom-props.ts:144-148`](../../../src/renderer/uikit/shared/dom-props.ts#L144-L148)).
4. Enumerated/ARIA values write the strings `"true"`/`"false"` (or the supplied string), while
   ordinary `true` writes an empty attribute and ordinary `false` removes it
   ([`dom-props.ts:194-205`](../../../src/renderer/uikit/shared/dom-props.ts#L194-L205)).

The single-entry targeted helper must call the same lowercase/prefix predicate and the same
attribute-write rules. It must also preserve `className` → `class` and `htmlFor` → `for` mapping
([`dom-props.ts:160-161`](../../../src/renderer/uikit/shared/dom-props.ts#L160-L161)). Textarea’s direct
`contentEditable`/`spellcheck` writes remain direct owned fields; they are not a reason to remove
the generic enumerated path ([`TextareaView.ts:152-157`](../../../src/renderer/uikit/Textarea/TextareaView.ts#L152-L157)).

## Consumer and risk table

| Surface family | Components exercised | Regression risk |
|---|---|---|
| Browser chrome | `Button`, `IconButton`, `Input`, `ListBox`, `Popover`, `Splitter`, `Spinner`, `Dot` | URL-bar residual listeners/ARIA, URL suggestions, download popovers, toolbar callbacks, and split-pane drag behavior. Browser updates URL input props at [`BrowserView.ts:285,316-327`](../../../src/renderer/editors/browser/BrowserView.ts#L285-L327). |
| Sidebar/provider navigation | `Breadcrumb`, `CategoryList`, `Checkbox`, `IconButton`, `Input`, `ListBox`, `SelectableRow`, `Tag`, `Tree`, `TruncatedText` | File/search/category/tree rows, open tabs, trusted-board update badges, selection, keyboard navigation, and pooled recycling. Provider tree construction is at [`TreeProviderViewImpl.ts:167-171`](../../../src/renderer/components/tree-provider/TreeProviderViewImpl.ts#L167-L171); trusted-board callback updates are at [`TrustedBoardsListView.ts:186-197`](../../../src/renderer/ui/sidebar/TrustedBoardsListView.ts#L186-L197). |
| Dropdown and overlay controls | `Autocomplete`, `Input`, `ListBox`, `MultiListBox`, `MultiSelect`, `PathInput`, `Popover`, `Select`, `SegmentedControl`, `Button` | Dynamic input ARIA/placeholder, keyboard selection, callback identity, popup anchoring, and list row re-points. Select’s retained child path is [`SelectView.ts:165-202`](../../../src/renderer/uikit/Select/SelectView.ts#L165-L202); Autocomplete’s is [`AutocompleteView.ts:320-342`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L320-L342). |
| REST client and forms | `Autocomplete`, `Button`, `Checkbox`, `Input`, `ListBox`, `Popover`, `Select`, `Splitter`, `Textarea`, `Tree` | Key/value autocomplete, request-tree rows, checkbox/enum/code fields, and split panes are high-value interaction paths. Key autocomplete re-pushes placeholder/value props at [`KeyValueEditorView.ts:167-190`](../../../src/renderer/editors/rest-client/KeyValueEditorView.ts#L167-L190). |
| Editors and toolbars | `Button`, `Divider`, `Dot`, `IconButton`, `ProgressBar`, `SegmentedControl`, `Slider`, `Toolbar` | Board, graph, Git, notebook, text, video, and editor toolbar controls depend on live callbacks and disabled/title state. SegmentedControl’s changing child props are [`SegmentedControlView.ts:86-100`](../../../src/renderer/uikit/SegmentedControl/SegmentedControlView.ts#L86-L100). |
| Dialogs, notifications, and loading | `Button`, `Checkbox`, `Dialog`, `DialogContent`, `Divider`, `Input`, `Label`, `Notification`, `ProgressBar`, `Spinner`, `Textarea` | Dialog submit/cancel actions, toast click/close behavior, validation fields, progress ARIA, and loading arms. Notification’s owned click/close paths are [`NotificationView.ts:79-100`](../../../src/renderer/uikit/Notification/NotificationView.ts#L79-L100). |
| Tags and metadata | `Tag`, `TagsInput`, `PathInput`, `CategoryList`, `Dot` | Trusted-board update actions, Git/MCP/Mneme metadata, tag removal, and category/tag editing. TagsInput’s retained PathInput and tag updates are [`TagsInputView.ts:65-125`](../../../src/renderer/uikit/TagsInput/TagsInputView.ts#L65-L125). |
| Trees and virtualized rows | `ListBox`, `ListItem`, `ListBox SectionItem`, `Tree`, `TreeItem`, `Tree SectionItem`, `SelectableRow` | Any accidental removal of row updates changes focus, selection, ARIA, tooltip, DnD, or active-row scrolling. The list explicitly repoints pooled rows at [`ListBoxView.ts:390-440`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L390-L440), and Tree keeps state-derived ARIA on a separate refresh path at [`TreeView.ts:172-204`](../../../src/renderer/uikit/Tree/TreeView.ts#L172-L204). |
| Storybook/authoring surfaces | All components, including `MultiListBox`, `MultiSelect`, `TruncatedText`, `CollapsiblePanelStack`, and `Toolbar` | Story controls are the broadest residual-prop contract and should verify arbitrary ARIA/native props, listener replacement, enumerated values, mount/update/unmount, and disabled/title behavior. Story registration is the verified consumer for the components without an application editor caller. |

## Implementation plan

1. Keep the current `applyRestProps` value semantics and `RestPropsState`, but factor the per-entry
   attribute/listener operation so the initial full application and the three targeted setters share
   one implementation. Do not shrink `NativeHTMLAttributes` or alter the 21 Omit contracts called
   out by B-3.
2. Move each root/element residual application to the initial `onMount()` configuration pass. For
   helper methods shared with update/state arm work (`applyRoot`, `applyArm`, `applyProps`), split
   the residual call from the live direct writes rather than leaving a hidden update-path call.
   `SegmentedControl`’s `{}` call is removed from its update path. Minimap keeps only its mount call.
3. Add the named `InputView`, `ButtonView`, and `TagView` targeted setters. Input setters cover
   Autocomplete/PathInput/browser URL-bar evidence; Button setters cover SegmentedControl and
   SplitButton; Tag’s setter covers Trusted Boards. The setters update only the changed attribute or
   listener and never call `applyRestProps`.
4. Preserve ListBox/Tree state refresh, `DepsGate`/repaint gates, row re-points, and direct writes
   for disabled/title/value/contentEditable/spellcheck. No `VanillaView.update()` equality gate,
   deferral, fresh-array selector, gate removal, or new throw guard is part of this task.
5. Re-run the source census and inspect the final call graph: every remaining `applyRestProps` call
   must be in an initial construction/mount path, with no call reachable from `onUpdate`, state
   refresh, or pooled row repoint. Then perform the manual surface checklist below.

### Before → after shape

```ts
// Before: the same full spread is reached by both mount and update.
protected onUpdate(props: Props): void {
    this.applyProps(props);
}

private applyProps(props: Props): void {
    const { ownedField, ...rest } = props;
    applyRestProps(this.root, rest, this.restPropsState);
    this.setOwnedField(ownedField);
}

// After: residual configuration is applied once; live fields use direct setters.
protected onMount(): void {
    this.applyConstructionRestProps(this.props);
    this.setOwnedField(this.props.ownedField);
    this.own(() => clearRestListeners(this.root, this.restPropsState));
}

protected onUpdate(props: Props): void {
    this.setOwnedField(props.ownedField);
    this.setTargetedRestProps(props); // only named dynamic fields/listeners
}
```

The exact component decomposition varies: the snippet is a shape constraint, not code to paste.
In particular, `VanillaView` still stores props before invoking `onUpdate()` and performs no
equality gate ([`vanilla-view.ts:84-97`](../../../src/renderer/uikit/shared/vanilla-view.ts#L84-L97)).

## Concerns

- “At construction” must mean the first mounted element-configuration pass under Rule 9; installing
  DOM listeners in the JavaScript constructor is prohibited by the lifecycle contract
  ([`vanilla-view.ts:32-40`](../../../src/renderer/uikit/shared/vanilla-view.ts#L32-L40)).
- The old 40/40 count was not a safe scope. The pre-conversion uikit population was 39 calls/38
  files, and the complete population was 40 calls/39 files; the final source has 39 calls/39 files.
  Future review must use the stated instrument and the per-site table, not the inherited count.
- Input’s child ARIA state is genuinely dynamic: `aria-expanded` changes with popup state, while
  placeholder/labels can change with parent props. Treating all residual input props as immutable
  would regress Autocomplete, PathInput, Select, and browser chrome.
- Button and Tag have residual callback semantics despite their other fields being direct. A stale
  listener can silently invoke an old segmented selection, split-button action, or board-update
  action.
- State-derived Tree root attributes must still repaint, but residual props must remain off the state
  path. `TreeView` already records this distinction ([`TreeView.ts:181-204`](../../../src/renderer/uikit/Tree/TreeView.ts#L181-L204)).
- Enumerated case handling is a correctness boundary, not a cleanup opportunity. The lowercase
  match and `aria-*` prefix must remain exactly as documented above.
- No new `throw` guards are needed. The epic’s seven existing guards remain the final total; no R4
  full-rebuild, R5 Immer, R8 timer, or Epic C type work is pulled into this task.

## Manual verification checklist

Walk real surfaces after implementation; stories supplement but do not replace these checks.

- [ ] Browser URL bar: navigate, focus/blur, context menu, URL suggestions, downloads, toolbar
  buttons, Tor state, and split bookmarks; verify callbacks and residual ARIA/placeholder values.
- [ ] REST client: edit key/value rows, autocomplete keys, select enum values, toggle booleans,
  edit request tree nodes, exercise textarea/code fields, and resize the request pane.
- [ ] Select-family controls: exercise Select, MultiSelect, Autocomplete, PathInput, and TagsInput
  open/close, keyboard navigation, filtering, empty/loading, disabled/read-only, changing
  placeholder/labels, `aria-expanded`, `aria-controls`, and popup placement.
- [ ] Sidebar/provider surfaces: search files/categories/trees, switch open tabs, select rows,
  recycle a large list, expand/collapse provider/boards/notebook/Git/REST trees, and verify active
  row, tooltip, DnD, context menu, and `aria-activedescendant` behavior.
- [ ] Segmented/Split/Tag callbacks: change segmented selection, invoke split-button primary and
  caret actions, and show/hide/update a Trusted Boards “Update” tag; confirm no stale callback.
- [ ] Dialogs and notifications: open commit/confirmation/create-board/link/MCP dialogs, change
  validation state, click submit/cancel/close, trigger toast click/close, and inspect loading ARIA.
- [ ] Editors/toolbars: exercise board, graph, Git, notebook, text, video, MCP, settings, and
  environment-variable toolbars, sliders, progress bars, dividers, dots, and splitters.
- [ ] Markdown minimap: toggle the minimap, scroll and resize, hide/show it, and verify there is
  one initial residual application and no update-path listener churn.
- [ ] Enumerated attributes: in Storybook and real Textarea/Input surfaces verify camelCase
  `spellCheck`/`contentEditable`, `aria-*`, `draggable`, true/false, removal, and case variants.
- [ ] Mount/update/dispose: mount each affected family, update ordinary props repeatedly, dispose
  twice where supported, and confirm all construction listeners are removed without new throws.

## Acceptance Criteria

- [ ] The current-tree instrument reports 39 construction-only `applyRestProps` invocations in 39
  component files (40 matches including the shared declaration), and every invocation is reachable
  only from an initial construction/mount path.
- [ ] No `applyRestProps` call remains in `onUpdate`, a state refresh, or a pooled row re-point;
  Minimap’s update duplicate and SegmentedControl’s vacuous update call are gone.
- [ ] The per-site verdicts are implemented. `InputView`, `ButtonView`, and `TagView` preserve the
  named dynamic attributes/listeners through targeted setters without a full residual re-spread.
- [ ] `RestPropsState` remains a `Set` plus `Map`; `clearRestListeners` removes every construction
  listener on dispose, and targeted replacement keeps the map correct.
- [ ] Enumerated matching still lowercases camelCase keys, recognizes `aria-*`, writes string
  keywords for enumerated/ARIA values, and preserves ordinary boolean removal semantics.
- [ ] `NativeHTMLAttributes` and `dom-props.ts`’s type surface are not narrowed; no Epic C type work
  is included.
- [ ] No `VanillaView.update()` equality gate, deferral, fresh-array selector, `DepsGate` removal,
  virtualized-row collapse, new throw guard, R4/R5/R8 change, unit test, or test harness is added.
- [ ] The manual checklist is walked against real surfaces and any unverified surface is recorded.
- [ ] The EPIC-076 dashboard entry links this task and remains unchecked because this is an epic task
  ([`active-work.md:36`](../../active-work.md#active)).

## Files that need no changes in this task

| File / area | Reason |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | Lifecycle and `update()` storage semantics are already correct; no equality gate or constructor listener installation is wanted. |
| `src/renderer/uikit/shared/deps-gate.ts` | Existing `DepsGate` consumers and `depsChanged` are outside this task. |
| `src/renderer/uikit/VirtualGrid/**` | Virtual-grid paint/measurement behavior is not a residual-props concern. |
| `src/renderer/uikit/shared/fill-slot.ts`, `keyed-list.ts`, `subtree-swap.ts` | Slot ownership and structural reconciliation are unrelated. |
| `src/renderer/core/state/state.ts` | State synchronization is evidence for ordering, not a change target. |
| `src/renderer/uikit/Tree/TreeDndModel.ts` | Drag-only state writes must remain narrow; no residual-props change is required. |
| `src/renderer/uikit/**` story files | They are manual verification surfaces, not implementation targets. |
| `src/renderer/editors/**` and `src/renderer/ui/**` consumers | They provide verified evidence and manual surfaces; no consumer rewrite is planned unless a targeted setter requires a type-preserving call-site adjustment. |

## Files Changed summary

| File / area | Planned change |
|---|---|
| `src/renderer/uikit/shared/dom-props.ts` | Preserve `RestPropsState`, `clearRestListeners`, and enumerated semantics; factor state-aware single-attribute/listener targeted operations without narrowing types. |
| The 39 current component files listed in the census | Keep residual application on the initial mount/construction path only; remove update/state-path full spreads and split helper methods where necessary. |
| `src/renderer/uikit/Input/InputView.ts` | Add targeted setters for the verified dynamic input attributes/listeners. |
| `src/renderer/uikit/Button/ButtonView.ts` | Add targeted setters for dynamic `onClick`, role, ARIA checked, and tab index values. |
| `src/renderer/uikit/Tag/TagView.ts` | Add the targeted root click-listener/dataset update. |
| `src/renderer/editors/shared/ColorizedCodeView.ts` | Apply residual props only during mount; live consumers update only explicit colorization fields. |
| `doc/active-work.md` | Link unchecked US-1206 under EPIC-076. |
| `doc/tasks/US-1206-rest-props-at-construction/README.md` | Record this census, per-site evidence, implementation scope, risks, acceptance criteria, and manual checklist. |
