/**
 * IPC channel definitions for Tor proxy service.
 *
 * Renderer ↔ Main communication for starting/stopping the Tor process
 * and streaming tor.exe stdout to the renderer.
 */

/** Tor connection status for a browser page. */
export type TorStatus = "disconnected" | "connecting" | "connected" | "error";

/**
 * Result of a `tor:check-ip` lookup — what the outside world sees for this
 * Tor session. Every field is best-effort: the geo providers are third parties
 * that may be down or rate-limiting a Tor exit, so a missing location must
 * still leave `ip` usable.
 */
export interface TorIpInfo {
    /** Exit IP as seen by the checker, or "" when the lookup failed. */
    ip: string;
    /** check.torproject.org's verdict; null when that call failed. */
    isTor: boolean | null;
    /** Country as reported by the geo provider (2-letter code, or a full name from the fallback). */
    country?: string;
    region?: string;
    city?: string;
    /** Exit node ASN / organisation, when the provider reports it. */
    org?: string;
    /** Hostname of the geo provider that answered. */
    geoSource?: string;
    /** Human-readable failure reason; set when `ip` is empty. */
    error?: string;
}

export const TorChannel = {
    /**
     * Start Tor for a browser partition.
     * Renderer → Main (invoke).
     * Args: (torExePath: string, socksPort: number, partition: string)
     * Returns: { success: boolean; error?: string }
     */
    start: "tor:start",

    /**
     * Stop Tor for a browser partition (decrements consumer counter).
     * Renderer → Main (invoke).
     * Args: (partition: string)
     */
    stop: "tor:stop",

    /**
     * Look up the exit IP / location for a Tor partition (US-897).
     * Renderer → Main (invoke).
     * Args: (partition: string)
     * Returns: TorIpInfo — never rejects; failures come back in `error`.
     */
    checkIp: "tor:check-ip",

    /**
     * Restart tor.exe so fresh circuits (and normally a new exit IP) are used,
     * then re-apply the proxy to every active Tor partition (US-897).
     * Renderer → Main (invoke). Resolves only after the new daemon bootstraps,
     * which can take tens of seconds.
     * Args: (partition: string)
     * Returns: { success: boolean; error?: string }
     */
    restart: "tor:restart",

    /**
     * Tor log line event.
     * Main → Renderer (send).
     * Data: string (one log line from tor.exe stdout/stderr)
     */
    log: "tor:log",

    /**
     * Tor status change originating in main (US-897).
     * Main → Renderer (send), broadcast to every window.
     *
     * Only a restart emits this: the daemon is shared by all Tor pages, so a
     * restart triggered by one page takes the network down for the others, whose
     * `torStatus` lives in renderer state that main cannot see. Without this
     * broadcast those pages would keep showing a green "connected" dot while Tor
     * is down. The initial `tor:start` still drives status via its invoke result.
     *
     * Data: { status: TorStatus; error?: string }
     */
    status: "tor:status",
} as const;
