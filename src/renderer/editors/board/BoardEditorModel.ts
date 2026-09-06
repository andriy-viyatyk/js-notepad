import { EditorModel, type EditorStateBase } from "../base/EditorModel";
import { editorRegistry } from "../base/editorRegistry";
import { api } from "../../../ipc/renderer/api";
import { BOARD_CDP_TAB } from "../../../ipc/api-types";
import { fpBasename, fpExtname, fpJoin, fpNormalizeForCompare, isPlainLocalPath } from "../../core/utils/file-path";
import { getLanguageByExtension } from "../../core/utils/language-mapping";
import { fs as appFs } from "../../api/fs";
import { boardTrust } from "../../api/board-trust";
import { createPipeFromDescriptor } from "../../content/registry";
import { pipeFromSourcePath } from "../../content/rebuild-pipe";
import { decodePersephoneBoardLink } from "../../content/persephone-board-link";
import { boardEditorId } from "./custom-editor-registry";
import { isBoardFolder, normalizeSecondaryViews, readBoardManifest, readBoardSecondaryViews, type BoardManifest, type SecondaryViewDecl } from "./board-manifest";
import { boardSecondaryPanelId } from "./board-secondary";
import { BoardTargetModel } from "./BoardTargetModel";
import { createBoardGlyphElement } from "./board-glyph-element";
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
    /** A readable LOCAL path holding this board's content — what `persephone.getFilePath()`
     *  actually hands the board. Equals `filePath` for a plain local file; for a non-local source
     *  (archive entry / `http(s)` URL) it is a cache file materialized from the content pipe, so
     *  the board reads any source as an ordinary local file. Resolved on demand by
     *  `ensureContentPath()` and memoized here. TRANSIENT — stripped in `getRestoreData()` and
     *  cleared in `restore()`, since a persisted temp path may point at a GC'd cache file. */
    contentPath?: string;
    /** True once a cache file was materialized for this board's content (non-local sources only).
     *  Gates the `dispose()` cleanup. PERSISTED, unlike `contentPath`: the path is recomputed but the
     *  *fact* that a cache folder exists must survive a restore, or a page restored and then closed
     *  without ever re-materializing would orphan its folder. Cleanup targets
     *  `<cache>/<editor id>/`, which is derived from the stable id, so it needs no path. */
    contentCached?: boolean;
    /** Sidebar panel contributions — DERIVED from `secondaryViewDefs`
     *  (`board-secondary:<id>` per declared view). Read by `contributesPanels()`. */
    secondaryView?: string[];
    /** Declared secondary views (EPIC-044): seeded from the manifest on first load
     *  (a persisted set wins — D6), replaced at runtime by `setSecondaryViews` (US-854).
     *  `secondaryView` is derived from this. Persists as part of the board state. */
    secondaryViewDefs?: SecondaryViewDecl[];
    /** Shared-state channel store (EPIC-044 / D1) — the single in-memory state object
     *  mirrored into every board frame via `persephone.state.*`. Populated in US-852;
     *  declared here so the field exists. Only `sharedStateRestorableKeys` are persisted
     *  (opt-in, D9 — the US-852 `getRestoreData` override, NOT the base full-state dump). */
    sharedState?: Record<string, unknown>;
    /** Keys of `sharedState` the board declared persistable via `persephone.state.init`
     *  (EPIC-044 / D9). Populated in US-852. */
    sharedStateRestorableKeys?: string[];
    /** Content-host boards only (EPIC-043): set when the content HOST fails to restore (file
     *  missing / unreadable), so the view shows a distinct empty state rather than a blank board. */
    contentHostError?: string;
    /** Footer status text set via `persephone.setStatusText()` (US-892), e.g. a Todo board's
     *  "N items" count. TRANSIENT — stripped in `getRestoreData()` and cleared in `restore()`
     *  (like `busy`), so a persisted blob never resurrects a stale count; the board re-sets it on
     *  load. Rendered by `BoardEditorView` in the `ContentHostFooter` slot (main-view footer only). */
    statusText?: string;
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

    /** Live `<iframe>` elements of the currently-mounted board frames, keyed by
     *  automation tab id (`"main"` + one `board-secondary:<viewId>` per open secondary
     *  view — EPIC-044 / US-858). Set on each frame's mount effect (the ELEMENT, for
     *  automation focus), cleared on unmount. Transient (not persisted). */
    readonly frames = new Map<string, HTMLIFrameElement>();

    /** Tab ids whose frame has finished loading AND registered for CDP in main
     *  (BoardWebview's handleLoad, after `registerBoardFrame` resolves). This — NOT
     *  `frames` — is the "attachable now" signal automation waits on (US-858): a
     *  mounted-but-not-yet-registered frame would make `cdp-service` throw. */
    readonly loadedTabs = new Set<string>();

    /** Active automation tab id — which frame the `browser_*` tools drive
     *  (BoardTargetModel.switchTab / ensureReady). Defaults to the main frame, so a
     *  single-frame board and the default automation path are unchanged (US-858). */
    activeTabId = BOARD_CDP_TAB;

    setIframe(el: HTMLIFrameElement, tab: string = BOARD_CDP_TAB): void {
        this.frames.set(tab, el);
    }

    /** Clear only if it still matches — guards against a remount setting the new
     *  element before the old one's cleanup runs. Also drops the tab's ready flag and,
     *  if it was the active automation tab, falls back to the main frame so a stray
     *  command can't target a dead frame (a fresh switch/ensureReady re-mounts). */
    clearIframe(el: HTMLIFrameElement, tab: string = BOARD_CDP_TAB): void {
        if (this.frames.get(tab) === el) {
            this.frames.delete(tab);
            this.loadedTabs.delete(tab);
            if (this.activeTabId === tab) this.activeTabId = BOARD_CDP_TAB;
        }
    }

    /** The live frame for a tab (defaults to the active automation tab). */
    getFrame(tab: string = this.activeTabId): HTMLIFrameElement | undefined {
        return this.frames.get(tab);
    }

    /** Resolvers waiting for the NEXT `markFrameLoaded` of a tab — the deterministic
     *  "reload finished" signal `board_refresh` awaits (a remounted frame's load +
     *  CDP re-registration), so a snapshot right after refresh can't hit the stale frame. */
    private frameLoadWaiters: Array<{ tab: string; resolve: (ok: boolean) => void }> = [];

    /** Marked ready by BoardWebview once main holds this frame's CDP registration. */
    markFrameLoaded(tab: string): void {
        this.loadedTabs.add(tab);
        this.frameLoadWaiters = this.frameLoadWaiters.filter((w) => {
            if (w.tab !== tab) return true;
            w.resolve(true);
            return false;
        });
    }

    /** Resolve `true` when the NEXT frame-load of `tab` completes (the frame is rendered
     *  and CDP-attachable), or `false` on timeout / dispose. Register BEFORE triggering
     *  the reload (`reloadBoard`) so the signal can't be missed. */
    waitForFrameLoad(tab: string = BOARD_CDP_TAB, timeoutMs = 5000): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            const waiter = { tab, resolve };
            this.frameLoadWaiters.push(waiter);
            setTimeout(() => {
                const i = this.frameLoadWaiters.indexOf(waiter);
                if (i >= 0) {
                    this.frameLoadWaiters.splice(i, 1);
                    resolve(false);
                }
            }, timeoutMs);
        });
    }

    /** The active tab's live frame (was a plain field; kept as a getter for callers
     *  that don't care about the tab, e.g. the busy-keepalive teardown). */
    get currentIframe(): HTMLIFrameElement | undefined {
        return this.frames.get(this.activeTabId);
    }

    /** Folder of the currently-shown board, or undefined when none is resolved. */
    private currentBoardRoot(): string | undefined {
        const s = this.state.get();
        return s.selectedBoard ? s.boardRoot : undefined;
    }

    getIconElement = (): Element => createBoardGlyphElement(this.currentBoardRoot(), 16);

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

    // ── Shared state (EPIC-044) ──────────────────────────────────────────

    /** Monotonic shared-state version (EPIC-044) — stamped on every `state:sync` push so a
     *  frame ignores stale/out-of-order deliveries (seed-on-load vs init/set/merge). Instance
     *  property, kept OFF the reactive state: never persisted, resets to 0 each session. */
    sharedStateSeq = 0;

    /** Replace the shared state (`persephone.state.set`). Bump seq BEFORE `state.update` so the
     *  synchronous subscription fires with the new seq already visible. */
    setSharedState(next: Record<string, unknown>): void {
        this.sharedStateSeq++;
        this.state.update((s) => { s.sharedState = next && typeof next === "object" ? next : {}; });
    }

    /** Shallow-merge into the shared state (`persephone.state.merge`). */
    mergeSharedState(partial: Record<string, unknown>): void {
        if (!partial || typeof partial !== "object") return;
        this.sharedStateSeq++;
        this.state.update((s) => { s.sharedState = { ...(s.sharedState ?? {}), ...partial }; });
    }

    /** Seed defaults (fill-missing — existing/restored values win) + record the restorable
     *  keys (`persephone.state.init`, opt-in persistence D9). Idempotent; last init wins for
     *  the key set. */
    initSharedState(defaults: Record<string, unknown>, restorableKeys?: string[]): void {
        this.sharedStateSeq++;
        this.state.update((s) => {
            s.sharedState = {
                ...(defaults && typeof defaults === "object" ? defaults : {}),
                ...(s.sharedState ?? {}),
            };
            if (Array.isArray(restorableKeys)) {
                s.sharedStateRestorableKeys = restorableKeys.filter((k) => typeof k === "string");
            }
        });
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

    /** Absolute root of the board this editor runs (undefined for a plain, path-less board).
     *  `BoardContentEditorModel` inherits this, so content-host board pages are covered too. */
    get boardRoot(): string | undefined {
        return this.state.get().boardRoot;
    }

    /** The file path this board edits, from either entry point (switch → `state.filePath`;
     *  openRawLink → `sourceLink.filePath`). Undefined for a plain, non-custom-editor board. */
    currentFilePath(): string | undefined {
        const s = this.state.get();
        return s.filePath ?? s.sourceLink?.filePath;
    }

    /**
     * Resolve a readable LOCAL path holding this board's content — what `getFilePath()` returns to
     * the board. Plain local file → the source path itself, untouched and with no I/O. Any other
     * source (archive entry, `http(s)` URL, transformed pipe) → a cache file materialized from the
     * content pipe, so a board reads every source as an ordinary local file and needs no awareness
     * of where the bytes came from.
     *
     * Read-only: the cache file is never written back through the pipe. (`ImageEditor` does the same
     * job for itself; this is the generalized, board-facing version of that pattern.)
     *
     * Memoized for the model's lifetime — the cache file outlives the iframe, so a `board_refresh`
     * or an in-board reload re-resolves for free. Materializes UNCONDITIONALLY on the first call
     * rather than trusting a same-named cache file from a previous session, whose source may have
     * changed since. Throws when the source cannot be read, so the caller can surface a real error
     * instead of a silent "no file".
     */
    async ensureContentPath(): Promise<string | undefined> {
        const existing = this.state.get().contentPath;
        if (existing) return existing;
        const source = this.currentFilePath();
        if (!source) return undefined; // plain board — no file to resolve

        if (!this.pipe) {
            // Prefer the PERSISTED pipe descriptor: it carries the true provider (e.g. HttpProvider
            // with its method/headers), which a path-shape guess cannot reconstruct. Falls back to
            // the path-derived pipe for the switch path, which has no sourceLink.
            const descriptor = this.state.get().sourceLink?.pipeDescriptor;
            this.pipe = descriptor
                ? createPipeFromDescriptor(descriptor)
                : pipeFromSourcePath(source);
        }

        // A plain file pipe already points at a real local file — hand over the source path
        // itself. No copy, no read: the overwhelmingly common case stays free.
        if (this.pipe.provider.type === "file" && this.pipe.transformers.length === 0) {
            const local = this.pipe.provider.sourceUrl;
            this.state.update((s) => { s.contentPath = local; });
            return local;
        }

        const buffer = await this.pipe.readBinary();
        // Cache as `<cache>/<editorId>/<sourceBaseName>` — the per-editor subfolder keeps the file
        // collision-free across tabs while PRESERVING THE SOURCE'S BASE NAME, which boards show as
        // their file-name label. Keying the file itself on the editor id would make every board
        // display a UUID for an archive/remote file. `fs.writeBinary` creates the folder.
        const cachePath = appFs.resolveCachePath(fpJoin(this.id, fpBasename(source)));
        await appFs.writeBinary(cachePath, buffer);
        this.state.update((s) => {
            s.contentPath = cachePath;
            s.contentCached = true;
        });
        return cachePath;
    }

    /** Merge both filePath sources so host-less consumers (the switch widget, the
     *  `switchMainEditor` board-boundary extraction) read a single value. */
    override get filePath(): string | undefined {
        return this.currentFilePath();
    }

    /** Switch options while ON the board (base returns []): the file's BUILT-IN editors
     *  (so the user can switch back) plus this board. Board peers claiming the same file
     *  are appended by the switch widget. Empty for a plain board / non-local file.
     *
     *  The built-in editors compute their list from the live content host's language
     *  (`findEditorsAccepting`), but a simple board never loads the file — so derive the
     *  language from the extension and take the registry's language-based switch options
     *  too. Otherwise language-only editors (md-view "Preview" et al.) would vanish from
     *  the widget while the board is active. */
    override findCompatibleEditors(): string[] {
        const filePath = this.currentFilePath();
        const root = this.state.get().boardRoot;
        if (!filePath || !root || !isPlainLocalPath(filePath)) return [];
        const language = getLanguageByExtension(fpExtname(filePath).toLowerCase())?.id ?? "";
        const builtins = editorRegistry.getSwitchOptions(language, filePath).options;
        const builtinId = editorRegistry.resolveId(filePath) ?? "monaco";
        if (!builtins.includes(builtinId)) builtins.push(builtinId);
        return [...builtins, boardEditorId(root)];
    }

    /** Persist the STABLE `"board-view"` id so restore + cross-window keys on it
     *  (`NO_HOST_EDITOR_IDS` + the zombie guard); the virtual `board-editor:<root>` id is
     *  re-derived from the persisted `state.filePath` / `state.boardRoot` on restore. */
    override getRestoreData() {
        const data = super.getRestoreData();
        data.editorId = "board-view";
        // D9 (EPIC-044): persist ONLY the board-declared restorable subset of sharedState —
        // undeclared/transient state must never bloat the open-pages file. Shallow-clone so
        // we don't mutate the live `state` object `super` returned by reference.
        const s = this.state.get();
        const keys = s.sharedStateRestorableKeys;
        let sharedState: Record<string, unknown> | undefined;
        if (keys?.length && s.sharedState) {
            sharedState = {};
            for (const k of keys) {
                if (Object.prototype.hasOwnProperty.call(s.sharedState, k)) {
                    sharedState[k] = s.sharedState[k];
                }
            }
        }
        // `statusText` is transient footer chrome (US-892) — never persist it, or a stale count
        // would resurrect on restore before the board re-sets it. `undefined` is dropped by JSON.
        // `contentPath` is transient too: a persisted cache path would point at a file the cache may
        // have GC'd, and the source could have changed — `ensureContentPath` re-materializes.
        data.state = {
            ...(data.state as Record<string, unknown>),
            sharedState,
            statusText: undefined,
            contentPath: undefined,
        };
        return data;
    }

    /** Single-board init — opened by a `persephone-board://` link (US-748) or the
     *  MCP `openBoard` (US-750). `filePath` is passed only on the custom-editor SWITCH path
     *  (US-839); on the openRawLink path it rides `state.sourceLink` instead. */
    initFromBoardRoot(boardRoot: string, filePath?: string): void {
        const name = fpBasename(boardRoot);
        this.state.update((s) => {
            s.boardRoot = boardRoot;
            // Custom-editor mode → show the file name in the tab (the board's own
            // name isn't useful when it's editing a file); plain board → board name.
            s.title = filePath ? fpBasename(filePath) : name;
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
        // Footer status text (US-892) is transient too — clear any value carried in from a
        // pre-fix persisted blob, so a stale count never flashes before the board re-sets it.
        if (s.statusText) this.state.update((st) => { st.statusText = undefined; });
        // Same for a materialized content path carried in from a pre-fix persisted blob: the cache
        // file is gone (or stale), so force a re-resolve on the next `ensureContentPath()`.
        if (s.contentPath) this.state.update((st) => { st.contentPath = undefined; });
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
        // Seed/derive the declared secondary views (EPIC-044). Only when the board
        // resolves; a missing board contributes no panels.
        if (valid) {
            await this.seedSecondaryViews();
        } else {
            this.state.update((s) => { s.secondaryView = undefined; });
        }
    }

    /** Seed `secondaryViewDefs` from the manifest on FIRST load only — a persisted /
     *  restored set wins (D6 / US-855 restore precedence) — then derive the panel-id list.
     *  Idempotent: once `secondaryViewDefs` is defined it is never re-seeded here. */
    private async seedSecondaryViews(): Promise<void> {
        const boardRoot = this.state.get().boardRoot;
        if (!boardRoot) return;
        if (this.state.get().secondaryViewDefs === undefined) {
            const manifest = await readBoardManifest(boardRoot);
            const defs = readBoardSecondaryViews(manifest);
            this.state.update((s) => { s.secondaryViewDefs = defs; });
        }
        this.deriveSecondaryPanels();
    }

    /** Recompute `state.secondaryView` (the derived panel-id list `contributesPanels()`
     *  reads) from `state.secondaryViewDefs`. Undefined when there are no defs. */
    protected deriveSecondaryPanels(): void {
        this.state.update((s) => {
            const defs = s.secondaryViewDefs ?? [];
            s.secondaryView = defs.length ? defs.map((d) => boardSecondaryPanelId(d.id)) : undefined;
        });
    }

    /** Replace the declared secondary views at runtime (`persephone.setSecondaryViews`, US-854).
     *  Writes `state.secondaryViewDefs` (validated) then recomputes `state.secondaryView`; the
     *  page's slice subscription reconciles the sidebar panels live. `[]` removes them all. */
    setSecondaryViews(views: unknown): void {
        const defs = normalizeSecondaryViews(views);
        this.state.update((s) => { s.secondaryViewDefs = defs; });
        this.deriveSecondaryPanels();
    }

    /** Set the content-host footer status text (`persephone.setStatusText`, US-892). TRANSIENT —
     *  not persisted; the board re-sets it on load. Rendered by `BoardEditorView` via the
     *  `ContentHostFooter` contributions slot (main-view footer only). */
    setStatusText(text: string): void {
        this.state.update((s) => { s.statusText = typeof text === "string" ? text : ""; });
    }

    /** A busy board that survived navigate-away (US-799) had its derived `secondaryView`
     *  cleared by the base `beforeNavigateAway` while demoted — which is all the Pattern-A
     *  disposal of a NON-busy board needs (with no derived panels `contributesPanels()` is
     *  false, so `setMainEditor` disposes it; the board never lingers as a sidebar contributor,
     *  EPIC-044 / D8). `secondaryViewDefs` (the source of truth) is deliberately RETAINED, so on
     *  re-promotion — when `PagesLifecycleModel` reuses this surviving instance via
     *  `matchesNavigationTarget` — we simply re-derive the panel-id list from it: the board comes
     *  back with exactly the views it had (manifest- or runtime-declared), synchronously, with no
     *  manifest re-read and no race against the remounting frame's own `setSecondaryViews`. */
    override onNavigationReuse(): void {
        this.deriveSecondaryPanels();
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

    /** Wait for the next attachable main board frame after a model-owned reload. */
    reloadAndWait(): Promise<boolean> {
        const frameReady = this.waitForFrameLoad(BOARD_CDP_TAB);
        this.reloadBoard();
        return frameReady;
    }

    /** Read the current board manifest through the board model's path authority. */
    readManifestForFacade(): Promise<BoardManifest | null> {
        const boardRoot = this.state.get().boardRoot;
        return boardRoot ? readBoardManifest(boardRoot) : Promise.resolve(null);
    }

    /** Absolute path to the board's `ui.log` (for the open-log action), or undefined
     *  when no board is resolved. */
    getSelectedBoardLogPath(): string | undefined {
        const root = this.currentBoardRoot();
        return root ? fpJoin(root, "ui.log") : undefined;
    }

    /** Drop the live `<iframe>` reference and the board frame's CDP registration on
     *  teardown. `BoardWebview`'s unmount normally unregisters the frame, but `dispose()`
     *  can run without the normal board-frame teardown (forced close / window teardown), so clear
     *  it here too — both are idempotent. Also the FINAL job teardown (US-799):
     *  `reapBoardOwner` tree-kills every job this board owner kept alive while busy —
     *  page close overrides busy ("page closed → kill anyway"). */
    override async dispose(): Promise<void> {
        // A custom-editor board opened via openRawLink is handed a FileProvider pipe by the
        // open-handler — dispose it for hygiene (EPIC-042 CC8). `ensureContentPath` may have read
        // it since; disposing is correct either way.
        (this as { pipe?: { dispose?: () => void } }).pipe?.dispose?.();
        // Drop the materialized content cache (non-local sources only). The whole per-editor
        // subfolder goes, since the cache file lives inside one.
        if (this.state.get().contentCached) {
            try {
                await appFs.removeDir(appFs.resolveCachePath(this.id), true);
            } catch { /* best-effort cleanup — never block teardown */ }
        }
        markBoardBusy(this.id, undefined, false);
        void api.reapBoardOwner(this.id);
        this.frames.clear();
        this.loadedTabs.clear();
        for (const w of this.frameLoadWaiters) w.resolve(false);
        this.frameLoadWaiters.length = 0;
        void api.unregisterBoardFrame(this.id);
        await super.dispose();
    }
}
