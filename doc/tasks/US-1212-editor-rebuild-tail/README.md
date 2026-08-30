# US-1212 — The editor rebuild tail

## Goal

Remove or gate the genuinely ungated child-set rebuilds in the editor views named by
EPIC-077 §C-4. The implementation must make the update work proportional to the changed
input and must describe an acceptance check that exercises an observable behavior only when
one was verified.

This document is an investigation and implementation plan only. No source implementation is
included in this task-document phase.

## Background

[`EPIC-077`](../../epics/EPIC-077.md) §C-1 statement 1 requires that no view rebuild its whole child set on an ungated
update. An affected site must move behind `KeyedList`, `SubtreeSwap`, a targeted write, or an
explicit signature comparison visible at the call site. EPIC-077 §C-2 warns that its candidate
figures are stale after EPIC-075 and EPIC-076; the findings below are from the current checkout.

The two decisions are made per verified site:

- Use `KeyedList` for a data-driven collection with stable keys; use a signature gate for a
  small structural child set whose rebuild is caused by unrelated state updates.
- Do not claim focus, selection, scroll, editor, or drag loss unless the source and exercise
  path establish that the rebuilt node can carry that state. Where no such symptom is present,
  acceptance is the absence of needless rebuild work and preservation of existing child/view
  identity.

## Verification log

The initial candidate census used these commands:

```text
Get-Content -Raw CLAUDE.md
Get-Content -Raw .claude/rules/task-docs.md
Get-Content doc/epics/EPIC-077.md (targeted §C-1, §C-2 correction 1, and §C-4)
git status --short
rg --files src/renderer/editors/storybook src/renderer/editors/tools-hub src/renderer/editors/mneme-config src/renderer/editors/link-editor src/renderer/editors/mcp-inspector src/renderer/editors/git-tree src/renderer/components/git-tree | rg "(PropertyEditor|LivePreview|SearchBoardsTab|RootsPanel|LinksTilesView|PromptsPanel|GitTreeEditorView)\.ts$"
rg -n -S "replaceChildren|innerHTML|\.map\(|append(?:Child|To)?|onUpdate|update\(" src/renderer/editors/storybook/PropertyEditor.ts src/renderer/editors/storybook/LivePreview.ts
rg -n -S "replaceChildren|innerHTML|\.map\(|append(?:Child|To)?|onUpdate|update\(" src/renderer/editors/tools-hub/SearchBoardsTab.ts src/renderer/editors/mneme-config/RootsPanel.ts
rg -n -S "replaceChildren|innerHTML|\.map\(|append(?:Child|To)?|onUpdate|update\(" src/renderer/editors/link-editor/LinksTilesView.ts src/renderer/editors/mcp-inspector/PromptsPanel.ts
rg -n -S "replaceChildren|innerHTML|\.map\(|append(?:Child|To)?|onUpdate|update\(" src/renderer/editors/git-tree/GitTreeEditorView.ts src/renderer/components/git-tree/GitTreeEditorView.ts
rg -n -C 8 -S "syncSources\(|subscribeCatalog|subscribeInstalled|promptsState|RootsPanelView|GitTreeEditorView|SearchBoardsTabView" src/renderer
rg -n -C 8 -S "state\.update|aheadBehind|fetching|pulling|pushing" src/renderer/components/git-tree/GitBranchesModel.ts src/renderer/editors/git-tree/GitTreeEditorModel.ts
rg -n -C 8 -S "state\.update|loading|commits|refresh\(" src/renderer/components/git-tree/GitTreeModel.ts
rg -n -C 6 -S "promptsState\.update|setPromptArg|selectPrompt|getPrompt" src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts
rg -n -C 6 -S "showToolsHubPage|showMnemeConfigPage|showMcpInspectorPage|showStorybookPage" src/renderer/api/pages src/renderer/editors
rg -n -C 5 -S "item\.target === \"git-tree\"|Open Git Tree|target: \"git-tree\"" src/renderer/content/tree-providers/FileTreeProvider.ts src/renderer/editors/explorer/ExplorerSecondaryView.ts
git status --short -- src/renderer/editors/link-editor/LinksTilesView.ts src/renderer/editors/link-editor/LinksListView.ts
```

