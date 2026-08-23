import { settings } from "../../api/settings";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { TreeProviderViewImpl } from "../../components/tree-provider/TreeProviderViewImpl";
import type {
    TreeProviderViewModel,
    TreeProviderViewProps,
    TreeProviderViewSavedState,
} from "../../components/tree-provider";
import { FileTreeProvider } from "../../content/tree-providers/FileTreeProvider";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { createTextElement } from "../../uikit/Text/text-style";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "../../uikit/Button/Button.css";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";

export interface ScriptLibraryPanelProps {
    onClose?: () => void;
    explorerModel?: (model: TreeProviderViewModel | null) => void;
    expandState?: TreeProviderViewSavedState;
    onExpandStateChange?: (state: TreeProviderViewSavedState) => void;
}

type TreeProps = TreeProviderViewProps & {
    onModel?: (model: TreeProviderViewModel | null) => void;
};

export class ScriptLibraryPanelView extends VanillaView<ScriptLibraryPanelProps> {
    private readonly setupPanel: HTMLDivElement;
    private readonly setupButton: ButtonView;
    private libraryPath = "";
    private provider: FileTreeProvider | null = null;
    private treeView: TreeProviderViewImpl | undefined;
    private live = true;

    public constructor(props: ScriptLibraryPanelProps) {
        const outer = createPanelElement({
            name: "sidebar-script-library",
            direction: "column",
            height: "100%",
        });
        outer.dataset.type = "script-library-panel";
        super(props, outer);

        this.setupPanel = createPanelElement({
            name: "script-library-setup-pane",
            direction: "column",
            align: "center",
            justify: "center",
            gap: "xl",
            padding: "xl",
            flex: true,
        });
        this.setupButton = new ButtonView({
            name: "script-library-setup",
            background: "dark",
            icon: "folder-open",
            onClick: () => { void this.selectFolder(); },
            children: "Select Folder",
        });
    }

    protected onMount(): void {
        this.setupPanel.append(
            this.setupButton.root,
            createTextElement(
                "Select an existing folder with scripts or create a new one to store your saved scripts and reusable modules",
                { size: "xs", color: "light", align: "center" },
            ),
        );
        this.child(this.setupButton).mount();
        this.own(() => { this.live = false; });
        const subscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "script-library.path") this.refresh();
        });
        this.own(() => subscription.dispose());
        this.refresh();
    }

    protected onUpdate(): void {
        this.refresh();
        this.treeView?.update(this.treeProps());
    }

    private async selectFolder(): Promise<void> {
        const { showLibrarySetupDialog } = await import("../dialogs/LibrarySetupDialog");
        showLibrarySetupDialog();
    }

    private refresh(): void {
        const nextPath = settings.get("script-library.path");
        if (!nextPath) {
            this.libraryPath = "";
            this.provider = null;
            this.removeTree();
            if (!this.setupPanel.isConnected) this.root.append(this.setupPanel);
            return;
        }

        if (nextPath !== this.libraryPath || !this.provider) {
            this.libraryPath = nextPath;
            this.provider = new FileTreeProvider(nextPath);
            this.removeTree();
            this.treeView = new TreeProviderViewImpl(this.treeProps());
            this.child(this.treeView).mount();
            this.root.append(this.treeView.root);
        } else {
            this.treeView?.update(this.treeProps());
        }
        this.setupPanel.remove();
    }

    private removeTree(): void {
        if (!this.treeView) return;
        this.treeView.dispose();
        this.treeView.root.remove();
        this.treeView = undefined;
    }

    private treeProps(): TreeProps {
        return {
            provider: this.provider!,
            initialState: this.props.expandState,
            onModel: (model) => this.props.explorerModel?.(model),
            onStateChange: (state) => this.props.onExpandStateChange?.(state),
            onItemClick: (item) => {
                if (!item.isDirectory) {
                    void app.events.openRawLink.sendAsync(createLinkData(item.href));
                    this.props.onClose?.();
                }
            },
        };
    }

    protected onDispose(): void {
        this.live = false;
        this.removeTree();
        this.libraryPath = "";
    }
}
