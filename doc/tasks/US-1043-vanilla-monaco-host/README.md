# US-1043: Vanilla Monaco host + convert the compare editor

Parent epic: [EPIC-059: De-React Epic E1 — Editor foundations](../../epics/EPIC-059.md)

## Goal

Add a shared vanilla Monaco host that owns Monaco widgets directly, then convert
the compare React island to an owned vanilla view. Compare mode must retain its
editable write-back and dispose its diff editor, Monaco models, and subscriptions
exactly once while removing the React root currently created by
PageContentView.updateCompare.

Only compare is converted here. The other 11 component importers remain later
tasks and must adopt the host without a controlled-prop compatibility shim.

## Background

### Epic decisions and vanilla conventions

E1-3 defines this as a control inversion: a vanilla host owns
monaco.editor.create / monaco.editor.createDiffEditor and exposes the widget;
callers command the widget and its models. Do not recreate value, onChange,
options, onMount, keepCurrentModel, or theme as a controlled-prop shim. This is
EPIC-059's third documented Rule 2 exception.

E1-4 requires deleting loader.config({ monaco }) and its import. The direct
monaco-editor instance already held by configure-monaco.ts is the instance the
vanilla host uses. The five language files currently import the Monaco type from
the React wrapper even though each also imports monaco-editor; their type must be
repointed to the direct package.

US-1042 established the relevant conventions in
doc/tasks/US-1042-vanilla-editor-seam/README.md and the implemented
src/renderer/editors/toolset/ToolsetEditorView.ts:

- use VanillaView, direct UIKit view/style imports, and static/co-located CSS;
- this.child(view) claims disposal ownership but does not mount the child;
  every child therefore needs an explicit mount();
- VanillaView.update() assigns this.props before onUpdate, so previous model
  identities must be stored in explicit fields;
- VanillaView.dispose() deliberately leaves root attached; retiring code must
  remove its root itself;
- install state subscriptions in onMount and keep explicit identity fields when
  view props change.

The host belongs in src/renderer/editors/shared/: it is editor integration code
shared by future editor conversions, not a generic UIKit primitive. Keep
monaco-editor out of src/renderer/uikit/; Rule 6 and open decision #5 preserve
that extraction boundary. The only UIKit change in this task is the additive
Toolbar element factory and its immediate ToolbarView consumer described below.

### The actual Monaco surface

There are 18 application importers of @monaco-editor/react:

| Category | Importers verified in source |
|---|---|
| Editor/DiffEditor components (12 files) | src/renderer/editors/compare/CompareEditor.tsx:2; src/renderer/editors/text/ScriptPanel.tsx:1; src/renderer/editors/git-tree/CommitDiffPanel.tsx:1; src/renderer/editors/file-diff/FileDiffBody.tsx:1; src/renderer/editors/rest-client/ResponseViewer.tsx:2; src/renderer/editors/rest-client/RequestBuilder.tsx:2; src/renderer/editors/monaco/MonacoBody.tsx:1; src/renderer/editors/mcp-inspector/ToolResultView.tsx:2; src/renderer/editors/mcp-inspector/ToolArgForm.tsx:2; src/renderer/editors/mcp-inspector/ResourceContentView.tsx:2; src/renderer/editors/notebook/note-editor/MiniTextEditor.tsx:1; src/renderer/ui/dialogs/TextDialogView.ts:2 |
| Monaco type (5 files) | src/renderer/api/setup/monaco-languages/reg.ts:1, csv.ts:2, mermaid.ts:1, jsonl.ts:1, log.ts:1 |
| loader (1 file) | src/renderer/api/setup/configure-monaco.ts:2 |

The 11 component importers that are explicitly later tasks are:

| Later task candidate | Current component call site | Host kind |
|---|---:|---|
| src/renderer/editors/text/ScriptPanel.tsx | Editor at :429 | Editor |
| src/renderer/editors/git-tree/CommitDiffPanel.tsx | DiffEditor at :257 | DiffEditor |
| src/renderer/editors/file-diff/FileDiffBody.tsx | DiffEditor at :57 | DiffEditor |
| src/renderer/editors/rest-client/ResponseViewer.tsx | Editor at :349 and :374 | Editor, two instances |
| src/renderer/editors/rest-client/RequestBuilder.tsx | Editor at :383 and :558 | Editor, two instances |
| src/renderer/editors/monaco/MonacoBody.tsx | Editor at :135 | Editor |
| src/renderer/editors/mcp-inspector/ToolResultView.tsx | Editor at :93 | Editor |
| src/renderer/editors/mcp-inspector/ToolArgForm.tsx | Editor at :151 | Editor |
| src/renderer/editors/mcp-inspector/ResourceContentView.tsx | Editor at :101 | Editor |
| src/renderer/editors/notebook/note-editor/MiniTextEditor.tsx | Editor at :52 | Editor |
| src/renderer/ui/dialogs/TextDialogView.ts | React.createElement(Editor, ...) at :91 | Editor |

Every current call site uses automaticLayout: true either directly or through
an options object. Compare uses readOnly false, renderSideBySide true, and
automaticLayout true. File diff and git tree use DiffEditor with automaticLayout.
Script panel and Monaco body use editable Editor options with automaticLayout.
REST response/request, MCP result/argument/resource, notebook mini editor, and
text dialog also use automaticLayout.

No call site supplies a resize callback or a separate editor layout() call.
Automatic layout is the current resize mechanism. Keep it enabled in the host and
do not add ResizeObserver unless a later call site proves it necessary.

### Installed React wrapper behaviour

The installed package is @monaco-editor/react 4.7.0. Its source was read from
node_modules/@monaco-editor/react/dist/index.mjs.map, including the original
Editor.tsx and DiffEditor.tsx sources.

| Wrapper behaviour | Evidence | Vanilla requirement |
|---|---|---|
| Loading state and hidden editor container | MonacoContainer renders loading content until loader.init resolves, then reveals the container | Not needed: src/renderer/api/app.ts:135-141 awaits initMonaco before editors load, and the direct instance is synchronously imported. Do not add a React loading root. |
| Monaco initialization | Both components call loader.init in a mount effect | Not needed by the host; use the direct monaco-editor namespace configured by initMonaco. |
| Model creation/reuse | getOrCreateModel looks up Uri.parse(path), otherwise creates a model; no path creates a model without a URI | The host/view must deliberately create or attach models. Compare creates two per-view models from the TextFileModel snapshots and owns them. The generic host must support explicit attach/replacement for later callers. |
| keepCurrentModel and diff keep flags | Editor disposes its model unless keepCurrentModel; DiffEditor disposes each side unless its keep flag | Do not implement these as controlled props. Host-owned models are disposed by the host; explicitly borrowed models are not. Compare uses host-owned models. |
| beforeMount timing | Called immediately before initial model/widget creation | No compare callback is needed. The vanilla mount path creates models/widget before wiring compare's listener. |
| onMount timing | Called in a later React effect after isEditorReady, with widget and Monaco | The vanilla equivalent is the widget being available after host.mount(). Compare wires onDidChangeModelContent only after the diff editor and modified model exist. |
| options updates | A dependency update calls editor.updateOptions(options) | Construction options are initial host input. Later callers command editor.updateOptions themselves; no prop reconciliation is wanted. Compare options never change. |
| value/language updates | Editor uses setValue or executeEdits and setModelLanguage; DiffEditor updates both contents and both languages | Compare explicitly binds both TextFileModel states and updates each Monaco model only when values differ; language changes use monaco.editor.setModelLanguage. |
| Theme application | Wrapper calls monaco.editor.setTheme(theme) after creation and when theme changes | configure-monaco.ts defines and exports MONACO_THEME_NAME, sets that theme, and subscribes to themeState at :242-245. The host calls setTheme(MONACO_THEME_NAME) after creating its widget; the existing subscription re-applies the same theme globally when themeState changes. |
| Disposal | Wrapper disposes listeners, models according to keep flags, and widget | Required. The vanilla host must dispose every owned subscription, widget, and model exactly once. |
| Resize | Both widgets are created with automaticLayout: true inside a full-size container | Required construction option. Existing call sites do not manually resize. |

