# US-1321 - Env vars and archive

Epic: [EPIC-087 - The data editors through `call`, and the retirement of `ui_push`](../../epics/EPIC-087.md)

## Goal

Replace the identity-only `GenericEditorFacade` returned for `env-vars-view` and `archive-view`
pages with two real, page-scoped facades. Each facade will expose a curated element inventory,
visible model state, and only model-backed actions; neither facade will accept a password or secret
value as an argument. This document is a plan only: it does not implement the facades, typings, UI
changes, tests, generated assets, or dashboard changes.

**Status: Implemented 2026-09-06** (review deferred to epic close, per the epic model).

Live verification through `call`: the env-vars page reported `status: "ok"`, one namespace, two
profiles, its two variables with values (matching `page.content`, per decision 7), and
`env-vars-unlock` correctly invisible on an unencrypted file. A test zip answered `archivePath`,
`listEntries()` with both entries, and `openEntry("hello.txt")`, which navigated the page to the
entry's content in Monaco — the same result as clicking it.

One defect was found and fixed by hand: `openTreeItem` had *reimplemented* the click handler's path
derivation instead of moving it, always taking the directory branch (`category/title`) and never
asking `ArchiveTreeProvider.getNavigationUrl`, which returns `item.href` for a file and an encoded
category link for a directory. It also dropped the sidebar's `selectedHref` update and turned the
views' silent guard into a throw inside a `void`-ed click handler. It is now the moved handler:
provider-supplied URL, selection preserved, guard returns.

## Background

`src/renderer/editors/register-editors.ts:13-16,162,165` registers the `archive-tree` secondary
view, `env-vars-view` with `hasContentHost: true`, and `archive-view` without a content host. The
current `FACADE_FOR_EDITOR` map in `src/renderer/scripting/api-wrapper/PageWrapper.ts:52-70` has no
entry for either editor, so `PageWrapper.editor` falls through to `GenericEditorFacade` at
`PageWrapper.ts:151-159`.

The implementation pattern is the recently landed
`src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts:24-165`: declare a static element
list, call `createElements` with a page scope and `activatePageAndWaitForLayout`, merge the
generated `elements` members, return the descriptor, and preserve `id`/`name`. Repeated selectors
must pass `highlightOptions: { all: true }`. The overlay otherwise rings only the first match
(`assets/agent/ui-highlight.js:281-286`), while its result reports total `count` and ring count
`highlighted` (`assets/agent/ui-highlight.js:298-306`; public shape
`src/renderer/api/types/ui.d.ts:133-146`).

UIKit emits `data-name` from `name:` props. Existing source inventories are:

- Env vars: the eight names in `src/renderer/editors/env-vars/EnvVarsBodyView.ts:76-248,403,539-615`.
- Archive: the four main-view names in `src/renderer/editors/archive/ArchiveEditorView.ts:49-62,96`
  and `:113`, plus the two sidebar names in `ArchiveSecondaryView.ts:27,45`.

The env-vars model is authoritative at
`src/renderer/editors/env-vars/EnvVarsEditor.ts:19-27,41-285`. It owns parsed data, status,
selection, profile/namespace CRUD, and serialization. The body view owns the DataGrid editing
buffer and calls `setProfileData` only after validation (`EnvVarsBodyView.ts:270-304,427-464`), so
the facade must not reach into that view buffer.

The archive model is authoritative at
`src/renderer/editors/archive/ArchiveEditor.ts:16-187`. It owns the archive URL, provider,
secondary-view ownership, selection state, and navigation lifecycle. `ArchiveTreeProvider` delegates
listing/navigation to `archiveService` (`src/renderer/content/tree-providers/ArchiveTreeProvider.ts:25-132`),
and `archiveService` already provides copied entry records, listing, reading, and extraction
(`src/renderer/api/archive-service.ts:25-34,139-185,187-227`). The existing view handlers currently
open entries through `app.events.openRawLink` (`ArchiveEditorView.ts:131-147` and
`ArchiveSecondaryView.ts:133-150`); the facade must not call those view handlers. The model will own
the reusable open/list/extract operations, and both views will route their existing click behavior
through the model operation so there is one action path.

`app.boardVars` is a separate existing node at
`src/renderer/scripting/ai-vision/namespaces/board-vars.ts:4-20`. It already exposes the global
store's `get`, `set`, `list`, `listNamespaces`, and `show` operations. US-1321 does not duplicate
that node; the env-vars editor facade describes the currently open page and deliberately omits any
secret-value setter.

## Implementation Plan

### 1. Curate the page-scoped elements

Create one element declaration list per facade. Each row below is a required Curate/Omit decision
with a source-backed reason. Existing names and `data-type` values stay unchanged.

