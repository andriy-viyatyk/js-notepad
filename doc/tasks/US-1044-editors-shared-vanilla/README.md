# US-1044: editors/shared widgets to vanilla

Parent epic: [EPIC-059: De-React Epic E1 — Editor foundations](../../epics/EPIC-059.md)

## Goal

Remove React from the two shared menu-item builders while preserving the existing
MenuItem contract, and move the shared FindBar and ColorizedCode implementations
behind vanilla views. Their React exports remain thin mountVanilla faces so all
existing React editors keep their current props and placement.

This task is planning only. It does not implement the conversion, add tests, or
change the dashboard or epic document.

## Background

### Decisions and established conventions

E1-3 makes Monaco widget ownership imperative and keeps editor integration code
under editors/shared. E1-8 says a React editor shell may host a vanilla leaf
through mountVanilla without creating another React root. That is the shape for
FindBar and ColorizedCode: their React-facing exports stay because every listed
consumer is still a React editor, but the actual DOM and stateful behavior move
to a VanillaView.

US-1042 established the implementation rules used here:

- import UIKit factories and views directly, not through a barrel;
- use static/co-located styling owned by the primitive; do not add Emotion or
  arbitrary inline layout styles;
- child(view) registers disposal ownership but does not mount the child;
  every child must therefore be explicitly mounted;
- VanillaView.update() assigns this.props before onUpdate(props), so onUpdate
  must use explicit identity fields if it needs the previous value;
- VanillaView.dispose() does not remove root; the adapter or structural parent
  must remove a retired root.

The current committed US-1043 result is already renamed to
src/renderer/editors/compare/CompareEditor.ts. It uses
src/renderer/editors/shared/MonacoDiffEditorHostView.ts for an actual diff
widget and deliberately does not add a plain Monaco editor host without a real
consumer. Its host and disposal conventions are inputs to this task, not files
to change.

### Half A: menu builders

The two current builders are:

- src/renderer/editors/shared/editor-menu-items.tsx
  - openInBrowserMenuItems returns a new array for an HTML file;
  - filePathMenuItems returns a new array on every call;
  - textFileMenuItems returns a new array and spreads fresh results from both
    helper builders.
- src/renderer/editors/shared/link-open-menu.tsx
  - appendLinkOpenMenuItems pushes newly created items into the caller's array;
  - its profile map runs each invocation, so each profile item is newly built.

The first builder is imported by the three model files named in the scope:
src/renderer/editors/image/ImageEditor.ts, src/renderer/editors/text/TextEditorModel.ts,
and src/renderer/editors/archive/ArchiveEditor.ts. All three are .ts files.
Removing the React import from the builder removes that React edge from their
model import graphs.

The second builder is used by:
src/renderer/content/tree-context-menus.tsx,
src/renderer/editors/markdown/MarkdownBlock.tsx, and
src/renderer/editors/link-editor/PinnedLinksPanel.tsx. Those consumers remain
React files because of their own JSX and React behavior; only the shared
builder loses React.

The icon rule is important. MenuItem.icon remains any at
src/renderer/core/events/context-menu.ts:9, and MenuView.ts:191-193 passes it
to fillSlot as SlotContent. fillSlot's non-React string branch writes
host.textContent = slot. Therefore a menu icon name such as folder-open would
render as literal text, not as an icon. Menu items must receive SVG DOM nodes
from createIconElement(name, props?) in
src/renderer/uikit/shared/slots.ts:46.

This is different from ButtonView and IconButtonView: their own icon props
explicitly recognize a string name and call createIconElement internally.
That convenience must not be generalized to MenuItem.icon.

Every registry-backed icon in the two builders was verified in
src/renderer/theme/icon-registry.ts:

| Current JSX icon | Registry name | Replacement |
|---|---|---|
| GlobeIcon | globe | createIconElement("globe", optional color props) |
| FolderOpenIcon | folder-open | createIconElement("folder-open") |
| CopyIcon | copy | createIconElement("copy") |
| SaveIcon | save | createIconElement("save") |
| RenameIcon | rename | createIconElement("rename") |
| LockIcon | lock | createIconElement("lock") |
| UnlockIcon | unlock | createIconElement("unlock") |
| KeyOffIcon | key-off | createIconElement("key-off") |
| OpenFileIcon | open-file | createIconElement("open-file") |

IncognitoIcon is the one exception. It is defined in
src/renderer/theme/language-icons.ts, and the registry explicitly excludes
language-icons.ts. There is no incognito registry name. Keep that one icon as
a DOM node made directly with IncognitoIcon.createElement?.(), using the same
missing-builder guard as MenuView.ts:41-44:

    const icon = component.createElement?.();
    if (!icon) throw new Error("Menu icon does not have a DOM builder.");
    return icon;

IncognitoIcon is created by createIconWithViewBox from a string body, so its
DOM builder exists. No registry entry is needed for this task. Adding
incognito to the registry would be a broader language-icon registry decision
with no consumer requirement here.

The builders are not eager module-level arrays. The first builder constructs
arrays and icon nodes when its functions are called. The second constructs
items and icon nodes while appending for one context-menu event. ContextMenuEvent
creates a fresh items array for each native event, and the known context-menu
consumers pass that array to one menu construction path. Reusing one DOM icon
node in two simultaneously open menus would still be unsafe because appending
the node moves it, but that is not a current risk. The implementation must keep
node creation inside each builder invocation and must not hoist icon nodes into
module constants.

### Half B: React-facing shared views

#### FindBar

src/renderer/editors/shared/FindBar.tsx currently owns the full UIKit tree,
focus/select-on-mount effect, match-label derivation, and keyboard behavior.
Its exact public props are:

    text: string
    currentMatch: number
    totalMatches: number
    onTextChange: (text: string) => void
    onNext: () => void
    onPrev: () => void
    onClose: () => void
    placeholder?: string

The two consumers use those props as follows:

- src/renderer/editors/browser/BrowserView.tsx:637-647 passes
  findText, findActiveMatch, findTotalMatches, webview.setFindText,
  webview.findNext, webview.findPrev, webview.closeFind, and the literal
  placeholder Find in page....
- src/renderer/editors/markdown/MarkdownBody.tsx:214-222 passes
  pageState.searchText, pageState.currentMatchIndex, pageState.totalMatches,
  model.setSearchText, model.nextMatch, model.prevMatch, and model.closeSearch;
  it omits placeholder, so FindBar's existing default Find... remains active.

The new FindBarView.ts should create the same root Panel attributes:
name find-bar, absolute position, top 4, right 20, z-index 10, centered
alignment, xs gap and vertical padding, sm horizontal padding, light
background, default border, md radius, and shadow. Compose the existing
InputView and IconButtonView directly:

- an input panel of width 180 containing InputView with name find-input,
  size sm, the controlled text value, the direct onTextChange callback, the
  native-keyboard adapter, and placeholder;
- the named find-match-counter panel with a light sm Text;
- IconButtonView children named find-prev, find-next, and find-close, with
  the existing titles, callbacks, sm size, and registry icon names
  chevron-up, chevron-down, and close.

InputView's public onKeyDown callback still exposes the React-compatible event
shape, so the vanilla view should adapt its native listener boundary the same
way MenuView does rather than changing InputProps. Focus and select the
underlying input after the child is mounted. The three child views have the
same lifetime as FindBarView and are valid child() ownership.

The vanilla view must preserve all current behavior: an empty text gives an
empty label; a positive result gives currentMatch + 1 of totalMatches; zero
matches gives No results; Escape closes and stops propagation; Enter advances,
Shift+Enter goes backward; F3 advances and Shift+F3 goes backward, with the
same preventDefault calls. On updates, pass the new callbacks and value to
the child views and update only the counter text. Do not read this.props as
the previous props in onUpdate.

