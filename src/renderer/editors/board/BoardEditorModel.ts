import { createElement, type ReactNode } from "react";

import { EditorModel, type EditorStateBase } from "../base/EditorModel";
import { BoardIcon } from "../../theme/icons";
import { fs } from "../../api/fs";
import { fpBasename, fpJoin, fpNormalizeForCompare } from "../../core/utils/file-path";
import { DirectoryWatcher, FileWatcher } from "../../core/utils/file-watcher";
import { boardTrust } from "../../api/board-trust";
import { decodePersephoneBoardLink } from "../../content/persephone-board-link";
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
    /** The board's OWN absolute root path — the folder that directly contains
     *  `index.html`, `board-manifest.json`, `ui.log`, and the optional icon.
     *  Always set for a live board; absent only in legacy persisted state, which
     *  `restore()` drops. */
    boardRoot?: string;
    /** Display title — the board folder name. */
    title: string;
    /** The board's name (folder basename) when it resolves on disk, or undefined
     *  when the board folder/manifest is missing (drives `BoardNotFoundView`).
     *  Re-validated on open/restore by `refreshBoards`. */
    selectedBoard?: string;
    /** Bumped to force a remount of the board's webview — by the `index.html`
     *  watcher (live reload) and the manual Reload action. */
    reloadToken: number;
    /** True when the board's `ui.log` exists and is non-empty — drives the
     *  on-board log indicator. */
    logHasErrors: boolean;
    /** Sidebar panel contributions. */
    secondaryView?: string[];
}

export const getDefaultBoardEditorState = (): BoardEditorState => ({
    // Per-instance UUID — keys this editor in `page.editors[]`.
    id: crypto.randomUUID(),
    title: "Board",
    modified: false,
    type: "boardPage",
    editor: "board-view",
    selectedBoard: undefined,
    reloadToken: 0,
    logHasErrors: false,
});

