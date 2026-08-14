# Trait System

## Overview

The trait system is a universal mechanism for **capability declaration and drag-and-drop type negotiation**. It was introduced in EPIC-026 as a foundational architectural primitive — on par with the state system and event channels.

### Problems it solves

1. **Drag-and-drop type safety** — Drop targets used to check ad-hoc string constants or proprietary MIME types. The trait system replaces those with typed, serializable payloads and a central registry.

2. **Cross-type drops** — A Notes category tree can accept dropped links from the link editor. The drop target checks if the payload's traits include `LINK` — without knowing what dragged it.

3. **React-DnD removal** — All drag-and-drop in the application is now native HTML5. The trait system provides the type-identification layer that React-DnD's type matching previously handled.

### What it does NOT do yet

The `TraitKey`/`TraitSet`/`Traited` primitives were designed for **component data adaptation** (replacing accessor function props like `getLabel`, `getIcon`, etc.) but this usage is not yet implemented. EPIC-025 (Component Library) will build on these primitives. Currently only the drag-and-drop part of the system is actively used.

---

## Core Primitives

All four types are in `/src/renderer/core/traits/traits.ts`, exported from `/src/renderer/core/traits/index.ts`.

### `TraitKey<T>`

A typed key for a specific capability. The phantom type `T` ensures `get()` returns the right implementation type.

```typescript
class TraitKey<T> {
    readonly symbol: symbol;
    constructor(readonly name: string);
}

// Usage: define a typed key once, use it everywhere
export const LINK = new TraitKey<LinkTrait>("Link");
```

### `TraitSet`

A bag of trait implementations. Supports method chaining.

```typescript
class TraitSet {
    add<T>(key: TraitKey<T>, impl: T): this;
    get<T>(key: TraitKey<T>): T | undefined;
    has(key: TraitKey<unknown>): boolean;
}

// Usage: define what a type "can be"
const linkTraits = new TraitSet()
    .add(LINK, {
        getItems: (data) => (data as LinkDragData).items,
        getSourceId: (data) => (data as LinkDragData).sourceId,
    });
```

### `Traited<V>`

Bundles a value with its capability descriptions.

```typescript
interface Traited<V = unknown> {
    readonly target: V;
    readonly traits: TraitSet;
}
```

### `traited()` and `isTraited()`

```typescript
// Create a Traited wrapper
function traited<V>(target: V, traits: TraitSet): Traited<V>;

// Type guard — distinguishes T[] from Traited<T[]>
function isTraited<V = unknown>(value: unknown): value is Traited<V>;
```

> **Why no auto-discovery?** Attaching a symbol property to an object was considered and rejected. Symbol properties are silently lost on object spread (`{...obj}`), `JSON.parse`/`stringify`, and Immer-produced copies. Only explicit `traited(data, traits)` is supported.

---

## TraitRegistry

Defined in `/src/renderer/core/traits/TraitRegistry.ts`.

`TraitSet` objects contain functions and **cannot survive serialization** — they cannot be stored in `dataTransfer` across windows. The registry bridges this gap: drag payloads carry a serializable `{ typeId, data }` pair, and drop targets look up the `TraitSet` from the registry by `typeId`.

```typescript
class TraitRegistry {
    register(typeId: TraitTypeId, traits: TraitSet): void;
    get(typeId: string): TraitSet | undefined;
    has(typeId: string): boolean;
}

export const traitRegistry = new TraitRegistry();  // Global singleton
```

### TraitTypeId enum

Every draggable type must have a `TraitTypeId`. Values are serializable strings.

```typescript
export enum TraitTypeId {
    // Data items (carry registered TraitSets)
    ILink             = "ILink",
    Note              = "Note",
    NotebookCategory  = "NotebookCategory",
    RestRequest       = "RestRequest",
    BrowserTab        = "BrowserTab",
    PinnedLink        = "PinnedLink",

    // Component-level reorder (type discriminator only — no TraitSet registered)
    PageTab           = "PageTab",
    GridColumn        = "GridColumn",
    MenuFolder        = "MenuFolder",
    PinnedEditor      = "PinnedEditor",
}
```

