/**
 * The `mneme://{root}/{path}` document scheme — the canonical link form for a
 * Mneme document.
 *
 * The Mneme MCP tools speak the scheme-less `{root}/{path}` *address*; the rest
 * of the app speaks the qualified `mneme://{root}/{path}` *link*. `MnemeTreeProvider`
 * is the single translation boundary that converts between the two using these
 * helpers — it emits `toMnemeHref` on every href it produces and `toMnemeAddress`
 * at every MCP tool call.
 *
 * Distinct from `mneme-folder://` (see `mneme-folder-link.ts`), which opens the
 * *editor for a root* rather than an individual document.
 */

/** Prefix for the `mneme://` document scheme. */
export const MNEME_PREFIX = "mneme://";

/** App-facing canonical link form (`mneme://{root}/{path}`). Idempotent. */
export function toMnemeHref(addressOrHref: string): string {
    return addressOrHref.startsWith(MNEME_PREFIX) ? addressOrHref : MNEME_PREFIX + addressOrHref;
}

/** MCP-tool address form (`{root}/{path}`). Idempotent. */
export function toMnemeAddress(addressOrHref: string): string {
    return addressOrHref.startsWith(MNEME_PREFIX)
        ? addressOrHref.slice(MNEME_PREFIX.length)
        : addressOrHref;
}
