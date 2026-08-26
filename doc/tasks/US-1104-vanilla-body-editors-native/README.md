# US-1104: Native views for the vanilla-body editors

## Goal

Convert the markdown, html, svg, and log-view editor registrations from EditorModule.Component to EditorModule.View. Rename each index.tsx to index.ts, compose the already-native body and toolbar DOM directly through TextChromeView, preserve the public exports and data-name contract, and take each editor from two live React roots to zero.

This is the sixth task in [EPIC-067](../../epics/EPIC-067.md), after US-1103's native TextChromeView. The pattern here is intentionally general: US-1105 uses it for the other three vanilla-bodied editors, and US-1106/US-1107 use the same registration and slot pattern when their body remains a React island.

## Background

### Verified current shape

| Editor/module | Current index | Existing body | Current helper reads |
|---|---|---|---|
| md-view | src/renderer/editors/markdown/index.tsx | MarkdownBodyView | compactMode; optional page navBackCount |
| html-view | src/renderer/editors/html/index.tsx | HtmlBodyView | capturing; React WithMenu wrapper |
| svg-view | src/renderer/editors/svg/index.tsx | SvgBodyView | image viewport model through a React ref at click time |
| log-view | src/renderer/editors/log-view/index.tsx | LogBodyView through LogBody.ts | showTimestamps |

The body classes contain no React imports or hooks. MarkdownBodyView, HtmlBodyView, and SvgBodyView are already the BodyView values registered by their modules. Log View has no BodyView property because it is not a notebook per-note dispatch target. Keep those contracts unchanged. The native log-view index must instantiate LogBodyView directly instead of mounting the LogBody.ts React face. A repository-wide search found no other LogBody.ts consumer; leave that compatibility face unchanged unless implementation explicitly removes it after repeating that check.

The current index re-exports are public and must survive the rename:

| Index | Exports that must remain |
|---|---|
| markdown | MarkdownEditor, defaultMarkdownEditorState, MarkdownEditorState, MarkdownQueueEvent, MarkdownBlock, MarkdownBlockProps |
| html | HtmlEditor, defaultHtmlEditorState, HtmlEditorState, HtmlQueueEvent |
| svg | SvgEditor, defaultSvgEditorState, SvgEditorState, SvgQueueEvent |
| log-view | LogViewEditor, defaultLogViewEditorState, LogViewEditorState, LogQueueEvent |

MarkdownBlock and MarkdownBlockProps are explicitly consumed by mcp-inspector/McpInspectorView, mcp-inspector/ResourceContentView, and log-view/items/MarkdownOutputView. Do not remove them.

### View registration and async mounting

src/renderer/editors/base/editorRegistry.ts:36-46 defines EditorModule as a union. One arm requires Component and permits View; the other permits an optional Component and requires View. The target is the second arm, matching src/renderer/editors/toolset/index.ts:

~~~ts
// Before
export const markdownModule: EditorModule = {
    createEditor: () => new MarkdownEditor(/* default state */),
    Component: MarkdownEditorView,
    BodyView: MarkdownBodyView,
};

// After
export const markdownModule: EditorModule = {
    createEditor: () => new MarkdownEditor(/* default state */),
    View: MarkdownEditorView,
    BodyView: MarkdownBodyView,
};
~~~

Apply the same Component-to-View change to htmlModule and svgModule, preserving BodyView. Change logViewModule to View and compose LogBodyView directly; do not add a Log View BodyView registration.

editorRegistry.ts:308-316 still normalizes a View-only module by manufacturing Component: a React function that returns mountVanilla(Ctor, props). Do not remove that compatibility normalization. It keeps older consumers and RenderEditorView compatible; AsyncEditorView prefers the native arm.

src/renderer/ui/app/AsyncEditorView.ts:98-148 proves the root and error behavior. If module.View exists, AsyncEditorView constructs, appends, and mounts it in a try/catch and reports failures with showVanillaError. It never calls mountReactHandle on that arm. Only the fallback at :140-148 creates EditorErrorBoundary and calls mountReactHandle. The error boundary therefore does not follow the vanilla arm. This is correct for US-1104 because each body and helper is native; US-1106/US-1107 must account for it when their native index owns a React body island.