The package source imports loader internally, but an application search found no
direct loader use except configure-monaco.ts:2 and loader.config at :14. E1-4
therefore removes that application-level configuration while residual wrapper
importers are tracked as later tasks. Do not add a wrapper compatibility layer.

### Monaco setup, themes, workers, and types

src/renderer/api/setup/configure-monaco.ts imports
* as monaco from monaco-editor at :1 and defines type Monaco = typeof monaco at
:16. It exports MONACO_THEME_NAME = "custom-dark". initMonaco defines that
theme from the active theme's
theme.monaco.base, theme.monaco.colors, and customTokenRules at :86-100; it
registers the custom languages and subscribes to themeState at :242-245.
Directly created widgets therefore use the same singleton and theme.

The worker contract is separate and must not change. src/preload.ts:68-84 defines
window.MonacoEnvironment.getWorkerUrl, returning generated
monacoeditorwork/{json,html,ts,editor}.worker.bundle.js paths.
vite-plugin-monaco-editor-esm emits those bundles in vite.renderer.config.ts:78-80.
Neither file is part of this conversion.

### Compare ownership and reachability

E1-11 confirms that compare is not in src/renderer/editors/register-editors.ts:
there is no compare descriptor, module, registry arm, or AsyncEditorView path.
It is a React island rendered directly by the already-vanilla
src/renderer/ui/app/PageContentView.ts.

Current flow at PageContentView.ts:169-190:

    this.compareHandle = mountReactHandle(
        this.compareHost,
        this.compareElement(model, groupedModel, leftPageId),
    );
    // clearCompare removes the host immediately and disposes the React root
    // in a generation-guarded microtask.

sync() clears normal content and secondary views in compare mode, then calls
updateCompare only for the left page when both TextFileModel hosts are available
(PageContentView.ts:67-81). clearCompare captures the old handle/host, clears
the fields, increments generation, removes the host immediately, and queues
disposal only for the matching generation. The replacement must retain this
captured-resource, generation-counter, queueMicrotask, and root-removal pattern.

CompareEditor.tsx is 108 lines. CompareEditorModel at :16-36 has no component
state or effects: it stores the diff widget, owns one modified-content
subscription, writes modified edits to groupedModel, and disposes the
subscription/widget. The React function subscribes to both TextFileModel.state
objects through state.use, renders the toolbar, and passes controlled values and
construction options to DiffEditor.

The two TextFileModel objects are owned by the page/grouped-page lifecycle, not
by Monaco and not by compare. getTextFileHost supplies them. Compare must never
dispose either host. It creates temporary Monaco original/modified ITextModel
instances for the widget and disposes those with the widget.

The modified listener calls:

    groupedModel.changeContent(newValue, true);

In TextEditorModel.ts:254-263, the second argument is byUser. It still marks the
host modified and unsaved, but state.temp = state.temp && !byUser means true
records the edit as user-originated and prevents a temporary host from remaining
temporary. This write-back path must remain unchanged.

An application search found CompareEditor only at
src/renderer/ui/app/PageContentView.ts:3,178 plus the compare barrel and the
top-level src/renderer/editors/index.ts:19 re-export. There are no other runtime
importers. The index must continue to re-export CompareEditor and
CompareEditorProps.

### Disposal hazards and file-diff precedent

src/renderer/editors/file-diff/FileDiffBodyModel.ts:38-43 documents that
keepCurrentOriginalModel and keepCurrentModifiedModel make the wrapper dispose
only the widget, while the model owner disposes models later. Disposing a model
while DiffEditorWidget still has listeners can throw:
TextModel got disposed before DiffEditorWidget model got reset.

The comment at :138-145 adds the second hazard: React unmount cleanup, widget
disposal, and Monaco 0.52 listener removal occur in different phases. Monaco
0.55.1 must be re-checked rather than inheriting that comment. Its installed
diffEditorWidget.js still registers model onWillDispose listeners at :230-244
and treats disposal before the widget resets its model as a bug, while
setDiffModel at :304-324 deliberately defers previous diff-model reference
disposal with setTimeout(..., 0) so it runs after the transaction. The inner
CodeEditorWidget disposal is synchronous (codeEditorWidget.js:284-293 and
:1455-1475), but that does not remove the diff widget's deferred reference
cleanup. Therefore the host retains a macrotask defer.

