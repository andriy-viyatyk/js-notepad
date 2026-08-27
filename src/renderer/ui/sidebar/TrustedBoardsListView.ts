import { app } from "../../api/app";
import { ui } from "../../api/ui";
import { boardInstallRegistry } from "../../api/board-install-registry";
import { boardTrust } from "../../api/board-trust";
import { listBoardUpdates, runBoardUpdate, type BoardUpdate } from "../../api/board-updates";
import { publishedBoards } from "../../api/published-boards";
import { settings } from "../../api/settings";
import { createLinkData } from "../../../shared/link-data";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { getBoardUsageSync, resolveBoardUsage } from "../../editors/board/board-usage-cache";
import { BoardsTreeView } from "../../editors/board/BoardsTreeView";
import { fpDirname, fpNormalizeForCompare } from "../../core/utils/file-path";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import type { MenuItem } from "../../uikit/Menu";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { TagView } from "../../uikit/Tag/TagView";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { addPin, decodePin, getPinnedStrings, removePin } from "./pinned-items";

export interface TrustedBoardsListProps {
    onClose?: () => void;
}

interface BoardTrailingRecord {
    panel?: HTMLDivElement;
    tag?: TagView;
    pinButton?: IconButtonView;
}

export class TrustedBoardsListView extends VanillaView<TrustedBoardsListProps> {
    private tree: BoardsTreeView | undefined;
    private readonly trailingRecords = new Map<string, BoardTrailingRecord>();
    private readonly usageProbes = new Set<string>();
    private pinnedRoots = new Set<string>();
    private updates = new Map<string, BoardUpdate>();
    private alive = false;

