# US-1179 — Native props types (EPIC-074 F-f)

**Status:** Investigation complete; implementation intentionally not started.

## Goal

Replace the React type surface in Persephone-owned source with native contracts. This task is the
precondition for the later ESLint rule that confines `react`/`react-dom` imports to
`src/renderer/editors/draw/**`; it does not remove React, `react-dom`, or their type packages.
The order is deliberate: F-f runs before US-1178/F-e so changing the handler types exposes every
`event.nativeEvent`-style caller as a compiler error while the proxy still exists.

## Background

EPIC-074 F-2/F-3 measured the pre-F-a baseline of 84 `react` importers: 14 value users and 70
type-only users. That figure is historical. The current authoritative, quote-agnostic census after
F-a/F-d/F-g is 70 `react` importers: 3 value users and 67 type-only users, plus one file that
references the global `React` namespace without importing it:
`src/renderer/core/traits/dnd.ts:48`. Import-based censuses cannot see that file, so it is listed
explicitly in the event/type change list below. The
dominant contracts are 50 `React.Ref` uses and 40 `React.HTMLAttributes`-family uses (35 base
uses plus `Input`, `Button`, and `Label` variants). The 50 ref uses are consumed by `bindRef` in
`src/renderer/uikit/shared/react-compat.ts`; the HTML props are consumed by `applyRestProps` in
that file, which has 39 view callers. The remaining measured React types are CSS properties,
elements, nodes, drag/UI events, `ComponentType`, `Dispatch`, and the SVG props import.

The list below records the source as found; it does not re-measure or revert unrelated/in-progress
EPIC-074 changes. Comments containing the word React are not imports or type references and must
not create edits (C21). A bare-identifier audit found that `ScriptContext.ts:9,64` is a fourth
React value user: the classifier missed it because `React` is used as a bare identifier rather than
through a namespace dereference. This is instrument defect 7 in the programme and is handled below
as an intentional breaking API removal.

### Vestigial script-global React removal

`ScriptContext.ts:9,64` injects a React value into every user script. The generated top-level
prelude at `src/renderer/scripting/ScriptRunnerBase.ts:12` uses `React=this.React`, and the library
prelude at `src/renderer/scripting/library-require.ts:17` uses `React=__ctx?.React`. The global is
documented at `docs/scripting.md:490`; `docs/whats-new.md:1145` is historical changelog text and
must remain unchanged. Evidence that the global is vestigial is verified: none of the 40
`assets/editor-types/*.d.ts` files mention `ReactNode`, `ReactElement`, or `JSX`; `styledText`
returns native `StyledTextBuilder` (`api-wrapper/StyledTextBuilder.ts:137`); no `React.` use occurs
under `assets/` or `boards-assets/`; and no `.d.ts` declares the global for IntelliSense.

### Existing runtime contracts

`src/renderer/uikit/shared/react-compat.ts:63-88` documents four behaviours that must survive a
rename and type replacement:

| Behaviour | Verified implementation | Required native result |
|---|---|---|
| Enumerated attributes | `ENUMERATED_ATTRIBUTES` at `react-compat.ts:70` contains `draggable`, `spellcheck`, and `contenteditable`; `applyRestProps` writes `true` as the string `"true"` at `:130-133`. | Keep the enumerated set and string conversion. Do not use boolean-attribute empty-string semantics. |
| ARIA booleans | `isEnumeratedAttribute` at `:81-83` treats every `aria-*` key as enumerated; `:130-133` writes `"true"`/`"false"`. | Preserve `aria-expanded={false}` as `aria-expanded="false"`, rather than removing it. |
| Stale attributes | `applyRestProps` removes every previous attribute absent from the next `rest` object at `:94-99`. | Keep previous-key tracking and removal on update. |
| Stale listeners | `applyRestProps` removes previous listeners absent from the next object at `:100-105`, and replaces same-key listeners at `:107-121`. | Keep listener tracking/removal and the `doubleclick` → `dblclick` mapping. |

The current source has no live direct `draggable`, `spellcheck`, or `contenteditable` caller that
reaches `applyRestProps`: `ListItemView` consumes `drag.draggable` itself at
`src/renderer/uikit/ListBox/ListItemView.ts:153-154`, and `TextareaView` writes
`contenteditable`/`spellcheck` itself at `src/renderer/uikit/Textarea/TextareaView.ts:151-155`.
The helper's generic cases still need to remain because its public contract permits those keys,
and the comment at `react-compat.ts:66-68` is stale: it says two link-editor callers pass a
direct `draggable` prop, but the verified current caller at
`src/renderer/editors/link-editor/PinnedLinksPanelView.ts:115-122` passes a `drag` object.

`bindRef` at `react-compat.ts:149-168` supports both forms: a callback ref whose React 19-style
return value may be a cleanup function, and a mutable object ref with `current`. The native type
must retain both forms and the matching cleanup semantics.

## Implementation Plan

### 1. Add the two shared native contracts and rename the runtime helper

Rename `src/renderer/uikit/shared/react-compat.ts` to
`src/renderer/uikit/shared/dom-props.ts`. Keep `RestPropsState`, `createRestPropsState`,
`applyRestProps`, and `clearRestListeners` there, and add the shared type definitions there so
the runtime helper and its consumers have one explicit home:

```ts
// Before: react-compat.ts:150
export function bindRef<T>(element: T | null, ref: React.Ref<T> | undefined): () => void {
```

```ts
// After: dom-props.ts (proposed)
export type ElementRef<T> =
    | ((element: T | null) => void | (() => void))
    | { current: T | null };

export function bindRef<T>(element: T | null, ref: ElementRef<T> | undefined): () => void {
```

The callback branch must call the function with the element, invoke its returned cleanup exactly
once when present, and otherwise call it with `null`; the object branch must set `current` and
clear it only when it still refers to that element. Do not model the ref as only
`(element: T | null) => void`: that loses the React 19 cleanup return and the object-ref callers.

The HTML contract should be evidence-scoped rather than `Record<string, unknown>`:

