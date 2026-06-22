import { createElement, type ReactNode } from "react";

import { EditorModel, type EditorStateBase } from "../base/EditorModel";
import { BoardIcon } from "../../theme/icons";
import type { IPageHost } from "../../api/pages/IPageHost";
import { fs } from "../../api/fs";
import { fpBasename, fpJoin, fpNormalizeForCompare } from "../../core/utils/file-path";
import { DirectoryWatcher, FileWatcher } from "../../core/utils/file-watcher";
import { boardTrust } from "../../api/board-trust";
import { decodePersephoneFolderLink } from "../../content/persephone-folder-link";
import { decodePersephoneBoardLink } from "../../content/persephone-board-link";
import { createBoardFromTemplate } from "./board-scaffold";
import { isBoardFolder } from "./board-manifest";
import { BoardTargetModel } from "./BoardTargetModel";
import { BoardGlyph } from "./BoardGlyph";
import { invalidateBoardIcon } from "./board-icon-cache";

/** Should a change to `relPath` (relative to the board root, as reported by the
 *  folder watcher) live-reload the webview? True only for board FRONTEND source —
 *  `app.js` / any `.js`/`.mjs`/`.cjs` and `.css` (US-756 C3). Deliberately false for:
 *  `ui.log` (its writes must never trigger a reload, or an error→log→reload loop
 *  forms — `.log` simply isn't a source extension), data/state files a board writes
 *  via `writeFile` (`.json`, etc.), and anything under `node_modules`. `index.html`
 *  is `.html` (not matched) — it has its own dedicated watcher, so this avoids a
 *  double remount. */
function isBoardReloadSource(relPath: string): boolean {
    const p = relPath.replace(/\\/g, "/").toLowerCase();
    if (p.includes("node_modules/")) return false;
    return /\.(c|m)?js$/.test(p) || p.endsWith(".css");
}

export interface BoardEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "boardPage";
    /** EditorView id. */
    editor: "board-view";
    /** Project/grouping mode ONLY: absolute path of the directory that CONTAINS
     *  board folders — `<project>/.persephone/boards`. Empty in single-board mode. */
    boardsDir: string;
    /** Single-board mode ONLY: the board's OWN absolute root path. Undefined in
     *  project mode. When set, the editor renders exactly this board, never
     *  enumerates siblings, and has no knowledge of any other board.
     *  `boardRoot` set ⟺ single-board mode (the discriminator). */
    boardRoot?: string;
    /** Display title — the project folder name (parent of `.persephone`) in
     *  project mode, or the board folder name in single-board mode. */
    title: string;
    /** Board folder names under `boardsDir` (project mode), or the single board's
     *  own name (single-board mode). Re-enumerated on open/restore + after
     *  create/delete. */
    boards: string[];
    /** Currently-opened board (folder name), or undefined for the board list. */
    selectedBoard?: string;
    /** Bumped to force a remount of the selected board's webview — by the
     *  `index.html` watcher (live reload) and the manual Refresh button. */
    reloadToken: number;
    /** True when the selected board's `ui.log` exists and is non-empty — drives
     *  the on-board log indicator. */
    logHasErrors: boolean;
    /** Sidebar panel contributions. */
    secondaryView?: string[];
}

/** Project display name = the folder that CONTAINS `.persephone`. */
function boardProjectTitle(persephonePath: string): string {
    const parts = persephonePath.replace(/[/\\]+$/, "").split(/[/\\]/);
    parts.pop(); // drop the ".persephone" segment
    return parts.pop() || "Boards";
}

export const getDefaultBoardEditorState = (): BoardEditorState => ({
    // Per-instance UUID — keys this editor in `page.editors[]`.
    id: crypto.randomUUID(),
    title: "Boards",
    modified: false,
    type: "boardPage",
    editor: "board-view",
    boardsDir: "",
    boards: [],
    selectedBoard: undefined,
    reloadToken: 0,
    logHasErrors: false,
});