    public constructor(props: TrustedBoardsListProps) {
        super(props);
        this.root.dataset.type = "trusted-boards-list";
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.alive = true;

        const tree = this.child(new BoardsTreeView(this.treeProps()));
        this.tree = tree;
        this.root.append(tree.root);
        tree.mount();

        this.own(boardTrust.subscribePaths(this.refresh));
        this.own(publishedBoards.subscribeCatalog(this.refresh));
        this.own(boardInstallRegistry.subscribeInstalled(this.refresh));
        const settingsSubscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "pinned-editors") this.refresh();
        });
        this.own(() => settingsSubscription.dispose());

        this.refresh();
        void boardTrust.load().then(this.refreshIfAlive, this.refreshIfAlive);
        void publishedBoards.load().then(this.refreshIfAlive, this.refreshIfAlive);
        void boardInstallRegistry.load().then(this.refreshIfAlive, this.refreshIfAlive);
    }

    protected onUpdate(): void {
        this.refresh();
    }

    protected onDispose(): void {
        this.alive = false;
        for (const record of this.trailingRecords.values()) record.panel?.remove();
        this.trailingRecords.clear();
        this.usageProbes.clear();
        this.pinnedRoots.clear();
        this.updates.clear();
        this.tree = undefined;
    }

    private readonly refreshIfAlive = (): void => {
        if (this.alive) this.refresh();
    };

    private readonly refresh = (): void => {
        if (!this.alive) return;

        this.pruneTrailingRecords();
        this.pinnedRoots = new Set(
            getPinnedStrings()
                .filter((stored) => stored.startsWith("board:"))
                .map(decodePin)
                .filter((ref): ref is { kind: "board"; root: string } => ref.kind === "board")
                .map((ref) => ref.root),
        );
        this.updates = new Map(
            listBoardUpdates().map((update) => [fpNormalizeForCompare(update.root), update]),
        );
        this.tree?.update(this.treeProps());
    };

    private readonly openBoard = (root: string): void => {
        void app.events.openRawLink.sendAsync(
            createLinkData(encodePersephoneBoardLink(root), { explorerRoot: fpDirname(root) }),
        );
        this.props.onClose?.();
    };

    private readonly togglePin = (root: string, event: MouseEvent): void => {
        event.stopPropagation();
        const ref = { kind: "board" as const, root };
        if (this.pinnedRoots.has(root)) removePin(ref);
        else addPin(ref);
    };

    private readonly removeBoard = async (root: string): Promise<void> => {
        await boardTrust.untrust(root);
        removePin({ kind: "board", root });
        ui.notify("Removed from trusted boards", "info");
    };

    private readonly getBoardContextMenu = (root: string): MenuItem[] => {
        const update = this.updates.get(fpNormalizeForCompare(root));
        const items: MenuItem[] = [];
        if (update) {
            items.push({
                label: `Update to v${update.latestVersion}`,
                onClick: () => { void runBoardUpdate(update); },
            });
        }
        items.push(
            { label: "Copy board path", onClick: () => { void navigator.clipboard.writeText(root); } },
            {
                label: "Remove",
                onClick: () => { void this.removeBoard(root); },
                startGroup: true,
            },
        );
        return items;
    };

    private readonly trailingVisible = (root: string): boolean =>
        this.pinnedRoots.has(root) || this.updates.has(fpNormalizeForCompare(root));

    private readonly trailingElement = (root: string): Node | undefined => {
        let record = this.trailingRecords.get(root);
        if (!record) {
            record = {};
            this.trailingRecords.set(root, record);
        }

        const usage = getBoardUsageSync(root);
        if (usage === undefined) this.probeBoardUsage(root);
        const canPin = usage !== undefined && usage !== "file-viewer";
        if (canPin) {
            const pinned = this.pinnedRoots.has(root);
            const pinProps = {
                size: "sm" as const,
                icon: pinned ? "pin-filled" as const : "pin" as const,
                title: pinned ? "Unpin" : "Pin to menu",
                onClick: (event: MouseEvent) => this.togglePin(root, event),
            };
            if (!record.pinButton) {
                const pinButton = this.child(new IconButtonView(pinProps));
                pinButton.mount();
                record.pinButton = pinButton;
            } else {
                record.pinButton.update(pinProps);
            }
        } else if (record.pinButton) {
            this.releaseChild(record.pinButton);
            record.pinButton = undefined;
        }

        const update = this.updates.get(fpNormalizeForCompare(root));
        if (!update) {
            if (record.tag) {
                this.releaseChild(record.tag);
                record.tag = undefined;
            }
            record.panel?.remove();
            record.panel = undefined;
            return record.pinButton?.root;
        }

        const tagProps = {
            label: "Update",
            size: "sm" as const,
            title: `Update to v${update.latestVersion}`,
            onClick: () => { void runBoardUpdate(update); },
        };
        if (!record.tag) {
            const tag = this.child(new TagView(tagProps));
            tag.mount();
            record.tag = tag;
        } else {
            record.tag.update(tagProps);
        }

        if (!record.panel) {
            record.panel = createPanelElement({
                name: "board-trailing",
                direction: "row",
                align: "center",
                gap: "xs",
            });
        }
        const children: Node[] = [record.tag.root];
        if (record.pinButton) children.push(record.pinButton.root);
        record.panel.append(...children);
        return record.panel;
    };

    private readonly probeBoardUsage = (root: string): void => {
        if (this.usageProbes.has(root)) return;
        this.usageProbes.add(root);
        void resolveBoardUsage(root).then(this.refreshIfAlive, this.refreshIfAlive);
    };

    private pruneTrailingRecords(): void {
        const trustedRoots = new Set(
            boardTrust.listPaths().map((root) => fpNormalizeForCompare(root)),
        );
        for (const [root, record] of this.trailingRecords) {
            if (trustedRoots.has(fpNormalizeForCompare(root))) continue;
            if (record.tag) this.releaseChild(record.tag);
            if (record.pinButton) this.releaseChild(record.pinButton);
            record.panel?.remove();
            this.usageProbes.delete(root);
            this.trailingRecords.delete(root);
        }
    }

    private treeProps() {
        return {
            name: "sidebar-trusted-boards-list",
            boards: boardTrust.listPaths(),
            onOpenBoard: this.openBoard,
            trailingVisible: this.trailingVisible,
            trailingElement: this.trailingElement,
            getBoardContextMenu: this.getBoardContextMenu,
            emptyMessage: createTextElement("No trusted boards yet", { size: "sm", color: "light" }),
        };
    }
}
