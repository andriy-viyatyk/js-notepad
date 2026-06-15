# US-688 — Mneme tree: own drag-drop (intra-root move + cross-root / cross-window copy)

**Status:** Implemented (unreviewed) — 2026-06-16. `tsc --noEmit` + eslint clean; pending manual click-through.
Stays `[ ]` on the dashboard per the epic deferred-review model.
**Epic:** EPIC-032 (Mneme), Phase 4. **Builds on [US-675](../US-675-mneme-tree-file-drop/README.md)**
(the `IFileLink` trait, the descriptor + registry foundation, the Mneme tree's `importFiles` → `upload` path)
and on the trait system in [`/doc/architecture/trait-system.md`](../../architecture/trait-system.md).

## As-built notes (2026-06-16)

Implemented exactly as planned (5 files + `trait-system.md`). One mechanical detail:

- **`traitTypeId` cast.** `ITreeProvider.dragTraitTypeId` is typed `string` (it lives in the script-API
  `io.tree.d.ts`, which can't import the runtime `TraitTypeId` enum — same bundler constraint as `IFileLink`).
  The uikit `Tree`'s `traitTypeId` prop is the `TraitTypeId` enum, so `TreeProviderView` casts:
  `((props.provider.dragTraitTypeId as TraitTypeId) ?? TraitTypeId.ILink)`. Safe — the value is serialized as a
  string into the drag payload.
- `MnemeTreeProvider.importFiles` and `TreeProviderViewModel.{moveItems,importFiles}` were reused **unchanged**;
  only `TreeProviderView.onTraitDrop` changed (same-source `LINK` move now checked before `IFileLink` import).

## Goal

A Mneme tree node becomes a first-class **producer** of a drag descriptor that carries **two traits**, so the
drop is resolved generically — the target never switches on "what kind of object is this":

- **`LINK`** — the node *is* a link (`href` + `sourceId`). Drives the **same-root move** (the existing US-674
  `rename`). Same-window and **cross-window** (a root is global to the one shared sidecar, so it is the same
  files).
- **`IFileLink`** — the node can *yield file content* (`name` + `getBytes`). Drives the **copy/import** into a
  **different** Mneme root (incl. another Persephone window) via download → upload. **Copy only — the source is
  never deleted.**

Because a Mneme node carries both, and the drop dispatches purely by trait + source, an **OS file** (US-675,
`IFileLink` only) and a **future `http://` link** (when it adds an `IFileLink` impl whose `getBytes` fetches the
URL) become droppable into the Mneme tree with **zero tree/provider changes**.

## Resolved decisions (2026-06-16)

| # | Decision |
|---|----------|
| **Traits** | **Two traits, separated by concern.** `LINK` = identity/move; `IFileLink` = content/copy. `IFileLink` stays minimal (`name`, `getBytes`) — **no `href`** added; identity lives in `LINK`. A Mneme node implements both. |
| **Dispatch** | Generic view rule: **same-source `LINK` → move; else `IFileLink` → import/copy; else `LINK` → existing fallback.** No object-kind / scheme checks in the view. |
| **Move detect** | "Same source" = `LINK.getSourceId(data) === provider.sourceUrl`. For Mneme that is exactly "my own link, same root" (`sourceUrl = "mneme://{root}"`). Works cross-window (same root ⇒ same `sourceUrl`). **(C2)** |
| **C3** | No bespoke `IMnemeLink`. The Mneme node just implements the existing `LINK` + `IFileLink` traits (under a new `MnemeLink` trait-type id so its `IFileLink.getBytes` can read via Mneme). |
| **C4** | **Files only.** A dropped folder is skipped for cross-root copy; same-root folder move keeps working via `rename`. |
| **C5** | Cross-provider non-Mneme link drops unchanged (fall through to the existing `moveItems` fallback). |
| **C6** | Cross-root is a **copy** — source kept, never deleted. |
| **C8** | No size cap on the base64 copy (local loopback sidecar). |
| **C9** | **Update [`trait-system.md`](../../architecture/trait-system.md) within this task** — document the two-trait Mneme drag + refresh the stale registration map. |

## Background — what already exists (do not re-litigate)

### Trait DnD + cross-window (trait-system.md, US-675)

- A drag carries a **serializable** `{ typeId, data }`; `traitRegistry` (typeId → `TraitSet`) is the factory the
  **receiving** side uses to rebuild behavior. Only `{ typeId, data }` travels; the receiver resolves the
  `TraitSet` from *its own* registry — which is why trait drags **cross windows** (proven by the link→Rest
  Client cross-window import). A Mneme node has a real `dragstart`, so it uses `setTraitDragData` (the
  `application/persephone-trait` MIME) — **no expando** (that was US-675's OS-only workaround).
- **`LINK` trait** (`editors/link-editor/linkTraits.ts`): `getItems(data) → ILink[]`, `getSourceId(data)`.
- **`IFileLink` trait** (`core/traits/fileLinkTraits.ts`, US-675): `FILE_LINK` key; `FileLinkTrait.getFiles(data)
  → IFileLink[]`; `IFileLink = { name; filePath?; getBytes(): Promise<Uint8Array> }`. `OsFile` is the only
  producer today (OS desktop drops), implementing `IFileLink` only.

### Current Mneme drag source + drop dispatch

- `TreeProviderView` makes nodes draggable with `traitTypeId={TraitTypeId.ILink}` and
  `getDragData = (node) => ({ items: [node.data], sourceId: provider.sourceUrl })`
  (`TreeProviderView.tsx:160-164, 320-321`). For Mneme: `sourceUrl = "mneme://{root}"`,
  `node.data.href = "{root}/{path}"` (scheme-less; `MnemeTreeProvider.list:81`), plus `title` + `isDirectory`.
- `onTraitDrop` (`:179-193`) today: `FILE_LINK` first → `importFiles`, else `LINK` → `moveItems`.
  `canTraitDrop` (`:166-177`): accepts `FILE_LINK`, or a non-self `LINK`.
- `TreeProviderViewModel.moveItems` (`:720`) = intra-provider `rename`/`moveToCategory` (+ Move confirm).
  `importFiles` (`:777`) = target-folder calc + overwrite-confirm on clash + `provider.importFiles` + rebuild.
- `MnemeTreeProvider.importFiles` (`:165`) = `upload { path, contentBase64 }` per item (already exists, US-675).
- **Read (source bytes for copy):** `MnemeProvider.readBinary` (`:34`) = `client.readResource({ uri })` →
  `Buffer` from `contents[0].text|blob`. The Mneme `IFileLink.getBytes` reuses this logic.
- **Shared connection (US-673):** every window uses the same `mnemeConnection`/sidecar; root names are global,
  so any window can read any root's bytes by URI — this is what makes cross-window copy work.

## Design — Mneme node = `LINK` + `IFileLink`; generic source-based dispatch

A Mneme node drags under a **new `TraitTypeId.MnemeLink`** whose registered `TraitSet` implements **both**
traits. (We can't add `IFileLink` to the shared `ILink` set — that would make every file-tree/link-collection
drag falsely claim file content. So the Mneme drag needs its own trait-type id, the symmetric twin of US-675's
`OsFile`.)

| Trait on `MnemeLink` | Accessor behavior |
|---|---|
| `LINK` | `getItems(data) → data.items`; `getSourceId(data) → data.sourceId` (`"mneme://{root}"`) |
| `IFileLink` (`FILE_LINK`) | `getFiles(data) → data.items` (files only) → `{ name: title, getBytes: () => readMnemeBytes("mneme://" + href) }` — reconstructed in the **receiving** window via its `mnemeConnection` |

**Generic drop dispatch** (`TreeProviderView.onTraitDrop`, applies to all providers — no Mneme-specific code):

1. `LINK` present **and** `getSourceId(data) === provider.sourceUrl` → `moveItems` (rename). Same root, any
   window.
2. else `IFileLink` present → `importFiles(getFiles(data))` (copy: `getBytes` → `upload`). Mneme cross-root, OS
   files, future http.
3. else `LINK` present → `moveItems` (unchanged fallback for other providers' cross-tree link drops).

`OsFile` (US-675) has only `IFileLink` (no `LINK`) → always hits step 2 (unchanged). A same-root Mneme drag hits
step 1; a cross-root/cross-window Mneme drag has a non-matching `sourceId` so it falls to step 2 and copies. The
order **must** check the same-source `LINK` move before `IFileLink` (a Mneme node has both); re-verify OS files
still import after the reorder.

**`moveItems` and `importFiles` are reused unchanged.** For a cross-root copy, `IFileLink.getBytes` reads the
source by URI and the existing `importFiles` uploads it — the view-model needs no new method.

## Implementation plan

### Step 1 — `TraitTypeId.MnemeLink`

`src/renderer/core/traits/TraitRegistry.ts` — add `MnemeLink = "MnemeLink"` to the enum (TraitSet-registered
group, alongside `ILink`).

### Step 2 — `mnemeLinkTraits.ts` (new) — register the `MnemeLink` TraitSet

New file `src/renderer/content/tree-providers/mnemeLinkTraits.ts` (under `content/` so it may import
`mnemeConnection`; `core/traits/` must not depend on `api/`):

```ts
import type { ILink } from "../../api/types/io.tree";
import type { IFileLink } from "../../core/traits/fileLinkTraits";
import { FILE_LINK } from "../../core/traits/fileLinkTraits";
import { LINK } from "../../editors/link-editor/linkTraits";
import { TraitSet, TraitTypeId, traitRegistry } from "../../core/traits";
import { mnemeConnection } from "../../api/mneme-connection";

/** Serializable drag data for a Mneme node. `items[].href` is the scheme-less `{root}/{path}`;
 *  `sourceId` is the source provider's `sourceUrl` (`mneme://{root}`) — same value ⇒ same root ⇒ move. */
export interface MnemeLinkData {
    items: ILink[];
    sourceId?: string;
}

/** Read a Mneme file's bytes by scheme-less href via THIS window's shared connection
 *  (works cross-window — sidecar is shared, roots are global). Mirrors MnemeProvider.readBinary. */
async function readMnemeBytes(href: string): Promise<Uint8Array> {
    const client = mnemeConnection.getClient();
    if (!client) throw new Error("Mneme is not connected");
    const result = await client.readResource({ uri: `mneme://${href}` });
    const first = result.contents?.[0] as { text?: string; blob?: string } | undefined;
    if (first?.text !== undefined) return Buffer.from(first.text, "utf8");
    if (first?.blob !== undefined) return Buffer.from(first.blob, "base64");
    return Buffer.from("");
}

const mnemeLinkTraits = new TraitSet()
    .add(LINK, {
        getItems: (data) => (data as MnemeLinkData).items,
        getSourceId: (data) => (data as MnemeLinkData).sourceId,
    })
    .add(FILE_LINK, {
        getFiles: (data): IFileLink[] =>
            (data as MnemeLinkData).items
                .filter((i) => !i.isDirectory)                 // C4 — files only
                .map((i) => ({ name: i.title, getBytes: () => readMnemeBytes(i.href) })),
    });

traitRegistry.register(TraitTypeId.MnemeLink, mnemeLinkTraits);
```

### Step 3 — let a provider choose its drag trait-type id

`src/renderer/api/types/io.tree.d.ts` — add to `ITreeProvider` (optional, defaults to `ILink`):

```ts
/** Trait type id used when DRAGGING a node from this provider's tree. Defaults to `"ILink"`
 *  (LINK-only). Mneme returns `"MnemeLink"` so its drag also carries IFileLink (copy capability). */
readonly dragTraitTypeId?: string;
```

`src/renderer/content/tree-providers/MnemeTreeProvider.ts` — set
`readonly dragTraitTypeId = TraitTypeId.MnemeLink;` (import `TraitTypeId` from `core/traits`) and add
`import "./mnemeLinkTraits";` for the registration side-effect. (`importFiles` already exists — unchanged.)

### Step 4 — `TreeProviderView`: provider trait id + source-based dispatch

`src/renderer/components/tree-provider/TreeProviderView.tsx`

- `traitTypeId={writable ? (props.provider.dragTraitTypeId ?? TraitTypeId.ILink) : undefined}`. `getDragData`
  unchanged (`{ items: [node.data], sourceId: provider.sourceUrl }` is already the `MnemeLinkData` shape).
- `onTraitDrop` — same-source `LINK` move first, then `IFileLink` import, then fallback:
  ```ts
  const traits = resolveTraits(payload.typeId);
  const linkTrait = traits?.get(LINK);
  const items = linkTrait?.getItems(payload.data) ?? [];
  if (linkTrait && items.length && linkTrait.getSourceId?.(payload.data) === props.provider.sourceUrl) {
      model.moveItems(items, dropNode);                                   // 1. same root → move (any window)
      return;
  }
  const fileLink = traits?.get(FILE_LINK);
  if (fileLink) { void model.importFiles(fileLink.getFiles(payload.data), dropNode); return; }  // 2. copy
  if (linkTrait && items.length) { model.moveItems(items, dropNode); }    // 3. fallback (other providers)
  ```
- `canTraitDrop` unchanged (already accepts `FILE_LINK` or a non-self `LINK`).

### Step 5 — `trait-system.md` update (C9, in scope)

`doc/architecture/trait-system.md`:
- **Registration map** — refresh the stale "only ILink registered" note; add the `FILE_LINK` trait + `OsFile`
  producer (US-675) and the `MnemeLink` producer (LINK + IFileLink) with the Mneme tree as drag source + drop
  target.
- **"Tree Trait Integration"** — note `dragTraitTypeId` (provider-chosen drag type) and the same-source-move /
  File-trait-import dispatch as the cross-root/cross-window copy pattern.
- Keep it ticket-free per the docs rule (mechanism, not US numbers).

### Verification (confirm at build)

- **V1 — same-root move, same window:** drag a node onto another folder → rename, tree live-refreshes.
- **V2 — cross-root copy, same window:** two roots open; drag a file from root A onto a folder in root B → read
  from A, `upload` into B (overwrite-confirm on clash); A's file remains.
- **V3 — cross-window copy:** window 1 node → window 2 *different* root → copied via window 2's registry +
  shared sidecar.
- **V4 — cross-window same-root move:** window 1 "work" → window 2 "work" → move (rename), since
  `sourceId === sourceUrl`.
- **V5 — OS-file drop (US-675)** still imports (reordered dispatch; OsFile has no `LINK`).
- **V6 — folder drop cross-root** copies nothing (C4); same-root folder move still works (`rename`).

## Concerns / minor open items

- **Self-drop / same-folder move guard.** `canTraitDrop` already rejects dropping a single item onto itself;
  confirm a node dropped on its current parent folder is a no-op (rename to the same path) rather than an error.
- **Foreign non-file `LINK` on the Mneme tree (e.g. an `http://` link from the Link editor today).** It has
  `LINK`, no `IFileLink`, and a non-matching `sourceId`, so it hits step-3 `moveItems` → `rename` of a non-Mneme
  path → a harmless "Failed to move" notice. Acceptable for v1 (such drags are rare). A later refinement could
  make `canTraitDrop` capability-aware (accept a cross-source `LINK` only for link-import providers) so the
  affordance doesn't show — out of scope here. Once http links gain an `IFileLink` impl they import normally.
- **Registration timing (C7).** `mnemeLinkTraits` registers when `MnemeTreeProvider` loads; the drop-target
  window always has a Mneme tree (it *is* the target), so the `MnemeLink` typeId resolves there. Verify in V3;
  if needed, import `mnemeLinkTraits` from a stable Mneme entry point.

## Acceptance criteria

- [ ] Dragging a Mneme node within its own root moves it (rename) — same-window and cross-window (same root).
- [ ] Dragging a Mneme **file** onto a folder in a **different** Mneme root copies it (download→upload), with
      overwrite confirmation on name clash; the source file remains.
- [ ] Cross-**window** drag of a Mneme node into another window's Mneme tree works (copy for a different root,
      move for the same root) via the registry + shared sidecar.
- [ ] A dropped **folder** is not cross-root-copied (files only); same-root folder move is unchanged.
- [ ] OS-file drop (US-675) still imports through the same handler (dispatch reorder didn't regress it).
- [ ] No "what kind of object / which window" branch in the generic tree/view code — dispatch is by `LINK`
      (+ `sourceId`) and `IFileLink` only.
- [ ] `trait-system.md` updated (registration map + dispatch pattern).
- [ ] `npm run typecheck` + `eslint` clean; manual click-through covering V1–V6.

## Files Changed (planned)

| File | Change |
|------|--------|
| `src/renderer/core/traits/TraitRegistry.ts` | add `TraitTypeId.MnemeLink` |
| `src/renderer/content/tree-providers/mnemeLinkTraits.ts` | **new** — `MnemeLink` `TraitSet` (`LINK` move + `IFileLink` copy), `readMnemeBytes`, registration |
| `src/renderer/api/types/io.tree.d.ts` | add optional `readonly dragTraitTypeId?: string` to `ITreeProvider` |
| `src/renderer/content/tree-providers/MnemeTreeProvider.ts` | set `dragTraitTypeId = TraitTypeId.MnemeLink`; `import "./mnemeLinkTraits"` |
| `src/renderer/components/tree-provider/TreeProviderView.tsx` | pass `provider.dragTraitTypeId`; source-based dispatch in `onTraitDrop` (same-source `LINK` move before `IFileLink` import) |
| `doc/architecture/trait-system.md` | (C9) document the two-trait Mneme drag + refresh the registration map |

## Files that need NO change

- `mneme/` (Rust) — `read`/`resources/read` + `upload` already cover download + upload; **no server work**.
- `core/traits/fileLinkTraits.ts` — `IFileLink`/`FILE_LINK` reused as-is (stays minimal: `name` + `getBytes`).
- `core/traits/dnd.ts` — no expando needed; existing `setTraitDragData` carries the descriptor cross-window.
- `uikit/Tree/TreeModel.ts` — `traitTypeId`/`getDragData`/`canTraitDrop`/`onTraitDrop` already support this;
  only the *value* passed for `traitTypeId` changes (in `TreeProviderView`).
- `TreeProviderViewModel.moveItems` / `importFiles` — reused unchanged (copy rides the existing `importFiles`).
- `MnemeTreeProvider.importFiles` — already uploads; unchanged.
