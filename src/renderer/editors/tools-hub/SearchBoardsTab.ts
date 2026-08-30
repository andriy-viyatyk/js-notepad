import { boardInstallRegistry, type InstalledBoardEntry } from "../../api/board-install-registry";
import { listBoardUpdates, type BoardUpdate } from "../../api/board-updates";
import { publishedBoards } from "../../api/published-boards";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { InputView } from "../../uikit/Input/InputView";
import { TagView } from "../../uikit/Tag/TagView";
import { claimViewOwnership, VanillaView, type IOwnedView } from "../../uikit/shared/vanilla-view";
import { KeyedList } from "../../uikit/shared/keyed-list";
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

interface BoardGroupProps {
    group: BoardUsageGroup;
    boards: PublishedBoardInfo[];
    installed: InstalledBoardEntry[];
    updates: Map<string, BoardUpdate>;
    createCard: (props: BoardCardProps) => BoardCardView;
    releaseCard: (id: string, card: BoardCardView) => void;
}

interface BoardDetailsSignature {
    id: string;
    name: string;
    version: string;
    size: number;
    description: string | null;
    fileMasks: string[] | null;
    minAppVersion: string | null;
    installedId: string | null;
    installedRoot: string | null;
    installedVersion: string | null;
    updateVersion: string | null;
}

type BoardGroupRoot = HTMLElement & { view?: BoardGroupView };

function sameBoardDetails(a: BoardDetailsSignature | undefined, b: BoardDetailsSignature): boolean {
    if (!a
        || a.id !== b.id
        || a.name !== b.name
        || a.version !== b.version
        || a.size !== b.size
        || a.description !== b.description
        || a.minAppVersion !== b.minAppVersion
        || a.installedId !== b.installedId
        || a.installedRoot !== b.installedRoot
        || a.installedVersion !== b.installedVersion
        || a.updateVersion !== b.updateVersion) return false;
    if (a.fileMasks === null || b.fileMasks === null) return a.fileMasks === b.fileMasks;
    return a.fileMasks.length === b.fileMasks.length
        && a.fileMasks.every((mask, index) => mask === b.fileMasks[index]);
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
    private groupsHost: HTMLDivElement | undefined;
    private emptyMessage: HTMLSpanElement | undefined;
    private groups: KeyedList<BoardGroupItem, BoardUsageGroup, HTMLElement> | undefined;
    private readonly cards = new Map<string, BoardCardView>();

    public constructor(props: Record<string, never>) {
        const root = createPanelElement({
            name: "search-boards-tab",
            direction: "column",
            flex: 1,
            minHeight: 0,
        });
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
        this.groupsHost = createPanelElement({ direction: "column", gap: "lg" });
        this.emptyMessage = createTextElement("", { size: "sm", color: "light" });
        this.emptyMessage.hidden = true;
        this.content.append(this.groupsHost, this.emptyMessage);
        this.root.append(toolbar, this.content);
        this.groups = new KeyedList<BoardGroupItem, BoardUsageGroup, HTMLElement>(this.groupsHost, {
            keyOf: (item) => item.group,
            create: (item) => this.createGroup(item),
            update: (element, item) => this.updateGroup(element, item),
            remove: (element) => this.removeGroup(element),
        });
        this.own(() => this.groups?.dispose());
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
        this.groups = undefined;
        this.groupsHost = undefined;
        this.emptyMessage = undefined;
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
        const groupsList = this.groups;
        const emptyMessage = this.emptyMessage;
        if (!groupsList || !emptyMessage) return;
        const filtered = this.filteredBoards();
        const groups = this.groupBoards(filtered);
        if (this.catalog.length === 0) {
            groupsList.update([]);
            emptyMessage.textContent = "No published boards available.";
            emptyMessage.hidden = false;
            return;
        }
        if (filtered.length === 0) {
            groupsList.update([]);
            emptyMessage.textContent = `No boards match “${this.query}”.`;
            emptyMessage.hidden = false;
            return;
        }

        emptyMessage.hidden = true;
        groupsList.update(GROUP_ORDER.flatMap((group) => {
            const groupBoards = groups.get(group);
            return groupBoards ? [{ group, boards: groupBoards }] : [];
        }));
    }

    private createGroup(item: BoardGroupItem): HTMLElement {
        const view = new BoardGroupView(this.groupProps(item));
        claimViewOwnership(view);
        (view.root as BoardGroupRoot).view = view;
        view.mount();
        return view.root;
    }

    private updateGroup(element: HTMLElement, item: BoardGroupItem): void {
        (element as BoardGroupRoot).view?.update(this.groupProps(item));
    }

    private removeGroup(element: HTMLElement): void {
        const root = element as BoardGroupRoot;
        root.view?.dispose();
        delete root.view;
    }

    private groupProps(item: BoardGroupItem): BoardGroupProps {
        return {
            group: item.group,
            boards: item.boards,
            installed: this.installed,
            updates: this.updates,
            createCard: (props) => this.createCard(props),
            releaseCard: (id, card) => this.releaseCard(id, card),
        };
    }

    private createCard(props: BoardCardProps): BoardCardView {
        const card = this.child(new BoardCardView(props));
        this.cards.set(props.board.id, card);
        card.mount();
        return card;
    }

    private releaseCard(id: string, card: BoardCardView): void {
        this.releaseChild(card);
        if (this.cards.get(id) === card) this.cards.delete(id);
    }
}

