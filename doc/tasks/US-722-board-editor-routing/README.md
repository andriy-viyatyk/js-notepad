# US-722: `.persephone` folder + Board editor + folder-click routing

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · Foundation #4 (build order)
**Status:** Investigated — doc ready. Not started.

## Goal

Make clicking a **`.persephone` folder** in the file tree open a dedicated **Board editor** — exactly mirroring how `.git` opens the Git Tree editor and `.mneme` opens the Mneme root editor. The Board editor is a descriptor-driven ("Pattern B") **per-folder singleton** with:

- a **secondary view (side panel)** listing the project's boards (the switcher), and
- a **main view** that lists boards with **management operations (create / delete)** and hosts the selected board's region — gated by the **US-721 trust gate** (untrusted → the *"Boards are not supported in untrusted projects"* placeholder + **Trust project** button; trusted → the board host region).

This task ships the **host shell + routing + trust gate consumer**. It does **not** render the actual board webview (the `board://` protocol + locked-down `<webview>` is **US-723**), wire the `persephone` bridge (**US-724**), or scaffold board folders from a template / watch `config.json` (**US-726**). See *Scope boundary*.

## Background

### What the epic specifies (EPIC-034 → "Board editor + `.persephone` folder-click routing")

- A dedicated **Board editor** opens on a **`.persephone`** folder click (mirrors `.git` / `.mneme`).
- **Side panel** lists the project's boards; the user switches between them there.
- **Main view** lists boards with **create / delete**; selecting a board renders that board's **webview** (the webview itself is US-723 — US-722 renders a placeholder in its place).
- **Naming / create:** display name = folder name; "Create" attempts to create the folder and surfaces an OS error on an illegal/duplicate name (no upfront sanitization). Rename = folder rename.
- **Implementation caveat (epic):** folder-click routing is ~3 touchpoints — a folder-name check in `FileTreeProvider`, a new `persephone-folder://` scheme + parser, and editor registration. The descriptor-driven editors are the Pattern-B model, but the Board editor needs a **real `restore()`** to read the project folder on app restart.

### The folder-click chain to replicate (verified end-to-end against `.mneme`)

```
User clicks .persephone in Explorer
  → ExplorerSecondaryView.handleItemClick(item)
       url = treeProvider.getNavigationUrl(item)          // FileTreeProvider.getNavigationUrl
       app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: "explorer" }))
  → persephone-folder:// parser (parsers.ts)               // sets data.target ??= "board-view"
       → app.events.openLink.sendAsync(data)
  → file resolver (resolvers.ts)                           // generic "://" branch; builds placeholder pipe, target intact
       → app.events.openContent.sendAsync(data)
  → open-handler.ts                                        // pageId present → navigatePageTo(pageId, url, { target })
  → PagesLifecycleModel.navigatePageTo                     // singleton check via matchesNavigationTarget, else build
       → buildEditorById("board-view", url)                // switch case → mod.default.newEditorModel(url)
  → board module default export: newEditorModel(url)       // decodePersephoneFolderLink(url) → initFromPersephone(path)
```

**Precedent files (verified):**

