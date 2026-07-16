# US-863: Install engine — download + sha256 verify + extract + install registry

**Epic:** [EPIC-045: Published Boards Catalog](../../epics/EPIC-045.md)
**Status:** Active (implemented-but-unreviewed under the epic deferred-review model)

## Goal

Build the headless machinery that turns a catalog entry (US-862's `PublishedBoardInfo`) into
an installed-but-untrusted board on disk: stream-download the release ZIP with byte progress,
verify its sha256, extract it into a target folder (zip-slip-guarded), validate it is a real
board, and record it in an install registry. **No trust, no UI, no editor-switch entry** — those
are US-864 (Board Info editor / "+" switch) and US-868 (`registerBoard`). Downloading trusts
nothing: the code sits on disk inert until the user later runs the trust dialog.

## Background

### The two-step install split (Concern 2, RESOLVED in the epic)

Install is deliberately **Download** (this task — no consent; verified code lands inert) then
**Register** (US-868 / US-864 — the standard `showTrustBoardDialog`). This task must never call
`boardTrust.trust`. The "nothing is trusted without the dialog" invariant holds with zero
exceptions, and it enables the download → agent-review → register flow (US-869).

### Patterns to follow

- **Streaming download + incremental hash (main):** there is **no existing streaming downloader**
  to reuse. `src/main/download-service.ts` hooks Electron's `will-download`/`DownloadItem` (for
  in-page browser downloads with a save dialog) — a different mechanism. We add a fresh
  `net.fetch`-based streamer. Reuse its **throttle constant** idea (`PROGRESS_THROTTLE_MS = 500`)
  and its `openWindows.send(EventEndpoint.…, { id, receivedBytes, totalBytes })` progress-event
  shape (see `src/main/download-service.ts:120-135`).
- **`net.fetch` (main):** `src/main/version-service.ts:21-50` — `net.fetch(url, { headers: { "User-Agent": "persephone" } })`, `if (!response.ok) …`. We additionally read `response.body` as a stream.
- **IPC 4-file recipe** (already exercised by US-862): `Endpoint` enum + `Api` type in
  `src/ipc/api-types.ts` → renderer method in `src/ipc/renderer/api.ts` → controller handler +
  `bindEndpoint` in `src/ipc/main/controller.ts`. Events add an `EventEndpoint` +
  `EventApi` entry in `api-types.ts` and a `RendererEventObject` field in
  `src/ipc/renderer/renderer-events.ts`. Reference the US-862 additions:
  `api-types.ts:103` (`getPublishedBoards`), `:240` (Api), `:270`/`:313` (event);
  `controller.ts:467-469` (handler, dynamic-imports the service) + `:572` (`bindEndpoint`).
- **Reactive registry singleton (renderer):** `src/renderer/api/board-trust.ts` is the exact
  shape to mirror — a `TGlobalState` + lazy `load()` + `fs.prepareDataFile`/`getDataFile`/
  `saveDataFile` + `fpNormalizeForCompare` for path matching + `subscribePaths`/`use…` hooks.
- **Archive reading (renderer):** `src/renderer/api/archive-service.ts` reads via
  libarchive-wasm. `readAllEntries` (`:63-88`) opens the archive **once** and iterates
  `reader.entries()`; `readEntryData` (`:91-108`) calls `entry.readData()` **inside** the same
  iteration. `extractTo` combines both in a single pass (open once, write each entry). Per-entry
  `readFile` is unsuitable — it re-reads and re-scans the whole archive every call.
- **Path utilities:** `src/renderer/core/utils/file-path.ts` — `fpJoin`, `fpDirname`,
  `fpResolve`, `fpBasename`, `fpNormalizeForCompare` (slash-separated, no trailing slash,
  lowercased on Windows — the basis of zip-slip containment and path-equality checks).
- **Board manifest reader:** `readBoardManifest(boardRoot)` in
  `src/renderer/editors/board/board-manifest.ts:123` returns `BoardManifest | null` (null =
  not a valid board). `isBoardFolder(root)` (`:116`) is the cheap existence check used for
  stale-entry reconciliation.