```ts
type NativeAttributeValue = string | number | boolean | null | undefined;
type AriaAttribute = { [K in `aria-${string}`]?: NativeAttributeValue };
type DataAttribute = { [K in `data-${string}`]?: NativeAttributeValue };

type NativeEventProps = {
    onBlur?: (event: FocusEvent) => void;
    onClick?: (event: MouseEvent) => void;
    onContextMenu?: (event: MouseEvent) => void;
    onFocus?: (event: FocusEvent) => void;
    onFocusCapture?: (event: FocusEvent) => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    onMouseDown?: (event: MouseEvent) => void;
    onMouseEnter?: (event: MouseEvent) => void;
    onMouseLeave?: (event: MouseEvent) => void;
    onMouseMove?: (event: MouseEvent) => void;
    onMouseUp?: (event: MouseEvent) => void;
    onPaste?: (event: ClipboardEvent) => void;
    onPointerDown?: (event: PointerEvent) => void;
    onPointerLeave?: (event: PointerEvent) => void;
    onPointerMove?: (event: PointerEvent) => void;
    onPointerUp?: (event: PointerEvent) => void;
    onDragEnd?: (event: DragEvent) => void;
    onDragEnter?: (event: DragEvent) => void;
    onDragLeave?: (event: DragEvent) => void;
    onDragOver?: (event: DragEvent) => void;
    onDragStart?: (event: DragEvent) => void;
    onDrop?: (event: DragEvent) => void;
};

export interface NativeHTMLAttributes<T extends HTMLElement = HTMLElement>
    extends NativeEventProps, AriaAttribute, DataAttribute {
    id?: string;
    title?: string;
    role?: string;
    tabIndex?: number;
    hidden?: boolean;
    type?: string;
    placeholder?: string;
    autoComplete?: string;
    spellCheck?: boolean | "true" | "false";
    contentEditable?: boolean | "true" | "false" | "plaintext-only";
}

export interface NativeInputHTMLAttributes<T extends HTMLInputElement = HTMLInputElement>
    extends NativeHTMLAttributes<T> {
    autoFocus?: boolean;
    checked?: boolean;
    defaultValue?: string | number | readonly string[];
    disabled?: boolean;
    max?: number | string;
    maxLength?: number;
    min?: number | string;
    minLength?: number;
    name?: string;
    readOnly?: boolean;
    required?: boolean;
    step?: number | string;
    value?: string | number | readonly string[];
}
export interface NativeButtonHTMLAttributes<T extends HTMLButtonElement = HTMLButtonElement>
    extends NativeHTMLAttributes<T> {
    autoFocus?: boolean;
    disabled?: boolean;
    name?: string;
    type?: "button" | "submit" | "reset";
    value?: string | number | readonly string[];
}
export type NativeLabelHTMLAttributes<T extends HTMLLabelElement = HTMLLabelElement> =
    NativeHTMLAttributes<T> & { htmlFor?: string };
```

These variant keys are measured against the current destructuring and callsites, not added as a
generic escape hatch. In `InputView`, `value`, `checked`, `disabled`, `readOnly`, `autoFocus`,
and the component-owned debug `name` are destructured before `applyRestProps` at
`InputView.ts:118-142`; `required`, `maxLength`, `minLength`, `min`, `max`, and `step` are not
destructured and therefore remain residual props. The current input callsites verify `value`,
`placeholder`, `autoComplete`, `type`, and `autoFocus` (for example `BrowserView.ts:285,320` and
`PasswordDialogView.ts:44-62`); the other listed standard keys preserve the measured residual
surface rather than being represented by a string map. `name` remains component-owned and is
written to `data-name`, not forwarded.

The requested standard-key check is summarized explicitly here:

| Key(s) | Input / button route | Variant decision |
|---|---|---|
| `value`, `checked`, `disabled`, `readOnly`, `autoFocus` | Input owns all five before its residual spread; `CheckboxView` owns `checked`/`disabled`; Textarea owns `value`/`disabled`/`readOnly`/`autoFocus`; `SliderView.ts:45` owns `value`/`disabled`. Button/IconButton leave `value` and `autoFocus` in `rest`. | Keep the public keys in `NativeInputHTMLAttributes`; keep `value` and `autoFocus` in `NativeButtonHTMLAttributes`; do not add checkbox-only keys to the base type. |
| `required`, `maxLength`, `min`, `max`, `step` | `InputView` does not destructure these, so an input caller's values reach `applyRestProps`; no ButtonView/CheckboxView/TextareaView caller or route uses them as standard residual props. | Add to `NativeInputHTMLAttributes` only. |
| `name` | Input, Button/IconButton, and Checkbox destructure it as a `data-name`/debug property. It does not reach `applyRestProps`. | Keep the component-owned declarations and the variant's public `name` key; do not add it to the base contract. |

`defaultValue` is also retained in `NativeInputHTMLAttributes` because `InputView.ts:136-138`
destructures and applies it to the field. No current source use justifies adding input-only
attributes to `NativeButtonHTMLAttributes`; its extra residual standard keys are the measured
`value` and `autoFocus`.

In `ButtonView`/`IconButtonView`, `disabled`, `name`, and the custom callbacks are destructured,
while `value` and `autoFocus` remain in `rest` and reach `applyRestProps`;
`ButtonView.ts:86-101` and `IconButtonView.ts:72-101` are the route evidence. The button variant
therefore does not gain input-only keys such as `checked`, `readOnly`, `required`, `maxLength`,
`min`, `max`, or `step`. `CheckboxView.ts:58-59` destructures its own `checked`, `disabled`, and
`name`, and `TextareaView.ts:133-153` destructures its own `value`, `disabled`, `readOnly`,
`autoFocus`, and `name`; neither justifies adding those keys to the base contract. The final
implementation must not add a bare `[key: string]` index signature. Known camelCase attributes and
every known `on*` key remain typo-checked. The template-literal index signatures intentionally
allow arbitrary ARIA/data suffixes while rejecting unrelated misspellings such as `onClik` or
`tabIndx`.

The `T` parameter is retained for API readability and future current-target-specific handlers;
the initial handler parameters are the browser's native event classes, not React synthetic events.

#### Required state-hook deletion (precondition for F-h)

