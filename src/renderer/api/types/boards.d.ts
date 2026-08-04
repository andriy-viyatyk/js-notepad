/**
 * One published-catalog board, annotated with its install state on this machine
 * ({@link IBoards.searchPublished}).
 */
export interface PublishedBoardResult {
    /** Catalog id (the board's folder name in the catalog; the default install-folder name). */
    id: string;
    name: string;
    description?: string;
    /** Latest catalog version (semver). */
    version: string;
    /** Glob masks the board associates itself with, if it is a file editor. */
    fileMasks?: string[];
    /** Folder globs narrowing `fileMasks` to certain locations (absent = any folder). */
    folderMasks?: string[];
    editorName?: string;
    editorKind?: "simple" | "content-host";
    /** True when the board can be pinned / opened empty (tool/dashboard-style). */
    standalone?: boolean;
    /** Minimum Persephone version this latest release requires (semver; absent = no requirement). */
    minAppVersion?: string;
    /** Download size of the latest release archive, in bytes. */
    size: number;
    /** Whether the latest version is compatible with the running app (`minAppVersion`). */
    compatible: boolean;
    /** Whether the board has a local install-registry entry (downloaded, not necessarily trusted). */
    installed: boolean;
    /** Absolute install root, when installed. */
    installedRoot?: string;
    /** The locally installed version (semver), when installed. */
    installedVersion?: string;
    /** True when a compatible newer catalog version exists than the installed one. */
    updateAvailable: boolean;
}

/**
 * One entry of a published board's version history, annotated for this machine
 * ({@link IBoards.getPublishedVersions}).
 */
export interface PublishedVersionResult {
    version: string;
    /** ISO date the version was published, if the catalog carries it. */
    date?: string;
    /** Release notes, if any. */
    notes?: string;
    /** Minimum Persephone version this version requires (semver; absent = no requirement). */
    minAppVersion?: string;
    /** Whether this version is compatible with the running app (`minAppVersion`). */
    compatible: boolean;
    /** Whether this exact version is the one currently installed. */
    installed: boolean;
}

/** One available update for an installed catalog board ({@link IBoards.checkPublishedUpdates}). */
export interface BoardUpdateInfo {
    /** Catalog id. */
    id: string;
    /** Absolute install root. */
    root: string;
    installedVersion: string;
    latestVersion: string;
}

/**
 * Board lifecycle namespace (`app.boards`).
 *
 * Create Persephone **Boards** — sandboxed mini web-apps (an HTML page plus
 * backend scripts) you can build and develop for the user. A board created here is
 * scaffolded from a bundled template, gets its `board-manifest.json`, and is
 * **auto-trusted at creation**, so it opens without a trust prompt.
 *
 * Create returns the new board's root path; {@link openBoard} opens it.
 *
 * @example
 * // Create a blank board and open it.
 * const root = await app.boards.createBoard("My Board", "C:/work/boards");
 * await app.boards.openBoard(root);
 *
 * @example
 * // Create from the bundled Demo board template (a rich, self-documenting example).
 * const root = await app.boards.createDemoBoard("Demo", "C:/work/boards");
 * await app.boards.openBoard(root);
 */
export interface IBoards {
    /**
     * Create a **blank** board named `name` inside the container folder `dir`,
     * and return the new board's absolute root path (`<dir>/<name>`).
     *
     * `dir` is created if it does not exist. The board is auto-trusted at creation.
     * Throws if a board named `name` already exists in `dir`.
     *
     * @param name - Board folder name (also the default display name).
     * @param dir - Absolute path of the container folder the board is created in.
     * @returns The created board's absolute root path.
     */
    createBoard(name: string, dir: string): Promise<string>;

    /**
     * Like {@link createBoard}, but scaffolds from the bundled **Demo board**
     * template — a full example exercising the `persephone.execute()` channel, the
     * integration tier, and the `--p-*` theme contract. Returns the board root.
     *
     * @param name - Board folder name.
     * @param dir - Absolute path of the container folder the board is created in.
     * @returns The created board's absolute root path.
     */
    createDemoBoard(name: string, dir: string): Promise<string>;

    /**
     * Open an existing board by its root folder path (the folder containing
     * `board-manifest.json`) — opens a new tab (or reuses the board's tab) and makes
     * it active. A board created via {@link createBoard} / {@link createDemoBoard} is
     * auto-trusted and opens immediately; a board Persephone did not create prompts
     * the user for trust before rendering.
     *
     * Throws if `boardRoot` is missing or is not a board (no `board-manifest.json`).
     *
     * @param boardRoot - Absolute path of the board's root folder.
     */
    openBoard(boardRoot: string): Promise<void>;

    /**
     * Register (trust) an existing board so it renders and runs. Shows the **user** a
     * trust dialog — a script can *never* trust a board without that click. Returns
     * `true` if the board is (or becomes) trusted, `false` if the user declines. A
     * no-op `true` when the board is already trusted (including via a trusted ancestor
     * folder).
     *
     * Use this after a board-review flow: download or open a board's folder, read its
     * files, then ask the user to trust it here.
     *
     * @param boardRoot - Absolute path of the board's root folder.
     * @returns Whether the board ended up trusted.
     */
    registerBoard(boardRoot: string): Promise<boolean>;

