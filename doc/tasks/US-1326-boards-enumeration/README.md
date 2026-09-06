# US-1326 - The `boards` node completes: enumeration of installed, trusted and open boards

**Status:** Implemented  
**Epic:** [EPIC-088 - Boards and tools through `call`, and the retirement of seven tools](../../epics/EPIC-088.md)  
**Started:** 2026-09-06

## Goal

Make `boards` discoverable on a new machine by adding one read-only `boards.list()` member that
returns the merged local inventory: trusted roots, catalog-installed roots and the page ids of
currently open boards. An agent can use the returned root with the existing `boards.openBoard(root)`
member, so the existing create/open replacement surface works end to end without adding aliases or
touching the legacy MCP tools.

## Background

### Current descriptor and registration

`src/renderer/scripting/ai-vision/namespaces/boards.ts:4-18` currently declares exactly fourteen
members. The descriptor supplies those static members, two remote catalog URL properties, and a
fixed lifecycle help string at `:21-34`; it has no `children()`, `index()`, or local enumeration
member. The object is registered for the singleton at
`src/renderer/scripting/ai-vision/namespaces/index.ts:30-44`, specifically
`registerAiVisionFor(boards, describeBoards)` at `:39`.

The sibling descriptors establish the relevant split: `editors` exposes a static member list and a
summary over its registry at `src/renderer/scripting/ai-vision/namespaces/editors.ts:4-21`, while
the side-effect-free dynamic pattern is used by `PageCollectionWrapper` at
`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:80-113` and by `page.panels` at
`src/renderer/scripting/ai-vision/page-panels.ts:320-323`. `IAiVisionDescriptor.children()` is
explicitly dynamic and side-effect-free, while `index()` and `provide()` are the supported
instance seams at `src/shared/ai-vision/types.ts:57-86`. The resolver discovers only advertised
members and dynamic children, and invokes only the requested member at
`src/shared/ai-vision/resolver.ts:106-146` and `:184-186`.

### Existing board API and the decision not to add aliases

The public `IBoards` contract lives at `src/renderer/api/types/boards.d.ts:84-239`. The existing
create members return the created root string (`:96`, `:107`), and `openBoard(boardRoot)` returns
`Promise<void>` (`:120`). The implementation delegates create/create-demo to the shared scaffold
at `src/renderer/api/boards.ts:35-41`, wires the two existing members at `:59-61`, validates the
manifest and opens through the canonical `persephone-board://` link pipeline at `:62-72`.

EPIC-088 decision 3 therefore governs this task: `create_board` and `open_board` are already
answered by `boards.createBoard`, `boards.createDemoBoard`, and `boards.openBoard`; do not add
`boards.create`, `boards.open`, or any other aliases. The only missing capability is finding a root
before calling those methods. The legacy handlers prove the distinction in their response wrappers:
`handleCreateBoard` wraps the existing create return as `{ boardRoot }` at
`src/renderer/api/mcp/board-commands.ts:16-29`, and `handleOpenBoard` derives `{ opened, pageId,
title }` after calling the void API member at `:31-46`. The tool declarations remain untouched at
`src/main/mcp/tools/board-tools.ts:10-25`.

### Chosen one-call listing shape

Add one member, `boards.list()`, rather than three separately required calls. Its exact public
return shape is:

~~~ts
export interface BoardListing {
    /** Absolute board root; the value accepted by boards.openBoard(). */
    readonly root: string;
    /** Optional metadata copied from board-manifest.json. */
    readonly name?: string;
    readonly description?: string;
    /** True when the root is covered by a trusted registry path. */
    readonly trusted: boolean;
    /** Present only when the local catalog install registry has this root. */
    readonly installed?: {
        readonly id: string;
        readonly version: string;
        /** True/false when the already-loaded local catalog can answer; undefined means unknown. */
        readonly updateAvailable?: boolean;
        /** Present only when updateAvailable is true. */
        readonly latestVersion?: string;
    };
    /** All current page ids running this root; [] means no page is open. */
    readonly openPageIds: string[];
}

list(): Promise<BoardListing[]>;
~~~

The result is one record per normalized root in the union of the trusted registry, install
registry, and open board pages. It deliberately keeps source status in one record: `trusted` is a
real boolean, `installed` is an absent optional value when there is no install entry, and
`openPageIds` is a real empty array when the board has no open page. A trusted-only board and an
installed-but-untrusted board are therefore both visible in one response. Open pages are grouped
by root so two tabs for one board produce two ids, not duplicate board records.