| Concern | File | Symbols |
|---|---|---|
| Link codec | `src/renderer/content/mneme-folder-link.ts` | `MNEME_FOLDER_PREFIX`, `encodeMnemeFolderLink(root)`, `decodeMnemeFolderLink(raw)` (base64-of-JSON) |
| (mirror) | `src/renderer/content/git-tree-link.ts` | `GIT_TREE_PREFIX`, `encodeGitTreeLink`, `decodeGitTreeLink` |
| Folder detection | `src/renderer/content/tree-providers/FileTreeProvider.ts` | `list()` (`isGit`/`isMneme` → spread `{ target, icon }`); `getNavigationUrl()` (`target` → encode link) |
| Tree icon | `src/renderer/components/tree-provider/TreeProviderItemIcon.tsx` | `item.icon === "git"`/`"mneme"` → icon component |
| Layer-1 parsers | `src/renderer/content/parsers.ts` | `openRawLink` subscribers; set `data.target ??= "..."`, forward to `openLink` |
| Build switch | `src/renderer/api/pages/PagesLifecycleModel.ts` | `buildEditorById` switch (`case "mneme-root"`/`"git-tree"` → `mod.default.newEditorModel(filePath)`) — **line ~288** |
| Editor registry | `src/renderer/editors/base/editorRegistry.ts` | `EditorDefinition` (`id`, `name`, `hasContentHost`, `accepts`, `loadModule`); `EditorModule` (`createEditor`, `Component`) |
| Registration | `src/renderer/editors/register-editors.ts` | `editorRegistry.register({ id: "mneme-root", hasContentHost: false, accepts: () => -1, loadModule })`; `secondaryViewRegistry.register({ id: "mneme-tree", label, loadComponent })` |
| Model + restore | `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts` | `extends EditorModel<…>`; `editorId`, `noLanguage`, `skipSave`, `getIcon`, `restore()`, `matchesNavigationTarget`, `beforeNavigateAway`, `setPage` → `secondaryView` |
| Module wiring | `src/renderer/editors/mneme-root/index.tsx` | `mnemeRootModule: EditorModule` + `export { default } from "./MnemeRootEditorView"` (the `newEditorModel` carrier consumed by `buildEditorById`) |
| Persistence | `src/renderer/api/pages/PagesPersistenceModel.ts` | `NO_HOST_EDITOR_IDS` set (no-host restore path) |
| Secondary view | `src/renderer/ui/secondary-views/secondary-view-registry.ts`, `panel-key.ts` | `secondaryViewRegistry`, `SecondaryViewProps`, `panelKey(editorId, panelId)` |
| Trust gate (US-721) | `src/renderer/api/project-trust.ts`, `src/renderer/ui/dialogs/TrustProjectDialog.tsx` | `projectTrust.load/useIsTrusted/trust`, `showTrustProjectDialog(path)` |
| Directory ops | `src/renderer/api/fs.ts` | `listDirWithTypes(dir): Promise<IDirEntry[]>`, `mkdir(dir)`, `removeDir(dir, recursive)`, `exists(p)`, `rename(old,new)` |

### Key divergence from `.mneme` / `.git` (decide once, applies throughout)

`.git` and `.mneme` are **metadata subfolders**, so their editors open on the **parent** (`encodeXLink(path.dirname(item.href))`). For `.persephone` the editor's root **is the `.persephone` folder itself**:

- boards live under `.persephone/boards/<Name>/` — the editor reads that directory directly, and
- US-721's trust key (C7) is the **`.persephone` folder absolute path**.

So the codec encodes **`item.href`** (the `.persephone` path), **not** `path.dirname(item.href)`. One absolute path — `persephonePath` — is the editor root, the boards-container parent, and the trust key.

## Implementation plan

### Step 1 — Link codec `src/renderer/content/persephone-folder-link.ts` (new)

Mirror `mneme-folder-link.ts` exactly; payload key `persephonePath`.

```typescript
export const PERSEPHONE_FOLDER_PREFIX = "persephone-folder://";

export function encodePersephoneFolderLink(persephonePath: string): string {
    return PERSEPHONE_FOLDER_PREFIX + btoa(JSON.stringify({ persephonePath }));
}

export function decodePersephoneFolderLink(raw: string): { persephonePath: string } | null {
    if (!raw.startsWith(PERSEPHONE_FOLDER_PREFIX)) return null;
    try {
        const json = atob(raw.slice(PERSEPHONE_FOLDER_PREFIX.length));
        const obj = JSON.parse(json);
        return typeof obj?.persephonePath === "string" ? { persephonePath: obj.persephonePath } : null;
    } catch {
        return null;
    }
}
```

> Scheme name `persephone-folder://` per the epic. Distinct from US-723's `board://` *webview protocol* (different namespace — Electron protocol vs in-app link parser — no collision).

### Step 2 — `FileTreeProvider` detection + `getNavigationUrl`

`src/renderer/content/tree-providers/FileTreeProvider.ts`. In `list()`, alongside `isGit`/`isMneme` (name-only, like `.mneme`; no settings gate — see C1):

```typescript
const isPersephone = !isGit && !isMneme
    && entry.name === ".persephone";
folders.push({
    title: entry.name,
    href: fullPath,
    category: dirPath,
    tags: [],
    isDirectory: true,
    ...(isGit ? { target: "git-tree", icon: "git" } : {}),
    ...(isMneme ? { target: "mneme-root", icon: "mneme" } : {}),
    ...(isPersephone ? { target: "board-view", icon: "board" } : {}),
});
```

In `getNavigationUrl()`, **encode `item.href` directly** (not the parent — see *Key divergence*):

