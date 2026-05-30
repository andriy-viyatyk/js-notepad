import type { IContentPipe, IPipeDescriptor } from "../api/types/io.pipe";
import type { IProvider } from "../api/types/io.provider";
import type { ITransformer } from "../api/types/io.transformer";
import type { ISubscriptionObject } from "../api/types/events";
import { createProviderFromDescriptor } from "./registry";
import { decodeBuffer, encodeString } from "./encoding";

/**
 * ContentPipe — chains a provider with an ordered list of transformers.
 *
 * Read flow:  provider.readBinary() → transformer[0].read() → transformer[1].read() → ... → result
 * Write flow: result → ... → transformer[1].write(data, orig) → transformer[0].write(data, orig) → provider.writeBinary()
 */
export class ContentPipe implements IContentPipe {
    readonly provider: IProvider;
    private readonly _transformers: ITransformer[];
    private _encoding: string | undefined;

    constructor(provider: IProvider, transformers: ITransformer[] = [], encoding?: string) {
        this.provider = provider;
        this._transformers = [...transformers];
        this._encoding = encoding;
    }

    /** Detected content encoding after first readText(). Persisted in descriptor. */
    get encoding(): string | undefined {
        return this._encoding;
    }

    get transformers(): ReadonlyArray<ITransformer> {
        return this._transformers;
    }

    get writable(): boolean {
        return this.provider.writable
            && this._transformers.every(t => t.writable !== false);
    }

    get displayName(): string {
        return this.provider.displayName;
    }

    // ── Transformer manipulation (clone-and-try pattern) ────────────

    addTransformer(transformer: ITransformer, index?: number): void {
        if (index !== undefined && index >= 0 && index <= this._transformers.length) {
            this._transformers.splice(index, 0, transformer);
        } else {
            this._transformers.push(transformer);
        }
    }

    removeTransformer(type: string): ITransformer | undefined {
        const index = this._transformers.findIndex((t) => t.type === type);
        if (index >= 0) {
            return this._transformers.splice(index, 1)[0];
        }
        return undefined;
    }

    // ── Read ────────────────────────────────────────────────────────

    async readBinary(): Promise<Buffer> {
        let data = await this.provider.readBinary();
        for (const transformer of this._transformers) {
            data = await transformer.read(data);
        }
        return data;
    }

    async readText(): Promise<string> {
        const buffer = await this.readBinary();
        const decoded = decodeBuffer(buffer, this._encoding);
        this._encoding = decoded.encoding;
        return decoded.content;
    }

    // ── Write ───────────────────────────────────────────────────────

    async writeBinary(data: Buffer): Promise<void> {
        if (!this.writable) {
            throw new Error("Cannot write: pipe is read-only");
        }
        await this._writeBinary(data);
    }

    async writeText(content: string): Promise<void> {
        if (!this.writable) {
            throw new Error("Cannot write: pipe is read-only");
        }
        const buffer = encodeString(content, this._encoding);
        await this._writeBinary(buffer);
    }

    private _writeBinary = async (data: Buffer): Promise<void> => {
        if (!this.provider.writeBinary) return;

        if (this._transformers.length === 0) {
            await this.provider.writeBinary(data);
            return;
        }

        // Read original bytes at each transformer stage (needed by ArchiveTransformer.write
        // to rebuild the archive). If provider has no content yet (e.g., new cache file),
        // pass empty buffers — transformers that don't need originals (like DecryptTransformer)
        // will ignore them.
        let originals: Buffer[] | null = null;
        try {
            const stat = await this.provider.stat?.();
            if (stat?.exists) {
                originals = [];
                let current = await this.provider.readBinary();
                for (const transformer of this._transformers) {
                    originals.push(current);
                    current = await transformer.read(current);
                }
            }
        } catch {
            // Provider read failed — proceed without originals
        }

        // Walk transformers in reverse, applying write().
        let result = data;
        for (let i = this._transformers.length - 1; i >= 0; i--) {
            const transformer = this._transformers[i];
            const original = originals ? originals[i] : Buffer.alloc(0);
            result = await transformer.write(result, original);
        }

        await this.provider.writeBinary(result);
    };

    // ── Watch ───────────────────────────────────────────────────────

    get watch(): ((callback: (event: string) => void) => ISubscriptionObject) | undefined {
        if (!this.provider.watch) return undefined;
        return (callback) => this.provider.watch(callback);
    }

    // ── Clone ───────────────────────────────────────────────────────

    cloneWithProvider(provider: IProvider): IContentPipe {
        const transformers = this._transformers.map((t) => t.clone());
        return new ContentPipe(provider, transformers, this._encoding);
    }

    clone(): IContentPipe {
        const provider = createProviderFromDescriptor(this.provider.toDescriptor());
        const transformers = this._transformers.map((t) => t.clone());
        return new ContentPipe(provider, transformers, this._encoding);
    }

    // ── Serialization ───────────────────────────────────────────────

    toDescriptor(): IPipeDescriptor {
        return {
            provider: this.provider.toDescriptor(),
            transformers: this._transformers
                .filter((t) => t.persistent)
                .map((t) => t.toDescriptor()),
            encoding: this._encoding,
        };
    }

    // ── Dispose ─────────────────────────────────────────────────────

    dispose(): void {
        this.provider.dispose?.();
    }
}

/** Create a content pipe from a provider and optional transformers. */
export function createPipe(provider: IProvider, ...transformers: ITransformer[]): IContentPipe {
    return new ContentPipe(provider, transformers);
}