`list()` is a **local machine inventory** and never touches the network. It must not search the
published catalog for additional boards. For an installed local record, `getBoardUpdate(root)`
may add an update annotation from the already-loaded in-memory catalog; if that catalog is not
loaded, `updateAvailable` is `undefined` (unknown), not a fabricated `false`. In contrast,
`searchPublished()` remains the
**remote published-board catalog** search, already implemented at
`src/renderer/api/boards.ts:175-208`; it may return boards that are not installed locally. The
descriptor summaries for `boards`, `list`, `searchPublished`, `getPublishedVersions`, and
`checkPublishedUpdates` must repeat this local-versus-remote distinction so an agent cannot confuse
catalog discovery with machine inventory. `getPublishedVersions()` is also remote and currently
returns `[]` when no version history is available, as documented at
`src/renderer/api/types/boards.d.ts:176-190`.

### Local sources and identity rules

The trust registry is a path-keyed `TGlobalState` with an initially empty `paths` array at
`src/renderer/api/board-trust.ts:42-44`. Its `load()` is lazy and currently calls
`fs.prepareDataFile()` before reading at `:46-55`; `listPaths()` is synchronous and is documented
to be used only after loading at `:63-65`. Trust is ancestor-aware through `isTrusted()` at
`:57-61`, and the registry explicitly never reads trust from a board manifest, as stated in the
module contract at `:1-18`. The existing custom-editor registry confirms that trusted roots are
enumerated directly, without a subtree walk, at
`src/renderer/editors/board/custom-editor-registry.ts:102-110`.

The install registry is independent of trust. `InstalledBoardEntry` is exactly `{ id, root,
version, installedAt, lastNotifiedVersion? }` at `src/renderer/api/board-install-registry.ts:24-36`.
Its lazy `load()` prepares `installedBoards.json`, parses it, verifies each root with
`isBoardFolder()`, prunes stale entries, updates reactive state and may persist the pruned list at
`:47-64`; its synchronous `listInstalled()` and `getByRoot()` are at `:117-128`. Downloading a
published board records an installed entry but explicitly trusts nothing at
`src/renderer/api/board-install.ts:39-80`; trust remains a separate consent step.

The published catalog model is remote catalog data only: its module header says it performs no
download/install work at `src/renderer/api/published-boards.ts:1-10`, `load()` pulls the catalog
and updates its reactive state at `:46-67`, and `getCatalog()` exposes the current catalog at
`:85-86`. Update detection is already centralized in `src/renderer/api/board-updates.ts:23-60`:
`getBoardUpdate(root)` returns `null` when the root is not a catalog install, there is no compatible
newer catalog version, or the installed version is current; `listBoardUpdates()` maps installed
entries through that same calculation at `:63-70`. The implementation must extract/reuse this
comparison logic directly: `boards.list()` must call `getBoardUpdate(root)` against the loaded
in-memory models, not add a catalog-fetch seam or a second version comparison. A read-only loaded
state flag may be exposed by `published-boards.ts` so an unloaded catalog produces `undefined`
while a loaded catalog with no update produces `false`; that flag is local observation only, not a
remote read API.

Board identity is the presence of `board-manifest.json`: `BoardManifest` contains optional
descriptive `name`, `description`, and `version` fields at
`src/renderer/editors/board/board-manifest.ts:36-62`; `isBoardFolder()` checks the identity file
at `:134-146`, and `readBoardManifest()` returns `null` for absent or unparseable metadata at
`:149-162`. The listing may keep a registry root whose manifest has become invalid so the agent
can see the stale local record, but it must expose absent metadata as `undefined` and must never
infer trust from that metadata.

### Open-page detection and the existing facade

Both plain board pages and custom-editor board pages are board pages. The existing
`boardPagesForRoot(root)` helper already scans `app.pages.pages`, filters
`mainEditorInstance instanceof BoardEditorModel`, guards a non-empty `boardRoot`, and compares
through `fpNormalizeForCompare` at `src/renderer/api/board-updates.ts:72-80`; the inherited
`BoardContentEditorModel` is therefore covered by `BoardEditorModel` (`BoardContentEditorModel.ts:26`).
Export that helper, or lift its single canonical page predicate into a shared helper that both
`boardPagesForRoot` and enumeration call. Do not write a second `isBoardEditorId()`/editor scan.
`isBoardEditorId()` still documents the accepted page ids, `board-view` and `board-editor:<root>`, at
`src/renderer/editors/board/custom-editor-registry.ts:210-216`; page ids are stable identities on
`PageModel` at `src/renderer/api/pages/PageModel.ts:57-60`.

US-1325 already exposes the authoritative root through `BoardEditorFacade.boardRoot` at
`src/renderer/scripting/api-wrapper/BoardEditorFacade.ts:62-99`; it reads the model's
`state.boardRoot`, returning `undefined` before a root is attached. `PageWrapper.editor` selects
that facade for `board-view` and the dynamic `isBoardEditorId()` fallback at
`src/renderer/scripting/api-wrapper/PageWrapper.ts:173-184`; the board factory and static
registration are at `:68-95`. The new enumeration must reuse this contract/source field: do not
parse a `board-editor:<root>` id, infer a root from a title, or duplicate a facade field. The API
layer can read the same `BoardEditorModel.boardRoot` field through the exported/lifted
`boardPagesForRoot(root)` helper, because importing a scripting facade into `api/` would violate
the layer direction documented by the architecture overview.

