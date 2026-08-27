import { boardInstallRegistry, type InstalledBoardEntry } from "../../api/board-install-registry";
import { listBoardUpdates, type BoardUpdate } from "../../api/board-updates";
import { publishedBoards } from "../../api/published-boards";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { InputView } from "../../uikit/Input/InputView";
import { TagView } from "../../uikit/Tag/TagView";
import { VanillaView, type IOwnedView } from "../../uikit/shared/vanilla-view";
import { openBoardInfoPage } from "../board-info/open-board-info";
import { BoardScreenshotView } from "../board-info/BoardScreenshotView";
import { boardUsageGroup, type BoardManifest, type BoardUsageGroup } from "../board/board-manifest";
import { fpNormalizeForCompare } from "../../core/utils/file-path";
import { formatBytes } from "../../core/utils/format-bytes";
import type { PublishedBoardInfo } from "../../../ipc/api-param-types";
import "../../uikit/Button/Button.css";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/Input/Input.css";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Tag/Tag.css";
import "../../uikit/Text/Text.css";

const GROUP_ORDER: BoardUsageGroup[] = ["file-viewer", "file-editor", "tool"];
const GROUP_LABELS: Record<BoardUsageGroup, string> = {
    "file-viewer": "File viewers",
    "file-editor": "File editors",
    "tool": "Tools & apps",
};

function usageGroupOf(board: PublishedBoardInfo): BoardUsageGroup {
    return boardUsageGroup({
        fileMasks: board.fileMasks,
        standalone: board.standalone,
    } as BoardManifest);
}

interface BoardCardProps {
    board: PublishedBoardInfo;
    installed: InstalledBoardEntry[];
    updates: Map<string, BoardUpdate>;
}

export class SearchBoardsTabView extends VanillaView<Record<string, never>> {
    private catalog: PublishedBoardInfo[] = [];
    private installed: InstalledBoardEntry[] = [];
    private updates = new Map<string, BoardUpdate>();
    private query = "";
    private refreshing = false;
    private alive = false;

    private input: InputView | undefined;
    private refreshButton: IconButtonView | undefined;
    private content: HTMLDivElement | undefined;
    private readonly cards = new Map<string, BoardCardView>();

    public constructor(props: Record<string, never>) {
        const root = createPanelElement({ direction: "column", flex: 1, minHeight: 0 });
        root.dataset.type = "search-boards-tab";
        super(props, root);
    }

    protected onMount(): void {
        this.alive = true;
        const toolbar = createPanelElement({
            direction: "row",
            align: "center",
            gap: "sm",
            paddingX: "lg",
            paddingBottom: "md",
            shrink: false,
        });
        this.input = this.child(new InputView(this.inputProps()));
        this.refreshButton = this.child(new IconButtonView(this.refreshButtonProps()));
        toolbar.append(this.input.root, this.refreshButton.root);

        this.content = createPanelElement({
            direction: "column",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            gap: "lg",
            paddingX: "lg",
            paddingBottom: "lg",
        });
        this.root.append(toolbar, this.content);
        this.input.mount();
        this.refreshButton.mount();

        this.own(publishedBoards.subscribeCatalog(() => {
            if (this.alive) this.syncSources();
        }));
        this.own(boardInstallRegistry.subscribeInstalled(() => {
            if (this.alive) this.syncSources();
        }));
        this.syncSources();
        void Promise.all([publishedBoards.load(), boardInstallRegistry.load()]).then(() => {
            if (this.alive) this.syncSources();
        });
    }

    protected onDispose(): void {
        this.alive = false;
        this.cards.clear();
        this.content?.replaceChildren();
    }

    private inputProps() {
        return {
            name: "search-boards-filter",
            size: "sm" as const,
            value: this.query,
            onChange: (value: string) => this.setQuery(value),
            placeholder: "Search boards…",
            tone: this.query ? "accent" as const : "default" as const,
            maxWidth: 360,
        };
    }

    private refreshButtonProps() {
        return {
            name: "search-boards-refresh",
            size: "sm" as const,
            icon: "refresh" as const,
            title: "Refresh catalog",
            disabled: this.refreshing,
            onClick: () => { void this.refresh(); },
        };
    }

    private setQuery(query: string): void {
        this.query = query;
        this.syncSources();
    }

    private async refresh(): Promise<void> {
        this.refreshing = true;
        this.refreshButton?.update(this.refreshButtonProps());
        try {
            await publishedBoards.refresh();
        } finally {
            if (this.alive) {
                this.refreshing = false;
                this.refreshButton?.update(this.refreshButtonProps());
            }
        }
    }

    private syncSources(): void {
        this.catalog = publishedBoards.getCatalog();
        this.installed = boardInstallRegistry.listInstalled();
        this.updates = new Map(listBoardUpdates().map((update) => [
            fpNormalizeForCompare(update.root),
            update,
        ]));
        this.input?.update(this.inputProps());
        this.renderCards();
    }

    private filteredBoards(): PublishedBoardInfo[] {
        const query = this.query.trim().toLowerCase();
        if (!query) return this.catalog;
        return this.catalog.filter((board) => {
            const haystack = [
                board.name,
                board.description ?? "",
                ...(board.fileMasks ?? []),
            ].join(" ").toLowerCase();
            return haystack.includes(query);
        });
    }

    private groupBoards(boards: PublishedBoardInfo[]): Map<BoardUsageGroup, PublishedBoardInfo[]> {
        const groups = new Map<BoardUsageGroup, PublishedBoardInfo[]>();
        for (const board of boards) {
            const group = usageGroupOf(board);
            let groupBoards = groups.get(group);
            if (!groupBoards) {
                groupBoards = [];
                groups.set(group, groupBoards);
            }
            groupBoards.push(board);
        }
        return groups;
    }

