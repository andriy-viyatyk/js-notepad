# US-1168 — Convert the file-diff editor body to native views

## Goal

Convert the file-diff body, revision pickers, and toolbar composition from React elements to native
VanillaView instances. Retain diff resolution, editable Unstaged behavior, revision selection,
Git Tree history, language propagation, empty state, and host lifecycle; then delete the two editor
TSX files and retire src/renderer/components/git-tree/GitTree.tsx.

This is the third implementation task in [EPIC-073](../../epics/EPIC-073.md), covering E15-1 and
concerns C1, C1a, C9a, C12, C13, C14, and C18. The reviewed
[US-1166 env-vars task](../US-1166-env-vars-native/README.md) is the reference for driver
ownership, native slot composition, dependency gates, explicit branch teardown, and
visible-editor verification.

## Background

### Verified scope and current shape

| File | Current role | Planned disposition |
|---|---|---|
| src/renderer/editors/file-diff/FileDiffBody.tsx | 89-line React body; body model hook, optional host projections, two effects, and empty/diff branch | Delete after FileDiffBodyView.ts is wired |
| src/renderer/editors/file-diff/RevisionPicker.tsx | 116-line React picker; open state, synthetic rows, anchor ref, Popover, and Git Tree renderer | Delete after RevisionPickerView.ts is wired |
| src/renderer/editors/file-diff/FileDiffBodyModel.ts | TComponentModel resolving fromText/toText and write-back; zero effect() calls | Keep and drive directly with createComponentModelDriver |
| src/renderer/editors/file-diff/FileDiffEditor.ts | Editor model, revision state, shared fileTree, host adoption, persistence, and defaults | No change expected; confirm |
| src/renderer/editors/file-diff/index.ts | React toolbar/body composition inside TextChromeView | Replace with native body, toolbar, and chrome composition |
| src/renderer/editors/file-diff/GitDiffRevisionsSecondaryView.ts | Already native; directly constructs GitTreeView | Preserve behavior; repoint its type-only imports |
| src/renderer/components/git-tree/GitTree.tsx | React mountVanilla face; only runtime renderer is the deleted RevisionPicker | Delete after public types are relocated |

FileDiffEditor.fileTree is one editor-owned GitTreeModel shared by both revision popovers and the
File History secondary view. The editor owns and disposes that model. A picker owns only its own
GitTreeView/grid and must never dispose the shared model; this is the C1a ownership boundary.

### Native seams and lifecycle facts

- MonacoDiffEditorHostView is the native twin for MonacoDiffEditorHost. The reference is
  src/renderer/editors/compare/CompareEditor.ts:83: claim it with child(), append its root before
  mount, and use its imperative methods. FileDiffBodyModel.onDiffMount() already accepts this
  View type.
- GitTreeView is already native in src/renderer/components/git-tree/GitTreeView.ts. It owns its
  DataGridView and already rejects a changed model identity in onUpdate().
- PopoverView is already a VanillaView with a residual React children arm and a native contentView
  arm. Use contentView, attach the returned content root to the supplied host, and retain a bare
  reference for updates. Do not edit src/renderer/uikit/Popover/PopoverView.tsx; US-1172 owns it.
- Use createPanelElement, createTextElement, and ButtonView. Reuse existing static CSS and theme
  tokens; do not edit any UIKit TSX face.
- SubtreeSwap from src/renderer/uikit/shared/subtree-swap.ts owns one conditional branch and
  explicitly disposes/detaches the outgoing branch on clear() or set().
- createDepsGate() from src/renderer/uikit/shared/deps-gate.ts uses the same comparator as model
  effects and must be primed after initial native mounting.
- FileDiffBodyModel.init() registers subscriptions but zero effect() calls, so the direct driver
  is valid. createComponentModelDriver(...).mount() throws for an effect-bearing model at
  src/renderer/core/state/model.ts:302-308; keep that invariant explicit in implementation.

### Real File Diff route and presence setup

The source-verified human route is:

1. In Explorer, select a repository .git node and use its Open Git Tree action. The action is
   explorer-open-git in src/renderer/editors/explorer/ExplorerSecondaryView.ts:321-330 and opens
   an encoded git-tree link.
2. In the Git Tree editor's Git/Changes panel, click a file in either the Unstaged or Staged
   list. src/renderer/editors/git-tree/GitChangesView.ts:228 calls
   GitTreeEditorModel.openChangeDiff(change, listKind).