`src/renderer/core/state/state.ts` cannot retain its React hooks: doing so leaves a React runtime
user outside `editors/draw/**`, so F-h's import rule could never pass. A source scan verified that
the `IState.use()` path is dead. There are 15 wrapper methods in 11 files, each with only its
declaration and its own `state.use(...)` call and no non-comment caller:

| File | Dead wrapper methods |
|---|---|
| `src/renderer/api/board-install-registry.ts` | `useInstalled` |
| `src/renderer/api/board-trust.ts` | `useIsTrusted`, `useTrustedPaths` |
| `src/renderer/api/published-boards.ts` | `useCatalog`, `useCatalogBoardsForFile` |
| `src/renderer/api/recent.ts` | `useFiles` |
| `src/renderer/api/settings.ts` | `use` |
| `src/renderer/api/tools/registered-tools.ts` | `useToolsets`, `useTools` |
| `src/renderer/api/tools/tool-stats.ts` | `useAll` |
| `src/renderer/api/tools/tools-trust.ts` | `useIsTrusted`, `useTrustedPaths` |
| `src/renderer/api/window.ts` | `use` |
| `src/renderer/editors/board/busy-boards.ts` | `useBusyBoardRoots` |
| `src/renderer/editors/board/custom-editor-registry.ts` | `useBoardsForFile` |

The implementation must delete those wrapper methods while retaining every non-hook export in
those files. It must then delete `IUse<T>` and the `use` member/body from `state.ts`, plus the
unused `useOptionalState` and `useComponentState` exports (their only source occurrences are
their declarations). The remaining state contract should use local structural types, for example:

```ts
type SetStateAction<T> = T | ((previous: T) => T);
type Dispatch<T> = (value: SetStateAction<T>) => void;

export type IState<T> = {
    get: () => T;
    set: Dispatch<T>;
    subscribe: <R>(listener: (value: R) => void, selector: (state: T) => R) => () => void;
    update: (patch: Partial<T>) => void;
    clear: () => void;
};
```

This is required work, not optional cleanup, and is explicitly a precondition for F-h. Update the
now-stale prose references as part of the same document-backed change: `api/autoload-service.ts:12`,
`api/pages/PageModel.ts:59`, `ui/app/MainPageView.ts:127`, and
`scripting/api-wrapper/AppWrapper.ts:57`. Also update `api/published-boards.ts:107`, whose
“Sync counterpart of `useCatalogBoardsForFile`” comment names a method being removed. The
replacement comments should describe subscription/direct-state access or the safe public `.d.ts`
surface without naming a deleted hook.

### 2. Remove the vestigial script-global React (breaking API change)

Implement this as part of F-f, not as an exemption for F-h:

1. Delete the `react` import at `src/renderer/scripting/ScriptContext.ts:9` and
   `readonly React = React` at `:64`.
2. Remove `React=this.React` from the generated prelude at
   `src/renderer/scripting/ScriptRunnerBase.ts:12`, and `React=__ctx?.React` from the library
   prelude at `src/renderer/scripting/library-require.ts:17`. Preserve the surrounding globals and
   the exact remaining string form; these preludes are position-sensitive generated code.
3. Remove `React` from the globals list at `docs/scripting.md:490`. Do not rewrite the historical
   `docs/whats-new.md:1145` entry. The epic's `/userdoc` pass should add a new what's-new entry
   explaining this breaking removal.

Any existing user script that references `React` will now fail with `ReferenceError`; this is
intentional. The mitigation is the removal note in the scripting documentation. After this step,
the only React value users are `editors/draw/ExcalidrawIsland.tsx` and
`uikit/shared/mount.tsx`; F-h relocates the latter into the permitted React island.

A second bare-identifier audit found no fifth value user: no additional `= React`, bare `React`
argument, or React re-export occurs in `src/`, `assets/`, or `boards-assets/` outside the imports,
type references, comments, and the two generated prelude strings listed above.

### 3. Audit of `on*` usage and handler types

The following is the complete set of event-shaped names observed at the affected component
boundaries. Names such as `onChange` and `onSubmit` are included even where the component owns
and strips them, because they are easy to accidentally put into the residual contract. Lifecycle
and component callbacks (`onMount`, `onModel`, `onClose`, `onItemClick`, etc.) are not DOM
attributes and are not members of `NativeEventProps`.

