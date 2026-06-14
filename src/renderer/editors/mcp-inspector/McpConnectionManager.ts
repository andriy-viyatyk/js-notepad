// ============================================================================
// McpConnectionManager — wraps @modelcontextprotocol/sdk Client
// ============================================================================

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

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
    /** Auto-reconnect with capped backoff on unexpected transport drops (US-671). Default false. */
    autoReconnect?: boolean;
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
// Type-only imports above let us preserve the SDK's actual types on what is a
// runtime-loaded module.
let ClientClass: typeof Client;
let StreamableHTTPClientTransportClass: typeof StreamableHTTPClientTransport;
let StdioClientTransportClass: typeof StdioClientTransport;
// Notification schemas for resource subscriptions (US-661); loaded alongside the client.
let ResourceUpdatedNotificationSchemaRef: typeof import("@modelcontextprotocol/sdk/types.js").ResourceUpdatedNotificationSchema;
let ResourceListChangedNotificationSchemaRef: typeof import("@modelcontextprotocol/sdk/types.js").ResourceListChangedNotificationSchema;

function loadSdk(): void {
    if (ClientClass) return;
    /* eslint-disable @typescript-eslint/no-require-imports */
    ClientClass = require("@modelcontextprotocol/sdk/client/index.js").Client;
    StreamableHTTPClientTransportClass = require("@modelcontextprotocol/sdk/client/streamableHttp.js").StreamableHTTPClientTransport;
    StdioClientTransportClass = require("@modelcontextprotocol/sdk/client/stdio.js").StdioClientTransport;
    const types = require("@modelcontextprotocol/sdk/types.js");
    ResourceUpdatedNotificationSchemaRef = types.ResourceUpdatedNotificationSchema;
    ResourceListChangedNotificationSchemaRef = types.ResourceListChangedNotificationSchema;
    /* eslint-enable @typescript-eslint/no-require-imports */
}

export class McpConnectionManager {
    private client: Client | null = null;
    private transport: Transport | null = null;
    private _status: McpConnectionStatus = "disconnected";
    private _serverInfo: McpServerInfo | null = null;
    private _error = "";
    private _disconnecting = false;
    /** Last config passed to connect(), replayed by auto-reconnect (US-671). */
    private _lastConfig: McpConnectionConfig | null = null;
    /** Whether to auto-reconnect on unexpected transport drops (opt-in per connection). */
    private _autoReconnect = false;
    /** Pending backoff timer for an auto-reconnect attempt, if any. */
    private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    /** Index into the backoff schedule; reset to 0 on a successful connect. */
    private _reconnectAttempt = 0;
    /** Resource URIs to (re)subscribe on connect; survives reconnects, cleared on dispose (US-661). */
    private subscriptions = new Set<string>();

    /** Callback fired whenever connection status changes. */
    onStatusChange: (status: McpConnectionStatus, error?: string) => void = () => {};
    /** Fired when the server emits notifications/resources/updated for a subscribed URI (US-661). */
    onResourceUpdated: (uri: string) => void = () => {};
    /** Fired when the server emits notifications/resources/list_changed (US-661). */
    onResourceListChanged: () => void = () => {};

    get status(): McpConnectionStatus { return this._status; }
    get serverInfo(): McpServerInfo | null { return this._serverInfo; }
    get error(): string { return this._error; }

    /** Returns the connected MCP Client instance, or null if disconnected. */
    getClient(): Client | null {
        return this._status === "connected" ? this.client : null;
    }

    /** Subscribe to a resource URI's `resources/updated` notifications (US-661). The URI is
     *  remembered and re-subscribed on every (re)connect; calling while disconnected just records
     *  it for replay. Failures (missing capability / unknown doc) are swallowed. */
    async subscribeResource(uri: string): Promise<void> {
        this.subscriptions.add(uri);
        if (this._status === "connected" && this.client) {
            try {
                await this.client.subscribeResource({ uri });
            } catch {
                // Missing capability or unknown doc — keep it in the set for a later replay.
            }
        }
    }

    /** Stop receiving `resources/updated` for a URI and drop it from the replay set (US-661). */
    async unsubscribeResource(uri: string): Promise<void> {
        this.subscriptions.delete(uri);
        if (this._status === "connected" && this.client) {
            try {
                await this.client.unsubscribeResource({ uri });
            } catch {
                // Best-effort — the connection may already be gone.
            }
        }
    }