3. openChangeDiff() at src/renderer/editors/git-tree/GitTreeEditorModel.ts:427-461 sends the
   file path through openRawLink with target: "file-diff". A Staged click supplies HEAD to Staged
   revisions; an Unstaged click uses the default comparison.
4. src/renderer/editors/register-editors.ts:192-201 registers file-diff as a host-aware editor.
   The general matchers in src/renderer/editors/base/editor-matchers.ts do not select it by
   extension; this is an explicit content-host target.

For the empty state, open a text file outside any Git repository with
app.openRawLink(path, { editor: "file-diff" }). PagesLifecycleModel.openFile() honors this
explicit target for a fresh text host. This repository itself is a Git repository, so use it for
the real-content diff and revision-picker pass, not for the outside-repository empty-state pass.

## Implementation Plan

### 1. Add FileDiffBodyView.ts and delete FileDiffBody.tsx

Create src/renderer/editors/file-diff/FileDiffBodyView.ts as a native body owner. Its public props
are { model: FileDiffEditor }. Construct a createComponentModelDriver with
FileDiffBodyModel/defaultFileDiffBodyState in the constructor, register driver.dispose() once with
own(), and call driver.mount() from onMount().

Use a display-contents root and a dedicated branch host. Create:

- FileDiffEmptyView: a column Panel equivalent to file-diff-empty, with light explanatory Text and
  a ButtonView calling model.page?.switchMainEditor?.("monaco").
- FileDiffContentView: a column/flex/hidden Panel equivalent to file-diff-body, owning one
  MonacoDiffEditorHostView. Preserve initialOriginal, initialModified, language, renderSideBySide,
  automaticLayout, originalEditable: false, and readOnly: to.kind !== "unstaged". Mount the
  host after its root is attached, following CompareEditor. This ordering is required, not merely
  convenient: FileDiffBodyModel.onDiffMount() calls host.getEditor().getModifiedEditor()
  (src/renderer/editors/file-diff/FileDiffBodyModel.ts:111-112), getEditor() returns this.editor
  (src/renderer/editors/shared/MonacoDiffEditorHostView.ts:183-186), and editor is created only in
  MonacoDiffEditorHostView.onMount() by monaco.editor.createDiffEditor(this.root, ...)
  (src/renderer/editors/shared/MonacoDiffEditorHostView.ts:39-40). createDiffEditor also measures
  its container, so the host root must already be attached before mount; otherwise the same 0×0
  collapse hazard recorded by EPIC-072 can occur. Follow the proven env-vars/grid body-first,
  chrome-last composition with both roots appended before either relevant mount.

Use SubtreeSwap<"empty" | "diff"> for the top-level branch. The body owns the swap; do not also
register the branch with child(). On diff-to-empty call swap.clear() explicitly. On a branch-key
change use swap.set(), so the outgoing branch is disposed and detached. If branch mount fails,
clear the swap while preserving the original error.

Body construct mapping:

| Current React construct | Chosen native construct | Why |
|---|---|---|
| FileDiffBody function | FileDiffBodyView extends VanillaView | Owns the driver, subscriptions, branch swap, and child lifecycle. |
| useComponentModel({ model }, FileDiffBodyModel, defaultFileDiffBodyState) | createComponentModelDriver plus driver.mount()/dispose() | The model has zero effect() registrations, so it can be explicitly owned without React. |
| bodyModel.state.use for fromText/toText | One bind() with a compound projection | Applies the existing derived text state immediately and subscribes once. |
| model.state.use for to | bind() to the selected revision | Drives the existing readOnly rule without rebuilding the body. |
| useOptionalState × 3 for gitRepo/language/filePath | One replaceable host projection subscription, checked by the existing central sync and onUpdate() | Supports absent hosts, late appearance, and source replacement while avoiding stacked bind() cleanups or a second model.state subscription. |
| useRef diffHostRef and useCallback handleDiffMount | View fields and stable arrow callback | Native children expose their roots/instances directly and retain the model callback. |
| Two guarded useEffect calls | Two createDepsGate() instances | Preserves each exact dependency array and its early host/file guard. |
| Top-level if (!gitRepo || !filePath) return branch | SubtreeSwap with FileDiffEmptyView/FileDiffContentView | Explicitly disposes and detaches the outgoing branch. |
| Panel | createPanelElement | Preserves the empty and diff layout attributes with existing static CSS. |
| Text | createTextElement | Preserves light explanatory text without a React element. |
| Button | ButtonView | Preserves the switch-to-text action and button semantics. |
| MonacoDiffEditorHost with onMount | MonacoDiffEditorHostView | Uses the existing imperative host and wires FileDiffBodyModel.onDiffMount(). |

