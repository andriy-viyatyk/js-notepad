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

/**
 * Finds a currently-trusted board whose resolved namespace collides with `boardRoot`'s.
 * Returns `undefined` when there's no collision, OR when `boardRoot`'s own namespace is the
 * path-fallback (its root path) — a path-fallback namespace is unique by construction, so no
 * collision is possible and there's nothing to check.
 */
export async function findNamespaceCollision(
    boardRoot: string,
): Promise<{ namespace: string; collidingRoot: string } | undefined> {
    const namespace = await resolveBoardNamespace(boardRoot);
    if (namespace === boardRoot) return undefined;

    const { boardTrust } = await import("../board-trust");
    const { fpNormalizeForCompare } = await import("../../core/utils/file-path");
    await boardTrust.load();
    const key = fpNormalizeForCompare(boardRoot);
    for (const other of boardTrust.listPaths()) {
        if (fpNormalizeForCompare(other) === key) continue;
        // eslint-disable-next-line no-await-in-loop -- small, bounded list of trusted boards
        if ((await resolveBoardNamespace(other)) === namespace) {
            return { namespace, collidingRoot: other };
        }
    }
    return undefined;
}

/**
 * Registration-flow gate: checks for a namespace collision and, if found, shows the advisory
 * dialog. Returns `true` when it's safe to proceed with `boardTrust.trust(boardRoot)` (no
 * collision, or the user chose "Register anyway"), `false` when the user cancelled.
 */
export async function confirmNamespaceNotColliding(boardRoot: string): Promise<boolean> {
    const collision = await findNamespaceCollision(boardRoot);
    if (!collision) return true;
    const { showNamespaceCollisionDialog } = await import(
        "../../ui/dialogs/NamespaceCollisionDialog"
    );
    return showNamespaceCollisionDialog(collision.namespace, collision.collidingRoot);
}
