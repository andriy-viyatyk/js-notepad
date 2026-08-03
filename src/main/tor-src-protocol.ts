/**
 * `tor-src://` protocol handler (US-896).
 *
 * Tor mode is a per-browser-page Electron session partition carrying a SOCKS5
 * proxy (see `tor-service.ts`). That proxy covers the page's `<webview>` only —
 * anything the app renderer draws itself (React) goes out over the app session
 * and leaks the user's real IP. The Link editor rendered on a Tor page's blank
 * tab is exactly that case: its bookmark images are plain `<img src="https://…">`.
 *
 * This handler lets renderer content opt a single URL into a Tor page's session:
 *
 *     tor-src://<partition>/?u=<encodeURIComponent(originalUrl)>
 *
 * Deliberately NOT restricted to images — it is a generic "fetch this through
 * that Tor partition" primitive, hence the name. The three guards below are what
 * keep it safe, and they are load-bearing:
 *
 *   1. the partition must look like a Tor browser partition,
 *   2. it must be a *currently live* Tor partition (so the scheme is inert
 *      whenever no Tor page is running), and
 *   3. the target must be http(s).
 *
 * Together they mean a caller can only reach what it could already reach by
 * opening a Tor browser tab — no new capability, just correct routing. Removing
 * any of them turns this into an open proxy for arbitrary renderer content.
 */
import { session } from "electron";
import { torService } from "./tor-service";

/** Shape produced by `getPartitionString` for a Tor page: `browser-tor-<uuid>`. */
const TOR_PARTITION_RE = /^browser-tor-[0-9a-f-]+$/;

/** Register the handler on a session. Call once per app session at startup. */
export function registerTorSrcProtocol(partition: string): void {
    session.fromPartition(partition).protocol.handle("tor-src", handleTorSrc);
}

async function handleTorSrc(request: Request): Promise<Response> {
    let torPartition: string;
    let target: string | null;
    try {
        const parsed = new URL(request.url);
        torPartition = parsed.host;
        // `?u=` rather than a path segment — Chromium canonicalizes standard-scheme
        // paths and can rewrite percent-escapes, corrupting a target URL that
        // carries escapes of its own. searchParams decodes exactly once.
        target = parsed.searchParams.get("u");
    } catch {
        return new Response("Malformed tor-src URL", { status: 400 });
    }
    if (!target) {
        return new Response("Missing 'u' target parameter", { status: 400 });
    }

    if (!TOR_PARTITION_RE.test(torPartition)) {
        return new Response("Not a Tor partition", { status: 403 });
    }
    if (!torService.isActiveTorPartition(torPartition)) {
        return new Response("No live Tor session for this partition", { status: 403 });
    }
    if (!/^https?:$/.test(safeProtocol(target))) {
        return new Response("Only http(s) targets are allowed", { status: 403 });
    }

    let upstream: Response;
    try {
        // The Tor partition's session carries the SOCKS5 proxy — this is the
        // whole point of routing through main rather than fetching in the
        // renderer. No header rewriting: no UA/Referer spoofing (US-896).
        upstream = await session.fromPartition(torPartition).fetch(target);
    } catch (err) {
        return new Response(`Tor fetch failed: ${(err as Error).message}`, { status: 502 });
    }

    // Forward the body and content type only. Upstream `Set-Cookie` and friends
    // are dropped — this is a one-shot resource fetch, not a browsing context.
    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    // The app session is in-memory already (`appPartition` has no `persist:`
    // prefix), so nothing reaches disk. `no-store` keeps Tor-fetched bytes out
    // of the in-memory cache too.
    headers.set("Cache-Control", "no-store");

    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}

/** Protocol of `url`, or "" when it does not parse. Never throws. */
function safeProtocol(url: string): string {
    try {
        return new URL(url).protocol;
    } catch {
        return "";
    }
}
