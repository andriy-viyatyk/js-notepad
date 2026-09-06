# US-1322 - Log View, `pages.logView`, and the `ui_push` replacement path

Epic: [EPIC-087 - The data editors through `call`, and the retirement of `ui_push`](../../epics/EPIC-087.md)

**Status: Planned.** This document is an implementation plan only. It does not implement the
facade, change the MCP tool, add tests or test harnesses, change the dashboard, or create a commit.

## Goal

Give the Log View a complete path-based surface: `pages.logView` must get-or-create the
`mcp-ui-log` page and expose non-blocking `push` plus safe dialog read-back; every `log-view` page
must expose a real `LogViewEditorFacade` through `pages[i].editor`; and the existing Log View
writer must remain available through the existing global `ui` facade and the new page path. The
path must cover every capability in the EPIC-087 `ui_push` retirement table so US-1324 can verify
whether the tool is retirable.

**Status: Implemented 2026-09-06** (review deferred to epic close, per the epic model).

Verified live through `call`, end to end:

- `pages.logView` get-or-created the `mcp-ui-log` page; `push` accepted string shorthand, all log
  levels, `output.markdown`, `output.grid` with `contentType: "csv"` (through `csvToRecords`) and
  `output.progress` in one batch.
- A pushed `input.confirm` returned **immediately** with `dialogIds: ["6"]`, and every subsequent
  call carried the attention line naming the unanswered dialog and stating the agent cannot answer
  it. `dialogResult("6")` reported `status: "unresolved"`.
- Answering "Yes" in the page flipped it to `status: "resolved"` with `button: "Yes"`, and the
  attention line disappeared.
- A malformed `input.select` was rejected with the shared `DIALOG_SPECS` usage string, and the
  original `ui_push` tool still worked unchanged on the same page.
- The identity unification holds: a script's `ui.info(...)` landed on the same `mcp-ui-log` page.
  Its neighbouring "Agent started script" and blank-separator entries are pre-existing behaviour
  (`ScriptContext.ts:214-222`), now simply visible because scripts no longer get a throwaway page.

## Background

### Question 4: Log View dialogs are not `dialogs`-node dialogs

The existing `dialogs` node cannot answer a Log View `input.*` entry. The global renderer-dialog
protocol is backed by `dialogsState` in `src/renderer/ui/dialogs/DialogsView.ts:10-146`, and
`src/renderer/scripting/ai-vision/dialogs/index.ts:81-94` indexes that state. None of the Log View
items registers there. Instead:

- `src/renderer/editors/log-view/LogEntryContent.ts:40-70` creates an inline
  `ConfirmDialogView`, `TextInputDialogView`, `ButtonsDialogView`, `CheckboxesDialogView`,
  `RadioboxesDialogView`, or `SelectDialogView` as a child of the log row.
- The six item views call `LogViewEditor.resolveDialog()` directly; for example
  `ConfirmDialogView.ts:42`, `TextInputDialogView.ts:63,73`, `RadioboxesDialogView.ts:51`, and
  `SelectDialogView.ts:51` call the Log View model rather than `showDialog()`.
- `LogViewEditor.addDialogEntry()` (`LogViewEditor.ts:359-367`) appends an entry and records a
  resolver in the model's private `pendingDialogs` map. `resolveDialog()` (`:370-390`) writes the
  selected `button` and resolves that model promise. The model is not represented in
  `dialogsState`.

The existing `call` attention protocol therefore does not answer these dialogs: its watcher and
`collectAttention()` in `src/renderer/scripting/ai-vision/attention.ts:22-109` inspect only
`dialogsState` and application popup menus. A Log View dialog is an inline page entry, not a
modal renderer dialog. Decision 5 stands: `push(entries)` returns immediately, then the agent reads
answers through the Log View surface after the user answers. The implementation must extend the
attention collector with unresolved Log View entries and must tell the agent to poll
`pages.logView.dialogResult(id)`; it must not route these entries through `dialogs[0]`.

### Important source correction: `app.ui.log` is not a surface

Decision 5 says that `UiFacade` is already exposed as `app.ui.log`. The verified source contradicts
that sentence, and this task will not add that alias:

- `src/renderer/scripting/api-wrapper/UiFacade.ts:25,51-56,70` wraps a `LogViewEditor` and already
  implements the complete logging, rich-output, and inline-dialog writer.
- `src/renderer/api/types/index.d.ts:16-25` publishes that facade as the global `ui: IUiLog`.
- `src/renderer/scripting/ScriptContext.ts:95-119` installs the lazy global `ui` proxy and
  recreates its `UiFacade` when the cached Log View page was closed.
- `src/renderer/scripting/api-wrapper/AppWrapper.ts:45-105` returns the separate
  `src/renderer/api/ui.ts` `UserInterface` from `app.ui`; that object has modal
  `confirm`/`input`/`password` methods but no `log` member.
- `src/renderer/scripting/ai-vision/namespaces/ui.ts:24-43` describes that modal `app.ui` object,
  and its static member list has no `log` entry. `app.ui.log` is consequently absent from both the
  runtime object and the `call` tree.
- In MCP mode, `initializeUiFacade()` (`ScriptContext.ts:202-224`) reuses a page with id
  `mcp-ui-log` if present but otherwise calls `pagesModel.addEditorPage()` and creates a page with a
  random id. That is not the same singleton path as `ui_push`, which calls
  `pagesModel.requireWellKnownPage("mcp-ui-log")` (`src/renderer/api/mcp/ui-push.ts:44-51`).

This is a code contradiction, not a reason to weaken the specification. The implementation must
make the global `ui` binding and `pages.logView` resolve the same `LogViewEditor`, and make their
MCP target the fixed `mcp-ui-log` well-known page. `app.ui` remains the existing modal
`UserInterface`; `namespaces/ui.ts` gains only a `$help` pointer to `pages.logView` and the global
`ui`, not a runtime `log` member. The existing ScriptContext close-and-recreate lifecycle remains
the owner of the cached `UiFacade`; `pages.logView` uses the same shared editor lookup and never
creates a second writer or Log View editor. For a page-bound script, grouping the fixed well-known
page with the source page preserves the current grouping behavior while keeping editor identity
singular.

### Existing page, editor, and model shape

