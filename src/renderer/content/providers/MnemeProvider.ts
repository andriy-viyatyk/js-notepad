import type { IProvider, IProviderDescriptor } from "../../api/types/io.provider";
import { mnemeConnection } from "../../api/mneme-connection";

/**
 * MnemeProvider — reads/writes Mneme wiki documents over MCP.
 *
 * Reads the whole document (including YAML frontmatter) via `resources/read`.
 * Writes go through `write` for text/markdown (indexed) and `upload`
 * for binary attachments (base64, not indexed) — `writeBinary` picks by content.
 * Live-refresh rides the shared connection's resource subscriptions
 * (`mnemeConnection`). `path` is the scheme-less `{root}/{path}` address; the
 * resource URI is `mneme://{path}`.
 *
 * Self-echo is intentionally NOT suppressed — like `FileProvider`, a write
 * triggers the watcher and the editor re-reads identical content (a no-op).
 */
export class MnemeProvider implements IProvider {
    readonly type = "mneme";
    readonly restorable = true;
    readonly writable = true;
    readonly sourceUrl: string;
    readonly displayName: string;

    constructor(private readonly path: string) {
        this.sourceUrl = `mneme://${path}`;
        this.displayName = path;
    }

    private get uri(): string {
        return `mneme://${this.path}`;
    }

    async readBinary(): Promise<Buffer> {
        const client = mnemeConnection.getClient();
        if (!client) throw new Error("Mneme is not connected");
        const result = await client.readResource({ uri: this.uri });
        const first = result.contents?.[0] as { text?: string; blob?: string } | undefined;
        if (first?.text !== undefined) {
            return Buffer.from(first.text, "utf8");
        }
        if (first?.blob !== undefined) {
            return Buffer.from(first.blob, "base64");
        }
        return Buffer.from("");
    }

    async writeBinary(data: Buffer): Promise<void> {
        const client = mnemeConnection.getClient();
        if (!client) throw new Error("Mneme is not connected");
        if (looksBinary(data)) {
            // Binary attachment (image/PDF/diagram) → upload (base64; not indexed).
            await client.callTool({
                name: "upload",
                arguments: { path: this.path, contentBase64: data.toString("base64") },
            });
        } else {
            // Text/markdown → write (whole-file UTF-8; indexed synchronously).
            await client.callTool({
                name: "write",
                arguments: { path: this.path, content: data.toString("utf8") },
            });
        }
    }

    watch(callback: (event: string) => void): () => void {
        return mnemeConnection.subscribe(this.uri, () => callback("change"));
    }

    toDescriptor(): IProviderDescriptor {
        return {
            type: "mneme",
            config: { path: this.path },
        };
    }
}

/** A NUL byte or invalid UTF-8 ⇒ treat as binary (mirrors the Rust `looks_binary`). */
function looksBinary(data: Buffer): boolean {
    if (data.includes(0)) return true;
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(data);
        return false;
    } catch {
        return true;
    }
}
