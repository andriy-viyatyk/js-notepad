import { app } from "../../api/app";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { boardTrust } from "../../api/board-trust";
import { toolsTrust } from "../../api/tools/tools-trust";
import { registeredTools } from "../../api/tools/registered-tools";
import { createLinkData } from "../../../shared/link-data";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { showCreateBoardDialog } from "../../ui/dialogs/CreateBoardDialog";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import { fpBasename, fpNormalizeForCompare } from "../../core/utils/file-path";
import { removePin } from "../../ui/sidebar/pinned-items";
import { errMessage } from "../../../shared/utils";
import type { MenuItem } from "../../uikit/Menu";
import type { IconButtonProps } from "../../uikit/IconButton/IconButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { SplitButtonView } from "../../uikit/SplitButton/SplitButtonView";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { SegmentedControlView } from "../../uikit/SegmentedControl/SegmentedControlView";
import { DotView } from "../../uikit/Dot/DotView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createIconElement } from "../../uikit/shared/slots";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../ui/secondary-views/SideBarPanelHeaderView";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import type { ExplorerEditor, ExplorerBoardsTab } from "./ExplorerEditorModel";
import { BoardsTreeView } from "../board/BoardsTreeView";
import { ToolsTreeView } from "../tools/ToolsTreeView";
import { isBoardRootBusy, subscribeBusyBoardRoots } from "../board/busy-boards";
import "../../uikit/Button/Button.css";
import "../../uikit/SegmentedControl/SegmentedControl.css";

type BodyView = BoardsTreeView | ToolsTreeView | BoardsEmptyBodyView;

class BoardsEmptyBodyView extends VanillaView<{
    onCreate: () => void;
    onCreateDemo: () => void;
}> {
    private createButton: ButtonView | undefined;
    private createDemoButton: ButtonView | undefined;

    public constructor(props: { onCreate: () => void; onCreateDemo: () => void }) {
        super(
            props,
            createPanelElement({
                name: "boards-empty",
                flex: true,
                direction: "column",
                align: "center",
                justify: "center",
                gap: "md",
                padding: "xl",
            }),
        );
    }

    protected onMount(): void {
        this.createButton = this.child(new ButtonView(this.createButtonProps(this.props)));
        this.createDemoButton = this.child(new ButtonView(this.createDemoButtonProps(this.props)));
        const actions = createPanelElement({
            name: "boards-empty-actions",
            direction: "column",
            gap: "sm",
            align: "stretch",
        }, [this.createButton.root, this.createDemoButton.root]);
        this.root.append(
            createTextElement("No boards under this folder.", {
                color: "light",
                align: "center",
            }),
            actions,
        );
        this.createButton.mount();
        this.createDemoButton.mount();
    }

    protected onUpdate(props: { onCreate: () => void; onCreateDemo: () => void }): void {
        this.createButton?.update(this.createButtonProps(props));
        this.createDemoButton?.update(this.createDemoButtonProps(props));
    }

    private createButtonProps(props: { onCreate: () => void }): ConstructorParameters<typeof ButtonView>[0] {
        return {
            name: "boards-create-empty",
            variant: "primary",
            icon: "plus",
            onClick: props.onCreate,
            children: "Create board",
        };
    }

    private createDemoButtonProps(props: { onCreateDemo: () => void }): ConstructorParameters<typeof ButtonView>[0] {
        return {
            name: "boards-create-demo-empty",
            icon: "board",
            onClick: props.onCreateDemo,
            children: "Create Demo board",
        };
    }
}

