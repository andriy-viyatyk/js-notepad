# US-1051: Convert SVG and HTML editor bodies to BodyView

Parent epic: [EPIC-060: De-React Epic E2 — The embeddable bodies](../../epics/EPIC-060.md)

This is a planning document only. It does not implement code, edit doc/active-work.md or the epic,
or create a commit.

## Goal

Replace the React SVG and HTML chrome-free bodies with vanilla VanillaView classes. Keep both
index.tsx files as React TextChrome shells, mount the new views inside those shells, and expose
BodyView so the existing editorRegistry normalization continues to serve notebook consumers.

## Background

EPIC-060 Decisions E2-2 and E2-3 are fixed constraints. E2-2 keeps the SVG/HTML index.tsx chrome
shells and editors/base chrome React. E2-3 says editorRegistry.loadModule already creates a React
Body from BodyView when Body is absent; the notebook per-note dispatch needs no change. Deleting
the Body arm is US-1054.

The actual mount helper is src/renderer/uikit/shared/mount.tsx (there is no mount.ts in this
checkout). Its VanillaHost appends a view root, calls mount(), forwards props to update(), and
disposes/removes the root. The view root is the layout participant; the adapter host is
display: contents.

Mermaid is the worked example in src/renderer/editors/mermaid/MermaidBodyView.ts and
src/renderer/editors/mermaid/index.tsx. Follow its public props interface, direct state/host
subscriptions, explicit typedQueue.subscribe drain, incoming-props update, and direct
ImageViewportView construction. VanillaView.child() claims ownership but does not mount a child:
append each owned child root and call mount() exactly once before insertion/use.

The current SVG body at src/renderer/editors/svg/SvgBody.tsx:6-40 reads
model.host.state.use(s => s.content), percent-encodes a data:image/svg+xml URL, renders the React
ImageViewport face with alt SVG Preview and imageModelSetter, drains typedQueue as a no-op, and
wraps the image in a height=maxEditorHeight div when embedded.

The current HTML body at src/renderer/editors/html/HtmlBody.tsx:5-75 computes
content + injectedScript, renders an iframe with sandbox="allow-scripts", title HTML Preview, and
mode-dependent inline styles. The script capture-phase listener blocks anchor navigation and posts
html:interact on pointerdown. The host accepts that message only when
event.source === iframeRef.current?.contentWindow, then dispatches bubbling document-body mousedown.
The "*" target origin is safe only because this source check remains.

HtmlEditor.ts:35-37 stores the live iframe in _captureEl. setCaptureElement is called by the body;
exportPng at lines 75-89 reads its getBoundingClientRect and rejects null or zero geometry. React
keeps the same iframe element while srcDoc changes, so the vanilla view must keep one stable iframe
root and update only its srcdoc property.

### Host assignment timing verified

The normal lifecycle establishes a non-null host before either body is mounted. The generic
TextHostEditorModel.restore path assigns or creates the host at lines 205-210 and calls adoptHost at
lines 215-216; applyRestoreData only stores a pending descriptor at lines 169-176. Switching calls
adoptHost before onHostAttached at lines 180-203. The page attachment path calls adoptHost at
PagesLifecycleModel.ts:77 and bootstrapFromHost at lines 78-82 before returning the editor for
rendering. The embedded notebook path is explicit: NoteItemActiveEditor.tsx:81 adopts the note
host, line 82 awaits restore, and line 85 publishes the editor to render only after that completes.

The view will still use a bindToHostIfNeeded helper, called from onMount and onUpdate. It tracks the
currently bound host, unbinds when the model or host changes, and binds a newly non-null host. This
defensive onUpdate retry prevents a late host from becoming a permanent empty body if a future
caller violates the established lifecycle; the verified current paths do not rely on that retry.

## Implementation Plan

### 1. New SVG view: src/renderer/editors/svg/SvgBodyView.ts

Remove src/renderer/editors/svg/SvgBody.tsx and export this exact props interface and public class:

~~~ts
export interface SvgBodyViewProps {
    model: SvgEditor;
    editorConfig?: EditorConfig;
    imageModelSetter?: (model: ImageViewportModel | null) => void;
}

export class SvgBodyView extends VanillaView<SvgBodyViewProps> { ... }
~~~

Use direct ImageViewportView and ImageViewportProps/ImageViewportModel imports, not the React
ImageViewport compatibility face. Create a stable panel root using the existing panel-style
factories. Map maxEditorHeight as follows:

~~~ts
const maxH = editorConfig?.maxEditorHeight;
const embedded = maxH !== undefined;
return {
    name: "svg-root",
    direction: "column",
    flex: embedded ? undefined : true,
    height: embedded ? maxH : 0,
};
~~~

The panel wrapper is a deliberate non-embedded layout delta: React returned ImageViewport directly,
whereas the stable vanilla root needs one parent that can represent both height modes. In the
non-embedded path the root is a growing column and its ImageViewport child has flex: 1 1 auto and
height: 100% from ImageViewport.css, so this must be verified geometrically rather than assumed.
The root deliberately has no overflow hidden; the embedded React wrapper had no such rule and the
child viewport already owns its clipping.

Construct one ImageViewportView with src equal to
"data:image/svg+xml," plus encodeURIComponent(content), alt "SVG Preview", and the optional
imageModelSetter. Register it with child(), append its root, then mount it once in onMount. On
host content changes call viewport.update with the new props; do not create a new claimed child.

Read the initial content with model.host?.state.get().content ?? "". In onMount, the required order
is: mount the already-constructed viewport first; bind the host directly with
host.state.subscribe(listener, state => state.content) second; then call
typedQueue.subscribe(() => {}) third. The queue subscription can synchronously drain queued events,
so it must also come after the viewport is mounted. Own both returned unsubscribers, and have
bindToHostIfNeeded retry from onUpdate when a host becomes non-null. In onUpdate(props), applyPanel-
attributes(root, resolvePanelAttributes(...)) using props.editorConfig, refresh the callback, and
update the existing viewport. The root is not detached by the view; mountVanilla owns removal.

Before:
~~~tsx
const content = host ? host.state.use((s) => s.content) : "";
model.typedQueue.use(() => {});
return <ImageViewport onModel={imageModelSetter} src={src} alt="SVG Preview" />;
~~~

After:
~~~ts
this.viewport.mount();
this.bindToHostIfNeeded();
this.queueSubscription = this.model.typedQueue.subscribe(() => {});
~~~

### 2. New HTML view: src/renderer/editors/html/HtmlBodyView.ts

Remove src/renderer/editors/html/HtmlBody.tsx and export:

~~~ts
export interface HtmlBodyViewProps {
    model: HtmlEditor;
    editorConfig?: EditorConfig;
}

export class HtmlBodyView extends VanillaView<HtmlBodyViewProps> { ... }
~~~

Keep injectedScript unchanged. Make one HTMLIFrameElement the VanillaView root. In the constructor,
configure the detached iframe before passing it to super(props, iframe): set sandbox="allow-scripts"
and title="HTML Preview" there. mount.tsx appends the root before invoking onMount, so sandbox must
already be present before the first navigation. In onMount set only srcdoc to content +
injectedScript, plus the styles and capture registration. applyContent must never clear or reset the
sandbox attribute or title. The content subscription is host.state.subscribe(listener, state =>
state.content); it replaces state.use and updates the same iframe. useMemo is replaced by the
synchronous applyContent(content) helper.

The constructor shape must make the ordering visible in code:

~~~ts
const iframe = document.createElement("iframe");
iframe.setAttribute("sandbox", "allow-scripts");
iframe.title = "HTML Preview";
super(props, iframe);
this.iframe = iframe;
~~~

Do not move those two attribute assignments into onMount. Only the initial/current srcdoc belongs in
applyContent; it must never clear or re-set sandbox.

Replace the iframe useRef with the stable class-held root. Replace the capture useEffect with
model.setCaptureElement(iframe) after mount, old-model clear before a model change, and
model.setCaptureElement(null) in onDispose. This preserves HtmlEditor.exportPng and the live iframe
identity across content changes.

Replace the message useEffect with an onMount listener whose first condition is exactly:
event.source !== this.iframe.contentWindow. On the expected payload dispatch
document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); register listener
removal with this.own. Do not add allow-same-origin or trust the payload without source validation.
Replace typedQueue.use with typedQueue.subscribe and own its unsubscribe.

Use the same bindToHostIfNeeded helper as the SVG view: call it from onMount and onUpdate, track the
bound host, and replace its content subscription if the model/host changes. The source-verified
normal lifecycle makes a null host at the first body mount unreachable, while the onUpdate retry is
the defensive behavior for a future late host.

applyFrameStyle must reproduce the React styles and clear stale properties during transitions:
embedded means height maxH in pixels, width 100%, border none, no flex growth; full-page means flex
1, border none, and cleared height and width. No iframe replacement is allowed during srcdoc updates.