```typescript
if (item.target === "board-view") {
    return encodePersephoneFolderLink(item.href);
}
```

Add the import: `import { encodePersephoneFolderLink } from "../persephone-folder-link";`.

### Step 3 — Tree icon `src/renderer/components/tree-provider/TreeProviderItemIcon.tsx`

Add a case before the `isDirectory` fallback:

```typescript
if (item.icon === "board") {
    return <BoardIcon width={16} height={16} />;
}
```

`BoardIcon` is already in `src/renderer/theme/icons.tsx` (a dashboard-panels glyph, theme-following stroke). Import it here and in the editor's `getIcon` — see C5.

### Step 4 — Layer-1 parser `src/renderer/content/parsers.ts`

Add a subscriber mirroring the `mneme-folder://` one:

```typescript
app.events.openRawLink.subscribe(async (data) => {
    if (!data.href.startsWith(PERSEPHONE_FOLDER_PREFIX)) return;
    data.url = data.href;
    data.target ??= "board-view";
    data.handled = false;
    await app.events.openLink.sendAsync(data);
    data.handled = true;
});
```

Import `PERSEPHONE_FOLDER_PREFIX`. No Layer-2 resolver change — the generic file resolver's `data.url.includes("://")` branch passes `target` through untouched (verified, same as mneme/git).

### Step 5 — Build switch `src/renderer/api/pages/PagesLifecycleModel.ts`

Add a case to `buildEditorById` (after `case "mneme-root"`):

```typescript
case "board-view": {
    const mod = await import("../../editors/board");
    return mod.default.newEditorModel(filePath);
}
```

**`EditorType` union** — if `src/shared/types.ts`'s `EditorType` is a closed union (mneme uses `"mnemeRootPage"`), add `"boardPage"` and use it as the state's legacy `type` discriminator. Verify at implementation; mirror `mnemeRootPage`.

### Step 6 — Board editor model + state + module

**`src/renderer/editors/board/BoardEditorModel.ts`** (new) — mirror `MnemeRootEditorModel`:

```typescript
export interface BoardEditorState extends EditorStateBase {
    type: "boardPage";
    editor: "board-view";
    persephonePath: string;   // absolute .persephone path — root, boards-container, trust key
    title: string;
    boards: string[];         // board folder names under <persephonePath>/boards
    selectedBoard?: string;
    secondaryView?: string[];
}

export function getDefaultBoardEditorState(): BoardEditorState { /* type/editor/persephonePath:""/boards:[]/... */ }

export class BoardEditorModel extends EditorModel<BoardEditorState> {
    readonly editorId = "board-view";
    noLanguage = true;
    skipSave = true;
    showBackgroundOrnament = true;

    getIcon = (): ReactNode => createElement(BoardIcon);

    /** Fresh open from a decoded link. */
    initFromPersephone(persephonePath: string): void {
        this.state.update((s) => {
            s.persephonePath = persephonePath;
            s.title = boardProjectTitle(persephonePath); // e.g. parent folder name
        });
        void projectTrust.load();   // US-721 — lazy, consumer-driven
        void this.refreshBoards();
    }

    /** Enumerate <persephonePath>/boards subfolders into state.boards. */
    async refreshBoards(): Promise<void> {
        const boardsDir = fpJoin(this.state.get().persephonePath, "boards");
        const entries = (await fs.exists(boardsDir))
            ? await fs.listDirWithTypes(boardsDir) : [];
        const boards = entries.filter((e) => e.isDirectory).map((e) => e.name).sort();
        this.state.update((s) => { s.boards = boards; });
    }

    async createBoard(name: string): Promise<void> {   // US-722: empty folder only; population (if any) is US-726
        const dir = fpJoin(this.state.get().persephonePath, "boards", name);
        if (await fs.exists(dir)) throw new Error(`A board named "${name}" already exists.`);
        await fs.mkdir(dir);
        await this.refreshBoards();
    }

    async deleteBoard(name: string): Promise<void> {
        await fs.removeDir(fpJoin(this.state.get().persephonePath, "boards", name), true);
        await this.refreshBoards();
    }

    /** App-restart / cross-window restore — re-enumerate from persisted persephonePath. */
    async restore(): Promise<void> {
        if (!this.state.get().persephonePath) return;
        void projectTrust.load();
        await this.refreshBoards();
    }

    matchesNavigationTarget(target: string | undefined, filePath: string): boolean {
        if (target !== "board-view") return false;
        const link = decodePersephoneFolderLink(filePath);
        return !!link && normPath(link.persephonePath) === normPath(this.state.get().persephonePath);
    }

    beforeNavigateAway(): void { /* survive navigation, like mneme-root */ }

    setPage(page: IPageHost | null): void {
        super.setPage(page);
        if (page && !this.secondaryView?.length) this.secondaryView = ["board-list"];
    }

    async requestClose(): Promise<void> { await this.page?.removeSecondaryView(this); }
}
```