Before/after state translation:

~~~ts
// Before: FileDiffBody.tsx
const bodyModel = useComponentModel({ model }, FileDiffBodyModel, defaultFileDiffBodyState);
const { fromText, toText } = bodyModel.state.use((s) => ({
    fromText: s.fromText,
    toText: s.toText,
}));
const to = model.state.use((s) => s.to);
~~~

~~~ts
// After: FileDiffBodyView.ts
this.driver = createComponentModelDriver(
    { model: props.model }, FileDiffBodyModel, defaultFileDiffBodyState,
);
this.bind(this.driver.model.state, (state) => ({
    fromText: state.fromText,
    toText: state.toText,
}), this.syncBodyProjection);
this.bind(this.model.state, (state) => state.to, this.syncRevision);
~~~

Install both binds once from onMount. bind() applies immediately and registers its unsubscribe
through VanillaView.own(); never call it from a repeated sync method. Call bodyModel.onDiffMount()
from the native diff branch after MonacoDiffEditorHostView.mount() so modified-side edits still
write through only for to.kind === "unstaged".

### 2. Resolve optional host state, exact gates, and teardown

The three useOptionalState calls become one replaceable host projection subscription:

~~~ts
type HostProjection = Pick<TextFileEditorModelState, "gitRepo" | "language" | "filePath">;

const selectHostProjection = (state: TextFileEditorModelState): HostProjection => ({
    gitRepo: state.gitRepo,
    language: state.language,
    filePath: state.filePath,
});
~~~

Do not call bind() three times against model.host?.state or call bind() again when the host
changes. bind() has no early-release API because cleanup is registered through own(); repeated
calls would retain stale subscriptions.

Track boundHost, hostUnsubscribe, and current HostProjection fields. Compare model.host with
boundHost inside the existing central body sync, which is already driven by the body-model and
revision binds. Re-check model.host at the top of FileDiffBodyView.onUpdate() before pushing props
to the existing branch/children. This direct comparison does not depend on a model-state update
notifying; it also avoids adding a second subscription to model.state for the same purpose.

- With no host, set gitRepo, language, and filePath to undefined, render the empty branch, and
  wait. This preserves all three former hook defaults.
- When a host appears, the next central sync or onUpdate() check releases the previous host
  subscription, sets boundHost, immediately reads host.state.get() through selectHostProjection,
  and subscribes once to the new host state. The diff branch can therefore appear without
  rebuilding the outer body.
- When a host is replaced, release only the old subscription. Never dispose the host or its model;
  FileDiffEditor owns that lifecycle.

Install one active host-state subscription and clean it once with
this.own(() => hostUnsubscribe?.()); invoke the old host disposer before replacing it. The existing
body-model and revision bind() subscriptions remain the only model-state subscriptions; there is
no dedicated model.state detector. The host state is typed as IState, though its concrete runtime
is TOneState<TextFileEditorModelState>; use the public get/subscribe contract.

Normal restore/adoption completes before the visible editor view mounts. If a host is absent at
mount and appears later, the direct comparison in the central sync and the top-of-onUpdate check
adopts it on the next existing native update pass, without relying on configureForRepo() producing
a notifying state difference. The body model's existing lifecycle is retained; the late-host
metadata branch is the native replacement for the old optional hooks.

Keep two independent gates and call each once from the central body sync:

| Former effect | Exact gate values | Native consequence |
|---|---|---|
| setDiffValues effect with deps [filePath, fromText, gitRepo, toText] | [filePath, fromText, gitRepo, toText] | If changed and gitRepo/filePath are truthy, call active MonacoDiffEditorHostView.setDiffValues(fromText, toText); otherwise record the change and return |
| setLanguage effect with deps [filePath, gitRepo, language] | [filePath, gitRepo, language] | If changed and gitRepo/filePath are truthy, call setLanguage(language) |

Prime both gates after the initial branch is mounted and initial values/language are supplied.
The readOnly binding updates host options from to.kind; the exact rule is to.kind !== "unstaged",
with the left side always read-only.

### 3. Add RevisionPickerView.ts and delete RevisionPicker.tsx

Create src/renderer/editors/file-diff/RevisionPickerView.ts with a display-contents span root
created by a local createContentsRoot() helper. The helper follows the existing
src/renderer/editors/env-vars/index.ts and src/renderer/editors/notebook/index.ts idiom: create a
span, set style.display = "contents", and pass it to super(). It replaces the React fragment that
held the button and Popover as siblings. The view owns ButtonView and PopoverView with child(); the
shared GitTreeModel is borrowed and is never disposed here.