/**
 * Board editor (EPIC-034 / US-722).
 *
 * Opened by clicking a `.persephone` folder in any file tree (mirrors `.git` →
 * Git Tree, `.mneme` → Mneme root). Hosts the project's Boards: a side panel
 * lists them (the switcher), and the main view lists them with create/delete and
 * renders the selected board's webview. Rendering and `execute()` are gated by
 * the per-board trust gate: an untrusted board shows a placeholder + "Trust
 * board" button instead of rendering.
 *
 * Follows the "survive navigation, close only via the panel `x`" lifecycle and
 * is a per-project navigation singleton, so re-clicking the same `.persephone`
 * reuses this instance rather than stacking duplicates.
 */
export class BoardEditorModel extends EditorModel<BoardEditorState> {
    readonly editorId = "board-view";

    noLanguage = true;
    skipSave = true;
    showBackgroundOrnament = true;

    /** Automation adapter — lets the `browser_*` MCP tools drive this board's
     *  webview (EPIC-034 / US-730). */
    readonly target = new BoardTargetModel(this);

    /** The live `<webview>` element of the currently-mounted board, for automation
     *  focus / insertText / reload. Transient (not persisted): set on `dom-ready`,
     *  cleared on unmount. */
    currentWebview: Electron.WebviewTag | null = null;

    setWebview(wv: Electron.WebviewTag): void {
        this.currentWebview = wv;
    }

    /** Clear only if it still matches — guards against a remount setting the new
     *  element before the old one's cleanup runs. */
    clearWebview(wv: Electron.WebviewTag): void {
        if (this.currentWebview === wv) this.currentWebview = null;
    }

    /** Watches the selected board's `index.html` → live reload (remount). */
    private indexWatcher?: FileWatcher;
    /** Watches the selected board's folder for two jobs: (1) keep `logHasErrors` +
     *  the board icon current (a directory watcher, not a `FileWatcher` on `ui.log`,
     *  so it catches the file's first creation — `nodefs.watch` throws on a
     *  not-yet-existent path); and (2) live-reload the webview on board SOURCE edits
     *  the `index.html` watcher misses — `app.js` and CSS (US-756 C3). The reload is
     *  gated by {@link isBoardReloadSource}: `ui.log` is excluded so an error→
     *  log-write→reload feedback loop can't form, and data/state files (e.g. a
     *  board's own `writeFile` JSON) are excluded so a board persisting state doesn't
     *  remount itself. */
    private logDirWatcher?: DirectoryWatcher;

    /** Absolute root of a board by its list name, mode-aware. In single-board mode
     *  the name is the board's own basename and the root is `boardRoot`; in project
     *  mode it is `<boardsDir>/<name>`. Single source of board-path resolution. */
    boardRootOf(name: string): string {
        const s = this.state.get();
        return s.boardRoot ?? fpJoin(s.boardsDir, name);
    }

    /** Root of the board currently rendered, or undefined when the list view shows
     *  no selection. */
    private currentBoardRoot(): string | undefined {
        const sel = this.state.get().selectedBoard;
        return sel ? this.boardRootOf(sel) : undefined;
    }

    /** Tab/panel icon — the open board's own icon when one is selected (falls back
     *  to the dashboard glyph), else the dashboard glyph for the board list. The
     *  tab re-invokes this when `state.iconKey` changes (set in `selectBoard`). */
    getIcon = (): ReactNode => {
        const root = this.currentBoardRoot();
        if (root) {
            return createElement(BoardGlyph, { boardRoot: root });
        }
        return createElement(BoardIcon);
    };

    /** Register the "Boards" side panel when attached to a page (Pattern B — the
     *  editor is its own surviving secondary view). PROJECT MODE ONLY: a single
     *  board (`boardRoot` set) shows alone on the page with no sidebar (US-746). */
    setPage(page: IPageHost | null): void {
        super.setPage(page);
        if (page && !this.state.get().boardRoot && !this.secondaryView?.length) {
            this.secondaryView = ["board-list"];
        }
    }

    /** Survive navigation (Pattern B): the base default clears the panel, so
     *  override to a no-op so the project board switcher survives. A single board
     *  has no panel, so it falls through to the base behaviour (plain editor). */
    beforeNavigateAway(newModel: EditorModel): void {
        if (this.state.get().boardRoot) {
            super.beforeNavigateAway(newModel);
            return;
        }
        // Project mode: intentionally empty — survive unconditionally.
    }