- **Renderer fs surface** (`src/renderer/api/fs.ts`): `mkdir` (`:398`), `write` (`:289`, string
  content), `exists` (`:318`), `delete` (`:335`), `rename` (`:346`, used for the update swap),
  `readFile` (`:272`). Data-file helpers: `prepareDataFile`/`getDataFile`/`saveDataFile`
  (`:516-529`).

### Catalog types already in place (US-862)

`src/ipc/api-param-types.ts` already defines `PublishedBoardArchive { url; size; sha256 }`,
`PublishedBoardInfo { id; version; name; description?; fileMasks?; editorName?; editorKind?;
standalone?; minAppVersion?; archive }`, `PublishedBoardsCatalog`, `PublishedBoardsResult`. This
task consumes `PublishedBoardInfo` / `PublishedBoardArchive` and adds only the download-request
type.

### Where the download runs vs. where extraction runs

- **Download + sha256 verify → main process** (`net.fetch` + `node:crypto`); returns a **temp
  ZIP path** (real OS filesystem path under `app.getPath("temp")`).
- **Extraction + validation + registry → renderer** (`archiveService` and the registry are
  renderer modules; `nodeIntegration` is on, so the renderer can read/write the temp path
  directly). The renderer orchestrates: call the download endpoint → `extractTo` → validate →
  record.

## Implementation plan

### Step 1 — Download-request type (`src/ipc/api-param-types.ts`)

Add after the existing `PublishedBoards*` types:

```ts
/** One in-flight board-archive download (EPIC-045 / US-863). `installId` is minted by the
 *  renderer so it can match `eBoardInstallProgress` events and cancel a specific download. */
export interface BoardArchiveDownloadRequest {
    installId: string;
    url: string;
    /** Expected lowercase hex sha256 — the download rejects on mismatch. */
    sha256: string;
    /** Expected byte size (from the catalog) — used for the progress bar total. */
    size: number;
}
```

### Step 2 — Download service (main, NEW `src/main/board-download-service.ts`)

A fresh module (kept separate from `published-boards-service.ts`: catalog fetch vs. binary
download are distinct concerns). Streams `net.fetch(url)` chunk-by-chunk, feeding each chunk to
a `createHash("sha256")` **and** an `fs.createWriteStream` temp file; throttled progress
broadcast; digest check on completion (delete temp + throw on mismatch); `AbortController`
registry for cancel.