Before:
~~~tsx
const content = host ? host.state.use((s) => s.content) : "";
model.typedQueue.use(() => {});
const safeSrcDoc = useMemo(() => content + injectedScript, [content]);
const iframeRef = useRef<HTMLIFrameElement | null>(null);
useEffect(() => {
    model.setCaptureElement(iframeRef.current);
    return () => model.setCaptureElement(null);
}, [model]);
useEffect(() => {
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
}, []);
return <iframe ref={iframeRef} srcDoc={safeSrcDoc} sandbox="allow-scripts" ... />;
~~~

After:
~~~ts
protected onMount(): void {
    this.applyContent(this.model.host?.state.get().content ?? "");
    this.model.setCaptureElement(this.iframe);
    this.subscribeToHost();
    this.installMessageListener();
    this.queueSubscription = this.model.typedQueue.subscribe(() => {});
}

protected onDispose(): void {
    this.model.setCaptureElement(null);
}
~~~

The abbreviated snippet does not replace the required owned host, queue, and message cleanups.

### 3. Repoint the React shells

In src/renderer/editors/svg/index.tsx, import SvgBodyView and mountVanilla, retain the React
useRef used by SvgToolbarBits, and replace only the body integration:

~~~tsx
// Before
<TextChrome ...>
    <SvgBody model={svg} imageModelSetter={(r) => { imageModel.current = r; }} />
</TextChrome>
Body: SvgEmbeddedBody,

// After
<TextChrome ...>
    {mountVanilla(SvgBodyView, {
        model: svg,
        imageModelSetter: (r) => { imageModel.current = r; },
    })}
</TextChrome>
BodyView: SvgBodyView,
~~~

Delete SvgEmbeddedBody. In src/renderer/editors/html/index.tsx, import HtmlBodyView and
mountVanilla and make the same limited change:

~~~tsx
// Before
<TextChrome ...><HtmlBody model={html} /></TextChrome>
Body: HtmlEmbeddedBody,

// After
<TextChrome ...>
    {mountVanilla(HtmlBodyView, { model: html })}
</TextChrome>
BodyView: HtmlBodyView,
~~~

Delete HtmlEmbeddedBody. Do not change either TextChrome shell, toolbar, menu, or shell useRef.

### Hook mapping

| Current hook/use | Vanilla replacement | Cleanup |
|---|---|---|
| SVG/HTML host.state.use(s => s.content) | Initial host.state.get(), then host.state.subscribe with content selector. | Own host unsubscribe; replace it on model change. |
| SVG/HTML typedQueue.use(() => {}) | typedQueue.subscribe(() => {}), which drains queued events. | Own returned unsubscribe. |
| HTML useMemo | applyContent(content) from the host subscription. | None; stable iframe remains. |
| HTML iframe useRef | Stable iframe root/class field. | Capture ref cleared in onDispose and model replacement. |
| HTML capture useEffect | setCaptureElement in onMount; clear old/current model refs. | onUpdate and onDispose. |
| HTML message useEffect | window listener in onMount. | Own removeEventListener cleanup. |

The useRef in the React index.tsx shells remains intentionally: it is the toolbar bridge to the
ImageViewportModel and is also the Mermaid convention.

### CSS and explicit no-change list

Neither body needs a CSS file. SVG reuses ImageViewport.css and Panel.css through existing
factories; HTML retains inline iframe layout styles. Neither view toggles hidden on a root or an
author-display element, so neither needs a [hidden] display:none counter-rule.

No changes are planned to:
- src/renderer/editors/base/TextChrome.tsx, editors/base chrome, or editorRegistry.ts.
- src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx.
- src/renderer/uikit/shared/vanilla-view.ts or src/renderer/uikit/shared/mount.tsx.
- Any file under src/renderer/uikit/ImageViewport/.
- SvgEditor.ts, HtmlEditor.ts, editor barrels/registration, theme files, Panel.css,
  ImageViewport.css, doc/active-work.md, or doc/epics/EPIC-060.md.

## Concerns

1. E2-2 fixes the React shell boundary; do not convert index.tsx or TextChrome.
2. E2-3 fixes registry/notebook compatibility; expose BodyView and do not edit the adapter or
   notebook consumer.
3. child() claims but does not mount. SVG must append and mount ImageViewportView exactly once so
   ownership and ImageViewportModel onModel(null) disposal are correct.
4. Keep one SVG viewport and one HTML iframe. Update their props/srcdoc rather than replacing them.
5. Preserve HTML sandbox="allow-scripts", the exact injected script, target origin "*", and the
   event.source === iframe.contentWindow guard. Do not add allow-same-origin.
