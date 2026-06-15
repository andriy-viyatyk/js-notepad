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
    TodoItem          = "TodoItem",
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

> **Registered TraitSets:** `ILink` (the `LINK` trait), `OsFile` (the `FILE_LINK` trait), and `MnemeLink` (both `LINK` *and* `FILE_LINK`). The remaining `TraitTypeId` values (`TodoItem`, `Note`, etc.) are type discriminators only — their TraitSets are not registered. Cross-type drops include dropping links into the Notes category tree, and dropping **OS files or Mneme nodes into the Mneme tree** via the `FILE_LINK` trait (see "File content drops" below).

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

Example from `TodoItemView.tsx`:

```typescript
// Drag source
const handleDragStart = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setTraitDragData(e.dataTransfer, TraitTypeId.TodoItem, { id: item.id });
    setIsDragging(true);
}, [item.id]);

// Drop target
const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const payload = getTraitDragData(e.dataTransfer);
    if (!payload || payload.typeId !== TraitTypeId.TodoItem) return;
    const data = payload.data as { id: string };
    pageModel.moveItem(data.id, item.id);
}, [item.id, pageModel]);
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

**Not required when:** The element has no interactive children (e.g., a plain `<div>` with only text). Used in: `TodoItemView`, `NoteItemView`, `PinnedLinksPanel`.

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

A drag source can choose its **trait-type id** instead of defaulting to `ILink`. `TreeProviderView` passes `provider.dragTraitTypeId ?? TraitTypeId.ILink`, so a provider whose nodes carry extra capabilities drags under its own registered TraitSet — e.g. `MnemeTreeProvider` returns `MnemeLink`, whose set implements `LINK` *and* `FILE_LINK`.

---

## Pattern: File Content Drops (`FILE_LINK`)

The `FILE_LINK` trait (`core/traits/fileLinkTraits.ts`) marks an object that can **yield file content**:

```typescript
interface IFileLink { name: string; filePath?: string; getBytes(): Promise<Uint8Array>; }
interface FileLinkTrait { getFiles(data: unknown): IFileLink[]; }
export const FILE_LINK = new TraitKey<FileLinkTrait>("FileLink");
```

A drop target that accepts file content dispatches **purely by trait + source** — it never checks "what kind of object is this":

1. `LINK` present **and** `getSourceId(data) === provider.sourceUrl` → **move** (intra-provider rename) — same store, even across windows.
2. else `FILE_LINK` present → **import/copy** (`getBytes()` → store the bytes).
3. else `LINK` present → existing cross-source link handling.

Because dispatch keys on the trait, any `FILE_LINK` producer becomes droppable with **zero target changes**:

- **`OsFile`** — OS desktop files; `FILE_LINK` only; `getBytes` reads from disk.
- **`MnemeLink`** — a Mneme tree node; `LINK` (so a same-root drop moves) **+** `FILE_LINK` (so a drop into a *different* Mneme root — or another window — copies the document via download → upload; `getBytes` reads the source over MCP through the shared connection).

The `LINK`/`FILE_LINK` split keeps each trait single-purpose: identity lives in `LINK`, content in `FILE_LINK`. A future `http://` link could add a `FILE_LINK` impl (where `getBytes` fetches the URL) and instantly become droppable into the Mneme tree.

---

## Current Registration Map

| TraitTypeId | Drag source | Drop targets | TraitSet registered |
|---|---|---|---|
| `ILink` | `LinksList`, `LinksTiles`, `TreeProviderView` | `TreeProviderView` (link editor), `NotebookEditor` | Yes — `LINK` trait |
| `TodoItem` | `TodoItemView` | `TodoItemView` (reorder) | No |
| `Note` | `NoteItemView` | `NotebookEditor` category tree | No |
| `NotebookCategory` | `NotebookEditor` category tree (via Tree) | `NotebookEditor` category tree | No |
| `RestRequest` | `RestClientEditor` | `RestClientEditor` (reorder) | No |
| `BrowserTab` | `BrowserTabsPanel` | `BrowserTabsPanel` (reorder) | No |
| `PinnedLink` | `PinnedLinksPanel` | `PinnedLinksPanel` (reorder) | No |
| `PageTab` | `PageTab` | `PageTab` (reorder) | No |
| `GridColumn` | `HeaderCell` | `HeaderCell` (reorder) | No |
| `MenuFolder` | `FolderItem` (sidebar) | `FolderItem` (reorder) | No |
| `PinnedEditor` | `ToolsEditorsPanel` | `ToolsEditorsPanel` (reorder) | No |
| `OsFile` | OS desktop file drag (synthesized in the capture-phase drop handler) | `TreeProviderView` (Mneme tree import) | Yes — `FILE_LINK` trait |
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