#### ColorizedCode

src/renderer/editors/shared/ColorizedCode.tsx does not create a Monaco editor
widget. Its JSON Monarch provider registration is a module-level side effect
at :12-25, executed once when the module is imported, before any
ColorizedCode instance exists. It must remain module-scoped in
ColorizedCodeView.ts and must not move into the view constructor or onMount:
McpRequestView can create two ColorizedCode instances per log entry, and
setMonarchTokensProvider returns a disposable registration, so per-instance
registration would stack providers and leak them. The registration stays
unchanged and is not owned/disposed by an individual view.

Only the monaco.editor.colorize(code, language, { tabSize }) call and the DOM
writing move into the view. The current implementation renders a code element
with the returned HTML, or plain source text while the asynchronous result is
pending. The effect's cancellation flag prevents an old request from writing
after unmount or prop change.

The public props are the existing React HTMLAttributes<HTMLElement> plus:

    code: string
    language: string
    tabSize?: number

The five listed consumer relationships were verified:

- src/renderer/editors/browser/TorStatusOverlay.tsx:97 passes code=torLog and
  language=log, with no extra code attributes.
- src/renderer/editors/settings/sections/McpSection.tsx:93 passes
  code=configJson and language=json inside a pre styled by its parent.
- src/renderer/editors/markdown/CodeBlock.tsx:61-66 is the direct markdown
  caller. It strips the trailing newline, resolves the language from the
  language-* class, passes className, and forwards the remaining hast-derived
  props.
- src/renderer/editors/markdown/MarkdownBlock.tsx:128 selects CodeBlock as
  react-markdown's code renderer and therefore consumes ColorizedCode
  transitively; it does not import ColorizedCode directly.
- src/renderer/editors/log-view/items/McpRequestView.tsx:86-93 and :109-116
  passes JSON.stringify(entry.params/result, null, 2), language=json, and
  tabSize=2 for the request and response branches.

The new ColorizedCodeView.ts should keep a code root, retain the className and
all residual HTML attributes/event handlers through the repository's
react-compat rest-attribute mechanism, and retain the React-facing props type
in the shim. Keep the JSON grammar registration at module scope in this new
.ts file, exactly once per module import; do not put it in the constructor,
onMount, or a per-view cleanup. Move only the colorize call and DOM writing.
Use a monotonically changing request generation (or an equivalent explicit
cancellation field): write the plain code fallback immediately, then apply
colorized HTML only when the matching request is still current. Disposal must
invalidate pending work and clear residual listeners. Do not introduce
hardcoded colors; the color HTML is produced by Monaco and existing consumer
CSS/tokens remain the owners of styling.

#### Why innerHTML is permitted here

Roadmap §3.4 / doc/de-react.md:156-191 normally forbids innerHTML for runtime
data in this renderer: nodeIntegration is enabled, there is no CSP, no
Trusted Types policy, and no sanitizer, so interpolated untrusted text would
be an arbitrary-code-execution path. ColorizedCode's inputs are untrusted
markdown, HTTP, MCP, and log content, so this exception must stay explicit.

This write is the narrow exception §3.4 permits for code-owned generated rich
markup. Monaco's line renderer escapes source characters: 
node_modules/monaco-editor/esm/vs/editor/common/viewLayout/viewLineRenderer.js:856-860
converts < (CharCode 60) and > into &lt; and &gt;. The resulting
monaco.editor.colorize() string contains code-owned span elements with
mtk-style classes only; it does not derive attributes or markup from the
source text. This is the same deliberate rich-content category as av-grid's
DataCell, documented at doc/de-react.md:173-175, rather than a general
permission to interpolate strings into HTML.

