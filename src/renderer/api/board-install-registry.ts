/**
 * Install registry for catalog-downloaded boards (EPIC-045 / US-863). Tracks WHAT was
 * downloaded from the published catalog (id → install root + version) in
 * `installedBoards.json`, so update checks and the "already installed" filter have data.
 *
 * This is INDEPENDENT of trust (`board-trust.ts`): a downloaded-but-unregistered board
 * has a registry entry here but is not trusted and does not run. Registration (trust) is
 * a separate consent step (US-864 / US-868).
 *
 * Mirrors `board-trust.ts`: a reactive `TGlobalState` + lazy `load()` + the `fs`
 * data-file helpers. One entry per catalog id — re-downloading to a different dir moves
 * the entry. Entries whose root no longer holds a board manifest (folder deleted
 * manually) are pruned on `load()`.
 */
import { TGlobalState } from "../core/state/state";
import { fpNormalizeForCompare } from "../core/utils/file-path";
import { tryParseJson } from "../core/utils/parse-utils";
import { fs } from "./fs";
import { isBoardFolder } from "../editors/board/board-manifest";

const INSTALLED_BOARDS_FILE = "installedBoards.json";

/** One catalog-installed board (EPIC-045 / US-863). */
export interface InstalledBoardEntry {
    /** Catalog board id (folder name under the repo's boards/). Unique per entry. */
    id: string;
    /** Absolute install root (the board folder), original case. */
    root: string;
    /** Installed version (semver), for update comparison. */
    version: string;
    /** Epoch ms of install/last update. */
    installedAt: number;
    /** Reserved for US-865: last version we toasted an update for (per-entry, renderer-side). */
    lastNotifiedVersion?: string;
}

interface RegistryState {
    entries: InstalledBoardEntry[];
    loaded: boolean;
}

function parseInstalledEntries(raw: string | undefined): InstalledBoardEntry[] {
    if (!raw) return [];
    const data = tryParseJson<unknown>(raw, null);
    if (!Array.isArray(data)) return [];
    return data.filter(
        (e): e is InstalledBoardEntry =>
            !!e &&
            typeof e.id === "string" &&
            typeof e.root === "string" &&
            typeof e.version === "string",
    );
}

class BoardInstallRegistry {
    private readonly state = new TGlobalState<RegistryState>({ entries: [], loaded: false });

    /** Load from disk + prune entries whose root no longer holds a board manifest
     *  (folder deleted manually — the BoardNotFoundView stale-path precedent). */
    async load(): Promise<void> {
        await fs.prepareDataFile(INSTALLED_BOARDS_FILE, "[]");
        const raw = await fs.getDataFile(INSTALLED_BOARDS_FILE);
        const parsed = parseInstalledEntries(raw);

        // Stale-entry reconciliation.
        const alive = await this.liveEntries(parsed);
        const changed = alive.length !== parsed.length;

        this.state.update((s) => {
            s.entries = alive;
            s.loaded = true;
        });
        if (changed) await this.persist(alive);
    }

    private async liveEntries(entries: InstalledBoardEntry[]): Promise<InstalledBoardEntry[]> {
        const alive: InstalledBoardEntry[] = [];
        for (const entry of entries) {
            if (await isBoardFolder(entry.root)) alive.push(entry);
        }
        return alive;
    }

    private async persist(entries: InstalledBoardEntry[]): Promise<void> {
        await fs.saveDataFile(INSTALLED_BOARDS_FILE, JSON.stringify(entries, null, 2));
    }

    /** Record (insert or replace-by-id). One entry per id — re-installing to a new dir moves it. */
    async record(entry: InstalledBoardEntry): Promise<void> {
        await this.load();
        const entries = this.state.get().entries.filter((e) => e.id !== entry.id);
        entries.push(entry);
        this.state.update((s) => {
            s.entries = entries;
        });
        await this.persist(entries);
    }

    /** Record the version we last toasted an update for (US-865 toast dedup — once per
     *  board+version). No-op if the id is not installed. */
    async setLastNotified(id: string, version: string): Promise<void> {
        await this.load();
        const entries = this.state.get().entries.map((e) =>
            e.id === id ? { ...e, lastNotifiedVersion: version } : e,
        );
        this.state.update((s) => {
            s.entries = entries;
        });
        await this.persist(entries);
    }

    /** Remove by catalog id (idempotent). */
    async remove(id: string): Promise<void> {
        await this.load();
        const entries = this.state.get().entries.filter((e) => e.id !== id);
        this.state.update((s) => {
            s.entries = entries;
        });
        await this.persist(entries);
    }

    getById(id: string): InstalledBoardEntry | undefined {
        return this.state.get().entries.find((e) => e.id === id);
    }

    getByRoot(root: string): InstalledBoardEntry | undefined {
        const key = fpNormalizeForCompare(root);
        return this.state.get().entries.find((e) => fpNormalizeForCompare(e.root) === key);
    }

    listInstalled(): InstalledBoardEntry[] {
        return this.selectInstalledEntries(this.state.get());
    }

    /** Read and validate installed entries without pruning or updating reactive state. */
    async readInstalled(): Promise<InstalledBoardEntry[]> {
        try {
            const parsed = parseInstalledEntries(await fs.getDataFile(INSTALLED_BOARDS_FILE));
            return await this.liveEntries(parsed);
        } catch {
            return [];
        }
    }

    subscribeInstalled(listener: () => void): () => void {
        return this.state.subscribe(listener, this.selectInstalledEntries);
    }

    private selectInstalledEntries(state: RegistryState): InstalledBoardEntry[] {
        return state.entries;
    }
}

export const boardInstallRegistry = new BoardInstallRegistry();
