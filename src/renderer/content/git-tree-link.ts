/**
 * `git-tree://` link scheme (EPIC-030 / US-612).
 *
 * Encodes the repo root for the Git Tree editor. Clicking a repo's `.git`
 * folder in the Explorer produces one of these URLs (via
 * `FileTreeProvider.getNavigationUrl`); the `git-tree://` parser forwards it
 * through the normal open pipeline, which navigates the current page to the
 * `git-tree` editor (mirrors `tree-category://` + `category-view`).
 *
 * Base64-of-JSON so any path (drive letters, spaces, `#`, `?`) round-trips
 * safely inside a `://` URL — same approach as `tree-provider-link.ts`.
 */

/** Prefix for git-tree links. */
export const GIT_TREE_PREFIX = "git-tree://";

/** Encode a repo root as a git-tree:// URL. */
export function encodeGitTreeLink(repoRoot: string): string {
    return GIT_TREE_PREFIX + btoa(JSON.stringify({ repoRoot }));
}

/** Decode a git-tree:// URL back to its repo root, or null if invalid. */
export function decodeGitTreeLink(raw: string): { repoRoot: string } | null {
    if (!raw.startsWith(GIT_TREE_PREFIX)) return null;
    try {
        return JSON.parse(atob(raw.slice(GIT_TREE_PREFIX.length))) as { repoRoot: string };
    } catch {
        return null;
    }
}