```ts
import { net } from "electron";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openWindows } from "./open-windows";
import { getDataFolder, preparePath } from "./utils";
import { EventEndpoint } from "../ipc/api-types";
import { BoardArchiveDownloadRequest } from "../ipc/api-param-types";

const PROGRESS_THROTTLE_MS = 500;
const inFlight = new Map<string, AbortController>();

/** Dedicated download scratch folder — a sibling of the default install root
 *  (`<userData>/data/boards`), NOT the OS temp dir, so leftovers stay inside the app's
 *  own data folder and are swept at startup. */
function downloadsDir(): string {
    const dir = path.join(getDataFolder(), "boards-downloads");
    preparePath(dir);
    return dir;
}

/**
 * Stream a board release ZIP to a temp file, verifying its sha256 incrementally.
 * Returns the temp ZIP path. Throws (and deletes the temp file) on network error,
 * abort, or checksum mismatch. Trusts nothing — the renderer extracts + validates.
 */
export async function downloadBoardArchive(req: BoardArchiveDownloadRequest): Promise<string> {
    const { installId, url, sha256, size } = req;
    const controller = new AbortController();
    inFlight.set(installId, controller);

    const tempPath = path.join(downloadsDir(), `${installId}.zip`);
    // Delete a same-id leftover before we start (defensive — installId is unique per call).
    try { fs.rmSync(tempPath, { force: true }); } catch { /* best-effort */ }
    const hash = createHash("sha256");
    const out = fs.createWriteStream(tempPath);
    let received = 0;
    let lastSent = 0;

    const sendProgress = (totalBytes: number) =>
        openWindows.send(EventEndpoint.eBoardInstallProgress, {
            installId,
            receivedBytes: received,
            totalBytes,
        });

    try {
        const response = await net.fetch(url, {
            headers: { "User-Agent": "persephone" },
            signal: controller.signal,
        });
        if (!response.ok || !response.body) {
            throw new Error(`Download failed: HTTP ${response.status}`);
        }
        const total = size || Number(response.headers.get("content-length")) || 0;

        const reader = response.body.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = Buffer.from(value);
            hash.update(chunk);
            received += chunk.length;
            await new Promise<void>((res, rej) =>
                out.write(chunk, (err) => (err ? rej(err) : res())),
            );
            const now = Date.now();
            if (now - lastSent >= PROGRESS_THROTTLE_MS) {
                lastSent = now;
                sendProgress(total);
            }
        }
        await new Promise<void>((res, rej) => out.end((err?: Error) => (err ? rej(err) : res())));

        const digest = hash.digest("hex").toLowerCase();
        if (digest !== sha256.toLowerCase()) {
            fs.rmSync(tempPath, { force: true });
            throw new Error(`Checksum mismatch: expected ${sha256}, got ${digest}`);
        }
        sendProgress(total || received); // final 100% frame
        return tempPath;
    } catch (err) {
        out.destroy();
        try { fs.rmSync(tempPath, { force: true }); } catch { /* best-effort */ }
        throw err;
    } finally {
        inFlight.delete(installId);
    }
}

/** Abort an in-flight download by its installId (mid-download cancel → nothing installed). */
export function cancelBoardDownload(installId: string): void {
    inFlight.get(installId)?.abort();
}

/**
 * Remove leftover ZIPs in the downloads folder at startup — covers the one case
 * delete-before/delete-after can't: a hard crash mid-download (unique installId → the
 * file would otherwise linger forever). Skips any file whose id is currently in-flight.
 */
export function cleanDownloadsFolder(): void {
    try {
        const dir = downloadsDir();
        for (const name of fs.readdirSync(dir)) {
            if (!name.toLowerCase().endsWith(".zip")) continue;
            const id = name.slice(0, -4);
            if (inFlight.has(id)) continue; // don't delete an active download
            try { fs.rmSync(path.join(dir, name), { force: true }); } catch { /* best-effort */ }
        }
    } catch { /* best-effort */ }
}

export const boardDownloadService = { downloadBoardArchive, cancelBoardDownload, cleanDownloadsFolder };
```

Notes:
- A thrown error rejects the `ipcMain.handle` promise → the renderer `invoke` rejects with the
  message. The renderer (`board-install.ts`) catches and surfaces a friendly error (US-864
  renders it inline).
- **Startup sweep wiring (`src/main/main-setup.ts`):** in the existing `app.on("ready")`
  startup `setTimeout` (the one that already kicks `versionService.checkForUpdates()` and the
  catalog check), add a fire-and-forget sweep so a crash-orphaned ZIP never lingers:
  ```ts
  import("./board-download-service").then(({ boardDownloadService }) =>
      boardDownloadService.cleanDownloadsFolder(),
  );
  ```

### Step 3 — IPC wiring (4-file recipe)

**`src/ipc/api-types.ts`:**
- `Endpoint` enum (near the US-862 `getPublishedBoards = "getPublishedBoards"` at `:103`):
  ```ts
  downloadBoardArchive = "downloadBoardArchive",
  cancelBoardDownload = "cancelBoardDownload",
  ```
- `Api` type (near `:240`):
  ```ts
  [Endpoint.downloadBoardArchive]: (req: BoardArchiveDownloadRequest) => Promise<string>;
  [Endpoint.cancelBoardDownload]: (installId: string) => Promise<void>;
  ```
