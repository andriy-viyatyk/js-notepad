import { TComponentState } from "../../core/state/state";
import { FileExplorerSavedState } from "../../components/file-explorer";
import { filesModel } from "../../store/files-store";
import { parseObject } from "../../core/utils/parse-utils";
import { debounce } from "../../../shared/utils";

export interface NavPanelState {
    open: boolean;
    width: number;
    rootFilePath: string;
    currentFilePath: string;
}

/** Subset of NavPanelState that gets persisted to disk */
interface NavPanelSavedState {
    open: boolean;
    width: number;
    rootFilePath: string;
    currentFilePath: string;
    fileExplorerState?: FileExplorerSavedState;
}

const DEFAULT_WIDTH = 240;

export class NavPanelModel {
    state: TComponentState<NavPanelState>;
    id: string | undefined = undefined;
    private name = "nav-panel";
    private unsubscribe: (() => void) | undefined = undefined;
    private skipSave = false;
    /** Stored FileExplorer state — used to pass initialState on restore */
    fileExplorerState: FileExplorerSavedState | undefined = undefined;
    /** Scroll position to restore after navigation (not persisted to disk) */
    scrollTop = 0;

    constructor(rootFilePath: string, currentFilePath?: string) {
        this.state = new TComponentState<NavPanelState>({
            open: true,
            width: DEFAULT_WIDTH,
            rootFilePath,
            currentFilePath: currentFilePath || rootFilePath,
        });
        this.unsubscribe = this.state.subscribe(this.saveStateDebounced);
    }

    /** Restore NavPanel state from cache file */
    restore = async (id: string) => {
        this.id = id;
        const data = await filesModel.getCacheFile(id, this.name);
        const saved = parseObject(data) as NavPanelSavedState | undefined;
        if (saved) {
            this.skipSave = true;
            this.fileExplorerState = saved.fileExplorerState;
            this.state.set({
                open: saved.open ?? true,
                width: saved.width ?? DEFAULT_WIDTH,
                rootFilePath: saved.rootFilePath,
                currentFilePath: saved.currentFilePath,
            });
        }
    };

    private saveState = async (): Promise<void> => {
        if (this.skipSave) {
            this.skipSave = false;
            return;
        }
        if (!this.id) return;

        const { open, width, rootFilePath, currentFilePath } = this.state.get();
        const saved: NavPanelSavedState = {
            open,
            width,
            rootFilePath,
            currentFilePath,
            fileExplorerState: this.fileExplorerState,
        };
        await filesModel.saveCacheFile(this.id, JSON.stringify(saved), this.name);
    };

    private saveStateDebounced = debounce(this.saveState, 300);

    /** Flush any pending save immediately */
    flushSave = async () => {
        await this.saveState();
    };

    /** Called when NavPanel is transferred to a new page (navigation) */
    updateId = (newId: string) => {
        this.id = newId;
        // Trigger immediate save with the new pageId
        this.saveStateDebounced();
    };

    dispose = () => {
        this.unsubscribe?.();
    };

    setFileExplorerState = (explorerState: FileExplorerSavedState) => {
        this.fileExplorerState = explorerState;
        this.saveStateDebounced();
    };

    toggle = () => {
        this.state.update((s) => {
            s.open = !s.open;
        });
    };

    setWidth = (width: number) => {
        this.state.update((s) => {
            s.width = Math.max(120, width);
        });
    };

    setCurrentFilePath = (filePath: string) => {
        this.state.update((s) => {
            s.currentFilePath = filePath;
        });
    };

    close = () => {
        this.state.update((s) => {
            s.open = false;
        });
    };
}