#### Env vars: 8 source names, 8 curated

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `env-vars-grid` | Curate | Locate the editable variable grid for the selected namespace/profile; `EnvVarsBodyView.ts:401-420` supplies the DataGrid and its model-backed validation boundary. |
| `env-vars-profile-tabs` | Curate | Select the visible profile; `EnvVarsBodyView.ts:536-544` binds the control to `EnvVarsEditor.setSelectedProfile`. |
| `env-vars-add-profile` | Curate | Add a profile by name in the selected namespace; `EnvVarsBodyView.ts:546-559,623-627` calls `EnvVarsEditor.addProfile`. |
| `env-vars-delete-profile` | Curate | Delete the selected profile; `EnvVarsBodyView.ts:613-620` calls `EnvVarsEditor.deleteProfile`, which owns confirmation and state mutation. |
| `env-vars-namespace-row` | Curate, repeated once per row | Select a namespace row; `EnvVarsBodyView.ts:165-189` binds each row to `setSelectedNamespace`. The purpose text must say it occurs once per namespace row. |
| `env-vars-add-namespace` | Curate | Add a namespace by name; `EnvVarsBodyView.ts:246-267` calls `EnvVarsEditor.addNamespace`. |
| `env-vars-delete-namespace` | Curate | Delete a namespace and its profiles; `EnvVarsBodyView.ts:173-183` calls `EnvVarsEditor.deleteNamespace`, which owns confirmation and state mutation. |
| `env-vars-unlock` | Curate | Locate the unlock control shown only for a locked encrypted file; `EnvVarsBodyView.ts:52-83` calls the attached host's password-dialog operation without receiving a password from the view. |

Because `env-vars-namespace-row` repeats, `EnvVarsEditorFacade` must pass
`highlightOptions: { all: true }` to `createElements`. Help must explain that `count` is the number
of matching rows and `highlighted` is the number of rings, capped by the existing overlay; a
selector does not identify a namespace index.

#### Archive: 6 source names, 2 curated in the editor facade

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `archive-root` | Omit | Structural loaded-root panel; `ArchiveEditorView.ts:111-119` only applies layout/background attributes. The empty-root branch at `:121-129` is also structural. |
| `archive-toolbar` | Omit | Structural `PageToolbarView` host; `ArchiveEditorView.ts:94-100` supplies toolbar layout and contributions, not an archive operation. |
| `archive-refresh` | Curate | Locate the visible refresh control; `ArchiveEditorView.ts:56-62,145-147` shows it refreshes the view-owned `TreeProviderViewModel`, so the facade exposes the location but no direct view action. `listEntries()` will always read current archive state through the model. |
| `archive-collapse-all` | Curate | Locate the visible collapse control; `ArchiveEditorView.ts:49-55,141-143` sends `collapseAll()` to the view-owned tree model, so no facade method reaches into that unmounted-view-sensitive object. |
| `archive-secondary-view` | Omit from the editor facade | Sidebar secondary-view root; `ArchiveSecondaryView.ts:25-32` owns it. It belongs under `page.panels` in US-1323, per EPIC-086 decision 8 and EPIC-087 decision 10. |
| `archive-secondary-close` | Omit from the editor facade | Sidebar close button; `ArchiveSecondaryView.ts:44-50,146-150` removes the secondary view through the page host. It belongs under `page.panels` in US-1323, not under `page.editor`. |

Thus the editor-facade counts are **8 for env vars** and **2 for archive**. The two archive panel
names are not duplicated: `archive-secondary-view` lands on the archive sidebar panel node under
`page.panels`, and `archive-secondary-close` lands on that same panel's controls in US-1323.

For both facades, use this page-scoped descriptor shape. The `before` code is the current fallback;
the `after` code is the required facade pattern.

Before:

```ts
const factory = editor ? FACADE_FOR_EDITOR[id] : undefined;
return factory ? factory(editor, id, name) : new GenericEditorFacade(id, name);
```

After:

```ts
const factory = editor ? FACADE_FOR_EDITOR[id] : undefined;
return factory ? factory(editor, id, name) : new GenericEditorFacade(id, name);
```

The fallback code remains unchanged; the map gains the two factories. Each new facade's
`aiVision` must instead follow this shape, with its own declarations and members:

```ts
const pageId = this.editor.page?.id;
const elements = createElements(ELEMENTS, ui.highlightElement.bind(ui), {
    scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
    beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
    highlightOptions: { all: true },
});
return {
    kind: "EnvVarsEditor", // or "ArchiveEditor"
    summary: "...",
    members: [...SURFACE_MEMBERS, ...elements.members],
    help: SURFACE_HELP,
    elements: ELEMENTS,
    provide: elements.provide,
    summarize: () => ({ kind: "...", id: this.id, name: this.name }),
};
```