- `EventEndpoint` enum (near `ePublishedBoardsUpdated` at `:270`):
  ```ts
  eBoardInstallProgress = "eBoardInstallProgress",
  ```
- `EventApi` type (near `:313`, inline shape like `eDownloadProgress` at `:295`):
  ```ts
  [EventEndpoint.eBoardInstallProgress]: EventObject<{ installId: string; receivedBytes: number; totalBytes: number }>;
  ```
- Add `BoardArchiveDownloadRequest` to the existing `api-param-types` import.

**`src/ipc/renderer/api.ts`** (mirror the `getPublishedBoards` addition):
```ts
downloadBoardArchive = async (req: BoardArchiveDownloadRequest): Promise<string> => {
    return executeOnce<string>(Endpoint.downloadBoardArchive, req);
};
cancelBoardDownload = async (installId: string): Promise<void> => {
    return executeOnce<void>(Endpoint.cancelBoardDownload, installId);
};
```
Import `BoardArchiveDownloadRequest` from `../api-param-types`.

**`src/ipc/main/controller.ts`** (mirror `getPublishedBoards` at `:467`; dynamic-import the
service so it stays out of the eager main bundle):
```ts
downloadBoardArchive = async (_event: IpcMainEvent, req: BoardArchiveDownloadRequest): Promise<string> => {
    const { boardDownloadService } = await import("../../main/board-download-service");
    return boardDownloadService.downloadBoardArchive(req);
};
cancelBoardDownload = async (_event: IpcMainEvent, installId: string): Promise<void> => {
    const { boardDownloadService } = await import("../../main/board-download-service");
    boardDownloadService.cancelBoardDownload(installId);
};
```
And in the `bindEndpoint` block (near `:572`):
```ts
bindEndpoint(Endpoint.downloadBoardArchive, controllerInstance.downloadBoardArchive);
bindEndpoint(Endpoint.cancelBoardDownload, controllerInstance.cancelBoardDownload);
```
Import `BoardArchiveDownloadRequest` alongside the existing `PublishedBoardsResult` import.

**`src/ipc/renderer/renderer-events.ts`** (mirror the `ePublishedBoardsUpdated` field):
```ts
[EventEndpoint.eBoardInstallProgress] = new RendererEventObject<{ installId: string; receivedBytes: number; totalBytes: number }>(
    EventEndpoint.eBoardInstallProgress,
);
```

### Step 4 — Single-pass extractor (`src/renderer/api/archive-service.ts`)

Add a public `extractTo(archivePath, targetDir)` method that opens the archive once, iterates
entries, and writes each file/dir into `targetDir` with a **zip-slip guard**. Uses the module's
existing `nodefs` (documented low-level exception) plus `fpResolve`/`fpDirname`/
`fpNormalizeForCompare`. Enqueue on `archivePath` like every other public method.

```ts
// add to the imports at the top:
import { fpResolve, fpDirname, fpNormalizeForCompare, isZipBasedArchive } from "../core/utils/file-path";

/**
 * Extract every entry of an archive into `targetDir` in a single pass (open once,
 * write each entry). Guards against zip-slip — entries resolving outside `targetDir`
 * are rejected. Creates parent directories as needed.
 */
async extractTo(archivePath: string, targetDir: string): Promise<void> {
    return this.enqueue(archivePath, async () => {
        const { ArchiveReader } = await import("libarchive-wasm");
        const mod = await this.getWasmModule();
        const data = nodefs.readFileSync(archivePath);
        const reader = new ArchiveReader(mod, new Int8Array(data.buffer, data.byteOffset, data.byteLength));
        const rootKey = fpNormalizeForCompare(targetDir);
        try {
            nodefs.mkdirSync(targetDir, { recursive: true });
            for (const entry of reader.entries()) {
                let entryPath = entry.getPathname();
                const isDir = entry.getFiletype() === "Directory";
                if (isDir && entryPath.endsWith("/")) entryPath = entryPath.slice(0, -1);
                if (!entryPath || entryPath === "." ) continue;

                const dest = fpResolve(targetDir, entryPath);
                const destKey = fpNormalizeForCompare(dest);
                // zip-slip: dest must be inside targetDir (equal or under it)
                if (destKey !== rootKey && !destKey.startsWith(rootKey + "/")) {
                    throw new Error(`Unsafe archive entry (zip-slip): ${entryPath}`);
                }
                if (isDir) {
                    nodefs.mkdirSync(dest, { recursive: true });
                } else {
                    nodefs.mkdirSync(fpDirname(dest), { recursive: true });
                    const content = entry.readData();
                    const buf = content
                        ? Buffer.from(content.buffer, content.byteOffset, content.byteLength)
                        : Buffer.alloc(0);
                    nodefs.writeFileSync(dest, buf);
                }
            }
        } finally {
            reader.free();
        }
    });
}
```