The concrete host disposal sequence is: (1) use an explicit disposed guard and
dispose every host-owned IDisposable subscription, including the modified
onDidChangeModelContent listener; (2) detach the diff model with
diffEditor.setModel(null), then call IStandaloneDiffEditor.dispose(); (3) in a
single setTimeout(..., 0) callback, dispose only host-owned ITextModels. This
ordering is the direct-owner version of FileDiffBodyModel.ts:138-145: the
wrapper and React commit hazards disappear, but Monaco 0.55.1's own deferred
diff-model reference cleanup remains. Borrowed models are never disposed by
the host, and repeated host dispose calls are no-ops.

## Implementation Plan

### 1. Add the reusable vanilla Monaco diff host

Create src/renderer/editors/shared/MonacoDiffEditorHostView.ts and its co-located
static stylesheet src/renderer/editors/shared/MonacoDiffEditorHostView.css. The
plain editor host is intentionally withheld: no plain-editor consumer is in this
task, and the later editor conversion must design its ownership contract against
a real consumer rather than ship an unused seam. Use direct
monaco-editor types/runtime and VanillaView; do not import React or
@monaco-editor/react.

Before, there is no shared vanilla owner; callers use a component such as:

    <DiffEditor
        original={content}
        modified={groupedContent}
        language={language}
        options={{ automaticLayout: true, ... }}
        theme={MONACO_THEME_NAME}
        onMount={editorModel.editorDidMount}
    />

After, provide a vanilla constructor for the diff widget:

    const editorHost = new MonacoDiffEditorHostView({
        options: { automaticLayout: true, readOnly: false, renderSideBySide: true },
    });
    editorHost.mount();
    const editor = editorHost.editor;
    editor?.updateOptions({ readOnly: false });

The host roots need a static class giving Monaco a full-size, flex-safe
container: width 100%, height 100%, min-height 0, and appropriate flex growth.
Keep colors in theme variables; do not add inline styles or color literals.
Keep automaticLayout true as the default construction option while allowing later
callers to add options.

Import MONACO_THEME_NAME from configure-monaco.ts and use it as the host's
default theme; do not add another "custom-dark" literal. Do not update the
other eight existing hardcoded theme call sites: their conversions belong to
their own later tasks.

The host contract must make ownership unambiguous. It exposes the created
IStandaloneCodeEditor or IStandaloneDiffEditor, supports explicit model attach
or replacement, tracks which ITextModel objects it owns, and disposes each owned
model exactly once after safe widget disposal. Borrowed models can be attached
without being disposed by the host. onMount is replaced by the synchronous
post-mount property/command boundary; no loading React tree, controlled prop API,
or wrapper-level keepCurrentModel API is allowed.

For the diff host used by compare, create the widget with
monaco.editor.createDiffEditor, attach the two temporary models, dispose the
content listener before widget disposal, call setModel(null), dispose the
widget, then defer host-owned model disposal to one macrotask as documented in
the disposal section above. Repeated dispose is a no-op; borrowed models are
never disposed.
The host, not the compare view, is the sole owner of widget/model
cleanup.

### 2. Remove wrapper-only Monaco setup dependency

Modify src/renderer/api/setup/configure-monaco.ts.

Before:

    import * as monaco from "monaco-editor";
    import { loader } from "@monaco-editor/react";
    // ...
    loader.config({ monaco });
    type Monaco = typeof monaco;

After:

    import * as monaco from "monaco-editor";
    // ...
    export const MONACO_THEME_NAME = "custom-dark";
    type Monaco = typeof monaco;

Delete only the loader import/configuration. Preserve theme setup, language
registration, compiler settings, keybindings, IntelliSense loading, and the
themeState subscription. Verify with rg that no application file directly
imports or calls loader after this change.

