import { readBoardManifest } from "../../editors/board/board-manifest";

// =============================================================================
// Board vars namespace resolution (EPIC-046 / US-887).
// =============================================================================

/**
 * The per-board vars namespace: the manifest's `author/name` when BOTH are explicitly set
 * (trimmed, non-empty), otherwise the board root path (unique — collision-free but not portable
 * across locations). The namespace is a plain JSON object key, so spaces / "/" inside the display
 * strings are fine ("Persephone/Excel Viewer"); it is deliberately NOT slugged or charset-restricted.
 *
 * A stable `author/name` lets a board keep one namespace across its dev-repo copy and its installed
 * copy (both carry the same manifest). Renaming either field re-namespaces the board (orphaning its
 * old vars) — that is the documented cost of using display fields as identity.
 */
export async function resolveBoardNamespace(boardRoot: string): Promise<string> {
    const manifest = await readBoardManifest(boardRoot);
    const author = typeof manifest?.author === "string" ? manifest.author.trim() : "";
    const name = typeof manifest?.name === "string" ? manifest.name.trim() : "";
    if (author && name) return `${author}/${name}`;
    return boardRoot;
}