| Current React construct | Chosen native construct | Why |
|---|---|---|
| RevisionPicker function | RevisionPickerView extends VanillaView | Owns button, Popover, open field, content boundary, and updates |
| useRef anchor / elementRef | ButtonView.root as elementRef | Stable native anchor; no React ref callback |
| useState(false) | Plain open field and updatePopover() | Native click handler updates existing props |
| useMemo leadingRows | makeLeadingRows() method | Small derived array; recompute for side/showStaged |
| useMemo selectedHash | selectedHash() method | Same synthetic sentinel or commit hash |
| useCallback toggle | Stable arrow handler | Toggles, calls picker.ensureLoaded(), updates Popover |
| useCallback pick | Stable pick arrow method | Maps synthetic rows or commits, calls onPick, closes |
| Fragment | Display-contents root | Preserves two sibling outputs without a flex item |
| Button | ButtonView | Preserve name, sm size, ghost variant, label, and click |
| Popover with JSX children | PopoverView with contentView | Uses the existing native seam; do not touch PopoverView.tsx |
| Nested Panel elements | createPanelElement | Preserve 460px width, xs gap/padding, 280px fixed height, and inner flex/height 0 |
| GitTree | GitTreeView | Native DataGrid owner with same picker, rows, selection, and pick callback |

Pass buttonView.root directly as PopoverView.elementRef. The React code reads
anchorRef.current during render, so its first render supplies null and only gets an anchor after a
later render; the native view deliberately improves this by having the stable button root
available at construction. Do not reintroduce the null-first-render behavior in the name of
faithfulness.

The Popover content factory creates a detached RevisionPickerContentView, appends its root to the
supplied host, stores a bare reference, and returns it. PopoverView claims/mounts that content
but does not append or update it. On picker updates, call popover.update() and then update the
bare content reference while open. After close, clear the reference because the floating branch
has disposed the content and the next open creates a fresh one.

RevisionPickerContentView owns GitTreeView with child(), appends its nested panels and tree root
before mounting the tree, and updates it without changing picker model identity. The content view
is owned by the Popover floating branch, not by the picker. FileDiffEditor.dispose() is the only
new disposal path for the shared fileTree.

### 4. Add FileDiffToolbarView.ts

Convert the FileDiffToolbarBits function in index.ts into FileDiffToolbarView. Its root is
createPanelElement({ align: "center", gap: "xs" }); create native Text nodes for From and the
arrow, plus two child RevisionPickerView instances. Replace model.state.use({ from, to, hasStaged })
with one bind installed from onMount; update both pickers from that projection. Throw on a
different FileDiffEditor identity if it reaches onUpdate().

### 5. Relocate Git Tree public types and retire GitTree.tsx

Move GitTreeProps, GitTreeSideSelect, and GitColumnLayout from GitTree.tsx to the native type
surface in src/renderer/components/git-tree/GitTreeView.ts, preserving exact shapes/comments.
The verified type-import list is wider than the runtime-renderer list. GitTreeProps is imported by
GitTreeView.ts, components/git-tree/index.ts, GitTree.story.ts, and
editors/file-diff/GitDiffRevisionsSecondaryView.ts. GitTreeSideSelect is imported by those four
files plus side-select-cell.ts. GitColumnLayout is imported by GitTreeView.ts,
components/git-tree/index.ts, and editors/git-tree/GitTreeEditorModel.ts. Update all of those
edges as follows:

- GitTreeView.ts to use the native declarations;
- side-select-cell.ts to type-import GitTreeSideSelect from GitTreeView.ts;
- GitTree.story.ts to type-import the declarations from GitTreeView.ts;
- GitDiffRevisionsSecondaryView.ts to type-import the declarations from GitTreeView.ts;
- components/git-tree/index.ts to export GitTreeView and the relocated types, without exporting
  the deleted GitTree function.

The barrel continues to expose the same type names, so GitTreeEditorModel.ts needs no import
change, but it must remain type-safe through the relocated barrel export. GitTree.story.ts is a
native story outside this epic's cut and must still render after the face is deleted. Having
GitTreeView.ts own the declarations makes the import direction correct: the native implementation
no longer imports its props from the React face, which is the C12 relocation argument rather than
duplicating or sweeping the type surface. Delete GitTree.tsx only after all imports resolve. This
is C12 type relocation, not a React type-surface sweep. Do not edit slots.ts, fill-slot.ts,
React.* aliases, GitTreeModel.ts, or GitTree.css.

