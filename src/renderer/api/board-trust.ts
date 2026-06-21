/**
 * Per-board trust gate (EPIC-035). A Web Board's UI is web content and
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

interface BoardTrustState {
    paths: string[]; // absolute board-root folder paths, original case
}

class BoardTrust {
    private readonly state = new TGlobalState<BoardTrustState>({ paths: [] });

    /** Load the trusted list from disk into reactive state. Lazy, like recent.load(). */
    async load(): Promise<void> {
        await fs.prepareDataFile(trustedBoardsFileName, "");
        const data = await fs.getDataFile(trustedBoardsFileName);
        const paths = (data ?? "").split("\n").map((p) => p.trim()).filter((p) => p);
        this.state.update((s) => {
            s.paths = paths;
        });
    }

    /** Sync check against currently-loaded state (call load() first on mount). */
    isTrusted(boardRoot: string): boolean {
        const key = fpNormalizeForCompare(boardRoot);
        return this.state.get().paths.some((p) => fpNormalizeForCompare(p) === key);
    }

    /** Reactive hook for views — re-renders when the board's trust flips. */
    useIsTrusted(boardRoot: string): boolean {
        const key = fpNormalizeForCompare(boardRoot);
        return this.state.use((s) => s.paths.some((p) => fpNormalizeForCompare(p) === key));
    }

    /** Append a board to the trusted list (idempotent). Caller confirms first (the
     *  trust dialog) OR it is a provenance write for a Persephone-created board. */
    async trust(boardRoot: string): Promise<void> {
        await this.load(); // re-read so we don't clobber a concurrent write
        if (this.isTrusted(boardRoot)) {
            return;
        }
        const paths = [...this.state.get().paths, boardRoot];
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