| Name | Native parameter type if residual | Verified evidence | Route |
|---|---|---|---|
| `onBlur` | `FocusEvent` | `BrowserView.ts:285,320`; `PathInputView.ts:240-241`; `TagsInputView.ts:121` | Reaches the nested `InputView` residual object; `InputView` invokes its own typed callback after stripping it. |
| `onChange` | `Event` only for a genuine DOM residual; string/item callbacks otherwise | `AutocompleteView.ts:278`; `SelectView.ts:209`; `MultiSelectView.ts:260`; `InputView.ts:121`; `CheckboxView.ts:58` | The observed UIKit `onChange` values are component APIs and are stripped/consumed, not DOM listeners. Do not type them as native event callbacks when their public API says string, item, boolean, number, or tags. |
| `onClick` | `MouseEvent` | `ButtonView.ts:10,94`; `DotView.ts:75-78`; `Minimap.ts:15`; `DialogContentView.ts:237-238`; `PageTabView.ts:124-132` | `ButtonView` and `DotView` send it through `applyRestProps`; `IconButtonView` and `MinimapView` own it and call it directly. |
| `onContextMenu` | `MouseEvent` | `BrowserView.ts:285,320`; `ListBoxView.ts:461`; `TreeItemView.ts:156` | Browser `InputView` forwarding is residual. ListBox/Tree callbacks are component-owned and stripped. |
| `onFocus` | `FocusEvent` | `AutocompleteView.ts:283`; `SelectView.ts:213`; `MultiSelectView.ts:193`; `BrowserView.ts:285,320` | Reaches the nested input residual object unless a component-specific callback consumes it. |
| `onFocusCapture` | `FocusEvent` | `ToolbarView.ts:74,178` | Toolbar deliberately strips it and invokes it after roving-focus logic; it is not a residual listener. |
| `onKeyDown` | `KeyboardEvent` | `BrowserWebviewModel.ts:78`; `ButtonView.ts:16,94`; `InputView.ts:23,122`; `TextareaView.ts:69,149`; `PopoverView.ts:160,230`; `ToolbarView.ts:73,144` | Button/Input/Textarea/Popover/Toolbar own or compose this callback. The browser model currently uses the React generic and must become the global native `KeyboardEvent`. |
| `onMouseDown` | `MouseEvent` | `UrlSuggestionsDropdown.ts:47`; `SelectView.ts:110`; `MultiSelectView.ts:102` | The Popover URL-suggestion handler is a genuine residual prop; Select/MultiSelect use an internal listener on the chevron. Remove the unnecessary `as never` at the URL-suggestion callsite. |
| `onMouseEnter` | `MouseEvent` | `Minimap.ts:15,59,102`; `BrowserTabsPanel.ts:72,79,101` | Minimap owns and directly invokes it; browser tab preview callbacks are component callbacks, not residual props. |
| `onMouseLeave` | `MouseEvent` | `BrowserTabsPanel.ts:101`; `GraphTooltipView.ts:17,254` | Both observed uses are component callbacks/listeners outside `applyRestProps`; retain only if a caller passes the standard residual key. |
| `onMouseMove` | `MouseEvent` | `ForceGraphRenderer.ts:381`; no affected rest-prop object literal | Native elsewhere, but no affected component callsite was found. Include only if the type-checker shows a real residual caller. |
| `onMouseUp` | `MouseEvent` | `AudioControls.ts:164`; no affected rest-prop object literal | Native elsewhere; no affected residual caller was found. |
| `onPaste` | `ClipboardEvent` | `TextareaView.ts:17,76,149,256` | Textarea owns and composes it; it is explicitly omitted from its inherited HTML type. |
| `onPointerDown` | `PointerEvent` | `SplitterView.ts:39,105`; `PopoverView.ts:85,198` | These are direct native listeners/internal resize logic, not residual props. |
| `onPointerLeave` | `PointerEvent` | no affected caller; native tooltip/data-grid listeners only | No residual use found. |
| `onPointerMove` | `PointerEvent` | `SplitterView.ts:40,116`; `PopoverModel.ts:198` | Direct native listeners/internal resize logic. |
| `onPointerUp` | `PointerEvent` | `SplitterView.ts:41-42,126`; `PopoverModel.ts:220` | Direct native listeners/internal resize logic. |
| `onDragStart`, `onDragEnd`, `onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop` | `DragEvent` | `PinnedLinksPanelView.ts:115-122`; `FolderItemView.ts:64-107`; `ListBox/types.ts:45-50` | These six handlers are inside the `drag` object and are invoked directly by `ListItemView`; they are not sent through `applyRestProps`. `TreeDndModel.ts:48-54` and `Tree/types.ts:368` still carry the React drag type and must be native. |

The essential handler contract is therefore native even while F-e's proxy remains temporarily:
`applyRestProps` may still create its proxy, but the declared callback receives an `Event` subtype
whose properties are those of the browser event. The proxy is deleted by F-e, not redesigned here.

### 4. Audit of non-event attributes

This table enumerates every non-`on*` attribute found at the affected component boundaries and
records whether it actually reaches `applyRestProps`. Component-owned values are listed because
replacing an inherited React interface without recording this distinction is how attributes get
silently narrowed or written twice.

