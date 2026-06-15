# US-675 — Mneme tree: drag-and-drop file upload from the OS

**Status:** Implemented (unreviewed) — 2026-06-16. `tsc --noEmit` + eslint clean. Scope = OS-file slice +
`IFileLink` foundation; cross-root / `IMnemeLink` rework split to **US-688**. Stays `[ ]` on the dashboard per
the epic deferred-review model (renderer `/review` + `/document`/`/userdoc` happen at EPIC-032 close).

## As-built notes (deviations from the plan, 2026-06-16)

Minor layering refinements made during implementation — the design is otherwise as specified:

- **`OsFile` implements `IFileLink` only** (not `LINK`). Adding `LINK` would force `core/traits/fileLinkTraits.ts`
  to import `LINK` from `editors/link-editor/` — a `core → editors` inversion. So the **open-as-tab fallback keeps
  its existing path-extraction logic** (moved from capture → a new bubble-phase `handleFileDropFallback`), rather
  than consuming the descriptor via `LINK`. Functionally identical; cleaner layering.
- **`dnd.ts` stays generic**: it gained `isFileDrag`, `isLinkDroppable`, `setEventTraitDragData(e, payload)`,
  `getTraitDragDataFromEvent(e)` — no OS/electron knowledge. The OsFile descriptor is built by
  `makeOsFileDescriptor()` in `fileLinkTraits.ts`; `GlobalEventService.captureDrop` resolves paths
  (`getPathForFile`) and calls both.
- **Monaco option** set in `src/renderer/editors/monaco/MonacoBody.tsx` (the actual `<Editor options=…>` site),
  not `MonacoEditor.ts`.
