/**
 * Tor-routed `src` resolution for renderer-drawn remote resources (US-896).
 *
 * A Tor browser page's SOCKS proxy lives on its Electron session partition and
 * therefore covers only the page's `<webview>`. The Link editor rendered on that
 * page's blank tab (and its bookmarks drawer, tooltips and Edit-Link dialog) is
 * an app-rendered `<img src="https://…">`, so the URL would go out
 * un-proxied. `resolveTorSrc` rewrites such URLs to the `tor-src://` scheme,
 * which the main process fetches through the page's Tor session instead.
 *
 * Lives here rather than under `editors/browser/` to keep the dependency arrow
 * one-way: `browser` already imports `link-editor`, not the reverse.
 */

/** Identifies the Tor session a piece of renderer content should fetch through. */
export interface TorProxyInfo {
    /** Electron session partition of the owning Tor browser page. */
    partition: string;
    /** True only while that page's Tor circuit is connected. */
    ready: boolean;
}

/**
 * Schemes that never touch the network, so they render as-is even inside a Tor
 * page. Anything NOT matching this is treated as remote and requires the proxy —
 * fail-closed, so an unexpected form (e.g. a protocol-relative `//host/x`) is
 * suppressed rather than silently fetched direct.
 */
const LOCAL_SRC_RE = /^(?:data:|blob:|file:\/\/|app-asset:\/\/)/i;

/**
 * Rewrite a resource URL so it is fetched through the page's Tor session.
 *
 * Returns `null` when the resource must not be loaded at all — the caller should
 * render its placeholder instead of an `<img>`.
 *
 * With no `proxy` (a standalone `.links.json` editor, or a normal/incognito
 * browser page) the URL is returned unchanged: behaviour outside Tor pages is
 * untouched.
 */
export function resolveTorSrc(
    src: string | undefined,
    proxy: TorProxyInfo | null | undefined,
): string | null {
    if (!src) return null;
    if (!proxy) return src;
    // Local sources carry no network request — safe to render even while
    // disconnected, and pointless to route through Tor.
    if (LOCAL_SRC_RE.test(src)) return src;
    // Tor not up yet (a restored page awaiting "Reconnect", still bootstrapping,
    // or errored) — suppress rather than leak. Status is read at render time and
    // is deliberately not reactive: reopening the blank tab picks up the change.
    if (!proxy.ready) return null;
    // Target rides a query param, not a path segment: Chromium canonicalizes
    // standard-scheme paths (it may rewrite percent-escapes), which would corrupt
    // a URL containing its own escapes. `URLSearchParams` round-trips exactly.
    return `tor-src://${proxy.partition}/?u=${encodeURIComponent(src)}`;
}
