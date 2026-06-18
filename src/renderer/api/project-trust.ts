/**
 * Per-project trust gate (EPIC-034, foundation #3).
 *
 * A Web Board's UI is web content and `persephone.execute()` is arbitrary RCE,
 * so nothing about a board renders or runs until the user has trusted its
 * `.persephone` project. Trust is per project (the `.persephone` folder), not
 * per board, and remembered across sessions in a line-delimited list of
 * absolute paths at `<userData>/persephone/data/trustedProjects.txt`.
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

const trustedProjectsFileName = "trustedProjects.txt";

interface ProjectTrustState {
    paths: string[]; // absolute .persephone folder paths, original case
}

class ProjectTrust {
    private readonly state = new TGlobalState<ProjectTrustState>({ paths: [] });

    /** Load the trusted list from disk into reactive state. Lazy, like recent.load(). */
    async load(): Promise<void> {
        await fs.prepareDataFile(trustedProjectsFileName, "");
        const data = await fs.getDataFile(trustedProjectsFileName);
        const paths = (data ?? "").split("\n").map((p) => p.trim()).filter((p) => p);
        this.state.update((s) => {
            s.paths = paths;
        });
    }

    /** Sync check against currently-loaded state (call load() first on mount). */
    isTrusted(persephonePath: string): boolean {
        const key = fpNormalizeForCompare(persephonePath);
        return this.state.get().paths.some((p) => fpNormalizeForCompare(p) === key);
    }

    /** Reactive hook for views — re-renders when the project's trust flips. */
    useIsTrusted(persephonePath: string): boolean {
        const key = fpNormalizeForCompare(persephonePath);
        return this.state.use((s) => s.paths.some((p) => fpNormalizeForCompare(p) === key));
    }

    /** Append a project to the trusted list (idempotent). Caller confirms first. */
    async trust(persephonePath: string): Promise<void> {
        await this.load(); // re-read so we don't clobber a concurrent write
        if (this.isTrusted(persephonePath)) {
            return;
        }
        const paths = [...this.state.get().paths, persephonePath];
        this.state.update((s) => {
            s.paths = paths;
        });
        await fs.saveDataFile(trustedProjectsFileName, paths.join("\n"));
    }
}

export const projectTrust = new ProjectTrust();
