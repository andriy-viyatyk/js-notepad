/**
 * Agent-facing admin namespace over the board environment-variables store (`app.boardVars`).
 *
 * Boards read/write only their **own** namespace via `persephone.var.*` (from inside the board's
 * iframe). This namespace is for the **agent**: provision a board's secrets ahead of time — e.g.
 * right after scaffolding a board that needs a connection string — so the board finds its
 * variables already there the first time it runs `persephone.var.get(...)`.
 *
 * **Every method below can block on a dialog.** The first call on a machine with no `.env.json`
 * configured shows the user a "Create environment variables storage" dialog (default path,
 * editable) — the call does not resolve until they respond; declining rejects it. The same
 * applies if the file is encrypted and locked this session (a decrypt-password prompt). A
 * slow-to-resolve call is waiting on the user, not hung.
 *
 * @example
 * const root = await app.boards.createBoard("Snowflake Viewer", "C:/boards");
 * const namespace = await app.boardVars.namespaceFor(root);
 * await app.boardVars.set(namespace, "SNOWFLAKE_SERVER", "abc123.snowflakecomputing.com");
 * await app.boardVars.set(namespace, "SNOWFLAKE_USER", user);
 * await app.boards.openBoard(root);
 */
export interface IBoardVars {
    /**
     * Resolves `boardRoot`'s vars namespace — its manifest's `author/name` when both fields are
     * explicitly set, otherwise the board's root path. Always call this rather than constructing
     * the namespace string by hand; it matches what the board itself sees via `persephone.var.*`.
     *
     * @param boardRoot - Absolute path of the board's root folder.
     */
    namespaceFor(boardRoot: string): Promise<string>;

    /**
     * A single value from `namespace`'s profile (`default` when `env` is omitted), or `undefined`
     * if unset.
     */
    get(namespace: string, name: string, env?: string): Promise<string | undefined>;

    /**
     * Set one value in `namespace`'s profile (`default` when `env` is omitted), creating the
     * namespace/profile if needed. Persisted immediately (re-encrypted on save if the file is
     * encrypted).
     */
    set(namespace: string, name: string, value: string, env?: string): Promise<void>;

    /** Key names (not values) in `namespace`'s profile (`default` when `env` is omitted). */
    list(namespace: string, env?: string): Promise<string[]>;

    /** Every namespace currently present in the configured `.env.json`. */
    listNamespaces(): Promise<string[]>;

    /**
     * Open the built-in `.env.json` editor. Focused on `namespace` when given (jumps to that
     * namespace/its first profile); opens the whole file unscoped when omitted.
     */
    show(namespace?: string): Promise<void>;
}
