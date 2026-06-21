# US-748: Open-a-board link scheme (`persephone-board://`)

**Epic:** [EPIC-035 — Boards Anywhere](../../epics/EPIC-035.md)
**Depends on:** US-745 (manifest identity), US-746 (boards anywhere — `initFromBoardRoot` + single-board mode), US-747 (per-board trust gate)
**Status:** Investigated — doc ready.

## Goal

Add a dedicated in-app link scheme, **`persephone-board://`**, that opens a single board *by its own root path* through the canonical `openRawLink` pipeline — the production caller US-746's `initFromBoardRoot` was built for. The link is a **pure board identifier — it encodes the board root and nothing else** (C748-1). Any future per-open parameter (e.g. a `filePath` to edit, for the Custom Editor axis) rides as **`ILinkData` metadata** on the `openRawLink` call — exactly how `revealLine` / `highlightText` are passed today — never baked into the URL. This unblocks US-749 (Explorer "Open Board" button) and US-750 (MCP `openBoard`).

## Background

### The scheme is an in-app link parser, NOT an Electron protocol (C1)

There are two distinct `board`-named namespaces — do not conflate them:

| Name | What it is | Where |
|------|-----------|-------|
| `board://` | Electron **custom protocol** — the webview's per-partition file server (`board:///index.html`). | `src/main/board-protocol-service.ts` + `BoardWebview` |
| **`persephone-board://`** | **In-app link scheme** parsed in the renderer, routed through `openRawLink`. **This task.** | `src/renderer/content/*` |

`persephone-board://` is **never** registered with `protocol.handle`. It is the exact sibling of the existing **`persephone-folder://`** (which opens a `.persephone` *project*) and **`mneme-folder://`** / **`git-tree://`** — all base64-of-JSON in-app schemes that resolve to a `target` and route to a no-content-host editor.

### How the sibling scheme (`persephone-folder://`) flows end-to-end

This is the template to mirror exactly. Traced through the live code:

1. **Producer** — `encodePersephoneFolderLink(persephonePath)` → `persephone-folder://<base64({persephonePath})>`. Callers (e.g. `ExplorerSecondaryView.handleCreateProject`) `createLinkData(url, { pageId, sourceId })` and `app.events.openRawLink.sendAsync(...)`.
2. **Layer 1 — parser** (`src/renderer/content/parsers.ts`): matches the prefix, sets `data.url = data.href`, `data.target ??= "board-view"`, forwards to `openLink`. **Parser-only — no dedicated Layer-2 resolver.**
3. **Layer 2 — file resolver** (`src/renderer/content/resolvers.ts`): `resolveUrlToPipeDescriptor` returns `null` for a `://` scheme, so the `data.url.includes("://")` branch builds a **placeholder file pipe** (`provider: { type: "file", config: { path: data.url } }`), keeps `data.target`, fires `openContent`.
4. **Layer 3 — open handler** (`src/renderer/content/open-handler.ts`): `filePath = data.pipe.provider.sourceUrl` = **the encoded link itself**. With a `pageId` → `navigatePageTo(pageId, filePath, { target, ... })`; without → `openFile(filePath, pipe, { target, ... })`.
5. **Editor build** (`src/renderer/api/pages/PagesLifecycleModel.ts`): `newEditorModelByTarget(filePath, "board-view")` → `case "board-view": return (await import("../../editors/board")).default.newEditorModel(filePath)`.
6. **Decode** (`src/renderer/editors/board/index.tsx`, legacy `boardEditorModule.newEditorModel`): `decodePersephoneFolderLink(filePath)` → `model.initFromPersephone(link.persephonePath)`.

**Conclusion:** the entire generic pipeline (Layers 2–5) is scheme-agnostic. US-748 only needs (a) a new encode/decode helper, (b) a Layer-1 parser clause, and (c) decode-and-dispatch in the board module's `newEditorModel`. No resolver, no `PagesLifecycleModel` change (`board-view` already routes there).

### What US-746 already built for this task

- `BoardEditorModel.initFromBoardRoot(boardRoot)` — single-board mode: sets `boardRoot`, clears `boardsDir`, `selectBoard(name)`, loads `boardTrust`, `refreshBoards()`. Its doc comment already says *"opened by board-root path (wired by US-748 / US-750)."*
- Single-board mode renders the board alone (no sidebar list — `setPage` only registers `board-list` when `boardRoot` is unset).
- `boardRootOf(name)` returns `boardRoot` in single-board mode.