### 6. Replace index.ts composition exactly

Stop importing createElement, EditorErrorBoundary, FileDiffBody, and RevisionPicker from
src/renderer/editors/file-diff/index.ts. Build body, toolbar, and chrome in onMount, append roots
before mounting, mount body first and chrome last, and pass native roots as TextChromeView slots.

Before:

~~~ts
const chrome = new TextChromeView({
    model: props.model,
    children: createElement(EditorErrorBoundary, null, createElement(FileDiffBody, { model })),
    toolbarContributions: createElement(
        EditorErrorBoundary, null, createElement(FileDiffToolbarBits, { model }),
    ),
});
super(props, chrome.root);
this.chrome = this.child(chrome);
~~~

After:

~~~ts
private model!: FileDiffEditor;
private body!: FileDiffBodyView;
private toolbar!: FileDiffToolbarView;
private chrome!: TextChromeView;

public constructor(props: { model: EditorModel }) {
    super(props, createContentsRoot());
}

protected onMount(): void {
    const model = requireFileDiffModel(this.props.model);
    this.model = model;
    const body = this.child(new FileDiffBodyView({ model }));
    const toolbar = this.child(new FileDiffToolbarView({ model }));
    const chrome = this.child(new TextChromeView({
        model: this.props.model,
        children: body.root,
        toolbarContributions: toolbar.root,
    }));
    this.body = body;
    this.toolbar = toolbar;
    this.chrome = chrome;
    this.root.append(body.root, toolbar.root, chrome.root);
    body.mount();
    toolbar.mount();
    chrome.mount();
}

protected onUpdate(props: { model: EditorModel }): void {
    const model = requireFileDiffModel(props.model);
    if (model !== this.model) {
        throw new Error("File Diff view received a different model instance.");
    }
    this.body.update({ model });
    this.toolbar.update({ model });
    this.chrome.update({
        model: props.model,
        children: this.body.root,
        toolbarContributions: this.toolbar.root,
    });
}
~~~

Keep createContentsRoot(), the module factory, and public exports. Appending body and toolbar before
chrome lets fillSlot move the contribution root into its slot; body-first/chrome-last is the
shipped native-editor ordering and preserves final Monaco layout. Do not rebuild children from
onUpdate(). RenderEditorView replaces the async editor when model.id changes, and AsyncEditorView
reuses a native view only for the same constructor/cache key. A different model instance is an
invariant failure; the existing AsyncEditorView catches the throw and shows NativeEditorErrorView.

### 7. Verify without tests

Do not add unit tests or a harness. Run npm run typecheck, npm run lint, and npm run build-prod.
After TSX-to-TS changes, use a cold renderer/dev-server restart if the old dynamic specifier is
cached.

Structural checks:

- find src/renderer/editors/file-diff -name "*.tsx" returns no files, and GitTree.tsx is gone.
- New native files contain no JSX, React runtime imports, React hooks, or EditorError components.
- No UIKit TSX face, PopoverView.tsx, DialogView.tsx, slots.ts, or fill-slot.ts changes exist.
- The visible File Diff page editor has zero data-react-root descendants; do not claim an
  application-wide zero because Storybook and draw/vendor paths remain in E15.

The available instrument can inspect the visible DOM and exercise clickable controls, but, as in
US-1166, it cannot drive av-grid keyboard editing or reliable real typing. Therefore modified-side
Monaco typing/write-back, any picker behavior requiring keyboard typing, and other typing-dependent
checks must be recorded as unverified rather than replaced with structural measurements.

Presence checks, all DOM assertions scoped to the visible page editor:

- Use the real Git Tree → Changes route above; open a changed file and see a side-by-side diff
  with real original/modified content from this repository, which is itself a Git repository.
- Open both picker buttons; the popover opens at the anchor, lists commits and applicable
  synthetic rows, and closes after picking a revision that changes the left side through the
  from-picker. The commit list must measure approximately 280px tall, not the VirtualGrid fallback
  of approximately 100px, and must scroll within that fixed-height region.
- Verify the right side is editable only for Unstaged; Staged, HEAD, and commit selections make
  it read-only, while the left side is always read-only.
- Open a source file with recognizable syntax and confirm host language highlighting is applied to
  both Monaco sides.