The file-list command confirmed that the epic's `components/git-tree/GitTreeEditorView.ts`
citation does not exist and that the editor is
`src/renderer/editors/git-tree/GitTreeEditorView.ts`.

### Candidate: `PropertyEditor.ts` — dropped

Verified source: `src/renderer/editors/storybook/PropertyEditor.ts`.

`PropertyEditorView.sync` at lines 167–185 is subscribed to the complete Storybook state at
line 158. Its `rebuild` call at line 176 is already gated by the selected story identity and
visible-property shape: lines 171–175 compare `story?.id`, empty-state presence, and the
transition to zero visible properties. Ordinary property-value changes take the `else` branch
and update each existing row at lines 179–184. `rebuild` does call `this.root.replaceChildren()`
at line 199, but that call is not reached for an ordinary ungated state update.

The row option buttons are also updated in place by `PropertyRowView.onUpdate` at lines 81–97;
their `.map()` at lines 60–63 runs only during row construction. No US-1212 change is planned.

### Candidate: `LivePreview.ts` — dropped

Verified source: `src/renderer/editors/storybook/LivePreview.ts`.

`LivePreviewView` subscribes to selected story, prop values, and preview background at lines
55–60. The content replacement at `clearActiveContent` line 181 is reached only through the
state/arm transitions in `sync`: the no-story and no-view paths are suppressed when the same
error arm is already active by line 90/`replaceWithMessage` line 141, and vanilla content is
replaced only when `this.storyId !== story.id || this.arm !== nextArm` at lines 101–112.
Normal prop changes call the existing child view's `update` at lines 115–121. The error path
also enters the error arm, so a repeated state notification is suppressed by line 90. This is
an explicit existing gate, not the ungated rebuild required by statement 1. No US-1212 change
is planned.

### Candidate: `RootsPanel.ts` — dropped as a root-set site; one loading rewrite remains

Verified source: `src/renderer/editors/mneme-config/RootsPanel.ts`.

The root collection is already a `KeyedList` at lines 69–75. `RootsPanelView.onUpdate` line 79
calls `sync`, and line 97 passes the current roots to `rows.update`; row identity is keyed by
`root.name`, with per-row updates at lines 100–110. The root set therefore does not meet the
ungated-rebuild definition.

There is a smaller nested site that does meet it: `FiltersEditorView.sync` line 286 calls
`content.replaceChildren(loading)` whenever `props.config` is absent. The filter view receives
updates through `RootRowView.sync` line 221 while the configuration is being fetched, and the
outer Mneme state can update for unrelated progress/status changes. The child set is one
loading node, so `KeyedList` would be over-engineering; plan a visible configuration/loading
signature gate (for example, only replace when the loading state changes) at the call site.
This site is retained for implementation planning; the root-set portion of the candidate is
dropped.

## Findings by verified surviving site

### `src/renderer/editors/tools-hub/SearchBoardsTab.ts`

**Survives verification.** The exact outer rebuild is `renderCards()` line 204:
`content.replaceChildren()`. `syncSources()` lines 154–163 reaches it after rebuilding the
catalog, installed-entry list, and update map. It is triggered once during mount at line 101,
again when the initial catalog/install `Promise.all` resolves at lines 102–104, on every
published-catalog notification at lines 95–97, on every installed-registry notification at
lines 98–100, and on every search-input change through `setQuery()` lines 136–139. The two
subscriptions are selector-backed in their source models, so catalog/installed callbacks fire
when those arrays change; typing fires once per input change.

The outer cost is O(number of filtered boards + number of visible groups): all group panels and
their headings are recreated, while the `cards` map at lines 55 and 198–231 reuses existing
`BoardCardView` instances and moves their roots back into the new panels. The nested exact
rebuild is `BoardCardView.sync()` line 280 (`details.replaceChildren()`), reached by
`BoardCardView.onUpdate()` lines 266–269 for every reused visible card. It reconstructs the
header, optional installed/update tag, description, file-mask tags, compatibility message, and
action buttons; it also releases and remounts the conditional child views at lines 279 and
361–363. This is O(card detail children) per visible card on each source/query update.