    async connect(config: McpConnectionConfig): Promise<void> {
        // Disconnect any existing connection first
        if (this._status === "connected" || this._status === "connecting") {
            await this.disconnect();
        }

        // Remember the target so an unexpected drop can be retried (US-671). Set after the guard's
        // disconnect(), which clears these. A scheduled retry is superseded by this explicit attempt.
        this._lastConfig = config;
        this._autoReconnect = !!config.autoReconnect;
        this.cancelReconnect();

        this.setStatus("connecting");

        try {
            loadSdk();

            // Create transport
            if (config.transport === "http") {
                if (!config.url) throw new Error("URL is required for HTTP transport");
                this.transport = new StreamableHTTPClientTransportClass(
                    new URL(config.url),
                    {
                        // Harden the SSE stream against transient drops before the app-level
                        // auto-reconnect (US-671) has to step in — the SDK default is only 2 retries.
                        reconnectionOptions: {
                            initialReconnectionDelay: 1000,
                            maxReconnectionDelay: 15000,
                            reconnectionDelayGrowFactor: 1.5,
                            maxRetries: 10,
                        },
                    },
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

            // Resource-subscription notifications (US-661) — register before connect so a
            // notification arriving immediately after the stream opens isn't missed.
            this.client.setNotificationHandler(ResourceUpdatedNotificationSchemaRef, (n) => {
                this.onResourceUpdated(n.params.uri);
            });
            this.client.setNotificationHandler(ResourceListChangedNotificationSchemaRef, () => {
                this.onResourceListChanged();
            });

            // Wire transport close/error events
            const origOnClose = this.transport.onclose;
            this.transport.onclose = () => {
                origOnClose?.();
                if (this._status === "connected") {
                    this._serverInfo = null;
                    this.setStatus("disconnected");
                    this.scheduleReconnect();
                }
            };
            const origOnError = this.transport.onerror;
            this.transport.onerror = (err: Error) => {
                origOnError?.(err);
                // Suppress errors after intentional disconnect or during disconnecting
                if (this._disconnecting || this._status === "disconnected") return;
                this._error = err.message;
                this.setStatus("error", err.message);
                this.scheduleReconnect();
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

            // Replay subscriptions across (re)connects — the prior Client was destroyed on
            // disconnect, and an auto-reconnect (US-671) lands here too (US-661).
            if (this.subscriptions.size > 0 && this._serverInfo.capabilities.resources) {
                for (const uri of this.subscriptions) {
                    try {
                        await this.client.subscribeResource({ uri });
                    } catch {
                        // The doc may no longer exist, or the server lacks the capability — skip.
                    }
                }
            }

            this._reconnectAttempt = 0;
            this.setStatus("connected");
        } catch (err) {
            this._error = (err as Error)?.message || String(err);
            this._serverInfo = null;
            this.client = null;
            this.transport = null;
            this.setStatus("error", this._error);
            // A failed (re)connect surfaces here, not via transport.onerror — keep retrying.
            this.scheduleReconnect();
        }
    }

    async disconnect(): Promise<void> {
        // Intentional disconnect — stop any auto-reconnect (re-armed by the next connect()).
        this.cancelReconnect();
        this._autoReconnect = false;
        this._reconnectAttempt = 0;
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
        this.subscriptions.clear();
        this.onStatusChange = () => {};
        this.onResourceUpdated = () => {};
        this.onResourceListChanged = () => {};
    }

    /** On an unexpected transport drop (not an intentional disconnect/dispose), retry the last
     *  connection with capped backoff. Active only when the connection opted in via `autoReconnect`.
     *  Cancelled by disconnect()/dispose() — e.g. when the sidecar is stopped (no reconnect storm).
     *  Retries continue indefinitely at the capped delay; the consumer disposes the manager when the
     *  server is gone, which stops the loop. */
    private scheduleReconnect(): void {
        if (!this._autoReconnect || this._disconnecting || this._reconnectTimer || !this._lastConfig) {
            return;
        }
        const delays = [1000, 2000, 5000, 10000, 15000];
        const delay = delays[Math.min(this._reconnectAttempt, delays.length - 1)];
        this._reconnectAttempt += 1;
        const config = this._lastConfig;
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (this._disconnecting || !this._autoReconnect) return;
            void this.connect(config);
        }, delay);
    }

    private cancelReconnect(): void {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    private setStatus(status: McpConnectionStatus, error?: string): void {
        this._status = status;
        if (error !== undefined) this._error = error;
        this.onStatusChange(status, error);
    }
}