    /** When the page navigates to another editor, this one demotes to a sidebar
     *  panel — drop the board selection so the side-panel list reflects what's
     *  actually shown on the page. (Re-selecting from the panel promotes + reopens
     *  the board; see BoardListSecondaryView.) Not fired on the new main, so it
     *  never clobbers a board we're navigating *to*. Project mode only — a single
     *  board has nothing to demote to. */
    onMainEditorChanged(_newMainEditor: EditorModel | null): void {
        if (this.state.get().boardRoot) return;
        if (this.state.get().selectedBoard) {
            this.selectBoard(undefined);
        }
    }

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

    /** Manual close (the panel "x"): detach + dispose this editor only. */
    async requestClose(): Promise<void> {
        await this.page?.removeSecondaryView(this);
    }

    /** Project / grouping mode — opened from a `.persephone` folder click. Seed
     *  `boardsDir` + provisional title, then load trust state and enumerate. */
    initFromPersephone(persephonePath: string): void {
        this.state.update((s) => {
            s.boardsDir = fpJoin(persephonePath, "boards");
            s.boardRoot = undefined;
            s.title = boardProjectTitle(persephonePath);
        });
        void boardTrust.load();
        void this.refreshBoards();
    }

    /** Single-board mode — opened by a `persephone-board://` link (US-748) or the
     *  MCP `openBoard` (US-750). The board is standalone: no container, no sibling
     *  enumeration, no sidebar panel (see `setPage`). */
    initFromBoardRoot(boardRoot: string): void {
        const name = fpBasename(boardRoot);
        this.state.update((s) => {
            s.boardsDir = "";
            s.boardRoot = boardRoot;
            s.title = name;
        });
        void boardTrust.load();
        this.selectBoard(name);
        void this.refreshBoards();
    }

    /** Persistence restore (app restart + cross-window). `boardsDir`/`boardRoot`
     *  ride the persisted state; re-load trust + re-enumerate the boards from disk. */
    async restore(): Promise<void> {
        const s = this.state.get();
        if (!s.boardsDir && !s.boardRoot) return;
        void boardTrust.load();
        await this.refreshBoards();
        // A board may have been open before restart — re-attach its watchers.
        this.watchSelectedBoard(this.state.get().selectedBoard);
    }

    /** Tear down the per-board watchers when this editor is disposed. */
    async dispose(): Promise<void> {
        this.indexWatcher?.dispose();
        this.indexWatcher = undefined;
        this.logDirWatcher?.dispose();
        this.logDirWatcher = undefined;
        await super.dispose();
    }

    /** Re-derive `state.boards`. Project mode: enumerate manifest-bearing subfolders
     *  of `boardsDir`. Single-board mode: the board knows only itself — pin to its
     *  own name (when its manifest is present), never scan siblings (US-746). */
    async refreshBoards(): Promise<void> {
        const { boardsDir, boardRoot } = this.state.get();
        let boards: string[] = [];
        try {
            if (boardRoot) {
                if (await isBoardFolder(boardRoot)) boards = [fpBasename(boardRoot)];
            } else if (await fs.exists(boardsDir)) {
                const entries = await fs.listDirWithTypes(boardsDir);
                const dirs = entries.filter((e) => e.isDirectory).map((e) => e.name);
                // A folder is a board only if it carries board-manifest.json.
                const isBoard = await Promise.all(dirs.map((n) => isBoardFolder(fpJoin(boardsDir, n))));
                boards = dirs.filter((_, i) => isBoard[i]).sort((a, b) => a.localeCompare(b));
            }
        } catch {
            boards = [];
        }
        // Re-probe each board's icon so a freshly added icon.* shows after a
        // refresh (create / delete / open) without an app restart (US-744 / Q4).
        for (const name of boards) {
            invalidateBoardIcon(this.boardRootOf(name));
        }
        this.state.update((s) => {
            s.boards = boards;
            // Drop a stale selection if the folder vanished externally.
            if (s.selectedBoard && !boards.includes(s.selectedBoard)) {
                s.selectedBoard = undefined;
            }
        });
    }

