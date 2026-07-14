import { createElement, type ReactNode } from "react";

import { EditorModel, type EditorStateBase } from "../base/EditorModel";
import { editorRegistry } from "../base/editorRegistry";
import { api } from "../../../ipc/renderer/api";
import { BoardIcon } from "../../theme/icons";
import { fpBasename, fpJoin, fpNormalizeForCompare, isPlainLocalPath } from "../../core/utils/file-path";
import { boardTrust } from "../../api/board-trust";
import { decodePersephoneBoardLink } from "../../content/persephone-board-link";
import { boardEditorId } from "./custom-editor-registry";
import { isBoardFolder } from "./board-manifest";
import { BoardTargetModel } from "./BoardTargetModel";
import { BoardGlyph } from "./BoardGlyph";
import { invalidateBoardIcon } from "./board-icon-cache";
import { markBoardBusy } from "./busy-boards";

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
    /** Busy retention flag (US-799): set via `persephone.setBoardBusy(true)` when the
     *  board spawned processes that must outlive it. While busy, this model survives
     *  page navigation as an invisible ownership handle (its jobs in main are kept);
     *  page close / dispose kills them. TRANSIENT — cleared on restore (processes
     *  never survive an app restart). */
    busy?: boolean;
    /** The file this board edits as a custom editor (EPIC-042). Set on the SWITCH path
     *  (US-839) via `initFromBoardRoot`; on the openRawLink path the file rides
     *  `state.sourceLink.filePath` instead. Read both via `currentFilePath()`. Served to the
     *  board via `persephone.getFilePath()`. Undefined for a plain board. */
    filePath?: string;
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
    /** Virtual `board-editor:<root>` when acting as a custom editor for a file (so the
     *  switch widget shows/highlights it and `switchMainEditor` routes correctly), else
     *  the constant `"board-view"` for a plain board page. Persistence pins `"board-view"`
     *  regardless (see `getRestoreData`) so restore keys on the stable id. */
    get editorId(): string {
        const root = this.state.get().boardRoot;
        return root && this.currentFilePath() ? boardEditorId(root) : "board-view";
    }

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

    // ── Busy retention (US-799) ──────────────────────────────────────────

    /** Authoritative renderer-side busy holder. Set from the shim's `board:busy`
     *  post (via BoardWebview). Updates the reactive state (panel indicator),
     *  the window-level busy-roots registry, and mirrors the flag to main so a
     *  busy owner's jobs survive port disposal. */
    setBusy(busy: boolean): void {
        const s = this.state.get();
        if (!!s.busy === busy) return;
        this.state.update((st) => { st.busy = busy; });
        markBoardBusy(this.id, s.boardRoot, busy);
        void api.setBoardBusy(this.id, busy);
    }

    /** While busy, survive `setMainEditor` as an invisible ownership handle —
     *  the processes' lifetime stays tied to this page ("page closed → kill"). */
    override keepAliveOnNavigation(): boolean {
        return !!this.state.get().busy;
    }

    /** While busy, navigation away is non-destructive (this model survives) —
     *  skip the release prompt. Boards are never `modified`, so this is
     *  semantic hygiene rather than a behavior change. */
    override survivesNavigation(): boolean {
        return !!this.state.get().busy;
    }

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

    /** The file path this board edits, from either entry point (switch → `state.filePath`;
     *  openRawLink → `sourceLink.filePath`). Undefined for a plain, non-custom-editor board. */
    currentFilePath(): string | undefined {
        const s = this.state.get();
        return s.filePath ?? s.sourceLink?.filePath;
    }

    /** Merge both filePath sources so host-less consumers (the switch widget, the
     *  `switchMainEditor` board-boundary extraction) read a single value. */
    override get filePath(): string | undefined {
        return this.currentFilePath();
    }

    /** Switch options while ON the board (base returns []): the file's natural BUILT-IN
     *  editor (so the user can switch back) plus this board. Board peers claiming the same
     *  file are appended by the switch widget. Empty for a plain board / non-local file. */
    override findCompatibleEditors(): string[] {
        const filePath = this.currentFilePath();
        const root = this.state.get().boardRoot;
        if (!filePath || !root || !isPlainLocalPath(filePath)) return [];
        const builtinId = editorRegistry.resolveId(filePath) ?? "monaco";
        return [builtinId, boardEditorId(root)];
    }

    /** Persist the STABLE `"board-view"` id so restore + cross-window keys on it
     *  (`NO_HOST_EDITOR_IDS` + the zombie guard); the virtual `board-editor:<root>` id is
     *  re-derived from the persisted `state.filePath` / `state.boardRoot` on restore. */
    override getRestoreData() {
        const data = super.getRestoreData();
        data.editorId = "board-view";
        return data;
    }

    /** Single-board init — opened by a `persephone-board://` link (US-748) or the
     *  MCP `openBoard` (US-750). `filePath` is passed only on the custom-editor SWITCH path
     *  (US-839); on the openRawLink path it rides `state.sourceLink` instead. */
    initFromBoardRoot(boardRoot: string, filePath?: string): void {
        const name = fpBasename(boardRoot);
        this.state.update((s) => {
            s.boardRoot = boardRoot;
            s.title = name;
            if (filePath) s.filePath = filePath;
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
        // Busy is transient (US-799): processes never survive an app restart
        // (`will-quit` kills every child), so a persisted flag is always stale.
        if (s.busy) this.state.update((st) => { st.busy = false; });
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
     *  it here too — both are idempotent. Also the FINAL job teardown (US-799):
     *  `reapBoardOwner` tree-kills every job this board owner kept alive while busy —
     *  page close overrides busy ("page closed → kill anyway"). */
    override async dispose(): Promise<void> {
        // A custom-editor board opened via openRawLink is handed a (never-read)
        // FileProvider pipe by the open-handler — dispose it for hygiene (EPIC-042 CC8).
        (this as { pipe?: { dispose?: () => void } }).pipe?.dispose?.();
        markBoardBusy(this.id, undefined, false);
        void api.reapBoardOwner(this.id);
        this.currentIframe = null;
        void api.unregisterBoardFrame(this.id);
        await super.dispose();
    }
}