The summary must not include secret values, archive entry contents, or live model objects.

### 2. Add and register the two facades

Create:

- `src/renderer/scripting/api-wrapper/EnvVarsEditorFacade.ts`, wrapping `EnvVarsEditor` and
  implementing the env-vars members, copied snapshots, page-scoped elements, and help.
- `src/renderer/scripting/api-wrapper/ArchiveEditorFacade.ts`, wrapping `ArchiveEditor` and
  implementing archive metadata, copied entry results, page-scoped elements, and help.

Update `src/renderer/scripting/api-wrapper/PageWrapper.ts:24-74` as follows.

Before:

```ts
type EditorFacade =
    | TextEditorFacade | GridEditorFacade | NotebookEditorFacade | RestClientEditorFacade
    | GenericEditorFacade;
```

After:

```ts
import { EnvVarsEditor } from "../../editors/env-vars/EnvVarsEditor";
import { ArchiveEditor } from "../../editors/archive/ArchiveEditor";
import { EnvVarsEditorFacade } from "./EnvVarsEditorFacade";
import { ArchiveEditorFacade } from "./ArchiveEditorFacade";

type EditorFacade =
    | TextEditorFacade | GridEditorFacade | NotebookEditorFacade | RestClientEditorFacade
    | EnvVarsEditorFacade | ArchiveEditorFacade | GenericEditorFacade;

const FACADE_FOR_EDITOR: Record<string, EditorFacadeFactory> = {
    // existing entries...
    "env-vars-view": (editor, id, name) =>
        new EnvVarsEditorFacade(editor as EnvVarsEditor, id as "env-vars-view", name),
    "archive-view": (editor, id, name) =>
        new ArchiveEditorFacade(editor as ArchiveEditor, id as "archive-view", name),
};
```

The concrete factories must be selected only when `mainEditor` exists, as the existing map does;
detached facade instances still report undefined for detached state and throw clear diagnostics
before actions. Preserve the registry `id` and display `name`.

### 3. Create canonical, self-contained public declarations

Create two leaf files under `src/renderer/api/types/`. They must define public snapshots without
importing renderer model types. The implementation facade and declarations must use identical shapes.

`src/renderer/api/types/env-vars-editor.d.ts` should define, at minimum:

```ts
export type IEnvVarsStatus = "ok" | "locked" | "error";

export interface IEnvVarSnapshot {
    readonly name: string;
    readonly value: string;
}

export interface IEnvVarsEditor {
    readonly id: "env-vars-view";
    readonly name: string;
    readonly status: IEnvVarsStatus | undefined;
    readonly encrypted: boolean | undefined;
    readonly unlocked: boolean | undefined;
    readonly errorMessage: string | undefined;
    readonly namespaces: string[] | undefined;
    readonly selectedNamespace: string | undefined;
    readonly profiles: string[] | undefined;
    readonly selectedProfile: string | undefined;
    readonly variables: IEnvVarSnapshot[] | undefined;

    selectNamespace(namespace: string): void;
    selectProfile(profile: string): void;
    addNamespace(name: string): boolean;
    deleteNamespace(name: string): Promise<void>;
    addProfile(namespace: string, name: string): boolean;
    deleteProfile(namespace: string, profile: string): Promise<void>;
    showEncryptionDialog(message?: string): Promise<void>;
}
```

`variables` may contain values because the unlocked page's raw text already contains them; no
security boundary is claimed. The action surface must not include `setProfileData`, `set`, or any
method accepting a variable value. The `app.boardVars` node remains the separate existing path for
deliberate value provisioning and is not widened here.

`src/renderer/api/types/archive-editor.d.ts` should define:

```ts
export interface IArchiveEntry {
    readonly path: string;
    readonly isDirectory: boolean;
    readonly size: number;
    readonly mtime: number;
}

export interface IArchiveEditor {
    readonly id: "archive-view";
    readonly name: string;
    readonly archivePath: string | undefined;
    readonly selectedEntryHref: string | undefined;

    listEntries(): Promise<IArchiveEntry[] | undefined>;
    openEntry(innerPath: string): Promise<void>;
    extractTo(targetDir: string): Promise<void>;
}
```

`targetDir` and an archive-relative `innerPath` are not secret values. `extractTo` must carry a
strong `caution` because it writes the user's disk. No password argument or password member is
allowed. `archive-refresh` and `archive-collapse-all` remain element-only controls because their
handlers operate on the view-owned `TreeProviderViewModel`.