Modify only these five type importers, preserving runtime registration:

- src/renderer/api/setup/monaco-languages/reg.ts
- src/renderer/api/setup/monaco-languages/csv.ts
- src/renderer/api/setup/monaco-languages/mermaid.ts
- src/renderer/api/setup/monaco-languages/jsonl.ts
- src/renderer/api/setup/monaco-languages/log.ts

Before:

    import { Monaco } from "@monaco-editor/react";
    import * as monaco from "monaco-editor";

After:

    import * as monaco from "monaco-editor";
    type Monaco = typeof monaco;

Do not change vite.renderer.config.ts, src/preload.ts, worker URLs, worker
labels, or language registrations.

### 3. Centralize the vanilla toolbar element contract

Add src/renderer/uikit/Toolbar/toolbar-style.ts, mirroring the factory pattern
in src/renderer/uikit/Panel/panel-style.ts and src/renderer/uikit/Text/text-style.ts.
Its createToolbarElement(props) factory owns toolbar style and semantics:
class toolbar-root, role toolbar, aria-orientation, data-type, data-orientation,
data-direction, data-bg, data-border-top, data-border-bottom, data-disabled,
and aria-disabled. It must not set data-roving-host. That attribute advertises
that a roving-tabindex manager is present and findFocusable reads it; the
factory has no manager to advertise.

Export the shared applyToolbarAttributes helper alongside
createToolbarElement: the factory creates an element and delegates to that
helper, while ToolbarView.applyProps calls the same helper on its existing
root. Thus the factory and the existing component have one contract instead
of two copies. ToolbarView remains responsible for data-roving-host
because its dynamic toolbar owns the roving manager; its onMount React slot
must remain unchanged. This is the only UIKit change in US-1043.

The compare view calls createToolbarElement for its static toolbar and does not
use ToolbarView, because ToolbarView.onMount unconditionally calls
mountReactHandle at ToolbarView.tsx:41-44. The compare toolbar therefore has no
roving tabindex. That is intentional and acceptable: it contains exactly one
focusable control, the exit button, so there is nothing to rove between.

Before, the compare conversion would duplicate toolbar-root attributes in the
editor file:

    toolbar.dataset.type = "toolbar";
    toolbar.dataset.rovingHost = "";
    toolbar.setAttribute("role", "toolbar");

After, the static view uses the factory and leaves roving ownership absent:

    const toolbar = createToolbarElement({
        orientation: "horizontal",
        background: "dark",
        borderBottom: true,
    });
    // No data-roving-host: this toolbar has one focusable exit button.

The factory imports the existing Toolbar.css directly. It does not add a
monaco-editor dependency to uikit.

### 4. Convert CompareEditor.tsx to a vanilla view

Rename src/renderer/editors/compare/CompareEditor.tsx to
src/renderer/editors/compare/CompareEditor.ts and retain the public class name
CompareEditor so the barrel export remains stable. Preserve CompareEditorProps:
model, groupedModel, and leftPageId.

Before:

    export function CompareEditor(props: CompareEditorProps) {
        const editorModel = useComponentModel(props, CompareEditorModel, null);
        // state.use derives labels/content
        return <Panel>...</Panel>;
    }

After:

    export class CompareEditor extends VanillaView<CompareEditorProps> {
        public constructor(props: CompareEditorProps) {
            super(props, createPanelElement({
                name: "compare-root",
                direction: "column",
                flex: true,
                overflow: "hidden",
            }));
        }

        protected onMount(): void {
            // Mount children, bind both TextFileModel states, create the diff widget,
            // and wire modified-content write-back.
        }
    }

Translate the existing UIKit tree with direct vanilla APIs and no React icon:

- createPanelElement for the root and the two flexible label panels;
- createTextElement for each light, truncated label and the arrow separator.
  TextStyleProps has no dir property, so after creating each label span set
  element.dir = "rtl" and element.title = label directly on the returned
  element. dir is a standard HTML attribute; do not add it to TextStyleProps.
  Keeping dir=rtl with text-overflow: ellipsis preserves the deliberate
  left-side ellipsis so a deep path keeps its filename visible;