### General conversion pattern

The native index is a small owner/composer, not a second body implementation:

1. Cast the generic EditorModel prop once to the concrete model.
2. Construct the native body view and native contribution views.
3. Construct TextChromeView from US-1103. Pass the body root as children, and each display-contents contribution root as toolbarContributions or rightToolbarContributions. These are DOM Nodes.
4. Own the body, contribution views, and chrome with child(). Attach roots before mount(). The parent owns body views because TextChromeView receives their roots as SlotContent, not their VanillaView instances.
5. Keep the module view root equal to the chrome root, or use an equivalent display-contents owner root. Do not add a layout wrapper.
6. Remove React imports, JSX, hooks, mountVanilla, mountReact, mountReactHandle, and React.createElement from all four index files.

For multiple siblings, use one stable display-contents host owned by the editor view and pass that host as one Node. Do not pass a DocumentFragment that is consumed once and becomes empty on a later update.

The before/after shape, using markdown, is:

~~~tsx
// Before: React owns TextChrome and the mountVanilla body boundary.
function MarkdownEditorView({ model }: { model: EditorModel }) {
    const md = model as MarkdownEditor;
    return (
        <TextChrome
            model={model}
            toolbarContributions={<MarkdownBackButton model={md} />}
            rightToolbarContributions={<MarkdownToolbarBits model={md} />}
        >
            {mountVanilla(MarkdownBodyView, { model: md })}
        </TextChrome>
    );
}

// After: a VanillaView owns the body/helpers/chrome and passes DOM Nodes.
export class MarkdownEditorView extends VanillaView<{ model: EditorModel }> {
    // Own MarkdownBodyView, the two native helper views, and TextChromeView.
}
~~~

fill-slot.ts:5-8,26-42 defines SlotContent as string | Node | React.ReactNode and its Node arm is root-free. It owns each slot host: do not run a previous cleanup before the next fill and do not write around a host after passing it to fillSlot.

The EPIC-067 §E9-6a seam rule applies: the native class takes SlotContent; the React face keeps React.ReactNode. ButtonView already follows this rule in src/renderer/uikit/Button/ButtonView.tsx:9-12: ButtonViewProps.children is SlotContent while public ButtonProps.children remains React-typed. IconButtonViewProps aliases IconButtonProps, whose inherited children member is still React.ReactNode, but these helpers do not pass IconButton children. Do not widen unused UIKit surfaces.

### Worked example: markdown

markdown/index.tsx:10-55 is the smallest wrapper and has both slot directions.

MarkdownToolbarBitsView must own one IconButtonView named markdown-compact-toggle. Bind model.state with selector s => s.compactMode. Update active, title (Normal View versus Compact View), and icon (normal-view versus compact-view) on the existing button; keep model.toggleCompact as its click action.

MarkdownBackButtonView must own a display-contents root and conditionally own one ButtonView named markdown-back. Bind the optional model.page?.state navBackCount projection with default 0. A count of zero or less releases/removes the button. A positive count creates it with variant ghost, size sm, title Back, icon arrow-left, and string child Back. The string is already SlotContent, so no nested React root is created. Preserve the page-less absent case. If a changed model/page identity is ever supplied, unsubscribe the old page state and bind the new one.

Pass the back-button host to TextChromeView.toolbarContributions, the compact-button host to rightToolbarContributions, and the body root to children. This preserves the current order and makes every slot value a DOM Node.

### The other three helper translations

#### html

html/index.tsx:18-58 subscribes to model.state.use(s => s.capturing ?? false). Bind that projection and update IconButtonViews html-copy and html-more so both are disabled while capture runs. Preserve titles, icons, actions, and names.

WithMenu is a React render-prop face, not a native view. Replace it in this native caller with openMenu from src/renderer/uikit/Menu/attach-menu.ts, which constructs a native MenuView. Keep menu name html-image-menu, the three item labels/icons/actions, and the Draw DOM node returned by createIconComponentElement(DrawIcon). Keep MENU_CLOSE_DELAY_MS = 250 so capture/open/edit runs after the menu has closed and repainted. Track and clear delayed callbacks on disposal, dispose the MenuHandle, and restore the previously focused element from the menu onClose callback, matching WithMenu.

