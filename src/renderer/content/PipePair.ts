import type { IContentPipe } from "../api/types/io.pipe";
import { ContentPipe } from "./ContentPipe";
import { CacheFileProvider } from "./providers/CacheFileProvider";

/**
 * Owns a TextFileModel's source pipe and its matching autosave cache pipe.
 *
 * The cache pipe clones the source transformer chain, which is essential for
 * encrypted files: autosave must not write plaintext directly to the cache.
 */
export class PipePair {
    private _primary: IContentPipe | null = null;
    private _cache: IContentPipe | null = null;

    constructor(private readonly getCachePageId: () => string) {}

    get primary(): IContentPipe | null {
        return this._primary;
    }

    get cache(): IContentPipe | null {
        return this._cache;
    }

    /**
     * Atomically replace the primary pipe and its cache clone. The new cache is
     * built before the old pair is released, so a failed clone leaves the active
     * pair untouched.
     */
    setPrimary(primary: IContentPipe | null): void {
        const cache = primary
            ? primary.cloneWithProvider(new CacheFileProvider(this.getCachePageId()))
            : null;
        this.replace(primary, cache);
    }

    /** Ensure an untitled modified page still has a cache pipe to restore from. */
    ensureCache(): IContentPipe {
        if (!this._cache) {
            this._cache = new ContentPipe(new CacheFileProvider(this.getCachePageId()));
        }
        return this._cache;
    }

    dispose(): void {
        this.replace(null, null);
    }

    private replace(primary: IContentPipe | null, cache: IContentPipe | null): void {
        const oldPrimary = this._primary;
        const oldCache = this._cache;
        this._primary = primary;
        this._cache = cache;
        oldCache?.dispose();
        if (oldPrimary && oldPrimary !== primary) oldPrimary.dispose();
    }
}
