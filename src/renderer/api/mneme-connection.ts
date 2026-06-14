import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ISubscriptionObject } from "./types/events";
import { api } from "../../ipc/renderer/api";
import ipcRendererEvents from "../../ipc/renderer/renderer-events";
import { settings } from "./settings";
import { McpConnectionManager } from "../editors/mcp-inspector/McpConnectionManager";

/**
 * Shared, persistent Mneme content connection.
 *
 * Owns a single {@link McpConnectionManager} (with auto-reconnect) used by every
 * `MnemeProvider` for document read/write/edit and live-refresh subscriptions.
 * It is distinct from `mnemeStatusModel`'s throwaway health prober (which is
 * disposed and recreated on every probe failure and has no auto-reconnect): this
 * connection stays up while Mneme is enabled and multiplexes the manager's single
 * resource-notification callbacks out to per-URI watchers.
 *
 * Subscriptions are refcounted per URI — multiple editors may open the same
 * document — and survive reconnects because the manager replays its subscription
 * set on every (re)connect.
 */
class MnemeConnectionService {
    private manager: McpConnectionManager | null = null;
    private connectedUrl = "";
    private enabled = false;
    private running = false;
    private url = "";
    private initialized = false;

    /** uri -> change callbacks. The server subscription is refcounted on this set. */
    private watchers = new Map<string, Set<(event: string) => void>>();
    /** `resources/list_changed` listeners (consumed by MnemeTreeProvider). */
    private listChangedWatchers = new Set<() => void>();

    /** Wire settings + sidecar events. Call once at app startup. */
    init(): void {
        if (this.initialized) return;
        this.initialized = true;

        this.enabled = !!settings.get("mneme.enabled");

        settings.onChanged.subscribe(({ key }: { key: string }) => {
            if (key !== "mneme.enabled") return;
            this.enabled = !!settings.get("mneme.enabled");
            this.sync();
        });

        ipcRendererEvents.eMnemeStatusChanged.subscribe((s) => {
            this.running = !!s.running;
            this.url = s.url || "";
            this.sync();
        });

        void api.getMnemeStatus().then((s) => {
            this.running = !!s.running;
            this.url = s.url || "";
            this.sync();
        });
    }

    /** Connected MCP client for content I/O, or null when not connected. */
    getClient(): Client | null {
        return this.manager?.getClient() ?? null;
    }

    /** Subscribe to `resources/updated` for a document URI. Refcounted: the server
     *  subscription is issued on the first watcher for a URI and dropped when the
     *  last one unsubscribes. Survives reconnects (the manager replays its set). */
    subscribe(uri: string, callback: (event: string) => void): ISubscriptionObject {
        let set = this.watchers.get(uri);
        if (!set) {
            set = new Set();
            this.watchers.set(uri, set);
            void this.manager?.subscribeResource(uri);
        }
        set.add(callback);
        return {
            unsubscribe: () => {
                const current = this.watchers.get(uri);
                if (!current) return;
                current.delete(callback);
                if (current.size === 0) {
                    this.watchers.delete(uri);
                    void this.manager?.unsubscribeResource(uri);
                }
            },
        };
    }

    /** Listen for `resources/list_changed` (tree add/remove/rename). */
    onListChanged(callback: () => void): ISubscriptionObject {
        this.listChangedWatchers.add(callback);
        return {
            unsubscribe: () => { this.listChangedWatchers.delete(callback); },
        };
    }

    private dispatchUpdated(uri: string): void {
        const set = this.watchers.get(uri);
        if (!set) return;
        for (const cb of [...set]) cb("change");
    }

    private ensureManager(): McpConnectionManager {
        if (this.manager) return this.manager;
        const manager = new McpConnectionManager();
        manager.onResourceUpdated = (uri) => this.dispatchUpdated(uri);
        manager.onResourceListChanged = () => {
            for (const cb of [...this.listChangedWatchers]) cb();
        };
        this.manager = manager;
        return manager;
    }

    private sync(): void {
        if (this.enabled && this.running && this.url) {
            const manager = this.ensureManager();
            const stale = this.connectedUrl !== this.url
                || manager.status === "disconnected"
                || manager.status === "error";
            if (stale) {
                this.connectedUrl = this.url;
                void manager.connect({
                    name: "Mneme",
                    transport: "http",
                    url: this.url,
                    autoReconnect: true,
                });
            }
        } else {
            // Disabled / sidecar down — stop the connection (and its reconnect loop)
            // but keep the watcher set so subscriptions replay when it comes back.
            this.connectedUrl = "";
            void this.manager?.disconnect();
        }
    }
}

export const mnemeConnection = new MnemeConnectionService();