- **`IFileLink` interface lives in `api/types/io.tree.d.ts`** (next to `ILink`), not in `fileLinkTraits.ts`
  (revises C10's "home"). Reason: `io.tree.d.ts` is a script-API type bundled into `assets/editor-types/` by a
  Vite plugin that only follows imports *within* `api/types/`; importing the runtime `fileLinkTraits.ts` from it
  would break generation. `fileLinkTraits.ts` re-exports `IFileLink` for convenience, and owns the trait
  machinery (`FILE_LINK`, `FileLinkTrait`, the `OsFile` producer).
- **`IFileLink.getBytes()`** reads via `fs.readBinary(path)` (returns `Buffer`, assignable to `Uint8Array`).
- uikit `Tree` already `stopPropagation`s on a handled drop (existing `onDrop`), so no new stop needed — the
  document fallback is naturally skipped when the tree handles a file drop.
**Epic:** EPIC-032 (Mneme), Phase 4. Builds on [US-663](../US-663-mneme-tree-provider/README.md),
[US-674](../US-674-mneme-tree-editing/README.md) (write path) and [US-686](../US-686-mneme-binary-tools/README.md)
(the `upload` binary tool this rides on).

## Goal

Drag a file (or several) from the OS file explorer — or any app — and drop it onto a folder in the Mneme
tree panel → the file is **imported into Mneme** under that folder (stored via the Mneme MCP write path).

Built on the **existing trait pattern**: a drag carries a serializable **descriptor** `{ typeId, data }`; the
**registry** (`traitRegistry`, `typeId → TraitSet`) is the factory that reconstructs the real object via the
trait accessors. This is exactly how every internal drag already works (e.g. `LinksList` drags
`{ typeId: ILink, data: { items, sourceId } }`; the drop target rebuilds links via `LINK.getItems(data)`). We
add an **`IFileLink`** trait ("yields file-like content"); an OS file drop is converted — at one boundary —
into a descriptor whose `TraitSet` implements `IFileLink` (+ `ILink`). The Mneme tree accepts `IFileLink` and
imports it. Because the tree dispatches on the *trait*, not the origin, **any** future `IFileLink` producer (a
future Explorer's files, a link-editor link with a `filePath`) becomes droppable with **zero tree changes**.

## Background — how drag-and-drop works today

### Trait-based DnD (internal drags)

- Drag sources serialize `{ typeId, data }` into the native `DataTransfer` under MIME
  `application/persephone-trait` via `setTraitDragData()` (`src/renderer/core/traits/dnd.ts:16`).
- Drop targets read it with `getTraitDragData()` / gate with `hasTraitDragData()`, resolve the trait via
  `resolveTraits(typeId)` → `traitRegistry.get(typeId)`, then call an accessor — e.g. `traits.get(LINK).getItems(data)`.
- **`LINK` trait** — `src/renderer/editors/link-editor/linkTraits.ts`: `LINK = new TraitKey<LinkTrait>("Link")`,
  payload `{ items: ILink[]; sourceId?: string }`, registered under `TraitTypeId.ILink`.
- **`TraitSet` holds many traits per object** (`core/traits/traits.ts`) — one object can implement `LINK` *and*
  `IFileLink` *and* more; each drop target reads only the key it cares about. This is what lets a target accept
  one trait and ignore the rest.
- **The descriptor is serializable, so it crosses windows** via the MIME and is rebuilt by the *receiving*
  window's `traitRegistry` — e.g. dragging a link into a **Rest Client in another window** imports it as a
  request. There is no special IPC for trait drags (unlike cross-window *tab* movement, which uses
  `api.addDragEvent` + a `PageDescriptor`).
- **Drop consumers today:** `TreeProviderView.canTraitDrop` (`tree-provider/TreeProviderView.tsx:166`) /
  `onTraitDrop` (176) → `model.moveItems` → `provider.rename` / `moveToCategory` / `renameCategoryPath` (all
  intra-provider moves). `LinkBody.handleCenterDrop` (`link-editor/LinkBody.tsx:91`) → `model.importLinks`.
  **Rest Client** `RequestTree` (`rest-client/RestClientShared.tsx:452-490`) accepts the `LINK` trait —
  `resolveTraits(typeId).get(LINK).getItems(data)` → `vm.addRequest(href)`. **This is the consumer template
  the Mneme tree mirrors for `IFileLink`.**
- **uikit Tree DnD core** — `uikit/Tree/TreeModel.ts`: `onDragStart` (429) → `setTraitDragData`;
  `onDragEnter`/`onDragOver` (467/488) gate on `hasTraitDragData`; `onDrop` (514) → `getTraitDragData` →
  `canTraitDrop?` then `onTraitDrop?`. App-agnostic — it only knows trait payloads.

### OS file drops today (the obstacle)

`GlobalEventService.captureDrop` (`src/renderer/api/internal/GlobalEventService.ts:110`) is registered on
`document` in the **capture phase** (`addEventListener("drop", this.captureDrop, true)`, line 72). For any
drop carrying `dataTransfer.files` it resolves OS paths via `window.electron.getPathForFile()`, calls
`preventDefault()` + `stopPropagation()` (**consuming the event**), and `openDroppedPaths()` → opens tabs.

So today an OS file dropped anywhere (including on the Mneme tree) is swallowed and opened as a tab. Capture
exists to **beat inner components that handle drops** — chiefly Monaco, which ships a built-in
*drop-into-editor* feature (we set neither `dropIntoEditor` nor `dragAndDrop`, so Monaco runs on defaults and
*would* insert a dropped file).

### Mneme write surface (already exists — no Rust work)

- `write {path, content}` — text/markdown, indexed synchronously (`mneme/src/mcp/server.rs:90`).
- `upload {path, contentBase64}` — binary, stored + listable but not indexed
  (`server.rs:96`, `UploadParams` in `mneme/src/mcp/params.rs:27`).
- The mneme watcher (US-670) emits `resources/list_changed` on file create, so the tree **auto-refreshes**
  after import via `MnemeTreeProvider.watch()` — no manual refresh.

## Design — trait dispatch with a single conversion boundary

**Core principle (locked).** Internally Persephone routes drops as **trait descriptors only**. The tree never
reads `dataTransfer.files`. OS files are converted into a descriptor implementing the `IFileLink` trait in
**exactly one place** — the capture-phase handler. Consumers dispatch on **which trait is present**, never on
the object's origin; each accepted trait maps to **one** handler method:

| Trait present on the dropped object | Tree's single handler for it |
|---|---|
| `IFileLink` | `importFiles(getFiles(data), node)` → provider stores the bytes |
| `LINK` (same provider) | `moveItems(getItems(data), node)` → intra-provider move (US-674, unchanged) |

The dragged object may implement several traits; the tree picks the one it understands. An OS file implements
only `IFileLink`; an internal tree item implements `LINK`; a future link-editor link could implement **both**
(navigable *and* a file) and each target would pick its own trait. There is **no** "is this an OS file?" check
anywhere in the tree.

The flow (capture converts but does **not** consume, so the descriptor propagates to the real target):

1. **Capture-phase handler = conversion only.** On a file drag it builds a plain, serializable descriptor
   `{ typeId: OsFile, data: { files: [{ name, path }] } }` (paths via `getPathForFile`) and attaches it to the
   **native event** as an expando (a `Symbol` property). It does **not** `preventDefault`/`stopPropagation`.
   The event is one object instance for the whole capture→target→bubble dispatch, so the expando survives to
   every later listener. *(The expando — not the `dataTransfer` MIME — is the transport here only because
   `setData` is illegal during `drop`; the content is the same `{ typeId, data }` descriptor everything else
   uses, so the registry reconstructs the real object identically.)*
   > **Reconcile with `trait-system.md`:** that doc rejects attaching a symbol property to *data* objects for
   > auto-discovery (symbols are lost on spread / `JSON` / Immer copies). That rationale does **not** apply
   > here — we attach the symbol to a **transient DOM event**, which is never spread, serialized, or
   > Immer-copied; it lives only for the dispatch. The descriptor it carries is still the plain serializable
   > `{ typeId, data }`. This distinction must be written into `trait-system.md` when the feature lands.
2. **Disable Monaco drop-into-editor** (`dropIntoEditor: { enabled: false }`). Needed precisely because capture
   no longer consumes: the drop now reaches inner editors and we don't want Monaco inserting the file.
3. **Consumers read the descriptor + dispatch by trait.** The tree's `onDrop` reads the descriptor via
   `getTraitDragDataFromEvent(e)`, runs `canTraitDrop`/`onTraitDrop` (which resolve `IFileLink` → import, else
   `LINK` → move), then `stopPropagation()`s because it handled the drop.
4. **Bubble-phase open-as-tab fallback.** The old "open as tab" behavior moves to a bubble-phase document
   handler that *also* reads the descriptor (via the `IFileLink` trait → `filePath`s), never `files[]`. It runs
   last, so it only fires for drops nothing handled (Monaco-ignored, empty areas). The **Browser editor** is
   untouched: its webview is a separate web-contents our `document` never sees, so its page keeps native
   drop/navigation (by design).

> **`dragover` limit (unavoidable):** during `dragover` the `dataTransfer` is *protected* — `files` is
> unreadable, only `types` (includes `"Files"`) is visible. So the descriptor is attached at **drop**; for the
> dragover affordance, consumers ask `dnd.ts` `isLinkDroppable(dt)` (a boolean over trait-MIME-or-file-drag)
> rather than touching `files`.

## Implementation plan

### Step 1 — define the `IFileLink` trait

New file: `src/renderer/core/traits/fileLinkTraits.ts` (generic, app-wide — not link-editor-specific).

```ts
import { TraitKey, TraitSet } from "./traits";
import { traitRegistry, TraitTypeId } from "./TraitRegistry";

/** One droppable file-like item. `getBytes` works for every source; `filePath`
 *  is present when the source has an OS path (disk files; filePath-bearing links). */
export interface IFileLink {
    name: string;
    filePath?: string;
    getBytes(): Promise<Uint8Array>;
}

/** Capability: a dragged object can yield file-like items. */
export interface FileLinkTrait {
    getFiles(data: unknown): IFileLink[];
}

export const FILE_LINK = new TraitKey<FileLinkTrait>("FileLink");

// Producer: OS files dropped from the desktop. The descriptor `data` is plain &
// serializable — `{ files: [{ name, path }] }` (paths resolved in the capture handler).
// The accessors are the FACTORY that rebuild the real objects from it — same role as
// `LINK.getItems` for link drags. OS files implement BOTH FILE_LINK (import) and LINK
// (open-as-page fallback). `LINK` is imported from `../../editors/link-editor/linkTraits`.
interface OsFileData { files: { name: string; path: string }[] }

const osFileTraits = new TraitSet()
    .add(FILE_LINK, {
        getFiles: (data) => (data as OsFileData).files.map((f) => ({
            name: f.name,
            filePath: f.path,
            getBytes: () => app.fs.readBytes(f.path),       // read from disk on demand (app.fs binary read)
        })),
    })
    .add(LINK, {
        getItems: (data) => (data as OsFileData).files.map((f) => ({
            title: f.name, href: f.path, category: "", tags: [], isDirectory: false,
        })),
        getSourceId: () => "os-file",
    });
traitRegistry.register(TraitTypeId.OsFile, osFileTraits);
```
Add `OsFile = "OsFile"` to the `TraitTypeId` enum in `src/renderer/core/traits/TraitRegistry.ts`. Import
`fileLinkTraits.ts` at trait-init (alongside the existing trait registrations) so it registers at startup.

### Step 2 — `dnd.ts`: file-drag detection + event-expando descriptor

File: `src/renderer/core/traits/dnd.ts` — the only DnD-plumbing that knows OS files exist; it tags the event,
the trait registration (Step 1) defines the semantics, consumers read trait abstractions.

```ts
const LINK_DROP_DESCRIPTOR = Symbol("persephone-link-drop");

/** True if the drag carries OS files (during dragover only the type is visible). */
export function isFileDrag(dataTransfer: DataTransfer | null): boolean {
    return !!dataTransfer && Array.prototype.indexOf.call(dataTransfer.types, "Files") >= 0;
}

/** Droppable as a link/file? Trait drag OR OS file drag. Consumers call this from
 *  dragenter/dragover so they never touch `files`. */
export function isLinkDroppable(dataTransfer: DataTransfer | null): boolean {
    return !!dataTransfer && (hasTraitDragData(dataTransfer) || isFileDrag(dataTransfer));
}

/** THE conversion point — tag the native event with an OsFile descriptor. Called once,
 *  from the capture-phase handler (files are readable at drop). */
export function attachOsFileDescriptor(e: DragEvent, files: File[]): void {
    const data = {
        files: files
            .map((f) => ({ name: f.name, path: window.electron.getPathForFile(f) }))
            .filter((f) => f.path),                          // filesystem files only (serializable descriptor)
    };
    if (!data.files.length) return;
    const payload: TraitDragPayload = { typeId: TraitTypeId.OsFile, data };
    (e as DragEvent & { [LINK_DROP_DESCRIPTOR]?: TraitDragPayload })[LINK_DROP_DESCRIPTOR] = payload;
}

/** Read the trait descriptor from a drop event — the OS-file expando first, then the
 *  dataTransfer MIME (setData). Accepts a React or native DragEvent. The ONE accessor
 *  every consumer uses, so internal trait drags and OS file drags read identically;
 *  they never touch `files`. */
export function getTraitDragDataFromEvent(e: React.DragEvent | DragEvent): TraitDragPayload | null {
    const native = "nativeEvent" in e ? e.nativeEvent : e;
    const fromEvent = (native as { [LINK_DROP_DESCRIPTOR]?: TraitDragPayload })[LINK_DROP_DESCRIPTOR];
    return fromEvent ?? getTraitDragData(e.dataTransfer);
}
```
Extend `allowDrop` (or add `allowLinkDrop`) so file drags `preventDefault()` + `dropEffect = "copy"` (an OS
import is a copy). `TraitTypeId` is imported from `./TraitRegistry`.

### Step 3 — `GlobalEventService`: capture-convert, bubble-fallback, disable Monaco

File: `src/renderer/api/internal/GlobalEventService.ts`; `src/renderer/editors/monaco/MonacoEditor.ts`

- **Capture handler (convert, don't consume).** Replace `captureDrop`'s body so it no longer opens tabs; it
  only tags the event:
  ```ts
  private captureDrop = (e: DragEvent) => {
      if (isFileDrag(e.dataTransfer) && e.dataTransfer.files.length) {
          attachOsFileDescriptor(e, Array.from(e.dataTransfer.files));   // no preventDefault/stopPropagation
      }
  };
  ```
  (Keep it registered in capture so it tags before any consumer reads.)
- **Bubble fallback (open as tab via the descriptor).** Add a bubble-phase `drop` listener
  (`addEventListener("drop", this.handleDropFallback)`, no `true`) that fires last:
  ```ts
  private handleDropFallback = (e: DragEvent) => {
      const payload = getTraitDragDataFromEvent(e);
      const link = payload && resolveTraits(payload.typeId)?.get(LINK);
      if (!link) return;                                          // open-as-page via the ILink trait
      const paths = link.getItems(payload.data).map((i) => i.href).filter(Boolean);
      if (!paths.length) return;
      e.preventDefault();
      this.openDroppedPaths(paths);
  };
  ```
  If a descendant (the tree) handled the drop and `stopPropagation()`'d, this never runs. `openDroppedPaths`
  stays as-is.
- **Disable Monaco.** Add `dropIntoEditor: { enabled: false }` to the main editor construction options in
  `MonacoEditor.ts` (keep `dragAndDrop` default for internal text move). *(Verify V1; set it on embedded
  Monaco instances too only if a file-drop there misbehaves.)*

### Step 4 — uikit `Tree`: accept file drags, dispatch through existing trait props

File: `src/renderer/uikit/Tree/TreeModel.ts` (+ Tree props type). The Tree stays trait-only — it never reads
`files`.

- New prop: `acceptsFileDrop?: boolean` (opt-in, so unrelated trees don't light up on a file drag).
- `onDragEnter` (467) / `onDragOver` (488): gate on
  `acceptsFileDrop ? isLinkDroppable(dt) : hasTraitDragData(dt)`; set `dropEffect = "copy"` for the file case.
- `onDrop` (514): read via `getTraitDragDataFromEvent(e)`; when `canTraitDrop` accepts, run `onTraitDrop` **and
  `stopPropagation()`** (handled → don't let the document fallback also open tabs):
  ```ts
  const payload = getTraitDragDataFromEvent(e);
  if (!payload) return;
  if (this.props.canTraitDrop?.(r.source, payload, r.level) ?? true) {
      this.props.onTraitDrop?.(r.source, payload, r.level);
      e.stopPropagation();
  }
  ```

### Step 5 — `IFileLink` import contract on `ITreeProvider`

File: `src/renderer/api/types/io.tree.d.ts` — add next to the existing write methods:
```ts
import type { IFileLink } from "../../core/traits/fileLinkTraits";
/** Import dropped file-like items into `targetCategory`. The provider reads each item's
 *  bytes and stores them. Optional — providers without import support omit it (and don't
 *  set `acceptsFileDrop`). Note: takes `IFileLink[]`, never DOM `File` — provider-agnostic. */
importFiles?(items: IFileLink[], targetCategory: string): Promise<void>;
```

### Step 6 — `TreeProviderView` + `TreeProviderViewModel`: trait dispatch + routing

Files: `tree-provider/TreeProviderView.tsx`, `tree-provider/TreeProviderViewModel.tsx`

- `TreeProviderView`, when `writable && provider.importFiles`: pass `acceptsFileDrop` to `<Tree>`.
- `canTraitDrop(dropNode, payload)` — accept by trait:
  ```ts
  const traits = resolveTraits(payload.typeId);
  if (traits?.get(FILE_LINK)) return true;                 // import (any IFileLink source)
  const link = traits?.get(LINK);                          // existing move path (+ self-drop guard)
  return !!link && /* existing not-self check */;
  ```
- `onTraitDrop(dropNode, payload)` — **one method per trait**, no origin check:
  ```ts
  const traits = resolveTraits(payload.typeId);
  const fileLink = traits?.get(FILE_LINK);
  if (fileLink) { void model.importFiles(fileLink.getFiles(payload.data), dropNode); return; }
  const link = traits?.get(LINK);
  if (link) model.moveItems(link.getItems(payload.data), dropNode);
  ```
- `TreeProviderViewModel.importFiles(items: IFileLink[], dropNode)`:
  ```ts
  async importFiles(items: IFileLink[], dropNode: TreeProviderNode): Promise<void> {
      if (!this.provider.importFiles || !items.length) return;
      const targetCategory = dropNode.data.isDirectory
          ? dropNode.data.href                                   // drop on a folder → into it
          : (dropNode.data.category || this.provider.rootPath);  // drop on a file → its parent (C6)
      // C4 — collision check via the provider's existing list(); confirm overwrite.
      const existing = new Set((await this.provider.list(targetCategory)).map((l) => l.title));
      const clashing = items.filter((i) => existing.has(i.name)).map((i) => i.name);
      if (clashing.length) {
          const bt = await ui.confirm(
              `${clashing.length} file(s) already exist here and will be overwritten:\n${clashing.join(", ")}`,
              { title: "Overwrite files?", buttons: ["Overwrite", "Cancel"] },
          );
          if (bt !== "Overwrite") return;
      }
      try {
          await this.provider.importFiles(items, targetCategory);
          // watch() (list_changed) refreshes the tree; buildTree() fallback for non-watching providers.
      } catch (err) {
          ui.notify(`Import failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
  }
  ```

### Step 7 — `MnemeTreeProvider.importFiles`

File: `src/renderer/content/tree-providers/MnemeTreeProvider.ts`

```ts
async importFiles(items: IFileLink[], targetCategory: string): Promise<void> {
    const client = this.requireClient();
    for (const item of items) {
        const path = `${targetCategory}/${item.name}`;          // scheme-less {root}/{path}
        const bytes = Buffer.from(await item.getBytes());
        await client.callTool({ name: "upload", arguments: { path, contentBase64: bytes.toString("base64") } });
    }
}
```
**Always `upload`** (C3 decision — simplest, binary-safe, no extension sniffing). `Buffer` is available
(nodeIntegration: true; same pattern as `editors/image/ImageEditor.ts`). Note: `upload` stores bytes
verbatim and doesn't index synchronously, but the mneme **watcher/reconcile** picks up any indexable file
(`.md`) on disk shortly after, so dropped markdown still becomes searchable (just not synchronously like
`write`).

### Step 8 — Docs

- `mneme/` guide already documents `upload`/`write` — no Rust doc change.
- Persephone `/document` + `/userdoc` are **deferred to EPIC-032 close** (epic deferred-review model). At that
  pass, update **`doc/architecture/trait-system.md`** specifically:
  - "Drag-and-Drop Utilities" → document the **event-expando transport** for OS-originated drops and the
    unified **`getTraitDragDataFromEvent(e)`** accessor (expando-first, MIME-fallback), noting why the expando exists
    (`setData` is illegal during `drop`) and that it carries the same serializable `{ typeId, data }`.
  - Registry/traits section → add the **`IFileLink`** trait (`core/traits/fileLinkTraits.ts`) and the
    **`TraitTypeId.OsFile`** producer as a cross-type drop example (OS files → mneme tree).
  - Also cover the Tree `acceptsFileDrop` prop, the Mneme tree import path, and Monaco `dropIntoEditor: false`.
- Do **not** touch `trait-system.md` during implementation — it describes the system as-is, and the feature
  isn't live until merged.

## Files that need NO change

- `mneme/` (Rust) — `upload`/`write`/watcher already provide everything; **no server work**.
- `linkTraits.ts` — the `LINK` trait is unchanged and reused for the move path; `IFileLink` is a separate trait.
- `MnemeTreeSecondaryView.tsx` — `TreeProviderView` does the wiring; the secondary view is untouched.
- `LinkBody.tsx` / Collections — **out of scope** this task (see C7); a future change could have its links
  implement `IFileLink` to be tree-droppable, with no tree changes.

## Concerns / open questions (for review)

- **C1 — Descriptor delivery: ✅ resolved → single capture-phase conversion (event expando).** Per your
  decision, files→descriptor happens in exactly one place; every consumer reads only the trait descriptor.
- **C2 — Routing without consuming globally: ✅ resolved.** Capture converts but doesn't consume; Monaco drop
  disabled; tree handles + `stopPropagation`; bubble fallback opens-as-tab via the descriptor. No zone attribute.
- **C3 — Upload method: ✅ resolved → always `upload`.** No extension sniffing — every dropped file goes
  through `upload` (binary-safe, simplest). The watcher/reconcile indexes any `.md` shortly after.
- **C4 — Name collision: ✅ resolved → confirm overwrite.** Before importing, `TreeProviderViewModel.importFiles`
  lists the target folder, and if any names clash it shows `ui.confirm` (`showConfirmationDialog`) — Overwrite
  proceeds (`upload` overwrites), Cancel aborts.
- **C5 — Reading bytes: ✅ resolved → path-based via the descriptor.** The descriptor carries `{ name, path }`
  (serializable, like link drags); `IFileLink.getBytes()` reads from disk via `app.fs` on demand. Limitation: a
  drag with no OS path (e.g. an image dragged out of a web page) isn't importable — rare; noted, not handled.
- **C6 — Drop target granularity: ✅ resolved → parent folder.** Folder/root nodes accept; dropping on a **file**
  node imports into that file's parent folder.
- **C7 — Scope: ✅ resolved → OS-file slice only.** US-675 wires the Mneme tree as the only `IFileLink`
  consumer + the trait/descriptor foundation. The **`IMnemeLink` + cross-root download→upload** rework (mneme
  tree's own drag) is split to **US-688**.
- **C8 — Size cap: ✅ resolved → no cap.** Mneme is a local loopback service; no size check.
- **C9 — uikit Tree gains `acceptsFileDrop` + `stopPropagation`-on-accept: ✅ accepted.** Generic, no
  ILink/provider coupling (drop still flows through `canTraitDrop`/`onTraitDrop`).
- **C10 — `IFileLink` trait shape & home: ✅ accepted as proposed.** `core/traits/fileLinkTraits.ts`, key
  `FILE_LINK`, item `{ name; filePath?; getBytes() }`, new `TraitTypeId.OsFile`.

### Verification (must confirm during implementation)

- **V1 — Monaco.** With `dropIntoEditor: { enabled: false }`, confirm a file dropped on the editor bubbles to
  the document fallback (opens as a tab) — i.e. Monaco doesn't `stopPropagation` the drop. If it does, fall
  back to leaving the capture handler consuming + a per-zone opt-out (design is reversible).
- **V2 — non-trait drops elsewhere.** `PageTab`/`TreeModel` already bail on non-matching payloads; spot-check
  `FolderItem`, `TodoItemView`, `HeaderCell`, `PinnedLinksPanel`, `BrowserTabsPanel` likewise, so a file
  dropped on them still falls through to the document fallback — no regression.

## Acceptance criteria

- [ ] Dragging one or more OS files onto a **folder** (or the root) in the Mneme tree imports them under that
      folder; the tree refreshes automatically (watcher `list_changed`).
- [ ] Dropping a file **outside** the tree still opens it as a tab (behavior preserved, now via the bubble fallback).
- [ ] Dropping a file on the **Monaco editor** opens it as a tab (Monaco no longer inserts the path/content).
- [ ] Dropping a file on the **Browser editor** is handled by the page (navigation/upload), not intercepted.
- [ ] Internal trait DnD (move/rename within the tree, US-674) still works unchanged.
- [ ] The tree dispatches purely by trait — no `dataTransfer.files` / origin check in tree or provider code.
- [ ] All dropped files are stored via `upload` and appear in the tree; a dropped `.md` becomes searchable
      shortly after (watcher/reconcile).
- [ ] Dropping files whose names already exist in the target folder prompts an Overwrite/Cancel confirmation.
- [ ] Drag-over a writable folder shows the drop affordance; non-droppable targets don't.
- [ ] `npm run typecheck` + `eslint` clean; manual click-through on the live Mneme tree.

## Files Changed (planned)

| File | Change |
|------|--------|
| `src/renderer/core/traits/fileLinkTraits.ts` | **new** — `IFileLink`, `FileLinkTrait`, `FILE_LINK` key, OS-file producer `TraitSet`, registration |
| `src/renderer/core/traits/TraitRegistry.ts` | add `TraitTypeId.OsFile` |
| `src/renderer/core/traits/dnd.ts` | `isFileDrag`, `isLinkDroppable`, `attachOsFileDescriptor`, `getTraitDragDataFromEvent`; file-drag `allowDrop` |
| `src/renderer/editors/monaco/MonacoEditor.ts` | `dropIntoEditor: { enabled: false }` |
| `src/renderer/api/internal/GlobalEventService.ts` | capture handler converts (no consume); new bubble fallback opens-as-tab via the `IFileLink` descriptor |
| `src/renderer/uikit/Tree/TreeModel.ts` (+ Tree props) | `acceptsFileDrop` prop; accept file drags in dragenter/over; `stopPropagation` on accepted drop; `onDrop` reads `getTraitDragDataFromEvent` |
| `src/renderer/api/types/io.tree.d.ts` | optional `importFiles(items: IFileLink[], targetCategory)` on `ITreeProvider` |
| `src/renderer/components/tree-provider/TreeProviderView.tsx` | pass `acceptsFileDrop`; trait dispatch (`FILE_LINK` → import, `LINK` → move) in `can`/`onTraitDrop` |
| `src/renderer/components/tree-provider/TreeProviderViewModel.tsx` | `importFiles(items, dropNode)` → target-folder calc + `ui.confirm` collision check → `provider.importFiles` + refresh/notify |
| `src/renderer/content/tree-providers/MnemeTreeProvider.ts` | implement `importFiles` — always `upload` (base64) |