- createToolbarElement from Toolbar/toolbar-style.ts for the static toolbar;
  do not hand-roll its semantic attributes and do not use ToolbarView;
- IconButtonView with name compare-exit, size sm, title Exit Compare Mode,
  icon name compare, and the existing pagesModel.exitCompareMode(leftPageId);
- MonacoDiffEditorHostView for the editor area.

The label construction is explicit rather than a prop approximation:

    const labelElement = createTextElement(label, {
        truncate: true,
        color: "light",
    });
    labelElement.dir = "rtl";
    labelElement.title = label;

Apply this to both file-path labels. Do not extend TextStyleProps with dir;
setting the standard HTML attribute on the returned span is the intended
idiom and is what preserves left-side path ellipsis.

Import styles directly/co-locally: Panel/panel-style, Text/text-style, the
toolbar static CSS, and the view-owned button CSS through IconButtonView's
normal contract. Do not use uikit barrels, Emotion, hardcoded colors, or inline
layout styles.

The old CompareEditorModel is not retained as a TComponentModel. It has no state,
effects, or reusable behavior beyond the diff widget reference and one
subscription, and its only reason to exist was useComponentModel. Fold those
fields/methods into the vanilla view/host ownership boundary, keeping the
subscription callback semantically identical:

    const newValue = modifiedEditor.getValue();
    groupedModel.changeContent(newValue, true);

The view must not dispose model or groupedModel; it disposes only temporary
Monaco models through the host. Store explicit fields for currently bound model
and grouped model. On mount, bind both state projections so labels, values, and
language stay current. On content updates, compare the Monaco model value before
writing to avoid feedback loops. On language updates, call
monaco.editor.setModelLanguage for both models. If a future caller changes host
identity, unsubscribe/rebind and replace models explicitly; do not read this.props
as the previous value in onUpdate.

Use explicit child mounting:

    this.diffHost = this.child(new MonacoDiffEditorHostView(hostProps));
    this.root.append(this.diffHost.root);
    this.diffHost.mount();
    this.exitButton.mount();

Cleanup must be idempotent and ordered: dispose every owned subscription first;
then have the diff host set its model to null and dispose the widget; then
dispose host-owned Monaco models in the required macrotask. Never dispose the
borrowed TextFileModel-backed models. Retiring code separately removes
view.root.

### 5. Replace the compare React root in PageContentView

Modify only the compare-hosting portion of src/renderer/ui/app/PageContentView.ts.
Do not restructure page, secondary, or normal editor synchronization.

Before:

    import React from "react";
    import { CompareEditor } from "../../editors/compare";
    import { mountReactHandle, type MountedReactRoot } from "../../uikit/shared/mount";

    private compareHost: HTMLDivElement | undefined;
    private compareHandle: MountedReactRoot | undefined;

    private updateCompare(model: object, groupedModel: object, leftPageId: string): void {
        if (!this.compareHost) {
            this.compareHost = document.createElement("div");
            this.compareHost.style.display = "contents";
            this.root.append(this.compareHost);
            this.compareHandle = mountReactHandle(
                this.compareHost,
                this.compareElement(model, groupedModel, leftPageId),
            );
        } else this.compareHandle?.render(this.compareElement(model, groupedModel, leftPageId));
    }

After:

    import { CompareEditor } from "../../editors/compare/CompareEditor";
    import type { TextFileModel } from "../../editors/text/TextEditorModel";

    private compareView: CompareEditor | undefined;

    private updateCompare(
        model: TextFileModel,
        groupedModel: TextFileModel,
        leftPageId: string,
    ): void {
        if (!this.compareView) {
            this.compareView = this.child(new CompareEditor({ model, groupedModel, leftPageId }));
            this.root.append(this.compareView.root);
            this.compareView.mount();
        } else {
            this.compareView.update({ model, groupedModel, leftPageId });
        }
    }

