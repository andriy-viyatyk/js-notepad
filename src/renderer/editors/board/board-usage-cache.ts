import { readBoardManifest, boardUsageGroup, type BoardUsageGroup } from "./board-manifest";

/**
 * Per-board usage-group resolution (EPIC-045 / US-870) — mirrors `board-icon-cache.ts`.
 *
 * A board's usage group (`file-viewer` / `file-editor` / `tool`) is derived from its
 * `board-manifest.json` (masks + `standalone`). Pin surfaces gate on *standalone* — only
 * `file-editor` / `tool` boards are pinnable, `file-viewer` boards are not — but the pin
 * button renders synchronously from a board root alone, so this module probes the manifest
 * once and caches the group, letting `useBoardStandalone` return synchronously (`undefined`
 * until the first probe lands) and re-render subscribers when it resolves.
 *
 * Nothing here is persisted; the cache is memory-only for the session.
 */

// boardRoot → resolved usage group. absent = not probed yet.
const cache = new Map<string, BoardUsageGroup>();
// boardRoot → in-flight probe, so concurrent callers share one manifest read.
const pending = new Map<string, Promise<BoardUsageGroup | null>>();
// Components subscribed to "any board usage (re)resolved" — re-render on change.
const listeners = new Set<() => void>();

function notify() {
    for (const cb of listeners) {
        try { cb(); } catch { /* ignore */ }
    }
}

/** Memory-only lookup. Returns the cached usage group, or undefined if not yet probed. */
export function getBoardUsageSync(boardRoot: string | undefined): BoardUsageGroup | undefined {
    if (!boardRoot) return undefined;
    return cache.get(boardRoot);
}

/** Read the board manifest, derive + cache its usage group. Concurrent calls for the same
 *  root share one read. Returns null if the folder has no readable manifest. */
export async function resolveBoardUsage(boardRoot: string): Promise<BoardUsageGroup | null> {
    if (!boardRoot) return null;
    const cached = cache.get(boardRoot);
    if (cached !== undefined) return cached;
    const inflight = pending.get(boardRoot);
    if (inflight) return inflight;

    const probe = (async () => {
        const manifest = await readBoardManifest(boardRoot);
        const group = boardUsageGroup(manifest);
        cache.set(boardRoot, group);
        pending.delete(boardRoot);
        notify();
        return group;
    })();
    pending.set(boardRoot, probe);
    return probe;
}

/** Drop the cached result and re-probe (manifest edited — standalone/masks may have changed).
 *  Re-renders subscribers immediately. */
export function invalidateBoardUsage(boardRoot: string): void {
    if (!boardRoot) return;
    cache.delete(boardRoot);
    pending.delete(boardRoot);
    notify();
    void resolveBoardUsage(boardRoot);
}
