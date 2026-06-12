# US-644: Page-tab context menu — per-editor `onGetMenuItems()`

**Status:** implemented (awaiting user testing — completion steps not yet run)
**Epic:** none (standalone)

## Goal

Refactor the page-tab right-click context menu so that **tab-level** options stay in the tab
component, while all **editor/model-specific** options are contributed by the editor model
itself via a new `onGetMenuItems()` hook. This removes the always-shown-but-disabled
text-file options (Save, Rename, Decrypt, …) from non-text editors (Git Tree, Explorer, MCP
Inspector, …) and lets each editor offer its own relevant options (e.g. Git Tree → "Open Git
Root Folder", "Copy Remote URL").

## Background

### Current wiring (the thing we are changing)

`PageTabModel.handleContextMenu` in **`src/renderer/ui/tabs/PageTab.tsx`** (lines 255–395)
builds the **entire** menu inline. It mixes two concerns:

- **Tab-level items** — call only `pagesModel.*` / `page.*`, no editor-type awareness:
  Pin/Unpin Tab, Close Tab, Close Other Tabs, Close Tabs to the Right, Open in New Window,
  Duplicate Tab.
- **Text-file items** — all gated on `textHost = pagesModel.getTextFileHost(page.id)`:
  Save, Save As…, Rename, Show in File Explorer, Copy File Path, Decrypt, Encrypt/Change
  Password, Make Unencrypted. These are **always rendered**; on a non-text editor they show
  up **disabled** (because `textHost` is `null`), which is noise.

`getTextFileHost` (`src/renderer/api/pages/PagesQueryModel.ts:78`) is a duck-type check:
`main.contentHost?.type === "textFile"`. `TextFileModel` (`src/renderer/editors/text/TextEditorModel.ts`)
is **composed** into every text-bearing editor as a private `_host`, exposed via
`get contentHost(): IContentHost | null`. `EditorModel.contentHost` returns `null` by default
(`src/renderer/editors/base/EditorModel.ts:211`).

The text operations are flat delegates on `TextFileModel`:
`saveFile(saveAs?)`, `renameFile(newName)`, `showEncryptionDialog()`, `makeUnencrypted()`,
plus getters `encrypted`, `decrypted`, `withEncryption`, `filePath`.
**Show in File Explorer / Copy File Path** are currently inline one-liners in the tab
(`api.showItemInFolder(fp)`, `navigator.clipboard.writeText(fp)`), reading
`editor.state.get().filePath` via a raw cast. **Rename** is `PageTabModel.renameTab`
(PageTab.tsx:407) — it prompts with `ui.input(...)` then calls `textHost.renameFile`.

### Existing optional-hook conventions on `EditorModel`

`EditorModel` (`src/renderer/editors/base/EditorModel.ts`) already carries optional capability
hooks: `getIcon?: () => ReactNode` (field, line 71), and `?`-methods `hasTextSelection?()`
(line 261), `matchesNavigationTarget?()` (271), `onNavigationReuse?()` (276). `getNavigatorTarget()`
(251) is a concrete method with a default `return null`. `MenuItem` is imported from
`src/renderer/uikit` (re-exported from `api/types/events.d.ts`).

### Git Tree repo knowledge (for the demonstration items)

`GitTreeEditorModel` (`src/renderer/editors/git-tree/GitTreeEditorModel.ts`):
- `state.get().repoRoot: string` — absolute repo top-level path.
- `get repoName(): string` — basename of `repoRoot`.
- `this.branches.state.get().refs.remotes: string[]` — configured remote names (e.g. `["origin"]`).
- **Remote URL is NOT yet exposed** — `src/renderer/api/git.ts` / `src/ipc/git-ipc.ts` /
  `src/main/git-service.ts` have no `getRemoteUrl`. Adding it is a small IPC addition (see Step 6).

## Design

Two-tier split with a single hook:

1. **`EditorModel.onGetMenuItems(): MenuItem[]`** — new **concrete** method (not `?`-optional,
   because we want a useful default). Default body delegates to the content host so every
   text-bearing editor gets the text menu for free with zero per-editor code:

   ```ts
   onGetMenuItems(): MenuItem[] {
       return this.contentHost?.onGetMenuItems?.() ?? [];
   }
   ```

2. **`IContentHost.onGetMenuItems?(): MenuItem[]`** — new optional member on the content-host
   interface, implemented by `TextFileModel`. This is the **single place** the text-file menu
   lives (the user's "encapsulate TextFileModel host options in one place").

3. **Non-text editors** override `onGetMenuItems()` directly to return their own items
   (Git Tree). Editors with no relevant items inherit the default → `[]` (no more disabled noise).

4. **File-path items** (Show in Explorer, Copy File Path) extracted into a small shared builder
   so editors that have a file path but are NOT text hosts (PDF, Image, Archive) can reuse them.

### Why `contentHost.onGetMenuItems` rather than per-editor overrides for text editors

There are ~13 text-bearing editors (Monaco, Grid, Markdown, Html, Mermaid, Svg, Draw, Graph,
LogView, RestClient, Notebook, Todo, FileDiff). Routing the default through `contentHost` means
none of them need any change — the text menu is authored once on `TextFileModel`.

## Implementation plan

### Step 1 — Shared menu-item builders

**New file:** `src/renderer/editors/shared/editor-menu-items.ts`

Export two pure builders that return `MenuItem[]`:

```ts
import type { MenuItem } from "../../uikit";
import { api } from "...";          // for showItemInFolder
import type { TextFileModel } from "../text/TextEditorModel";

/** Show in File Explorer + Copy File Path. Reusable by any editor with a path.
 *  Items are disabled (not hidden) when filePath is absent, matching today's UX. */
export function filePathMenuItems(filePath: string | undefined): MenuItem[] { ... }

/** Full text-file menu: Save, Save As, Rename, <filePath items>, Decrypt group.
 *  `onRename` is injected so the ui.input prompt stays out of this module if
 *  preferred — OR move the prompt into TextFileModel (see Step 2) and call it here. */
export function textFileMenuItems(host: TextFileModel): MenuItem[] { ... }
```

`filePathMenuItems` reproduces the current Show-in-Explorer / Copy-Path items verbatim
(icons `FolderOpenIcon`, `CopyIcon`; disabled when `!filePath`).

`textFileMenuItems` reproduces Save / Save As… / Rename / Decrypt / Encrypt-or-Change-Password /
Make Unencrypted verbatim, sources the file-path items from `filePathMenuItems(host.filePath)`,
and calls `host.promptRename()` (Step 2) for Rename.

> Note: this module imports from the `editors/` layer, so it lives under `editors/shared/`
> (alongside `image-export.ts`), not `components/`.

### Step 2 — Move Rename prompt into `TextFileModel`

**File:** `src/renderer/editors/text/TextEditorModel.ts`

Add a method that encapsulates the prompt currently in `PageTabModel.renameTab`:

```ts
async promptRename(): Promise<void> {
    const inputResult = await ui.input("Enter new file name:", {
        title: "Rename File",
        value: this.state.get().title,
        buttons: ["Rename", "Cancel"],
        selectAll: true,
    });
    if (inputResult?.button === "Rename" && inputResult.value) {
        await this.renameFile(inputResult.value);
    }
}
```

Add `onGetMenuItems(): MenuItem[] { return textFileMenuItems(this); }`.

### Step 3 — `IContentHost.onGetMenuItems?`

**File:** `src/renderer/editors/base/IContentHost.ts`

Add optional member:

```ts
import type { MenuItem } from "../../uikit";
// ...
onGetMenuItems?(): MenuItem[];
```

### Step 4 — `EditorModel.onGetMenuItems()` default

**File:** `src/renderer/editors/base/EditorModel.ts`

Add the concrete default method (delegates to content host):

```ts
import type { MenuItem } from "../../uikit";   // add to imports
// ...
/** Editor/model-specific context-menu items for the page tab. Default routes
 *  to the content host (text-bearing editors get the text-file menu for free).
 *  Non-text editors override to contribute their own items. */
onGetMenuItems(): MenuItem[] {
    return this.contentHost?.onGetMenuItems?.() ?? [];
}
```

### Step 5 — Slim down `PageTab.tsx` `handleContextMenu`

**File:** `src/renderer/ui/tabs/PageTab.tsx` (lines 255–395)

Keep ONLY the tab-level items (Pin/Unpin, Close Tab, Close Other Tabs, Close Tabs to the
Right, Open in New Window, Duplicate Tab). **Delete** the entire text-file block (lines
323–393) and the now-unused `textHost`, `renameTab` (lines 407–422), and the inline
`filePath` reads. Then append the editor's own items:

```ts
const editorItems = editor?.onGetMenuItems?.() ?? [];
if (editorItems.length) {
    editorItems[0] = { ...editorItems[0], startGroup: true };  // separator from tab items
    menuItems.push(...editorItems);
}
ctxEvent.items.push(...menuItems);
```

Remove now-unused imports (`SaveIcon`, `RenameIcon`, `FolderOpenIcon`, `CopyIcon`,
`UnlockIcon`, `LockIcon`, `KeyOffIcon`, `ui`, and `pagesModel.getTextFileHost` usage) if no
longer referenced elsewhere in the file. (Verify each — `pagesModel` and others are used
elsewhere.)

### Step 6 — Git Tree menu items (demonstration + payoff)

**File:** `src/renderer/editors/git-tree/GitTreeEditorModel.ts`

Override:

```ts
onGetMenuItems(): MenuItem[] {
    const repoRoot = this.state.get().repoRoot;
    const remote = this.branches.state.get().refs.remotes[0];   // usually "origin"
    return [
        {
            label: "Open Git Root Folder",
            icon: <FolderOpenIcon />,
            onClick: () => { if (repoRoot) api.showItemInFolder(repoRoot); },
            disabled: !repoRoot,
        },
        {
            label: "Copy Remote URL",
            icon: <CopyIcon />,
            onClick: async () => {
                const url = await git.getRemoteUrl(repoRoot, remote);
                if (url) navigator.clipboard.writeText(url);
            },
            disabled: !remote,
        },
    ];
}
```

(`.ts` file → use `createElement(...)`, not JSX, for icons — match the existing `getIcon`
pattern in this model.)

**New IPC for `Copy Remote URL`** (small, four touch points):
- `src/main/git-service.ts` — add `getRemoteUrl(repoRoot, remote)` → `git.remote(["get-url", remote])`.
- `src/ipc/git-ipc.ts` — add the channel + types.
- `src/main/...` ipc registration (wherever git channels are registered).
- `src/renderer/api/git.ts` — add `getRemoteUrl(repoRoot, remote): Promise<string | undefined>`.

### Step 7 — (Optional, see Concern C) wire PDF / Image / Archive file-path items

If approved: override `onGetMenuItems()` on `PdfEditor`, `ImageEditor`, `ArchiveEditor` to
return `filePathMenuItems(<their path>)`. Otherwise these editors get an empty menu (still an
improvement over today's disabled items).

## Concerns / open questions (all DECIDED)

- **A. Hook return type & default.** ✅ **DECIDED — accept.** Concrete
  `onGetMenuItems(): MenuItem[]` with a content-host-delegating default (not a `?`-method) —
  gives all text editors the menu with zero per-editor code.

- **B. Separator placement.** ✅ **DECIDED — accept.** `PageTab` stamps `startGroup: true` on
  the first editor item so the separator between tab-items and editor-items is owned by the tab.

- **C. File-path items for non-text editors (PDF/Image/Archive).** ✅ **DECIDED — include now.**
  Do Step 7: override `onGetMenuItems()` on PDF/Image/Archive to return
  `filePathMenuItems(<their path>)`.

- **D. Git "Copy Remote URL".** ✅ **DECIDED — include both.** Ship "Open Git Root Folder" AND
  "Copy Remote URL" (with the new git IPC in Step 6).

- **E. Explorer / MCP Inspector items.** ✅ **DECIDED — OK, out of scope.** They inherit the
  empty default (no more disabled noise); future tasks may add their own items.

- **F. `editor` vs host for the call site.** ✅ **Acknowledged.** The hook must be called on the
  real `EditorModel` (`page.mainEditorInstance`), which delegates to its content host — NOT on
  the unwrapped `page.mainEditor` (which may be the `TextFileModel` host for text editors).

## Acceptance criteria

1. Right-clicking a **text editor** tab (Monaco/Grid/Markdown/etc.) shows the same Save / Save
   As / Rename / Show in File Explorer / Copy File Path / Decrypt group as today, working
   identically.
2. Right-clicking a **Git Tree** tab shows tab-level items + "Open Git Root Folder" and
   "Copy Remote URL" (and NO Save/Decrypt/etc.).
3. Right-clicking a **non-text editor with no contributed items** (e.g. MCP Inspector) shows
   only tab-level items — no disabled Save/Rename/etc.
4. Tab-level items (Close, Pin, Duplicate, Open in New Window) behave exactly as before for all
   editor types.
5. No editor needs per-editor code to receive the text-file menu — it flows through
   `contentHost.onGetMenuItems()`.
6. `npm run lint` passes; no unused imports left in `PageTab.tsx`.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/editors/shared/editor-menu-items.ts` | **NEW** — `filePathMenuItems`, `textFileMenuItems` |
| `src/renderer/editors/text/TextEditorModel.ts` | add `promptRename()` + `onGetMenuItems()` |
| `src/renderer/editors/base/IContentHost.ts` | add optional `onGetMenuItems?()` |
| `src/renderer/editors/base/EditorModel.ts` | add concrete `onGetMenuItems()` default |
| `src/renderer/ui/tabs/PageTab.tsx` | remove text-file block + `renameTab`; append `editor.onGetMenuItems()` |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | override `onGetMenuItems()` (Open Root Folder, Copy Remote URL) |
| `src/main/git-service.ts` | add `getRemoteUrl` (for Copy Remote URL) |
| `src/ipc/git-ipc.ts` | add remote-url channel/types |
| `src/renderer/api/git.ts` | add `getRemoteUrl` |
| `src/renderer/editors/{pdf,image,archive}/...` | *(Concern C, optional)* override `onGetMenuItems()` → `filePathMenuItems` |

### Files needing NO change

- The ~13 text-bearing editor models (Monaco, Grid, Markdown, Html, Mermaid, Svg, Draw, Graph,
  LogView, RestClient, Notebook, Todo, FileDiff) — they get the text menu via `contentHost`.
- `PagesQueryModel.getTextFileHost` — may become unused by `PageTab` but is harmless to keep
  (check for other callers before removing; out of scope).
