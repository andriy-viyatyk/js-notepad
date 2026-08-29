import type { IProvider, IProviderDescriptor } from "./io.provider";
import type { ITransformer, ITransformerDescriptor } from "./io.transformer";

/** Serializable pipe descriptor for persistence (stored in IEditorState). */
export interface IPipeDescriptor {
    /** Provider descriptor. */
    provider: IProviderDescriptor;
    /** Transformer descriptors (ordered). Only persistent transformers are included. */
    transformers: ITransformerDescriptor[];
    /** Detected content encoding (e.g., "utf-8", "utf-16le", "windows-1251"). Persisted for write-back. */
    encoding?: string;
}

/**
 * IContentPipe — composed view of provider + transformers.
 *
 * The pipe is the primary abstraction editors work with.
 * It handles reading (provider → transformers → editor) and
 * writing (editor → reverse-transformers → provider).
 *
 * Pipes are immutable-by-convention: use clone() + addTransformer()
 * on the clone rather than mutating the active pipe (clone-and-try pattern).
 */
export interface IContentPipe {
    /** The root provider (data source). */
    readonly provider: IProvider;
    /** Ordered list of transformers applied after reading. */
    readonly transformers: ReadonlyArray<ITransformer>;
    /** Insert a transformer at a specific position (default: end).
     *  Typically used on a cloned pipe, not the active one (clone-and-try pattern). */
    addTransformer(transformer: ITransformer, index?: number): void;
    /** Remove a transformer by type. Returns the removed transformer or undefined.
     *  Typically used on a cloned pipe, not the active one (clone-and-try pattern). */
    removeTransformer(type: string): ITransformer | undefined;
    /** Serialize pipe to a descriptor (only includes persistent transformers). */
    toDescriptor(): IPipeDescriptor;
    /** Read binary content — provider.readBinary() piped through all transformers. */
    readBinary(): Promise<Buffer>;
    /** Read as text — readBinary() then decode using detected encoding (auto-detected on first read, defaults to UTF-8). */
    readText(): Promise<string>;
    /** Write binary content — reverse-piped through transformers back to provider.
     *  Throws if `!writable`. Check `writable` before calling. */
    writeBinary(data: Buffer): Promise<void>;
    /** Write text — encode using detected encoding, then writeBinary().
     *  Throws if `!writable`. Check `writable` before calling. */
    writeText(content: string): Promise<void>;
    /** Detected content encoding after first readText() (e.g., "utf-8", "utf-16le"). */
    readonly encoding: string | undefined;
    /** Whether the full pipe supports writing (provider writable + all transformers reversible). */
    readonly writable: boolean;
    /** Display name for UI (delegated to provider). */
    readonly displayName: string;
    /** Watch for external changes (delegated to provider). */
    watch?(callback: (event: string) => void): () => void;
    /** Clone this pipe with a different provider, keeping all transformers. */
    cloneWithProvider(provider: IProvider): IContentPipe;
    /** Clone this pipe with same provider and transformers (deep copy). */
    clone(): IContentPipe;
    /** Dispose the provider. */
    dispose(): void;
}