Delete React, mountReactHandle, MountedReactRoot, compareHost, compareHandle,
and compareElement. Keep clearCompare generation guarded:

    private clearCompare(): void {
        const view = this.compareView;
        if (!view) return;
        this.compareView = undefined;
        const generation = ++this.generation;
        view.root.remove();
        queueMicrotask(() => {
            if (this.generation === generation) view.dispose();
        });
    }

This preserves immediate DOM removal, captured-resource disposal, the generation
guard, and microtask timing. The parent owns the view through child(); explicit
captured disposal is safe because VanillaView.dispose() is idempotent. Root
removal remains mandatory because VanillaView.dispose() does not detach it.
Mounting remains explicit because child() does not mount.

This removes the PageContentView React root created by mountReactHandle, which is
the task's verifiable Rule 4 contribution. Compare view and page parent must have
no React import or JSX after conversion.

### 6. Preserve the compare barrel and audit scope

Modify src/renderer/editors/compare/index.ts only as needed for the renamed
extension/export. Preserve the public names:

    export { CompareEditor } from "./CompareEditor";
    export type { CompareEditorProps } from "./CompareEditor";

The top-level src/renderer/editors/index.ts re-export needs no change. The only
runtime importer is PageContentView, which should use the direct view import; the
barrel remains a compatibility export.

### Files that need NO changes

- all 11 later Monaco component importers listed above;
- src/renderer/editors/register-editors.ts — compare is not registered;
- src/renderer/editors/base/editorRegistry.ts, src/renderer/editors/types.ts,
  and src/renderer/ui/app/AsyncEditorView.ts — this task does not use the
  registration seam;
- src/renderer/editors/file-diff/FileDiffBody.tsx and
  src/renderer/editors/file-diff/FileDiffBodyModel.ts — disposal precedent only;
- src/renderer/uikit/shared/vanilla-view.ts and
  src/renderer/uikit/shared/mount.tsx — lifecycle contracts are inputs;
- src/renderer/uikit/Toolbar/Toolbar.css — the existing stylesheet is consumed
  by the new factory; its selectors do not change;
- src/renderer/api/app.ts, src/preload.ts, vite.renderer.config.ts,
  package.json, and package-lock.json — bootstrap, workers, plugin, and
  dependencies stay unchanged;
- all editor chrome files, src/renderer/editors/base/EditorError.tsx, and
  src/renderer/editors/index.ts;
- doc/active-work.md and doc/epics/EPIC-059.md.

## Concerns

- The installed wrapper's public components still import @monaco-editor/loader
  internally. Application source has only one direct loader import/configuration,
  and E1-4 explicitly requires removing it, but the 11 residual wrapper call
  sites are later tasks. Do not expand this task to convert them or add a
  controlled shim; if runtime verification exposes a residual-wrapper loading
  issue, record it as a follow-up migration issue.
- Monaco model disposal is highest risk. The installed 0.55.1
  diffEditorWidget.js still defers previous diff-model reference disposal and
  guards model disposal with onWillDispose listeners. Keep a single owner, an
  explicit disposed guard, the subscription -> setModel(null)/widget dispose
  -> macrotask-owned-model sequence, and never dispose borrowed models.
- VanillaView.update has replaced this.props before onUpdate runs. Compare model
  identity and prior left-page identity in explicit fields.
- The generation guard is not ornamental. A stale queued cleanup must not dispose
  a newer resource, while every captured old view must eventually be disposed.
- The toolbar factory must be the one source of style/semantic attributes for
  both the static compare toolbar and ToolbarView. data-roving-host belongs
  only to ToolbarView; compare has one focusable exit button and no roving
  manager.
- No unit tests may be added. Use source inspection, repository checks, and manual
  compare lifecycle checks.

## Acceptance Criteria

- MonacoDiffEditorHostView.ts contains direct ownership of
  monaco.editor.createDiffEditor and imports neither React nor
  @monaco-editor/react.
- The host is under editors/shared, and no uikit file imports monaco-editor;
  Toolbar/toolbar-style.ts is the only UIKit addition and is style/semantics
  only.
- The host exposes widgets for imperative commands, supports explicit model
  ownership/attachment, preserves automaticLayout, and has no controlled
  value/onChange reconciliation.
