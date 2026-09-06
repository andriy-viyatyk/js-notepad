/**
 * Renderer-side reactive model of the published-boards catalog (EPIC-045 / US-862).
 * Mirrors `board-trust.ts`: a `TGlobalState` singleton with subscriptions for views.
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
import {
    normalizeFileMasks,
    normalizeFolderMasks,
    matchesBoardMasks,
} from "../editors/board/board-manifest";

interface CatalogState {
    catalog: PublishedBoardsCatalog | null;
    loaded: boolean;
}

/** Does an UNINSTALLED catalog board claim this file? Same predicate as a trusted board's
 *  (`matchesBoardMasks`), but over the catalog entry's raw manifest-copied masks — the catalog
 *  carries them unnormalized, so normalize per call (the lists are tiny and the call sites are
 *  filters over a small catalog). */
function matchesCatalogMasks(board: PublishedBoardInfo, fileName: string): boolean {
    return matchesBoardMasks(
        fileName,
        normalizeFileMasks(board.fileMasks),
        normalizeFolderMasks(board.folderMasks),
    );
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
            // The published-board catalog singleton owns this process-lifetime IPC
            // listener; individual catalog views only consume its state.
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

    /** All catalog boards (sync, non-reactive). */
    getCatalog(): PublishedBoardInfo[] {
        return this.selectCatalogBoards(this.state.get());
    }

    /** Whether the in-memory catalog has completed a load or received an update. */
    isLoaded(): boolean {
        return this.state.get().loaded;
    }

    subscribeCatalog(listener: () => void): () => void {
        return this.state.subscribe(listener, this.selectCatalogBoards);
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
     *  Used by model code (e.g. the Board Info editor) that computes matches directly. */
    catalogBoardsForFile(fileName: string): PublishedBoardInfo[] {
        return this.selectCatalogBoardsForFile(this.state.get(), fileName);
    }

    subscribeCatalogBoardsForFile(
        fileName: string,
        listener: () => void,
    ): () => void {
        return this.state.subscribe(
            listener,
            (state) => this.selectCatalogBoardsForFile(state, fileName),
        );
    }

    private selectCatalogBoardsForFile(
        state: CatalogState,
        fileName: string,
    ): PublishedBoardInfo[] {
        const boards = state.catalog?.boards ?? [];
        return boards.filter((board) => {
            if (!this.isCompatible(board.minAppVersion)) return false;
            return matchesCatalogMasks(board, fileName);
        });
    }

    private selectCatalogBoards(state: CatalogState): PublishedBoardInfo[] {
        return state.catalog?.boards ?? [];
    }
}

export const publishedBoards = new PublishedBoards();
