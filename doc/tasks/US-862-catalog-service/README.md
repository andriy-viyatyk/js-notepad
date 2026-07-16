# US-862 — Catalog service (main): manifest fetch, cache, periodic check, IPC

**Epic:** [EPIC-045 — Published Boards Catalog](../../epics/EPIC-045.md)
**Status:** Active

## Goal

Stand up the foundation of the Published Boards Catalog: a main-process service that fetches
`boards-manifest.json` from the `persephone-boards` GitHub repo (raw HTTPS, mirroring
`version-service.ts`), caches the last-good catalog, re-checks on a 24h gate, and broadcasts
changes; plus the renderer-side reactive model and the manifest/version plumbing every later
US-045 task builds on. No download, no install, no UI beyond the reactive model — just the
catalog data flowing from GitHub into a renderer store.

## Background

### Pattern to mirror — `version-service.ts`

`src/main/version-service.ts` is the exact template: `net.fetch` a GitHub URL, gate on a 24h
`electronStore` timestamp (`force` bypasses), broadcast via `openWindows.send(EventEndpoint.…)`,
kicked from `main-setup.ts`'s startup `setTimeout`. We copy its shape for the catalog. Key
difference: the catalog must **cache the last-good payload** (so the UI works offline), which
the version check does not.

Relevant existing code:
- `src/main/version-service.ts` — `parseVersion` / `compareVersions` (lines 15–35, currently
  main-only), `checkForUpdates` gate + broadcast, `versionService` export object.
- `src/main/e-store.ts` — `electronStore.get<T>(key, default?)` / `electronStore.set(key, value)`.
  Values are JSON-serializable; we store the whole catalog object under one key.
- `src/main/open-windows.ts` — `openWindows.send(EventEndpoint.x, payload)` fans an event to
  every renderer (used by `broadcastUpdateAvailable`).
- `src/main/main-setup.ts` — `app.on("ready")` has a single `setTimeout(() => versionService.checkForUpdates(), 5000)` we extend.

### IPC — the 4-file recipe (+ 1 for events)

A request/response endpoint touches four files; an event touches three. Concrete example to
copy: `checkForUpdates` (endpoint) and `eUpdateAvailable` (event).

1. `src/ipc/api-types.ts` — add to `enum Endpoint`, add the signature to `type Api`; for the
   event add to `enum EventEndpoint` and `type EventApi`.
2. `src/ipc/renderer/api.ts` — add the method to `class ApiCalls` calling `executeOnce`.
3. `src/ipc/main/controller.ts` — add the handler method to `class Controller`, then
   `bindEndpoint(Endpoint.x, controllerInstance.x)` in `init()`. Handler signature is
   `(event: IpcMainEvent, ...args) => Promise<…>`.
4. `src/ipc/renderer/renderer-events.ts` — add a `RendererEventObject<T>` field for the event.

`src/ipc/api-param-types.ts` holds shared DTOs (like `UpdateCheckResult`) — a plain module with
no electron imports, safe on both sides. Catalog DTOs go here.

### Shared version compare — the extraction

`parseVersion` / `compareVersions` live in `version-service.ts`, whose top-level imports
(`electron`, `./e-store`, `./open-windows`) must **never** be pulled into the renderer bundle.
The renderer catalog model needs the same compare (compatibility + update detection). Fix:
extract the two pure functions to a new `src/shared/version-utils.ts` (no imports), have
`version-service.ts` re-export from there. Confirmed safe: `compareVersions` has **no external
importers** today — it's used only inside `version-service.ts` (line 102) and surfaced on the
`versionService` object (line 133). `src/shared/` already holds pure modules
(`link-data.ts`, `utils.ts`, `persistence.ts`, `types.ts`, `constants.ts`).

### Board manifest — new optional fields

`src/renderer/editors/board/board-manifest.ts` defines `BoardManifest`. Per the epic it gains
`version?`, `standalone?`, `minAppVersion?`, plus a resolver `isBoardStandalone(manifest)` and a
derived-group helper. `getBoardEditorAssociation` / `normalizeFileMasks` / `matchesFileMask`
already exist and are reused by the renderer catalog model's mask matching.

### Reactive renderer model — pattern to mirror

`src/renderer/api/board-trust.ts` and `src/renderer/editors/board/busy-boards.ts` show the house
style: a `TGlobalState<T>` (or `TOneState<T>`) singleton, `use((s) => …)` hooks for views,
`subscribe(listener, selector)`, lazy `load()`. The catalog model follows this: hold the catalog
in `TGlobalState`, subscribe to `ePublishedBoardsUpdated`, expose `useCatalog()` and
`useCatalogBoardsForFile(fileName)`.