The first group (`ILink` through `PinnedLink`) have TraitSets registered, so drop targets can query their traits. The second group (`PageTab` and below) are used only as type discriminators — the drop handler checks `payload.typeId === TraitTypeId.PageTab` directly and doesn't need trait resolution.

### Registration

Registration happens once, at module load time, in the file that defines the trait:

```typescript
// src/renderer/editors/link-editor/linkTraits.ts
traitRegistry.register(TraitTypeId.ILink, linkTraits);
```

> **Registered TraitSets:** `ILink` (`LINK` *and* `FILE_LINK` — a link to a local file also yields its bytes), `OsFile` (the `FILE_LINK` trait), and `MnemeLink` (both `LINK` *and* `FILE_LINK`). The remaining `TraitTypeId` values (`Note`, `RestRequest`, etc.) are type discriminators only — their TraitSets are not registered. Cross-type drops include dropping links into the Notes category tree, dropping **OS files, file-tree nodes, or links into a link collection**, and dropping **OS files, local-file links, or Mneme nodes into the Mneme tree** via the `FILE_LINK` trait (see "File content drops" below).

---

## Drag-and-Drop Utilities

Defined in `/src/renderer/core/traits/dnd.ts`.

### Drag source helpers

```typescript
/**
 * Serialize a typed payload into the native dataTransfer.
 * Sets MIME type "application/persephone-trait".
 * Also sets effectAllowed = "move".
 */
function setTraitDragData(
    dataTransfer: DataTransfer,
    typeId: TraitTypeId,
    data: unknown,
): void;
```

### Drop target helpers

```typescript
/** Read and parse the trait payload. Returns null if not a trait drag. */
function getTraitDragData(dataTransfer: DataTransfer): TraitDragPayload | null;

/**
 * Check if a drag event carries trait data.
 * Use in onDragEnter/onDragOver to decide whether to accept.
 * Checks dataTransfer.types — works correctly before drop completes.
 */
function hasTraitDragData(dataTransfer: DataTransfer): boolean;

/** Look up the TraitSet from the registry by payload.typeId. */
function resolveTraits(typeId: string): TraitSet | undefined;
```

### Payload shape

```typescript
interface TraitDragPayload {
    typeId: string;   // Matches a TraitTypeId value
    data: unknown;    // Type-specific serializable payload
}
```

---

## Pattern: Adding a New Draggable Type

Follow these steps when introducing a new draggable data item (e.g., a new "RestRequest" drag).

### Step 1 — Add a TraitTypeId

In `/src/renderer/core/traits/TraitRegistry.ts`, add the new type to the enum:

```typescript
export enum TraitTypeId {
    // ... existing values ...
    MyNewType = "MyNewType",
}
```

### Step 2 — Define the trait interface and payload shape

Create a file co-located with the editor (e.g., `myEditorTraits.ts`):

```typescript
import { TraitKey, TraitSet, TraitTypeId, traitRegistry } from "../../core/traits";

// Payload — must be JSON-serializable
export interface MyDragData {
    id: string;
    // add other fields as needed
}

// Trait interface — what consumers can do with MyNewType
export interface MyTrait {
    getId(data: unknown): string;
    // add more accessors as needed
}

export const MY_TRAIT = new TraitKey<MyTrait>("MyTrait");

const myTraits = new TraitSet()
    .add(MY_TRAIT, {
        getId: (data) => (data as MyDragData).id,
    });

// Register at module load time
traitRegistry.register(TraitTypeId.MyNewType, myTraits);
```

### Step 3 — Wire the drag source

Import the traits file in the drag source component so the `traitRegistry.register()` call runs:

```typescript
import "../../myEditorTraits"; // side-effect: registers the trait

// In the drag handler:
const handleDragStart = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setTraitDragData(e.dataTransfer, TraitTypeId.MyNewType, { id: item.id });
    setIsDragging(true);
}, [item.id]);
```

### Step 4 — Wire the drop target

Check `hasTraitDragData` in `onDragOver`/`onDragEnter`, then handle in `onDrop`:

```typescript
const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const payload = getTraitDragData(e.dataTransfer);
    if (!payload) return;

    // Option A: exact type check
    if (payload.typeId === TraitTypeId.MyNewType) {
        const data = payload.data as MyDragData;
        doSomething(data.id);
        return;
    }

    // Option B: trait resolution (accepts multiple types that share a trait)
    const traits = resolveTraits(payload.typeId);
    if (traits?.has(MY_TRAIT)) {
        const trait = traits.get(MY_TRAIT)!;
        doSomething(trait.getId(payload.data));
    }
}, []);
```

---

## Pattern: Component-Level Reorder (Type Discriminator Only)

Some drags reorder items within a single component (tab reorder, grid column reorder, pinned editors). These don't need cross-type drops or trait resolution — the `TraitTypeId` is used only to confirm the drag originated from the right component. No `TraitSet` is registered.

Example from `BrowserTabsPanel.tsx`:

```typescript
// Drag source
const handleDragStart = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setTraitDragData(e.dataTransfer, TraitTypeId.BrowserTab, { tabId: tab.id });
    setIsDragging(true);
}, [tab.id]);

// Drop target
const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const payload = getTraitDragData(e.dataTransfer);
    if (!payload || payload.typeId !== TraitTypeId.BrowserTab) return;
    const data = payload.data as { tabId: string };
    model.moveTab(data.tabId, tab.id);
}, [model, tab.id]);
```

---

## Pattern: Nested Element dragEnterCount

HTML5 `onDragLeave` fires when entering a **child element** — without this fix, `isOver` flickers off briefly whenever the pointer crosses a child boundary. Fix with a counter:

```typescript
const dragEnterCount = useRef(0);

const handleDragEnter = useCallback((e: React.DragEvent) => {
    dragEnterCount.current++;
    if (hasTraitDragData(e.dataTransfer)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsOver(true);
    }
}, []);

const handleDragLeave = useCallback(() => {
    dragEnterCount.current--;
    if (dragEnterCount.current <= 0) {
        dragEnterCount.current = 0;
        setIsOver(false);
    }
}, []);

const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragEnterCount.current = 0;  // Reset on drop
    setIsOver(false);
    // ... handle drop
}, []);
```

**Required when:** The drop target element has child elements that can receive mouse events. Used in: `BrowserTabsPanel`, `FolderItem`, `PageTab`, `HeaderCell`.

**Not required when:** The element has no interactive children (e.g., a plain `<div>` with only text). Used in: `NoteItemView`, `PinnedLinksPanel`.

---

## Pattern: Live Reorder via onDragOver

For live reorder (item visually moves while dragging, before drop), `onDragOver` fires continuously and updates order on each call. A **module-level variable** tracks the dragging index (not React state, to avoid re-renders):

```typescript
// Module scope — survives re-renders, resets to -1 when drag ends
let draggingIndex = -1;

// In the component:
const handleDragStart = useCallback((e: React.DragEvent) => {
    draggingIndex = index;
    setTraitDragData(e.dataTransfer, TraitTypeId.MyType, { index });
    setIsDragging(true);
}, [index]);

const handleDragOver = useCallback((e: React.DragEvent) => {
    if (draggingIndex >= 0 && draggingIndex !== index) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onMove(draggingIndex, index);   // swap in parent state
        draggingIndex = index;          // update after each swap
    }
}, [index, onMove]);

const handleDragEnd = useCallback(() => {
    draggingIndex = -1;
    setIsDragging(false);
}, []);
```

**Used by:** `ToolsEditorsPanel` (pinned editor reorder), `PinnedLinksPanel`.

---

## Pattern: Tree Trait Integration

`Tree` has built-in trait drag-and-drop support via props — no custom handlers needed in the consumer:

```typescript
<Tree
    // ... standard tree props ...
    traitTypeId={TraitTypeId.NotebookCategory}  // Makes cells draggable
    getDragData={(item) => ({ category: item.category })}  // Payload for drag
    acceptsDrop                                  // Enables drop highlighting
    canTraitDrop={(dropItem, payload) => {        // Filter accepted types
        if (payload.typeId === TraitTypeId.Note) return true;
        return !!resolveTraits(payload.typeId)?.has(LINK);
    }}
    onTraitDrop={(dropItem, payload) => {         // Handle the drop
        vm.categoryTraitDrop(dropItem, payload);
    }}
/>
```