The implementation must carry that justification as a comment immediately
above the write and use the av-grid re-parse guard:

    // Safe exception: Monaco escapes source text and emits only code-owned
    // spans/classes; this is not a general runtime-data innerHTML path.
    if (this.root.innerHTML !== html) this.root.innerHTML = html;

Before starting each request, set textContent to the new source code. That
clears any prior generated markup and leaves readable fallback text pending
colorization. The guarded innerHTML assignment replaces that text node; it
must never append generated markup beside the fallback.

ColorizedCode is a prerequisite for US-1048. MarkdownBlock's code override and
CodeBlock's hast-to-DOM migration will consume this vanilla output, so the
code element shape, className forwarding, language resolution, tab size, and
pending fallback must remain stable.

### Monaco host verdict

The answer is no: this task must not add a plain MonacoEditorHostView.
ColorizedCode uses Monaco's static colorize API, not monaco.editor.create,
createDiffEditor, an ITextModel, or an editor widget. A diff host cannot serve
that need, and a plain widget host would add ownership and layout machinery
that the actual consumer does not use. The correct narrower seam is
ColorizedCodeView, which calls colorize directly and owns only its DOM root
and pending-request invalidation.

US-1043's decision to withhold a plain host therefore remains correct. A later
task that converts a real Editor call site can design a plain host against
that editor's actual model and disposal requirements. US-1044 is not that
consumer.

## Implementation Plan

### 1. Rename and convert the menu builders

Use git mv for these React-to-TypeScript-only renames:

    src/renderer/editors/shared/editor-menu-items.tsx
        → src/renderer/editors/shared/editor-menu-items.ts
    src/renderer/editors/shared/link-open-menu.tsx
        → src/renderer/editors/shared/link-open-menu.ts

Modify only the renamed files. Replace the type-only UIKit barrel import with
the direct MenuItem type path and remove all React icon component imports.

Before, src/renderer/editors/shared/editor-menu-items.tsx contains:

    import type { MenuItem } from "../../uikit";
    import { CopyIcon, FolderOpenIcon, GlobeIcon, KeyOffIcon,
        LockIcon, RenameIcon, SaveIcon, UnlockIcon } from "../../theme/icons";
    ...
    icon: <GlobeIcon />,
    icon: <FolderOpenIcon />,
    icon: <CopyIcon />,
    icon: <SaveIcon />,
    icon: <RenameIcon />,
    icon: <UnlockIcon />,
    icon: <LockIcon />,
    icon: <KeyOffIcon />,

After, src/renderer/editors/shared/editor-menu-items.ts should contain the
direct factory and actual DOM nodes:

    import type { MenuItem } from "../../uikit/Menu/types";
    import { createIconElement } from "../../uikit/shared/slots";
    ...
    icon: createIconElement("globe"),
    icon: createIconElement("folder-open"),
    icon: createIconElement("copy"),
    icon: createIconElement("save"),
    icon: createIconElement("rename"),
    icon: createIconElement("unlock"),
    icon: createIconElement("lock"),
    icon: createIconElement("key-off"),

Preserve every label, disabled expression, startGroup flag, lazy app import,
clipboard action, and host callback exactly. Do not change MenuItem.icon from
any; other producers still supply React icons until later tasks.

Before, src/renderer/editors/shared/link-open-menu.tsx has React icon values:

    import React from "react";
    import { GlobeIcon, OpenFileIcon } from "../../theme/icons";
    import { IncognitoIcon } from "../../theme/language-icons";
    ...
    icon: <OpenFileIcon />,
    icon: <GlobeIcon color={DEFAULT_BROWSER_COLOR} />,
    icon: <GlobeIcon color={profile.color} />,
    icon: <IncognitoIcon />,

After, src/renderer/editors/shared/link-open-menu.ts should use fresh DOM
nodes per invocation:

    import type { MenuItem } from "../../uikit/Menu/types";
    import { createIconElement } from "../../uikit/shared/slots";
    import { IncognitoIcon } from "../../theme/language-icons";
    ...
    icon: createIconElement("open-file"),
    icon: createIconElement("globe", { color: DEFAULT_BROWSER_COLOR }),
    icon: createIconElement("globe", { color: profile.color }),
    icon: createDirectMenuIcon(IncognitoIcon),