Add both imports and union members to `src/renderer/api/types/page.d.ts:1-37`.

Before:

```ts
import type { IRestClientEditor } from "./rest-client-editor";
export type IEditorFacade =
    | ITextEditor | IGridEditor | INotebookEditor | IRestClientEditor | ILinkEditor /* ... */;
```

After:

```ts
import type { IRestClientEditor } from "./rest-client-editor";
import type { IEnvVarsEditor } from "./env-vars-editor";
import type { IArchiveEditor } from "./archive-editor";
export type IEditorFacade =
    | ITextEditor | IGridEditor | INotebookEditor | IRestClientEditor
    | IEnvVarsEditor | IArchiveEditor | ILinkEditor /* ... */;
```

`assets/editor-types/` is generated by the existing Vite editor-types plugin. Refresh its copies
only through the normal generation path; never hand-edit `assets/editor-types/env-vars-editor.d.ts`,
`assets/editor-types/archive-editor.d.ts`, or `_imports.txt`.

### 4. Apply decision 7 independently to env vars and archive

#### Env vars: the beside-the-facade path returns plaintext after unlock

Evidence:

1. `env-vars-view` is registered with `hasContentHost: true` at
   `src/renderer/editors/register-editors.ts:162`.
2. `PageWrapper.content` returns the attached text host's state content at
   `src/renderer/scripting/api-wrapper/PageWrapper.ts:137-139`.
3. `EnvVarsEditor.adoptHost()` parses `host.state.get().content` at
   `EnvVarsEditor.ts:54-92`; `loadData()` places parsed values into `state.data` at `:117-133`.
4. The schema explicitly says every value is a string and may be a connection string, API key, or
   password (`src/renderer/api/board-vars/types.ts:4-17`). There is no per-field secret/encrypted
   marker. Encryption applies to the whole text file through `TextFileModel` and its
   `DecryptTransformer`, not to individual fields.
5. When `host.encrypted && !host.decrypted`, `loadData()` reports `status: "locked"` and returns
   before parsing (`EnvVarsEditor.ts:96-103`); the body shows the encrypted message and
   `env-vars-unlock` (`EnvVarsBodyView.ts:52-83`). Unlock delegates to the host's password dialog,
   whose decrypt path stores the plaintext in host state and the in-memory transformer
   (`TextFileEncryptionModel.ts:98-141`; `DecryptTransformer.ts:5-22`).
6. The BoardEnvStore confirms the storage boundary: it reads the configured file, prompts only for
   a password when the content is encrypted, parses plaintext into `parsed`, and re-encrypts on
   save through the pipe (`src/renderer/api/board-vars/BoardEnvStore.ts:20-30,88-109,125-146`).
   No keystore is used by this path; the password is in memory and explicitly non-persistent.

Decision: there is no enforceable redaction boundary on an unlocked env-vars page. The facade may
return copied `name` and `value` snapshots because the same page's `page.content` already returns
the plaintext JSON. It must state that it makes no secret-redaction claim. While `status ===
"locked"`, the facade must not map stale `state.data` into public variables: return no parsed
names/profiles/values for that branch and expose the lock status instead. If a file is unencrypted,
values are plaintext on disk and in page text; if encrypted, ciphertext is on disk while unlocked
plaintext is in page text, the editor model, and the in-memory decrypt transformer.

No member accepts a value, password, or encryption key. `showEncryptionDialog(message?)` must use
that exact name and return `Promise<void>`, matching `TextEditorFacade.ts:38`. It may open the
existing button/cancel-only password dialog through the model's attached host, but it never receives
or returns the password. Although the view currently wraps the host call in `void`
(`EnvVarsBodyView.ts:79-81`), the facade action must await it: `call` reports a renderer dialog as
`pending: true` with the dialog named in `attention`, and the agent resolves it through
`dialogs[0]`. Fire-and-forget would discard that pending/attention result. `restricted()` is not
used: it would not create a page-level boundary over `page.content`, and would unnecessarily hide
useful lock/status information.

#### Archive: no password path exists in the current model

Evidence:

1. `archive-view` is registered without `hasContentHost` at
   `src/renderer/editors/register-editors.ts:165`; `PageWrapper.content` therefore returns `""`
   for this non-text editor (`PageWrapper.ts:137-139`). No raw archive bytes or entry contents are
   beside the facade through page text.
2. `ArchiveEditor` stores only `archiveUrl` and an `ArchiveTreeProvider`
   (`ArchiveEditor.ts:16-44,76-95`). There is no password, encryption, or keystore field.