export default class BoardsSecondaryView extends VanillaView<SecondaryViewProps> {
    private model: ExplorerEditor;
    private header: SideBarPanelHeaderHandle | undefined;
    private closeButton: IconButtonView | undefined;
    private switchBar: HTMLDivElement | undefined;
    private segmentedControl: SegmentedControlView | undefined;
    private splitButton: SplitButtonView | undefined;
    private body: BodyView | undefined;
    private bodyKind: "boards" | "tools" | "empty" | undefined;
    private readonly busyIndicators = new Map<string, DotView>();

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "boards-secondary-view",
            direction: "column",
            flex: true,
            minHeight: 0,
            overflow: "hidden",
        }));
        this.model = props.model as ExplorerEditor;
    }

    protected onMount(): void {
        this.closeButton = this.child(new IconButtonView(this.closeButtonProps()));
        this.closeButton.mount();
        this.header = createSideBarPanelHeader({
            headerHost: this.props.headerHost,
            icon: this.props.iconElement,
            title: "Boards",
            actions: this.closeButton.root,
        });
        this.own(() => this.header?.dispose());

        this.segmentedControl = this.child(new SegmentedControlView(this.segmentedProps()));
        this.segmentedControl.mount();
        this.splitButton = this.child(new SplitButtonView(this.splitButtonProps()));
        this.splitButton.mount();
        this.switchBar = createPanelElement({
            name: "boards-tools-switch-bar",
            align: "center",
            gap: "md",
            paddingX: "lg",
            paddingY: "md",
            shrink: false,
        });
        this.updateSwitchBar();

        this.bind(this.model.state, (state) => state.rootPath, () => this.refreshBody());
        this.bind(this.model.boardsTabState, (state) => state.value, () => {
            this.segmentedControl?.update(this.segmentedProps());
            this.refreshBody();
        });
        this.own(boardTrust.subscribePaths(() => this.refreshBody()));
        this.own(registeredTools.subscribeToolsets(() => this.refreshBody()));
        this.own(subscribeBusyBoardRoots(() => this.refreshBody()));

        void boardTrust.load().then(() => this.refreshBody());
        void registeredTools.ensureInitialized().then(() => this.refreshBody());
        this.refreshBody();
        this.updateHeader(this.props);
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const model = props.model as ExplorerEditor;
        if (model !== this.model) {
            this.model = model;
            this.refreshBody();
        }
        this.segmentedControl?.update(this.segmentedProps());
        this.splitButton?.update(this.splitButtonProps());
        this.updateSwitchBar();
        this.updateHeader(props);
        this.refreshBody();
    }

    protected onDispose(): void {
        this.disposeBusyIndicators();
        this.body = undefined;
        this.bodyKind = undefined;
        this.header = undefined;
        this.closeButton = undefined;
        this.switchBar = undefined;
        this.segmentedControl = undefined;
        this.splitButton = undefined;
    }

    private closeButtonProps(): IconButtonProps {
        return {
            name: "boards-close",
            size: "sm",
            title: "Close Panel",
            icon: "close",
            onClick: (event: Parameters<NonNullable<IconButtonProps["onClick"]>>[0]) => {
                event.stopPropagation();
                this.model.closeBoards();
            },
        };
    }

    private segmentedProps() {
        return {
            name: "boards-tools-switch",
            size: "sm" as const,
            value: this.model.boardsTab,
            onChange: (value: string) => {
                this.model.setBoardsTab(value as ExplorerBoardsTab);
            },
            items: [
                { value: "boards", label: "Boards" },
                { value: "tools", label: "Tools" },
            ],
        };
    }

    private splitButtonProps() {
        return {
            name: "boards-create",
            size: "sm" as const,
            icon: "plus" as const,
            onClick: () => { void this.createBoard(); },
            menuTitle: "More board options",
            items: [{
                label: "Create Demo board",
                icon: createIconElement("board", { width: 14, height: 14 }),
                onClick: () => { void this.createDemoBoard(); },
            }],
            children: "New board",
        };
    }

    private updateHeader(props: SecondaryViewProps): void {
        this.closeButton?.update(this.closeButtonProps());
        this.header?.update({
            headerHost: props.headerHost,
            icon: props.iconElement,
            title: "Boards",
            actions: this.closeButton?.root,
        });
    }

    private updateSwitchBar(): void {
        const switchBar = this.switchBar;
        const segmentedControl = this.segmentedControl;
        if (!switchBar || !segmentedControl) return;

        switchBar.replaceChildren(segmentedControl.root);
        if (this.model.boardsTab === "boards" && this.splitButton) switchBar.append(this.splitButton.root);

        if (this.props.expanded !== false) {
            const bodyRoot = this.body?.root;
            if (bodyRoot && bodyRoot.parentNode === this.root) this.root.insertBefore(switchBar, bodyRoot);
            else if (switchBar.parentNode !== this.root) this.root.append(switchBar);
        } else {
            switchBar.remove();
        }
    }

    private refreshBody(): void {
        const rootPath = this.model.rootPath;
        const boards = this.model.listBoards();
        const toolsets = this.model.listToolsets();

        if (this.model.boardsTab === "boards") {
            this.pruneBusyIndicators(boards);
            if (boards.length === 0) this.ensureEmptyBody();
            else this.ensureBoardsBody(boards, rootPath);
        } else {
            this.disposeBusyIndicators();
            this.ensureToolsBody(toolsets, rootPath);
        }
        this.updateSwitchBar();
    }

    private ensureBoardsBody(boards: string[], rootPath: string): void {
        const props = {
            name: "explorer-boards",
            boards,
            baseRoot: rootPath,
            onOpenBoard: (root: string) => this.model.openBoard(root),
            renderTrailing: (root: string): Node | undefined => this.renderTrailing(root),
            getBoardContextMenu: (root: string) => this.getBoardContextMenu(root),
        };
        if (this.bodyKind !== "boards" || !(this.body instanceof BoardsTreeView)) {
            this.replaceBody(new BoardsTreeView(props), "boards");
        } else {
            this.body.update(props);
        }
    }

    private ensureToolsBody(toolsets: Array<{ root: string; name: string }>, rootPath: string): void {
        const props = {
            name: "explorer-tools",
            toolsets,
            baseRoot: rootPath,
            onOpenToolset: (root: string) => { void this.model.openToolset(root); },
            getContextMenu: (root: string) => this.getToolsetContextMenu(root),
            emptyMessage: "No registered tools under this folder.",
        };
        if (this.bodyKind !== "tools" || !(this.body instanceof ToolsTreeView)) {
            this.replaceBody(new ToolsTreeView(props), "tools");
        } else {
            this.body.update(props);
        }
    }

    private ensureEmptyBody(): void {
        const props = {
            onCreate: () => { void this.createBoard(); },
            onCreateDemo: () => { void this.createDemoBoard(); },
        };
        if (this.bodyKind !== "empty" || !(this.body instanceof BoardsEmptyBodyView)) {
            this.replaceBody(new BoardsEmptyBodyView(props), "empty");
        } else {
            this.body.update(props);
        }
    }

    private replaceBody(next: BodyView, kind: "boards" | "tools" | "empty"): void {
        this.disposeBusyIndicators();
        if (this.body) this.releaseChild(this.body);
        this.body = this.child(next);
        this.bodyKind = kind;
        this.root.append(next.root);
        next.mount();
    }

    private renderTrailing(root: string): Node | undefined {
        if (!isBoardRootBusy(root)) return undefined;
        const key = fpNormalizeForCompare(root);
        let indicator = this.busyIndicators.get(key);
        if (!indicator) {
            indicator = this.child(new DotView({
                color: "success",
                title: "Board processes are running",
            }));
            indicator.mount();
            this.busyIndicators.set(key, indicator);
        }
        return indicator.root;
    }

    private pruneBusyIndicators(boards: string[]): void {
        const keys = new Set(boards.map((board) => fpNormalizeForCompare(board)));
        for (const [key, indicator] of this.busyIndicators) {
            if (!keys.has(key) || !isBoardRootBusy(key)) {
                this.releaseChild(indicator);
                this.busyIndicators.delete(key);
            }
        }
    }

    private disposeBusyIndicators(): void {
        for (const indicator of this.busyIndicators.values()) this.releaseChild(indicator);
        this.busyIndicators.clear();
    }

    private openBoardInNewTab(root: string): void {
        app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root), {
            sourceId: "explorer",
            explorerRoot: this.model.rootPath,
        }));
    }

    private async createBoard(): Promise<void> {
        const root = await showCreateBoardDialog({
            title: "Create board",
            template: "board-template",
            defaultFolder: this.model.rootPath,
        });
        if (root) this.model.openBoard(root);
    }

    private async createDemoBoard(): Promise<void> {
        const root = await showCreateBoardDialog({
            title: "Create Demo board",
            template: "demo-board",
            defaultName: "Demo",
            defaultFolder: this.model.rootPath,
        });
        if (root) this.model.openBoard(root);
    }

    private getBoardContextMenu(root: string): MenuItem[] {
        return [
            {
                label: "Open in New Tab",
                icon: createIconElement("open-link", { width: 14, height: 14 }),
                onClick: () => this.openBoardInNewTab(root),
            },
            {
                label: "Copy board path",
                icon: createIconElement("copy", { width: 14, height: 14 }),
                onClick: () => { void navigator.clipboard.writeText(root); },
            },
            {
                label: "Delete Board",
                icon: createIconElement("delete", { width: 14, height: 14 }),
                onClick: () => { void this.deleteBoard(root); },
                startGroup: true,
            },
        ];
    }

    private getToolsetContextMenu(root: string): MenuItem[] {
        return [{
            label: "Remove from Tools",
            icon: createIconElement("remove", { width: 14, height: 14 }),
            onClick: () => { void this.removeToolset(root); },
        }];
    }

    private async removeToolset(root: string): Promise<void> {
        await toolsTrust.untrust(root);
        ui.notify("Removed from tools", "info");
    }

    private async deleteBoard(root: string): Promise<void> {
        const name = fpBasename(root);
        const onDisk = await fs.exists(root);
        const confirmed = await showConfirmationDialog({
            title: onDisk ? "Delete board" : "Remove board",
            message: onDisk
                ? `Delete board "${name}"? This permanently removes its folder and all its files.`
                : `Board "${name}" no longer exists on disk. Remove it from the list?`,
            buttons: [onDisk ? "Delete" : "Remove", "Cancel"],
        });
        if (confirmed === "Cancel" || !confirmed) return;
        try {
            if (onDisk) await fs.removeDir(root, true);
        } catch (error) {
            ui.notify(errMessage(error), "error");
            return;
        }
        await boardTrust.untrust(root);
        removePin({ kind: "board", root });
    }
}