The two well-known Log View pages already exist in
`src/renderer/api/pages/well-known-pages.ts:33-48`:

| id | title | editor | role |
| --- | --- | --- | --- |
| `mcp-ui-log` | `MCP Log.log.jsonl` | `log-view` | agent output channel used by `ui_push` and the new `pages.logView` node |
| `mcp-server-log` | `MCP Server Log.log.jsonl` | `log-view` | ordinary second Log View page; it must also receive `LogViewEditorFacade` |

`src/renderer/editors/base/editor-matchers.ts:63-71` accepts `*.log.jsonl` for `log-view`, so a
user-opened `.log.jsonl` page also receives the same facade. `register-editors.ts:152` registers
`log-view` with `hasContentHost: true`, and `PageWrapper.content` (`PageWrapper.ts:144-149`)
returns the attached text host's raw JSONL content. The Log View data is therefore already beside
the facade, just as EPIC-087 decision 7 asks: the facade is not a privacy boundary and must not
claim to redact entries. `pages[i].content` remains the raw text; `editor.entries` is a convenient
model snapshot of the same data.

`LogViewEditor` (`src/renderer/editors/log-view/LogViewEditor.ts`) is the authoritative model. It
parses JSONL into `entries` (`:122-160` and `:177-234`), writes through the text host
(`:245-312`), appends/upserts entries (`:314-357`), resolves inline dialogs (`:359-390`), and
maintains the entry count in reactive state. `LogBodyView` and the 15 files under
`src/renderer/editors/log-view/items/` are views only. Facade state and actions must use the model,
never `LogBodyView`, `LogEntryWrapperView`, a `DataGridView`, or a child item view.

### The dialog answer is an entry mutation, not a promise-only value

`LogEntry` is a flat `LogEntryBase` with `type`, `id`, optional `timestamp`, and variant fields
(`src/renderer/editors/log-view/logTypes.ts:20-29`). The six dialog variants store answers as
follows:

| type | answer fields written before/with `button` | source |
| --- | --- | --- |
| `input.confirm` | `button` | `ConfirmEntry`, `logTypes.ts:49-54`; `ConfirmDialogView.ts:42` |
| `input.text` | `text`, then `button` | `TextInputEntry`, `:56-64`; `TextInputDialogView.ts:53-73` |
| `input.buttons` | `button` | `ButtonsEntry`, `:66-70`; `ButtonsDialogView.ts:36` |
| `input.checkboxes` | mutated `items[].checked`, then `button` | `CheckboxesEntry`, `:78-84`; `CheckboxesDialogView.ts:60-74` |
| `input.radioboxes` | `checked`, then `button` | `RadioboxesEntry`, `:87-93`; `RadioboxesDialogView.ts:47-51` |
| `input.select` | `selected`, then `button` | `SelectEntry`, `:97-103`; `SelectDialogView.ts:47-51` |

The authoritative resolved test already exists as `isDialogResolved()` at
`logTypes.ts:195-197`: a dialog is resolved when `entry.button !== undefined`, not when
`Boolean(entry.button)` is true. That distinction preserves an answered dialog whose button label
is `""`, and preserves falsy answer fields such as an empty selection or an empty checkbox list.
`ui_push` currently papers over an unresolved/canceled promise by mapping `button === undefined`
to `null` (`ui-push.ts:122-128`); the replacement must not do that. `clear()` and `dispose()`
resolve outstanding promises with a sentinel entry without a button (`LogViewEditor.ts:432-438,
:501-508`), so the new model snapshot API must return `undefined` for an entry that no longer
exists and must never manufacture a `null` answer.

The chosen read-back shape is `dialogResult(id)`, not a second status field embedded in every
entry. `push()` returns the ids of all entries and the ids of dialogs it created. The agent then
calls `dialogResult(id)`, which returns:

```ts
undefined                                      // no such entry
{ id, status: "unresolved" }                   // entry exists, button === undefined
{ id, status: "resolved", entry: { ...copy } } // button property exists, even if falsy
```

This makes the unresolved state explicit, keeps the persisted `LogEntry` shape unchanged, and
prevents a consumer from confusing an absent entry with a canceled/unfinished answer or with a
resolved answer whose value is falsy. `entries` remains available for bulk inspection, but
`dialogResult(id)` is the documented answer contract and the one used by `$help` and attention.

## Implementation Plan

### 1. Centralize the singleton Log View lookup and share the ScriptContext binding

Create `src/renderer/api/mcp/log-view-access.ts` with the one get-or-create-and-focus operation
currently duplicated in `ui-push.ts` and partly duplicated in `ScriptContext.ts`:

```ts
// Before: ui-push.ts owns this private operation; ScriptContext has a different create path.
async function getOrCreateMcpLogViewEditor(): Promise<LogViewEditor> {
    const page = await pagesModel.requireWellKnownPage("mcp-ui-log");
    const editor = page.mainEditorInstance;
    if (!(editor instanceof LogViewEditor)) throw new Error("MCP log page is not a LogViewEditor");
    return editor;
}
```

```ts
// After: one shared operation, with the existing requireWellKnownPage focus semantics.
export function getOrCreateMcpLogViewEditor(): LogViewEditor {
    const page = pagesModel.requireWellKnownPage("mcp-ui-log");
    const editor = page.mainEditorInstance;
    if (!(editor instanceof LogViewEditor)) {
        throw new Error("MCP log page is not a LogViewEditor");
    }
    return editor;
}
```

`PagesLifecycleModel.requireWellKnownPage()` currently has an `async` marker but no await
(`PagesLifecycleModel.ts:294-320`). Make that existing operation synchronous, or add an explicitly
synchronous sibling used only by this binding; `await` at the old `ui_push` call site remains
source-compatible. The operation must still focus an existing `mcp-ui-log` page and create it
with its registered fixed id/title/editor/language when absent. Do not change the well-known page
definitions.

Update `ScriptContext.ts:95-119,202-265` so the cached `UiFacade` is created around the editor
returned by this shared operation, including for the first MCP call. Keep the existing
recreate-if-the-page-was-closed check. When a page-bound context needs grouping, group the fixed
well-known page with the context page after creation, preserving the existing lifecycle behavior;
do not create a random `addEditorPage()` replacement. `PageCollectionWrapper` calls the same
shared operation directly, so the global `ui` and `pages.logView` name one editor without adding a
second `app.ui` wrapper or alias.

