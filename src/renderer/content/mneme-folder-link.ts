/**
 * `mneme-folder://` link scheme (EPIC-032 / US-663).
 *
 * Encodes the **root folder** (the parent of a clicked `.mneme` directory) for
 * the Mneme root editor. Clicking a root's `.mneme` folder in the Explorer
 * produces one of these URLs (via `FileTreeProvider.getNavigationUrl`); the
 * `mneme-folder://` parser forwards it through the normal open pipeline, which
 * navigates the current page to the `mneme-root` editor. Mirrors
 * `git-tree-link.ts`.
 *
 * Distinct from the `mneme://` document scheme: `mneme-folder://` opens the
 * *editor for a root*; `mneme://{root}/{path}` opens an individual *document*.
 *
 * Base64-of-JSON so any path (drive letters, spaces, `#`, `?`) round-trips
 * safely inside a `://` URL — same approach as `git-tree-link.ts`.
 */

/** Prefix for mneme-folder links. */
export const MNEME_FOLDER_PREFIX = "mneme-folder://";

/** Encode a Mneme root folder (the `.mneme` parent) as a mneme-folder:// URL. */
export function encodeMnemeFolderLink(rootFolder: string): string {
    return MNEME_FOLDER_PREFIX + btoa(JSON.stringify({ rootFolder }));
}

/** Decode a mneme-folder:// URL back to its root folder, or null if invalid. */
export function decodeMnemeFolderLink(raw: string): { rootFolder: string } | null {
    if (!raw.startsWith(MNEME_FOLDER_PREFIX)) return null;
    try {
        return JSON.parse(atob(raw.slice(MNEME_FOLDER_PREFIX.length))) as { rootFolder: string };
    } catch {
        return null;
    }
}