| Attribute | Verified use | Route and proposed type |
|---|---|---|
| `id` | `ListItemView.ts:117,154`; `TreeItemView.ts:132,161`; `SelectView.ts:279` | Component-owned stable row/list IDs; `ListBoxView.restProps` explicitly removes `id` at `:461`. `id?: string` remains known but is not a residual requirement for these paths. |
| `title` | `Dot.story.ts:83-103`; many `IconButtonView` constructors such as `BrowserView.ts:277-284` | `DotView` forwards it through `applyRestProps`; Button/IconButton use it as tooltip-owned data and strip it. `title?: string`. |
| `role` | `PathInputView.ts:284`; `SegmentedControlView.ts:96`; Tree/List/ Textarea own their roles | PathInput's popover residual object sends it to `applyRestProps`; several views write their own role before residual props. `role?: string`. |
| `tabIndex` | `Input.story.ts:101-123`; `SelectView.ts:235`; `MultiSelectView.ts:215`; `SegmentedControlView.ts:98` | Reaches IconButton or a generic residual object in the affected surface; some controls own their final tab index. `tabIndex?: number`. |
| `aria-label` | `AutocompleteView.ts:294`; `SelectView.ts:218`; `MultiSelectView.ts:198`; `DialogContentView.ts:238`; `RadioGroup.story.ts:77` | Some are passed to nested Input/Popover residual props; others are consumed by component-specific accessibility code. Explicit known key plus the `aria-${string}` index. |
| `aria-labelledby` | `AutocompleteView.ts:295`; `SelectView.ts:219`; `MultiSelectView.ts:199`; `PathInputView.ts:244-245` | Same nested-input/residual route. Explicit known key plus the template-literal index. |
| `aria-haspopup` | `AutocompleteView.ts:290`; `SelectView.ts:215`; `MultiSelectView.ts:195`; `PathInputView.ts:246` | Residual input/popover attribute; may be boolean-like or string. Use `NativeAttributeValue`. |
| `aria-expanded` | `AutocompleteView.ts:291`; `SelectView.ts:216`; `MultiSelectView.ts:196`; `PathInputView.ts:247` | Boolean reaches `applyRestProps`; must serialize to `"true"`/`"false"`. |
| `aria-controls` | `AutocompleteView.ts:293`; `SelectView.ts:217`; `MultiSelectView.ts:197` | Residual input attribute containing a DOM ID. `NativeAttributeValue` is sufficient. |
| `aria-autocomplete` | `AutocompleteView.ts:292` | Residual input attribute; known key and template index. |
| `aria-checked` | `SegmentedControlView.ts:97` | Component-generated residual button attribute; boolean serialization must remain available. |
| `aria-multiline` | `TextareaView.ts:151` | Component-owned, written directly; still a valid `aria-*` key. |
| `aria-live`, `aria-busy`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-orientation`, `aria-selected`, `aria-disabled`, `aria-level`, `aria-activedescendant` | `SpinnerView.ts:43-44`; `ProgressBarView.ts:66-76`; `SplitterView.ts:83-88`; `ListItemView.ts:147-151`; `TreeItemView.ts:157-160`; `Tree/types.ts:63` | Current implementations write these component-owned attributes directly. Keep them in the accepted ARIA namespace; do not turn the type into a bare string map. |
| `data-part` | `PageTabView.ts:131,279,335,356` | Spread into IconButton props and reaches residual DOM attributes. `data-${string}` is required. |
| `data-type` | `PopoverView.ts:27,58` | Explicit Popover view prop and residual attribute; keep the known property and the `data-${string}` namespace. |
| `autoComplete` | `BrowserView.ts:285,320`; `PathInputView.ts:243` | Reaches the nested `InputView` residual object. `autoComplete?: string`. |
| `placeholder` | `BrowserView.ts:285,320`; `AutocompleteView.ts:279`; `PathInputView.ts:239`; `SelectView.ts:210`; `TextareaView.ts:135` | Usually owned by the component and passed to its nested input; it is residual on `InputView` but deliberately stripped on Textarea/root surfaces. `placeholder?: string`. |
| `type` | `PasswordDialogView.ts:46,62`; `IconButtonView.ts:80` | Input/Button residual typing needs the standard string key, while each view also sets a safe default. `type?: string`. |
| `hidden` | `BrowserView.ts:324` on an IconButton update | Not destructured by IconButton and therefore reaches `applyRestProps`; `hidden?: boolean`. |
| `draggable` | `PinnedLinksPanelView.ts:115` and `FolderItemView.ts:64` only inside `drag`; `ListItemView.ts:153-154` consumes it | Not currently residual. Keep the helper special case and type it as `boolean | "true" | "false" | "auto"` if admitted to the generic contract. |
| `spellcheck` / `contenteditable` | `TextareaView.ts:151-155` | Component-owned lowercase DOM writes, not residual caller props. The public native prop spellings should be `spellCheck`/`contentEditable`; helper recognition remains lowercase. |
| `className` / `style` | Omitted explicitly by every affected React HTML interface, for example `InputView.ts:16` and `TextareaView.ts:12-15` | Deliberately prohibited from UIKit props; do not reintroduce them through an index signature. |

The ARIA and data index signatures are intentional and limited:

```ts
type AriaAttribute = { [K in `aria-${string}`]?: NativeAttributeValue };
type DataAttribute = { [K in `data-${string}`]?: NativeAttributeValue };
```

They admit `aria-*` and `data-*` extensions without admitting `onClik`, `tabIndx`, or arbitrary
unknown keys. A typo that still has the correct namespace (for example `aria-lable`) remains
undetectable by design; known non-namespaced keys and handler names retain excess-property checks.

### 5. Native event failures to resolve in the same implementation

The following are the verified React-event dependencies that F-f must expose or correct before
F-e:

| File | Current dependency | Required change / failure exposed |
|---|---|---|
| `src/renderer/editors/link-editor/index.ts:260` | `event.nativeEvent` inside a `ButtonView` `onClick` | The native `MouseEvent` has no `nativeEvent`; pass `event` directly to `openViewModeMenu`. This is the deliberate Decision 3 compile failure. |
| `src/renderer/editors/browser/BrowserUrlBarModel.ts:1,201` | `MouseEvent as ReactMouseEvent` | Remove the React type import and use the global native `MouseEvent`; `ContextMenuEvent.fromNativeEvent` already accepts it. |
| `src/renderer/editors/browser/BrowserWebviewModel.ts:2,78` | `KeyboardEvent<HTMLDivElement>` | Remove the React import and generic parameter; use global `KeyboardEvent`. |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:365` | `React.DragEvent` | Use global `DragEvent`. |
| `src/renderer/core/traits/dnd.ts:48` | Global `React.DragEvent` namespace reference without an import | Use global `DragEvent`; the function already consumes native `dataTransfer`/`preventDefault`. |
| `src/renderer/uikit/Tree/types.ts:368` | `onDragStartOverride` parameter `React.DragEvent` | Use global `DragEvent`. |
| `src/renderer/uikit/Tree/TreeDndModel.ts:48-54` | React import, stale comment, and `e as unknown as React.DragEvent` | Change the public callback to native `DragEvent`, pass `e` directly, and remove the stale F-owned cast/comment. |
| `src/renderer/uikit/shared/react-compat.ts:3,21,27,150` | `React.SyntheticEvent` and `React.Ref` | In the renamed helper, type the transitional listener contract with native `Event`/`ElementRef`; F-e will then delete `toPublicEvent` and its proxy. |
| `src/renderer/core/state/state.ts:1,14` | `React.Dispatch<SetStateAction<T>>` alongside the dead `IState.use()` hook path | As a precondition for F-h, verify and delete the dead hook path, then delete its 15 dead wrapper methods, `IUse<T>`, and the unused `useOptionalState`/`useComponentState` exports. Replace `React.Dispatch`/`SetStateAction` with local structural types; `state.ts` must import no React. |
| `src/renderer/core/utils/utils.ts:1,6` | React `SetStateAction` | Replace with a local `SetStateAction<S> = S | ((previous: S) => S)` definition or a shared non-React utility type. |

`src/renderer/core/events/context-menu.ts:42,62` is not a failure: it intentionally accepts
`MouseEvent | { nativeEvent: MouseEvent }` and unwraps either shape. A repository search found
only two `nativeEvent` consumers: that defensive adapter and the link-editor line above.

### 6. Replace remaining non-ref React types

Use the following native homes, with the exact semantics verified from each consumer:

| Current type | Proposed replacement | Files / evidence |
|---|---|---|
| `React.CSSProperties` | A local `CSSProperties`/`NativeCSSProperties` type in `src/renderer/uikit/shared/dom-props.ts` (or a small `css-types.ts` beside it), based on measured CSS keys and allowing `--${string}` custom properties | `src/renderer/uikit/Panel/panel-style.ts:87,136,142,204,263`; `src/renderer/uikit/ListBox/ListBoxView.ts:471`; `src/renderer/uikit/ListBox/types.ts:153`; `src/renderer/uikit/Tree/TreeView.ts:624`; `src/renderer/uikit/Tree/types.ts:220`; `src/renderer/editors/markdown/MarkdownBlockView.ts` named import. Do not use a React namespace or a bare `Record<string, unknown>` for styles. |
| `React.ReactNode` / named `ReactNode` | Recursive native slot content: `string | number | bigint | boolean | null | undefined | Node | NativeSlotContent[]` | `src/renderer/uikit/shared/fill-slot.ts:4` and `slots.ts:9`; runtime `fillSlot` already handles these cases at `:11-45`. Update `TreeProviderViewModel.ts:84`, `CollapsiblePanelStack.ts:23`, and `PopoverModel.ts:76` to the appropriate native slot type. React-only values are not live callers. |
| `React.DragEvent` | global `DragEvent` | Tree provider, trait DnD, and Tree files listed above. |
| named `SVGProps` | An explicit `NativeSVGProps`/`SvgIconProps` type in `src/renderer/theme/icons.ts` or a shared SVG type module | `src/renderer/theme/icons.ts:1,4`. Enumerate the props `createIconPlaceholderElement` actually reads (`viewBox`, `width`, `height`, `className`, `color`, `style`, `ref`) and preserve the existing camelCase-to-attribute conversion for other accepted SVG attributes without a bare string index. |
| `React.Dispatch` / `SetStateAction` | `Dispatch<T>` and `SetStateAction<T>` local structural types | `src/renderer/core/state/state.ts:1,14`; `src/renderer/core/utils/utils.ts:1,6`. |
| `React.RefObject` | The object arm of `ElementRef<T>` (`{ current: T | null }`) | `src/renderer/editors/graph/GraphDetailPanelView.ts:53`. Verify whether the consumer needs readonly access; `bindRef` requires a mutable object arm. |
| `React.ComponentType`, `React.UIEvent`, `React.Fragment` | No current source occurrence after the already-landed/in-progress epic changes | Do not invent replacements or edits. Re-run a comment-stripped search during implementation and record any reappearance as a scope change. |

### 7. Complete file list

The following is the complete planned source list, grouped by the type contract it currently
uses. A file may occur in more than one group. This is a plan only; no source file is changed by
this investigation.

**`ElementRef` / `React.Ref` / `React.RefObject`:**

`src/renderer/editors/graph/GraphDetailPanelView.ts`; `src/renderer/uikit/Autocomplete/AutocompleteView.ts`;
`src/renderer/uikit/Button/ButtonView.ts`; `src/renderer/uikit/DateInput/DateInput.ts`;
`src/renderer/uikit/Dialog/Dialog.ts`; `src/renderer/uikit/Dialog/DialogContent.ts`;
`src/renderer/uikit/Dialog/DialogContentView.ts`; `src/renderer/uikit/IconButton/IconButtonView.ts`;
`src/renderer/uikit/Input/InputView.ts`; `src/renderer/uikit/ListBox/ListItem.ts`;
`src/renderer/uikit/ListBox/ListItemView.ts`; `src/renderer/uikit/ListBox/SectionItem.ts`;
`src/renderer/uikit/ListBox/SectionItemView.ts`; `src/renderer/uikit/Menu/MenuView.ts`;
`src/renderer/uikit/MultiSelect/MultiSelectView.ts`; `src/renderer/uikit/Notification/AlertItemView.ts`;
`src/renderer/uikit/Notification/Notification.ts`; `src/renderer/uikit/Notification/NotificationView.ts`;
`src/renderer/uikit/PathInput/PathInputView.ts`; `src/renderer/uikit/Select/SelectView.ts`;
`src/renderer/uikit/SelectableRow/SelectableRowView.ts`; `src/renderer/uikit/Tree/SectionItem.ts`;
`src/renderer/uikit/Tree/SectionItemView.ts`; `src/renderer/uikit/Tree/TreeItem.ts`;
`src/renderer/uikit/Tree/TreeItemView.ts`; and the renamed `src/renderer/uikit/shared/dom-props.ts`.

**`NativeHTMLAttributes` / Input / Button / Label variants:**

`src/renderer/editors/shared/ColorizedCodeView.ts`; `src/renderer/uikit/Autocomplete/AutocompleteModel.ts`;
`src/renderer/uikit/Breadcrumb/Breadcrumb.ts`; `src/renderer/uikit/Button/ButtonView.ts`;
`src/renderer/uikit/CategoryList/CategoryList.ts`; `src/renderer/uikit/Checkbox/CheckboxView.ts`;
`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.ts`; `src/renderer/uikit/Dialog/Dialog.ts`;
`src/renderer/uikit/Dialog/DialogContent.ts`; `src/renderer/uikit/Divider/Divider.ts`;
`src/renderer/uikit/Dot/DotView.ts`; `src/renderer/uikit/IconButton/IconButtonView.ts`;
`src/renderer/uikit/Input/InputView.ts`; `src/renderer/uikit/Label/Label.ts`;
`src/renderer/uikit/ListBox/ListBoxView.ts`; `src/renderer/uikit/ListBox/ListItem.ts`;
`src/renderer/uikit/ListBox/SectionItem.ts`; `src/renderer/uikit/ListBox/types.ts`;
`src/renderer/uikit/Minimap/Minimap.ts`; `src/renderer/uikit/MultiListBox/MultiListBox.ts`;
`src/renderer/uikit/MultiSelect/MultiSelectModel.ts`; `src/renderer/uikit/Notification/Notification.ts`;
`src/renderer/uikit/PathInput/PathInputModel.ts`; `src/renderer/uikit/Popover/PopoverModel.ts`;
`src/renderer/uikit/ProgressBar/ProgressBar.ts`; `src/renderer/uikit/Select/SelectModel.ts`;
`src/renderer/uikit/SelectableRow/SelectableRowView.ts`; `src/renderer/uikit/Slider/SliderView.ts`;
`src/renderer/uikit/Spinner/SpinnerView.ts`; `src/renderer/uikit/SplitButton/SplitButton.ts`;
`src/renderer/uikit/Splitter/SplitterView.ts`; `src/renderer/uikit/Tag/TagView.ts`;
`src/renderer/uikit/TagsInput/TagsInput.ts`; `src/renderer/uikit/Textarea/TextareaView.ts`;
`src/renderer/uikit/Toolbar/Toolbar.ts`; `src/renderer/uikit/Tree/SectionItem.ts`;
`src/renderer/uikit/Tree/TreeItem.ts`; `src/renderer/uikit/Tree/types.ts`;
`src/renderer/uikit/TruncatedText/TruncatedText.ts`; and
`src/renderer/uikit/shared/dom-props.ts`.

