/**
 * May an agent (the `call` tree, an MCP-run script, or browser automation) read or drive a page?
 *
 * Incognito and Tor pages are private to the user — unless the agent opened the page itself
 * (`openedByAgent`, an ephemeral flag set by MCP tools and MCP-run scripts, never persisted, so a
 * restored page is the user's again). One rule behind browser automation targeting
 * (`automation/commands.ts`) and AiVision's
 * `Page.restricted()` (`scripting/api-wrapper/PageWrapper.ts`).
 *
 * Dependency-free on purpose: those callers load at startup and must not pull the browser chunk.
 */
export interface IBrowserAccessFlags {
    isIncognito?: boolean;
    isTor?: boolean;
    openedByAgent?: boolean;
}

export function agentMayAccessBrowserPage(state: IBrowserAccessFlags | undefined): boolean {
    if (!state) return true;
    if (!state.isIncognito && !state.isTor) return true;
    return !!state.openedByAgent;
}

export function privateBrowserRefusal(state: IBrowserAccessFlags, via: "browser tools" | "call"): string {
    const mode = state.isTor ? "Tor" : "incognito";
    const remedy = via === "call"
        ? "open a normal browser page instead (pages.showBrowserPage), or open your own private page — pages you open are yours to read"
        : "use pages.openUrlInBrowserTab to open a normal browser page, or open your own incognito/Tor page — pages the agent opens are accessible to it";
    return `This browser page is in ${mode} mode and was opened by the user. Agent access is disabled for privacy protection; ${remedy}.`;
}