Implement createDirectMenuIcon with the MenuView missing-builder error.
Keep appendLinkOpenMenuItems as a mutating helper and preserve the async
openRawLink action, browserMode values, disabled propagation, startGroup
placement, profile label, and profile color.

Do not change the callers merely because their imports now resolve to .ts.
The three .ts model consumers should no longer gain a React import through
these utilities. The JSX consumers still own their existing React imports.

### 2. Add the vanilla FindBar view and retain the React face

Create src/renderer/editors/shared/FindBarView.ts. Define or share the exact
FindBarProps interface there, including the optional placeholder, and expose a
public FindBarView constructor for mountVanilla. Use direct imports from:

- src/renderer/uikit/Panel/panel-style.ts;
- src/renderer/uikit/Text/text-style.ts;
- src/renderer/uikit/Input/InputView.tsx;
- src/renderer/uikit/IconButton/IconButtonView.tsx;
- src/renderer/uikit/shared/vanilla-view.ts.

Do not add a FindBar-specific CSS file: the existing Panel, Input, and
IconButton static styles travel through their direct view/factory imports, and
the current FindBar has no additional stylesheet.

Create stable child roots in the constructor, append them to the same panel
hierarchy, and mount InputView and all three IconButtonViews explicitly in
onMount. Register the child views with child() because their lifetimes match
FindBarView. Use onUpdate(props) to update their callbacks, input value,
placeholder, and the derived match label. Keep any input element lookup used
for focus/select as an explicit view field or a stable descendant lookup; do
not create a second input.

Before, src/renderer/editors/shared/FindBar.tsx owns React hooks and JSX:

    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);
    ...
    return <Panel> ... <Input ref={inputRef} ... /> ... </Panel>;

After, keep the same exported React component signature but make it only an
adapter:

    import { mountVanilla } from "../../uikit/shared/mount";
    import { FindBarView } from "./FindBarView";
    import type { FindBarProps } from "./FindBarView";
    export type { FindBarProps } from "./FindBarView";

    export function FindBar(props: FindBarProps) {
        return mountVanilla(FindBarView, props);
    }

The adapter is a React component in the existing React tree, not a new root.
No consumer changes are planned.

### 3. Add the vanilla ColorizedCode view and retain its React face

Create src/renderer/editors/shared/ColorizedCodeView.ts. Move the module-level
JSON Monarch registration unchanged into this module, before the view class,
so importing the shared implementation registers it exactly once. Do not move
the registration into the constructor, onMount, update, or disposal; the
registration has module lifetime. Define the same ColorizedCodeProps shape
using React's HTMLAttributes<HTMLElement> type plus code, language, and
optional tabSize. The type may be imported type-only; the view must not mount
or render a React tree.

Use a code element as the VanillaView root. Apply className and residual
attributes with the established react-compat helper so class, style, aria,
data, and event props retain the behavior of the current JSX spread. Before
each request, set root.textContent = props.code so pending colorization always
shows readable source and any prior HTML/text node is cleared. On code,
language, or tabSize changes, invalidate the previous generation, restore the
new plain text, and start one new colorize request. When a current request
returns a non-empty HTML string, use the documented, guarded innerHTML
assignment from the preceding subsection; assigning innerHTML replaces the
fallback text node rather than appending beside it. An empty result preserves
the plain-text fallback, matching the current truthy html branch. On disposal,
invalidate the generation and remove residual listeners. A non-current result
must never replace current content.

Before, src/renderer/editors/shared/ColorizedCode.tsx imports React hooks and
Monaco and contains:

    const [html, setHtml] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        monaco.editor.colorize(code, language, { tabSize }).then((result) => {
            if (!cancelled) setHtml(result);
        });
        return () => { cancelled = true; };
    }, [code, language, tabSize]);