    /** Open a board in the main view (undefined → back to the board list). */
    selectBoard(name: string | undefined): void {
        // `iconKey` drives the tab's icon refresh (it observes iconKey, not
        // selectedBoard) so the tab shows the opened board's icon.
        this.state.update((s) => {
            s.selectedBoard = name;
            s.iconKey = name ?? "";
        });
        this.watchSelectedBoard(name);
    }

    /** Manual Refresh — remount the selected board's webview. Picks up `app.js` /
     *  inline-style edits that the `index.html` watch misses (same remount path). */
    reloadBoard(): void {
        this.state.update((s) => { s.reloadToken++; });
    }

    /** Absolute path to the selected board's `ui.log` (for the open-log action),
     *  or undefined when no board is open. */
    getSelectedBoardLogPath(): string | undefined {
        const root = this.currentBoardRoot();
        return root ? fpJoin(root, "ui.log") : undefined;
    }

    /** (Re)attach the per-board watchers when the selection changes: a FileWatcher
     *  on `index.html` (live reload) + a DirectoryWatcher on the board folder
     *  (log-indicator state). Disposes the previous board's watchers first. */
    private watchSelectedBoard(name: string | undefined): void {
        this.indexWatcher?.dispose();
        this.indexWatcher = undefined;
        this.logDirWatcher?.dispose();
        this.logDirWatcher = undefined;
        this.state.update((s) => {
            s.reloadToken = 0;
            s.logHasErrors = false;
        });
        if (!name) return;
        const boardRoot = this.boardRootOf(name);
        this.indexWatcher = new FileWatcher(fpJoin(boardRoot, "index.html"), () => {
            this.state.update((s) => { s.reloadToken++; });
        });
        this.logDirWatcher = new DirectoryWatcher(boardRoot, (filename) => {
            // The folder changed — the log state may have, and so may the board's
            // icon file (added / replaced / removed). Re-probe both (US-744).
            invalidateBoardIcon(boardRoot);
            void this.refreshLogState();
            // Live-reload on board source edits the index.html watcher misses —
            // app.js / CSS (US-756 C3). Gated to avoid the ui.log feedback loop and
            // not to remount when a board persists its own state to disk.
            if (filename && isBoardReloadSource(filename)) {
                this.state.update((s) => { s.reloadToken++; });
            }
        });
        void this.refreshLogState();
    }

    /** Light the on-board log indicator when the selected board's `ui.log` exists
     *  and is non-empty. */
    private async refreshLogState(): Promise<void> {
        const logPath = this.getSelectedBoardLogPath();
        let hasErrors = false;
        if (logPath) {
            try {
                const st = await fs.stat(logPath);
                hasErrors = !!st?.exists && st.size > 0;
            } catch {
                hasErrors = false;
            }
        }
        this.state.update((s) => { s.logHasErrors = hasErrors; });
    }

    /** Create a blank board scaffolded from the bundled `board-template`, inside
     *  THIS editor's own container, then refresh + select. Project mode only — the
     *  list editor's "New board" affordance. Throws on a duplicate/illegal name.
     *  Creating a board elsewhere goes through `createBoardFromTemplate` directly
     *  (US-750) and never touches this editor. */
    async createBoard(name: string): Promise<void> {
        await createBoardFromTemplate(name, this.state.get().boardsDir, "board-template");
        await this.refreshBoards();
        this.selectBoard(name);
    }

    /** Create a board scaffolded from the bundled `demo-board` template (US-728),
     *  inside this editor's own container, then refresh + select. */
    async createDemoBoard(name: string): Promise<void> {
        await createBoardFromTemplate(name, this.state.get().boardsDir, "demo-board");
        await this.refreshBoards();
        this.selectBoard(name);
    }

    /** Delete a board folder (recursive). */
    async deleteBoard(name: string): Promise<void> {
        await fs.removeDir(this.boardRootOf(name), true);
        await this.refreshBoards();
    }
}
