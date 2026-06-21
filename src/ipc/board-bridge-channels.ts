/**
 * IPC channels + wire types for the Board integration tier — the part of
 * the `persephone` bridge that `execute()` cannot express (in-app effects).
 * (EPIC-034 / US-724.)
 *
 * `execute()` itself rides the separate `runner-channels.ts` protocol; this
 * module covers `openRawLink`, `notify`, the native file dialogs, and the
 * one-time board-context lookup used to default an `execute()` `cwd`.
 *
 * Like `runner-channels.ts`, this module is intentionally dependency-free (no
 * imports from `src/main` or `src/renderer`) so the sandboxed board preload
 * can import it and talk to main over raw `ipcRenderer`. Dialog param types are
 * pulled type-only from the already-dependency-free `api-param-types.ts`.
 */
import type {
    OpenFileDialogParams,
    OpenFolderDialogParams,
    SaveFileDialogParams,
} from "./api-param-types";

export enum BoardBridgeChannel {
    /** Preload → main, synchronous (`sendSync`). Resolves the calling board's
     *  root folder from `event.sender.session` → `{ boardRoot }`. */
    getContext = "board:get-context",
    /** Preload → main, fire-and-forget. Open a link in a new Persephone page. */
    openRawLink = "board:open-raw-link",
    /** Preload → main, fire-and-forget. Show a toast in the host renderer. */
    notify = "board:notify",
    /** Preload → main, request/reply (`invoke`). Native open-file dialog. */
    openFileDialog = "board:open-file-dialog",
    /** Preload → main, request/reply (`invoke`). Native save-file dialog. */
    saveFileDialog = "board:save-file-dialog",
    /** Preload → main, request/reply (`invoke`). Native pick-folder dialog. */
    openFolderDialog = "board:open-folder-dialog",
    /** Host renderer → board guest, via `<webview>.send` (NOT `ipcMain`). Live theme
     *  switch; the preload re-applies the color `--p-*` and fires `onThemeChange`. */
    themeChanged = "board:theme-changed",
}

/** The host color palette pushed into a board: the frozen color `--p-*` contract
 *  resolved to concrete values, plus theme identity. The `vars` keys are `--p-*`
 *  names (e.g. `--p-bg`). Re-pushed on every theme switch (US-725). */
export interface BoardThemePalette {
    /** Active theme id, e.g. "default-dark". */
    id: string;
    /** True for dark themes (lets a board pick asset variants). */
    isDark: boolean;
    /** `--p-*` name → concrete CSS color value. */
    vars: Record<string, string>;
}

/** Reply to {@link BoardBridgeChannel.getContext}. */
export interface BoardContext {
    /** Absolute board root folder, or "" if the session is not a known board. */
    boardRoot: string;
    /** Initial color palette, applied by the preload before the page runs (US-725). */
    theme: BoardThemePalette;
    /** Static metric vars (`--p-space-*`, `--p-radius-*`, …) — theme-independent,
     *  delivered once at init, never re-pushed. `--p-*` name → CSS value. */
    tokens: Record<string, string>;
}

export type BoardNotifyType = "info" | "success" | "warning" | "error";

export interface BoardNotifyMsg {
    message: string;
    type?: BoardNotifyType;
}

export interface BoardOpenRawLinkMsg {
    href: string;
}

// Re-export the dialog param shapes so the preload + bridge import one place.
export type {
    OpenFileDialogParams,
    OpenFolderDialogParams,
    SaveFileDialogParams,
};