- Measure the mounted diff host root with getBoundingClientRect().height and record the pixel
  value. It must be non-zero and approximately the full visible page-editor content height, not a
  collapsed 0px/0×0 container.
- Explicitly open a text file outside Git with app.openRawLink(path, { editor: "file-diff" }) and
  see the native Nothing to compare state and Switch to Text Editor action.
- Switch away/back, reopen a picker, and close the page after a modification to exercise disposal.

## Concerns / Open questions

### Resolved decisions

1. Optional host state uses one replaceable host projection subscription. The existing central body
   sync and the top of onUpdate() compare model.host directly with boundHost, so defaults apply
   while absent and a late host is read/subscribed without a dedicated detector. bind() is not
   repeatedly called because own() has no early-release API.
2. The exact former effect arrays are preserved: [filePath, fromText, gitRepo, toText] and
   [filePath, gitRepo, language]. Both gates record guarded changes and are primed after mount.
3. Popover uses contentView, not children. Its factory attaches the returned root; the floating
   branch owns content disposal. PopoverView.tsx remains untouched.
4. Picker content never disposes the shared GitTreeModel. FileDiffEditor owns fileTree until editor
   disposal; C1a forbids disposing a shared resource received from that owner.
5. Git Tree public types move before the face is deleted. The barrel preserves type exports without
   preserving the React runtime GitTree export.
6. FileDiffEditor.ts and FileDiffBodyModel.ts remain model owners. The latter has zero effects and is
   valid for direct driving; an effect-bearing future model must fail at driver mount.
7. Native errors use AsyncEditorView/NativeEditorErrorView; no EditorErrorBoundary or EditorError
   is recreated.
8. TextChromeView.updateSlots, PopoverView.tsx, DialogView.tsx, slots.ts, and fill-slot.ts are
   explicitly out of scope. Do not tidy their existing cleanup behavior.

### Unverified until implementation

- Picker nested flex geometry and Monaco final layout after body-first/chrome-last mounting.
- Keyboard focus retention while opening/closing a picker, selecting a revision, switching pages,
  and returning to File Diff.
- Modified-side keyboard editing/write-back for Unstaged and read-only enforcement for other
  selections.
- Language highlighting, real commit selection, and the outside-Git empty branch.
- The defensive late-host path is source-planned around direct model.host comparison in existing
  sync/onUpdate passes; a standalone pre-adoption mount harness is unavailable and must remain a
  manual edge check.
- No change to FileDiffEditor.ts was made or needed during investigation; implementation must
  confirm that model behavior remains unchanged.

## Acceptance Criteria

### Native cut and lifecycle

- [ ] The three native view files exist and contain no JSX or React runtime path.
- [ ] FileDiffBodyModel is owned by createComponentModelDriver, mounted natively, and has no
  registered effect().
- [ ] Body bindings are installed once from onMount. An absent host yields defaults; the central
  sync and onUpdate() directly compare model.host with boundHost; a late host is adopted on the
  next existing native update pass; only the old host subscription is released; active-host and
  bind() teardowns are registered once through own(), with no dedicated model-state detector.
- [ ] The two gates use exactly [filePath, fromText, gitRepo, toText] and
  [filePath, gitRepo, language], preserve guards, and are primed after mount.
- [ ] SubtreeSwap owns the empty/diff branch; outgoing branches are explicitly cleared/swapped and
  disposed.
- [ ] MonacoDiffEditorHostView is used, attached before mount, wired through onDiffMount(), and
  preserves to.kind !== "unstaged". The implementation records why onDiffMount must follow
  mount(), and the live pass records a non-zero diff-host height approximately equal to the visible
  page-editor content height rather than a collapsed 0px/0×0 result.
- [ ] RevisionPickerView uses ButtonView, PopoverView.contentView, native Panels, and GitTreeView;
  Popover content is attached to the supplied host and owned by the floating branch. Its commit
  list preserves the width=460 → height=280 → flex=1/height=0 nesting, measures approximately
  280px rather than approximately 100px, and scrolls.
- [ ] FileDiffBody.tsx and RevisionPicker.tsx are deleted; no TSX remains in file-diff.
- [ ] GitTree.tsx is deleted after type relocation; picker code never disposes shared fileTree.
- [ ] GitTree.story.ts still imports the relocated native types and renders its native GitTreeView
  story after GitTree.tsx deletion.

### Exact editor composition

- [ ] index.ts builds body, toolbar, and chrome in onMount; appends before mount; mounts body first
  and chrome last; and passes native roots as TextChromeView slots.
