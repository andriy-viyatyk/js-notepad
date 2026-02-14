import { TComponentState, TOneState } from "../../core/state/state";
import { NavTreeItem, buildNavTree } from "../../core/utils/nav-tree";

export interface NavPanelState {
    open: boolean;
    width: number;
    rootFilePath: string;
    tree: NavTreeItem | null;
    currentFilePath: string;
}

const DEFAULT_WIDTH = 240;

export class NavPanelModel {
    state: TComponentState<NavPanelState>;

    constructor(rootFilePath: string) {
        this.state = new TComponentState<NavPanelState>({
            open: true,
            width: DEFAULT_WIDTH,
            rootFilePath,
            tree: null,
            currentFilePath: rootFilePath,
        });
        this.buildTree();
    }

    buildTree = () => {
        const { rootFilePath } = this.state.get();
        try {
            const tree = buildNavTree(rootFilePath);
            this.state.update((s) => {
                s.tree = tree;
            });
        } catch {
            // If tree building fails, leave tree as null
        }
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

// Global store: Map<pageId, NavPanelModel>
const navPanels = new Map<string, NavPanelModel>();

// Reactive version counter — increments when panels are added/removed.
// Components use navPanelVersion.use() to re-render on changes.
export const navPanelVersion = new TOneState(0);
function bumpVersion() {
    navPanelVersion.set(navPanelVersion.get() + 1);
}

export function getNavPanel(pageId: string): NavPanelModel | undefined {
    return navPanels.get(pageId);
}

export function getOrCreateNavPanel(pageId: string, rootFilePath: string): NavPanelModel {
    let panel = navPanels.get(pageId);
    if (!panel) {
        panel = new NavPanelModel(rootFilePath);
        navPanels.set(pageId, panel);
        bumpVersion();
    }
    return panel;
}

export function removeNavPanel(pageId: string): void {
    if (navPanels.has(pageId)) {
        navPanels.delete(pageId);
        bumpVersion();
    }
}

export function transferNavPanel(oldPageId: string, newPageId: string): void {
    const panel = navPanels.get(oldPageId);
    if (panel) {
        navPanels.delete(oldPageId);
        navPanels.set(newPageId, panel);
        bumpVersion();
    }
}