(`isZipBasedArchive` is already imported at the top of the file — merge the import, don't
duplicate it. The archive here is always a ZIP, but `extractTo` doesn't need to assert that —
libarchive reads any supported format.)

### Step 5 — Install registry (`src/renderer/api/board-install-registry.ts`, NEW)

Mirror `board-trust.ts` structure. `installedBoards.json` (JSON array) via the `fs` data-file
helpers; reactive `TGlobalState`; one entry per catalog `id`; stale-entry reconciliation on
`load()`.

```ts
import { TGlobalState } from "../core/state/state";
import { fpNormalizeForCompare } from "../core/utils/file-path";
import { fs } from "./fs";
import { isBoardFolder } from "../editors/board/board-manifest";

const INSTALLED_BOARDS_FILE = "installedBoards.json";

/** One catalog-installed board (EPIC-045 / US-863). */
export interface InstalledBoardEntry {
    /** Catalog board id (folder name under the repo's boards/). Unique per entry. */
    id: string;
    /** Absolute install root (the board folder), original case. */
    root: string;
    /** Installed version (semver), for update comparison. */
    version: string;
    /** Epoch ms of install/last update. */
    installedAt: number;
    /** Reserved for US-865: last version we toasted an update for (per-entry, renderer-side). */
    lastNotifiedVersion?: string;
}

interface RegistryState {
    entries: InstalledBoardEntry[];
    loaded: boolean;
}

class BoardInstallRegistry {
    private readonly state = new TGlobalState<RegistryState>({ entries: [], loaded: false });

    /** Load from disk + prune entries whose root no longer holds a board manifest
     *  (folder deleted manually — the BoardNotFoundView stale-path precedent). */
    async load(): Promise<void> {
        await fs.prepareDataFile(INSTALLED_BOARDS_FILE, "[]");
        const raw = await fs.getDataFile(INSTALLED_BOARDS_FILE);
        let entries = this.parse(raw);

        // Stale-entry reconciliation.
        const alive: InstalledBoardEntry[] = [];
        for (const e of entries) {
            if (await isBoardFolder(e.root)) alive.push(e);
        }
        const changed = alive.length !== entries.length;
        entries = alive;

        this.state.update((s) => {
            s.entries = entries;
            s.loaded = true;
        });
        if (changed) await this.persist(entries);
    }

    private parse(raw: string | undefined): InstalledBoardEntry[] {
        if (!raw) return [];
        try {
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) return [];
            return data.filter(
                (e): e is InstalledBoardEntry =>
                    !!e && typeof e.id === "string" && typeof e.root === "string" && typeof e.version === "string",
            );
        } catch {
            return [];
        }
    }

    private async persist(entries: InstalledBoardEntry[]): Promise<void> {
        await fs.saveDataFile(INSTALLED_BOARDS_FILE, JSON.stringify(entries, null, 2));
    }

    /** Record (insert or replace-by-id). One entry per id — re-installing to a new dir moves it. */
    async record(entry: InstalledBoardEntry): Promise<void> {
        await this.load();
        const entries = this.state.get().entries.filter((e) => e.id !== entry.id);
        entries.push(entry);
        this.state.update((s) => { s.entries = entries; });
        await this.persist(entries);
    }

    /** Remove by catalog id (idempotent). */
    async remove(id: string): Promise<void> {
        await this.load();
        const entries = this.state.get().entries.filter((e) => e.id !== id);
        this.state.update((s) => { s.entries = entries; });
        await this.persist(entries);
    }

    getById(id: string): InstalledBoardEntry | undefined {
        return this.state.get().entries.find((e) => e.id === id);
    }

    getByRoot(root: string): InstalledBoardEntry | undefined {
        const key = fpNormalizeForCompare(root);
        return this.state.get().entries.find((e) => fpNormalizeForCompare(e.root) === key);
    }

    listInstalled(): InstalledBoardEntry[] {
        return this.state.get().entries;
    }

    useInstalled(): InstalledBoardEntry[] {
        return this.state.use((s) => s.entries);
    }
}

export const boardInstallRegistry = new BoardInstallRegistry();
```