`src/renderer/scripting/api-wrapper/AppWrapper.ts` and `src/renderer/api/ui.ts` remain unchanged.
`app.ui` continues to be the modal UserInterface; this task adds no runtime `log` member or
context-bound wrapper to it.
`src/renderer/scripting/ai-vision/namespaces/ui.ts:24-43` must not gain a `log` member or provider.
Its `$help` gains one sentence pointing agents to `pages.logView` for Log View output and noting
that scripts also have the global `ui` facade. The published `IUserInterface` type remains
unchanged: `app.ui` continues to describe modal dialogs.

There is no `app.ui.log` alias; `namespaces/ui.ts` only documents the existing page path.

### 2. Add `pages.logView` beside `pages.compare`

Add `LogViewEditorFacade` in
`src/renderer/scripting/api-wrapper/LogViewEditorFacade.ts` and expose the same class from a new
`PageCollectionWrapper.logView` getter. `PageCollectionWrapper` already owns the `PagesModel`; its
getter calls the shared editor operation directly. Reading `pages.logView` therefore has the same
get-or-create and focus behavior as `ui_push`, while the global `ui` keeps ScriptContext's existing
closed-page recreation lifecycle. It wraps the returned editor, not a second editor instance.

Before:

```ts
const PAGES_MEMBERS = [
    // ...
    { name: "compare", kind: "property", node: true, ... },
];

get compare(): CompareModeNode {
    return new CompareModeNode(this.pages);
}
```

After:

```ts
const PAGES_MEMBERS = [
    // ...
    { name: "compare", kind: "property", node: true, ... },
    { name: "logView", kind: "property", node: true,
      summary: "The get-or-created MCP Log View writer and dialog read-back surface." },
];

get logView(): LogViewEditorFacade {
    return new LogViewEditorFacade(this.ensureLogViewEditor(), "log-view", "Log View");
}
```

Add `.logView` to `PageCollectionWrapper.aiChildren()` without invoking it while merely listing
children; the actual path read is what creates/focuses the page. Add `ILogViewEditor` to
`src/renderer/api/types/page.d.ts`'s `IEditorFacade` union and add
`readonly logView: ILogViewEditor` to `src/renderer/api/types/pages.d.ts`. The sync getter is
deliberate: `pages.logView.push([...])` is the retirement-table path, and each action performs its
own synchronous model append before returning. `call` already awaits every hop, so the same path
also works through `call` and through `windows[i].pages.logView`.

### 3. Register `LogViewEditorFacade` for every Log View page

Update `src/renderer/scripting/api-wrapper/PageWrapper.ts:52-70`:

```ts
// Before
const FACADE_FOR_EDITOR: Record<string, EditorFacadeFactory> = {
    // existing editor factories; log-view falls through to GenericEditorFacade
};
```

```ts
// After
const FACADE_FOR_EDITOR: Record<string, EditorFacadeFactory> = {
    // existing editor factories...
    "log-view": (editor, id, name) =>
        new LogViewEditorFacade(editor as LogViewEditor, id as "log-view", name),
};
```

The concrete factory is used only when `mainEditor` exists, as today. It must work for the fixed
`mcp-ui-log` page, `mcp-server-log`, and a user-opened `.log.jsonl` file. Add
`"log-view"` to `IFacadeEditorId` and `ILogViewEditor` to the public union. `pages.logView` and
`pages[i].editor` may create different facade wrapper objects, but they must point to the same
`LogViewEditor` model when they name the same page; they must never maintain separate entries,
dialog maps, or writers.

### 4. Add model-backed snapshots and dialog handles

Extend `src/renderer/editors/log-view/LogViewEditor.ts` without reading view state:

- Add a model-side copied-entry query (`getEntriesSnapshot()` and/or an equivalent indexed/id
  query) that returns copies of `LogEntry` records, including copied styled segments, item arrays,
  column arrays, and nested plain records. Never expose the private `entries` array or a live entry
  object through the facade.
- Add a model-side dialog handle for non-blocking creation that returns the created id and stores
  the unresolved resolver. Preserve `UiFacade.dialog.*`'s existing Promise-returning
  `addDialogEntry()` behavior by implementing it through the same internal registration helper.
  The `push` path must call the handle and intentionally discard/observe the promise without
  awaiting it.
- Add a model-side `getEntryById()`/unresolved-state query and a model-side
  `hasUnresolvedDialogs()` query. Use `isDialogEntry()` and `isDialogResolved()` from
  `logTypes.ts`; unresolved means `button === undefined`, not a missing pending Promise only.
  This also handles an unresolved dialog loaded from JSONL after restore.
- Keep `resolveDialog(id, button: string)` as the only answer mutation path. The facade must not
  mutate entries, and no action may call a view or inspect a DOM control.

The facade getters and actions are:

| Member | Model-backed behavior | Absent/empty behavior |
| --- | --- | --- |
| `entries` | Fresh snapshots from the model | `undefined` with no attached page/host; `[]` for an attached empty Log View |
| `entryCount` | Attached model count | `undefined` detached; real `0` when attached and empty |
| `error` | Attached `LogViewEditorState.error` | `undefined` when detached or when the valid parse has no error |
| `showTimestamps` | Attached `state.showTimestamps` | `undefined` detached; real `false` when attached and off |
| `push(entries)` | Shared validation/normalization, then model appends/upserts | Throws a validation error; it never silently hangs on malformed dialog fields |
| `dialogResult(id)` | Copy the model entry and test `button !== undefined` | `undefined` only for no such entry; explicit `status: "unresolved"` for an existing unanswered dialog |
| `clear()` | `LogViewEditor.clear()` | Detached action throws a clear unavailable diagnostic |
| `toggleTimestamps()` | `LogViewEditor.toggleTimestamps()` | Detached action throws a clear unavailable diagnostic |

`push` and `clear` carry `$help` cautions because they write/delete the page's JSONL content;
`toggleTimestamps` changes persisted Log View settings. No facade action accepts a secret value,
reads `LogBodyView`, or returns a live model array.

### 5. Define the public Log View types

