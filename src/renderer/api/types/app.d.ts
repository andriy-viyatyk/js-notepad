import type { ISettings } from "./settings";
import type { IEditorRegistry } from "./editors";
import type { IRecentFiles } from "./recent";
import type { IFileSystem } from "./fs";
import type { IWindow } from "./window";
import type { IShell } from "./shell";
import type { IUserInterface } from "./ui";
import type { IDownloads } from "./downloads";
import type { IMenuFolders } from "./menu-folders";
import type { IProc } from "./proc";
import type { IPageCollection } from "./pages";
import type { IAppEvents } from "./events";

/**
 * Root application object. Entry point to all app functionality.
 *
 * Available in scripts as the global `app` variable.
 *
 * @example
 * console.log(app.version);
 * app.settings.set("theme", "monokai");
 * app.pages.all.forEach(p => console.log(p.title));
 */
export interface IApp {
    /** Application version string (e.g. "1.0.17"). */
    readonly version: string;

    /** Application configuration. */
    readonly settings: ISettings;

    /** Read-only registry of all editors. */
    readonly editors: IEditorRegistry;

    /** Recently opened files. Call `load()` before reading `files`. */
    readonly recent: IRecentFiles;

    /** File system operations, dialogs, and OS integration. */
    readonly fs: IFileSystem;

    /** Window management: minimize, maximize, zoom, multi-window. */
    readonly window: IWindow;

    /** OS integration: open URLs, encryption, version info. */
    readonly shell: IShell;

    /** Dialogs and notifications. */
    readonly ui: IUserInterface;

    /** Global download tracking. */
    readonly downloads: IDownloads;

    /** User-configured sidebar folders. */
    readonly menuFolders: IMenuFolders;

    /** Spawn external programs and stream their output. */
    readonly proc: IProc;

    /** Open pages (tabs) in the current window. */
    readonly pages: IPageCollection;

    /** Application event channels for scripting integration. */
    readonly events: IAppEvents;

    /**
     * Make an HTTP request using Node.js (bypasses Chromium headers).
     * Full header control — no automatic Origin, User-Agent, Sec-Fetch-*, etc.
     * Returns a standard web Response object.
     *
     * @example
     * const res = await app.fetch("https://api.example.com/users");
     * const data = await res.json();
     *
     * @example
     * const res = await app.fetch("https://api.example.com/users", {
     *     method: "POST",
     *     headers: {
     *         "Content-Type": "application/json",
     *         "Authorization": "Bearer token123",
     *     },
     *     body: JSON.stringify({ name: "John" }),
     * });
     */
    fetch(url: string, options?: IFetchOptions): Promise<Response>;

    /**
     * Run a function in a background worker thread.
     * The renderer stays responsive while the function executes.
     *
     * The function runs in an isolated worker thread with full Node.js access.
     * It cannot access outer scope variables (closures are lost during serialization).
     * Use `data` for input and `proxy` for renderer communication.
     *
     * @param fn - The function to run in the worker. Must be self-contained.
     *   Has full access to Node.js APIs via `require()` (fs, path, child_process, etc.).
     * @param data - Plain serializable data passed to the function (cloned via structured clone).
     *   Supports: primitives, plain objects, arrays, Map, Set, ArrayBuffer, Date, RegExp.
     *   Does NOT support: functions, DOM elements, class instances, circular references.
     * @param proxy - Optional object transparently proxied back to the renderer.
     *   Every access on `proxy` inside the worker is async (round-trips via postMessage).
     *   Property sets on proxy are fire-and-forget (sent but not awaited).
     *   Use callback methods when you need confirmation: `await proxy.onProgress(msg)`.
     *
     * @example
     * // Simple: offload heavy computation
     * const result = await app.runAsync(
     *     async (data) => {
     *         const fs = require("fs");
     *         return fs.readdirSync(data.dir, { recursive: true });
     *     },
     *     { dir: "C:/projects/my-app/src" }
     * );
     *
     * @example
     * // With proxy: progress updates from worker
     * const progress = await app.ui.createProgress("Processing...");
     * await progress.show(app.runAsync(
     *     async (data, proxy) => {
     *         const fs = require("fs");
     *         const files = fs.readdirSync(data.dir);
     *         for (let i = 0; i < files.length; i++) {
     *             await proxy.onProgress(`${i + 1}/${files.length}`);
     *         }
     *         return files;
     *     },
     *     { dir: "C:/my-project" },
     *     { onProgress: (msg: string) => { progress.label = msg; } }
     * ));
     *
     * @example
     * // With proxy: passing app API objects
     * const result = await app.runAsync(
     *     async (data, proxy) => {
     *         const content = await proxy.fs.readFile(data.path);
     *         return JSON.parse(content);
     *     },
     *     { path: "C:/data.json" },
     *     { fs: app.fs }
     * );
     */
    runAsync<TData = unknown, TProxy = unknown, TResult = unknown>(
        fn: (data: TData, proxy: TProxy) => Promise<TResult>,
        data: TData,
        proxy?: TProxy
    ): Promise<TResult>;
}

/**
 * Options for `app.fetch()`.
 */
export interface IFetchOptions {
    /** HTTP method. Default: "GET". */
    method?: string;
    /** Request headers. Sent exactly as specified — no automatic headers added. */
    headers?: Record<string, string>;
    /** Request body — string or ReadableStream. */
    body?: string | ReadableStream | null;
    /** Request timeout in milliseconds. Default: 30000. */
    timeout?: number;
    /** Maximum number of redirects to follow. Default: 10. */
    maxRedirects?: number;
    /** Set to false to skip SSL certificate validation (e.g. self-signed certs). Default: true. */
    rejectUnauthorized?: boolean;
}