6. HtmlEditor.exportPng requires the current mounted iframe and rejects null/zero geometry. Set,
   clear on model replacement, and clear again on view disposal.
7. Reapply incoming maxEditorHeight and clear stale HTML height/width/flex properties on transitions.
8. The iframe sandbox/title constructor ordering is mandatory: mount.tsx appends before onMount, so
   the detached root must already have sandbox before any srcdoc navigation. applyContent changes
   srcdoc only and never resets sandbox.
9. The SVG root intentionally omits overflow hidden to match the old embedded wrapper; the child
   ImageViewport still clips itself. The added non-embedded wrapper is deliberate and requires the
   separate full-page offsetWidth assertion.
10. Source inspection proves host assignment precedes body publication in restore, switch, page
    attachment, and notebook paths. bindToHostIfNeeded is nevertheless retried in onUpdate so a
    future late-host caller cannot remain permanently empty.
11. No new body CSS or hidden counter-rule is required.

## Acceptance Criteria

- SvgBody.tsx is replaced by SvgBodyView.ts, with the exact SvgBodyViewProps interface and a public
  SvgBodyView extending VanillaView<SvgBodyViewProps>.
- HtmlBody.tsx is replaced by HtmlBodyView.ts, with the exact HtmlBodyViewProps interface and a
  public HtmlBodyView extending VanillaView<HtmlBodyViewProps>.
- Both index.tsx shells remain React TextChrome shells, mount the new view via mountVanilla, remove
  explicit embedded Body wrappers, and expose BodyView.
- SVG preserves encoded SVG URL, alt text, direct ImageViewportView, host content updates,
  image-model callback, typed queue drain, and maxEditorHeight behavior.
- HTML preserves srcdoc updates on a stable iframe, sandbox/script/source validation, capture set
  and clear, typed queue drain, iframe style modes, and cleanup.
- HTML sets sandbox and title on the detached constructor root before mount.tsx can attach it, and
  applyContent never clears or resets sandbox.
- SVG mounts its viewport before host-state subscription and queue subscription; host binding is
  retried from onUpdate if a future late-host path appears.
- Every listed body hook is absent from the new vanilla files and has the mapped lifecycle cleanup.
- No new CSS file or [hidden] counter-rule is added; all owned children are mounted exactly once.

### Visual verification

Open representative SVG and HTML documents in their dedicated SVG Preview and HTML Preview editors,
then open a notebook containing SVG and HTML notes to exercise registry-normalized bodies.

SVG assertions: the image is centered and visible; zoom/reset/copy work; source editing refreshes
without replacing the shell; embedded max height is respected; and DOM/runtime probes report
offsetWidth > 0 and positive height for both the full-page/non-embedded SVG root and the embedded
SVG root, not merely element presence. This explicitly guards against the 0px-wide flex defect
found in EPIC-059's visual round and validates the deliberate non-embedded wrapper geometry.

HTML assertions: srcdoc renders; links do not navigate; pointerdown inside the iframe dismisses an
open host menu; image export captures the visible iframe; sandbox is exactly allow-scripts; iframe
offsetWidth > 0 and offsetHeight > 0; capture points to that same iframe; a matching payload from
another source is ignored while one from iframe.contentWindow is accepted.

Notebook assertions: no second page chrome shell appears, both embedded body geometries are positive
including offsetWidth > 0, and after HTML unmount/navigation HtmlEditor.exportPng no longer sees the
old iframe reference.

Finally, open one untouched editor such as Markdown or Grid and assert that it still renders with
positive geometry. This is the epic-level collateral smoke check for the shared React/vanilla seam.

No implementation, tests, dashboard/epic edits, or commit are part of this planning step.

## Files Changed

| File | Planned change |
|---|---|
| src/renderer/editors/svg/SvgBodyView.ts | New vanilla SVG view with panel root, direct ImageViewportView, host/queue subscriptions, callback handoff, and height updates. |
| src/renderer/editors/html/HtmlBodyView.ts | New vanilla HTML view with stable iframe root, srcdoc, sandbox/message handling, capture registration, subscriptions, and cleanup. |
| src/renderer/editors/svg/SvgBody.tsx | Remove the React SVG body after repointing its consumers. |
| src/renderer/editors/html/HtmlBody.tsx | Remove the React HTML body after repointing its consumers. |
| src/renderer/editors/svg/index.tsx | Keep React shell/toolbar; mount SvgBodyView and replace Body with BodyView. |
| src/renderer/editors/html/index.tsx | Keep React shell/toolbar; mount HtmlBodyView and replace Body with BodyView. |

No other files are planned to change; the explicit no-change list is part of the scope.