Create `src/renderer/api/types/log-view-editor.d.ts` as the canonical public leaf. Keep it
self-contained and use plain snapshots rather than importing renderer model types:

```ts
export interface ILogEntrySnapshot {
    readonly type: string;
    readonly id: string;
    readonly timestamp?: number;
    readonly [key: string]: unknown;
}

export type ILogPushEntry = string | {
    readonly type: string;
    readonly [key: string]: unknown;
};

export interface ILogPushResult {
    readonly entryIds: string[];
    readonly dialogIds: string[];
}

export type ILogDialogResult =
    | { readonly id: string; readonly status: "unresolved" }
    | { readonly id: string; readonly status: "resolved"; readonly entry: ILogEntrySnapshot };

export interface ILogViewEditor {
    readonly id: "log-view";
    readonly name: string;
    readonly entries: ILogEntrySnapshot[] | undefined;
    readonly entryCount: number | undefined;
    readonly error: string | undefined;
    readonly showTimestamps: boolean | undefined;

    push(entries: ILogPushEntry[]): ILogPushResult;
    dialogResult(id: string): ILogDialogResult | undefined;
    clear(): void;
    toggleTimestamps(): void;
    readonly elements: readonly {
        readonly name: string;
        readonly purpose: string;
        readonly selector: string;
        readonly visible: boolean;
    }[];
    highlight(name: string, message?: string): Promise<unknown>;
}
```

The implementation may use the existing `IHighlightResult` type for `highlight`; the snippet keeps
the leaf focused on the shape that matters to the plan. Add imports/unions to
`src/renderer/api/types/page.d.ts` and add the `pages.logView` member to
`src/renderer/api/types/pages.d.ts`. Do not add a Log View member to
`src/renderer/api/types/ui.d.ts`. Refresh `assets/editor-types/` only through the normal Vite
editor-types generation path; never hand-edit generated `.d.ts` files or `_imports.txt`.

### 6. Reuse the `ui_push` normalization and `DIALOG_SPECS` table

Create `src/renderer/api/mcp/ui-push-validation.ts` (or an equivalent shared module in the same
MCP API layer) and move/export the existing `DialogSpec`, `DIALOG_SPECS`, validation, string
shorthand, output normalization, and error-message construction from
`src/renderer/api/mcp/ui-push.ts:7-43,64-118`. Both `handleUiPush()` and
`LogViewEditorFacade.push()` must call that shared code. Do not create a second per-type switch in
the facade.

The shared behavior must preserve every existing rule:

- String input becomes `{ type: "log.info", text: raw }`.
- `input.*` uses the exact allowed props, required prop, and error wording from `DIALOG_SPECS`.
  The six worked usage strings, copied verbatim into the new facade `$help`, are:

  ```text
  { type: "input.confirm", message: "Continue?", buttons: ["No", "Yes"] }
  { type: "input.text", title: "Enter name", placeholder: "Name...", buttons: ["Cancel", "OK"] }
  { type: "input.buttons", title: "Choose action", buttons: ["Save", "Discard", "Cancel"] }
  { type: "input.checkboxes", title: "Select", items: [{ label: "A", checked: true }, { label: "B" }], buttons: ["Cancel", "OK"] }
  { type: "input.radioboxes", title: "Pick one", items: ["Small", "Medium", "Large"], buttons: ["Cancel", "OK"] }
  { type: "input.select", title: "Format", items: ["JSON", "CSV", "XML"], placeholder: "Choose...", buttons: ["Cancel", "OK"] }
  ```

  The validation table being reused is explicit (`ui-push.ts:12-42`):

  | Type | Allowed props | Required prop |
  | --- | --- | --- |
  | `input.confirm` | `id`, `message`, `buttons` | `message` (string) |
  | `input.text` | `id`, `title`, `placeholder`, `defaultValue`, `buttons` | none |
  | `input.buttons` | `id`, `title`, `buttons` | `buttons` (array) |
  | `input.checkboxes` | `id`, `title`, `items`, `layout`, `buttons` | `items` (array) |
  | `input.radioboxes` | `id`, `title`, `items`, `checked`, `layout`, `buttons` | `items` (array) |
  | `input.select` | `id`, `title`, `items`, `selected`, `placeholder`, `buttons` | `items` (array) |

  Preserve the current truthiness check for the required prop and the separate array check for
  `items`; the replacement is not an opportunity to silently broaden or narrow the old tool's
  accepted schema.

- `output.grid` requires a truthy string `content`, rejects non-string content, defaults
  `contentType` to JSON, and keeps the exact JSON-array validation. For `contentType === "csv"`,
  use the existing `csvToRecords(content, true, ",")` path (`ui-push.ts:86-110`) so the first row
  is treated as headers and the delimiter remains comma. Remove `content`/`contentType` before
  calling `addEntry` and store the resulting `data` array.
- `output.text`, `output.markdown`, and `output.mermaid` accept the existing `content` alias only
  when `text` is absent, then delete `content`, exactly as `ui-push.ts:111-116` does.
- Other `output.*` entries pass their fields through; `output.progress` therefore preserves
  `label`, `value`, `max`, `completed`, and optional upsert `id` without inventing defaults.
- Other typed entries preserve the current `fields.text ?? ""` fallback.

The facade `$help` must include the six usage strings, explain that validation is shared with
`ui_push`, and state that a Log View dialog is answered by the user in the Log View page; the agent
cannot answer it and no `dialogs[0]` path does so. A malformed dialog must return an immediate
validation error, never add a broken inline entry that leaves a caller waiting forever.
`handleUiPush` keeps its existing blocking Promise path for backward compatibility until EPIC-090;
the new facade path intentionally calls the model dialog handle and does not await it.

### 7. Implement `LogViewEditorFacade` and its curated elements

Use the established facade pattern from `RestClientEditorFacade.ts` and `GridEditorFacade.ts`:
call `createElements()` with `pageScopeSelector(pageId)`, activate the page and wait for layout
before highlighting, merge the generated `elements`/`highlight` members, and preserve `id`/`name`.
The facade is registered in `FACADE_FOR_EDITOR`, not added as a method to `PageWrapper`.