The `Tree` internally uses the same native HTML5 handlers (`onDragStart`, `onDragEnter`, etc.) with `dragEnterCount` for visual feedback. Return `null` from `getDragData` to prevent dragging a specific node.

**A tree drag may carry N items.** In a multi-select tree (`multiSelect`, currently the Explorer
panel only) a drag that starts on a *selected* row carries the whole selection; a drag on an
unselected row carries that row alone and leaves the selection untouched, the way Windows Explorer
behaves. `TreeProviderViewModel.dragItemsFor(node)` makes that call and feeds **both** payload
paths — `getDragData`'s `LinkDragData.items` and the native OS drag-out's path list. It prunes any
item living inside a dragged folder (the folder already carries them, and handing the OS
overlapping paths would copy the inner files twice) and never includes the tree root. Drop
consumers were already plural (`LinkDragData.items`, `FILE_LINK.getFiles`), so this changed the
payload size, not the contracts.

A drag source can choose its **trait-type id** instead of defaulting to `ILink`. `TreeProviderView` passes `provider.dragTraitTypeId ?? TraitTypeId.ILink`, so a provider whose nodes carry extra capabilities drags under its own registered TraitSet — e.g. `MnemeTreeProvider` returns `MnemeLink`, whose set implements `LINK` *and* `FILE_LINK`.

### Dragging files out to the OS (`onDragStartOverride`)

`Tree` also exposes `onDragStartOverride?(source, level, e) => boolean`, a first-chance `dragstart` hook that runs **before** the trait payload is built. Returning `true` signals that the handler took over the gesture (it already called `e.preventDefault()`); the `Tree` then skips its own trait-drag setup. This keeps UIKit free of Electron/IPC — the app layer supplies the native behavior.

`TreeProviderView` uses it so that **every** local-file-provider row drag is a native OS drag: it hands off to `webContents.startDrag` (via the `startOsFileDrag` IPC endpoint → `src/main/os-drag-service.ts`), producing a real Windows **CF_HDROP** drag that Windows Explorer and Microsoft Teams accept as a file copy. No modifier is needed.

One gesture serves both directions because a native OS drag dropped **back inside** a Persephone window re-enters as an ordinary OS file drop: `GlobalEventService.captureDrop` tags it (capture phase) with an `OsFile` (`FILE_LINK`) descriptor, so trait-aware drop targets receive it identically to a drop from Windows Explorer. The drag payload is therefore always `FILE_LINK` (never `LINK`/`sourceId`), which is why a drop into another Explorer folder is treated as an import rather than a same-source move — the move-vs-copy choice is instead offered at drop time (see the `FILE_LINK` import branch below). Non-file providers (Mneme, archive, link collections) don't start an OS drag; they keep the in-process HTML5 trait drag.

---

## Pattern: File Content Drops (`FILE_LINK`)

The `FILE_LINK` trait (`core/traits/fileLinkTraits.ts`) marks an object that can **yield file content**:

```typescript
interface IFileLink { name: string; filePath?: string; getBytes(): Promise<Uint8Array>; }
interface FileLinkTrait { getFiles(data: unknown): IFileLink[]; }
export const FILE_LINK = new TraitKey<FileLinkTrait>("FileLink");
```

A drop target dispatches **by trait + source + its own capability** — it never checks "what kind of object is this". `TreeProviderView` (the shared drop router for the Mneme, File, Archive, and link-collection trees) resolves the payload's traits and dispatches in this order:

1. `LINK` present **and** `getSourceId(data) === provider.sourceUrl` → **move** within the provider (file rename, or category reassign for a collection) — same store, even across windows.
2. else `LINK` present **and** the target implements `importLinks` → **catalog add/move** by href (store link metadata; a duplicate href is *moved* into the target category, not duplicated).
3. else file content present (`FILE_LINK.getFiles(data).length > 0`) **and** the target implements `importFiles` → **import/copy** the bytes (`getBytes()` → store). For the local-file provider (`supportsOsClipboard`), `TreeProviderView` routes this to `dropOsFilesInto`, which offers a **Move / Copy / Cancel** choice (Move only when the items are real files with a `filePath`) and applies it via `copyPathsInto`; other byte-backed targets (Mneme uploads) use the plain `importFiles` copy.
4. else **ignore** — there is no rename fallback, so a file-backed target never feeds a foreign href to `rename`.