This uses IconButtonView and MenuView/openMenu; it does not require a WithMenuView or a widening of the React render-prop type.

#### svg

svg/index.tsx:17-60 has no render-time reactive value. model.host.state content/title are read inside the Open in Draw click action, and imageModel.current is read only on the Copy click. These are action-time reads, not missing subscriptions.

Port the three buttons to IconButtonViews named svg-open-draw, svg-save, and svg-copy, preserving the Draw DOM icon, titles, actions, and icons. Replace useRef<ImageViewportModel | null> with a field on the native editor or toolbar view. Pass the same setter through SvgBodyView.imageModelSetter; clear the field when the body releases it. Do not add a second viewport or change SvgBodyView/ImageViewportView.

#### log-view

log-view/index.tsx:57-82 subscribes to model.state.use(s => s.showTimestamps). Bind that projection. Own IconButtonViews log-clear and log-toggle-timestamps; update the timestamp button's freshly built SVG icon and title when the boolean changes. Keep the clear/timestamp DOM builders, confirmation dialog, model.clear(), and model.toggleTimestamps behavior.

Instantiate LogBodyView directly. Using LogBody.ts from a native index would create a React element and defeat the zero-root result even though its body is native.

### Reactive audit and masked defects

| Editor | Render-time read | Native channel |
|---|---|---|
| Markdown | compactMode; optional page navBackCount | model.state bind; optional page-state bind with default 0 |
| HTML | capturing ?? false | model.state bind |
| SVG | none; host/ref reads occur on clicks | no extra bind needed |
| Log View | showTimestamps | model.state bind |

No new §6.1 masked defect was found in these four editors. There is no fifth instance analogous to hasTextSelection, ProviderIcon, NavPanelButton, or ScriptPanel's unchanneled library index. Do not replace these narrow bindings with whole-state repaint subscriptions.

### data-name contract

The index/helper names are:

| Editor | Name | Owner | Presence/behavior |
|---|---|---|---|
| Markdown | markdown-compact-toggle | IconButtonView | always while mounted |
| Markdown | markdown-back | ButtonView | only when navBackCount > 0 |
| HTML | html-copy | IconButtonView | always; disabled while capturing |
| HTML | html-image-menu | native MenuView via openMenu | only while open, as with WithMenu |
| HTML | html-more | IconButtonView | always; disabled while capturing |
| SVG | svg-open-draw | IconButtonView | always |
| SVG | svg-save | IconButtonView | always |
| SVG | svg-copy | IconButtonView | always |
| Log View | log-clear | IconButtonView | always |
| Log View | log-toggle-timestamps | IconButtonView | always; title/icon follow state |

Shared chrome names from US-1103 (text-chrome-root, text-chrome-top, text-chrome-footer, text-toggle-script) remain owned by TextChromeView and must pass through unchanged. Body names remain unchanged because bodies are untouched: Markdown has markdown-view-root, markdown-find-column, markdown-scroll, and conditional markdown-minimap; HTML has none; SVG has svg-root; Log View has log-view-root, log-view-list, log-view-message, log-flex-grid, and the existing names in log item views. Do not add a public name to the native owner wrapper.

### Root measurement

US-1099 measured each of these module ids at exactly two roots before conversion: the editor Component root and the text-chrome-footer React slot root. While the predecessor's native chrome is fed by still-React callers, EPIC-067 §E9-4's temporary 4-5-root peak is expected. This task drains these four callers. Native body, contribution, menu, and chrome nodes must make each editor measure 0.

With one target editor open at a time, run this exact query for each module:

~~~js
document.querySelectorAll('[data-name="page-editor"] [data-react-root]').length
// md-view   -> 0
// html-view -> 0
// svg-view  -> 0
// log-view  -> 0
~~~

Also verify the slot discriminator:

~~~js
document.querySelectorAll('[data-name="page-editor"] [data-part="react-slot"][data-react-root]').length
// 0 for each
~~~