### What US-747 already built

- The per-board trust gate in `BoardEditorView.tsx` keys on `model.boardRootOf(selectedBoard)` and runs in **both** modes. So a **foreign** board opened via `persephone-board://` (a root not in `trustedBoards.txt`) automatically shows `UntrustedBoardView` + the trust dialog — **no extra gate wiring needed here.** (Auto-trust for Persephone-*created* boards is C5/US-747; foreign-by-link is exactly the case the gate exists for.)

### Per-page-singleton reuse

`navigatePageTo` consults `editor.matchesNavigationTarget?.(target, filePath)` (PagesLifecycleModel.ts:744) to reuse an existing instance instead of stacking a duplicate. `BoardEditorModel.matchesNavigationTarget` today matches **project mode only** (`boardRoot` unset, decodes `persephone-folder://`, compares `boardsDir`) and **explicitly returns false when `boardRoot` is set** — with a comment: *"the `persephone-board://` match is added in US-748."* This task adds the single-board branch.

## Recommended design

- **Payload shape:** `{ boardRoot: string }`, base64-of-JSON (same as every sibling — drive letters / spaces / `#` / `?` round-trip safely). `boardRoot` is the absolute path of the board's own folder (the folder containing `board-manifest.json`). **No other fields** — the URL identifies a board, nothing more (C748-1).
- **Future params ride on `ILinkData`, not the URL (C748-1).** When the Custom Editor axis needs to forward a `filePath` to edit, it travels as an `openRawLink` metadata field (sibling of `revealLine` / `highlightText`), carried by the caller and read on open — a separate seam from this scheme. US-748 adds nothing for it.
- **No resolver.** Mirror `persephone-folder://`: a Layer-1 parser only. The file resolver's `://` placeholder-pipe branch already carries it to Layer 3.
- **"Board not found" view (C748-3).** A link to a missing folder (or a folder without `board-manifest.json`) renders a **"Board not found"** placeholder in the single-board editor — not a confusing empty project-style list. Detected by the existing `refreshBoards` behavior: in single-board mode it clears `selectedBoard` when the board doesn't resolve, so **`boardRoot` set + `selectedBoard` undefined** is the not-found signal. A valid board keeps `selectedBoard` set throughout (set optimistically in `initFromBoardRoot`), so the message never flashes on the happy path.
- **Decode dispatch by scheme** in `boardEditorModule.newEditorModel`: try `persephone-board://` first → `initFromBoardRoot`; else `persephone-folder://` → `initFromPersephone`. Both schemes share `target: "board-view"`, so they share the one module entry point.
- **`matchesNavigationTarget`** gains a single-board branch: when `boardRoot` is set, decode `persephone-board://` and compare normalized `boardRoot`; when `boardRoot` is unset, keep the existing `persephone-folder://` project-mode match. The two modes never cross-match.

## Implementation plan

### Step 1 — New scheme helper

**Create `src/renderer/content/persephone-board-link.ts`** (model on `persephone-folder-link.ts`):

```ts
/**
 * `persephone-board://` link scheme (EPIC-035 / US-748).
 *
 * Opens a SINGLE board by its own root path through the `openRawLink` pipeline —
 * the sibling of `persephone-folder://` (which opens a `.persephone` project).
 * Both route to `target: "board-view"`. The link is a PURE board identifier: it
 * encodes the board root and nothing else. Any future per-open parameter (e.g. a
 * `filePath` to edit) rides as `ILinkData` metadata on the openRawLink call —
 * like `revealLine` / `highlightText` — never baked into this URL.
 *
 * Base64-of-JSON so any path (drive letters, spaces, `#`, `?`) round-trips.
 *
 * Distinct from `board://` — that is the webview file-serving Electron protocol
 * (board-protocol-service.ts), NOT an in-app link scheme. This is never
 * registered with `protocol.handle`.
 */
export const PERSEPHONE_BOARD_PREFIX = "persephone-board://";

export function encodePersephoneBoardLink(boardRoot: string): string {
    return PERSEPHONE_BOARD_PREFIX + btoa(JSON.stringify({ boardRoot }));
}

