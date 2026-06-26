import { createElement, type ReactNode } from "react";

import { EditorModel, type EditorStateBase } from "../base/EditorModel";
import { api } from "../../../ipc/renderer/api";
import { BoardIcon } from "../../theme/icons";
import { fpBasename, fpJoin, fpNormalizeForCompare } from "../../core/utils/file-path";
import { boardTrust } from "../../api/board-trust";
import { decodePersephoneBoardLink } from "../../content/persephone-board-link";
import { isBoardFolder } from "./board-manifest";
import { BoardTargetModel } from "./BoardTargetModel";
import { BoardGlyph } from "./BoardGlyph";
import { invalidateBoardIcon } from "./board-icon-cache";

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
    /** Bumped to force a remount of the board's webview — by the manual Reload
     *  action and the `board_refresh` MCP tool. */
    reloadToken: number;
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
     *  frame (EPIC-034 / US-730; re-homed onto the `<iframe>` in EPIC-037 / US-773). */
    readonly target = new BoardTargetModel(this);

    /** The live `<iframe>` element of the currently-mounted board, for automation
     *  focus (CDP targets the board frame directly — US-773). Transient (not
     *  persisted): set on mount, cleared on unmount. */
    currentIframe: HTMLIFrameElement | null = null;

    setIframe(el: HTMLIFrameElement): void {
        this.currentIframe = el;
    }

    /** Clear only if it still matches — guards against a remount setting the new
     *  element before the old one's cleanup runs. */
    clearIframe(el: HTMLIFrameElement): void {
        if (this.currentIframe === el) this.currentIframe = null;
    }

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
            s.reloadToken = 0;
        });
    }

    /** Manual Reload — remount the board's webview to pick up edited files
     *  (`index.html` / `app.js` / CSS). Re-probes the board icon so a mid-session
     *  `icon.*` change shows on demand (no folder watcher — US-744 live refresh is
     *  intentionally dropped). Also invoked by the `board_refresh` MCP tool. */
    reloadBoard(): void {
        const boardRoot = this.state.get().boardRoot;
        if (boardRoot) invalidateBoardIcon(boardRoot);
        this.state.update((s) => { s.reloadToken++; });
    }

    /** Absolute path to the board's `ui.log` (for the open-log action), or undefined
     *  when no board is resolved. */
    getSelectedBoardLogPath(): string | undefined {
        const root = this.currentBoardRoot();
        return root ? fpJoin(root, "ui.log") : undefined;
    }

    /** Drop the live `<iframe>` reference and the board frame's CDP registration on
     *  teardown. `BoardWebview`'s unmount normally unregisters the frame, but `dispose()`
     *  can run without a clean React unmount (forced close / window teardown), so clear
     *  it here too — both are idempotent. */
    override async dispose(): Promise<void> {
        this.currentIframe = null;
        void api.unregisterBoardFrame(this.id);
        await super.dispose();
    }
}