    private renderCards(): void {
        const content = this.content;
        if (!content) return;
        const filtered = this.filteredBoards();
        const groups = this.groupBoards(filtered);
        const visibleIds = new Set(filtered.map((board) => board.id));
        for (const [id, card] of this.cards) {
            if (visibleIds.has(id)) continue;
            this.releaseChild(card);
            this.cards.delete(id);
        }

        content.replaceChildren();
        if (this.catalog.length === 0) {
            content.append(createTextElement("No published boards available.", { size: "sm", color: "light" }));
            return;
        }
        if (filtered.length === 0) {
            content.append(createTextElement(`No boards match “${this.query}”.`, { size: "sm", color: "light" }));
            return;
        }

        for (const group of GROUP_ORDER) {
            const boards = groups.get(group);
            if (!boards) continue;
            const groupPanel = createPanelElement({ direction: "column", gap: "sm" });
            groupPanel.append(createTextElement(GROUP_LABELS[group], { size: "sm", color: "light", bold: true }));
            for (const board of boards) {
                let card = this.cards.get(board.id);
                if (!card) {
                    card = this.child(new BoardCardView({
                        board,
                        installed: this.installed,
                        updates: this.updates,
                    }));
                    this.cards.set(board.id, card);
                    card.mount();
                } else {
                    card.update({ board, installed: this.installed, updates: this.updates });
                }
                groupPanel.append(card.root);
            }
            content.append(groupPanel);
        }
    }
}

export class BoardCardView extends VanillaView<BoardCardProps> {
    private readonly screenshot: BoardScreenshotView;
    private details: HTMLDivElement | undefined;
    private readonly conditionalChildren: IOwnedView[] = [];

    public constructor(props: BoardCardProps) {
        const root = createPanelElement({
            direction: "row",
            align: "start",
            gap: "md",
            padding: "md",
            border: true,
            rounded: "md",
        });
        root.dataset.type = "board-card";
        super(props, root);
        this.screenshot = new BoardScreenshotView({ url: props.board.screenshotUrl });
    }

    protected onMount(): void {
        this.details = createPanelElement({ direction: "column", gap: "sm", flex: 1, minWidth: 0, align: "stretch" });
        this.child(this.screenshot);
        this.root.append(this.screenshot.root, this.details);
        this.screenshot.mount();
        this.sync(this.props);
    }

    protected onUpdate(props: BoardCardProps): void {
        this.screenshot.update({ url: props.board.screenshotUrl });
        this.sync(props);
    }

    protected onDispose(): void {
        this.conditionalChildren.length = 0;
        this.details?.replaceChildren();
    }

    private sync(props: BoardCardProps): void {
        const details = this.details;
        if (!details) return;
        this.clearConditionalChildren();
        details.replaceChildren();

        const installed = props.installed.find((entry) => entry.id === props.board.id);
        const update = installed ? props.updates.get(fpNormalizeForCompare(installed.root)) : undefined;
        const header = createPanelElement({ direction: "row", align: "center", gap: "sm" });
        header.append(
            createTextElement(props.board.name, { bold: true }),
            createTextElement(`v${props.board.version}`, { size: "sm", color: "light" }),
            createTextElement(formatBytes(props.board.archive.size), { size: "sm", color: "light" }),
            createPanelElement({ flex: 1, minWidth: 0 }),
        );
        if (installed && update) {
            this.addChild(header, new TagView({
                label: "Update available",
                size: "sm",
                title: `Update to v${update.latestVersion}`,
            }));
        } else if (installed) {
            this.addChild(header, new TagView({
                label: `Installed v${installed.version}`,
                size: "sm",
                variant: "outlined",
            }));
        }
        details.append(header);

        if (props.board.description) {
            details.append(createTextElement(props.board.description, { size: "sm" }));
        }

        if (props.board.fileMasks && props.board.fileMasks.length > 0) {
            const masks = createPanelElement({ direction: "row", wrap: true, gap: "xs", align: "center" });
            masks.append(createTextElement("Files:", { size: "sm", color: "light" }));
            for (const mask of props.board.fileMasks) {
                this.addChild(masks, new TagView({ label: mask, size: "sm", variant: "outlined" }));
            }
            details.append(masks);
        }

        const compatible = publishedBoards.isCompatible(props.board.minAppVersion);
        if (!compatible) {
            details.append(createTextElement(`Requires Persephone ≥ ${props.board.minAppVersion}`, {
                size: "sm",
                color: "warning",
            }));
        }

        const actions = createPanelElement({ direction: "row", gap: "sm", align: "center" });
        if (!installed) {
            this.addChild(actions, new ButtonView({
                size: "sm",
                disabled: !compatible,
                onClick: () => this.openInstall(props.board.id),
                children: "Install…",
            }));
        } else {
            if (update) {
                this.addChild(actions, new ButtonView({
                    size: "sm",
                    onClick: () => this.openProperties(installed.root),
                    children: "Update…",
                }));
            }
            this.addChild(actions, new ButtonView({
                size: "sm",
                variant: "ghost",
                onClick: () => this.openProperties(installed.root),
                children: "Properties",
            }));
        }
        details.append(actions);
    }

    private addChild<T extends IOwnedView & { mount(): HTMLElement }>(parent: HTMLElement, view: T): T {
        const child = this.child(view);
        this.conditionalChildren.push(child);
        parent.append(child.root);
        child.mount();
        return child;
    }

    private clearConditionalChildren(): void {
        for (const child of this.conditionalChildren.splice(0)) this.releaseChild(child);
    }

    private openInstall(catalogId: string): void {
        void openBoardInfoPage({ catalogId });
    }

    private openProperties(boardRoot: string): void {
        void openBoardInfoPage({ boardRoot });
    }
}
