// ============================================================================
// McpConnectionManager — wraps @modelcontextprotocol/sdk Client
// ============================================================================

export type McpTransportType = "http" | "stdio";

export interface McpConnectionConfig {
    name: string;
    transport: McpTransportType;
    // HTTP
    url?: string;
    // Stdio
    command?: string;
    args?: string[];
    env?: Record<string, string>;
}

export type McpConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface McpServerInfo {
    name: string;
    title: string;
    version: string;
    description: string;
    websiteUrl: string;
    instructions: string;
    capabilities: {
        tools?: boolean;
        resources?: boolean;
        prompts?: boolean;
    };
}

// Lazy-loaded SDK modules via require() to bypass Vite bundling.
// Electron's nodeIntegration:true provides real require() — Node.js resolves
// the SDK from node_modules at runtime, so node:process and other builtins work.
let ClientClass: any;
let StreamableHTTPClientTransportClass: any;
let StdioClientTransportClass: any;

function loadSdk(): void {
    if (ClientClass) return;
    /* eslint-disable @typescript-eslint/no-require-imports */
    ClientClass = require("@modelcontextprotocol/sdk/client/index.js").Client;
    StreamableHTTPClientTransportClass = require("@modelcontextprotocol/sdk/client/streamableHttp.js").StreamableHTTPClientTransport;
    StdioClientTransportClass = require("@modelcontextprotocol/sdk/client/stdio.js").StdioClientTransport;
    /* eslint-enable @typescript-eslint/no-require-imports */
}

type Transport = { close(): Promise<void>; onclose?: () => void; onerror?: (err: Error) => void };

export class McpConnectionManager {
    private client: InstanceType<typeof ClientClass> | null = null;
    private transport: Transport | null = null;
    private _status: McpConnectionStatus = "disconnected";
    private _serverInfo: McpServerInfo | null = null;
    private _error = "";
    private _disconnecting = false;

    /** Callback fired whenever connection status changes. */
    onStatusChange: (status: McpConnectionStatus, error?: string) => void = () => {};

    get status(): McpConnectionStatus { return this._status; }
    get serverInfo(): McpServerInfo | null { return this._serverInfo; }
    get error(): string { return this._error; }

    /** Returns the connected MCP Client instance, or null if disconnected. */
    getClient(): InstanceType<typeof ClientClass> | null {
        return this._status === "connected" ? this.client : null;
    }

    async connect(config: McpConnectionConfig): Promise<void> {
        // Disconnect any existing connection first
        if (this._status === "connected" || this._status === "connecting") {
            await this.disconnect();
        }

        this.setStatus("connecting");

        try {
            loadSdk();

            // Create transport
            if (config.transport === "http") {
                if (!config.url) throw new Error("URL is required for HTTP transport");
                this.transport = new StreamableHTTPClientTransportClass(
                    new URL(config.url),
                );
            } else {
                if (!config.command) throw new Error("Command is required for stdio transport");
                this.transport = new StdioClientTransportClass({
                    command: config.command,
                    args: config.args,
                    env: config.env || { ...process.env as Record<string, string> },
                });
            }

            // Create client and connect
            this.client = new ClientClass(
                { name: "persephone-mcp-inspector", version: "1.0.0" },
                { capabilities: {} },
            );

            // Wire transport close/error events
            const origOnClose = this.transport.onclose;
            this.transport.onclose = () => {
                origOnClose?.();
                if (this._status === "connected") {
                    this._serverInfo = null;
                    this.setStatus("disconnected");
                }
            };
            const origOnError = this.transport.onerror;
            this.transport.onerror = (err: Error) => {
                origOnError?.(err);
                // Suppress errors after intentional disconnect or during disconnecting
                if (this._disconnecting || this._status === "disconnected") return;
                this._error = err.message;
                this.setStatus("error", err.message);
            };

            await this.client.connect(this.transport);

            // Read server info
            const serverVersion = this.client.getServerVersion();
            const serverCaps = this.client.getServerCapabilities();
            const instructions = this.client.getInstructions();
            this._serverInfo = {
                name: serverVersion?.name || config.name || "Unknown",
                title: serverVersion?.title || "",
                version: serverVersion?.version || "",
                description: serverVersion?.description || "",
                websiteUrl: serverVersion?.websiteUrl || "",
                instructions: instructions || "",
                capabilities: {
                    tools: !!serverCaps?.tools,
                    resources: !!serverCaps?.resources,
                    prompts: !!serverCaps?.prompts,
                },
            };

            this.setStatus("connected");
        } catch (err) {
            this._error = err?.message || String(err);
            this._serverInfo = null;
            this.client = null;
            this.transport = null;
            this.setStatus("error", this._error);
        }
    }

    async disconnect(): Promise<void> {
        this._disconnecting = true;
        try {
            if (this.client) {
                await this.client.close();
            }
        } catch {
            // Ignore close errors
        }
        this._disconnecting = false;
        this.client = null;
        this.transport = null;
        this._serverInfo = null;
        this._error = "";
        this.setStatus("disconnected");
    }

    async dispose(): Promise<void> {
        await this.disconnect();
        this.onStatusChange = () => {};
    }

    private setStatus(status: McpConnectionStatus, error?: string): void {
        this._status = status;
        if (error !== undefined) this._error = error;
        this.onStatusChange(status, error);
    }
}