### Lazy loading and the no-side-effects rule

The renderer starts published-catalog and install-registry loads fire-and-forget during app service
initialization at `src/renderer/api/app.ts:179-190`, while trust is also initialized by the custom
editor registry at `src/renderer/editors/register-editors.ts:222`. Those startup loads are not a
safe reason for a descriptor read to trigger another load. In particular, `boardTrust.load()` can
create the missing trust data file (`board-trust.ts:46-48`), and `boardInstallRegistry.load()` can
write a pruned registry (`board-install-registry.ts:47-64`).

The implementation must use one current-source rule for both `list()` and `children()`: start with
the in-memory `boardTrust.listPaths()` and `boardInstallRegistry.listInstalled()` snapshots,
hydrated during startup at `src/renderer/api/app.ts:179-190` and
`src/renderer/editors/register-editors.ts:222`. If either in-memory list is empty while its
startup hydration has not supplied data, `list()` may use that registry's extracted, read-only
parse of `fs.getDataFile()` for this call only; it must never call `prepareDataFile()`,
`state.update()`, or any state-writing method. `children()` is synchronous and awaits nothing, so
it uses the same in-memory source snapshots (and any already-available read-only snapshot), never
disk I/O or a loader. `fs.getDataFile()` only reads and returns `undefined` when the data file is
absent at `src/renderer/api/fs.ts:516-517`; the separate write-capable `prepareDataFile()` is at
`:525-529`. `list()` must not fetch or refresh the remote catalog: it observes its loaded state and
calls `getBoardUpdate(root)` directly. This keeps discovery local, offline-safe, and side-effect
free. The `children()` contract follows the `page.panels` help promise at
`src/renderer/scripting/ai-vision/page-panels.ts:323`.

Reading manifests with `isBoardFolder()` / `readBoardManifest()` is permitted because both are
read-only identity/metadata operations (`board-manifest.ts:134-162`). Enumeration must never call
`createBoardFromTemplate`, `downloadBoard`, `registerBoard`, `openBoard`, or a board iframe/page
constructor. The create implementation's disk/trust writes are at
`src/renderer/editors/board/board-scaffold.ts:45-72`; `registerBoard` shows the trust dialog before
writing at `src/renderer/api/boards.ts:78-91`; and the published download path is explicitly inert
until separate registration (`board-install.ts:39-80`).

## Implementation Plan

### 1. Add the public listing types and API member

Update `src/renderer/api/types/boards.d.ts`:

- Add `BoardListing` with the exact shape above.
- Add `list(): Promise<BoardListing[]>` to `IBoards` before the published-catalog section.
- Document that this is a local machine inventory, that `installed` is absent when the root has no
  install-registry entry, that `openPageIds` is `[]` when no matching page is open, and that
  update availability is a known compatible newer version from the remote catalog.
- Keep `BoardListing` free of `EditorModel`, `PageModel`, DOM, or facade types.

Before:

~~~ts
    renameBoard(boardRoot: string, newName: string): Promise<string>;

    // Published catalog
    searchPublished(query?: string): Promise<PublishedBoardResult[]>;
~~~

After:

~~~ts
    renameBoard(boardRoot: string, newName: string): Promise<string>;

    /** One-call local inventory; does not discover remote catalog boards. */
    list(): Promise<BoardListing[]>;

    // Published catalog (remote)
    searchPublished(query?: string): Promise<PublishedBoardResult[]>;
~~~

The generated `assets/editor-types/boards.d.ts` copy must be regenerated by the normal editor-types
build flow, not hand-edited, following the generated-copy rule already used for the facade types in
`doc/tasks/US-1325-board-page-surface/README.md`.

### 2. Add non-mutating registry/catalog snapshots and reuse update logic

Update `src/renderer/api/board-trust.ts` with a read-only method such as
`readPaths(): Promise<string[]>`. First extract the existing trim/filter parsing into one pure
function, then have both `load()` and `readPaths()` call that function. `readPaths()` must read
`trustedBoards.txt` with `fs.getDataFile()` and return a fresh array without preparing the file or
updating `TGlobalState`. Extract the ancestor-aware path predicate used by `isTrusted()` so the
enumerator can calculate inherited trust from this returned snapshot without depending on whether
the mutable registry state has finished hydrating. Leave `trust()`, `untrust()`, `load()`, and the
user-dialog path unchanged apart from sharing the parser/predicate.

