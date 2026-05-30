import type { IProvider } from "./io.provider";
import type { ITransformer } from "./io.transformer";
import type { IContentPipe } from "./io.pipe";
import type { ILinkData } from "./io.link-data";
import type { ILink } from "./io.tree";

/**
 * Provider constructor for local binary files.
 * @example
 * const provider = new io.FileProvider("C:\\data\\file.txt");
 */
export interface IFileProviderConstructor {
    new(filePath: string): IProvider;
}

/**
 * Provider constructor for HTTP/HTTPS URLs.
 * @example
 * const provider = new io.HttpProvider("https://api.com/data.json", {
 *     method: "POST",
 *     headers: { "Authorization": "Bearer token" },
 *     body: JSON.stringify({ key: "value" }),
 * });
 */
export interface IHttpProviderConstructor {
    new(url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }): IProvider;
}

/**
 * Transformer constructor for archive entry extraction.
 * Supports ZIP, RAR, 7z, TAR, and other formats via libarchive-wasm (read).
 * Write operations (save back) are supported only for ZIP-based archives.
 * @example
 * const transformer = new io.ArchiveTransformer("C:\\data.zip", "data/report.csv");
 */
export interface IArchiveTransformerConstructor {
    new(archivePath: string, entryPath: string): ITransformer;
}

/**
 * Transformer constructor for AES-GCM decryption/encryption.
 * @example
 * const transformer = new io.DecryptTransformer(password);
 */
export interface IDecryptTransformerConstructor {
    new(password: string): ITransformer;
}

/**
 * The `io` global namespace — content pipe building and link pipeline helpers.
 *
 * Available in scripts alongside `app`, `page`, and `ui`.
 *
 * **Opening links (ILinkData pipeline):**
 * - Use `io.createLinkData(href)` to open any link through the full pipeline (Layer 1 → 2 → 3)
 * - Use `io.linkToLinkData(link)` to open an ILink with all fields preserved
 * - Use `io.createPipe()` with providers and transformers to build custom content pipes
 *
 * @example
 * // Read a file from inside a ZIP archive
 * const pipe = io.createPipe(
 *     new io.FileProvider("C:\\docs.zip"),
 *     new io.ArchiveTransformer("C:\\docs.zip", "readme.md"),
 * );
 * const text = await pipe.readText();
 *
 * @example
 * // Open a URL through the link pipeline
 * await app.events.openRawLink.sendAsync(
 *     io.createLinkData("https://api.com/data.json")
 * );
 *
 * @example
 * // Open with options
 * await app.events.openRawLink.sendAsync(
 *     io.createLinkData("https://example.com", { target: "browser", browserMode: "incognito" })
 * );
 */
export interface IIoNamespace {
    /** Provider for local binary files. */
    readonly FileProvider: IFileProviderConstructor;
    /** Provider for HTTP/HTTPS URLs (read-only). */
    readonly HttpProvider: IHttpProviderConstructor;
    /** Transformer for archive entry extraction/replacement (ZIP write, multi-format read). */
    readonly ArchiveTransformer: IArchiveTransformerConstructor;
    /** Transformer for AES-GCM decryption/encryption (non-persistent). */
    readonly DecryptTransformer: IDecryptTransformerConstructor;
    /**
     * Create an ILinkData from a raw link string.
     * @example
     * await app.events.openRawLink.sendAsync(io.createLinkData("C:\\file.txt"));
     * await app.events.openRawLink.sendAsync(io.createLinkData("https://example.com", {
     *     target: "browser",
     *     browserMode: "incognito",
     * }));
     */
    createLinkData(href: string, options?: Partial<Omit<ILinkData, "href" | "handled">>): ILinkData;
    /**
     * Convert an ILink to ILinkData — preserves all ILink fields through the pipeline.
     * @example
     * await app.events.openRawLink.sendAsync(io.linkToLinkData(link));
     */
    linkToLinkData(link: ILink): ILinkData;
    /** Create a content pipe from a provider and optional transformers. */
    createPipe(provider: IProvider, ...transformers: ITransformer[]): IContentPipe;
}
