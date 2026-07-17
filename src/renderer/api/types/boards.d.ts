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
}