The source inventory below contains the 51 named controls/name families found in the Log View
source. Duplicate `name:` assignments in later `update()` calls are one control family, and the
two template names are included as repeated families. `Curate` means the facade declares a
purposeful, page-scoped element. `Omit` means the name is structural, a per-entry wrapper, or a
view-local action that has no model-backed facade method.

| Source name/family | Decision | Reason/source |
| --- | --- | --- |
| `log-clear` | Curate | Toolbar clear action calls `LogViewEditor.clear()` after confirmation (`log-view/index.ts:113-125`). |
| `log-toggle-timestamps` | Curate | Toolbar toggle calls `LogViewEditor.toggleTimestamps()` (`index.ts:126-138`). |
| `log-view-list` | Omit | Structural list host (`LogBodyView.ts:47`). |
| `log-view-message` | Omit | Empty/error message host, not a control (`LogBodyView.ts:48,201-207`). |
| `log-view-root` | Omit | Structural body root (`LogBodyView.ts:104`). |
| `log-flex-grid` | Omit | Virtualized row renderer host (`LogBodyView.ts:220-232`). |
| `log-item-wrapper` | Omit | Per-entry content wrapper (`LogEntryContent.ts:123`). |
| `entry-content` | Omit | Per-entry layout panel (`LogEntryWrapper.ts:36`). |
| `log-entry-wrapper` | Omit | Per-entry structural wrapper (`LogEntryWrapper.ts:45,80`). |
| `log-message` | Omit | Per-message display root (`LogMessageView.ts:27,43`). |
| `log-buttons-panel` | Omit | Shared dialog button container (`ButtonsPanel.ts:24,42`). |
| `log-checkbox-list` | Omit | Checkbox dialog list container (`CheckboxesDialogView.ts:18`). |
| `log-checkboxes-dialog` | Omit | Checkbox dialog structural root (`CheckboxesDialogView.ts:19`). |
| `log-confirm-message` | Omit | Confirm message display panel (`ConfirmDialogView.ts:16`). |
| `log-dialog-container` | Omit | Shared dialog structural container (`DialogContainer.ts:13,37`). |
| `log-dialog-header` | Omit | Optional title panel (`DialogHeader.ts:14,32`). |
| `log-grid-output` | Omit | Repeated output root; locating a grid output is an entry query, not a control (`GridOutputView.ts:37`). |
| `log-grid-open-in-editor` | Curate | User-visible output action; it remains element-only because the view currently opens the grid directly (`GridOutputView.ts:51`). |
| `log-grid-hover-actions` | Omit | Hover action wrapper (`GridOutputView.ts:52`). |
| `log-markdown-content` | Omit | Markdown content host (`MarkdownOutputView.ts:15`). |
| `log-markdown-output` | Omit | Repeated markdown output root (`MarkdownOutputView.ts:16`). |
| `log-markdown-open-in-editor` | Curate | User-visible output action; element-only because the current handler calls `pagesModel.addEditorPage()` (`MarkdownOutputView.ts:23`). |
| `log-markdown-hover-actions` | Omit | Hover action wrapper (`MarkdownOutputView.ts:25`). |
| `log-mcp-header` | Omit | MCP request display header (`McpRequestView.ts:28`). |
| `log-mcp-card` | Omit | Collapsible request card (`McpRequestView.ts:35`). |
| `log-mcp-request-section` | Omit | Request data section (`McpRequestView.ts:39`). |
| `log-mcp-response-section` | Omit | Response data section (`McpRequestView.ts:40`). |
| `log-mcp-request` | Omit | Repeated MCP request root (`McpRequestView.ts:41`). |
| `log-mcp-toggle` | Omit | View-local expanded state, not LogViewEditor model state (`McpRequestView.ts:48,99`). |
| `log-mermaid-content` | Omit | Mermaid image/content host (`MermaidOutputView.ts:28`). |
| `log-mermaid-output` | Omit | Repeated Mermaid output root (`MermaidOutputView.ts:29`). |
| `log-mermaid-hover-actions` | Omit | Hover action wrapper (`MermaidOutputView.ts:32`). |
| `log-mermaid-open-in-editor` | Curate | User-visible output action; element-only because the view owns the open operation (`MermaidOutputView.ts:44`). |
| `log-mermaid-copy` | Curate | User-visible clipboard action; element-only because clipboard/render state is view-local (`MermaidOutputView.ts:45,113`). |
| `log-progress-label-row` | Omit | Progress layout row (`ProgressOutputView.ts:11`). |
| `log-progress` | Omit | Repeated progress display widget; use `entries` for state (`ProgressOutputView.ts:15,49`). |
| `log-progress-output` | Omit | Repeated progress output root (`ProgressOutputView.ts:16`). |
| `log-radio-list` | Omit | Radio dialog list container (`RadioboxesDialogView.ts:18`). |
| `log-radioboxes-dialog` | Omit | Radio dialog structural root (`RadioboxesDialogView.ts:19`). |
| `log-radio-group` | Curate | Repeated user input control; selector must match all mounted dialog groups (`RadioboxesDialogView.ts:47`). |
| `log-select-control` | Omit | Select dialog control panel (`SelectDialogView.ts:17`). |
| `log-select-dialog` | Omit | Select dialog structural root (`SelectDialogView.ts:18`). |
| `log-select` | Curate | Repeated user input control (`SelectDialogView.ts:47`). |
| `log-text-input-field` | Omit | Text dialog field panel (`TextInputDialogView.ts:21`). |
| `log-text-input-dialog` | Omit | Text dialog structural root (`TextInputDialogView.ts:22`). |
| `log-text-input` | Curate | Repeated text input control (`TextInputDialogView.ts:56`). |
| `log-text-output` | Omit | Repeated Monaco output root (`TextOutputView.ts:109`). |
| `log-text-open-in-editor` | Curate | User-visible output action; element-only because the view owns the new-page operation (`TextOutputView.ts:117`). |
| `log-text-hover-actions` | Omit | Hover action wrapper (`TextOutputView.ts:119`). |
| `log-button-${button.label}` | Curate as `log-dialog-button` | Dynamic repeated answer buttons (`ButtonsPanel.ts:80`); declare a prefix selector and report all matches. |
| `log-checkbox-${index}` | Curate as `log-dialog-checkbox` | Dynamic repeated checkbox inputs (`CheckboxesDialogView.ts:68`); declare a prefix selector and report all matches. |