`app.version` (renderer) is the running app version — `src/renderer/api/app.ts` `get version()`,
populated from `api.getAppVersion()` at bootstrap. The renderer compatibility check compares
`minAppVersion` against `app.version` via the shared `compareVersions`.

### Catalog schema (from the epic)

```json
{
  "schemaVersion": 1,
  "boards": [
    {
      "id": "drawio-viewer",
      "version": "1.0.0",
      "name": "DrawIO Viewer",
      "description": "Read-only viewer for diagrams.net / draw.io (.drawio) diagrams.",
      "fileMasks": ["*.drawio"],
      "editorName": "DrawIO",
      "editorKind": "content-host",
      "standalone": false,
      "minAppVersion": "4.0.14",
      "archive": {
        "url": "https://github.com/andriy-viyatyk/persephone-boards/releases/download/drawio-viewer-v1.0.0/drawio-viewer.zip",
        "size": 1234567,
        "sha256": "<hex>"
      }
    }
  ]
}
```

## Implementation plan

### Step 1 — Shared version utils (`src/shared/version-utils.ts`, new)

Move `parseVersion` + `compareVersions` out of `version-service.ts` verbatim:

```ts
/**
 * Shared semver-ish version parse + compare, usable from BOTH the main and renderer
 * bundles. Kept import-free on purpose: `version-service.ts` (main) must not leak its
 * electron / e-store / open-windows imports into the renderer, which needs the same
 * compare for the published-boards catalog (compatibility + update detection).
 */
export function parseVersion(version: string): number[] {
    const cleaned = version.replace(/^v/, "");
    return cleaned.split(".").map((part) => parseInt(part, 10) || 0);
}

/** Returns 1 if `latest` > `current`, -1 if `latest` < `current`, 0 if equal. */
export function compareVersions(current: string, latest: string): number {
    const currentParts = parseVersion(current);
    const latestParts = parseVersion(latest);
    const maxLength = Math.max(currentParts.length, latestParts.length);
    for (let i = 0; i < maxLength; i++) {
        const c = currentParts[i] || 0;
        const l = latestParts[i] || 0;
        if (l > c) return 1;
        if (l < c) return -1;
    }
    return 0;
}
```

Then in `src/main/version-service.ts`:
- Remove the local `parseVersion` + `compareVersions` (lines 15–35).
- Add `import { compareVersions } from "../shared/version-utils";` (note: `version-service.ts`
  is at `src/main/`, so the path is `../shared/version-utils`).
- Keep `compareVersions` on the exported `versionService` object (line 133) — re-export it:
  `export { compareVersions } from "../shared/version-utils";` at top, or import and include in
  the object. Preserve the existing named export `export function compareVersions` behavior by
  re-exporting so any future importer of `version-service` still resolves it.

### Step 2 — Catalog DTOs (`src/ipc/api-param-types.ts`)

Append:

```ts
export interface PublishedBoardArchive {
    url: string;
    size: number;
    sha256: string;
}

/** One board entry in `boards-manifest.json`. Association fields
 *  (fileMasks/editorName/editorKind/standalone) are copied by the publish automation
 *  from the board's own board-manifest.json so the client can advertise a board
 *  without downloading it. */
export interface PublishedBoardInfo {
    id: string;
    version: string;
    name: string;
    description?: string;
    fileMasks?: string[];
    editorName?: string;
    editorKind?: "simple" | "content-host";
    standalone?: boolean;
    minAppVersion?: string;
    archive: PublishedBoardArchive;
}

export interface PublishedBoardsCatalog {
    schemaVersion: number;
    boards: PublishedBoardInfo[];
}

/** Return value of `getPublishedBoards`. `catalog` is the last-good catalog (from
 *  network or cache), or null if never fetched and nothing cached. */
export interface PublishedBoardsResult {
    catalog: PublishedBoardsCatalog | null;
    /** epoch ms of the last successful network fetch (0 = never). */
    fetchedAt: number;
    /** true when returned from cache without a fresh network hit. */
    fromCache: boolean;
    error?: string;
}
```

### Step 3 — Catalog service (`src/main/published-boards-service.ts`, new)

Mirror `version-service.ts`. Full sketch:

```ts
import { net } from "electron";
import { electronStore } from "./e-store";
import { openWindows } from "./open-windows";
import { EventEndpoint } from "../ipc/api-types";
import {
    PublishedBoardInfo,
    PublishedBoardsCatalog,
    PublishedBoardsResult,
} from "../ipc/api-param-types";

const CATALOG_SCHEMA_VERSION = 1;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const STORE_KEYS = {
    lastCheckTime: "published-boards-lastTime",
    catalog: "published-boards-catalog", // cached last-good PublishedBoardsCatalog
};

/** Dev-only source override: PERSEPHONE_BOARDS_BRANCH switches the raw base off `main`
 *  (e.g. `develop`) so the whole flow is testable before anything ships to main. */
function manifestUrl(): string {
    const branch = process.env.PERSEPHONE_BOARDS_BRANCH?.trim() || "main";
    return `https://raw.githubusercontent.com/andriy-viyatyk/persephone-boards/${branch}/boards-manifest.json`;
}

function validateBoard(entry: unknown): PublishedBoardInfo | null {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    const archive = e.archive as Record<string, unknown> | undefined;
    if (
        typeof e.id !== "string" || !e.id ||
        typeof e.version !== "string" || !e.version ||
        typeof e.name !== "string" || !e.name ||
        !archive ||
        typeof archive.url !== "string" ||
        typeof archive.sha256 !== "string" ||
        typeof archive.size !== "number"
    ) {
        return null;
    }
    const editorKind =
        e.editorKind === "content-host" ? "content-host"
        : e.editorKind === "simple" ? "simple"
        : undefined;
    return {
        id: e.id,
        version: e.version,
        name: e.name,
        description: typeof e.description === "string" ? e.description : undefined,
        fileMasks: Array.isArray(e.fileMasks)
            ? e.fileMasks.filter((m): m is string => typeof m === "string")
            : undefined,
        editorName: typeof e.editorName === "string" ? e.editorName : undefined,
        editorKind,
        standalone: typeof e.standalone === "boolean" ? e.standalone : undefined,
        minAppVersion: typeof e.minAppVersion === "string" ? e.minAppVersion : undefined,
        archive: { url: archive.url, size: archive.size, sha256: archive.sha256 },
    };
}

function validateCatalog(data: unknown): PublishedBoardsCatalog | null {
    if (!data || typeof data !== "object") return null;
    const raw = data as { schemaVersion?: unknown; boards?: unknown };
    if (raw.schemaVersion !== CATALOG_SCHEMA_VERSION) return null;
    if (!Array.isArray(raw.boards)) return null;
    const boards = raw.boards
        .map(validateBoard)
        .filter((b): b is PublishedBoardInfo => b !== null);
    return { schemaVersion: CATALOG_SCHEMA_VERSION, boards };
}

function getCachedCatalog(): PublishedBoardsCatalog | null {
    return electronStore.get<PublishedBoardsCatalog>(STORE_KEYS.catalog) ?? null;
}

function catalogsEqual(a: PublishedBoardsCatalog | null, b: PublishedBoardsCatalog | null): boolean {
    return JSON.stringify(a) === JSON.stringify(b); // small payload; cheap + good enough
}

async function fetchCatalog(): Promise<PublishedBoardsCatalog | null> {
    try {
        const response = await net.fetch(manifestUrl(), {
            headers: { "User-Agent": "persephone" },
        });
        if (!response.ok) return null;
        const data = await response.json();
        return validateCatalog(data);
    } catch {
        return null;
    }
}

export async function getPublishedBoards(force = false): Promise<PublishedBoardsResult> {
    const cached = getCachedCatalog();
    const lastCheckTime = electronStore.get<number>(STORE_KEYS.lastCheckTime, 0) ?? 0;

    if (!force) {
        const now = Date.now();
        if (now - lastCheckTime < CHECK_INTERVAL_MS) {
            return { catalog: cached, fetchedAt: lastCheckTime, fromCache: true };
        }
    }

    const fetched = await fetchCatalog();
    if (!fetched) {
        // Silent failure: keep serving the cached catalog (offline-friendly).
        return { catalog: cached, fetchedAt: lastCheckTime, fromCache: true, error: "fetch-failed" };
    }

    const now = Date.now();
    electronStore.set(STORE_KEYS.lastCheckTime, now);

    if (!catalogsEqual(cached, fetched)) {
        electronStore.set(STORE_KEYS.catalog, fetched);
        openWindows.send(EventEndpoint.ePublishedBoardsUpdated, fetched);
    }

    return { catalog: fetched, fetchedAt: now, fromCache: false };
}