After, the .tsx face should be a thin adapter:

    import { mountVanilla } from "../../uikit/shared/mount";
    import { ColorizedCodeView } from "./ColorizedCodeView";
    import type { ColorizedCodeProps } from "./ColorizedCodeView";

    export function ColorizedCode(props: ColorizedCodeProps) {
        return mountVanilla(ColorizedCodeView, props);
    }

The view owns the equivalent generation/cancellation behavior and calls
monaco.editor.colorize directly. The module-level grammar registration is
executed once on import and is not repeated per view. It must preserve tabSize
default 4, the truthy-result behavior of the current html branch, the
code-element output, className forwarding, arbitrary HTML attributes, readable
plain-text fallback, and replacement (not append) when switching to generated
HTML. No consumer files need to change, including MarkdownBlock or CodeBlock.

### 4. Audit and handoff checks

After implementation, verify:

- no .tsx menu builder remains at either old path and neither renamed builder
  imports React or a React icon component;
- every MenuItem icon created in these two builders is an SVG node, with the
  registry-backed names verified above and Incognito using its direct builder;
- FindBar.tsx and ColorizedCode.tsx contain only the React-facing signatures
  and mountVanilla calls;
- FindBarView mounts all children explicitly and preserves keyboard,
  focus/select, labels, callbacks, and updates;
- ColorizedCodeView has no editor-widget host and rejects stale asynchronous
  colorize results;
- no MenuItem.icon typing, MenuView rendering, icon registry, Monaco diff
  host, or consumer source was broadened;
- UTF-8 inspection preserves user-visible em dashes and bullets;
- lint, typecheck, and the applicable production build pass when the source
  implementation is later made. No unit tests are to be added.

## Concerns

1. MenuItem icon values must be Nodes, not registry-name strings. The string
   branch of fillSlot writes literal text. This is the main Half A correctness
   trap. ButtonView and IconButtonView accepting name strings does not change
   this rule.

2. Incognito has no icon-registry entry. Keep its direct createElement node
   with the same explicit missing-builder throw as MenuView. Do not silently
   pass an unknown string to createIconElement, and do not change the global
   registry for this one consumer.

3. DOM-node sharing would move an icon between menus. Current builders create
   arrays and nodes per call, and current context events are per native event,
   so simultaneous-menu sharing is not a present defect. Keep construction
   inside the builder functions to preserve that property.

4. VanillaView.update replaces this.props before onUpdate. FindBarView should
   use incoming props directly and ColorizedCodeView should compare explicit
   request generations; neither should treat this.props as the old props.

5. child() does not mount. Every long-lived FindBar child must be appended and
   explicitly mounted. The views are lifetime-matched children, so child()
   ownership is correct. No repeated transient child is to be registered
   without a separate manual ownership strategy.

6. VanillaView.dispose() leaves root attached. The React mountVanilla adapter
   removes the retired view root in its cleanup. No view cleanup should assume
   dispose detaches the DOM.

7. ColorizedCode's Monaco dependency is the static colorize API. It does not
   justify either MonacoDiffEditorHostView reuse or a plain host addition.
   Adding a plain host here would be speculative and would repeat the
   US-1043 open seam without a widget consumer.

8. The React-facing ColorizedCode props include arbitrary HTML attributes,
   although current direct call sites mostly pass code, language, className,
   and tabSize. Preserve the full type and residual-attribute forwarding so
   CodeBlock's forwarded hast props remain valid during US-1048.

9. The innerHTML write is intentionally narrow, code-owned output from
   Monaco's escaping colorizer. Keep the §3.4 justification as a code comment,
   compare existing innerHTML before assigning, and never generalize this
   exception to interpolated source or arbitrary renderer output.