Both sites are genuinely ungated for statement 1. The map at line 157 only builds the update
lookup; it does not gate `renderCards()`. The `cards` map preserves view objects but does not
prevent the DOM group set from being replaced, and `BoardCardView.sync()` has no previous-input
comparison before line 280.

The outer collection is data-driven and keyed by stable `PublishedBoardInfo.id`, so use
`KeyedList` rather than a signature gate: retain keyed group/card nodes and reconcile additions,
removals, filtering, and ordering. Keep `BoardCardView` as the per-card view, but add an explicit
structural signature gate in its small `details` subtree. The signature must cover every value
that changes the detail shape/content: board `id`, `name`, `version`, `archive.size`, optional
`description`, optional `fileMasks` contents, optional `minAppVersion`, and the installed
entry's `id`, `root`, and `version`, plus the matching update's `latestVersion`. Build the
signature immediately before `details.replaceChildren()` by explicitly destructuring those
fields into a typed render snapshot; compare every snapshot field (including `fileMasks`
element-by-element), without `JSON.stringify` of a hand-picked subset. The destructure is the
complete render contract, so any new value read by `rebuildDetails` makes the adjacent signature
site visibly incomplete during review. When unchanged, keep the existing detail children and
callback-bearing controls. This separates the large list decision (`KeyedList`) from the small
conditional card decision (signature gate).

Failure mode: if the card signature omits a manifest or installed/update field, the card's
details, compatibility label, install/update state, or Properties callback can remain stale when
that value changes.

The card controls are ordinary buttons, so a source/install notification can destroy focus if a
user has focused one while `details` is rebuilt; that consequence has not been manually verified
in the running app. There is no inline editor or drag state in the card. The scroll owner is the
parent `content`, so the source does not establish scroll loss. Do not claim a verified symptom.
Acceptance should instead verify that visible card roots remain the same keyed views across a
catalog/install notification, that a focused unchanged action remains attached, and that
unchanged card signatures do not replace their detail subtree while filtering and install/update
labels still change correctly.

