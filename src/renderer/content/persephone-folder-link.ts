/**
 * `persephone-folder://` link scheme (EPIC-034 / US-722).
 *
 * Encodes the absolute path of a `.persephone` project folder into a link the
 * content pipeline routes to the Board editor — mirroring `mneme-folder://`
 * (Mneme root) and `git-tree://` (Git Tree). Payload is base64-of-JSON so drive
 * letters, spaces, `#`, and `?` round-trip without escaping.
 *
 * Distinct from US-723's `board://` *webview protocol* (a different namespace —
 * an Electron custom protocol, not an in-app link parser).
 *
 * Unlike `.mneme`/`.git` (metadata subfolders whose editor opens on the
 * *parent*), the Board editor opens on the `.persephone` folder *itself*: it
 * contains `boards/` and is the per-project trust key (US-721).
 */
export const PERSEPHONE_FOLDER_PREFIX = "persephone-folder://";

export function encodePersephoneFolderLink(persephonePath: string): string {
    return PERSEPHONE_FOLDER_PREFIX + btoa(JSON.stringify({ persephonePath }));
}

export function decodePersephoneFolderLink(raw: string): { persephonePath: string } | null {
    if (!raw.startsWith(PERSEPHONE_FOLDER_PREFIX)) return null;
    try {
        const json = atob(raw.slice(PERSEPHONE_FOLDER_PREFIX.length));
        const obj = JSON.parse(json);
        return typeof obj?.persephonePath === "string"
            ? { persephonePath: obj.persephonePath }
            : null;
    } catch {
        return null;
    }
}