- [ ] onUpdate throws on a different FileDiffEditor instance and updates existing children only.
- [ ] File-diff composition has no createElement, EditorErrorBoundary, or EditorError import; native
  failures use AsyncEditorView/NativeEditorErrorView.

### Presence and visible behavior

- [ ] The real Git Tree → Changes route opens File Diff with a side-by-side diff containing real
  content from this repository, which is itself a Git repository.
- [ ] Both picker popovers open and list commits plus applicable synthetic rows; the commit list
  measures approximately 280px rather than the approximately 100px VirtualGrid fallback and
  scrolls within that fixed-height region. Picking a revision through the from-picker changes the
  left diff side.
- [ ] The right side is editable only for Unstaged and the left side is never editable.
- [ ] Host language is applied to both Monaco sides and visibly affects syntax highlighting.
- [ ] The mounted diff host height is measured and recorded as a non-zero value approximately equal
  to the full visible page-editor content height, not a collapsed 0px/0×0 container.
- [ ] A text file outside Git explicitly opened with editor file-diff shows the native Nothing to
  compare branch and switch action.
- [ ] Switching away/back and closing the page leaves no live picker, Git Tree grid, or Monaco
  subscription; shared fileTree remains editor-owned until editor disposal.
- [ ] The visible File Diff page editor contains zero data-react-root descendants. This is a
  visible-page assertion only; inactive pages remain in the DOM and are excluded.

### Checks and scope guard

- [ ] npm run typecheck, npm run lint, and npm run build-prod pass.
- [ ] No tests, harnesses, fixtures, commits, or dashboard duplication are added.
- [ ] No UIKit TSX face is edited or deleted; specifically Button.tsx, Panel.tsx, PopoverView.tsx,
  and DialogView.tsx remain untouched.
- [ ] React.* type surface, slots.ts, fill-slot.ts, and TextChromeView.updateSlots remain untouched.
- [ ] doc/active-work.md remains unchanged; US-1168 is already listed under EPIC-073.
- [ ] Caught values use errMessage(e, fallback?), path operations use file-path, renderer file
  operations use app.fs, colors use theme/color, and styling is static/co-located.

## Files Changed Summary