- CompareEditor is a VanillaView with no JSX, React import, useComponentModel, or
  DiffEditor import.
- Compare retains both labels, separator, exit action, editable side-by-side
  diff, and exact groupedModel.changeContent(newValue, true) write-back. Both
  label spans retain dir="rtl" and title equal to the full label, and their
  CSS text-overflow ellipsis remains left-side ellipsis.
- The compare toolbar is created by createToolbarElement, has no
  data-roving-host, and has exactly one focusable control (the exit button),
  so no roving tabindex manager is required.
- The two TextFileModel hosts remain page-owned and are not disposed by compare;
  only temporary Monaco models are disposed by their single owner.
- The modified-content IDisposable is disposed first; the diff widget is then
  reset with setModel(null) and disposed; host-owned Monaco models are disposed
  once in the retained macrotask defer. Borrowed models are never disposed and
  repeated host dispose is a no-op.
- PageContentView constructs, appends, and explicitly mounts one owned compare
  view; clearCompare removes its root and retains generation-guarded microtask
  disposal. compareElement, mountReactHandle, and compare React-root fields are
  gone.
- A source search shows the compare path no longer calls createRoot or
  mountReactHandle; this is the one-React-root Rule 4 contribution.
- compare/index.ts still re-exports CompareEditor and CompareEditorProps, and
  the top-level editor barrel is unchanged.
- configure-monaco.ts has no React-wrapper import or loader.config call; all five
  language files take their Monaco type from monaco-editor and registration is
  unchanged.
- configure-monaco.ts exports MONACO_THEME_NAME, the direct host uses that
  constant, and themeState continues to reapply it. The other eight hardcoded
  theme call sites are unchanged. Worker setup and vite-plugin-monaco-editor-esm
  output are unchanged.
- All 11 later importers remain documented with exact file/line and
  Editor/DiffEditor classification; no shim is added for them.
- No unit tests or unrelated dashboard/epic files are changed. Applicable
  typecheck/lint/build checks pass, and manual compare entry, editing, write-back,
  exit, re-entry, and page-disposal checks show no stale widget/model/listener or
  DOM-root leak.

## Files Changed

| File | Change |
|---|---|
| src/renderer/editors/shared/MonacoDiffEditorHostView.ts | New vanilla DiffEditor host with imperative widget/model ownership and disposal. The plain editor host is withheld until a later task has a real consumer. |
| src/renderer/editors/shared/MonacoDiffEditorHostView.css | New co-located static full-size Monaco host layout rules using theme variables/tokens. |
| src/renderer/uikit/Toolbar/toolbar-style.ts | New shared toolbar element factory for style and semantics; it does not claim roving-tabindex ownership. |
| src/renderer/uikit/Toolbar/ToolbarView.tsx | Route applyProps through the shared toolbar attribute contract while retaining dynamic roving-host and React-slot behavior. |
| src/renderer/api/setup/configure-monaco.ts | Remove wrapper loader import/configuration, export MONACO_THEME_NAME, and preserve direct Monaco setup and theme subscription. |
| src/renderer/api/setup/monaco-languages/reg.ts | Repoint Monaco type to monaco-editor. |
| src/renderer/api/setup/monaco-languages/csv.ts | Repoint Monaco type to monaco-editor. |
| src/renderer/api/setup/monaco-languages/mermaid.ts | Repoint Monaco type to monaco-editor. |
| src/renderer/api/setup/monaco-languages/jsonl.ts | Repoint Monaco type to monaco-editor. |
| src/renderer/api/setup/monaco-languages/log.ts | Repoint Monaco type to monaco-editor. |
| src/renderer/editors/compare/CompareEditor.tsx → src/renderer/editors/compare/CompareEditor.ts | Replace React function/model island with vanilla CompareEditor view and direct UIKit/Monaco composition. |
| src/renderer/editors/compare/index.ts | Preserve CompareEditor and CompareEditorProps exports after extension change. |
| src/renderer/ui/app/PageContentView.ts | Replace compare React root with explicitly mounted owned child view and preserve guarded retirement. |