The curated list is therefore 12 API elements: `log-clear`, `log-toggle-timestamps`,
`log-grid-open-in-editor`, `log-markdown-open-in-editor`, `log-mermaid-open-in-editor`,
`log-mermaid-copy`, `log-text-open-in-editor`, `log-radio-group`, `log-select`, `log-text-input`,
`log-dialog-button`, and `log-dialog-checkbox`. The last five (and the dialog button/checkbox
families) can repeat per entry; the facade must pass `highlightOptions: { all: true }` to
`createElements`. The overlay otherwise highlights only the first match
(`assets/agent/ui-highlight.js:281-286`), while its result reports total `count` and actual
`highlighted` rings (`:298-306`, public shape `src/renderer/api/types/ui.d.ts:133-146`). `$help`
must say that prefix selectors locate a family, `count` is the number of matches, and
`highlighted` is the number actually ringed/capped by the overlay.

The element selector is always under `[data-page-id="<id>"]` via `pageScopeSelector()`; no bare
global selector is allowed. The output open/copy controls are intentionally element-only: the
facade exposes the model-backed `entries`/`push` data and does not reach into the view-owned
`pagesModel.addEditorPage()` or clipboard implementation. If a future action is added, it must
first be moved into a model-owned operation.

### 8. Replace the `mcpHint` and preserve the existing tool

Change only the hint string in `src/renderer/editors/register-editors.ts:152`:

```ts
// Before
mcpHint: 'Use ui_push to write entries to the MCP log page, or execute_script with: await app.pages.requireWellKnownPage("mcp-ui-log")'
```

```ts
// After
mcpHint: 'Use pages.logView.push(entries) to write entries to the MCP Log View; use pages.logView.dialogResult(id) to read an answer.'
```

Do not delete or alter `ui_push`. `src/renderer/api/mcp/command-registry.ts:25,47` already
registers it, and `src/main/mcp/tools/page-tools.ts:66-92` already supplies the tool description,
flat-entry schema, and `timeoutMs: 0` whenever an `input.*` entry is present. The old tool remains
the compatibility/blocking path until EPIC-090.

### 9. Implement attention for inline Log View dialogs

Extend `src/renderer/scripting/ai-vision/attention.ts` with a model-backed Log View scan. It must
inspect `pagesModel.pages`, select attached `LogViewEditor` instances, and use the new
`hasUnresolvedDialogs()`/snapshot API. Because this collector runs on the way out of every
`call`, `hasUnresolvedDialogs()` must read only already-parsed in-memory model state: an
in-memory unresolved flag or a scan of the parsed `entries` array. It must never re-parse JSONL,
read text-host content, touch the DOM, or inspect item views. The attention text should identify
the page and dialog id/type
and say:

```text
An inline Log View dialog is unanswered. Wait for the user in the Log View page, then read
pages.logView.dialogResult("<id>"). The agent cannot answer this dialog.
```

`resolveWithAttention()` already adds `attention` after an action completes (`attention.ts:84-100`),
so an immediate `pages.logView.push(...)` call returns its normal result plus attention when the
batch created an unresolved dialog. Subsequent calls continue to carry attention while any
unresolved log dialog remains. Once every dialog has a `button` property, the Log View section
disappears. Native modal dialogs retain the existing `dialogs[0]` behavior unchanged.

### 10. Verify the complete `ui_push` retirement table

The plan maps every row; no capability is silently dropped:

| `ui_push` capability | Replacement path and verification |
| --- | --- |
| Get-or-create Log View | Read `pages.logView`; the shared well-known lookup focuses/reuses `mcp-ui-log`. |
| String shorthand | `pages.logView.push(["text"])` becomes one `log.info` entry. |
| `log.text/info/warn/error/success` | `push([{ type: "log.info", text: "..." }])` and the other flat log types; the model stores the same fields. |
| `output.text`, `output.markdown`, `output.mermaid` | Same typed entries, including title and display fields plus the existing `content` alias. |
| `output.grid` JSON | Same `content` string → `JSON.parse` → array validation → `data` path. |
| `output.grid` CSV | Same `contentType: "csv"` → `csvToRecords(content, true, ",")` path; the first row remains headers. |
| `output.progress` | Same label/value/max/completed fields and id-based upsert through `LogViewEditor.addEntry`. |
| Six `input.*` types | Same `DIALOG_SPECS` props/required checks/usage messages; the shared validator runs before the inline model entry is created. |
| Blocking until all dialogs resolve | Deliberately changed to immediate `push` result with `dialogIds`; `dialogResult(id)` distinguishes unresolved from resolved falsy values; attention persists while unresolved. |
| `windowIndex` targeting | `call` path `windows[i].pages.logView.push(...)`; `src/main/mcp/tools/call-tools.ts:14-63,151-174` strips the prefix and forwards to that renderer, while explicit `windowIndex` routing remains in `renderer-bridge.ts:29-44`. US-1324 must live-exercise this against a second window; routing/source inspection is not evidence (the EPIC-086 `open_url` lesson). |

The old tool's `timeoutMs` behavior is not copied into `call`; `call` keeps its normal transport
timeout because the new push never waits on the user. US-1324 must verify each row live before
marking `ui_push` retirable.

### 11. Apply the absent-value audit and implementation guardrails

`strictNullChecks` is off. The facade's implementation and `$help` must state these exact
semantics and never use `false`, `0`, `""`, or `null` as an absence marker:

| Getter/result | Attached real state | No host/page or no entry |
| --- | --- | --- |
| `entries` | Fresh `[]` for a valid empty Log View; copied records otherwise | `undefined` with no attached host |
| `entryCount` | Real count, including `0` | `undefined` detached |
| `error` | Actual parse error; `undefined` for a valid parse | `undefined` detached |
| `showTimestamps` | Real boolean, including `false` | `undefined` detached |
| `dialogResult(id)` | `status: "unresolved"` when the entry exists without `button`; resolved copy when `button` exists | `undefined` only when no such entry exists |
| `push()` result | Fresh `entryIds` and `dialogIds` arrays, including `[]` when the input is empty | Validation error for malformed input, not an empty success |

