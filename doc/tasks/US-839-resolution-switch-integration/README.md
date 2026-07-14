# US-839: Resolution + switch integration (the crux)

**Epic:** [EPIC-042 — Boards as Custom Editors](../../epics/EPIC-042.md)
**Depends on:** US-836 (manifest `fileMasks`/`editorPriority`), US-837 (custom-editor registry), US-838 (filePath into the board)
**Status:** 📝 Carved — awaiting "let's implement"

## Goal

Wire the (already-built, inert) custom-editor registry into Persephone's file-open **resolution** and the editor **switch widget**, so a trusted file-associated board:
1. becomes the **default** editor for its `fileMasks` when its `editorPriority` beats the built-in claimant, and
2. always appears as a **switch option** next to Monaco/Grid/etc. for matching local files, and can be switched **to** and **back from** without a shared content host — handing the board the target `filePath` via `initFromBoardRoot(root, filePath)` (US-838's delivery, which is inert until this task calls it).

After this task, opening `diagram.drawio` (with a trusted board claiming `*.drawio` at priority > 0) opens the board directly, `persephone.getFilePath()` resolves to the file, and the switch widget lets the user flip to Monaco and back.

## Background — verified call graph (2026-07-14)

### File-open resolution (the ONLY live path — `resolveForFile` is dead)
- `PagesLifecycleModel.newEditorModel(filePath)` (`PagesLifecycleModel.ts:262`) → `editorRegistry.resolveId(filePath) ?? "monaco"` → `buildEditorById(targetId, filePath)`.
- `buildEditorById` (`:277`): `getById(id)`; if `!def || def.hasContentHost` → `newTextFileModel(filePath)`; else a `switch (editorId)` with a per-id `case` (`pdf-view`, `image-view`, `archive-view`, `video-view`, `category-view`, `git-tree`, `mneme-root`, **`board-view`**, `toolset-view`) each doing `mod.default.newEditorModel(filePath)`; `default:` → `newTextFileModel`.
- ⚠️ A `board-editor:<root>` id has **no** registered def → `getById` returns undefined → `!def` true → it would fall to `newTextFileModel` (**silent text open** — the bug to avoid). The board branch must be added **before** the `!def` check.
- `newTextFileModel(filePath)` (`TextEditorModel.ts:440`) itself calls `editorRegistry.resolveId(filePath)` to set `state.editor`. **This is why the merge must NOT be baked into `editorRegistry.resolveId`** — every `newTextFileModel` and `resolvers.ts` call would then see a board id. All real-path `newTextFileModel(filePath)` calls are inside `buildEditorById` (guarded by the new board branch fired first); every other `newTextFileModel("")` passes an empty string. So the merge lives in a **separate resolver helper** consumed at the decision points (CE6 "two registries, merged at the query points").

### Switch widget
- `SwitchWidget` (`PageToolbar.tsx:60`) calls `model.findCompatibleEditors()`, guards `options.length < 2 || !options.includes(model.editorId)`, labels each via `editorRegistry.getById(id)?.name ?? id`, renders a `SegmentedControl value={model.editorId}`, and switches via `page.switchMainEditor(id)`.
- **16 editors** (`MonacoEditor`, `GridEditor`, `MarkdownEditor`, `SvgEditor`, `HtmlEditor`, `MermaidEditor`, `GraphEditor`, `DrawEditor`, `LinkEditor`, `TodoEditor`, `RestClientEditor`, `NotebookEditor`, `LogViewEditor`, `FileDiffEditor`, and any peer) share the identical body: `if (!this._host) return []; return editorRegistry.findEditorsAccepting(this._host)`. `findEditorsAccepting` skips `!hasContentHost` defs (`editorRegistry.ts:116`), so a board never appears there. **We do NOT touch these 16** — the board options are appended in the widget itself (single merge point). Base `EditorModel.findCompatibleEditors()` returns `[]` (`:191`).

### Switch mechanics
- `PageModel.switchMainEditor(newEditorId)` (`PageModel.ts:450`): early-returns if `oldEditor.editorId === newEditorId`; `editorRegistry.getById(newEditorId)` and **throws** for an unregistered id; then `createEditor(id).switchFrom(old)` → `restore()` → `setMainEditor`. `MonacoEditor.switchFrom` (and peers) extract the CONTENT_HOST_TRAIT from the old editor — **a board has no such trait, so both directions across a board boundary must bypass the host-inheriting path** and rebuild fresh from the file (CE4: dispose-and-rebuild).
- `setMainEditor` (`PageModel.ts:397`) disposes the old main iff `!contributesPanels() && !keepAliveOnNavigation()` — so switching **to** a board disposes the Monaco host (Monaco has no panels / keep-alive), matching CE4 "the board switch releases the Monaco host". Switching **back** disposes the (non-busy) board.
- `createEditorFromFile(filePath, pipe?, target?, title?)` (`PagesLifecycleModel.ts:334`, **public**) builds a fresh editor from a file path (via `newEditorModel` when no target, or `newEditorModelByTarget → buildEditorById(target,…)` when a target is given) and `await`s `restore()`. Reachable from `PageModel` via `const { pagesModel } = await import("../pages"); pagesModel.lifecycle.createEditorFromFile(...)`. `wrap` = `attachEditorToPage` (exported from `PagesLifecycleModel.ts`) turns a returned text host into its editor class (dispatch on `state.editor`); a returned `EditorModel` (e.g. the board) is passed through unchanged.

### Identity + persistence
- `BoardEditorModel.editorId` is the constant `"board-view"` (`BoardEditorModel.ts:74`). The switch list uses `board-editor:<root>` — so the widget guard `!options.includes(model.editorId)` would hide the widget and `SegmentedControl value` would match no segment. Fix: **dynamic `editorId`** — `board-editor:<root>` when acting as a custom editor (has a filePath), else `"board-view"`.
- **Persistence hazard:** `getRestoreData()` (base, `:341`) persists `this.editorId`. `PagesPersistenceModel.restorePage` (`:63`) keys the restore branch on the persisted `d.editorId`: the zombie-guard (`:75` `=== "board-view"`), and `NO_HOST_EDITOR_IDS.has(d.editorId)` (`:101`, set includes `"board-view"` only) → `createEditor(d.editorId)`. A persisted `board-editor:<root>` would miss both → the board is **dropped on restore** (and `createEditor("board-editor:<root>")` would throw — no such registered id). Fix: **`BoardEditorModel` overrides `getRestoreData()` to force `editorId: "board-view"`** — the virtual id is re-derived from the persisted `state.filePath`/`state.boardRoot` on restore. This also keeps cross-window page moves working (same descriptor path).
- **MCP/automation board detection** keys on `editorId === "board-view"` at: `automation/commands.ts:44` (`isBoardEditor` → `browser_*` target resolution), `mcp-handler.ts:210` (`get_active_page` surfaces `boardRoot`/`selectedBoard`), `:241` (`hintForEditor`), `:693` (`board_refresh`). A dynamic id breaks all four for a custom-editor board — so the DrawIO proving ground (US-840) couldn't be driven by `browser_*` and `get_active_page` would drop board metadata. Fix: broaden each to accept **both** ids via a shared `isBoardEditorId(id)` helper.

## Implementation plan

### Step 1 — Shared local-file predicate (`core/utils/file-path.ts`)
The board switch/default is offered **only for a real local file** (CE4 — hidden for `https://`, archive entries, `data:`, and virtual schemes like `tree-category://`/`mneme://`). Add one exported helper reused by the resolver, the widget, and `BoardEditorModel`:

```ts
/** True for a plain local filesystem path — no `scheme://`, no `data:`, no
 *  archive `!entry` bang. Windows drive paths (`C:\…`, `C:/…`) qualify (no `://`).
 *  Gates custom-editor-board resolution/switch (EPIC-042 CE4). */
export function isPlainLocalPath(p: string): boolean {
    if (!p) return false;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return false; // http(s)://, mneme://, tree-category://, …
    if (p.startsWith("data:")) return false;
    if (p.includes("!")) return false;                    // archive entry (archivePath!entryPath)
    return true;
}
```

### Step 2 — Merged resolver helper (`editors/board/custom-editor-registry.ts`)
Add a pure function that merges the built-in and board registries with the CE1 priority ladder + CE2 tie-break (built-in wins ties → board must be **strictly** greater). Also export `isBoardEditorId` (used by the MCP/automation sites in Step 8). Keep both registries separate (CE6) — this only *reads* both.

```ts
import { editorRegistry } from "../base/editorRegistry";
import { isPlainLocalPath } from "../../core/utils/file-path";

/** Resolve the winning editor id for opening a file, merging the built-in registry
 *  with trusted file-associated boards (EPIC-042). A board wins only when it is a
 *  real local file (CE4) and its priority is STRICTLY greater than the best built-in
 *  (CE2: built-ins win ties; among boards, trusted-list order — getBoardsForFile order). */
export function resolveEditorIdForFile(filePath?: string): string | undefined {
    const builtinDef = filePath ? editorRegistry.resolve(filePath) : undefined;
    const builtinId = builtinDef?.id;
    if (!filePath || !isPlainLocalPath(filePath)) return builtinId;
    const builtinPriority = builtinDef?.match?.acceptFile?.(filePath) ?? 0;
    let best: CustomEditorMatch | undefined;
    for (const b of customEditorRegistry.getBoardsForFile(filePath)) {
        if (!best || b.priority > best.priority) best = b; // strict → first (earliest trusted) wins board ties
    }
    if (best && best.priority > builtinPriority) return best.editorId;
    return builtinId;
}

/** True for either board editor id form — the plain `board-view` or a custom-editor
 *  `board-editor:<root>`. Used by MCP/automation board detection (Step 8). */
export function isBoardEditorId(id: string | undefined): boolean {
    return id === "board-view" || (!!id && parseBoardEditorId(id) !== null);
}
```

### Step 3 — Resolution merge at the decision point (`PagesLifecycleModel.ts`)
Only `newEditorModel` (the fresh-open resolver) changes. `resolvers.ts:161/178` and the two `explicitTarget !== editorRegistry.resolveId(...)` guards (`:563`, `:845`) stay on the **built-in** `resolveId` (they detect explicit host-target opens; boards aren't host editors).

```ts
// before (:262)
private newEditorModel = async (filePath?: string): Promise<EditorOrHost> => {
    const targetId = editorRegistry.resolveId(filePath) ?? "monaco";
    return this.buildEditorById(targetId, filePath);
};
// after
private newEditorModel = async (filePath?: string): Promise<EditorOrHost> => {
    const targetId = resolveEditorIdForFile(filePath) ?? "monaco";
    return this.buildEditorById(targetId, filePath);
};
```

### Step 3b — openRawLink resolution (`content/resolvers.ts`, file resolver `:159–162`)
The file resolver (Layer 2) computes `data.target` for a plain path. Swap the built-in-only `resolveId` for the merged resolver **only for plain local files** (CE4); archives/virtual paths keep built-in resolution. No other line changes — the existing pipe build + `openContent` fire carry the real path to the open-handler.

```ts
// before
data.target = data.target
    || editorRegistry.resolveId(extractEffectivePath(data.url))
    || "monaco";
// after — plain local file → merged (built-in + trusted boards, EPIC-042); a
// winning board becomes the target and its file rides the normal openFile path
// (→ buildEditorById board branch → initFromBoardRoot). Archive/virtual sources
// never route to a board (CE4).
data.target = data.target
    || (isPlainLocalPath(data.url)
            ? resolveEditorIdForFile(data.url)
            : editorRegistry.resolveId(extractEffectivePath(data.url)))
    || "monaco";
```
Imports for `resolvers.ts`: `resolveEditorIdForFile` from `../editors/board/custom-editor-registry`, `isPlainLocalPath` from `../core/utils/file-path`. (The HTTP resolver returns early at `:110` on `isHttpUrl`, so `data.url` here is never http; virtual `://` paths return earlier at the `!pipeDescriptor` branch `:141–156`. So this line only ever sees a real file or archive path.) The `mneme://` resolver (`:178`) is left on built-in `resolveId` — mneme docs are not local files (CE4).

### Step 4 — Construction branch (`PagesLifecycleModel.buildEditorById`, `:277`)
Add the board branch **first**, before `const def = editorRegistry.getById(editorId)`:

```ts
private buildEditorById = async (editorId: string, filePath?: string): Promise<EditorOrHost> => {
    const boardRoot = parseBoardEditorId(editorId);
    if (boardRoot !== null) {
        const { boardModule } = await import("../../editors/board");
        const model = boardModule.createEditor() as unknown as BoardEditorModel;
        model.initFromBoardRoot(boardRoot, filePath); // US-838: sets state.filePath → getFilePath()
        return model as unknown as EditorOrHost;
    }
    const def = editorRegistry.getById(editorId);
    // …unchanged…
};
```
(`parseBoardEditorId`, `resolveEditorIdForFile` imported from `../../editors/board/custom-editor-registry`; `BoardEditorModel` type imported for the cast.)

### Step 5 — Dynamic identity + persistence + filePath getter (`BoardEditorModel.ts`)
```ts
// was: readonly editorId = "board-view";
get editorId(): string {
    const root = this.state.get().boardRoot;
    return root && this.currentFilePath() ? boardEditorId(root) : "board-view";
}

/** Persist the STABLE id so restore/cross-window keys on "board-view" (NO_HOST_EDITOR_IDS
 *  + the zombie guard); the virtual id is re-derived from persisted state on restore. */
override getRestoreData() {
    const data = super.getRestoreData();
    data.editorId = "board-view";
    return data;
}

/** Merge both filePath sources so host-less consumers (switch widget, switchMainEditor
 *  extraction) read a single value. */
override get filePath(): string | undefined {
    return this.currentFilePath();
}

/** Built-in fallback + this board, so the widget shows while ON the board and can
 *  switch back (CE4). Board peers claiming the same file are appended by the widget. */
override findCompatibleEditors(): string[] {
    const filePath = this.currentFilePath();
    const root = this.state.get().boardRoot;
    if (!filePath || !root || !isPlainLocalPath(filePath)) return [];
    const builtinId = editorRegistry.resolveId(filePath) ?? "monaco"; // built-in only (self is the board)
    return [builtinId, boardEditorId(root)];
}
```
Imports: `boardEditorId` from `./custom-editor-registry`, `editorRegistry` from `../base/editorRegistry`, `isPlainLocalPath` from `../../core/utils/file-path`.

### Step 6 — Switch widget merge + labels (`PageToolbar.tsx` `SwitchWidget`)
Append board options for the current file (single merge point, CE6); subscribe reactively so a trust/mask change updates the widget; resolve board labels from the registry.

```tsx
const options = model.findCompatibleEditors();
const filePath = (model.contentHost as { filePath?: string } | null)?.filePath ?? model.filePath;
const boardMatches = customEditorRegistry.useBoardsForFile(
    filePath && isPlainLocalPath(filePath) ? filePath : "",
);
const merged = [...options];
for (const b of boardMatches) if (!merged.includes(b.editorId)) merged.push(b.editorId);
if (merged.length < 2 || !merged.includes(model.editorId)) return null;
const boardNameById = new Map(boardMatches.map((b) => [b.editorId, b.name]));
const items: ISegment[] = merged.map((id) => ({
    value: id,
    label: boardNameById.get(id) ?? editorRegistry.getById(id)?.name ?? id,
}));
```

### Step 7 — Board-boundary switch (`PageModel.switchMainEditor`, `:450`)
Detect a board on either side; extract the file, run the CE4 release guard, rebuild fresh through `createEditorFromFile` with `target = newEditorId` (unified for both directions), then `setMainEditor`. Leave the existing host-inheriting path untouched for non-board switches.

```ts
async switchMainEditor(newEditorId: string): Promise<void> {
    const oldEditor = this.mainEditorInstance;
    if (!oldEditor) return;
    if (oldEditor.editorId === newEditorId) return;

    const boardInvolved =
        parseBoardEditorId(newEditorId) !== null || parseBoardEditorId(oldEditor.editorId) !== null;
    if (boardInvolved) {
        const filePath =
            (oldEditor.contentHost as { filePath?: string } | null)?.filePath ?? oldEditor.filePath;
        if (!filePath) return;
        const released = await oldEditor.confirmRelease(); // CE4 Save/Don't-Save/Cancel
        if (!released) return;                             // Cancel → stay put
        const { pagesModel } = await import("../pages");
        const built = await pagesModel.lifecycle.createEditorFromFile(filePath, undefined, newEditorId);
        // Honor an explicit built-in target that differs from the file's natural resolveId
        // (mirrors openFile / navigatePageTo); no-op for board targets.
        if (built.state.get().type === "textFile" && parseBoardEditorId(newEditorId) === null) {
            built.state.update((s) => { (s as { editor?: string }).editor = newEditorId; });
        }
        await this.setMainEditor(attachEditorToPage(built));
        return;
    }

    const { editorRegistry } = await import("../../editors/base");
    const def = editorRegistry.getById(newEditorId);
    if (!def) throw new Error(`No editor registered for id: ${newEditorId}`);
    const newEditor = await editorRegistry.createEditor(newEditorId);
    newEditor.switchFrom(oldEditor);
    await newEditor.restore();
    await this.setMainEditor(newEditor);
}
```
Imports for `PageModel.ts`: `parseBoardEditorId` from `../../editors/board/custom-editor-registry`, `attachEditorToPage` from `./PagesLifecycleModel`. (`createEditorFromFile` already `await`s `restore()`, so no extra restore.)

### Step 8 — Broaden board detection for MCP/automation
Replace the bare `=== "board-view"` checks with `isBoardEditorId(...)` so a custom-editor board is still automatable and reported:
- `automation/commands.ts:44` — `isBoardEditor`: `isBoardEditorId((e as {editorId?}).editorId)`.
- `mcp-handler.ts:210` — `get_active_page` board-metadata block.
- `mcp-handler.ts:693` — `board_refresh` guard.
- `mcp-handler.ts:237` `hintForEditor` — convert the `case "board-view"` to an `if (isBoardEditorId(editorId)) return "…board page…";` before the `switch` (a dynamic id can't be a `case` label).

### Step 9 — Eager bootstrap init (`register-editors.ts`)
`resolveEditorIdForFile` is sync; the registry loads manifests async. Warm it once at startup so the first file open resolves correctly (US-837 records this seam). Append to the bottom of `register-editors.ts` (already a startup side-effect import from `renderer/index.tsx:5`):

```ts
import { customEditorRegistry } from "./board/custom-editor-registry";
// Warm the custom-editor registry so file-open resolution sees trusted boards
// from the first open (sync resolveId; async manifest load). Safe pre-init: an
// unresolved registry yields [] → built-in fallback (EPIC-042 / US-837).
void customEditorRegistry.ensureInitialized();
```

## Concerns / open questions

- **CC1 — Explicit-target guards untouched (verified safe).** `explicitTarget !== editorRegistry.resolveId(...)` (`:563`, `:845`) and `resolvers.ts:161/178` intentionally keep the **built-in** `resolveId`. Boards aren't host-target editors, so a board default never mislabels an explicit host target. No change.
- **CC2 — openRawLink path. ✅ resolved (user, 2026-07-14): route it too, via the file resolver.** `openRawLink` is the universal open entry (Link editor, another board calling `openRawLink`, MCP, drag-drop), so a `.drawio` opened by a raw link must land in the registered board. Implemented as **Step 3b** — a one-line target swap in `resolvers.ts` reusing `resolveEditorIdForFile`. Key design points verified against the pipeline:
  - **No URL rewrite** — `data.url` stays the real file path, only `data.target` becomes `board-editor:<root>`. The board's `filePath` rides the normal `openFile(filePath, pipe, {target})` positional arg → `buildEditorById` board branch → `initFromBoardRoot(root, filePath)` (sets `state.filePath`). No `data.filePath` metadata needed.
  - **No `matchesNavigationTarget` collision** — that per-board-singleton reuse is scoped to `target === "board-view"` (`BoardEditorModel.ts:147` returns false for any other target), so two `.drawio` files sharing one board do NOT collapse; `openFile`/`navigatePageTo` dedup per-file by `filePath` instead.
  - **Plain-board open (`persephone-board://`) is untouched** — it keeps `target: "board-view"` + the link-as-path (`buildEditorById` `case "board-view"`); only real local files get `board-editor:<root>`.
  - **The unused pipe** handed to the board is a cheap `FileProvider` (no OS handle until read) — see CC8.
- **CC3 — Automation identity (Step 8) is REQUIRED for US-840.** Without broadening the four detection sites, the DrawIO proving-ground board can't be driven by `browser_*`/`board_refresh` and `get_active_page` drops `boardRoot`. Included here rather than deferred.
- **CC4 — `list_pages` editor id for a custom-editor board.** It will report `board-editor:<root>`, not `board-view`. `mcp-res-boards.md` tells agents to find a board by `editor: "board-view"`. A custom-editor board is a different surface (a file editor), so this is arguably correct — but the boards guide should note the `board-editor:` form. Doc-only; handled at epic close-out.
- **CC5 — Switch-back target fidelity.** `createEditorFromFile(filePath, undefined, newEditorId)` builds a text host whose `state.editor` comes from the built-in `resolveId`; the Step-7 override forces the user-picked `newEditorId` for text targets (mirrors `openFile`). Verified this reproduces the existing "open as X" behavior; the board writes the file directly, so the rebuilt built-in reads current disk content (CE4 — no stale cache).
- **CC6 — No unit tests.** Persephone has no unit-test harness (established US-836/837/838). Verify via `tsc`/eslint + manual: build a `*.drawio` board (US-840 will), open a `.drawio` file, confirm default-open + switch both ways + `getFilePath()`.
- **CC7 — Priority read.** `resolveEditorIdForFile` reads the built-in priority as `builtinDef.match.acceptFile(filePath)`. `editorRegistry.resolve()` returns the highest-priority def (monaco floor 0), and its `acceptFile` recomputes the same number — verified consistent with the ladder in `editor-matchers.ts` (monaco 0 / grid 20 / draw 50 / viewers 100 / category 200).
- **CC8 — Unused pipe on a custom-editor board.** The openRawLink path (Step 3b) builds a `FileProvider` pipe (the open-handler needs it to derive `filePath`), and `createEditorFromFile` assigns it to the board (`editor.pipe = pipe`). The board never reads it, and a `FileProvider` opens no OS handle until read — but for hygiene, `BoardEditorModel.dispose()` should dispose it: add `void (this as { pipe?: { dispose?: () => void } }).pipe?.dispose?.();` at the top of the existing `dispose()` override. Low-risk; no behavior impact.

## Acceptance criteria

1. With a trusted board declaring `fileMasks: ["*.drawio"]`, `editorPriority: 100`: opening a `.drawio` file — both by **direct open** (Explorer click / `openFile`) and via **`openRawLink`** (Link editor, another board, MCP) — opens the **board** as the main editor; `persephone.getFilePath()` resolves to the file's absolute path. Opening two different `.drawio` files with the same board yields two separate tabs (no per-board-singleton collapse).
2. The switch widget shows **both** the board (labelled by `editorName`/board name) and Monaco; switching Monaco→board and board→Monaco both work; the widget stays visible on the board and highlights the correct segment.
3. Switch-to-board with unsaved Monaco edits runs the Save/Don't-Save/**Cancel** prompt; Cancel keeps the page on Monaco.
4. A board with `editorPriority` omitted/`0` is a **switch option only** — the built-in stays the default open target.
5. Un-trusting the board removes it from resolution + the switch widget live (no restart) — reactive via `customEditorRegistry`.
6. The board option is **absent** for a `.drawio` opened over `https://` or inside an archive (CC/CE4 local-file gate).
7. App restart and cross-window page move restore a custom-editor board (persisted as `board-view` + `state.filePath`), re-deriving the virtual id and re-resolving `getFilePath()`.
8. `get_active_page`/`browser_*`/`board_refresh` recognize a custom-editor board (Step 8); `tsc` + `npm run lint` clean.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/core/utils/file-path.ts` | Add `isPlainLocalPath()` (Step 1). |
| `src/renderer/editors/board/custom-editor-registry.ts` | Add `resolveEditorIdForFile()` + `isBoardEditorId()` (Step 2). |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | `newEditorModel` → `resolveEditorIdForFile`; `buildEditorById` board branch (Steps 3–4). |
| `src/renderer/content/resolvers.ts` | File resolver: plain-local target via `resolveEditorIdForFile` (Step 3b). |
| `src/renderer/editors/board/BoardEditorModel.ts` | Dynamic `editorId`; `getRestoreData` override; `filePath` getter; `findCompatibleEditors` (Step 5); dispose unused pipe (CC8). |
| `src/renderer/editors/base/PageToolbar.tsx` | `SwitchWidget` board merge + reactive subscribe + labels (Step 6). |
| `src/renderer/api/pages/PageModel.ts` | `switchMainEditor` board-boundary branch (Step 7). |
| `src/renderer/automation/commands.ts` | `isBoardEditor` → `isBoardEditorId` (Step 8). |
| `src/renderer/api/mcp-handler.ts` | Board detection at `:210`/`:237`/`:693` → `isBoardEditorId` (Step 8). |
| `src/renderer/editors/register-editors.ts` | Eager `customEditorRegistry.ensureInitialized()` (Step 9). |

## Files deliberately NOT changed (don't re-investigate)

- `editorRegistry.ts` — merge stays OUT of `resolveId`/`resolve`/`findEditorsAccepting` (CE6; avoids poisoning `newTextFileModel`/`resolvers`).
- The 16 text editors' `findCompatibleEditors()` — board options appended in the widget, not per-editor.
- `parsers.ts` — Layer 1 is untouched; `persephone-board://` keeps `target: "board-view"` (plain-board open). Only the Layer 2 file resolver's target line changes (Step 3b).
- The `explicitTarget !== resolveId` guards (`PagesLifecycleModel.ts:563/845`) and the `mneme://` resolver — built-in resolution only (CC1).
- `board-manifest.ts`, `custom-editor-registry.ts` core (US-836/837), `board-shim.ts`/`BoardWebview.tsx`/`BoardPortInitMsg` (US-838) — already deliver `fileMasks`/registry/`getFilePath()`; this task only consumes them.
- `persephone-board-link.ts` — the board URL stays a pure id; filePath rides state, never the link.
