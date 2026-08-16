/** Serializable transformer descriptor for persistence. */
export interface ITransformerDescriptor {
    /** Transformer type (e.g., "archive", "gunzip", "base64"). */
    type: string;
    /** Transformer-specific configuration (e.g., { entryPath: "data/report.csv" }). */
    config: Record<string, unknown>;
}

/**
 * ITransformer — knows *how to process* bytes.
 *
 * Transformers sit between provider and editor in the content pipe.
 * They transform bytes on read (source → editor) and optionally
 * reverse-transform on write (editor → source).
 */
export interface ITransformer {
    /** Transformer type identifier (e.g., "archive", "decrypt", "gunzip"). */
    readonly type: string;
    /** Configuration used to construct this transformer. */
    readonly config: Record<string, unknown>;
    /** Whether this transformer should be included in saved pipe descriptor.
     *  false for DecryptTransformer (contains password — must not persist to disk). */
    readonly persistent: boolean;
    /** Whether this transformer supports write (reverse-transform).
     *  Undefined or true means writable. False for read-only formats (RAR, 7z, TAR). */
    readonly writable?: boolean;
    /** Transform bytes on read (source → editor). */
    read(data: Buffer): Promise<Buffer>;
    /** Reverse-transform bytes on write (editor → source).
     *  `readOriginal` lazily returns the bytes that entered this transformer on read.
     *  Most transforms do not need it; ArchiveTransformer uses it to rebuild a ZIP. */
    write(data: Buffer, readOriginal: () => Promise<Buffer>): Promise<Buffer>;
    /** Create a deep copy of this transformer (avoids descriptor round-trip). */
    clone(): ITransformer;
    /** Serialize to descriptor for persistence. */
    toDescriptor(): ITransformerDescriptor;
}