### Step 6 — Install orchestration (`src/renderer/api/board-install.ts`, NEW)

`downloadBoard` (fresh install) and `updateBoard` (in-place swap). No trust anywhere.

```ts
import { api } from "../../ipc/renderer/api";
import { fs } from "./fs";
import { archiveService } from "./archive-service";
import { fpJoin, fpDirname } from "../core/utils/file-path";
import { readBoardManifest } from "../editors/board/board-manifest";
import { PublishedBoardInfo } from "../../ipc/api-param-types";
import { boardInstallRegistry } from "./board-install-registry";

function newInstallId(): string {
    return crypto.randomUUID();
}

/**
 * Download → verify → extract → validate → record a board into `<targetParentDir>/<id>`.
 * Returns the install root. Trusts NOTHING (registration is a separate step). Throws on
 * checksum/network/extract failure, or if the target folder already holds a DIFFERENT board.
 */
export async function downloadBoard(
    entry: PublishedBoardInfo,
    targetParentDir: string,
): Promise<string> {
    const root = fpJoin(targetParentDir, entry.id);

    if (await fs.exists(root)) {
        const existing = boardInstallRegistry.getByRoot(root);
        if (!existing || existing.id !== entry.id) {
            throw new Error(`Target folder already exists: ${root}`);
        }
        // Same board re-installed into its own root → treat as an update (swap).
        return updateBoard(entry);
    }

    const installId = newInstallId();
    const tempZip = await api.downloadBoardArchive({
        installId,
        url: entry.archive.url,
        sha256: entry.archive.sha256,
        size: entry.archive.size,
    });
    try {
        await archiveService.extractTo(tempZip, root);
        const manifest = await readBoardManifest(root);
        if (!manifest) {
            await fs.delete(root);
            throw new Error("Downloaded archive is not a valid board (no board-manifest.json).");
        }
        await boardInstallRegistry.record({
            id: entry.id,
            root,
            version: entry.version,
            installedAt: Date.now(),
        });
        return root;
    } finally {
        // Remove the downloaded ZIP after extraction (success or failure) — no scratch
        // file lingers in <userData>/data/boards-downloads.
        try { await fs.delete(tempZip); } catch { /* cleanup best-effort */ }
    }
}

/**
 * Update/reinstall an already-installed board in place via a temp-extract + folder swap,
 * so a failed download never destroys the working board. Runs under the board's EXISTING
 * trust (same root). The open-pages / busy precondition + close-pages dialog is US-865's
 * responsibility (wired in the caller); this function performs the swap only.
 */
export async function updateBoard(entry: PublishedBoardInfo): Promise<string> {
    const existing = boardInstallRegistry.getById(entry.id);
    if (!existing) throw new Error(`Board not installed: ${entry.id}`);
    const root = existing.root;
    const parent = fpDirname(root);

    const installId = newInstallId();
    const stagingDir = fpJoin(parent, `.${entry.id}.staging-${installId}`);
    const backupDir = fpJoin(parent, `.${entry.id}.old-${installId}`);

    const tempZip = await api.downloadBoardArchive({
        installId,
        url: entry.archive.url,
        sha256: entry.archive.sha256,
        size: entry.archive.size,
    });
    try {
        await archiveService.extractTo(tempZip, stagingDir);
        const manifest = await readBoardManifest(stagingDir);
        if (!manifest) throw new Error("Downloaded archive is not a valid board (no board-manifest.json).");

        // Swap: move old aside, move staging in; roll back on failure.
        await fs.rename(root, backupDir);
        try {
            await fs.rename(stagingDir, root);
        } catch (swapErr) {
            await fs.rename(backupDir, root); // restore the working board
            throw swapErr;
        }
        await fs.delete(backupDir);

        await boardInstallRegistry.record({
            id: entry.id,
            root,
            version: entry.version,
            installedAt: Date.now(),
        });
        return root;
    } finally {
        try { await fs.delete(stagingDir); } catch { /* best-effort */ }
        try { await fs.delete(tempZip); } catch { /* best-effort */ }
    }
}
```

