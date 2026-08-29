import { TModel } from "../../core/state/model";
import { TGlobalState } from "../../core/state/state";
import { FileWatcher } from "../../core/utils/file-watcher";
import { fs } from "../../api/fs";

const MAX_ENTRIES = 2000;

function getFileName(profileName: string): string {
    return `browserSearchHistory-${profileName || "default"}.txt`;
}

// ============================================================================
// SearchHistoryStorage — one instance per profile, created on demand
// ============================================================================

const defaultSearchHistoryState = {
    entries: [] as string[],
};

type SearchHistoryState = typeof defaultSearchHistoryState;

class SearchHistoryStorage extends TModel<SearchHistoryState> {
    private profileName: string;
    private fileWatcher: FileWatcher | undefined;
    private skipNextFileChange = false;
    private loaded = false;

    constructor(profileName: string) {
        super(new TGlobalState(defaultSearchHistoryState));
        this.profileName = profileName;
        this.init();
    }

    private init = async () => {
        const fileName = getFileName(this.profileName);
        await fs.prepareDataFile(fileName, "");
        this.fileWatcher = new FileWatcher(
            await fs.dataFileName(fileName),
            this.fileChanged,
        );
        await this.load();
    };

    private fileChanged = () => {
        if (this.skipNextFileChange) {
            this.skipNextFileChange = false;
            return;
        }
        this.load();
    };

    load = async (): Promise<string[]> => {
        const fileName = getFileName(this.profileName);
        const data = await fs.getDataFile(fileName);
        const entries = (data ?? "")
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s);
        this.state.update((s) => {
            s.entries = entries;
        });
        this.loaded = true;
        return entries;
    };

    private save = async (entries: string[]) => {
        this.skipNextFileChange = true;
        const fileName = getFileName(this.profileName);
        await fs.saveDataFile(fileName, entries.join("\n"));
    };

    add = async (query: string): Promise<void> => {
        query = query.trim();
        if (!query) return;
        if (!this.loaded) await this.load();

        const entries = this.state.get().entries;
        let newEntries = [query, ...entries.filter((e) => e !== query)];
        if (newEntries.length > MAX_ENTRIES) {
            newEntries = newEntries.slice(0, MAX_ENTRIES);
        }
        this.state.update((s) => {
            s.entries = newEntries;
        });
        await this.save(newEntries);
    };

    getAll = (): string[] => {
        return this.state.get().entries;
    };

    removeMany = async (queries: string[]): Promise<void> => {
        const toRemove = new Set(queries);
        const entries = this.state.get().entries;
        const newEntries = entries.filter((e) => !toRemove.has(e));
        this.state.update((s) => {
            s.entries = newEntries;
        });
        await this.save(newEntries);
    };

    clear = async (): Promise<void> => {
        this.state.update((s) => {
            s.entries = [];
        });
        await this.save([]);
    };

    dispose = () => {
        this.fileWatcher?.dispose();
        // Drain the model's DisposableStore after existing teardown.
        super.dispose();
    };
}

// ============================================================================
// SearchHistoryManager — singleton lazy factory
// ============================================================================

class SearchHistoryManager {
    private storages = new Map<string, SearchHistoryStorage>();

    /** Get or create a SearchHistoryStorage for the given profile. */
    get(profileName: string, isIncognito: boolean): SearchHistoryStorage | undefined {
        if (isIncognito) return undefined;

        const key = profileName || "default";
        let storage = this.storages.get(key);
        if (!storage) {
            storage = new SearchHistoryStorage(profileName);
            this.storages.set(key, storage);
        }
        return storage;
    }
}

export const searchHistoryManager = new SearchHistoryManager();
