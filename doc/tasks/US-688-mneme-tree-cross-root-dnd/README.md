# US-688 — Mneme tree: own drag-drop via `IMnemeLink` (intra-tree move + cross-root copy)

**Status:** Planned — design intent captured; full investigation/plan when work starts.
**Epic:** EPIC-032 (Mneme), Phase 4/5. **Builds directly on [US-675](../US-675-mneme-tree-file-drop/README.md)**
(the `IFileLink` trait, the `{ typeId, data }`-descriptor + registry foundation, `getTraitDragDataFromEvent`,
and the Mneme tree's `importFiles` path).

## Goal

Reimplement the Mneme tree's **own** drag-and-drop on the trait-descriptor foundation so that a dragged Mneme
node carries an **`IMnemeLink`** trait (alongside `ILink`), and the drop is resolved purely by trait + root:

- **Same root** → **move** (the existing US-674 rename path).
- **Another Mneme root** → **download → upload** (read bytes from the source root via the Mneme `read`/`upload`
  tools, write into the target root) — a **new cross-root copy capability**.
- **`IFileLink`** (e.g. an OS file) → **upload** — already handled by US-675; this task just keeps it in the
  same trait-dispatch handler.

This makes a Mneme node a first-class **producer** of trait descriptors (not just a consumer), so it can be
dragged into other trait-aware targets (another Mneme root, a future Explorer, the Link editor) and dropped,
all through the registry/`{ typeId, data }` mechanism — including **cross-window** (the descriptor serializes,
unlike US-675's in-window OS-file expando).

## Background (foundation from US-675 — do not re-litigate)

- Drags carry a serializable **descriptor** `{ typeId, data }`; `traitRegistry` is the factory that rebuilds
  the real object via trait accessors. Cross-window works because the descriptor rides the MIME and is
  resolved by the receiving window's registry (proven by the link→Rest Client cross-window import).
- US-675 added the **`IFileLink`** trait (`core/traits/fileLinkTraits.ts`) and the tree's trait-dispatch drop
  (`IFileLink` → import, `LINK` → move) plus `getTraitDragDataFromEvent`.
- Mneme tree move within a root already exists (US-674: `rename`).

## Design intent (to be detailed at task start)

- **New `IMnemeLink` trait** — `{ root; path; getBytes(): Promise<Uint8Array> }` (or similar), registered under
  a new `TraitTypeId.MnemeLink`. The Mneme node drag source attaches a descriptor implementing **`IMnemeLink` +
  `ILink`** (serializable `{ root, path }` data; `getBytes` reconstructed by the registry via the Mneme `read`
  tool). Decide whether `IMnemeLink` should also imply `IFileLink` (so any tree that accepts files also accepts
  Mneme nodes) — likely yes, which would make cross-root copy "just" the `IFileLink` import path.
- **Drop dispatch in the Mneme tree** (one handler, by trait):
  1. `IMnemeLink` + **same root** → `moveItems` (existing rename).
  2. `IMnemeLink` + **different root** → cross-root copy: `getBytes()` (source `read`) → `upload` into target.
  3. `IFileLink` (no `IMnemeLink`) → `upload` (US-675 path).
  4. `LINK` only → existing link-move/none.
- **Cross-window**: because the descriptor is serializable and the registry is per-window, dragging a Mneme
  node from window A's tree into window B's tree should reconstruct + copy via the registry (verify, mirroring
  the link→Rest Client behavior).

## Open questions (resolve at task start)

- Does `IMnemeLink` subsume `IFileLink` (one import path) or stay distinct (move vs copy needs the root pair)?
- Cross-root copy semantics: copy (keep source) vs move (delete source after) — and conflict policy in target
  (reuse US-675's `ui.confirm` overwrite).
- Folder (category) cross-root copy: recursive download→upload of a subtree — scope/perf.
- Whether to migrate the Mneme tree's current MIME-`LINK` move to the unified descriptor handler, or leave it.

## Acceptance criteria (draft)

- [ ] Dragging a Mneme node within its root moves it (unchanged from US-674).
- [ ] Dragging a Mneme node into a **different** Mneme root copies it there (download→upload), with overwrite
      confirmation on name clash.
- [ ] Cross-window drag of a Mneme node into another window's Mneme tree works via the registry.
- [ ] OS-file drop (US-675) still works through the same trait-dispatch handler.
- [ ] `npm run typecheck` + `eslint` clean; manual click-through.