3. `ArchiveTreeProvider` and `archiveService` accept only archive paths/entry paths; listing uses
   libarchive-wasm (`ArchiveTreeProvider.ts:20-25,40-45`; `archive-service.ts:62-84,139-142`), and
   extraction uses the same reader with zip-slip protection (`archive-service.ts:144-185`). No
   password argument or encrypted-archive handling exists.

Decision: expose entry metadata and the selected entry href, plus model-backed `openEntry` and
`extractTo`; do not expose archive bytes, entry contents, archive mutation, or any password API.
The absence of archive bytes in `page.content` is a facade scope decision describing what this page
shows, not a security boundary: `app.fs` can still read files from the user's disk. A
password-protected archive is not unlocked by this surface: current reader behavior is allowed to
fail, and the error is returned by the model operation. No `restricted()` boundary is needed for a
password value because the model does not hold one and `page.content` is empty; help must not imply
that encrypted archives are supported.

### 5. Implement the absent-value audit explicitly

`strictNullChecks` is off, so the compiler will not catch false/zero/empty/null stand-ins. The only
absence rules for these two facades are below. Every getter and the `listEntries()` result must be
implemented and documented to match them.

| Surface/value | Attached page, real empty state | Detached/no loaded state |
| --- | --- | --- |
| Env `status` | Real model status: `"ok"`, `"locked"`, or `"error"`. | `undefined` when `editor.page === null`. |
| Env `errorMessage` | Actual parse error when present; otherwise `undefined`. | `undefined`. |
| Env `namespaces` | When `status === "ok"`, a fresh array with `[]` for zero namespaces; `undefined` while locked/error because parsed data is unavailable. | `undefined`. |
| Env `selectedNamespace` | When `status === "ok"`, a fresh string when selected or `undefined` for the model's empty selection sentinel; `undefined` while locked/error. | `undefined`. |
| Env `profiles` | When `status === "ok"`, a fresh array with `[]` when no namespace/profile is selected; `undefined` while locked/error. | `undefined`. |
| Env `selectedProfile` | When `status === "ok"`, a fresh string when selected or `undefined` for the model's empty selection sentinel; `undefined` while locked/error. | `undefined`. |
| Env `variables` | When `status === "ok"`, fresh `{ name, value }` objects and `[]` for a selected profile with zero variables or no selected profile; `undefined` while locked/error. | `undefined`. |
| Env `encrypted`/`unlocked` | Real host encryption booleans when the attached text host exists; never a password or redaction marker. | `undefined`. |
| Archive `archivePath` | Real archive path when loaded. | `undefined` with no page host or no loaded archive. |
| Archive `selectedEntryHref` | Real selected href; `undefined` when no entry is selected. | `undefined`. |
| Archive `listEntries()` | Promise of fresh entry snapshots; `[]` for a loaded empty archive. | Promise of `undefined` when detached or no archive is loaded. I/O errors remain errors, not empty archives. |

Never return `false`, `0`, `""`, or `null` as an absence marker. In particular, map the model's
env selection strings and archive `selectedHref: null` to `undefined`, while preserving real empty
arrays and real booleans/numbers. A locked env-vars page must report `status: "locked"` and return
`undefined` for parsed namespaces, profiles, and variables; it must not leak a previous parsed
`state.data` object retained by `loadData()` after it changes to `status: "locked"`. An attached
`status: "ok"` page with zero variables reports a real `variables: []`, so locked is distinguishable
from empty. An `"error"` status reports the actual parse failure through `errorMessage` and does not
project stale parsed collections.

The `$help` text must name all three model statuses from `EnvVarsEditor.ts:25`: `"ok"` means the
parsed data is available, `"locked"` means the encrypted file is awaiting the password dialog and
all parsed collection/profile/variable getters are `undefined`, and `"error"` means parsing failed
and `errorMessage` carries the model's actual failure text. It must explicitly distinguish a locked
page from an attached, valid page whose empty collection/profile/variable getters return `[]`.

All arrays and objects returned by either facade are copies. Env snapshots copy namespace/profile
name arrays and each variable record; archive snapshots copy every `ArchiveEntry` field. Do not
return `state.data`, a profile record, `selectionState`, `treeProvider`, or service arrays directly.

### 6. Keep every action model-backed

Env-var actions and their sources:

| Facade action | Model path | Caution/decision |
| --- | --- | --- |
| `selectNamespace(namespace)` | `EnvVarsEditor.setSelectedNamespace()` at `EnvVarsEditor.ts:169-175`. | Selection only; validate the namespace exists so the facade cannot silently select a nonexistent row. |
| `selectProfile(profile)` | `EnvVarsEditor.setSelectedProfile()` at `:177-181`. | Selection only; validate against the selected namespace's profiles. |
| `addNamespace(name)` | `EnvVarsEditor.addNamespace()` at `:230-241`. | Return its boolean result; caution `changes environment-variable structure`. |
| `deleteNamespace(name)` | `EnvVarsEditor.deleteNamespace()` at `:243-262`. | Await its model-owned confirmation; caution `deletes environment namespaces and profiles`. |
| `addProfile(namespace, name)` | `EnvVarsEditor.addProfile()` at `:198-208`. | Return its boolean result; caution `changes environment-variable structure`. |
| `deleteProfile(namespace, profile)` | `EnvVarsEditor.deleteProfile()` at `:210-226`. | Await its model-owned confirmation; caution `deletes an environment profile and its variables`. |
| `showEncryptionDialog(message?)` | Attached host `showEncryptionDialog()` as used by `EnvVarsBodyView.ts:79-81`; guard that the facade is attached and locked. | Return `Promise<void>` and await the existing password dialog; caution that it opens a button/cancel-only password dialog and can decrypt the visible file. It accepts/returns no password. |

Do not expose `setProfileData(namespace, profile, record)` (`EnvVarsEditor.ts:185-194`): its
`record` can contain passwords/API keys and would copy them into call arguments and the MCP
transcript. Do not expose DataGrid callbacks, `focus`, or any view-local buffer operation. Detached
actions must throw a clear `Environment variables action unavailable: no page host attached.`
diagnostic before mutating. A valid action must not queue work against an unmounted view.

Archive actions require small model additions in `ArchiveEditor.ts`:

| Facade action | Model path to add/use | Caution/decision |
| --- | --- | --- |
| `listEntries()` | Add an `ArchiveEditor.listEntries()` wrapper over `archiveService.listEntries(this.archiveUrl)` after checking page/archive availability. | Read-only; fresh copies; no view access. |
| `openEntry(innerPath)` | Add a model-owned navigation operation using `ArchiveTreeProvider.getNavigationUrlByHref()` (`ArchiveTreeProvider.ts:117-127`), update `selectionState`, and send `app.events.openRawLink` with the page/source ids, mirroring current view behavior. | Opens a page for the selected archive entry; no password or entry content argument. |
| `extractTo(targetDir)` | Add a model-owned wrapper over `archiveService.extractTo()` (`archive-service.ts:149-185`). | Mandatory `caution`: extracts archive entries and writes the user's disk; preserve existing zip-slip protection. |

This is a move of the existing code path, not a fresh reimplementation: the model navigation
operation is the handler body currently in `ArchiveEditorView.ts:131-147` and the equivalent body
in `ArchiveSecondaryView.ts:133-150`. Move that behavior into the model, then have both views call
the model operation so exactly one path serves UI clicks and facade `openEntry` calls. The model
should also expose an internal/public tree-item adapter or accept the existing item href. Those
views must stop calling `app.events.openRawLink` directly; the facade must never query either view
or `TreeProviderViewModel`. `archive-refresh` and
`archive-collapse-all` stay element-only because their current handlers (`ArchiveEditorView.ts:141-147`)
operate on a mounted view model and cannot safely be queued when the view is absent.

Before (view-owned navigation):

```ts
const url = provider?.getNavigationUrl(item) ?? item.href;
void app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: this.model.id }));
```

After (model-owned navigation):

```ts
void this.model.openTreeItem(item);
```

The exact helper name may be `openTreeItem`; it must delegate to the same model operation used by
facade `openEntry` and preserve selection/source/page behavior. No action is allowed to invoke
`treeModel`, `collapseAll`, `buildTree`, or any other view component method.

### 7. Record the UIKit name-update warning

UIKit views delete `data-name` when a later `update()` omits `name`: `ButtonView.ts:97-105` does
`delete this.root.dataset.name` for an undefined `name`, and `panel-style.ts:303-331` includes
`name` in the same delete-on-undefined attribute pass. Before adding or changing any name, inspect
every construction, conditional branch, keyed-row update, and re-render call site. Any added
`name:` must be supplied at **every** update call site for that view, not only at construction. No
new UI name is expected for this task; the existing eight env names and six archive names must be
preserved exactly.

### 8. Verification scope after implementation

Source review must verify all 14 curation decisions, the 8/2 curated counts, page-scoped selectors,
`all: true` for the repeated namespace row, panel ownership, the separate `app.boardVars` node,
locked-env stale-data suppression, full-value behavior after unlock, archive no-password behavior,
fresh copies, absent-value semantics, and model-only actions. Run the normal typecheck/lint and the
existing Vite type-copy path as appropriate. Do not add unit tests or test harnesses for this task,
do not hand-edit generated assets, do not change the dashboard, and do not commit.