export function decodePersephoneBoardLink(raw: string): { boardRoot: string } | null {
    if (!raw.startsWith(PERSEPHONE_BOARD_PREFIX)) return null;
    try {
        const obj = JSON.parse(atob(raw.slice(PERSEPHONE_BOARD_PREFIX.length)));
        return typeof obj?.boardRoot === "string" ? { boardRoot: obj.boardRoot } : null;
    } catch {
        return null;
    }
}
```

### Step 2 — Layer-1 parser

**Edit `src/renderer/content/parsers.ts`:** add the import and a parser clause immediately after the `persephone-folder://` clause (order vs `persephone-folder://` is irrelevant — the prefixes are disjoint; both are after the file fallback so they run first under LIFO).

```ts
import { PERSEPHONE_BOARD_PREFIX } from "./persephone-board-link";
```

```ts
    // persephone-board:// parser — opens a single board by its own root path
    // (US-748). Sibling of persephone-folder://; same board-view target. The link
    // is a pure board identifier — any per-open param rides as ILinkData metadata.
    app.events.openRawLink.subscribe(async (data) => {
        if (!data.href.startsWith(PERSEPHONE_BOARD_PREFIX)) return;
        data.url = data.href;
        data.target ??= "board-view";
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });
```

### Step 3 — Decode + dispatch in the board module

**Edit `src/renderer/editors/board/index.tsx`:** import the board-link decoder and try it first in the legacy module's `newEditorModel`. (Both schemes map to `board-view`, so one entry point serves both.)

```ts
import { decodePersephoneFolderLink } from "../../content/persephone-folder-link";
import { decodePersephoneBoardLink } from "../../content/persephone-board-link";
```

Before:
```ts
    newEditorModel: async (filePath?: string) => {
        const model = new BoardEditorModel(new TComponentState(getDefaultBoardEditorState()));
        if (filePath) {
            const link = decodePersephoneFolderLink(filePath);
            if (link) model.initFromPersephone(link.persephonePath);
        }
        return model as unknown as EditorOrHost;
    },
```

After:
```ts
    newEditorModel: async (filePath?: string) => {
        const model = new BoardEditorModel(new TComponentState(getDefaultBoardEditorState()));
        if (filePath) {
            // Single-board mode (US-748) takes priority — its own root path.
            const boardLink = decodePersephoneBoardLink(filePath);
            if (boardLink) {
                model.initFromBoardRoot(boardLink.boardRoot);
            } else {
                // Project / grouping mode — a .persephone folder.
                const folderLink = decodePersephoneFolderLink(filePath);
                if (folderLink) model.initFromPersephone(folderLink.persephonePath);
            }
        }
        return model as unknown as EditorOrHost;
    },
```

### Step 4 — Single-board navigation-singleton match

**Edit `src/renderer/editors/board/BoardEditorModel.ts`:** import the board-link decoder and extend `matchesNavigationTarget` with a single-board branch. Update the stale comment.

```ts
import { decodePersephoneBoardLink } from "../../content/persephone-board-link";
```

Before:
```ts
    /** Per-page singleton: re-navigating to the SAME `.persephone` reuses this
     *  instance (promote back to main) rather than building a duplicate panel.
     *  Single-board editors are not project-link targets — the `persephone-board://`
     *  match is added in US-748. */
    matchesNavigationTarget(target: string | undefined, filePath: string): boolean {
        if (target !== "board-view") return false;
        if (this.state.get().boardRoot) return false;
        const link = decodePersephoneFolderLink(filePath);
        return !!link
            && fpNormalizeForCompare(fpJoin(link.persephonePath, "boards"))
                === fpNormalizeForCompare(this.state.get().boardsDir);
    }
```

After:
```ts
    /** Per-page singleton: re-navigating to the SAME board/project reuses this
     *  instance (promote back to main) rather than stacking a duplicate. Two modes,
     *  never cross-matching: single-board editors match a `persephone-board://` link
     *  by board root; project editors match a `persephone-folder://` link by boardsDir. */
    matchesNavigationTarget(target: string | undefined, filePath: string): boolean {
        if (target !== "board-view") return false;
        const boardRoot = this.state.get().boardRoot;
        if (boardRoot) {
            // Single-board mode — match the persephone-board:// link for this root.
            const boardLink = decodePersephoneBoardLink(filePath);
            return !!boardLink
                && fpNormalizeForCompare(boardLink.boardRoot) === fpNormalizeForCompare(boardRoot);
        }
        // Project mode — match the persephone-folder:// link for this boardsDir.
        const folderLink = decodePersephoneFolderLink(filePath);
        return !!folderLink
            && fpNormalizeForCompare(fpJoin(folderLink.persephonePath, "boards"))
                === fpNormalizeForCompare(this.state.get().boardsDir);
    }
