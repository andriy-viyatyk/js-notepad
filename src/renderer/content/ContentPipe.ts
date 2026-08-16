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
 * Write flow: result → ... → transformer[1].write(data, readOriginal) → transformer[0].write(data, readOriginal) → provider.writeBinary()
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

        // Archive writes need the original ZIP bytes, but common transforms such as
        // DecryptTransformer do not. Build each pre-transform stage only on demand and
        // memoize it so a transformer that asks twice never re-reads the provider.
        let providerOriginal: Promise<Buffer> | undefined;
        const stageOriginals: Array<Promise<Buffer> | undefined> = [];
        const readProviderOriginal = (): Promise<Buffer> => {
            providerOriginal ??= (async () => {
                try {
                    const stat = await this.provider.stat?.();
                    return stat?.exists ? await this.provider.readBinary() : Buffer.alloc(0);
                } catch {
                    // Provider read failed — preserve the former empty-original fallback.
                    return Buffer.alloc(0);
                }
            })();
            return providerOriginal;
        };
        const readStageOriginal = (index: number): Promise<Buffer> => {
            stageOriginals[index] ??= (async () => {
                let current = await readProviderOriginal();
                for (let sourceIndex = 0; sourceIndex < index; sourceIndex++) {
                    current = await this._transformers[sourceIndex].read(current);
                }
                return current;
            })();
            return stageOriginals[index];
        };

        // Walk transformers in reverse, applying write().
        let result = data;
        for (let i = this._transformers.length - 1; i >= 0; i--) {
            const transformer = this._transformers[i];
            result = await transformer.write(result, () => readStageOriginal(i));
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