export const publishedBoardsService = { getPublishedBoards };
```

Notes:
- On a forced refresh that returns an unchanged catalog, **no event is broadcast** (guarded by
  `catalogsEqual`) — badge derivation is idempotent, so this is fine.
- `error: "fetch-failed"` is informational only; the renderer never surfaces it as a toast
  (acceptance: offline startup is silent).

### Step 4 — IPC wiring (endpoint + event)

**`src/ipc/api-types.ts`:**
- `enum Endpoint`: add `getPublishedBoards = "getPublishedBoards",`
- `type Api`: add `[Endpoint.getPublishedBoards]: (force?: boolean) => Promise<PublishedBoardsResult>;`
- import `PublishedBoardsResult` (and it's fine to import `PublishedBoardsCatalog` for the event) from `./api-param-types`.
- `enum EventEndpoint`: add `ePublishedBoardsUpdated = "ePublishedBoardsUpdated",`
- `type EventApi`: add `[EventEndpoint.ePublishedBoardsUpdated]: EventObject<PublishedBoardsCatalog>;`

**`src/ipc/renderer/api.ts`:**
```ts
getPublishedBoards = async (force?: boolean) => {
    return executeOnce<PublishedBoardsResult>(Endpoint.getPublishedBoards, force);
};
```
(import `PublishedBoardsResult` from `../api-param-types`.)

**`src/ipc/main/controller.ts`:**
```ts
// handler in class Controller
getPublishedBoards = async (_event: IpcMainEvent, force?: boolean): Promise<PublishedBoardsResult> => {
    const { publishedBoardsService } = await import("../../main/published-boards-service");
    return publishedBoardsService.getPublishedBoards(force);
};
```
(dynamic import matches the lazy-import style used by git/board handlers; import the
`PublishedBoardsResult` type at top.) Then in `init()`:
`bindEndpoint(Endpoint.getPublishedBoards, controllerInstance.getPublishedBoards);`

**`src/ipc/renderer/renderer-events.ts`:**
```ts
[EventEndpoint.ePublishedBoardsUpdated] = new RendererEventObject<PublishedBoardsCatalog>(
    EventEndpoint.ePublishedBoardsUpdated
);
```
(import `PublishedBoardsCatalog` from `../api-param-types`.)

### Step 5 — Startup kick (`src/main/main-setup.ts`)

Extend the existing startup `setTimeout` in `app.on("ready")` (currently only
`versionService.checkForUpdates()`):

```ts
setTimeout(() => {
    versionService.checkForUpdates();
    // Refresh the published-boards catalog on the same 24h-gated cadence (US-862).
    import("./published-boards-service").then(({ publishedBoardsService }) =>
        publishedBoardsService.getPublishedBoards(),
    );
}, 5000);
```

### Step 6 — Board manifest fields (`src/renderer/editors/board/board-manifest.ts`)

Add three optional fields to `BoardManifest` (after `repository`, before the Custom Editor axis
comment or grouped with metadata):

```ts
    /** Board version (semver string). Metadata; the installed-version side of the
     *  update comparison against the catalog. Written/bumped by the board author. */
    version?: string;
    /** Whether the board is meaningful to open with no file / pin. Default is derived:
     *  true when the board has no fileMasks (tools/dashboards), false when it has masks
     *  (a file-bound board must opt in). See `isBoardStandalone`. */
    standalone?: boolean;
    /** Minimum Persephone version this board version requires (semver; absent = none).
     *  Per-version compatibility gate. */
    minAppVersion?: string;
```

Add resolver + derived group helper:

```ts
/** Derived usage group for a board, for UI grouping (EPIC-045). */
export type BoardUsageGroup = "file-viewer" | "file-editor" | "tool";

/** Whether a board is standalone (openable empty / pinnable). Default: no masks → true
 *  (tools/dashboards), masks → false unless the manifest opts in with `standalone: true`. */
export function isBoardStandalone(manifest: BoardManifest | null | undefined): boolean {
    const hasMasks = normalizeFileMasks(manifest?.fileMasks).length > 0;
    if (typeof manifest?.standalone === "boolean") return manifest.standalone;
    return !hasMasks;
}

/** Derived group: File viewer (masks, not standalone), File editor (masks + standalone),
 *  Tool / App (no masks). Used by hub/pin grouping. */