## Concerns

- **Env values are not redacted by this facade.** The schema marks every value as potentially
  sensitive but has no per-field marker. Once unlocked, plaintext JSON is in the text host and
  `page.content`; a facade-level redaction would be a false guarantee. Values are copied on return,
  but not hidden. While locked, stale parsed model data must be suppressed.
- **Password storage is in memory only.** The env-file password is held by the text model/its
  private decrypt transformer and is not persisted in the content or a keystore. No facade member
  accepts or returns it.
- **Archive boundary is scope, not security.** `page.content` is empty and the facade does not
  expose archive bytes or entry contents, but `app.fs` can read the user's disk. This facade
  describes the archive page's visible/model-backed surface; it does not claim to protect the file.
- **Archive encryption is unsupported by this model.** The source has no password state or
  password-taking archive reader. Do not add an invented password API; report service errors.
- **Archive extraction writes the user's disk.** `extractTo` needs a strong caution and must use
  the existing zip-slip guard. Archive mutation beyond extraction is omitted.
- **Archive open-path drift is a review risk.** If the model operation is written beside the old
  handlers instead of moving them, UI clicks and facade `openEntry` calls can diverge and only one
  path may be exercised. Source review must verify that both views and the facade use the moved
  model operation.
- **View-local controls remain locations only.** Refresh/collapse are useful elements, but their
  current tree-model handlers are not safe facade actions. Sidebar controls belong to `page.panels`.
- **Absent values are a manual review obligation.** `strictNullChecks` is disabled. Empty attached
  arrays must stay `[]`; empty selection sentinels and `null` selected archive hrefs become
  `undefined`; no absence is represented by `false`, `0`, `""`, or `null`.
- **Generated declarations are not hand-edited.** Canonical leaf declarations live under
  `src/renderer/api/types/`; `assets/editor-types/` is generated.
- **No implementation side effects in this task.** Unit tests, test harnesses, dashboard edits,
  user documentation, and commits are explicitly out of scope.

## Acceptance Criteria

- [ ] `pages[i].editor` on an `env-vars-view` page returns `EnvVarsEditorFacade`, and on an
      `archive-view` page returns `ArchiveEditorFacade`, with preserved `id`/`name` metadata.
- [ ] The source inventory contains exactly the eight env names and six archive names listed above;
      every name has a Curate/Omit decision and a one-line source-backed reason.
- [ ] Exactly 8 env controls and 2 archive editor controls are curated; all selectors are scoped
      below `[data-page-id="<id>"]`, and `env-vars-namespace-row` says "once per row".
- [ ] Both facades pass `highlightOptions: { all: true }`; help documents `count` versus
      `highlighted` for repeated namespace rows.
- [ ] `archive-secondary-view` and `archive-secondary-close` are absent from the editor facade,
      explicitly cross-referenced to `page.panels`/US-1323, with ownership stated for both.
- [ ] Env state reports copied namespace/profile/variable snapshots, the three explicit statuses
      (`"ok" | "locked" | "error"`), encryption visibility, and parse errors through
      `errorMessage`; after unlock it does not claim redaction because `page.content` already
      contains the plaintext JSON. Locked state reports `status: "locked"`, returns
      `variables: undefined` (and no parsed collections/profiles), and cannot expose stale parsed
      values; valid empty state reports real `[]` values.
- [ ] Archive state reports copied archive metadata and selected entry href; `listEntries()` returns
      `[]` for a loaded empty archive and `undefined` only when detached/unloaded, without returning
      live provider/service objects.
- [ ] Every getter and list result passes the absent-value audit; attached empty arrays and genuine
      booleans/numbers remain real values, while empty selection/null sentinels become `undefined`.
- [ ] No member accepts a password, token, variable value, archive content, or other secret value.
      `app.boardVars` remains the separate existing value-capable node and is not duplicated.
- [ ] Env CRUD/`showEncryptionDialog(message?)`, archive listing/opening/extraction, and view click
      routing are model-backed; the dialog action returns/awaits `Promise<void>` so renderer-dialog
      calls preserve `pending: true`/`attention` handling; no action reaches into a view, tree view model, clipboard, menu, or unmounted queue.
- [ ] Opening an archive entry from either UI tree and through facade `openEntry` uses the same
      moved model operation; the old duplicate handler paths are removed.
- [ ] `extractTo` carries a disk-write caution; opening an archive entry is exposed as a real action;
      refresh/collapse are element-only and archive password handling is explicitly unsupported.
- [ ] Canonical self-contained `env-vars-editor.d.ts` and `archive-editor.d.ts` declarations are
      added to `IEditorFacade`; generated assets are refreshed only by Vite.