```

### Step 5 — Update the `initFromBoardRoot` doc comment

In `BoardEditorModel.ts`, the comment says *"opened by board-root path (wired by US-748 / US-750). … Per-board trust lands in US-747."* Both are now done — trim to: *"opened by a `persephone-board://` link (US-748) or the MCP `openBoard` (US-750)."*

### Step 6 — "Board not found" view (C748-3)

**Create `src/renderer/editors/board/BoardNotFoundView.tsx`** (sibling of `UntrustedBoardView.tsx`, same minimal shape):

```tsx
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { WarningIcon } from "../../theme/icons";

/**
 * Shown in single-board mode (US-748) when the linked board can't be resolved —
 * the folder is missing, or it carries no `board-manifest.json`. Replaces the
 * project-style "No boards yet" list, which would be confusing for a standalone
 * board link.
 */
export function BoardNotFoundView({ path }: { path: string }) {
    return (
        <Panel direction="column" flex={1} align="center" justify="center" gap="md" padding="xl">
            <WarningIcon width={32} height={32} />
            <Text size="lg">Board not found</Text>
            <Text color="light" align="center">
                This board could not be opened — its folder is missing or is not a board
                (no <code>board-manifest.json</code>).
            </Text>
            <Text size="sm" color="light">{path}</Text>
        </Panel>
    );
}
```

**Edit `src/renderer/editors/board/BoardEditorView.tsx`:** import the view and add a branch — guarded to single-board mode (`s.boardRoot`) — right after `boardTrusted` is computed, before the `selectedBoard` block. Project mode never sets `boardRoot`, so this never fires there (its empty-list state keeps its "No boards yet" + create buttons).

```tsx
import { BoardNotFoundView } from "./BoardNotFoundView";
```

```tsx
    const selectedRoot = s.selectedBoard ? model.boardRootOf(s.selectedBoard) : undefined;
    const boardTrusted = boardTrust.useIsTrusted(selectedRoot ?? "");

    // Single-board mode (persephone-board:// link) whose board didn't resolve —
    // refreshBoards cleared the selection. Show "not found" instead of the
    // project-style empty list (C748-3).
    if (s.boardRoot && !s.selectedBoard) {
        return <BoardNotFoundView path={s.boardRoot} />;
    }
```

No `refreshBoards` change is needed — it already clears `selectedBoard` for an unresolved single board (BoardEditorModel.ts:270-273).

## Concerns / open questions

- **C748-1 — What does the link encode? ✅ Decided (user, 2026-06-21): the board root and nothing else.** The URL is a pure board identifier — no `filePath`, no other parameters. A future per-open parameter (the Custom Editor axis forwarding a `filePath` to edit) is a **separate concern**: it rides as `ILinkData` metadata on the `openRawLink` call, the same way `revealLine` / `highlightText` are passed for Monaco today — not encoded into the URL. So the payload type is just `{ boardRoot: string }`, and US-748 adds nothing for the future param. (This keeps the scheme clean and avoids a forward-compat wire format that would never actually be read from the URL.)
- **C748-2 — Foreign / untrusted board opened by link. ✅ Already handled by US-747.** `persephone-board://` lands in single-board mode; the `BoardEditorView` gate keys on `boardRootOf(selectedBoard)` in both modes, so a root not in `trustedBoards.txt` shows `UntrustedBoardView` + trust dialog. This is the intended gate path for foreign boards. **No new gate wiring here** — just confirm in testing that opening a never-trusted board folder by link prompts, and trusting it renders.
- **C748-3 — Link points at a missing / non-board path. ✅ Decided (user, 2026-06-21): render a "Board not found" message.** Instead of degrading to a confusing empty project-style list, single-board mode shows a `BoardNotFoundView` placeholder (Step 6). `initFromBoardRoot` selects the board optimistically; `refreshBoards` runs `isBoardFolder(boardRoot)` and, if false, clears the selection (BoardEditorModel.ts:270-273) — so **`boardRoot` set + no `selectedBoard`** drives the message. A valid board keeps its selection throughout, so the happy path never flashes it. (US-749/US-750 may still validate before *emitting* a link, but the editor now degrades gracefully on its own regardless.)
- **C748-4 — New tab vs. navigate-current-page is the *caller's* choice, not the scheme's.** Identical to `persephone-folder://`: a caller that sets `pageId` on the `ILinkData` navigates that page (`navigatePageTo`); a caller that omits it opens a new/existing tab (`openFile`). US-748 only guarantees **both** paths build the board correctly. The Explorer button (US-749) and MCP `openBoard` (US-750) each decide their own `pageId` policy. No decision needed in this task.
- **C748-5 — No Layer-2 resolver (confirmed at carve time).** The file resolver's `data.url.includes("://")` placeholder-pipe branch already routes the scheme to Layer 3 with `target` intact — verified by the working `persephone-folder://` path. Adding a resolver would be dead code. If a future need arises (e.g. validating the board root before page creation), it can be added then.
- **C748-6 — Does any producer need wiring in this task? No.** US-748 ships the scheme + parser + decode (the *consumer* side) only. Producers — `FileTreeProvider.getNavigationUrl` / the Explorer row button (US-749) and the MCP tool (US-750) — call `encodePersephoneBoardLink` in their own tasks. This task can be smoke-tested by emitting the link manually (see Acceptance).