Count data-react-root, not data-part="react-slot" alone.

## Implementation Plan

- [ ] Rename markdown/index.tsx, html/index.tsx, svg/index.tsx, and log-view/index.tsx to index.ts. Preserve all model/default-state/type exports and the MarkdownBlock exports exactly.
- [ ] In each renamed file, remove React/JSX/TextChrome-face/mountVanilla code. Add VanillaView, TextChromeView, the concrete body view, and direct native UIKit imports. Register only View. Preserve Markdown/HTML/SVG BodyView fields and do not invent a Log View BodyView field.
- [ ] Implement the common owner/composer structure: own body, display-contents helper roots, helper child views, and TextChromeView with child(). Attach roots before mount(); pass only DOM Nodes to native chrome slots; dispose handles, timers, and subscriptions through the lifecycle.
- [ ] Implement MarkdownToolbarBitsView and MarkdownBackButtonView with the two narrow bindings. Create/remove markdown-back conditionally and update the compact button in place.
- [ ] Implement HtmlToolbarBitsView with IconButtonViews and openMenu/MenuView. Preserve html-image-menu, all menu items/icons/actions, focus restoration, delayed actions, and cleanup.
- [ ] Implement SvgToolbarBitsView with three IconButtonViews and replace the React ref with the existing imageModelSetter callback. Keep the body/viewer lifecycle unchanged.
- [ ] Implement LogToolbarBitsView with two IconButtonViews, bind showTimestamps, and compose LogBodyView directly. Leave LogBody.ts unchanged unless a final no-consumer check explicitly includes its deletion.
- [ ] Check every name and conditional branch against the tables above and the unchanged body/chrome contracts. Ensure no helper contributes a ReactNode to a TextChrome slot.
- [ ] Run npm run typecheck, npm run lint, and npm run build-prod. Cold-reload after the .tsx-to-.ts dynamic-import rename if Vite retains stale specifier resolution. Manually run the root queries and check compact mode, Markdown navigation, HTML capture/menu/focus, SVG actions, Log actions, and disposal. Add no tests or harness.

## Concerns

1. AsyncEditorView's EditorErrorBoundary wraps only the React arm. These four are safe because all descendants are native; later React-body conversions need an explicit descendant boundary decision.
2. fillSlot owns slot hosts. Use stable DOM nodes, do not pre-clean, do not mutate around it, and do not reuse a consumed DocumentFragment.
3. HTML's WithMenu is not native. Direct openMenu is the existing native equivalent; do not add a generic WithMenuView for this task.
4. SVG and Log custom SVG nodes are single-use DOM resources. Build a fresh node when an update replaces the icon; do not share one node between hosts.
5. Markdown navBackCount belongs to page state. A page-less editor must show no back button, and a changed page identity must not retain an old subscription.
6. Directly using LogBody.ts from a native code path would create a React element. Use LogBodyView; retain the face only as an unchanged compatibility file unless explicitly removed.
7. Public exports are acceptance surface, especially MarkdownBlock/MarkdownBlockProps.
8. The temporary 4-5-root predecessor peak is an epic transition state. US-1104's converted editor must measure 0; do not report the peak as a leak.

There are no unresolved design questions. The body ownership, View arm, native menu equivalent, SlotContent seam, conditional DOM, exports, error-path distinction, reactive audit, and measurements are resolved from source and the US-1103 contract.

## Acceptance Criteria