export function boardUsageGroup(manifest: BoardManifest | null | undefined): BoardUsageGroup {
    const hasMasks = normalizeFileMasks(manifest?.fileMasks).length > 0;
    if (!hasMasks) return "tool";
    return isBoardStandalone(manifest) ? "file-editor" : "tool"; // see note
}
```

> Note: `boardUsageGroup` must return `file-editor` for masks+standalone and `file-viewer` for
> masks+not-standalone. Corrected form:
> ```ts
> if (!hasMasks) return "tool";
> return isBoardStandalone(manifest) ? "file-editor" : "file-viewer";
> ```
> (The catalog entry carries `standalone` too, so a catalog `PublishedBoardInfo` can be grouped
> the same way without a downloaded manifest — later tasks add a `PublishedBoardInfo` overload
> or a small standalone-from-entry helper; US-862 only needs the manifest-based version.)

### Step 7 — Renderer catalog model (`src/renderer/api/published-boards.ts`, new)

`TGlobalState`-based singleton, mirroring `board-trust.ts`. Exposes reactive hooks and the
compatibility filter. Sketch:

```ts
import { TGlobalState } from "../core/state/state";
import { api } from "../../ipc/renderer/api";
import rendererEvents from "../../ipc/renderer/renderer-events";
import { EventEndpoint } from "../../ipc/api-types";
import { PublishedBoardInfo, PublishedBoardsCatalog } from "../../ipc/api-param-types";
import { compareVersions } from "../../shared/version-utils";
import { normalizeFileMasks, matchesFileMask } from "../editors/board/board-manifest";
import { app } from "./app";
import { fpBaseName } from "../core/utils/file-path"; // confirm exact export name

interface CatalogState {
    catalog: PublishedBoardsCatalog | null;
    loaded: boolean;
}

class PublishedBoards {
    private readonly state = new TGlobalState<CatalogState>({ catalog: null, loaded: false });
    private subscribed = false;

    /** Subscribe to main's change broadcast + pull the initial catalog. Idempotent. */
    async load(): Promise<void> {
        if (!this.subscribed) {
            this.subscribed = true;
            rendererEvents[EventEndpoint.ePublishedBoardsUpdated].subscribe((catalog) => {
                this.state.update((s) => { s.catalog = catalog; s.loaded = true; });
            });
        }
        const result = await api.getPublishedBoards();
        this.state.update((s) => { s.catalog = result.catalog; s.loaded = true; });
    }

    /** Force a fresh network check (bypasses the 24h gate). */
    async refresh(): Promise<void> {
        const result = await api.getPublishedBoards(true);
        this.state.update((s) => { s.catalog = result.catalog; s.loaded = true; });
    }

    /** All catalog boards (reactive). */
    useCatalog(): PublishedBoardInfo[] {
        return this.state.use((s) => s.catalog?.boards ?? []);
    }

    /** Whether a board version is compatible with the running app. */
    isCompatible(minAppVersion?: string): boolean {
        if (!minAppVersion) return true;
        // compatible iff app.version >= minAppVersion
        return compareVersions(app.version, minAppVersion) <= 0;
    }

    /** Compatible catalog boards whose masks match the given file name (basename). */
    useCatalogBoardsForFile(fileName: string): PublishedBoardInfo[] {
        return this.state.use((s) => {
            const boards = s.catalog?.boards ?? [];
            const base = fpBaseName(fileName);
            return boards.filter((b) => {
                if (!this.isCompatible(b.minAppVersion)) return false;
                const masks = normalizeFileMasks(b.fileMasks);
                return masks.some((m) => matchesFileMask(base, m));
            });
        });
    }
}

