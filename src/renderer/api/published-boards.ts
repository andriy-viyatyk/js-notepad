/**
 * Renderer-side reactive model of the published-boards catalog (EPIC-045 / US-862).
 * Mirrors `board-trust.ts`: a `TGlobalState` singleton with `use()` hooks for views.
 * Subscribes to main's `ePublishedBoardsUpdated` broadcast and pulls the initial catalog
 * via `getPublishedBoards`. Compatibility (`minAppVersion` vs the running app) is checked
 * with the shared `compareVersions`.
 *
 * No download / install here — US-863+ own that. This model only surfaces catalog data.
 */
import { TGlobalState } from "../core/state/state";
import { api } from "../../ipc/renderer/api";
import rendererEvents from "../../ipc/renderer/renderer-events";
import { EventEndpoint } from "../../ipc/api-types";
import { PublishedBoardInfo, PublishedBoardsCatalog, PublishedBoardVersions } from "../../ipc/api-param-types";
import { compareVersions } from "../../shared/version-utils";
import { normalizeFileMasks, matchesFileMask } from "../editors/board/board-manifest";
import { fpBasename } from "../core/utils/file-path";

interface CatalogState {
    catalog: PublishedBoardsCatalog | null;
    loaded: boolean;
}

class PublishedBoards {
    private readonly state = new TGlobalState<CatalogState>({ catalog: null, loaded: false });
    private subscribed = false;
    /** Running app version, cached at load() so the sync compatibility check needs no await
     *  (and to avoid an import cycle with `app`). */
    private appVersion = "";

    /** Subscribe to main's change broadcast + pull the initial catalog. Idempotent. */
    async load(): Promise<void> {
        if (!this.subscribed) {
            this.subscribed = true;
            rendererEvents[EventEndpoint.ePublishedBoardsUpdated].subscribe((catalog) => {
                this.state.update((s) => {
                    s.catalog = catalog;
                    s.loaded = true;
                });
            });
        }
        if (!this.appVersion) {
            this.appVersion = await api.getAppVersion();
        }
        const result = await api.getPublishedBoards();
        this.state.update((s) => {
            s.catalog = result.catalog;
            s.loaded = true;
        });
    }

    /** A board's full version history (on demand — no caching; the properties view calls this on
     *  open). Returns null on network/parse failure. */
    async getVersions(id: string): Promise<PublishedBoardVersions | null> {
        return api.getBoardVersions(id);
    }

    /** Force a fresh network check (bypasses the 24h gate). */
    async refresh(): Promise<void> {
        const result = await api.getPublishedBoards(true);
        this.state.update((s) => {
            s.catalog = result.catalog;
            s.loaded = true;
        });
    }

    /** All catalog boards (reactive). */
    useCatalog(): PublishedBoardInfo[] {
        return this.state.use((s) => s.catalog?.boards ?? []);
    }

    /** All catalog boards (sync, non-reactive). */
    getCatalog(): PublishedBoardInfo[] {
        return this.state.get().catalog?.boards ?? [];
    }

    /**
     * Whether a board version is compatible with the running app. `compareVersions(app,
     * min)` returns 1 when `min > app` (incompatible); compatible ⟺ result <= 0.
     */
    isCompatible(minAppVersion?: string): boolean {
        if (!minAppVersion) return true;
        if (!this.appVersion) return true; // not yet loaded — don't hide boards
        return compareVersions(this.appVersion, minAppVersion) <= 0;
    }

    /** Compatible catalog boards whose masks match the given file name (sync, non-reactive).
     *  Sync counterpart of `useCatalogBoardsForFile` for model code (e.g. the Board Info
     *  editor) that computes matches outside a React render. */
    catalogBoardsForFile(fileName: string): PublishedBoardInfo[] {
        const base = fpBasename(fileName);
        return (this.state.get().catalog?.boards ?? []).filter((b) => {
            if (!this.isCompatible(b.minAppVersion)) return false;
            return normalizeFileMasks(b.fileMasks).some((m) => matchesFileMask(base, m));
        });
    }

    /** Compatible catalog boards whose masks match the given file name (basename). */
    useCatalogBoardsForFile(fileName: string): PublishedBoardInfo[] {
        const base = fpBasename(fileName);
        return this.state.use((s) => {
            const boards = s.catalog?.boards ?? [];
            return boards.filter((b) => {
                if (!this.isCompatible(b.minAppVersion)) return false;
                const masks = normalizeFileMasks(b.fileMasks);
                return masks.some((m) => matchesFileMask(base, m));
            });
        });
    }
}

export const publishedBoards = new PublishedBoards();
