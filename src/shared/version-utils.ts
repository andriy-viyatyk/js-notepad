/**
 * Shared semver-ish version parse + compare, usable from BOTH the main and renderer
 * bundles. Kept import-free on purpose: `version-service.ts` (main) must not leak its
 * electron / e-store / open-windows imports into the renderer, which needs the same
 * compare for the published-boards catalog (compatibility + update detection).
 */

export function parseVersion(version: string): number[] {
    const cleaned = version.replace(/^v/, "");
    return cleaned.split(".").map((part) => parseInt(part, 10) || 0);
}

/** Returns 1 if `latest` > `current`, -1 if `latest` < `current`, 0 if equal. */
export function compareVersions(current: string, latest: string): number {
    const currentParts = parseVersion(current);
    const latestParts = parseVersion(latest);

    const maxLength = Math.max(currentParts.length, latestParts.length);

    for (let i = 0; i < maxLength; i++) {
        const currentPart = currentParts[i] || 0;
        const latestPart = latestParts[i] || 0;

        if (latestPart > currentPart) return 1;
        if (latestPart < currentPart) return -1;
    }

    return 0;
}
