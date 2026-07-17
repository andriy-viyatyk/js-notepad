import { net } from "electron";
import { electronStore } from "./e-store";
import { openWindows } from "./open-windows";
import { EventEndpoint } from "../ipc/api-types";
import {
    PublishedBoardInfo,
    PublishedBoardsCatalog,
    PublishedBoardsResult,
    PublishedBoardVersion,
    PublishedBoardVersions,
} from "../ipc/api-param-types";

/**
 * Published Boards catalog service (EPIC-045 / US-862). Mirrors `version-service.ts`:
 * `net.fetch` the raw `boards-manifest.json`, gate on a 24h `electronStore` timestamp
 * (`force` bypasses), cache the last-good catalog so the UI works offline, and broadcast
 * `ePublishedBoardsUpdated` when the content changes. No download / install here — the
 * install engine is US-863+.
 */

const CATALOG_SCHEMA_VERSION = 1;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const STORE_KEYS = {
    lastCheckTime: "published-boards-lastTime",
    catalog: "published-boards-catalog", // cached last-good PublishedBoardsCatalog
};

/** Dev-only source override: PERSEPHONE_BOARDS_BRANCH switches the raw base off `main`
 *  (e.g. `develop`) so the whole flow is testable before anything ships to `main`. */
function boardsRepoRawBase(): string {
    const branch = process.env.PERSEPHONE_BOARDS_BRANCH?.trim() || "main";
    return `https://raw.githubusercontent.com/andriy-viyatyk/persephone-boards/${branch}`;
}

function manifestUrl(): string {
    return `${boardsRepoRawBase()}/boards-manifest.json`;
}

/** Per-board version history lives in `boards/<id>/versions-manifest.json`, fetched on demand. */
function versionsUrl(id: string): string {
    return `${boardsRepoRawBase()}/boards/${encodeURIComponent(id)}/versions-manifest.json`;
}

/**
 * A board `id` becomes a folder name (`<userData>/data/boards/<id>`) and is interpolated into
 * install/staging paths, so it must never carry a path separator or `..`. Require it to start and
 * end with an alphanumeric, allowing `.`/`-`/`_` only in between — this rejects `.`, `..`, leading
 * dots, and any `/`/`\`, closing the catalog-driven path-traversal vector at the point of trust
 * (a malformed/hostile catalog entry is simply dropped, so it never reaches the install engine).
 */
function isSafeBoardId(id: string): boolean {
    return /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(id);
}

function validateBoard(entry: unknown): PublishedBoardInfo | null {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    const archive = e.archive as Record<string, unknown> | undefined;
    if (
        typeof e.id !== "string" || !isSafeBoardId(e.id) ||
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
        archive: {
            url: archive.url,
            size: archive.size,
            sha256: archive.sha256,
        },
    };
}

function validateVersion(entry: unknown): PublishedBoardVersion | null {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    const archive = e.archive as Record<string, unknown> | undefined;
    if (
        typeof e.version !== "string" || !e.version ||
        !archive ||
        typeof archive.url !== "string" ||
        typeof archive.sha256 !== "string" ||
        typeof archive.size !== "number"
    ) {
        return null;
    }
    return {
        version: e.version,
        date: typeof e.date === "string" ? e.date : undefined,
        notes: typeof e.notes === "string" ? e.notes : undefined,
        minAppVersion: typeof e.minAppVersion === "string" ? e.minAppVersion : undefined,
        archive: {
            url: archive.url,
            size: archive.size,
            sha256: archive.sha256,
        },
    };
}

function validateVersions(data: unknown): PublishedBoardVersions | null {
    if (!data || typeof data !== "object") return null;
    const raw = data as { schemaVersion?: unknown; id?: unknown; versions?: unknown };
    if (raw.schemaVersion !== CATALOG_SCHEMA_VERSION) return null;
    if (typeof raw.id !== "string" || !isSafeBoardId(raw.id)) return null;
    if (!Array.isArray(raw.versions)) return null;
    const versions = raw.versions
        .map(validateVersion)
        .filter((v): v is PublishedBoardVersion => v !== null);
    return { schemaVersion: CATALOG_SCHEMA_VERSION, id: raw.id, versions };
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

/** Structural equality via JSON — the payload is tiny (a handful of boards). */
function catalogsEqual(
    a: PublishedBoardsCatalog | null,
    b: PublishedBoardsCatalog | null,
): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
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
        return {
            catalog: cached,
            fetchedAt: lastCheckTime,
            fromCache: true,
            error: "fetch-failed",
        };
    }

    const now = Date.now();
    electronStore.set(STORE_KEYS.lastCheckTime, now);

    if (!catalogsEqual(cached, fetched)) {
        electronStore.set(STORE_KEYS.catalog, fetched);
        openWindows.send(EventEndpoint.ePublishedBoardsUpdated, fetched);
    }

    return { catalog: fetched, fetchedAt: now, fromCache: false };
}

/** On-demand fetch of a board's full version history. No cache gate — the file is tiny and only
 *  requested when the Board Info properties screen opens. Silent null on network/parse failure
 *  (the view offers a Retry). */
export async function getBoardVersions(id: string): Promise<PublishedBoardVersions | null> {
    try {
        const response = await net.fetch(versionsUrl(id), {
            headers: { "User-Agent": "persephone" },
        });
        if (!response.ok) return null;
        return validateVersions(await response.json());
    } catch {
        return null;
    }
}

export const publishedBoardsService = { getPublishedBoards, getBoardVersions };
