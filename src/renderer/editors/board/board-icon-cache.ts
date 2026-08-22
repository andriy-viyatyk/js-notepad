import { useEffect, useState } from "react";
import { fs } from "../../api/fs";
import { fpJoin } from "../../core/utils/file-path";

/**
 * Per-board custom icon resolution (EPIC-034 / US-744) — mirrors `favicon-cache.ts`.
 *
 * A board declares its icon by dropping `icon.svg` / `icon.png` / `icon.ico` (first
 * match wins, SVG preferred) in its folder. This module probes for that file and
 * caches the absolute path so the three icon surfaces (tab, main-editor tile, sidebar
 * row) render it synchronously via a plain `<img src={path}>` — the same on-disk-image
 * pattern the favicon cache uses. Nothing here is persisted; the Board editor's state
 * keeps only board names.
 */

// boardRoot → absolute icon path. "" = known miss (no icon file); absent = not probed.
const cache = new Map<string, string>();
// boardRoot → in-flight probe, so concurrent callers share one filesystem walk.
const pending = new Map<string, Promise<string | null>>();
// Components subscribed to "any board icon (re)resolved" — re-render on change.
const listeners = new Set<() => void>();

// Probe order — SVG first (crispest at every size), then PNG, then ICO.
const ICON_FILES = ["icon.svg", "icon.png", "icon.ico"];

function notify() {
    for (const cb of listeners) {
        try { cb(); } catch { /* ignore */ }
    }
}

/** Memory-only lookup. Returns the cached icon path, or null if unknown / no icon. */
export function getBoardIconPathSync(boardRoot: string | undefined): string | null {
    if (!boardRoot) return null;
    const cached = cache.get(boardRoot);
    return cached ? cached : null; // skip "" (known miss) and undefined (not probed)
}

/** Probe the board folder for `icon.{svg,png,ico}` (first match wins) and cache the
 *  result. Concurrent calls for the same root share one probe. */
export async function resolveBoardIcon(boardRoot: string): Promise<string | null> {
    if (!boardRoot) return null;
    const cached = cache.get(boardRoot);
    if (cached !== undefined) return cached || null;
    const inflight = pending.get(boardRoot);
    if (inflight) return inflight;

    const probe = (async () => {
        let found = "";
        for (const name of ICON_FILES) {
            const p = fpJoin(boardRoot, name);
            if (await fs.exists(p)) { found = p; break; }
        }
        cache.set(boardRoot, found);
        pending.delete(boardRoot);
        notify();
        return found || null;
    })();
    pending.set(boardRoot, probe);
    return probe;
}

/** Drop the cached result and re-probe (icon added / changed / removed on disk).
 *  Re-renders subscribers immediately (fallback glyph until the re-probe lands). */
export function invalidateBoardIcon(boardRoot: string): void {
    if (!boardRoot) return;
    cache.delete(boardRoot);
    pending.delete(boardRoot);
    notify();
    void resolveBoardIcon(boardRoot);
}

/** Re-render the calling component whenever any board icon resolves / invalidates,
 *  and kick a probe for this root if it hasn't been probed yet. */
export function useBoardIcon(boardRoot: string | undefined): void {
    const [, force] = useState(0);
    useEffect(() => {
        const cb = () => force((v) => v + 1);
        listeners.add(cb);
        return () => { listeners.delete(cb); };
    }, []);
    useEffect(() => {
        if (boardRoot && !cache.has(boardRoot)) void resolveBoardIcon(boardRoot);
    }, [boardRoot]);
}

/** Subscribe non-React owners to board icon probe/invalidation notifications. */
export function subscribeBoardIconChanges(callback: () => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
}
