import { ui } from "../../api/ui";
import { registeredTools } from "../../api/tools/registered-tools";
import { toolsTrust } from "../../api/tools/tools-trust";
import { openToolset } from "../../content/persephone-toolset-link";
import { ToolsTreeView } from "../../editors/tools/ToolsTreeView";
import type { MenuItem } from "../../uikit/Menu";
import { createTextElement } from "../../uikit/Text/text-style";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";

export interface TrustedToolsListProps {
    onClose?: () => void;
}

export class TrustedToolsListView extends VanillaView<TrustedToolsListProps> {
    private tree: ToolsTreeView | undefined;
    private alive = false;

    public constructor(props: TrustedToolsListProps) {
        super(props);
        this.root.dataset.type = "trusted-tools-list";
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.alive = true;

        const tree = this.child(new ToolsTreeView(this.treeProps()));
        this.tree = tree;
        this.root.append(tree.root);
        tree.mount();

        this.own(registeredTools.subscribeToolsets(this.refresh));
        this.refresh();
        void registeredTools.ensureInitialized().then(this.refreshIfAlive, this.refreshIfAlive);
    }

    protected onUpdate(): void {
        this.refresh();
    }

    protected onDispose(): void {
        this.alive = false;
        this.tree = undefined;
    }

    private readonly refreshIfAlive = (): void => {
        if (this.alive) this.refresh();
    };

    private readonly refresh = (): void => {
        if (!this.alive) return;
        this.tree?.update(this.treeProps());
    };

    private readonly openToolset = (root: string): void => {
        openToolset(root);
        this.props.onClose?.();
    };

    private readonly removeToolset = async (root: string): Promise<void> => {
        await toolsTrust.untrust(root);
        ui.notify("Removed from tools", "info");
    };

    private readonly getContextMenu = (root: string): MenuItem[] => [
        {
            label: "Remove",
            icon: createIconElement("remove", { width: 14, height: 14 }),
            onClick: () => { void this.removeToolset(root); },
        },
    ];

    private treeProps() {
        return {
            name: "sidebar-trusted-tools-list",
            toolsets: registeredTools.toolsets.map((toolset) => ({
                root: toolset.root,
                name: toolset.name,
            })),
            onOpenToolset: this.openToolset,
            getContextMenu: this.getContextMenu,
            emptyMessage: createTextElement("No registered tools yet", { size: "sm", color: "light" }),
        };
    }
}