All action results and arrays are copies. Actions call only `LogViewEditor` model methods. No
facade action reaches into a view or returns a live model array, satisfying EPIC-087 abort criterion
1 and decision 8.

Record the UIKit warning in the implementation comments and facade task review: UIKit views delete
`data-name` when a later `update()` omits `name` (`ButtonView.ts:97-105`; the shared
`panel-style.ts:303-331` attribute pass does the same). Any future `name:` added while completing
this task must be present at every construction, conditional branch, keyed-row update, and
re-render call site. The current Log View sources already repeat names at update sites such as
`LogEntryWrapper.ts:45,80`, `McpRequestView.ts:48,99`, `MermaidOutputView.ts:45,113`, and
`ProgressOutputView.ts:15,49`; do not remove those props while touching the views. No new UI name
is required for this task.

### 12. Verification boundary for implementation

After implementation (and only after the user asks to implement), source review must verify:

1. The six dialog usage strings and validation messages are shared, not copied into a second
   switch; malformed entries never create an unresolved broken dialog.
2. `pages.logView` and global `ui` use one fixed `mcp-ui-log` editor per context; closing it
   causes the existing ScriptContext recreation behavior; the second well-known log and opened
   `.log.jsonl` pages use the facade but do not become the singleton output channel.
3. `pages[i].content` still exposes raw JSONL because `log-view` has a content host; no false
   redaction claim is added.
4. The 12 curated elements are page-scoped, repeated families use `{ all: true }`, and every one
   of the 51 source names has a documented Curate/Omit decision.
5. `dialogResult()` preserves `button: ""`, empty selections, and other falsy answer fields,
   while `status: "unresolved"` is used only for `button === undefined` on an existing entry.
6. `attention` identifies inline Log View dialogs and does not pretend they are `dialogs[0]`.
7. All retirement-table paths, including JSON and CSV grid output and a live second-window
   `windows[i].pages.logView.push(...)` exercise, work through `call` before US-1324 changes the
   tool status.

Run the normal typecheck/lint and the existing generated editor-type copy path during
implementation. Do not add unit tests or test harnesses for US-1322.

## Concerns

- **The source does not match the epic's “already app.ui.log” sentence.** The plan deliberately
  keeps that alias absent: `app.ui` remains the modal interface, while the global `ui` and
  `pages.logView` are the two names for the same Log View editor.
- **The fixed well-known page must replace the random MCP script page.** Otherwise a script's
  global `ui` and an agent's `pages.logView` can write to different editors. The shared access
  helper and ScriptContext cache are the single identity boundary. This is a deliberate,
  user-visible behavior change: existing script `ui.log(...)` output moves from a random page to
  the `MCP Log` page. Page-bound script grouping is preserved by grouping that fixed page with the
  source page; the `docs/whats-new.md` entry is written at epic close, not in US-1322.
- **Inline dialogs cannot be answered by `dialogs[0]`.** This is why decision 5's non-blocking
  design remains necessary. Attention is a read-back prompt for the inline page, not a modal click
  adapter.
- **The model's pending Promise is not the resolution state.** A restored unresolved entry has no
  `pendingDialogs` resolver, while a resolved answer can carry an empty/falsy field. The public
  contract must use the entry's `button !== undefined` test and an explicit status union.
- **`page.content` is raw JSONL.** The Log View facade does not redact its entries because the same
  data is already adjacent on a `hasContentHost: true` page. The plan adds no secret-taking member.
- **Element-only output controls are intentionally not facade actions.** Their current handlers
  own view/clipboard behavior. Adding an action would violate the model-only rule; a future action
  must first move its behavior into `LogViewEditor`.
- **`strictNullChecks` is disabled.** The absent-value table is a review obligation, especially
  for detached facades and no-such-dialog results.
- **`data-name` can disappear on update.** The UIKit delete-on-omitted-name rule is a regression
  risk whenever a Log View view is edited; every update call must preserve existing names.
- **The old blocking tool remains intentionally supported.** This task creates the replacement
  path only; US-1324's live acceptance run decides whether the behavior change is usable and marks
  the tool retirable. Nothing is deleted here.

## Acceptance Criteria

- [ ] Reading `pages.logView` get-or-creates and focuses the fixed `mcp-ui-log` page, and
      `pages.logView` and global `ui` share the same `LogViewEditor` instance; the existing
      ScriptContext close/recreate lifecycle and page-bound grouping behavior are preserved.
- [ ] `pages[i].editor` returns `LogViewEditorFacade` for `mcp-ui-log`, `mcp-server-log`, and a
      user-opened `.log.jsonl` page; the facade preserves page editor `id` and display `name`.
- [ ] `pages.logView.push(entries)` returns immediately with copied `entryIds` and `dialogIds`,
      without awaiting any inline dialog Promise.
- [ ] `dialogResult(id)` returns `undefined` only for no such entry, an explicit unresolved marker
      when `button === undefined`, and a copied resolved entry when the button property exists;
      resolved falsy values are not mapped to `null`.
- [ ] Log View dialogs are documented as inline entries outside `dialogs[0]`; unresolved entries
      raise `attention` through the call result until every dialog is answered by the user in the
      Log View page; the agent has no answer path for these dialogs.
- [ ] `hasUnresolvedDialogs()` and the attention scan use only already-parsed in-memory model
      state; they never re-parse JSONL, read text-host content, or touch the DOM on the per-call
      attention path.
- [ ] `DIALOG_SPECS` and its validation/usage strings are shared by `ui_push` and `push`; malformed
      input is rejected before a dialog entry is created.
- [ ] The `push` path covers string shorthand, all five log levels, all three rich text/diagram
      outputs, `output.grid` JSON, `output.grid` CSV through `csvToRecords`, `output.progress`, and
      all six `input.*` types.
- [ ] The retirement table explicitly covers a live second-window
      `windows[i].pages.logView.push(...)` exercise; no `ui_push` capability is silently dropped,
      and `src/main/mcp/tools/page-tools.ts` remains unchanged.
- [ ] The facade's curated list has exactly 12 purposeful elements from the verified 51-name
      inventory, with a Curate/Omit decision and source reason for every source name/family.
- [ ] Every element selector is page-scoped; repeated controls use
      `highlightOptions: { all: true }`, and help explains `count` versus `highlighted`.