- `normPath` = the same local helper mneme-root uses (`replace(/[\\/]+/g,"/").replace(/\/+$/,"").toLowerCase()`), **or** reuse `fpNormalizeForCompare` from US-721 (preferred — single normalizer).
- Use `app.fs` / `fpJoin` only (no `require("fs")`/`require("path")`).

**`src/renderer/editors/board/index.tsx`** (new) — mirror `mneme-root/index.tsx`:

```typescript
export const boardModule: EditorModule = {
    createEditor: () => new BoardEditorModel(new TComponentState(getDefaultBoardEditorState())),
    Component: ({ model }) => <BoardEditorView model={model as BoardEditorModel} />,
};
export { BoardEditorModel, getDefaultBoardEditorState } from "./BoardEditorModel";
export { default } from "./BoardEditorView";   // carries newEditorModel (consumed by buildEditorById)
```

**`newEditorModel` on the `BoardEditorView` default export** (mirror mneme-root):

```typescript
const boardEditorDefault = {
    newEditorModel: async (filePath?: string): Promise<EditorOrHost> => {
        const model = new BoardEditorModel(new TComponentState(getDefaultBoardEditorState()));
        const link = filePath ? decodePersephoneFolderLink(filePath) : null;
        if (link) model.initFromPersephone(link.persephonePath);
        return model as unknown as EditorOrHost;
    },
};
export default boardEditorDefault;
```

### Step 7 — Registration `src/renderer/editors/register-editors.ts`

Editor (with the other Pattern-B editors):

```typescript
editorRegistry.register({
    id: "board-view",
    name: "Boards",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { boardModule } = await import("./board");
        return boardModule;
    },
});
```

Secondary view (with the other `secondaryViewRegistry.register` calls near the top):

```typescript
secondaryViewRegistry.register({
    id: "board-list",
    label: "Boards",
    loadComponent: () => import("./board/BoardListSecondaryView"),
});
```

### Step 8 — Persistence allow-list `src/renderer/api/pages/PagesPersistenceModel.ts`

Add `"board-view"` to `NO_HOST_EDITOR_IDS` so restore uses the no-host path (`createEditor` → `Object.assign` state → `restore()`).

### Step 9 — Main view `src/renderer/editors/board/BoardEditorView.tsx` (new)

Renders, in order:

1. **Trust gate (US-721 consumer — fulfils US-721 C2 deferral):**
   ```typescript
   const persephonePath = model.state.use((s) => s.persephonePath);
   const trusted = projectTrust.useIsTrusted(persephonePath);
   if (!trusted) return <UntrustedProjectView path={persephonePath} onTrust={async () => {
       if (await showTrustProjectDialog(persephonePath)) await projectTrust.trust(persephonePath);
   }} />;
   ```
2. **Trusted:** a board host region. If a board is selected → **placeholder** *"This board will render here — `board://` webview lands in US-723"*. Plus **management** (Create / Delete) — Create prompts for a name (reuse an existing input dialog / `showConfirmationDialog` sibling) then `model.createBoard(name)` and surfaces the collision error as a toast; Delete confirms then `model.deleteBoard(name)`.

**`src/renderer/editors/board/UntrustedProjectView.tsx`** (new) — centered `WarningIcon` + *"Boards are not supported in untrusted projects"* + a **Trust project** `Button` calling `onTrust`. Lives under `editors/board/` (board-coupled, not a uikit primitive).

### Step 10 — Side panel `src/renderer/editors/board/BoardListSecondaryView.tsx` (new)

`SecondaryViewProps` component (cast `model as BoardEditorModel`, like `MnemeTreeSecondaryView`). Lists `model.state.use(s => s.boards)`; clicking a name sets `selectedBoard`; portals title/actions through `SideBarPanelHeader` via `headerRef`. A `+` Create action here is optional (management primarily in the main view per the epic).