- [ ] UIKit's delete-on-omitted-name warning is recorded and any future added `name:` is supplied
      at every construction/update/re-render call site; no existing name/type is renamed.
- [ ] No dashboard, unit test, test harness, hand-edited generated asset, user-documentation change,
      or commit is created by this task.

## Files Changed

| File | Planned change |
| --- | --- |
| `doc/tasks/US-1321-env-vars-and-archive/README.md` | This verified two-facade plan, 14-name curation table, separate decision-7 evidence, absent-value audit, model-action decisions, concerns, acceptance criteria, and file scope. |
| `src/renderer/scripting/api-wrapper/EnvVarsEditorFacade.ts` | New page-scoped env-vars facade with 8 elements, repeated-row highlighting, copied state, safe CRUD/selection/`showEncryptionDialog(message?)` action, and no secret setter. |
| `src/renderer/scripting/api-wrapper/ArchiveEditorFacade.ts` | New page-scoped archive facade with 2 editor elements, copied archive state/entry results, model-backed open/list/extract actions, and extraction caution. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Import/register both facade classes in the private editor union and `FACADE_FOR_EDITOR` map. |
| `src/renderer/api/types/env-vars-editor.d.ts` | New canonical self-contained env-vars snapshots, state, and action declarations. |
| `src/renderer/api/types/archive-editor.d.ts` | New canonical self-contained archive entry, state, and action declarations. |
| `src/renderer/api/types/page.d.ts` | Import `IEnvVarsEditor`/`IArchiveEditor` and add both to `IEditorFacade`. |
| `src/renderer/editors/archive/ArchiveEditor.ts` | Add model-owned entry listing, entry opening/navigation, selection synchronization, and extraction wrappers over existing provider/service operations. |
| `src/renderer/editors/archive/ArchiveEditorView.ts` | Route main-tree item clicks through the archive model operation instead of directly invoking the event channel. |
| `src/renderer/editors/archive/ArchiveSecondaryView.ts` | Route sidebar-tree item clicks through the same model navigation operation instead of owning a second open path. |

Files intentionally needing **no changes**:

- `src/renderer/editors/env-vars/EnvVarsEditor.ts`, `src/renderer/editors/env-vars/EnvVarsBodyView.ts`,
  `src/renderer/editors/env-vars/open-env-vars.ts`, and `src/renderer/editors/env-vars/index.ts` -
  existing env model state/CRUD, host unlock path, view names, and module registration are sufficient;
  no variable-value setter or new UI name is planned.
- `src/renderer/scripting/ai-vision/namespaces/board-vars.ts` and
  `src/renderer/api/board-vars/BoardEnvStore.ts` - separate existing `app.boardVars` storage node;
  cross-reference only, never duplicate or modify it.
- `src/renderer/editors/archive/ArchiveEditorView.ts` and `ArchiveSecondaryView.ts` are listed above
  only for click-routing changes; their existing names, panel ownership, and tree rendering remain.
- `src/renderer/editors/archive/index.ts` and `src/renderer/editors/register-editors.ts` - archive
  module/editor registration and `archive-view`/`archive-tree` registration already exist.
- `src/renderer/content/tree-providers/ArchiveTreeProvider.ts` and
  `src/renderer/api/archive-service.ts` - existing list/navigation/extract behavior is reused by
  the model wrappers; no password support or archive mutation expansion is planned.
- `src/renderer/scripting/api-wrapper/GenericEditorFacade.ts` - remains the fallback for editors
  without a dedicated facade.
- `src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts` and
  `src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts` - facade and repeated-highlight
  patterns only; no REST/notebook changes belong here.
- `src/renderer/scripting/ai-vision/elements.ts` and
  `src/renderer/scripting/ai-vision/page-elements.ts` - existing page scoping, visibility, layout
  activation, and highlight plumbing supplies the behavior.
- `assets/agent/ui-highlight.js`, UIKit primitive files, and
  `src/renderer/uikit/Panel/panel-style.ts` - existing overlay and data-name contract are reused;
  do not modify them.
- `vite.renderer.config.ts`, `assets/editor-types/env-vars-editor.d.ts`,
  `assets/editor-types/archive-editor.d.ts`, and `assets/editor-types/_imports.txt` - generated
  output only; never hand-edit assets.
- `doc/active-work.md` and `doc/epics/EPIC-087.md` - the dashboard/epic task link already exists;
  the user explicitly said not to change the dashboard, and this task records the verified decision
  in its own document.
- Unit tests, test harnesses, `docs/**`, release notes, and commits - explicitly out of scope.