- [ ] Every getter/result follows the absent-value audit: genuine `false`, `0`, `""`, and `[]`
      remain genuine values; absence is `undefined` only where documented; returned arrays and
      objects are copies.
- [ ] All facade actions are model-backed and no action reaches into Log View views, DOM state,
      clipboard state, or live model arrays.
- [ ] The `log-view` `hasContentHost: true` fact and raw `page.content` boundary are recorded; no
      false redaction promise or secret-accepting member is added.
- [ ] The `register-editors.ts:152` hint names `pages.logView` instead of `ui_push`.
- [ ] The UIKit delete-on-omitted-name warning is recorded and all existing/additional `name:`
      props remain present at every update call site.
- [ ] No unit tests, test harnesses, dashboard change, user-documentation change, generated-asset
      hand edit, or commit is created by this task.

## Files Changed

| File | Planned change |
| --- | --- |
| `doc/tasks/US-1322-log-view-surface/README.md` | This source-verified plan, dialog decision, facade inventory, retirement mapping, absent-value audit, and file scope. |
| `src/renderer/api/mcp/log-view-access.ts` | New single get-or-create-and-focus helper for the fixed `mcp-ui-log` editor. |
| `src/renderer/api/mcp/ui-push-validation.ts` | New shared `DIALOG_SPECS`, validation, usage text, and entry normalization used by both paths. |
| `src/renderer/api/mcp/ui-push.ts` | Use the shared access/validation helpers while preserving the existing blocking compatibility behavior. |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Make the existing no-await well-known-page operation usable by the synchronous `pages.logView` accessor, preserving focus/create semantics. |
| `src/renderer/editors/log-view/LogViewEditor.ts` | Add copied snapshots, id lookup, unresolved-dialog state, and a non-blocking dialog handle; keep existing Promise API behavior for `UiFacade`. |
| `src/renderer/scripting/api-wrapper/LogViewEditorFacade.ts` | New model-backed facade, `push`, `entries`, explicit dialog-result union, cautioned actions, `$help`, and 12 page-scoped elements. |
| `src/renderer/scripting/ScriptContext.ts` | Route the cached global `UiFacade` through the fixed well-known editor and share its editor identity with `pages.logView`. |
| `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` | Add the `logView` descriptor member/child and shared-editor getter beside `compare`. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Import/register `LogViewEditorFacade` in `FACADE_FOR_EDITOR` and its internal union. |
| `src/renderer/scripting/ai-vision/namespaces/ui.ts` | Add `$help` pointing to `pages.logView` for Log View output and noting the global `ui`; add no runtime member. |
| `src/renderer/scripting/ai-vision/attention.ts` | Include unresolved inline Log View dialogs in `attention` without treating them as modal `dialogs`. |
| `src/renderer/editors/register-editors.ts` | Replace the `log-view` `mcpHint` text with `pages.logView`/`dialogResult` paths. |
| `src/renderer/api/types/log-view-editor.d.ts` | New canonical public Log View snapshots, push result, dialog-result union, and facade declarations. |
| `src/renderer/api/types/page.d.ts` | Add `log-view` to `IFacadeEditorId` and `ILogViewEditor` to `IEditorFacade`. |
| `src/renderer/api/types/pages.d.ts` | Add `IPageCollection.logView`. |
| `assets/editor-types/**` | Generated copies refreshed only through the existing Vite editor-types path; never hand-edited. |

Files intentionally needing **no changes**:

- `src/renderer/api/pages/well-known-pages.ts` — both required definitions already exist with the
  correct ids, titles, `log-view` editor, and `jsonl` language.
- `src/renderer/api/mcp/command-registry.ts` and `src/main/mcp/tools/page-tools.ts` — `ui_push` is
  already registered, its `input.*` timeout behavior is verified, and the tool remains until
  EPIC-090; `windowIndex` routing is already owned by the generic MCP bridge.
- `src/renderer/api/types/ui-log.d.ts`, `src/renderer/api/types/index.d.ts`, and
  `src/renderer/api/types/ui.d.ts` — the published global `IUiLog` and modal `IUserInterface`
  typing remain unchanged; no `app.ui.log` type is added.
- `src/renderer/api/ui.ts` and `src/renderer/scripting/api-wrapper/AppWrapper.ts` — the existing
  modal `UserInterface` and its app wrapper remain unchanged; `app.ui` gains no Log View alias.
- `src/renderer/editors/log-view/logTypes.ts`, `logConstants.ts`, `index.ts`, `LogBodyView.ts`,
  `LogEntryContent.ts`, `LogEntryWrapper.ts`, `LogMessageView.ts`, `StyledTextView.ts`, and all
  15 `src/renderer/editors/log-view/items/*` files — existing model/view behavior and names are
  reused; no view action or data-name is added for this task.
- `src/renderer/scripting/api-wrapper/UiFacade.ts` and its `Progress`, `Grid`, `Text`, `Markdown`,
  and `Mermaid` helpers — the writer already performs the Log View mutations and remains the
  single implementation reused by global `ui`; `pages.logView` resolves the same editor.
- `assets/agent/ui-highlight.js`, `src/renderer/scripting/ai-vision/elements.ts`, and
  `src/renderer/scripting/ai-vision/page-elements.ts` — existing overlay, count/highlighted
  reporting, page scoping, and activate-before-highlight behavior are reused unchanged.
- `src/renderer/scripting/ai-vision/dialogs/*` and `src/renderer/ui/dialogs/*` — the modal
  `dialogs` node remains correct for renderer dialogs and is deliberately not widened to inline
  Log View entries.
- `src/renderer/api/types/app.d.ts` — it already exposes `IUserInterface`; changing that nested
  interface is sufficient.
- `src/renderer/editors/base/editor-matchers.ts` and `src/renderer/api/pages/PageModel.ts` —
  `.log.jsonl` matching and page/editor identity behavior already support the requested facade.
- `doc/active-work.md` and `doc/epics/EPIC-087.md` — the dashboard entry and epic task table
  already exist; the dashboard must not be changed.
- Unit tests, test harnesses, `docs/**`, QA scenarios, release notes, and commits — explicitly out
  of scope for this planning task; US-1324 owns acceptance QA and retirement marking.