    /**
     * Unregister (untrust) a board and remove its pin. **No dialog** — untrusting only
     * reduces privilege. The board stops rendering/running. Idempotent.
     *
     * @param boardRoot - Absolute path of the board's root folder.
     */
    unregisterBoard(boardRoot: string): Promise<void>;

    /**
     * Rename a board's folder to `newName` within the same parent folder, carrying its
     * trust, pin, and catalog-install registration to the new path with **no dialog**
     * (same trusted content at a new path — no privilege gain), and re-pointing any open
     * board page to the new root. Returns the new absolute root.
     *
     * Throws if the board is currently running (busy), is not a board, or a folder named
     * `newName` already exists in the parent.
     *
     * @param boardRoot - Absolute path of the board's current root folder.
     * @param newName - New folder name (also the new default display name).
     * @returns The board's new absolute root path.
     */
    renameBoard(boardRoot: string, newName: string): Promise<string>;

    // ── Published catalog — discover / install / update (EPIC-045 / US-869) ──────

    /**
     * Search the published-boards catalog (the curated GitHub catalog Persephone ships against),
     * each result annotated with its local install state. **Read-only, no dialog.**
     *
     * @param query - Case-insensitive substring matched against name, description, and file masks.
     *   Omit/empty to return the whole catalog.
     * @returns The matching catalog boards with `installed` / `installedVersion` /
     *   `updateAvailable` / `compatible` annotations.
     */
    searchPublished(query?: string): Promise<PublishedBoardResult[]>;

    /**
     * A published board's full version history (newest first), each entry annotated with
     * `compatible` (vs the running app) and `installed`. **Read-only, no dialog.**
     *
     * @param id - Catalog board id.
     * @returns The version list, or `[]` if the board has no published history / the fetch fails.
     */
    getPublishedVersions(id: string): Promise<PublishedVersionResult[]>;

    /**
     * Download + verify (sha256) + extract a published board to disk and record it in the install
     * registry — **without any dialog and without trusting it**. The board sits inert on disk
     * (unexecuted code is harmless), ready to review before {@link registerBoard}. This is the
     * "can I trust this board?" entry point: download, read the files, report, then register.
     *
     * @param id - Catalog board id.
     * @param opts.dir - Container folder to install into (default `<userData>/data/boards`);
     *   the board lands in `<dir>/<id>`.
     * @param opts.version - A specific version to download (default: the latest catalog version).
     * @returns The installed board's absolute root path.
     * @throws If the id is not in the catalog, the version is unknown, the chosen version is
     *   incompatible with the running app, or the download/verify/extract fails.
     */
    downloadPublished(id: string, opts?: { dir?: string; version?: string }): Promise<string>;

    /**
     * Interactive install of a published board.
     *
     * - **Not yet installed:** opens the **Board Info** page prefilled (install location from
     *   `opts.dir`); the user walks **Download → Register**, and the trust-dialog click is the
     *   consent. Resolves the installed root once the user registers, or `undefined` if they close
     *   the page without registering. (A fresh install installs the latest catalog version;
     *   `opts.version` is ignored on this path — use {@link downloadPublished} + {@link registerBoard}
     *   for a specific fresh version.)
     * - **Already installed + `opts.version`:** performs a version change (update or rollback) by
     *   swapping the folder in place — **no dialog** (the board is already trusted; the call is the
     *   intent), subject only to the open-pages / busy precondition (a close-pages dialog if the
     *   board is currently open). Resolves the root, or `undefined` if the user vetoes that dialog.
     *
     * @param id - Catalog board id.
     * @param opts.dir - Install location for a fresh install (default `<userData>/data/boards`).
     * @param opts.version - Target version for the already-installed swap path.
     * @returns The installed board's absolute root path, or `undefined` if the user abandoned it.
     * @throws If the id is not in the catalog, or the requested version is unknown.
     */
    installPublished(id: string, opts?: { dir?: string; version?: string }): Promise<string | undefined>;

    /**
     * Uninstall a catalog-installed board: shows the **delete confirmation** (it removes files),
     * then deletes the board folder and clears its trust, pin, and install-registry entry.
     *
     * @param id - Catalog board id.
     * @returns `true` if the board was removed, `false` if the user cancelled (or the board is
     *   busy / the delete failed).
     * @throws If the id is not installed.
     */
    uninstallBoard(id: string): Promise<boolean>;

    /**
     * Refresh the catalog and report installed boards that have a compatible newer version
     * available. **No dialog.**
     *
     * @param force - Bypass the periodic-check gate and fetch the catalog now (default: use the
     *   cached catalog / the normal 24h gate).
     * @returns One entry per installed board with an available update.
     */
    checkPublishedUpdates(force?: boolean): Promise<BoardUpdateInfo[]>;
}