**`react-compat.ts` runtime-helper importers that must follow the rename:**

`src/renderer/editors/shared/ColorizedCodeView.ts`; `src/renderer/uikit/Autocomplete/AutocompleteView.ts`;
`src/renderer/uikit/Breadcrumb/BreadcrumbView.ts`; `src/renderer/uikit/Button/ButtonView.ts`;
`src/renderer/uikit/CategoryList/CategoryListView.ts`; `src/renderer/uikit/Checkbox/CheckboxView.ts`;
`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts`;
`src/renderer/uikit/Dialog/DialogContentView.ts`; `src/renderer/uikit/Dialog/DialogView.ts`;
`src/renderer/uikit/Divider/DividerView.ts`; `src/renderer/uikit/Dot/DotView.ts`;
`src/renderer/uikit/IconButton/IconButtonView.ts`; `src/renderer/uikit/Input/InputView.ts`;
`src/renderer/uikit/Label/LabelView.ts`; `src/renderer/uikit/ListBox/ListBoxView.ts`;
`src/renderer/uikit/ListBox/ListItemView.ts`; `src/renderer/uikit/ListBox/SectionItemView.ts`;
`src/renderer/uikit/Minimap/MinimapView.ts`; `src/renderer/uikit/MultiListBox/MultiListBoxView.ts`;
`src/renderer/uikit/MultiSelect/MultiSelectView.ts`; `src/renderer/uikit/Notification/AlertItemView.ts`;
`src/renderer/uikit/Notification/NotificationView.ts`; `src/renderer/uikit/PathInput/PathInputView.ts`;
`src/renderer/uikit/Popover/PopoverView.ts`; `src/renderer/uikit/ProgressBar/ProgressBarView.ts`;
`src/renderer/uikit/SegmentedControl/SegmentedControlView.ts`; `src/renderer/uikit/Select/SelectView.ts`;
`src/renderer/uikit/SelectableRow/SelectableRowView.ts`; `src/renderer/uikit/Slider/SliderView.ts`;
`src/renderer/uikit/Spinner/SpinnerView.ts`; `src/renderer/uikit/SplitButton/SplitButtonView.ts`;
`src/renderer/uikit/Splitter/SplitterView.ts`; `src/renderer/uikit/Tag/TagView.ts`;
`src/renderer/uikit/TagsInput/TagsInputView.ts`; `src/renderer/uikit/Textarea/TextareaView.ts`;
`src/renderer/uikit/Toolbar/ToolbarView.ts`; `src/renderer/uikit/Tree/SectionItemView.ts`;
`src/renderer/uikit/Tree/TreeItemView.ts`; `src/renderer/uikit/Tree/TreeView.ts`;
`src/renderer/uikit/TruncatedText/TruncatedTextView.ts`; and
`src/renderer/uikit/shared/react-compat.ts` itself (renamed to `dom-props.ts`).

**Native event declarations and callsites:**

`src/renderer/components/tree-provider/TreeProviderViewImpl.ts`; `src/renderer/core/traits/dnd.ts`;
`src/renderer/editors/browser/BrowserUrlBarModel.ts`; `src/renderer/editors/browser/BrowserWebviewModel.ts`;
`src/renderer/editors/link-editor/index.ts`; `src/renderer/uikit/Tree/TreeDndModel.ts`;
`src/renderer/uikit/Tree/types.ts`; and `src/renderer/uikit/shared/dom-props.ts`.

**CSS properties:**

`src/renderer/editors/markdown/MarkdownBlockView.ts`; `src/renderer/uikit/ListBox/ListBoxView.ts`;
`src/renderer/uikit/ListBox/types.ts`; `src/renderer/uikit/Panel/panel-style.ts`;
`src/renderer/uikit/Tree/TreeView.ts`; and `src/renderer/uikit/Tree/types.ts`.

**Native content, state, and SVG:**

`src/renderer/components/tree-provider/TreeProviderViewModel.ts`; `src/renderer/core/state/state.ts`;
`src/renderer/core/utils/utils.ts`; `src/renderer/theme/icons.ts`;
`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.ts`;
`src/renderer/uikit/Popover/PopoverModel.ts`; `src/renderer/uikit/shared/fill-slot.ts`; and
`src/renderer/uikit/shared/slots.ts`.

**Dead state-hook deletion and stale comments:**

`src/renderer/api/board-install-registry.ts`; `src/renderer/api/board-trust.ts`;
`src/renderer/api/published-boards.ts`; `src/renderer/api/recent.ts`;
`src/renderer/api/settings.ts`; `src/renderer/api/tools/registered-tools.ts`;
`src/renderer/api/tools/tool-stats.ts`; `src/renderer/api/tools/tools-trust.ts`;
`src/renderer/api/window.ts`; `src/renderer/editors/board/busy-boards.ts`;
`src/renderer/editors/board/custom-editor-registry.ts`; `src/renderer/api/autoload-service.ts`;
`src/renderer/api/pages/PageModel.ts`; `src/renderer/ui/app/MainPageView.ts`; and
`src/renderer/scripting/api-wrapper/AppWrapper.ts`.

**Vestigial script-global React removal:**

`src/renderer/scripting/ScriptContext.ts`; `src/renderer/scripting/ScriptRunnerBase.ts`;
`src/renderer/scripting/library-require.ts`; and `docs/scripting.md`.
`docs/whats-new.md` is explicitly a no-change historical record; the new breaking-change entry
belongs to the epic's `/userdoc` pass.

### Files needing NO change

These are verified exclusions from F-f, not omissions:

- `src/renderer/editors/draw/ExcalidrawIsland.tsx` — its `useCallback`/`useState` import is a live
  vendor value import in the sanctioned Excalidraw island.