## Scope boundary (what US-722 does NOT build)

| Deferred to | Item |
|---|---|
| **US-723** | The `board://` protocol + locked-down `<webview>` + CSP. US-722 renders a **placeholder** where the webview will mount. |
| **US-724** | The `persephone` bridge (preload / `execute()` handle). |
| **US-726** | Board-folder scaffolding (whatever Create should drop in — template copy *or* agent-authored, TBD in US-726), `config.json` load/watch, `ui.log`. US-722's `createBoard` makes an **empty** folder; US-726 decides what (if anything) populates it. |
| **US-725** | `--p-*` theme contract injection. |

US-722's job is the **host shell**: routing, the per-folder-singleton editor, the board list (side panel + main), create/delete of board folders, and the trust gate. Everything that renders or runs board content arrives later.

## Concerns / open questions

- **C1 — Settings gate (`boards.enabled`). ✅ decided (user, 2026-06-19): no gate.** EPIC-034 will not be released until the epic is fully complete and tested, so there is no half-built-feature exposure to guard against. `.persephone` detection is **name-only** (like `.mneme`), with no settings key. No `settings.ts` / `SettingsView` changes.

- **C2 — Editor opens on the `.persephone` folder itself, not the parent. ✅ resolved.** Unlike `.git`/`.mneme` (parent), the Board editor's root **is** the `.persephone` path — it contains `boards/` and is the US-721 trust key (C7). The codec encodes `item.href` directly. One path = root + boards-container + trust key.

- **C3 — Untrusted placeholder lives here (US-721 C2). ✅ resolved.** `UntrustedProjectView` + the Trust-button wiring (`showTrustProjectDialog` → `projectTrust.trust`) ship in US-722, where the board host region they replace actually exists. US-721 delivered the service + dialog only.

- **C4 — Create makes an empty folder. ✅ resolved (boundary).** US-722's `createBoard` does `fs.mkdir` (+ collision error) and nothing else. Whatever should populate a new board — a bundled template copy, agent-authored files, or nothing — is a **US-726** decision (and may end up being "no template at all"; see the 2026-06-19 note). Keeps US-722 self-contained and testable without US-726. An empty board folder lists fine; it just has nothing to render yet (consistent with the US-723 webview deferral).

- **C5 — Board icon. ✅ resolved (2026-06-19).** `BoardIcon` (a dashboard-panels glyph, `stroke="currentColor"` so it follows the theme) is already added to `src/renderer/theme/icons.tsx`. Implementation just imports it: `getIcon` returns `<BoardIcon />`, and `TreeProviderItemIcon.tsx` gets an `item.icon === "board"` case rendering it at 16×16.

- **C6 — Board-list live refresh. ✅ decided (user, 2026-06-19): out of scope.** US-722 refreshes `state.boards` on open/restore and after its own create/delete — no watcher for *external* folder changes. Rather than bolt a one-off `DirectoryWatcher` onto the boards list, the live-refresh idea is folded into a future **shared folder-watcher service** (Explorer + consumers): the Explorer already watches folders, so a single watcher on a **parent** folder could detect descendant board-folder changes and emit to the Board editor as one of its subscribers — no duplicate watchers. Captured in [backlog.md](../backlog.md) ("Shared folder-watcher service"); not built here.

- **C7 — Rename. ✅ decided (user, 2026-06-19): not implemented.** No in-editor board-rename in US-722. A board's name is its folder name, and the user can rename the folder directly in the Explorer (the board list refreshes on next open/restore). Revisit only if a use case appears.

- **C8 — `EditorType` union. ✅ touchpoint flagged.** If `EditorType` in `src/shared/types.ts` is a closed union, add `"boardPage"` (mirror `"mnemeRootPage"`); the descriptor system keys off `editorId` ("board-view") regardless, so this is a legacy-discriminator formality.

## Acceptance criteria