/**
 * Board editor (EPIC-034 / EPIC-035 / EPIC-036).
 *
 * Renders a single standalone board: the folder at `boardRoot` (carrying
 * `board-manifest.json`). Opened by a `persephone-board://` link — from the
 * Explorer Boards panel (US-761), the manifest-row "Open Board" button, or the
 * MCP `openBoard` tool. Rendering and `execute()` are gated by the per-board
 * trust gate: an untrusted board shows a placeholder + "Trust board" button
 * instead of rendering; a board whose folder is gone shows "Board not found".
 *
 * A board does NOT survive navigation — it is a plain main editor, re-opened from
 * the Boards panel or the in-board toolbar (EPIC-036 C4).
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

    /** Watches the board's `index.html` → live reload (remount). */
    private indexWatcher?: FileWatcher;
    /** Watches the board's folder for two jobs: (1) keep `logHasErrors` + the board
     *  icon current (a directory watcher, not a `FileWatcher` on `ui.log`, so it
     *  catches the file's first creation — `nodefs.watch` throws on a not-yet-existent
     *  path); and (2) live-reload the webview on board SOURCE edits the `index.html`
     *  watcher misses — `app.js` and CSS (US-756 C3). The reload is gated by
     *  {@link isBoardReloadSource}: `ui.log` is excluded so an error→log-write→reload
     *  feedback loop can't form, and data/state files (e.g. a board's own `writeFile`
     *  JSON) are excluded so a board persisting state doesn't remount itself. */
    private logDirWatcher?: DirectoryWatcher;

    /** Folder of the currently-shown board, or undefined when none is resolved. */
    private currentBoardRoot(): string | undefined {
        const s = this.state.get();
        return s.selectedBoard ? s.boardRoot : undefined;
    }

    /** Tab/panel icon — the board's own icon when it resolves (falls back to the
     *  dashboard glyph). The tab re-invokes this when `state.iconKey` changes (set
     *  in `selectBoard`). */
    getIcon = (): ReactNode => {
        const root = this.currentBoardRoot();
        if (root) {
            return createElement(BoardGlyph, { boardRoot: root });
        }
        return createElement(BoardIcon);
    };

    /** Per-page singleton: re-navigating to the SAME board reuses this instance
     *  (promote back to main) rather than stacking a duplicate. Matches the
     *  `persephone-board://` link for this board's root. */
    matchesNavigationTarget(target: string | undefined, filePath: string): boolean {
        if (target !== "board-view") return false;
        const boardRoot = this.state.get().boardRoot;
        if (!boardRoot) return false;
        const boardLink = decodePersephoneBoardLink(filePath);
        return !!boardLink
            && fpNormalizeForCompare(boardLink.boardRoot) === fpNormalizeForCompare(boardRoot);
    }

    /** Single-board init — opened by a `persephone-board://` link (US-748) or the
     *  MCP `openBoard` (US-750). */
    initFromBoardRoot(boardRoot: string): void {
        const name = fpBasename(boardRoot);
        this.state.update((s) => {
            s.boardRoot = boardRoot;
            s.title = name;
        });
        void boardTrust.load();
        this.selectBoard(name);
        void this.refreshBoards();
    }

    /** Persistence restore (app restart + cross-window). `boardRoot` rides the
     *  persisted state; re-load trust + re-validate the board. Legacy `.persephone`
     *  project-mode state (had `boardsDir`, no `boardRoot`) is no longer supported —
     *  throw so PagesPersistenceModel's catch drops the editor rather than restoring
     *  a broken empty board tab (EPIC-036 C6). */
    async restore(): Promise<void> {
        const s = this.state.get();
        if (!s.boardRoot) throw new Error("legacy project-mode board editor — dropped on restore");
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

    /** Re-validate the single board: clear the selection (→ BoardNotFoundView) when
     *  the board folder no longer carries a manifest, and re-probe its icon so a
     *  freshly added icon.* shows after a refresh without an app restart (US-744). */
    async refreshBoards(): Promise<void> {
        const boardRoot = this.state.get().boardRoot;
        if (!boardRoot) return;
        invalidateBoardIcon(boardRoot);
        let valid = false;
        try {
            valid = await isBoardFolder(boardRoot);
        } catch {
            valid = false;
        }
        this.state.update((s) => {
            if (!valid) s.selectedBoard = undefined;
        });
    }

    /** Select the board (its folder name) so it renders, or `undefined` to deselect
     *  (→ not-found). Single board, so `name` is always this board's own name. */
    selectBoard(name: string | undefined): void {
        // `iconKey` drives the tab's icon refresh (it observes iconKey, not
        // selectedBoard) so the tab shows the board's icon.
        this.state.update((s) => {
            s.selectedBoard = name;
            s.iconKey = name ?? "";
        });
        this.watchSelectedBoard(name);
    }

    /** Manual Reload — remount the board's webview. Picks up `app.js` / inline-style
     *  edits that the `index.html` watch misses (same remount path). */
    reloadBoard(): void {
        this.state.update((s) => { s.reloadToken++; });
    }

    /** Absolute path to the board's `ui.log` (for the open-log action), or undefined
     *  when no board is resolved. */
    getSelectedBoardLogPath(): string | undefined {
        const root = this.currentBoardRoot();
        return root ? fpJoin(root, "ui.log") : undefined;
    }

    /** (Re)attach the per-board watchers when the selection changes: a FileWatcher
     *  on `index.html` (live reload) + a DirectoryWatcher on the board folder
     *  (log-indicator state). `name` is the selection signal (watch / stop); the
     *  watched paths come from `boardRoot`. Disposes the previous watchers first. */
    private watchSelectedBoard(name: string | undefined): void {
        this.indexWatcher?.dispose();
        this.indexWatcher = undefined;
        this.logDirWatcher?.dispose();
        this.logDirWatcher = undefined;
        this.state.update((s) => {
            s.reloadToken = 0;
            s.logHasErrors = false;
        });
        const boardRoot = this.state.get().boardRoot;
        if (!name || !boardRoot) return;
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

    /** Light the on-board log indicator when the board's `ui.log` exists and is
     *  non-empty. */
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
}