| File | Planned status | Scope |
|---|---|---|
| doc/tasks/US-1168-file-diff-native/README.md | Add | This task document only. |
| src/renderer/editors/file-diff/FileDiffBodyView.ts | Add | Native body, driver, host subscriptions, exact gates, Monaco branch, and empty branch. |
| src/renderer/editors/file-diff/RevisionPickerView.ts | Add | Native picker, ButtonView, Popover native content seam, and GitTree content owner. |
| src/renderer/editors/file-diff/FileDiffToolbarView.ts | Add | Native toolbar and revision-state binding. |
| src/renderer/editors/file-diff/index.ts | Modify | Native body-first/chrome-last composition and model identity guard. |
| src/renderer/editors/file-diff/FileDiffBody.tsx | Delete | React body conversion target. |
| src/renderer/editors/file-diff/RevisionPicker.tsx | Delete | React revision-picker conversion target. |
| src/renderer/editors/file-diff/GitDiffRevisionsSecondaryView.ts | Modify | Repoint Git Tree prop type imports; behavior unchanged. |
| src/renderer/components/git-tree/GitTreeView.ts | Modify | Relocate public Git Tree prop types for native consumers. |
| src/renderer/components/git-tree/side-select-cell.ts | Modify | Repoint its type-only GitTreeSideSelect import. |
| src/renderer/components/git-tree/GitTree.story.ts | Modify | Repoint native story type imports. |
| src/renderer/components/git-tree/index.ts | Modify | Export GitTreeView and relocated types; remove React face export. |
| src/renderer/components/git-tree/GitTree.tsx | Delete | Retired React mountVanilla face. |
| src/renderer/editors/file-diff/FileDiffBodyModel.ts | No change expected | Existing zero-effect model and View-typed onDiffMount remain. |
| src/renderer/editors/file-diff/FileDiffEditor.ts | No change | Existing revision, host, persistence, and shared fileTree ownership remain. |
| src/renderer/components/git-tree/GitTreeModel.ts | No change | Shared model ownership remains with its editor. |
| src/renderer/components/git-tree/GitTree.css | No change | Existing static styling is reused. |
| src/renderer/editors/base/editor-matchers.ts | No change | File Diff is explicit host-aware routing, not extension matching. |
| src/renderer/editors/register-editors.ts | No change | Existing registrations are correct. |
| src/renderer/uikit/Popover/PopoverView.tsx | No change | Existing native contentView path is used; US-1172 owns it. |
| src/renderer/uikit/Dialog/DialogView.tsx | No change | Out of scope under C14/US-1172. |
| src/renderer/uikit/** faces, shared/slots.ts, shared/fill-slot.ts | No change | C12/C13 compatibility surfaces remain untouched. |
| src/renderer/editors/base/TextChromeView.ts | No change | Existing slot behavior is reused; updateSlots is not tidied. |
| src/renderer/ui/app/NativeEditorErrorView.ts | No change | Existing AsyncEditorView native error surface remains the owner. |
| doc/active-work.md | No change | US-1168 already listed under EPIC-073; do not duplicate or edit. |
| Tests/harnesses and commits | None | Explicitly forbidden. |

---

## Verification record (2026-08-27)

**Gates:** `npm run typecheck`, `npm run lint`, `npm run build-prod` — all pass.

**Scope:** added `FileDiffBodyView.ts`, `RevisionPickerView.ts`, `FileDiffToolbarView.ts`; changed
`file-diff/index.ts`, `GitDiffRevisionsSecondaryView.ts`, and the git-tree types/barrel/story/
`side-select-cell.ts`; deleted `FileDiffBody.tsx`, `RevisionPicker.tsx`, `GitTree.tsx`.

**Measured:** JSX markers **367 → 354** (exactly file-diff's 13 — 5 + 8, with `GitTree.tsx` at 0),
`editors/` 349 → 336, non-story `.tsx` 47 → 44. `find src/renderer/editors/file-diff
src/renderer/components/git-tree -name "*.tsx"` returns nothing. No `from "react"` in any
`editors/file-diff/*.ts`.

**Live pass, after a cold dev-server restart.** Subject: `src/renderer/editors/env-vars/index.ts`,
a file with uncommitted changes inside this repo, so the diff has real content.

| Check | Result |
|---|---|
| React roots in the visible page editor | **0** |
| React roots app-wide | **1** (`GlobalStyles`) |
| Monaco diff editor present and full height | 1261×935 — **not** collapsed |
| Rendered diff lines | 75 |
| Both revision pickers present, labelled | `from` = `71ef905`, `to` = `Unstaged` |
| "Nothing to compare" branch correctly absent | yes |
| **Revision picker opens** | popover 462×286 at screen 280,71 |
| **The 280px nesting survives** (the finding that nothing else catches) | panel 460×284 → 456×280 → 456×280 → **data-grid 456×280**. Not the 100px `VirtualGridView` fallback. |
| Commit list populated | `2026-08-26 12:06  feat: EPIC-067 — delete the editor chrome contract  71ef905` |
| React roots inside the popover | **0** |

**Two instrument failures on the way, both mine, neither a code defect.** The first picker attempt
reported "popover did not open", which was wrong twice over:

1. **The active page drifted between two scripts**, so the second script queried a different page's
   editor and found no picker button. Fixed by making open-click-measure a **single atomic script**
   — with restored pages settling asynchronously, any gap between scripts is a gap in which the
   visible page can change.
2. **`offsetParent` is `null` for `position: fixed` elements.** The popover is fixed-position, so
   the standard "is it visible" filter this programme has used since EPIC-072 silently excluded it
   while it was on screen at full size. Verified directly: `position: fixed`,
   `offsetParent === null`, `offsetWidth×offsetHeight = 462×286`, `getBoundingClientRect()` at
   280,71.

Rule 2 matters beyond this task: **US-1172 converts `PopoverView` and `DialogView`**, so every
assertion there must use `getBoundingClientRect()` or computed style, never `offsetParent`. Recorded
in EPIC-073 §E15-3.

**Not verified — stated as unverified rather than replaced (C9a):**

- **Picking a revision** and seeing the left side change. The commit rows are av-grid rows and
  selection needs real pointer/keyboard interaction the instrument cannot drive.
- **The readOnly rule** (`to.kind !== "unstaged"` — right side editable only against Unstaged, left
  never), because it needs typing into Monaco.
- **Edit write-back** through `FileDiffBodyModel.onDiffMount`'s `listenToModifiedContent`.
- **The "Nothing to compare" branch** for a file outside a git repository — the branch was verified
  absent in the positive case but never rendered.
- **Late host adoption** — the replaceable host-subscription path. Normal restore completes before
  the view mounts, so the defensive path was not exercised.
- **`GitTree.story.ts`** compiles and lints after the type relocation, but the story was not opened.