- `src/renderer/uikit/shared/mount.tsx` — leave all three `React.ReactElement` references and
  the `react-dom` mount code unchanged; F-h moves the whole file into `editors/draw/**`, where
  the React vendor boundary is permitted.
- `src/renderer/uikit/shared/vanilla-view.ts` — already native and the pure `VanillaViewCtor`
  relocation is owned by F-h.
- `src/renderer/uikit/shared/element-id.ts`, `src/renderer/uikit/shared/highlight.ts`,
  `src/renderer/uikit/shared/keyed-list.ts`, and `src/renderer/uikit/shared/subtree-swap.ts` —
  current source contains no React type import requiring this task.
- `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts` — the `React.UIEvent` occurrence is in a
  comparison comment only; its actual `onScroll` parameter is native `Event`.
- `docs/whats-new.md` — leave the historical library-globals entry at `:1145` unchanged; a new
  breaking-change entry is deferred to the epic's `/userdoc` pass.
- `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts`,
  `src/renderer/uikit/Tree/SectionItemView.ts`, and other files where `rg` finds React only in
  explanatory comments — comments are not source references and must stay unless their wording
  becomes false after implementation.

## Concerns / Open questions

- **Census instrument defect 7 (resolved in this plan).** The authoritative post-F-a/F-d/F-g
  census is 70 importers (3 value, 67 type-only) plus the no-import global namespace use in
  `core/traits/dnd.ts:48`; 84/14/70 is historical. A bare-identifier audit found the fourth
  value user at `ScriptContext.ts:9,64`, which the dereference-based classifier missed. F-f now
  removes that vestigial API and its injected globals, leaving only the two stated value users
  before F-h relocates `mount.tsx`.
- **State wrapper count (resolved).** The source has 17 textual `state.use(` matches: the two
  comments at `api/autoload-service.ts:12` and `api/pages/PageModel.ts:59` are non-call matches,
  leaving the 15 real wrapper callsites across the 11 files enumerated above. Remove all 15 and
  update both comments.
- **Stale `draggable` evidence (resolved).** The helper comment claims direct link-editor
  `draggable` rest props, but current code routes a `drag` object to `ListItemView`. Update the
  comment while retaining the helper's generic enumerated-attribute case.
- **Template namespaces and typo checking.** `` `aria-${string}` `` and `` `data-${string}` ``
  preserve checking outside those namespaces but cannot detect a misspelling inside one. This is
  the narrowest type that supports the measured custom attributes without accepting `onClik`.
- **Native event `currentTarget`.** Global DOM event types expose `currentTarget` as
  `EventTarget | null`, unlike React's generic current-target typing. Confirm that no affected
  handler relies on a narrower element without an explicit runtime cast.
- **`mount.tsx` / F-h coupling.** `ReactElement` has no native DOM equivalent. F-f leaves
  `uikit/shared/mount.tsx` unchanged, including its three ReactElement references; F-h must move
  `mountReactHandle` and the vendor boundary into `editors/draw/**` before the final import rule
  is enabled. Do not move `VanillaViewCtor` in F-f.
- **Slot content semantics.** `fillSlot` accepts arrays, booleans, `null`, numbers, bigint, and
  Nodes at runtime, while `SlotText` is used for tooltip text. Confirm whether both aliases should
  converge on the recursive native type or remain separate (`SlotText` can be narrower).
- **Value imports outside draw.** F-f removes the dead state-hook path and the vestigial script
  global as explicit preconditions for F-h. The permanent draw island and the mount boundary
  remain outside F-f; after this plan, only those two value users remain until F-h moves the mount.
- **React component type and fragment.** The epic baseline names `ComponentType` and `Fragment`,
  but neither is present in the current source scan. If the dirty checkout removed their callers,
  no native replacement should be invented; if they reappear, stop and extend this document.

## Acceptance criteria

- [ ] `react-compat.ts` has a documented replacement name/home, and all affected imports are
  planned for the replacement without editing `src/` during this investigation.
- [ ] `ElementRef<T>` supports callback refs with optional cleanup returns and mutable object refs;
  `bindRef` preserves both cleanup paths.
- [ ] Base, Input, Button, and Label native props use explicit known keys plus only
  `` `aria-${string}` ``/`` `data-${string}` `` index signatures; no bare string index exists.
- [ ] The handler table above is checked against the implementation's compile output, with native
  event parameters and the link-editor `event.nativeEvent` call fixed before F-e.
- [ ] `applyRestProps` retains enumerated-attribute serialization, ARIA boolean serialization,
  stale attribute removal, stale listener removal, and `dblclick` mapping.
- [ ] All files in the grouped change list are checked, all files in the NO-change list are
  confirmed, and a comment-stripped search reports no remaining own-file React type references
  outside the explicitly documented F-h mount boundary and the permanent draw island.
- [ ] The vestigial script-global `React` is removed from `ScriptContext` and both generated
  preludes, `docs/scripting.md` records the breaking removal, and the historical what's-new entry
  is unchanged; a new what's-new entry is left for the epic's `/userdoc` pass.
- [ ] No package is uninstalled, no file under `src/` is edited as part of this investigation, and
  no commit is created.

## Files Changed summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1179-native-props-types/README.md` | This investigation document only. |
| `src/renderer/uikit/shared/react-compat.ts` → `src/renderer/uikit/shared/dom-props.ts` | Planned runtime-helper rename; native ref/props contracts; preserve all four `applyRestProps` behaviours. |
| React type consumers listed above | Planned import/type substitutions grouped by contract; no source edits made in this task-document phase. |
| `src/renderer/scripting/ScriptContext.ts`, `src/renderer/scripting/ScriptRunnerBase.ts`, `src/renderer/scripting/library-require.ts` | Remove the vestigial `React` script global and preserve the remaining generated-prelude strings. |
| `docs/scripting.md` | Document the breaking removal of the `React` script global; `docs/whats-new.md` remains historical and unchanged. |
| `doc/active-work.md`, `doc/epics/EPIC-074.md` | Link this task document and keep the dashboard ordering consistent with Decision 3. |