### Step 7 — Load the registry at bootstrap (`src/renderer/api/app.ts`)

In `initServices()`, alongside the US-862 `published-boards` load (after `downloads.init()`):

```ts
// Load the board install registry so update checks / "already installed" filters
// have data (US-863). Fire-and-forget; reconciles stale entries on load.
import("./board-install-registry").then(({ boardInstallRegistry }) => boardInstallRegistry.load());
```

## Concerns / Open questions

1. **`net.fetch` streaming body** — Electron 43's `net.fetch` returns a WHATWG `Response`
   whose `.body` is a web `ReadableStream`; `getReader()` + `read()` loop is the portable form
   used above (avoids relying on async-iteration of the stream). **Resolved: use `getReader()`.**
2. **Error propagation across IPC** — `ipcMain.handle` rejects the renderer `invoke` promise
   with the thrown `Error`'s message. `board-install.ts` lets it propagate; US-864 renders it
   inline. No structured error payload needed for this task. **Resolved.**
3. **Download scratch location — RESOLVED (2026-07-16): dedicated app folder, not OS temp.**
   ZIPs download to `<userData>/data/boards-downloads` (a sibling of the default install root
   `<userData>/data/boards`), never the OS temp dir — so nothing pollutes the user's disk
   outside the app's own data folder. Three layers keep it clean: **delete-before-write** (any
   same-id leftover is removed before the stream opens), **delete-after-extraction** (the
   renderer removes the ZIP in its `finally`, success or failure), and a **startup sweep**
   (`cleanDownloadsFolder()` at app launch clears any ZIP orphaned by a hard crash mid-download,
   skipping in-flight ids). The folder is empty in steady state.
4. **Registry vs. trust are independent** — the install registry (`installedBoards.json`) tracks
   *what was downloaded from the catalog*; trust (`trustedBoards.txt`) tracks *what may run*. A
   downloaded-not-registered board has a registry entry but is untrusted. Uninstall (US-867)
   removes both; this task only writes the registry entry. **Resolved.**
5. **Default install directory** — `downloadBoard` takes `targetParentDir` as a parameter; the
   default and the Browse… picker are US-864's Board Info screen, not in scope here. For clarity,
   the shorthand `<userData>` in this doc means Electron's `app.getPath("userData")` =
   `getCommonFolder("userData")` = `…\AppData\Roaming\persephone` (the app-named folder), so:
   - default install root → `…\Roaming\persephone\data\boards\<id>`
   - download scratch → `…\Roaming\persephone\data\boards-downloads`

   Both are subfolders of `…\persephone\data` (`getDataFolder()` in main). **Resolved.**