10. No hardcoded colors, require("path"), require("fs"), hand-rolled
   unknown-error stringification, Emotion, or new inline layout styling may
   enter the implementation. Existing palette constants and UIKit style
   factories remain the sources of visual styling.

## Acceptance Criteria

- src/renderer/editors/shared/editor-menu-items.tsx and
  src/renderer/editors/shared/link-open-menu.tsx are renamed to .ts and have
  no React import or JSX.
- Every menu icon in both renamed files is a DOM node. Registry names globe,
  folder-open, copy, save, rename, unlock, lock, key-off, and open-file are
  passed through createIconElement with existing color props preserved.
  Incognito uses its direct DOM builder with an explicit missing-builder
  failure path.
- MenuItem.icon remains any, MenuView remains unchanged, and no icon name is
  assigned as a menu icon string.
- The menu builders continue returning/mutating fresh per-invocation items;
  no reusable DOM icon node can be shared between simultaneous menus.
- FindBar.tsx retains the exported FindBar and FindBarProps React-facing
  contract but only mounts FindBarView. FindBarView reproduces the panel,
  input, match counter, three controls, focus/select behavior, keyboard
  shortcuts, default placeholder, and all callback/value updates.
- ColorizedCode.tsx retains the ColorizedCode React-facing contract but only
  mounts ColorizedCodeView. The JSON Monarch registration remains a
  module-level, once-per-import side effect in ColorizedCodeView.ts; it is not
  repeated by view construction or mount. The view preserves Monaco colorize
  output, tabSize default, code-element fallback, className and residual HTML
  attributes, and stale-request cancellation.
- The colorized HTML write has a code comment documenting the §3.4 exception,
  cites Monaco's source escaping at
  node_modules/monaco-editor/esm/vs/editor/common/viewLayout/viewLineRenderer.js:856-860,
  and is guarded by if (element.innerHTML !== html) before assignment.
  Before each request, textContent shows readable fallback code and clears
  prior HTML; the guarded assignment replaces that text rather than appending.
- The five direct ColorizedCode call patterns remain valid; MarkdownBlock
  continues to reach it through CodeBlock without a consumer edit. The
  vanilla output is explicitly documented as a prerequisite for US-1048.
- No plain MonacoEditorHostView is added. ColorizedCodeView calls the static
  colorize API directly because no Monaco widget/model consumer exists here;
  US-1043's withholding decision remains resolved.
- All child views are explicitly mounted, onUpdate does not rely on previous
  this.props, and retired roots are removed by mountVanilla's adapter.
- No unit tests, implementation outside this scope, dashboard/epic edits, or
  commit are made by this planning task. Files are written as UTF-8.

## Files Changed

| File | Planned change |
|---|---|
| src/renderer/editors/shared/editor-menu-items.tsx → src/renderer/editors/shared/editor-menu-items.ts | Rename and replace React icon elements with registry-backed DOM icon nodes. |
| src/renderer/editors/shared/link-open-menu.tsx → src/renderer/editors/shared/link-open-menu.ts | Rename and replace registry-backed icons with DOM nodes, retaining IncognitoIcon as a direct DOM-builder node. |
| src/renderer/editors/shared/FindBar.tsx | Keep the FindBar React face and replace hook/JSX implementation with mountVanilla(FindBarView, props). |
| src/renderer/editors/shared/FindBarView.ts | New vanilla FindBar composition using Panel, InputView, IconButtonView, explicit child mounts, and native keyboard/focus behavior. |
| src/renderer/editors/shared/ColorizedCode.tsx | Keep the ColorizedCode React face and replace hooks/Monaco work with mountVanilla(ColorizedCodeView, props). |
| src/renderer/editors/shared/ColorizedCodeView.ts | New vanilla code root with Monaco colorize, JSON grammar registration, residual HTML attributes, fallback text, and stale-request invalidation. |

No new FindBar stylesheet is planned; existing UIKit static styles are sufficient.