1. A `.persephone` folder shown in the Explorer renders with the board icon; clicking it opens the **Board editor** on that page (not a new tab) — and clicking it again **reuses** the same editor instance (singleton via `matchesNavigationTarget`), never a duplicate.
2. The editor's root, the boards container (`<root>/boards`), and the US-721 trust key are all the **`.persephone` folder path** (verify the codec encodes `item.href`, not the parent).
3. **Untrusted** project → the editor shows *"Boards are not supported in untrusted projects"* + **Trust project**; clicking it opens `showTrustProjectDialog`; on confirm, `projectTrust.trust` runs and the view **re-renders to trusted without reopening** (reactive `useIsTrusted`).
4. **Trusted** project → the main view lists boards (folder names under `boards/`) and offers **Create** (empty folder; duplicate name surfaces an error) and **Delete** (recursive, with confirmation); the side panel lists the same boards and selecting one drives the main view (placeholder board region in US-722).
5. The board list and selection **survive an app restart** — `restore()` re-enumerates from the persisted `persephonePath`; the editor reopens on the correct page as a no-host editor.
6. The side panel ("Boards") registers via `secondaryViewRegistry` and appears whenever the Board editor is main.
7. `npm run lint` clean; **no** `require("fs")`/`require("path")` (uses `app.fs` + `file-path` helpers); no hardcoded colors.

### How to verify via MCP

Routing/UI is hard to drive head-less, but the model layer is testable with `execute_script` (dev-server source import, as in US-721) plus a real folder on disk:

```javascript
// create a throwaway project, then drive the model
const link = await import("/src/renderer/content/persephone-folder-link.ts");
const url = link.encodePersephoneFolderLink("D:/__board_test__/.persephone");
const round = link.decodePersephoneFolderLink(url);        // → { persephonePath: "D:/__board_test__/.persephone" }
return JSON.stringify({ url, round });
```

Manual: create `D:/__board_test__/.persephone/boards/Demo/`, open the folder in Explorer, confirm the Board editor opens, lists "Demo", the trust gate flips on **Trust project**, and Create/Delete add/remove board folders. Clean up afterward.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/content/persephone-folder-link.ts` | **New** — `persephone-folder://` codec. |
| `src/renderer/content/tree-providers/FileTreeProvider.ts` | **Edit** — name-only `.persephone` detection in `list()`; `board-view` branch in `getNavigationUrl()` (encode `item.href`). |
| `src/renderer/components/tree-provider/TreeProviderItemIcon.tsx` | **Edit** — `item.icon === "board"` case. |
| `src/renderer/theme/icons.tsx` | **Done (2026-06-19)** — `BoardIcon` added. |
| `src/renderer/content/parsers.ts` | **Edit** — `persephone-folder://` Layer-1 parser → `target = "board-view"`. |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | **Edit** — `buildEditorById` `case "board-view"`. |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | **Edit** — add `"board-view"` to `NO_HOST_EDITOR_IDS`. |
| `src/renderer/editors/board/BoardEditorModel.ts` | **New** — model + `BoardEditorState`, `restore()`, `matchesNavigationTarget`, `refreshBoards/createBoard/deleteBoard`, `setPage`→`board-list`. |
| `src/renderer/editors/board/BoardEditorView.tsx` | **New** — main view (trust gate → board host placeholder + create/delete); `default` export carrying `newEditorModel`. |
| `src/renderer/editors/board/UntrustedProjectView.tsx` | **New** — untrusted placeholder + Trust button (US-721 consumer). |
| `src/renderer/editors/board/BoardListSecondaryView.tsx` | **New** — side-panel board list/switcher. |
| `src/renderer/editors/board/index.tsx` | **New** — `boardModule` + `export { default }`. |
| `src/renderer/editors/register-editors.ts` | **Edit** — register `board-view` editor + `board-list` secondary view. |
| `src/shared/types.ts` | **Edit (C8, if union closed)** — add `"boardPage"` to `EditorType`. |

### Files needing NO changes

- `src/renderer/content/resolvers.ts` — generic `"://"` file resolver passes `target` through (verified for mneme/git).
- `src/renderer/content/open-handler.ts` — `pageId` route → `navigatePageTo` already handles targeted navigation.
- `src/renderer/api/project-trust.ts`, `src/renderer/ui/dialogs/TrustProjectDialog.tsx` — US-721 deliverables, consumed as-is.
- `src/renderer/api/fs.ts` — `listDirWithTypes` / `mkdir` / `removeDir` / `exists` used as-is.
- `src/renderer/ui/secondary-views/secondary-view-registry.ts`, `panel-key.ts` — registry/key APIs used as-is.
- `src/renderer/editors/base/editorRegistry.ts`, `EditorModel.ts` — base contracts used as-is.
