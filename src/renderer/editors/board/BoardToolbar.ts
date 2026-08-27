import { app } from "../../api/app";
import { boardTrust } from "../../api/board-trust";
import { publishedBoards } from "../../api/published-boards";
import { boardInstallRegistry } from "../../api/board-install-registry";
import { listBoardUpdates } from "../../api/board-updates";
import { createLinkData } from "../../../shared/link-data";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { fpNormalizeForCompare } from "../../core/utils/file-path";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement, applyTextAttributes, resolveTextAttributes } from "../../uikit/Text/text-style";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { DotView } from "../../uikit/Dot/DotView";
import { PopoverView, type PopoverViewProps } from "../../uikit/Popover/PopoverView";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { SwitchWidgetView } from "../base/PageToolbarView";
import { openBoardInfo } from "../board-info/open-board-info";
import { BoardsTreeView } from "./BoardsTreeView";
import type { BoardEditorModel } from "./BoardEditorModel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/Dot/Dot.css";

interface BoardSwitcherContentProps {
    boards: string[];
    baseRoot?: string;
    onOpenBoard: (root: string) => void;
}

class BoardSwitcherContentView extends VanillaView<BoardSwitcherContentProps> {
    private readonly tree: BoardsTreeView;

    public constructor(props: BoardSwitcherContentProps, host: HTMLElement) {
        const tree = new BoardsTreeView({
            name: "board-toolbar-boards",
            boards: props.boards,
            baseRoot: props.baseRoot,
            onOpenBoard: props.onOpenBoard,
        });
        const root = createPanelElement({
            direction: "column",
            width: 360,
            padding: "xs",
        }, [createPanelElement({
            direction: "column",
            height: 320,
        }, [createPanelElement({
            direction: "column",
            flex: true,
            height: 0,
        }, [tree.root])])]);
        super(props, root);
        this.tree = this.child(tree);
        host.append(this.root);
    }

    protected onMount(): void {
        this.tree.mount();
    }

    protected onUpdate(props: BoardSwitcherContentProps): void {
        this.tree.update({
            name: "board-toolbar-boards",
            boards: props.boards,
            baseRoot: props.baseRoot,
            onOpenBoard: props.onOpenBoard,
        });
    }
}

export class BoardToolbarView extends VanillaView<{ model: BoardEditorModel }> {
    private readonly model: BoardEditorModel;
    private readonly pathPanel = createPanelElement({
        direction: "row", align: "center", flex: true, width: 0, overflow: "hidden",
    });
    private readonly pathText = createTextElement("", { size: "sm", color: "light", truncate: true });
    private readonly propertiesPanel = createPanelElement({
        position: "relative", direction: "row", align: "center",
    });
    private readonly explorerButton: IconButtonView;
    private readonly reloadButton: IconButtonView;
    private readonly logButton: IconButtonView;
    private readonly propertiesButton: IconButtonView;
    private readonly switchWidget: SwitchWidgetView;
    private dot: DotView | undefined;
    private popover: PopoverView | undefined;
    private switcherContent: BoardSwitcherContentView | undefined;
    private boardRoot: string | undefined;
    private explorerRoot: string | undefined;
    private boards: string[] = [];
    private canSwitch = false;
    private open = false;

    public constructor(props: { model: BoardEditorModel }) {
        super(props, createPanelElement({
            name: "board-toolbar",
            direction: "row",
            align: "center",
            gap: "sm",
            padding: "xs",
            shrink: false,
        }));
        this.model = props.model;
        this.explorerButton = new IconButtonView({
            name: "board-toolbar-explorer", size: "sm", title: "File Explorer",
            icon: createIconElement("nav-panel", { width: 14, height: 14 }),
            onClick: () => void this.model.page?.toggleNavigator(null, this.boardRoot),
        });
        this.reloadButton = new IconButtonView({
            name: "board-toolbar-reload", size: "sm", title: "Reload board",
            icon: createIconElement("refresh", { width: 14, height: 14 }),
            onClick: () => this.model.reloadBoard(),
        });
        this.logButton = new IconButtonView({
            name: "board-toolbar-log", size: "sm", title: "Open board log",
            icon: createIconElement("log", { width: 14, height: 14 }),
            onClick: () => void this.openLog(),
        });
        this.propertiesButton = new IconButtonView({
            name: "board-toolbar-properties", size: "sm", title: "Board properties",
            icon: createIconElement("info", { width: 14, height: 14 }),
            onClick: () => void this.openProperties(),
        });
        this.switchWidget = new SwitchWidgetView({ model: props.model });
    }