interface BoardGroupItem {
    group: BoardUsageGroup;
    boards: PublishedBoardInfo[];
}

class BoardGroupView extends VanillaView<BoardGroupProps> {
    private cards: KeyedList<PublishedBoardInfo, string, HTMLElement> | undefined;
    private readonly cardViews = new Map<HTMLElement, BoardCardView>();

    protected onMount(): void {
        const heading = createTextElement(GROUP_LABELS[this.props.group], { size: "sm", color: "light", bold: true });
        const cardsHost = createPanelElement({ direction: "column", gap: "sm" });
        this.root.append(heading, cardsHost);
        this.cards = new KeyedList<PublishedBoardInfo, string, HTMLElement>(cardsHost, {
            keyOf: (board) => board.id,
            create: (board) => this.createCard(board),
            update: (element, board) => this.updateCard(element, board),
            remove: (element, board) => this.removeCard(element, board),
        });
        this.own(() => this.cards?.dispose());
        this.sync(this.props);
    }

    protected onUpdate(props: BoardGroupProps): void {
        this.sync(props);
    }

    protected onDispose(): void {
        this.cardViews.clear();
        this.cards = undefined;
    }

    private sync(props: BoardGroupProps): void {
        this.cards?.update(props.boards);
    }

    private createCard(board: PublishedBoardInfo): HTMLElement {
        const view = this.props.createCard({ board, installed: this.props.installed, updates: this.props.updates });
        this.cardViews.set(view.root, view);
        return view.root;
    }

    private updateCard(element: HTMLElement, board: PublishedBoardInfo): void {
        this.cardViews.get(element)?.update({ board, installed: this.props.installed, updates: this.props.updates });
    }

    private removeCard(element: HTMLElement, board: PublishedBoardInfo): void {
        const view = this.cardViews.get(element);
        if (view) this.props.releaseCard(board.id, view);
        this.cardViews.delete(element);
    }
}

export class BoardCardView extends VanillaView<BoardCardProps> {
    private readonly screenshot: BoardScreenshotView;
    private details: HTMLDivElement | undefined;
    private detailsSignature: BoardDetailsSignature | undefined;
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
        const {
            id,
            name,
            version,
            description,
            fileMasks,
            minAppVersion,
            archive: { size },
        } = props.board;
        const installed = props.installed.find((entry) => entry.id === id);
        const { id: installedId = null, root: installedRoot = null, version: installedVersion = null } = installed ?? {};
        const update = installed ? props.updates.get(fpNormalizeForCompare(installed.root)) : undefined;
        const { latestVersion: updateVersion = null } = update ?? {};
        const nextDetailsSignature: BoardDetailsSignature = {
            id,
            name,
            version,
            size,
            description: description ?? null,
            fileMasks: fileMasks ? [...fileMasks] : null,
            minAppVersion: minAppVersion ?? null,
            installedId,
            installedRoot,
            installedVersion,
            updateVersion,
        };
        if (sameBoardDetails(this.detailsSignature, nextDetailsSignature)) return;
        this.detailsSignature = nextDetailsSignature;
        this.clearConditionalChildren();
        details.replaceChildren();
        const header = createPanelElement({ direction: "row", align: "center", gap: "sm" });
        header.append(
            createTextElement(name, { bold: true }),
            createTextElement(`v${version}`, { size: "sm", color: "light" }),
            createTextElement(formatBytes(size), { size: "sm", color: "light" }),
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

        if (description) {
            details.append(createTextElement(description, { size: "sm" }));
        }

        if (fileMasks && fileMasks.length > 0) {
            const masks = createPanelElement({ direction: "row", wrap: true, gap: "xs", align: "center" });
            masks.append(createTextElement("Files:", { size: "sm", color: "light" }));
            for (const mask of fileMasks) {
                this.addChild(masks, new TagView({ label: mask, size: "sm", variant: "outlined" }));
            }
            details.append(masks);
        }

        const compatible = publishedBoards.isCompatible(minAppVersion);
        if (!compatible) {
            details.append(createTextElement(`Requires Persephone ≥ ${minAppVersion}`, {
                size: "sm",
                color: "warning",
            }));
        }

        const actions = createPanelElement({ direction: "row", gap: "sm", align: "center" });
        if (!installed) {
            this.addChild(actions, new ButtonView({
                size: "sm",
                disabled: !compatible,
                onClick: () => this.openInstall(id),
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