- [ ] Each renamed index is a native TypeScript registration with View, not Component, and contains no JSX, hooks, mountVanilla, mountReact, mountReactHandle, or React.createElement.
- [ ] TextChromeView receives DOM Nodes for body and contribution slots. MarkdownBodyView, HtmlBodyView, SvgBodyView, and LogBodyView are mounted directly; no body is rewritten and no Log View BodyView registration is invented.
- [ ] Markdown compact mode and back-history use explicit binds; markdown-back is absent at navBackCount <= 0 and has the exact name and behavior when present.
- [ ] HTML preserves html-copy, html-more, html-image-menu, capture disabled state, menu items/icons/actions, focus restoration, and the 250 ms delay.
- [ ] SVG preserves all three named buttons and uses the existing viewport model setter instead of a React ref.
- [ ] Log preserves both named buttons, confirmation behavior, timestamp icon/title updates, and direct LogBodyView composition.
- [ ] Every public export in the table remains available from its renamed index.
- [ ] Shared chrome and body data-name values remain unchanged, including conditional names and absence cases.
- [ ] No new §6.1 masked defect is found in these four editors; every render-time state read has a real bind.
- [ ] With each target scoped by data-name="page-editor", document.querySelectorAll('[data-name="page-editor"] [data-react-root]').length is 0 and the corresponding data-part="react-slot"[data-react-root] query is 0.
- [ ] npm run typecheck, npm run lint, and npm run build-prod pass. No unit tests/harnesses are added, no epic/dashboard files are changed, and no commit is created.

### Files that need NO changes

- src/renderer/editors/base/editorRegistry.ts
- src/renderer/ui/app/AsyncEditorView.ts
- src/renderer/ui/app/RenderEditorView.ts
- src/renderer/editors/base/TextChrome.tsx
- src/renderer/editors/base/TextChromeView.ts
- src/renderer/editors/base/PageToolbar.ts
- src/renderer/editors/base/PageToolbarView.ts
- src/renderer/editors/base/ContentHostFooter.ts
- src/renderer/editors/base/ContentHostFooterView.ts
- src/renderer/editors/base/EditorToolbar.ts
- src/renderer/editors/base/EditorToolbarView.ts
- src/renderer/editors/text/ScriptPanel.ts
- src/renderer/editors/text/ScriptPanelView.ts
- src/renderer/editors/markdown/MarkdownBodyView.ts
- src/renderer/editors/html/HtmlBodyView.ts
- src/renderer/editors/svg/SvgBodyView.ts
- src/renderer/editors/log-view/LogBodyView.ts
- src/renderer/editors/log-view/LogBody.ts
- src/renderer/editors/markdown/MarkdownEditor.ts
- src/renderer/editors/html/HtmlEditor.ts
- src/renderer/editors/svg/SvgEditor.ts
- src/renderer/editors/log-view/LogViewEditor.ts
- src/renderer/editors/register-editors.ts
- src/renderer/uikit/shared/fill-slot.ts
- src/renderer/uikit/shared/mount.tsx
- src/renderer/uikit/shared/vanilla-view.ts
- src/renderer/uikit/Button/Button.tsx
- src/renderer/uikit/Button/ButtonView.tsx
- src/renderer/uikit/IconButton/IconButton.tsx
- src/renderer/uikit/IconButton/IconButtonView.tsx
- src/renderer/uikit/Menu/WithMenu.tsx
- src/renderer/uikit/Menu/attach-menu.ts
- src/renderer/uikit/Menu/MenuView.ts
- src/renderer/uikit/ImageViewport/ImageViewportView.ts
- src/renderer/theme/icons.tsx
- src/renderer/theme/language-icons.ts
- src/renderer/editors/mcp-inspector/McpInspectorView.tsx
- src/renderer/editors/mcp-inspector/ResourceContentView.tsx
- src/renderer/editors/log-view/items/MarkdownOutputView.ts
- doc/epics/EPIC-067.md
- doc/active-work.md

### Files Changed

| File | Change |
|---|---|
| src/renderer/editors/markdown/index.tsx -> src/renderer/editors/markdown/index.ts | Native editor owner/composer, View registration, body and public exports preserved |
| src/renderer/editors/html/index.tsx -> src/renderer/editors/html/index.ts | Native body/chrome composition, IconButtonView/openMenu toolbar, View registration, exports preserved |
| src/renderer/editors/svg/index.tsx -> src/renderer/editors/svg/index.ts | Native body/chrome composition, viewport-model field/setter, View registration, exports preserved |
| src/renderer/editors/log-view/index.tsx -> src/renderer/editors/log-view/index.ts | Native toolbar/body composition, direct LogBodyView, View registration, exports preserved |
| doc/tasks/US-1104-vanilla-body-editors-native/README.md | Investigation, verified pattern, implementation plan, concerns, measurements, and acceptance criteria |