6. **Testing before US-866 publishes anything** — no released ZIP exists yet. Smoke-test via
   DevTools with a hand-built board ZIP served over a local URL + its real sha256, or set
   `PERSEPHONE_BOARDS_BRANCH=develop` once US-866 lands assets on `develop`. Full end-to-end is
   the epic-close acceptance test. **Accepted.**

## Acceptance criteria

- `downloadBoard(entry, parentDir)` streams the ZIP, verifies sha256, extracts to
  `<parentDir>/<entry.id>`, validates `readBoardManifest` is non-null, records an
  `installedBoards.json` entry, and returns the root — **and `boardTrust.isTrusted(root)` is
  `false`** (nothing trusted, no editor-switch entry, board inert on disk).
- A sha256 mismatch rejects with a clear error, deletes the temp file, and leaves **no** install
  folder and **no** registry entry. A network failure behaves the same.
- `archiveService.extractTo` rejects any entry that resolves outside the target dir (zip-slip)
  and otherwise reproduces the archive tree faithfully (dirs + files, nested paths).
- Install registry: exactly **one entry per catalog id** (re-download to a different dir replaces
  it); `getByRoot`/`getById` resolve correctly; an entry whose folder was deleted manually is
  pruned on `load()`.
- `cancelBoardDownload(installId)` aborts an in-flight download; the partial temp file is removed
  and nothing is installed.
- `updateBoard(entry)` swaps the folder in place; a mid-swap failure restores the original board
  (trust/pins untouched — same root). Progress events (`eBoardInstallProgress`) fire throttled
  during both flows.
- `npm run typecheck` and `npm run lint` pass clean on all changed files.

## Files changed

| File | Change |
|------|--------|
| `src/ipc/api-param-types.ts` | **+** `BoardArchiveDownloadRequest` interface |
| `src/main/board-download-service.ts` | **NEW** — streaming `net.fetch` download into `<userData>/data/boards-downloads` + incremental sha256 + throttled progress + `AbortController` cancel + `cleanDownloadsFolder()` startup sweep |
| `src/main/main-setup.ts` | **+** fire-and-forget `cleanDownloadsFolder()` in the startup `setTimeout` |
| `src/ipc/api-types.ts` | **+** `Endpoint.downloadBoardArchive` / `.cancelBoardDownload` (+ `Api`); `EventEndpoint.eBoardInstallProgress` (+ `EventApi`); import `BoardArchiveDownloadRequest` |
| `src/ipc/renderer/api.ts` | **+** `downloadBoardArchive` / `cancelBoardDownload` methods |
| `src/ipc/main/controller.ts` | **+** two handlers (dynamic-import `board-download-service`) + two `bindEndpoint` calls |
| `src/ipc/renderer/renderer-events.ts` | **+** `eBoardInstallProgress` `RendererEventObject` field |
| `src/renderer/api/archive-service.ts` | **+** `extractTo(archivePath, targetDir)` single-pass, zip-slip-guarded extractor; merge `fpResolve`/`fpDirname`/`fpNormalizeForCompare` into the `file-path` import |
| `src/renderer/api/board-install-registry.ts` | **NEW** — `installedBoards.json` reactive registry (`InstalledBoardEntry`; record/remove/getById/getByRoot/listInstalled/useInstalled; stale-entry reconciliation on load) |
| `src/renderer/api/board-install.ts` | **NEW** — `downloadBoard(entry, parentDir)` + `updateBoard(entry)` orchestration |
| `src/renderer/api/app.ts` | **+** fire-and-forget `boardInstallRegistry.load()` in `initServices()` |

### Files that need NO changes (verified)

- `src/main/published-boards-service.ts` — catalog fetch only; download lives in the new service.
- `src/main/version-service.ts` / `src/shared/version-utils.ts` — no version-compare here.
- `src/renderer/api/published-boards.ts` — catalog model unchanged (US-865 adds update-derivation).
- `src/renderer/editors/board/board-manifest.ts` — `readBoardManifest`/`isBoardFolder` already exist.
- `src/renderer/api/board-trust.ts` — trust is untouched (registration is US-864/US-868).