    protected onMount(): void {
        this.pathPanel.append(this.pathText);
        this.propertiesPanel.append(this.propertiesButton.root);
        this.root.append(
            this.explorerButton.root,
            this.pathPanel,
            this.reloadButton.root,
            this.logButton.root,
            this.propertiesPanel,
            this.switchWidget.root,
        );
        this.child(this.explorerButton).mount();
        this.child(this.reloadButton).mount();
        this.child(this.logButton).mount();
        this.child(this.propertiesButton).mount();
        this.child(this.switchWidget).mount();
        this.listen(this.pathText, "click", this.handlePathClick);
        this.own(boardTrust.subscribePaths(this.sync));
        this.own(publishedBoards.subscribeCatalog(this.sync));
        this.own(boardInstallRegistry.subscribeInstalled(this.sync));
        void publishedBoards.load();
        void boardInstallRegistry.load();
        this.bind(this.model.state, (state) => ({
            boardRoot: state.boardRoot,
            explorerRoot: state.sourceLink?.explorerRoot,
        }), this.sync);
    }

    protected onUpdate(): void {
        this.sync();
    }

    protected onDispose(): void {
        this.switcherContent = undefined;
        if (this.popover) {
            this.releaseChild(this.popover);
            this.popover = undefined;
        }
        if (this.dot) {
            this.releaseChild(this.dot);
            this.dot = undefined;
        }
    }

    private readonly sync = (): void => {
        this.boardRoot = this.model.state.get().boardRoot;
        this.explorerRoot = this.model.state.get().sourceLink?.explorerRoot;
        this.canSwitch = !!this.explorerRoot;
        this.boards = this.getScopedBoards();
        this.pathText.textContent = this.boardRoot ?? "";
        applyTextAttributes(this.pathText, resolveTextAttributes({
            size: "sm", color: "light", truncate: true, hoverUnderline: this.canSwitch,
        }));
        const hasUpdate = !!this.boardRoot && listBoardUpdates().some((update) =>
            fpNormalizeForCompare(update.root) === fpNormalizeForCompare(this.boardRoot!),
        );
        this.propertiesButton.update({
            name: "board-toolbar-properties",
            size: "sm",
            title: hasUpdate ? "Board properties — update available" : "Board properties",
            icon: createIconElement("info", { width: 14, height: 14 }),
            onClick: () => void this.openProperties(),
        });
        if (hasUpdate && !this.dot) {
            this.dot = this.child(new DotView({
                name: "board-toolbar-update-dot", color: "info", size: "xs", bordered: true,
            }));
            this.propertiesPanel.append(this.dot.root);
            this.dot.mount();
        } else if (!hasUpdate && this.dot) {
            this.releaseChild(this.dot);
            this.dot = undefined;
        }
        if (this.canSwitch && !this.popover) this.createPopover();
        if (!this.canSwitch && this.popover) {
            this.releaseChild(this.popover);
            this.popover = undefined;
            this.switcherContent = undefined;
        }
        if (this.switcherContent) {
            this.switcherContent.update({
                boards: this.boards, baseRoot: this.explorerRoot, onOpenBoard: this.openBoard,
            });
        }
        if (this.popover) {
            this.popover.update(this.popoverProps());
        }
    };

    private createPopover(): void {
        const popover = this.child(new PopoverView(this.popoverProps()));
        this.popover = popover;
        this.root.append(popover.root);
        popover.mount();
    }

    private popoverProps(): PopoverViewProps {
        return {
            name: "board-toolbar-switcher",
            open: this.open && this.canSwitch,
            elementRef: this.pathPanel,
            onClose: this.closePopover,
            placement: "bottom-start",
            contentView: (host) => {
                const content = new BoardSwitcherContentView({
                    boards: this.boards,
                    baseRoot: this.explorerRoot,
                    onOpenBoard: this.openBoard,
                }, host);
                this.switcherContent = content;
                return content;
            },
        };
    }

    private readonly handlePathClick = (): void => {
        if (!this.canSwitch) return;
        this.open = !this.open;
        if (!this.open) this.switcherContent = undefined;
        this.popover?.update(this.popoverProps());
    };

    private readonly closePopover = (): void => {
        this.open = false;
        this.switcherContent = undefined;
        this.popover?.update(this.popoverProps());
    };

    private readonly openBoard = (root: string): void => {
        this.open = false;
        this.switcherContent = undefined;
        this.popover?.update(this.popoverProps());
        void app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root), {
            pageId: this.model.page?.id ?? "",
            sourceId: "board-toolbar",
            explorerRoot: this.explorerRoot,
        }));
    };

    private async openProperties(): Promise<void> {
        const id = this.model.page?.id;
        const page = id ? app.pages.pages.find((candidate) => candidate.id === id) : undefined;
        if (page) await openBoardInfo(page, { boardRoot: this.boardRoot });
    }

    private async openLog(): Promise<void> {
        const logPath = this.model.getSelectedBoardLogPath();
        if (logPath) await app.events.openRawLink.sendAsync(createLinkData(logPath));
    }

    private getScopedBoards(): string[] {
        if (!this.explorerRoot) return [];
        const rootKey = fpNormalizeForCompare(this.explorerRoot);
        return boardTrust.listPaths().filter((path) => {
            const key = fpNormalizeForCompare(path);
            return key === rootKey || key.startsWith(rootKey + "/");
        });
    }
}