export const publishedBoards = new PublishedBoards();
```

Wire `publishedBoards.load()` into renderer bootstrap alongside the other service loads
(where `boardTrust.load()` / similar are called — confirm the bootstrap site; likely
`App.initServices()` in `src/renderer/api/app.ts` or the renderer entry). US-862 only needs the
model reachable and self-updating; no view consumes it yet (US-864/865/870 do).

> `isCompatible` direction check: `compareVersions(app.version, minAppVersion)` returns 1 when
> `minAppVersion > app.version` (incompatible), -1 or 0 when `app.version >= minAppVersion`
> (compatible). So compatible ⟺ result `<= 0`.

## Concerns / decisions

1. **`getPublishedBoards` controller import style** — use a dynamic `import()` in the handler
   (like the git/board handlers) so the service module (and its `net`/`electronStore` use) loads
   lazily. Consistent with the file; no measurable downside.
2. **Cache-equality via `JSON.stringify`** — payload is tiny (a handful of boards); a structural
   compare is unnecessary. Accepted.
3. **Renderer `fpBaseName` name** — the plan assumes a basename helper in
   `core/utils/file-path.ts`; confirm the exact export at implementation (could be `fpBaseName`
   / `getFileName`). `useCatalogBoardsForFile` receives a file **name** already in most callers,
   but normalizing to a basename is defensive.
4. **No download/verify/install here** — strictly US-863. This task must not add archive,
   install-registry, or trust code.
5. **Event vs. return on first load** — `load()` both subscribes and does one `getPublishedBoards()`
   pull, so the model is populated even if no change-broadcast fires (first run, or unchanged
   catalog). Correct and race-free (subscribe before the await).
6. **`standalone` grouping helper** — US-862 ships the manifest-based `isBoardStandalone` /
   `boardUsageGroup`; grouping a raw `PublishedBoardInfo` (pre-install) is a later-task concern
   (US-870). Keep the helper manifest-typed for now.

## Acceptance criteria

- `src/shared/version-utils.ts` exists with `parseVersion` + `compareVersions`;
  `version-service.ts` imports from it, no longer defines them locally, and still exposes
  `compareVersions` (named export + on `versionService`). App builds; `npm run lint` clean.
- `getPublishedBoards(force?)` is callable from the renderer via `api.getPublishedBoards(...)`
  and returns a `PublishedBoardsResult`. With the real repo empty, it returns
  `{ catalog: null | {…}, fromCache, fetchedAt }` without throwing.
- On startup (~5s), the catalog check runs once; within the 24h gate a non-forced call returns
  the cached catalog with `fromCache: true` and makes no network request; `force: true` bypasses
  the gate.
- When the fetched catalog differs from the cached one, `ePublishedBoardsUpdated` is broadcast
  to every window and the renderer `publishedBoards` model updates reactively; an unchanged
  catalog broadcasts nothing.
- A fetch failure (offline / non-200 / malformed JSON) is silent: the last-good cached catalog
  is still returned, no exception, no toast.
- Malformed board entries are dropped by validation; a catalog with the wrong `schemaVersion`
  yields `catalog: null` (treated as no catalog, cache untouched).
- Setting `PERSEPHONE_BOARDS_BRANCH=develop` fetches the manifest from the `develop` branch.
- `BoardManifest` has `version?` / `standalone?` / `minAppVersion?`; `isBoardStandalone` returns
  the documented defaults (no masks → true, masks → false unless opted in).
- `publishedBoards.useCatalogBoardsForFile("x.drawio")` returns only compatible, mask-matching
  boards; an incompatible `minAppVersion` excludes the board.
- No download / install / trust code is introduced (deferred to US-863+).

## Files changed

| File | Change |
|------|--------|
| `src/shared/version-utils.ts` | **New** — extracted `parseVersion` + `compareVersions`. |
| `src/main/version-service.ts` | Remove local copies; import + re-export from `version-utils`. |
| `src/ipc/api-param-types.ts` | **New DTOs** — `PublishedBoardArchive`, `PublishedBoardInfo`, `PublishedBoardsCatalog`, `PublishedBoardsResult`. |
| `src/main/published-boards-service.ts` | **New** — fetch / cache / gate / validate / broadcast. |
| `src/ipc/api-types.ts` | `Endpoint.getPublishedBoards` + `Api` sig; `EventEndpoint.ePublishedBoardsUpdated` + `EventApi`. |
| `src/ipc/renderer/api.ts` | `getPublishedBoards` method on `ApiCalls`. |
| `src/ipc/main/controller.ts` | `getPublishedBoards` handler + `bindEndpoint`. |
| `src/ipc/renderer/renderer-events.ts` | `ePublishedBoardsUpdated` `RendererEventObject`. |
| `src/main/main-setup.ts` | Kick `getPublishedBoards()` in the startup `setTimeout`. |
| `src/renderer/editors/board/board-manifest.ts` | `version?` / `standalone?` / `minAppVersion?` + `isBoardStandalone` + `boardUsageGroup`. |
| `src/renderer/api/published-boards.ts` | **New** — reactive catalog model + hooks + `isCompatible`. |

### Files that need NO changes (verified)

- `src/main/e-store.ts` — `get`/`set` already sufficient (JSON values).
- `src/main/open-windows.ts` — `send` broadcast already exists.
- `src/renderer/api/app.ts` `get version()` — already surfaces the app version (only add the
  `publishedBoards.load()` bootstrap call, at the same site as other service loads).
- No existing importer of `compareVersions` outside `version-service.ts` (grep-verified) — the
  extraction breaks nothing.
