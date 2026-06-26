/**
 * Public `window.persephone` API — the contract a Board page programs against
 * (EPIC-034 / US-724). Provided by the board bridge shim (`src/board-shim.ts`),
 * inlined into the board iframe by the `board://` handler and talking to main over
 * a per-board MessagePort; this is the ONLY Persephone surface a board sees.
 *
 * This file is the canonical author-facing reference. It is intentionally NOT under
 * `src/renderer/api/types/` (that folder is flat-copied into the Persephone *script*
 * IntelliSense surface — `persephone` is a board-page global, not a script global).
 * US-726 ships this shape into the board template + dev-shim. Self-contained on
 * purpose; mirrors the handle contract in `src/ipc/runner-channels.ts`.
 */

/** Options for `persephone.execute()`. */
interface PersephoneExecuteOptions {
    /** Working directory. Defaults to the board folder. */
    cwd?: string;
    /** Extra environment variables, merged over the inherited environment. */
    env?: Record<string, string>;
    /** Shell to run the command line through (default `true` = OS shell). */
    shell?: boolean | string;
}

/** How a process ended. */
interface PersephoneExitInfo {
    /** Exit code, or `null` when terminated by a signal. */
    code: number | null;
    /** Terminating signal name, or `null` on a normal exit. */
    signal: string | null;
}

/** Spawn-level failure (the program never started). */
interface PersephoneExecuteError {
    message: string;
}

/**
 * A handle to a running process. Consume it EITHER one-shot (`getText` / `getJson`
 * / `getBytes`, which buffer stdout to completion) OR streaming (`on("stdout" |
 * "stderr")`) — mixing the two on one handle throws.
 */
interface PersephoneExecuteHandle {
    /** Unique id of this job. */
    readonly jobId: string;
    /** Stream stdout/stderr as binary chunks (switches to streaming mode). */
    on(event: "stdout" | "stderr", cb: (chunk: Uint8Array) => void): () => void;
    /** Fires once when the process exits. */
    on(event: "exit", cb: (info: PersephoneExitInfo) => void): () => void;
    /** Fires once on a spawn-level failure. */
    on(event: "error", cb: (err: PersephoneExecuteError) => void): () => void;
    /** Buffer stdout to completion as UTF-8 text. */
    getText(): Promise<string>;
    /** Buffer stdout and `JSON.parse` it (rejects on non-zero exit / parse error).
     *  Pass `pattern` to extract the JSON from noisy stdout first (the script may
     *  call other tools that print): the LAST match is parsed — capture group 1 if
     *  the regex has one, else the whole match — so you can wrap the result in a
     *  marker, e.g. `getJson(/@@RESULT@@(.*)/)`. Rejects if `pattern` finds nothing. */
    getJson<T = unknown>(pattern?: RegExp): Promise<T>;
    /** Buffer stdout to completion as raw bytes. */
    getBytes(): Promise<Uint8Array>;
    /** Write to the process's stdin. */
    write(data: string | Uint8Array): void;
    /** Close the process's stdin. */
    endStdin(): void;
    /** Terminate the process (default SIGTERM). */
    kill(signal?: string): void;
}

type PersephoneNotifyType = "info" | "success" | "warning" | "error";

interface PersephoneFileFilter {
    name: string;
    extensions: string[];
}
interface PersephoneOpenFileDialogParams {
    title?: string;
    defaultPath?: string;
    filters?: PersephoneFileFilter[];
    multiSelections?: boolean;
}
interface PersephoneSaveFileDialogParams {
    title?: string;
    defaultPath?: string;
    filters?: PersephoneFileFilter[];
}
interface PersephoneOpenFolderDialogParams {
    title?: string;
    defaultPath?: string;
    multiSelections?: boolean;
}

/**
 * The host palette + metric tokens, exposed as `--p-*` CSS variables on the board's
 * `<html>` (use `var(--p-bg)`, `padding: var(--p-space-md)`, etc.) and mirrored here in JS.
 *
 * Color vars (theme-dependent, update live on a theme switch):
 *   --p-bg, --p-panel, --p-overlay, --p-border, --p-border-light,
 *   --p-text, --p-text-muted, --p-text-strong,
 *   --p-accent, --p-accent-text, --p-accent-hover,
 *   --p-selection-bg, --p-selection-text, --p-link,
 *   --p-error, --p-success, --p-warning, --p-scrollbar, --p-scrollbar-thumb, --p-shadow
 *
 * Metric vars (theme-independent constants): --p-space-*, --p-gap-*, --p-radius-*,
 *   --p-size-* (icon/control), --p-font-* — e.g. --p-space-md, --p-radius-sm, --p-font-base.
 */
interface PersephoneThemePalette {
    /** Active theme id, e.g. "default-dark". */
    id: string;
    /** True for dark themes (lets a board pick asset variants). */
    isDark: boolean;
    /** Color `--p-*` name → concrete CSS value. */
    vars: Record<string, string>;
}

interface PersephoneBoardApi {
    /** Bridge version. */
    readonly version: string;
    /** Spawn a command line on the host machine; returns a process handle. */
    execute(command: string, options?: PersephoneExecuteOptions): PersephoneExecuteHandle;
    /** Open a link (file path or URL) in a new Persephone page. */
    openRawLink(href: string): void;
    /** Show a Persephone toast. */
    notify(message: string, type?: PersephoneNotifyType): void;
    /** Native open-file dialog → selected path(s), or undefined if cancelled. */
    openFileDialog(params?: PersephoneOpenFileDialogParams): Promise<string[] | undefined>;
    /** Native save-file dialog → chosen path, or undefined if cancelled. */
    saveFileDialog(params?: PersephoneSaveFileDialogParams): Promise<string | undefined>;
    /** Native pick-folder dialog → selected folder(s), or undefined if cancelled. */
    openFolderDialog(params?: PersephoneOpenFolderDialogParams): Promise<string[] | undefined>;
    /** Host color palette as of page load — correct on every (re)load, but a SNAPSHOT:
     *  it does not update on an in-session theme switch. For a live value use `getTheme()`
     *  or the palette passed to `onThemeChange`. */
    readonly theme: PersephoneThemePalette;
    /** Live host color palette — always the current theme, including after an in-session
     *  switch. Prefer this (or the `onThemeChange` argument) when re-theming. */
    getTheme(): PersephoneThemePalette;
    /** Static metric tokens (`--p-space-*`, `--p-radius-*`, …) — `--p-*` name → CSS value. */
    readonly tokens: Readonly<Record<string, string>>;
    /** Same static metric tokens, as a live accessor (symmetric with `getTheme()`). */
    getTokens(): Readonly<Record<string, string>>;
    /** Subscribe to theme changes; fires once immediately with the current palette, then
     *  on every switch. The callback argument is always the live palette — prefer it for
     *  re-theming. Returns an unsubscribe fn. */
    onThemeChange(cb: (theme: PersephoneThemePalette) => void): () => void;
}

interface Window {
    persephone: PersephoneBoardApi;
}
