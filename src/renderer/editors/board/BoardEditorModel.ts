import { createElement, type ReactNode } from "react";

import { EditorModel, type EditorStateBase } from "../base/EditorModel";
import { BoardIcon } from "../../theme/icons";
import type { IPageHost } from "../../api/pages/IPageHost";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { fpJoin, fpNormalizeForCompare } from "../../core/utils/file-path";
import { DirectoryWatcher, FileWatcher } from "../../core/utils/file-watcher";
import { projectTrust } from "../../api/project-trust";
import { decodePersephoneFolderLink } from "../../content/persephone-folder-link";
import { scaffoldBoard } from "./board-scaffold";

export interface BoardEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "boardPage";
    /** EditorView id. */
    editor: "board-view";
    /** Absolute path of the `.persephone` project folder. This is the editor's
     *  root, the parent of `boards/`, AND the per-project trust key (US-721). */
    persephonePath: string;
    /** Display title — the project folder name (parent of `.persephone`). */
    title: string;
    /** Board folder names under `<persephonePath>/boards` (re-enumerated on
     *  open/restore + after create/delete). */
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
    persephonePath: "",
    boards: [],
    selectedBoard: undefined,
    reloadToken: 0,
    logHasErrors: false,
});

/**
 * Board editor (EPIC-034 / US-722).
 *
 * Opened by clicking a `.persephone` folder in any file tree (mirrors `.git` →
 * Git Tree, `.mneme` → Mneme root). Hosts the project's Web Boards: a side panel
 * lists them (the switcher), and the main view lists them with create/delete and
 * — once US-723 lands — renders the selected board's webview. Rendering and
 * `execute()` are gated by the per-project trust gate (US-721): an untrusted
 * project shows a placeholder + "Trust project" button instead of any board.
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

    /** Watches the selected board's `index.html` → live reload (remount). */
    private indexWatcher?: FileWatcher;
    /** Watches the selected board's folder → keeps `logHasErrors` current. Uses a
     *  directory watcher (not a `FileWatcher` on `ui.log`) so it catches the file's
     *  first creation — `nodefs.watch` throws on a not-yet-existent path. It only
     *  re-stats `ui.log`; it never bumps `reloadToken`, so there's no
     *  error→log-write→reload feedback loop. */
    private logDirWatcher?: DirectoryWatcher;

    /** Tab/panel icon — the dashboard glyph. */
    getIcon = (): ReactNode => createElement(BoardIcon);

    /** Register the "Boards" side panel when attached to a page (Pattern B —
     *  the editor is its own surviving secondary view). */
    setPage(page: IPageHost | null): void {
        super.setPage(page);
        if (page && !this.secondaryView?.length) {
            this.secondaryView = ["board-list"];
        }
    }

    /** Survive navigation (Pattern B): the base default clears the panel, so
     *  override to a no-op. The sole removal path is the panel's "x". */
    beforeNavigateAway(): void {
        // Intentionally empty — survive unconditionally.
    }

    /** When the page navigates to another editor, this one demotes to a sidebar
     *  panel — drop the board selection so the side-panel list reflects what's
     *  actually shown on the page. (Re-selecting from the panel promotes + reopens
     *  the board; see BoardListSecondaryView.) Not fired on the new main, so it
     *  never clobbers a board we're navigating *to*. */
    onMainEditorChanged(_newMainEditor: EditorModel | null): void {
        if (this.state.get().selectedBoard) {
            this.selectBoard(undefined);
        }
    }

    /** Per-page singleton: re-navigating to the SAME `.persephone` reuses this
     *  instance (promote back to main) rather than building a duplicate panel. */
    matchesNavigationTarget(target: string | undefined, filePath: string): boolean {
        if (target !== "board-view") return false;
        const link = decodePersephoneFolderLink(filePath);
        return !!link
            && fpNormalizeForCompare(link.persephonePath) === fpNormalizeForCompare(this.state.get().persephonePath);
    }

    /** Manual close (the panel "x"): detach + dispose this editor only. */
    async requestClose(): Promise<void> {
        await this.page?.removeSecondaryView(this);
    }

    /** Seed persephonePath + provisional title from a decoded link, then load
     *  trust state and enumerate the boards. */
    initFromPersephone(persephonePath: string): void {
        this.state.update((s) => {
            s.persephonePath = persephonePath;
            s.title = boardProjectTitle(persephonePath);
        });
        void projectTrust.load();
        void this.refreshBoards();
    }

    /** Persistence restore (app restart + cross-window). persephonePath rides
     *  the persisted state; re-load trust + re-enumerate the boards from disk. */
    async restore(): Promise<void> {
        if (!this.state.get().persephonePath) return;
        void projectTrust.load();
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

    /** Enumerate `<persephonePath>/boards` subfolders into `state.boards`. */
    async refreshBoards(): Promise<void> {
        const boardsDir = fpJoin(this.state.get().persephonePath, "boards");
        let boards: string[] = [];
        try {
            if (await fs.exists(boardsDir)) {
                const entries = await fs.listDirWithTypes(boardsDir);
                boards = entries
                    .filter((e) => e.isDirectory)
                    .map((e) => e.name)
                    .sort((a, b) => a.localeCompare(b));
            }
        } catch {
            boards = [];
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
        this.state.update((s) => { s.selectedBoard = name; });
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
        const name = this.state.get().selectedBoard;
        if (!name) return undefined;
        return fpJoin(this.state.get().persephonePath, "boards", name, "ui.log");
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
        const boardRoot = fpJoin(this.state.get().persephonePath, "boards", name);
        this.indexWatcher = new FileWatcher(fpJoin(boardRoot, "index.html"), () => {
            this.state.update((s) => { s.reloadToken++; });
        });
        this.logDirWatcher = new DirectoryWatcher(boardRoot, () => void this.refreshLogState());
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

    /** Create a board folder scaffolded from the bundled template. Throws on a
     *  duplicate/illegal name (the OS surfaces illegal names; the explicit
     *  collision check covers duplicates). */
    async createBoard(name: string): Promise<void> {
        const dir = fpJoin(this.state.get().persephonePath, "boards", name);
        if (await fs.exists(dir)) {
            throw new Error(`A board named "${name}" already exists.`);
        }
        try {
            await scaffoldBoard(dir);
        } catch (err) {
            // Template missing / copy failed — still produce a usable (empty) board.
            await fs.mkdir(dir);
            ui.notify(
                `Board created, but the template could not be copied: ${
                    err instanceof Error ? err.message : String(err)
                }`,
                "warning",
            );
        }
        await this.refreshBoards();
        this.selectBoard(name);
    }

    /** Delete a board folder (recursive). */
    async deleteBoard(name: string): Promise<void> {
        await fs.removeDir(fpJoin(this.state.get().persephonePath, "boards", name), true);
        await this.refreshBoards();
    }
}