Update `src/renderer/api/board-install-registry.ts` with a read-only method such as
`readInstalled(): Promise<InstalledBoardEntry[]>`. First extract the existing JSON validation and
entry parsing into one pure parser, then have both `load()` and `readInstalled()` call that parser.
The read-only path must check each root with `isBoardFolder()`, return only live board entries in a
fresh array, and never call `prepareDataFile()`, `state.update()`, `record()`, or `persist()`.
Keep `load()`'s existing reactive/pruning behavior for UI and lifecycle callers; the new method is
not a parallel copy of the format parser. Expose a loaded-state observation if the update path
needs to distinguish a loaded empty registry from a temporary read-only fallback.

Update `src/renderer/api/published-boards.ts` only if needed to expose a synchronous read-only
loaded-state flag for the already-held catalog. Do not add a remote snapshot/fetch seam: the
enumeration must never request the catalog or refresh this model. The existing in-memory catalog
is consumed through `getBoardUpdate(root)` directly; an unloaded catalog yields
`updateAvailable: undefined`, while a loaded catalog with no compatible update yields `false`.

Refactor `src/renderer/api/board-updates.ts` only to export or lift the existing
`boardPagesForRoot(root)` scan for reuse, preserving its `BoardEditorModel`/`boardRoot`/
`fpNormalizeForCompare` behavior at `:72-80`. Keep `getBoardUpdate()` and `listBoardUpdates()` as
the update paths; `boards.list()` calls `getBoardUpdate(root)` directly when the install and
catalog state is loaded, and otherwise reports `updateAvailable: undefined`. Do not add a remote
catalog seam or duplicate semver logic.

### 3. Implement the one-call local inventory in `src/renderer/api/boards.ts`

Add `list()` to the `boards` object and keep all existing fourteen implementations unchanged.
Build the result as follows:

1. Read the in-memory trust and install snapshots first. If either registry list is empty, the
   async `list()` path may use that registry's extracted read-only `fs.getDataFile()` parse as a
   temporary fallback; never call `prepareDataFile()`, mutate reactive state, or fetch the remote
   catalog. The API-layer source helper may retain that temporary snapshot in a read-only cache;
   synchronous descriptor children use it only when the corresponding in-memory list remains empty
   and never await or create the fallback.
2. Reuse the existing `boardPagesForRoot(root)` implementation by exporting it, or lift its one
   canonical page predicate/scan into a shared helper and make `boardPagesForRoot` delegate to it.
   Use that shared helper to collect current board pages and group each `page.id` by normalized
   `BoardEditorModel.boardRoot`. It already filters `app.pages.pages`, guards a non-empty root, and
   covers `BoardContentEditorModel` by inheritance (`board-updates.ts:72-80`;
   `BoardContentEditorModel.ts:26`). Do not write an equivalent scan using `isBoardEditorId()`;
   do not use the page title or `filePath` as identity.
3. Union roots from the trust snapshot, install snapshot, and open-page map, preserving an
   original-case root for output and using `fpNormalizeForCompare` for matching. For each root,
   read the manifest metadata once. A missing/unparseable manifest yields `name: undefined` and
   `description: undefined`; it does not create a board or grant trust.
4. Set `trusted` with the extracted ancestor-aware predicate over the trust snapshot. A known root
   that is not covered is `trusted: false`, never `undefined`.
5. Attach `installed` only for the matching install-registry entry. Copy `id` and `version`. For
   entries from the loaded in-memory install registry, call `getBoardUpdate(root)` directly when
   the published catalog is loaded: an update gives `updateAvailable: true` and `latestVersion`,
   while no update gives `updateAvailable: false` and no `latestVersion`. For an entry seen only in
   the read-only disk fallback, or whenever the catalog is not loaded, set
   `updateAvailable: undefined` (unknown), never `false`; a root with no install record has
   `installed: undefined`.
6. Always attach a fresh `openPageIds` array. Use `[]` when no page currently runs that root.
7. Return a fresh array and fresh nested objects/arrays on each call so callers cannot mutate
   registry/page state through the result. Sort records deterministically by normalized root and
   sort page ids lexically within each record.

Before:

~~~ts
export const boards: IBoards = {
    createBoard: (name, dir) => create(name, dir, "board-template"),
    createDemoBoard: (name, dir) => create(name, dir, "demo-board"),
    openBoard: async (boardRoot: string) => {
        // validate manifest, then app.openRawLink(...)
    },
~~~

After:

~~~ts
export const boards: IBoards = {
    createBoard: (name, dir) => create(name, dir, "board-template"),
    createDemoBoard: (name, dir) => create(name, dir, "demo-board"),
    openBoard: async (boardRoot: string) => {
        // existing implementation unchanged
    },
    list: async (): Promise<BoardListing[]> => enumerateBoardListings(),
~~~

The helper must stay in the API layer and use the existing model field behind
`BoardEditorFacade.boardRoot` rather than importing the scripting facade. This preserves the
architecture boundary while reusing the exact US-1325 root contract and the canonical
`boardPagesForRoot(root)` scan.

### 4. Extend the boards descriptor with live children and help

Update `src/renderer/scripting/ai-vision/namespaces/boards.ts`:

- Add a static `list` member with signature `list()` and a summary that says **local machine
  inventory** and names trusted/install/open-page sources.
- Revise the namespace summary to say local lifecycle/inventory versus the remote published
  catalog, and revise each catalog member summary to include **remote**.
- Add `children: () => ...` and `index: key => ...` following `PageCollectionWrapper`'s indexed
  children pattern (`PageCollectionWrapper.ts:84-113`). Use a synchronous helper over the same
  currently available in-memory trust/install snapshots, any already-cached read-only fallback,
  and the canonical open-page helper; use fallback data only while the corresponding registry list
  is empty. Never trigger asynchronous loading, disk I/O, manifest reads, or network work from
  either seam. Each child should be `[i]`, kind `Board`, and summarize root, trust state, install
  id/version/update flag, and open-page count. When all currently known sources are empty,
  `children()` returns `[]`.
- Make `index()` return the current merged record for a numeric index and `undefined` for an invalid
  or absent item. It is an observation path, not a second mutation or open action.
- Keep `provide()` for the two existing URL properties and let `list` resolve as the actual API
  method; do not add a second descriptor-only listing implementation.
- Keep `summarize()` cheap and side-effect-free; report the namespace kind and current local board
  count from the synchronous loaded snapshot, without calling `list()` or a loader.

The `$help` text must give the complete route in one or two direct sentences: call
`boards.list()` for this machine's trusted/installed/open local roots, take a returned `root`, then
call `boards.openBoard(root)`; use `boards.searchPublished()` only for the remote published
catalog. It must also say that listing reports trust but never grants it, and that
`boards.registerBoard(root)` remains the only trust path and keeps the existing user dialog
(`boards.ts:78-91`).

Before:

~~~ts
export function describeBoards(_instance: unknown): IAiVisionDescriptor {
    return {
        kind: "Boards",
        summary: "Sandboxed mini web-apps: create, open, trust, install, update, and remove.",
        members: BOARDS_MEMBERS,
        provide: (name) => { /* URL properties only */ },
        help: "Use the board lifecycle deliberately...",
        summarize: () => ({ kind: "Boards" }),
    };
}
~~~

After:

~~~ts
export function describeBoards(instance: unknown): IAiVisionDescriptor {
    const boards = instance as IBoards;
    return {
        kind: "Boards",
        summary: "Local board inventory and lifecycle; published-catalog members read remote data.",
        members: BOARDS_MEMBERS,
        children: () => currentBoardChildren(),
        index: (key) => currentBoardListingAt(key),
        provide: (name) => { /* existing URL properties only */ },
        help: "Call boards.list() for this machine's local roots, then boards.openBoard(root) to open one. Use boards.searchPublished() only for the remote published catalog; listing reports trust but boards.registerBoard(root) is the only consent path.",
        summarize: () => ({ kind: "Boards", boardCount: currentBoardCount() }),
    };
}
~~~

The example is a shape guide, not an instruction to duplicate the merge logic in the descriptor:
the descriptor must delegate to shared API-layer read-only helpers. `children()` must preserve the
EPIC-083 discovery guarantee that hints do not create pages or touch expensive getters
(`doc/epics/EPIC-083.md:170-185`, `:362-363`).

### 5. Preserve trust, remote/local boundaries, and existing surfaces

- Do not add a trust-accepting member. `registerBoard` remains the only path that can show the
  trust dialog and write trust; enumeration only reports `trusted`.
- Do not call `boardTrust.trust()`, `boardTrust.untrust()`, `registerBoard()`, `createBoard()`,
  `downloadBoard()`, `installPublished()`, or `openBoard()` anywhere in a getter, `list()`,
  `children()`, `index()`, `provide()`, `$help`, or `summarize()`.
- Do not duplicate `searchPublished()`. It remains the remote catalog query with local install
  annotations at `src/renderer/api/boards.ts:175-208`; `list()` must never add remote-only catalog
  roots to the local inventory.
- Do not edit `src/main/mcp/tools/board-tools.ts` or
  `src/renderer/api/mcp/board-commands.ts`. No board tool is deleted or aliased in US-1326.
- Do not add a `boards.refresh()` member. EPIC-088 decision 2 places reload on
  `pages[i].editor.reload()` in US-1325, whose existing facade owns `reloadAndWait()` at
  `src/renderer/scripting/api-wrapper/BoardEditorFacade.ts:151-168`.

## Concerns

### Absent-value audit (EPIC-088 decision 9)

`strictNullChecks` is off, so this table is an implementation and review obligation. `undefined`
means a field is not applicable/available; `[]` means the applicable collection is genuinely
empty. No absent state may be represented as `null`, `false`, `0`, or `""`.

| Value | Trust registry empty | Nothing installed | No board page open |
| --- | --- | --- | --- |
| `boards.list()` | Resolves to `[]` if there are no installed/open roots either; otherwise returns those roots with `trusted: false`. | Resolves to trusted/open records if present; each record has `installed: undefined`. | Resolves to trusted/installed records if present; each record has `openPageIds: []`. |
| `BoardListing.root` | Required for every record sourced by any of the three local sources; never absent on a record. | Same. | Same. |
| `BoardListing.name`, `description` | `undefined` when the root has no readable metadata; no empty-string sentinel. | Same. | Same. |
| `BoardListing.trusted` | `false` for a known root not covered by the trust snapshot; this is a real state, not absence. | False for an installed-but-unregistered board; true only when covered by trust. | False for an open untrusted page; true for an open trusted page. |
| `BoardListing.installed` | `undefined` unless the root also has an install-registry entry. | Absent on every record; the top-level result remains an array, not `undefined`. | Independent of open state. |
| `installed.updateAvailable` | `undefined` when the already-loaded catalog cannot answer; `true` for a known compatible newer remote version; `false` when a loaded catalog confirms no update. | No installed object exists, so no nested update field is fabricated. | Independent of open state. |
| `installed.latestVersion` | `undefined` when update state is unknown or no update is known; populated only with `updateAvailable: true`. | Unreachable without an installed object. | Independent of open state. |
| `BoardListing.openPageIds` | `[]` for every known non-open root. | `[]` for every known non-open root. | `[]` for every known root; the whole result is `[]` only when no trust/install/open source contributes a root. |
| `children()` / `index()` | `children()` returns `[]` when the current loaded sources are empty; invalid `index()` returns `undefined`. | Same. | Open-page contribution is absent; existing records still have `openPageIds: []`. |

The result must be copied so the empty-array distinction cannot be broken by a caller mutating a
registry-owned array. The manifest reader's `null` result (`board-manifest.ts:152-162`) is
normalized to optional `undefined` fields at the listing boundary.

This audit covers every new discovery member: `list()` is always a promise of an array, including
`[]`; `children()` is always an array, including `[]`; and `index()` is a record only for a current
valid numeric child, otherwise `undefined`. `summarize()` remains an object with `boardCount: 0`
when the current source union is empty. In particular, an installed record's
`updateAvailable: undefined` is an absent/unknown value, whereas `openPageIds: []` and an empty
top-level result are genuinely empty collections.

### Lazy state versus live hint children

Both `boards.list()` and `children()` must use one shared board-source snapshot rule. Each starts
with the in-memory values from `boardTrust.listPaths()` and
`boardInstallRegistry.listInstalled()`, which startup hydrates at `app.ts:179-190` and
`register-editors.ts:222`. When a source list is empty, `list()` may fill a temporary, read-only
snapshot from that registry's extracted parser; the descriptor may retain that snapshot in a
non-authoritative read cache so synchronous `children()` can see the same fallback without
awaiting. The cache is used only while the corresponding in-memory registry list remains empty;
it never updates registry state. If no fallback is already available, `children()` returns the
currently known `[]` for that source rather than doing I/O. Thus both surfaces share source
precedence, while `children()` remains synchronous and `boards.list()` remains the complete async
discovery call during cold startup. `$help` must make `list()` the first-choice discovery call.

The implementation must not silently replace the read-only snapshot with existing `load()` calls:
trust `load()` can create its missing file (`board-trust.ts:46-48`), install `load()` can persist
pruning (`board-install-registry.ts:47-64`), and `publishedBoards.load()` mutates its reactive
catalog state (`published-boards.ts:47-67`).

### Stale, malformed, inherited, and duplicate roots

The trust registry is a known-path registry, not a filesystem walk (`board-trust.ts:63-65`;
`custom-editor-registry.ts:102-110`). The listing should not discover arbitrary folders. It should
retain a trusted registry root for reporting even if its manifest is now unreadable, expose optional
metadata as `undefined`, and let `openBoard(root)` return its existing validation error
(`boards.ts:62-68`). Install entries should follow the install registry's validation rule and omit
deleted/non-board roots from the read-only installed snapshot without persisting that cleanup.

All joins use `fpNormalizeForCompare`, as the existing trust and update code does
(`board-trust.ts:57-61`; `board-updates.ts:39-47`). One board can be trusted via an ancestor, so
`trusted` must use the same ancestor-aware predicate rather than only comparing exact strings.
Multiple open pages for one normalized root belong in one record's `openPageIds` array.

### Per-read metadata cost

`list()` performs local filesystem work for metadata: one `readBoardManifest(root)` attempt per
merged root, and the read-only installed-registry fallback performs one `isBoardFolder(root)`
check per parsed installed entry (`board-manifest.ts:134-162`; `board-install-registry.ts:47-64`).
For a realistic machine with roughly 10-100 trusted/installed/open roots, that is roughly 10-100
small local manifest reads (each existing reader may probe and read the small manifest), plus any
installed-entry identity probes; it is never a network round trip. The root/status/open-page record
must survive an unreadable or malformed manifest: only `name` and `description` degrade to
`undefined`, as `readBoardManifest()` already returns `null` for that case. `children()` performs
none of this work: it is synchronous, awaits nothing, and reads no manifest or filesystem data.

### Update availability is a remote annotation

`listBoardUpdates()` deliberately requires the published catalog and install registry to be loaded
(`board-updates.ts:57-70`). `boards.list()` must not make that condition true: for each installed
entry, it calls synchronous `getBoardUpdate(root)` directly only when those in-memory models are
loaded. If the catalog has not loaded, `updateAvailable: undefined` means “unknown”; if it has
loaded and `getBoardUpdate(root)` returns `null`, `updateAvailable: false` means “no compatible
update in the loaded catalog.” This distinguishes unknown from confirmed current without a network
request. No remote-only catalog board may appear as a `BoardListing` without a local trust, install,
or open-page root.

### No tests or harness

This task adds no unit tests or test harness, per scope. Verification is through type/lint/build
checks proportionate to the implementation and the later live `call` acceptance in US-1332.

## Acceptance Criteria

- [ ] `IBoards` and the runtime `boards` object expose exactly one new enumeration member,
  `list(): Promise<BoardListing[]>`; no `create`/`open` aliases and no `boards.refresh()` are added
  (`src/renderer/api/types/boards.d.ts:84-239`; EPIC-088 decisions 2-3).
- [ ] One `boards.list()` response contains one merged record per local root and exposes trusted
  state, installed catalog id/version/update availability, and all current open page ids. It finds
  roots from the trust registry, install registry, and `app.pages.pages`, not from an arbitrary
  filesystem walk (`board-trust.ts:63-65`; `board-install-registry.ts:117-128`;
  `board-updates.ts:63-70`; `PageModel.ts:169-186`).
- [ ] `installed` is `undefined` when a root is not catalog-installed; `openPageIds` is always `[]`
  for a known root with no open page; `trusted: false` is used for a known untrusted root; manifest
  metadata and `latestVersion` use `undefined` for absence. `installed.updateAvailable` is
  `undefined` when the in-memory published catalog is not loaded, and is `false` only when
  `getBoardUpdate(root)` confirms no update in a loaded catalog. Empty top-level/child collections
  use `[]`, never `undefined` or `null` (EPIC-088 decision 9).
- [ ] Both `board-view` and `board-editor:<root>` pages are detected through the exported/lifted
  canonical `boardPagesForRoot(root)` scan, including `BoardContentEditorModel`; root identity
  follows the existing US-1325 `BoardEditorFacade.boardRoot` / model field and is never inferred
  from a title or file path (`board-updates.ts:72-80`; `custom-editor-registry.ts:210-216`;
  `BoardContentEditorModel.ts:26`; `BoardEditorFacade.ts:62-99`). No equivalent page scan is
  added to enumeration.
- [ ] Reading `list()`, `$help`, `summarize()`, `children()`, `index()`, and `provide()` never
  creates a board, creates a registry file, persists install pruning, downloads/extracts code,
  trusts/untrusts a root, opens a page, loads a board iframe, or touches the network. Cold reads use
  only in-memory state or the extracted non-mutating local parser fallback; `children()` never
  invokes an async loader (`fs.ts:516-529`; `published-boards.ts:46-67`; EPIC-083:170-185,
  362-363).
- [ ] `children()` is implemented and shows current known boards in the node hint via indexed
  `[i]` children; it remains synchronous, awaits nothing, and performs no manifest/disk/network
  work. It shares the in-memory source rule (including only an already-available read-only
  fallback cache) with `boards.list()`, while `$help` directs cold discovery to `boards.list()`
  (`PageCollectionWrapper.ts:84-113`; `page-panels.ts:320-323`).
- [ ] The namespace summary and every relevant member summary clearly label `list()` as local
  machine inventory and `searchPublished()` / version/update members as remote catalog operations.
  `$help` names the exact path `boards.list()` -> `boards.openBoard(root)` and warns that
  `boards.registerBoard(root)` alone grants trust through the existing user dialog
  (`boards.ts:78-91`).
- [ ] No enumeration member accepts or grants trust; the existing `registerBoard` dialog and
  create auto-trust behavior remain unchanged (`boards.ts:78-91`; `board-scaffold.ts:66-72`).
- [ ] `searchPublished()` is not duplicated or repurposed; remote-only catalog boards remain
  reachable through it and do not appear in the local listing without a local root
  (`boards.ts:175-208`; `published-boards.ts:85-86`).
- [ ] `src/main/mcp/tools/board-tools.ts` and `src/renderer/api/mcp/board-commands.ts` are not
  changed; the legacy tools remain available and no tool is marked retirable by this task
  (`board-tools.ts:10-25`; `board-commands.ts:16-46`).
- [ ] The later US-1332 live `call` checks are listed and pass before `create_board` / `open_board`
  are marked retirable: (1) `call` `boards.createBoard(name, dir)` creates a blank board and
  returns its root; (2) `call` `boards.createDemoBoard(name, dir)` creates the demo board and
  returns its root; (3) `call` `boards.list()` discovers both roots and reports trusted state;
  (4) `call` `boards.openBoard(root)` opens or reuses the board page; (5) the returned page is
  reachable through `pages[i]`, has editor id `board-view` or `board-editor:<root>`, and its
  `pages[i].editor.boardRoot` equals the listed root; and (6) the legacy tool response semantics
  remain accounted for: `{ boardRoot }` for `create_board` and `{ opened, pageId, title }` for
  `open_board` (`board-commands.ts:16-46`; `BoardEditorFacade.ts:98-99`).
- [ ] No unit tests or test harness are added. Type checking, linting, and the normal production
  build pass after implementation; live behavior is verified through the later US-1332 acceptance
  run rather than a new test surface.

## Files that need NO changes

- `src/renderer/scripting/ai-vision/namespaces/index.ts` - registration at `:39` already points
  at `boards` and `describeBoards`; only the descriptor implementation changes.
- `src/renderer/scripting/api-wrapper/BoardEditorFacade.ts` - US-1325 already exposes
  `boardRoot`, render state, and reload; enumeration consumes its root contract and adds no facade
  member (`:62-99`).
- `src/renderer/editors/board/custom-editor-registry.ts` - `isBoardEditorId()` remains the page-id
  contract; no editor-id format changes are needed (`:102-110`, `:210-216`).
- `src/renderer/editors/board/board-manifest.ts` - `BoardManifest`, `isBoardFolder()`, and
  `readBoardManifest()` already provide identity and optional metadata (`:36-62`, `:134-162`).
- `src/renderer/api/board-install.ts` - installation already records inert code and leaves trust to
  registration (`:39-80`); enumeration must not call it.
- `src/main/mcp/tools/board-tools.ts` and `src/renderer/api/mcp/board-commands.ts` - legacy
  `create_board` / `open_board` are explicitly out of scope (`board-tools.ts:10-25`;
  `board-commands.ts:16-46`).
- `src/renderer/api/pages/PageModel.ts` and `src/renderer/api/pages/PagesModel.ts` - existing
  page identity and `mainEditorInstance` access are sufficient (`PageModel.ts:57-60`, `:169-186`).
- `assets/editor-types/boards.d.ts` - generated from the source type declarations; regenerate it,
  do not hand-edit it.
- `doc/active-work.md` and `doc/epics/EPIC-088.md` - the user explicitly forbids dashboard and
  epic edits for this task; the existing epic/dashboard entries already identify US-1326.
- Unit-test directories and test harness configuration - no test surface is in scope.

## Files Changed Summary

| File | Planned change |
| --- | --- |
| `src/renderer/api/types/boards.d.ts` | Add `BoardListing` and `IBoards.list()`, with local/remote and absent-value contracts. |
| `src/renderer/api/board-trust.ts` | Add a non-mutating trust-path snapshot and share its ancestor predicate. |
| `src/renderer/api/board-install-registry.ts` | Add a non-mutating installed-entry snapshot that validates without pruning persistence. |
| `src/renderer/api/published-boards.ts` | Expose only a synchronous loaded-state observation if needed; add no remote fetch seam. |
| `src/renderer/api/board-updates.ts` | Export/lift the existing `boardPagesForRoot(root)` scan; preserve direct `getBoardUpdate()` and `listBoardUpdates()` behavior. |
| `src/renderer/api/boards.ts` | Implement the merged local `list()` result and open-page root grouping. |
| `src/renderer/scripting/ai-vision/namespaces/boards.ts` | Add the descriptor member, live indexed children, index projection, local/remote summaries, and `$help`. |
| `doc/architecture/scripting.md` | Document the `boards.list()` local inventory and cold-read/children contract. |

Generated `assets/editor-types/boards.d.ts` is an output, not a hand-edited source change. The
dashboard, epic, legacy board tools/handlers, BoardEditorFacade, board identity code, and tests are
intentionally unchanged.