## Acceptance criteria

1. `encodePersephoneBoardLink(boardRoot)` / `decodePersephoneBoardLink` round-trip a Windows path (drive letter, spaces); `decode` returns `null` for a non-matching prefix and for malformed base64.
2. Firing `app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink("<a trusted board's root>")))` opens that board **alone** (single-board mode — no sidebar list) on a new tab.
3. The same link with a `pageId` navigates that page to the board.
4. Re-firing the same link reuses the existing single-board editor instance (no duplicate tab/panel) — `matchesNavigationTarget` single-board branch.
5. A `persephone-board://` link to a **foreign** (untrusted) board shows `UntrustedBoardView` + the trust dialog; trusting renders the board.
6. A `persephone-board://` link to a **missing folder** (or a folder with no `board-manifest.json`) shows the **"Board not found"** placeholder — not an empty project-style list (C748-3). The happy path (a valid board) never flashes it.
7. A `persephone-folder://` link still opens project mode unchanged (no regression) and does **not** match a single-board instance (and vice-versa).
8. `npm run lint` and `tsc` clean.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/content/persephone-board-link.ts` | **New.** `persephone-board://` prefix + `encode(boardRoot)` / `decode` → `{ boardRoot }`. Board root only — no other params (C748-1). |
| `src/renderer/content/parsers.ts` | Import `PERSEPHONE_BOARD_PREFIX`; add the Layer-1 parser clause (`target: "board-view"`). |
| `src/renderer/editors/board/index.tsx` | Import `decodePersephoneBoardLink`; `newEditorModel` decodes board-link first → `initFromBoardRoot`, else folder-link → `initFromPersephone`. |
| `src/renderer/editors/board/BoardEditorModel.ts` | Import `decodePersephoneBoardLink`; extend `matchesNavigationTarget` with the single-board branch; refresh the `initFromBoardRoot` / `matchesNavigationTarget` comments. |
| `src/renderer/editors/board/BoardNotFoundView.tsx` | **New.** "Board not found" placeholder for single-board mode (C748-3). |
| `src/renderer/editors/board/BoardEditorView.tsx` | Import `BoardNotFoundView`; add the `s.boardRoot && !s.selectedBoard` not-found branch before the `selectedBoard` block. |

### Files that need NO change (verified)

- `src/renderer/content/resolvers.ts` — the `://` placeholder-pipe branch already routes the scheme to Layer 3.
- `src/renderer/content/open-handler.ts` — already threads `filePath` + `target` to `navigatePageTo` / `openFile`.
- `src/renderer/api/pages/PagesLifecycleModel.ts` — `board-view` case already imports `editors/board` and calls `newEditorModel(filePath)`.
- `src/renderer/editors/register-editors.ts` — `board-view` is already registered (`hasContentHost: false`).
- `src/renderer/api/board-trust.ts` — the per-board trust gate (US-747) already covers single-board mode (BoardEditorView only gains the not-found branch above).