Concrete exercise: run the app, open **Tools & Editors** as a page (or use
`app.pages.showToolsHubPage({ tab: "search" })` in the app's script/MCP surface), select
**Search boards**, type successive terms in **Search boards**, clear the term, and click the
refresh icon. If a board is installed or updated in another board flow while this tab remains
open, return to the tab and verify the matching card changes without the other visible card roots
being recreated. The refresh and catalog load exercise `syncSources`; typing exercises its
manual query arm.

Before:

```ts
content.replaceChildren();
for (const group of GROUP_ORDER) {
    const groupPanel = createPanelElement(...);
    // create/update every visible card
    content.append(groupPanel);
}
```

After (shape):

```ts
// A keyed group/card reconciliation owns the visible collection.
this.groups.update(this.groupItems(filtered));

// Inside BoardCardView.onUpdate:
const {
    id, name, version, description, fileMasks, minAppVersion,
    archive: { size },
} = props.board;
const installed = props.installed.find((entry) => entry.id === id);
const update = installed ? props.updates.get(fpNormalizeForCompare(installed.root)) : undefined;
const nextDetailsSignature = {
    id, name, version, size, description: description ?? null,
    fileMasks: fileMasks ? [...fileMasks] : null,
    minAppVersion: minAppVersion ?? null,
    installedId: installed?.id ?? null,
    installedRoot: installed?.root ?? null,
    installedVersion: installed?.version ?? null,
    updateVersion: update?.latestVersion ?? null,
};
if (sameBoardDetails(this.previousDetailsSignature, nextDetailsSignature)) return;
this.previousDetailsSignature = nextDetailsSignature;
this.clearConditionalChildren();
details.replaceChildren();
this.rebuildDetails(props);
```

### `src/renderer/editors/mneme-config/RootsPanel.ts` — nested filter loading branch

**Survives verification only for this nested site.** The root collection itself is already
incremental: `RootsPanelView.onMount()` constructs `KeyedList` at lines 69–75, and
`RootsPanelView.sync()` passes roots to `rows.update()` at line 97, keyed by `root.name` with
per-row updates at lines 100–110. That part is dropped from the plan.

The exact surviving rebuild is `FiltersEditorView.sync()` line 286:
`content.replaceChildren(loading)` when `props.config` is absent. An expanded `RootRowView` calls
`filtersView.update(...)` at line 221 on each root-row update; the outer Mneme state is refreshed
by `MnemeConfigEditorModel.refreshStatus()` (status at lines 215–218 and the polling path at
lines 246–264), and progress writes also update state. While the lazily requested root config is
still absent, those updates can reach the same loading branch repeatedly. The cost is small but
unnecessary: it detaches and reattaches one existing loading span, without rebuilding the full
filter controls.

This is genuinely ungated at the current call site: the only condition is `!props.config`; no
previous loading/config signature or `content.firstChild === loading` comparison exists. Use a
signature gate, not `KeyedList`: this is a one-child structural loading state, not a collection.
The gate must leave the loading node in place on repeated absent-config updates, dispose/create
controls only on the absent/present transition, and allow a newly available config to enter the
existing `createControls()` path.

No observable focus, selection, inline editor, or drag state is present in the loading branch —
the filter inputs do not exist until config is available. Acceptance is therefore that repeated
status/progress updates while config is pending do not replace the loading node, and that the
loading-to-controls transition still creates usable include/ignore inputs and keyed tag lists.

Failure mode: without the loading-node gate, repeated absent-config updates detach and reinsert
the loading node; without the transition handling, a stale loading node can remain when controls
become available.

Concrete exercise: run Mneme, open **Mneme** from Settings/the Mneme status entry (or use
`app.pages.showMnemeConfigPage()`), connect it, expand a configured root's **Filters** control,
and observe the loading state while the root config request is pending. Start/reindex the root
to generate status/progress updates, then verify the controls appear once and remain usable;
also collapse and re-expand Filters to exercise the intentional teardown/recreation transition.

Before:

```ts
if (!props.config) {
    if (this.hasControls()) this.disposeControls();
    content.replaceChildren(loading);
    return;
}
```

After (shape):

```ts
if (!props.config) {
    if (this.hasControls()) this.disposeControls();
    if (content.firstChild !== loading) content.replaceChildren(loading);
    return;
}
```

### `src/renderer/editors/link-editor/LinksTilesView.ts` — dropped from US-1212

**Dropped after current-source verification.** `onUpdate()` lines 176–184 compares the incoming
links array identity with `subscribedLinks` and the view mode with `previousViewMode` before
calling `rebuildAsyncRows()` at line 179. That method rebuilds hostname/image lookup maps and
async subscriptions, not the whole child set. The virtual grid's cells are pooled and admitted
through `renderCell`/`admitCell` lines 97–109 and 377–422; their writes are targeted to stable
hosts. The `replaceChildren` calls at lines 463, 472, 474, 481, and 535–539 replace only an
individual image/icon/action host inside a pooled cell, not the view's whole child set.

The unconditional `this.grid.model.update({ all: true })` at line 182 is a real current issue,
but it is the `{ all: true }` concern assigned to US-1213. The resize-side `{ all: true }` at
line 129 is already behind `widthChanged || columnsChanged`. Do not change either line in
US-1212. The companion `LinksListView.ts` is currently modified by US-1208; its listener-handle
work is unrelated to this task. The current working-tree status shows `LinksTilesView.ts` clean
and `LinksListView.ts` modified, so this task records the current `LinksTilesView` implementation
and keeps any future US-1213 edit to line 182 separate.

No US-1212 whole-child-set rebuild symptom was verified here. The existing tile implementation
deliberately preserves pooled cell records, action buttons, and drag handlers; its behavior to
exercise for this task is the boundary: switch link view modes and filter/update links, then
leave the line-182 repaint fix for US-1213.

At the caller, `CategoryViewImpl.reconcileItems()` only calls the editor's `renderItems` when its
projection changes (lines 275–313), and `CategoryEditor.renderItems()` updates the retained
`LinksTilesView` at lines 396–407. Those changes come from filtered items, selection/drop state,
search, provider/render callback identity, or view-mode changes; the tile view's own identity
gate then limits async-row rebuilding to a new links array or mode. This is why the line-182
repaint is a separate concern from the child-set question here.

### `src/renderer/editors/mcp-inspector/PromptsPanel.ts` — message content block

**Survives verification for one nested site.** The panel's main prompt list is already a
`KeyedList` keyed by `prompt.name` at lines 46–66, and the selected-detail subtree is already a
`SubtreeSwap` at lines 79–108 with an explicit `detailViewKey` comparison at lines 94–100. Those
sites are dropped from this task.

The exact ungated rebuild is `MessageContentBlockView.onUpdate()` line 335:
`this.root.replaceChildren(); this.renderBlock(props.block);`. `MessageView.onUpdate()` lines
322–325 reaches it through its `KeyedList` for every content block. `PromptsPanelView.sync()` is
bound to the full `promptsState` at line 85. The model updates that state when prompts are
loaded at lines 680–686, when a prompt is selected at lines 694–702, on every prompt-argument
change at lines 706–710, when Get Prompt starts at line 728, and when its result/error completes
at lines 745–757. Once messages exist, typing any argument or changing loading/error state can
therefore walk every existing message/block and replace unchanged block content.

The cost is O(number of message blocks) DOM reconstruction, including text nodes, image
elements, resource panels, and resource-link nodes. It is genuinely ungated: `MessageView`'s
keyed list preserves each block root, but `MessageContentBlockView.onUpdate` has no comparison
against the previous block. The block child set is small and structural, so use a signature gate,
not another `KeyedList`. Compute it immediately beside the guarded render with an exhaustive
switch over `McpPromptMessageContent`: `text` destructures and includes `type`/`text`; `image`
includes `type`/`mimeType`/`data`; `resource` includes `type`/`resource.uri`/`resource.text`
(not the unrendered `mimeType` or `blob`); and `resource_link` includes `type`/`name`/`uri`,
because rendering uses `name || uri`. The switch must have no default arm returning a constant;
assigning the post-switch value to `never` makes a newly added variant fail at compile time.
Compare the resulting typed variant snapshot field-by-field, not by serializing a hand-picked
subset. For unchanged content, retain the existing block root children; rebuild only when the
signature changes or the block type changes.

Failure mode: if a variant field is omitted, a changed text, image data/type, resource URI/text,
or resource-link label can leave the previous prompt block content on screen.

The rebuilt message content has no focusable control, inline editor, or drag target, but returned
text can carry a user text selection that replacement would destroy; that selection-loss symptom
has not been manually verified. The source does not establish scroll loss. Acceptance is stable
block-child identity on prompt-argument and loading updates, plus correct replacement when a
returned block actually changes.

`PromptDetailView.sync()` also contains `root.replaceChildren(...)` at line 237 for an undefined
prompt. The current `PromptsPanelView.sync()` path does not send an undefined prompt to that
class: it uses `EmptyPromptView` through `SubtreeSwap` for the `"empty"` key at lines 93–108.
Therefore line 237 is a guarded/unused branch for this update path, not an additional surviving
site.

Concrete exercise: run the app and open **MCP Inspector** with a connected server (for example,
`app.pages.showMcpInspectorPage({ url: "http://127.0.0.1:7865/mcp" })`), then click its Connect
control if needed. Select a prompt with arguments, enter/edit an argument, click **Get Prompt**,
and inspect the returned messages. This exercises the per-keystroke `setPromptArg` path, loading
transition, and returned message/block update. Selecting a different prompt exercises the
intentional `SubtreeSwap`.

Before:

```ts
protected onUpdate(props: MessageBlockProps): void {
    this.root.replaceChildren();
    this.renderBlock(props.block);
}
```

After (shape):

```ts
protected onUpdate(props: MessageBlockProps): void {
    // messageBlockSignature has an exhaustive switch: no default constant is allowed.
    const nextSignature = messageBlockSignature(props.block);
    if (sameMessageBlockSignature(nextSignature, this.blockSignature)) return;
    this.blockSignature = nextSignature;
    this.root.replaceChildren();
    this.renderBlock(props.block);
}

type MessageBlockSignature =
    | { type: "text"; text: string }
    | { type: "image"; mimeType: string; data: string }
    | { type: "resource"; uri: string; text: string | null }
    | { type: "resource_link"; name: string; uri: string };

function messageBlockSignature(block: McpPromptMessageContent): MessageBlockSignature {
    switch (block.type) {
        case "text": { const { type, text } = block; return { type, text }; }
        case "image": { const { type, mimeType, data } = block; return { type, mimeType, data }; }
        case "resource": {
            const { type, resource: { uri, text } } = block;
            return { type, uri, text: text ?? null };
        }
        case "resource_link": { const { type, name, uri } = block; return { type, name, uri }; }
    }
    const exhaustive: never = block;
    throw new Error(`Unhandled message content variant: ${exhaustive}`);
}

// Compare each member of the explicit union, including the discriminant.
function sameMessageBlockSignature(a: MessageBlockSignature, b: MessageBlockSignature | undefined): boolean { /* field-by-field */ }
```

### `src/renderer/editors/git-tree/GitTreeEditorView.ts` — corrected editor path

**Survives verification for two small structural sites.** The epic's corrected path is the
editor folder, not `src/renderer/components/git-tree/`. The exact toolbar rebuild is
`syncToolbarState()` line 252: `aheadBehindGroup.replaceChildren()`. The view receives the
toolbar projection from `this.model.branches.state` at line 179, and `selectToolbarState()`
includes `aheadBehind`, `pushing`, `fetching`, and `pulling` at lines 66–71. Thus a fetch, push,
or pull busy-flag transition (lines 122/128, 144/155, and 166/181 in
`components/git-tree/GitBranchesModel.ts`), an ahead/behind reload (line 195), or a refs reload
(lines 102–113) can reach the method. The outer `onUpdate()` also calls it at line 189. The
rebuild creates zero, one, or two text spans for the ahead/behind counts and toggles the host.

This is genuinely ungated at the rebuild site: the selected projection limits notifications to
the toolbar fields, but `syncToolbarState` does not compare the previous `aheadBehind` values
before replacing its small child set. Use a signature gate, not `KeyedList`: the child set is at
most two structural count spans and its real problem is unrelated busy-state updates.

Compute the count signature immediately before the guarded replacement by explicitly
destructuring `state.aheadBehind` into `ahead` and `behind`, the two values rendered by this
group. Compare that typed two-field snapshot field-by-field; the busy flags remain in
`this.toolbarState` and continue to update the buttons outside the count gate. Failure mode: if
`ahead` or `behind` is omitted, a changed count can leave the visible ahead/behind indicator stale
while busy-state buttons continue to change.

There is a second exact structural rebuild in the same file: `showBodyMessage()` lines 325–330
removes the current body root, creates a new message root, and appends it. It is called by
`syncGitTreeSurface()` lines 232–246 for the Git-unavailable and initial-loading/no-commits
branches. Git-tree state changes from `GitTreeModel.reload()` set loading at
`components/git-tree/GitTreeModel.ts:121`, then settle it and commits at lines 137–142; repeated
refresh/availability notifications can re-enter the same branch. This message body contains one
non-interactive text node, so the cost is small, but the method has no message comparison and
can detach/reinsert the same user-visible loading/unavailable message. Apply the same explicit
message signature gate around the release/rebuild transition; model the two callers as an
explicit `{ kind: "unavailable" | "loading"; text: string }` discriminated payload, destructure
both fields immediately before comparing to the previous payload, and clear it when
`ensureHistoryBody()` takes over. Do not compare only a hand-picked text subset: the branch kind
is part of the body state and both payload variants must be handled explicitly. Failure mode: if
the kind or text is omitted, the UI can keep “Loading history…” when Git becomes unavailable (or
vice versa), or keep an old message after its text changes. Since the current callers invoke
`releaseBody()` before `showBodyMessage()`, move this comparison ahead of that release (or make
the gated method own the release) so an unchanged message root is not removed before the gate.

Neither site contains a focusable editor, inline editor, or drag-in-progress state. The count and
message text can be selected by the user, but selection loss from these updates has not been
manually verified; do not claim it as an observed symptom. Acceptance is that busy-only branch
updates preserve the ahead/behind child nodes, repeated identical loading/unavailable updates
preserve the body root, and genuine count/message changes still update the text. Also verify that
history appears after loading and that the toolbar buttons continue to reflect busy state.

Concrete exercise: open a real repository in Explorer, find its `.git` entry, and click the
trailing **Open Git Tree** action supplied by `FileTreeProvider`/`ExplorerSecondaryView` at
`src/renderer/content/tree-providers/FileTreeProvider.ts:63–77` and
`src/renderer/editors/explorer/ExplorerSecondaryView.ts:319–329`. In the Git Tree page, click
**Refresh** repeatedly, then use the Pull/Fetch/Push controls where available; reload or briefly
open a repository while history is loading to exercise the message branch. The busy transitions
and ahead/behind reload exercise `syncToolbarState`; Git unavailable/loading exercises
`showBodyMessage`.

Before:

```ts
this.toolbarState = state;
this.aheadBehindGroup.replaceChildren();
// append count spans
```

After (shape):

```ts
const { ahead, behind } = state.aheadBehind;
const nextAheadBehindSignature = { ahead, behind };
if (!sameAheadBehindSignature(nextAheadBehindSignature, this.aheadBehindSignature)) {
    this.aheadBehindSignature = nextAheadBehindSignature;
    this.aheadBehindGroup.replaceChildren();
    // replace/append the two count spans
}
```

Body message (shape):

```ts
type BodyMessage =
    | { kind: "unavailable"; text: string }
    | { kind: "loading"; text: string };
type BodyMessageSignature = BodyMessage;

private showBodyMessage(message: BodyMessage): void {
    const { kind, text } = message;
    const nextMessageSignature = bodyMessageSignature({ kind, text });
    if (sameBodyMessage(this.bodyMessageSignature, nextMessageSignature)) return;
    this.bodyMessageSignature = nextMessageSignature;
    // Release the prior live-history body only after this comparison succeeds.
    this.bodyRoot?.remove();
    this.bodyRoot = createPanelElement({ padding: "xl" }, [
        createTextElement(text, { color: "light" }),
    ]);
    this.root.append(this.bodyRoot);
}

function bodyMessageSignature(message: BodyMessage): BodyMessageSignature {
    switch (message.kind) {
        case "unavailable": { const { kind, text } = message; return { kind, text }; }
        case "loading": { const { kind, text } = message; return { kind, text }; }
    }
    const exhaustive: never = message;
    throw new Error(`Unhandled body message kind: ${exhaustive}`);
}
```

## Implementation Plan

- [ ] In `src/renderer/editors/tools-hub/SearchBoardsTab.ts`, replace the outer
  `renderCards()` clear-and-rebuild with a stable keyed group/card reconciliation using
  `KeyedList` and stable board IDs. Preserve catalog ordering, the three group headings, empty
  states, card ownership, and current filter behavior. Add a visible per-card details signature
  gate in `BoardCardView` before its `details.replaceChildren()`; include every rendered
  structural/value field and keep existing child/button identity when unchanged.
- [ ] In `src/renderer/editors/mneme-config/RootsPanel.ts`, gate
  `FiltersEditorView.sync()`'s absent-config `content.replaceChildren(loading)` by the existing
  loading node (or an equivalent explicit loading signature). Leave the already-correct roots
  `KeyedList` and filter include/ignore `KeyedList`s intact.
- [ ] In `src/renderer/editors/mcp-inspector/PromptsPanel.ts`, add a local message-block
  signature comparison to `MessageContentBlockView.onUpdate()` before rebuilding its children.
  Keep the prompt list `KeyedList`, selected-detail `SubtreeSwap`, and message/block keyed
  ownership unchanged; ensure all discriminated block fields are represented by the signature.
- [ ] In `src/renderer/editors/git-tree/GitTreeEditorView.ts`, gate the ahead/behind group
  rebuild by the count signature while continuing to update toolbar button props for busy-state
  changes. Gate `showBodyMessage()` by its message/branch signature so repeated loading or
  unavailable updates do not remove/reappend the same body; clear that signature when history
  replaces the message body.
- [ ] Exercise each surviving site using the concrete running-app paths recorded above. Verify
  node/view identity and absence of needless replacements rather than asserting an unverified
  focus/scroll symptom.

## Concerns

- The `SearchBoardsTabView` group/card reconciliation must preserve the existing explicit
  `this.cards` ownership and not turn board cards into detached unmanaged nodes. A nested
  `BoardGroupView` in the same file may be the clearest place for a per-group `KeyedList`.
- `BoardCardView`'s details signature must include callback-relevant installed/update state, not
  just the catalog board ID; otherwise install/update actions can become stale while avoiding a
  rebuild.
- The Git message gate must not suppress the transition from a message body back to a live
  `GitTreeView`, and the ahead/behind gate must still update `hidden` when the count signature
  changes from zero to nonzero or back.
- `LinksTilesView.ts` line 182 remains deliberately assigned to US-1213. Any future change in
  that file must keep the `{ all: true }` fix separately reviewable from this task.
- No dashboard entry is to be added: EPIC-077 already lists this task.

## Acceptance Criteria

- [ ] Every surviving site has a visible `KeyedList`, targeted write, `SubtreeSwap`, or explicit
  signature comparison at the rebuild call site; no listed dropped site is changed.
- [ ] Search Boards retains keyed group/card roots and avoids rebuilding unchanged card details
  while filtering, catalog loading, and install/update notifications still render correctly.
- [ ] Mneme's repeated absent-config updates retain the loading node; config arrival and filter
  editing still work.
- [ ] MCP prompt argument/loading updates retain unchanged message-block children; changed block
  content and prompt selection still render correctly.
- [ ] Git busy-state updates retain unchanged ahead/behind children; repeated identical body
  messages retain their body root; real count/message transitions still render and history loads.
- [ ] Each surviving site has been exercised in the running app using the concrete paths in this
  document, and acceptance does not claim an unverified focus/scroll/selection symptom.

## Files Changed Summary

| File | Change |
|---|---|
| `src/renderer/editors/tools-hub/SearchBoardsTab.ts` | Planned `KeyedList` reconciliation and card-details signature gate |
| `src/renderer/editors/mneme-config/RootsPanel.ts` | Planned loading-node signature gate |
| `src/renderer/editors/mcp-inspector/PromptsPanel.ts` | Planned message-block signature gate |
| `src/renderer/editors/git-tree/GitTreeEditorView.ts` | Planned ahead/behind and body-message signature gates |
| `doc/tasks/US-1212-editor-rebuild-tail/README.md` | Investigation findings and implementation plan only |

### Files needing NO changes

| File | Reason |
|---|---|
| `src/renderer/editors/storybook/PropertyEditor.ts` | Rebuild is already behind a visible story/property-shape gate. |
| `src/renderer/editors/storybook/LivePreview.ts` | Content replacement is already behind story/arm transition gates; ordinary prop updates call the child view. |
| `src/renderer/editors/link-editor/LinksTilesView.ts` | No ungated whole child-set rebuild found for statement 1; its line-182 `{ all: true }` issue belongs to US-1213. |
| `src/renderer/components/git-tree/GitTreeEditorView.ts` | Does not exist; the correction points to the editor path. |
