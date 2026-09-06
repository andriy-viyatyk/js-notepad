/**
 * Per-board trust gate (EPIC-035). A Board's UI is web content and
 * `persephone.execute()` is arbitrary RCE, so a board does not render or run
 * until the user has trusted it. Trust is per board (its absolute root folder),
 * persisted across sessions in a line-delimited list of absolute paths at
 * `<userData>/persephone/data/trustedBoards.txt`.
 *
 * Trust is NEVER read from the board's manifest or any in-board file — a portable
 * board must not be able to self-trust. It is always a user action (the trust
 * dialog / the "Trust all boards in this project" bulk action) or a provenance
 * write Persephone makes for a board it created itself (auto-trust on create).
 *
 * Mirrors `recent.ts`: a reactive `TGlobalState` + lazy `load()` + the `fs`
 * data-file helpers. Paths are stored with their original case (the file stays
 * human-readable); matching uses `fpNormalizeForCompare` so separator/case
 * variants on Windows still match. This module is intentionally NOT exposed on
 * the `app` object model or any script `.d.ts` — a script must never be able to
 * silently self-trust.
 */
import { TGlobalState } from "../core/state/state";
import { fpNormalizeForCompare } from "../core/utils/file-path";
import { fs } from "./fs";

const trustedBoardsFileName = "trustedBoards.txt";

/**
 * True when `ancestorKey` equals or contains `descendantKey` (path-boundary aware, so
 * ".../tools" does NOT cover ".../tools-2"). Both args MUST already be normalized via
 * `fpNormalizeForCompare` (slash-separated, no trailing slash, lowercased on Windows).
 *
 * This is the basis of *inherited trust* (EPIC-036): a board is trusted when it or any
 * ancestor folder is registered, and the registry never keeps an ancestor/descendant pair.
 */
export function pathCovers(ancestorKey: string, descendantKey: string): boolean {
    return descendantKey === ancestorKey || descendantKey.startsWith(ancestorKey + "/");
}

function parseTrustedPaths(data: string | undefined): string[] {
    return (data ?? "").split("\n").map((p) => p.trim()).filter((p) => p);
}

interface BoardTrustState {
    paths: string[]; // absolute board-root folder paths, original case
}

class BoardTrust {
    private readonly state = new TGlobalState<BoardTrustState>({ paths: [] });

    /** Load the trusted list from disk into reactive state. Lazy, like recent.load(). */
    async load(): Promise<void> {
        await fs.prepareDataFile(trustedBoardsFileName, "");
        const data = await fs.getDataFile(trustedBoardsFileName);
        const paths = parseTrustedPaths(data);
        this.state.update((s) => {
            s.paths = paths;
        });
    }

    /** Read the trusted list without creating the data file or updating reactive state. */
    async readPaths(): Promise<string[]> {
        try {
            return [...parseTrustedPaths(await fs.getDataFile(trustedBoardsFileName))];
        } catch {
            return [];
        }
    }

    /** Sync check against currently-loaded state (call load() first on mount). Ancestor-aware:
     *  a board is trusted when it OR any ancestor folder is registered (inherited trust). */
    isTrusted(boardRoot: string): boolean {
        const key = fpNormalizeForCompare(boardRoot);
        return this.state.get().paths.some((p) => pathCovers(fpNormalizeForCompare(p), key));
    }

    /** All trusted board-root paths (sync, non-reactive). Call `load()` first. */
    listPaths(): string[] {
        return [...this.state.get().paths];
    }

    /**
     * Subscribe to trusted-list changes (in-memory, NOT a filesystem watcher). The
     * custom-editor registry (EPIC-042) uses this to re-enumerate when a board is
     * trusted / untrusted. Returns an unsubscribe function. Read-only — cannot mutate trust.
     */
    subscribePaths(listener: () => void): () => void {
        return this.state.subscribe(() => listener(), (s) => s.paths);
    }

    /** Append a board to the trusted list (idempotent). Caller confirms first (the
     *  trust dialog) OR it is a provenance write for a Persephone-created board. */
    async trust(boardRoot: string): Promise<void> {
        await this.load(); // re-read so we don't clobber a concurrent write
        // Inherited trust: if this board OR an ancestor folder is already trusted, nothing to add
        // (isTrusted is ancestor-aware, so this also covers the nested-under-trusted case).
        if (this.isTrusted(boardRoot)) {
            return;
        }
        // Outer wins: this board may contain already-trusted descendants — drop them, they are
        // now covered by this (outer) board's trust. Keeps the registry free of nested pairs.
        const key = fpNormalizeForCompare(boardRoot);
        const kept = this.state
            .get()
            .paths.filter((p) => !pathCovers(key, fpNormalizeForCompare(p)));
        const paths = [...kept, boardRoot];
        this.state.update((s) => {
            s.paths = paths;
        });
        await fs.saveDataFile(trustedBoardsFileName, paths.join("\n"));
    }

    /** Remove a board from the trusted list (idempotent). Used by the sidebar
     *  "Remove board ≡ untrust" action (US-751). */
    async untrust(boardRoot: string): Promise<void> {
        await this.load();
        const key = fpNormalizeForCompare(boardRoot);
        const paths = this.state.get().paths.filter((p) => fpNormalizeForCompare(p) !== key);
        this.state.update((s) => {
            s.paths = paths;
        });
        await fs.saveDataFile(trustedBoardsFileName, paths.join("\n"));
    }
}

export const boardTrust = new BoardTrust();