Two target capabilities decide branches 2 and 3:

- **`importLinks`** (catalog targets — a link collection) — stores link metadata by href.
- **`importFiles`** (byte-backed targets — Mneme uploads, File tree writes) — copies file content.

**Links are checked before file content (branch 2 before 3)** so that any node exposing a usable link href — a Mneme document, an http link, a local-file path — becomes a proper link when dropped on a target that catalogs by reference, rather than being copied as bytes. Only catalog providers implement `importLinks`; file-backed targets (File, Mneme, Archive) have no `importLinks` and fall through to the byte-copy branch, so dropping a node *into* a Mneme root still copies the document. Every link href is a usable, openable URL (a Mneme node's href is the canonical `mneme://{root}/{path}` — see [`mneme-link.ts`](../../src/renderer/content/mneme-link.ts)), so there is no "broken href" case to guard against.

Because dispatch keys on traits + capability, a producer becomes droppable with **zero target changes**:

- **`ILink`** — any link; `LINK` (identity) **+** `FILE_LINK` (a link whose href is a *local file* yields its bytes via `fs`; a URL yields none). So a local-file link copies into Mneme, while a URL link is ignored there; a file dragged from the File tree creates a link in a collection or copies into Mneme.
- **`OsFile`** — OS desktop files/folders; `FILE_LINK` only; `getBytes` reads from disk.
- **`MnemeLink`** — a Mneme tree node; `LINK` (so a same-root drop moves) **+** `FILE_LINK` (so a drop into a *different* Mneme root — or another window — copies the document via download → upload; `getBytes` reads the source over MCP through the shared connection).

The `LINK`/`FILE_LINK` split keeps each trait single-purpose: identity lives in `LINK`, content in `FILE_LINK`. A node can carry both; the dispatch order and the target's declared capabilities decide what actually happens.

---

## Current Registration Map

| TraitTypeId | Drag source | Drop targets | TraitSet registered |
|---|---|---|---|
| `ILink` | `LinksList`, `LinksTiles`, `TreeProviderView` | `TreeProviderView` (link collection, Mneme tree), `NotebookEditor` | Yes — `LINK` + `FILE_LINK` traits |
| `Note` | `NoteItemView` | `NotebookEditor` category tree | No |
| `NotebookCategory` | `NotebookEditor` category tree (via Tree) | `NotebookEditor` category tree | No |
| `RestRequest` | `RestClientEditor` | `RestClientEditor` (reorder) | No |
| `BrowserTab` | `BrowserTabsPanel` | `BrowserTabsPanel` (reorder) | No |
| `PinnedLink` | `PinnedLinksPanel` | `PinnedLinksPanel` (reorder) | No |
| `PageTab` | `PageTab` | `PageTab` (reorder) | No |
| `GridColumn` | `HeaderCell` | `HeaderCell` (reorder) | No |
| `MenuFolder` | `FolderItem` (sidebar) | `FolderItem` (reorder) | No |
| `PinnedEditor` | `ToolsEditorsPanel` | `ToolsEditorsPanel` (reorder) | No |
| `OsFile` | OS desktop file drag (synthesized in the capture-phase drop handler) | `TreeProviderView` (Mneme tree, link collection import) | Yes — `FILE_LINK` trait |
| `MnemeLink` | `TreeProviderView` (Mneme tree) | `TreeProviderView` (Mneme tree) | Yes — `LINK` + `FILE_LINK` traits |

---

## Key Files

| Purpose | File |
|---------|------|
| Core primitives (TraitKey, TraitSet, Traited) | `/src/renderer/core/traits/traits.ts` |
| TraitRegistry + TraitTypeId enum | `/src/renderer/core/traits/TraitRegistry.ts` |
| Drag-and-drop utilities | `/src/renderer/core/traits/dnd.ts` |
| Public exports | `/src/renderer/core/traits/index.ts` |
| ILink trait definition + registration | `/src/renderer/editors/link-editor/linkTraits.ts` |
| Tree trait props | `/src/renderer/uikit/Tree/TreeModel.ts` |
