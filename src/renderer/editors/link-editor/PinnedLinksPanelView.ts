import { app } from "../../api/app";
import { ContextMenuEvent } from "../../api/events/events";
import { TraitTypeId, getTraitDragData, hasTraitDragData, setTraitDragData } from "../../core/traits";
import color from "../../theme/color";
import { createTreeProviderItemIconElement } from "../../components/icons/icon-elements";
import { getHostname, getFaviconPath, onFaviconReady, requestFaviconSave } from "../../components/icons/favicon-cache";
import { ListItemView } from "../../uikit/ListBox/ListItemView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createIconElement } from "../../uikit/shared/slots";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createTextElement } from "../../uikit/Text/text-style";
import { attachTooltip, type TooltipAttachment } from "../../uikit/Tooltip/attach-tooltip";
import { spacing, height } from "../../uikit/tokens";
import { appendLinkOpenMenuItems } from "../shared/link-open-menu";
import type { LinkItem, LinkSource } from "./linkTypes";
import { createLinkTooltipContent } from "./LinkTooltipView";
import "../../uikit/ListBox/ListItem.css";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";

const { clipboard } = require("electron");

let draggingPinIndex = -1;

interface PinnedLinkItemProps {
    link: LinkItem;
    index: number;
    isSelected: boolean;
    model: LinkSource;
    onOpenLink: (link: LinkItem) => void;
    onContextMenu: (event: MouseEvent, link: LinkItem) => void;
}

export class PinnedLinkItemView extends VanillaView<PinnedLinkItemProps> {
    private row: ListItemView | undefined;
    private aboveIndicator: HTMLDivElement | undefined;
    private belowIndicator: HTMLDivElement | undefined;
    private tooltip: TooltipAttachment | undefined;
    private dragEnterCount = 0;
    private isDragging = false;
    private isOver = false;

    public constructor(props: PinnedLinkItemProps) {
        const root = document.createElement("div");
        super(props, root);
        root.style.position = "relative";
        root.style.margin = `0 ${spacing.sm}px`;
        root.style.display = "flex";
        root.style.alignItems = "stretch";
        root.style.height = `${height.controlSm}px`;
        root.style.flexShrink = "0";
    }

    protected onMount(): void {
        const row = this.child(new ListItemView(this.rowProps(this.props)));
        this.row = row;
        this.root.append(row.root);
        row.mount();

        this.aboveIndicator = this.createIndicator();
        this.aboveIndicator.style.top = "0";
        this.belowIndicator = this.createIndicator();
        this.belowIndicator.style.bottom = "0";
        this.root.append(this.aboveIndicator, this.belowIndicator);

        this.tooltip = attachTooltip(row.root, {
            content: createLinkTooltipContent({
                link: this.props.link,
                imageProxy: this.props.model.imageProxy,
            }),
            delayShow: 1200,
        });
        this.own(() => this.tooltip?.dispose());

        this.listen(row.root, "click", () => this.props.model.selectLink(this.props.link.id));
        this.listen(row.root, "dblclick", () => {
            if (this.props.link.href) this.props.onOpenLink(this.props.link);
        });
        this.listen(row.root, "contextmenu", (event) => {
            this.props.onContextMenu(event, this.props.link);
        });
        this.syncIndicator();
    }

    protected onUpdate(props: PinnedLinkItemProps): void {
        this.row?.update(this.rowProps(props));
        this.tooltip?.update({
            content: createLinkTooltipContent({
                link: props.link,
                imageProxy: props.model.imageProxy,
            }),
            delayShow: 1200,
        });
        this.syncIndicator();
    }

    protected onDispose(): void {
        this.row = undefined;
        this.tooltip = undefined;
        this.aboveIndicator = undefined;
        this.belowIndicator = undefined;
    }

    private rowProps(props: PinnedLinkItemProps) {
        return {
            name: "pinned-item",
            variant: "browse" as const,
            selectionStyle: "focus" as const,
            showSelectionIcon: false,
            selected: props.isSelected,
            iconElement: createTreeProviderItemIconElement(props.link),
            label: props.link.title || "Untitled",
            drag: {
                draggable: true,
                onDragStart: this.handleDragStart,
                onDragEnd: this.handleDragEnd,
                onDragEnter: this.handleDragEnter,
                onDragOver: this.handleDragOver,
                onDragLeave: this.handleDragLeave,
                onDrop: this.handleDrop,
            },
        };
    }

    private createIndicator(): HTMLDivElement {
        const indicator = document.createElement("div");
        indicator.style.position = "absolute";
        indicator.style.left = "4px";
        indicator.style.right = "4px";
        indicator.style.height = `${spacing.xs}px`;
        indicator.style.backgroundColor = color.misc.blue;
        indicator.style.borderRadius = "1px";
        indicator.style.pointerEvents = "none";
        indicator.style.display = "none";
        return indicator;
    }

    private readonly handleDragStart = (event: DragEvent): void => {
        event.stopPropagation();
        draggingPinIndex = this.props.index;
        if (event.dataTransfer) {
            setTraitDragData(event.dataTransfer, TraitTypeId.PinnedLink, {
                index: this.props.index,
            });
        }
        this.isDragging = true;
        this.root.style.opacity = "0.4";
    };

    private readonly handleDragEnd = (): void => {
        draggingPinIndex = -1;
        this.isDragging = false;
        this.root.style.opacity = "";
    };

    private readonly handleDragEnter = (event: DragEvent): void => {
        this.dragEnterCount++;
        if (!hasTraitDragData(event.dataTransfer) || draggingPinIndex < 0
            || draggingPinIndex === this.props.index) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        this.isOver = true;
        this.syncIndicator();
    };

    private readonly handleDragOver = (event: DragEvent): void => {
        if (!hasTraitDragData(event.dataTransfer) || draggingPinIndex < 0
            || draggingPinIndex === this.props.index) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    };

    private readonly handleDragLeave = (): void => {
        this.dragEnterCount--;
        if (this.dragEnterCount > 0) return;
        this.dragEnterCount = 0;
        this.isOver = false;
        this.syncIndicator();
    };

    private readonly handleDrop = (event: DragEvent): void => {
        event.preventDefault();
        this.dragEnterCount = 0;
        this.isOver = false;
        this.syncIndicator();
        const payload = getTraitDragData(event.dataTransfer);
        if (!payload || payload.typeId !== TraitTypeId.PinnedLink) return;
        const data = payload.data as { index: number };
        if (data.index !== this.props.index) {
            this.props.model.reorderPinnedLink(data.index, this.props.index);
        }
    };

    private syncIndicator(): void {
        const visible = this.isOver && draggingPinIndex >= 0 && draggingPinIndex !== this.props.index;
        if (this.aboveIndicator) {
            this.aboveIndicator.style.display = visible && draggingPinIndex > this.props.index
                ? "block" : "none";
        }
        if (this.belowIndicator) {
            this.belowIndicator.style.display = visible && draggingPinIndex < this.props.index
                ? "block" : "none";
        }
    }
}

export interface PinnedLinksPanelProps {
    pinnedLinks: LinkItem[];
    model: LinkSource;
    selectedLinkId?: string;
    width?: number;
}

export class PinnedLinksPanelView extends VanillaView<PinnedLinksPanelProps> {
    private readonly list: HTMLDivElement;
    private readonly rows = new Map<HTMLElement, PinnedLinkItemView>();
    private keyedRows: KeyedList<LinkItem, string, HTMLElement> | undefined;
    private faviconUnsubs: Array<() => void> = [];
    private subscribedLinks: LinkItem[] | undefined;
    private faviconGeneration = 0;
    private inert = false;

    public constructor(props: PinnedLinksPanelProps) {
        const root = createPanelElement({
            name: "pinned-links-panel",
            direction: "column",
            overflow: "hidden",
            minWidth: 100,
            maxWidth: "40%",
            width: props.width,
        });
        super(props, root);

        const header = createPanelElement({
            name: "pinned-links-header",
            align: "center",
            gap: "xs",
            paddingX: "md",
            paddingY: "sm",
            borderBottom: true,
            shrink: false,
        });
        const pin = createIconElement("pin-filled", { width: 14, height: 14 });
        pin.style.color = color.misc.blue;
        header.append(pin, createTextElement("Pinned", { size: "xs", color: "light" }));

        this.list = createPanelElement({
            name: "pinned-links-list",
            direction: "column",
            overflowY: "auto",
            overflowX: "hidden",
            paddingY: "xs",
            flex: 1,
            height: 0,
        });
        this.list.tabIndex = 0;
        this.list.setAttribute("data-focus-selection", "");
        root.append(header, this.list);
    }

    protected onMount(): void {
        this.keyedRows = new KeyedList(this.list, {
            keyOf: (link) => link.id,
            create: (link, index) => {
                const row = this.child(new PinnedLinkItemView({
                    link,
                    index,
                    isSelected: link.id === this.props.selectedLinkId,
                    model: this.props.model,
                    onOpenLink: this.openLink,
                    onContextMenu: this.contextMenu,
                }));
                row.mount();
                this.rows.set(row.root, row);
                return row.root;
            },
            update: (element, link, index) => {
                this.rows.get(element)?.update({
                    link,
                    index,
                    isSelected: link.id === this.props.selectedLinkId,
                    model: this.props.model,
                    onOpenLink: this.openLink,
                    onContextMenu: this.contextMenu,
                });
            },
            remove: (element) => {
                const row = this.rows.get(element);
                if (row) this.releaseChild(row);
                this.rows.delete(element);
            },
        });
        this.own(() => this.keyedRows?.dispose());
        this.own(() => this.disposeFaviconSubscriptions());
        this.own(() => { this.inert = true; });
        this.installFaviconSubscriptions(this.props.pinnedLinks);
        this.keyedRows.update(this.props.pinnedLinks);
    }

    protected onUpdate(props: PinnedLinksPanelProps): void {
        if (props.pinnedLinks !== this.subscribedLinks) {
            this.installFaviconSubscriptions(props.pinnedLinks);
        }
        this.root.style.width = props.width === undefined ? "" : `${props.width}px`;
        this.keyedRows?.update(props.pinnedLinks);
    }

    protected onDispose(): void {
        this.keyedRows = undefined;
        this.rows.clear();
    }

    private installFaviconSubscriptions(links: LinkItem[]): void {
        this.disposeFaviconSubscriptions();
        this.faviconGeneration++;
        const generation = this.faviconGeneration;
        this.subscribedLinks = links;
        const hostnames = new Set<string>();
        for (const link of links) {
            const hostname = getHostname(link.href);
            if (hostname) hostnames.add(hostname);
        }
        for (const hostname of hostnames) {
            void getFaviconPath(hostname)
                .then((path) => {
                    if (path) this.repaintRows(generation);
                })
                .catch((): void => undefined);
            this.faviconUnsubs.push(onFaviconReady(hostname, () => this.repaintRows(generation)));
        }
    }

    private disposeFaviconSubscriptions(): void {
        this.faviconGeneration++;
        for (const unsubscribe of this.faviconUnsubs) unsubscribe();
        this.faviconUnsubs = [];
    }

    private repaintRows(generation: number): void {
        if (this.inert || generation !== this.faviconGeneration) return;
        this.keyedRows?.update(this.props.pinnedLinks);
    }

    private readonly openLink = (link: LinkItem): void => {
        if (!link.href) return;
        if (!this.props.model.isTorPage) requestFaviconSave(getHostname(link.href));
        void this.props.model.openLink(link);
    };

    private readonly contextMenu = (event: MouseEvent, link: LinkItem): void => {
        const model = this.props.model;
        model.selectLink(link.id);
        const contextEvent = ContextMenuEvent.fromNativeEvent(event, "link-pinned") as ContextMenuEvent<LinkItem>;
        const customItems = model.onGetLinkMenuItems?.(link);
        if (customItems?.length) contextEvent.items.push(...customItems);
        contextEvent.items.push({
            label: "Edit",
            icon: "rename",
            onClick: () => { void model.showLinkDialog(link.id); },
            startGroup: customItems?.length ? true : undefined,
        });
        if (link.href) appendLinkOpenMenuItems(contextEvent.items, link.href, { startGroup: true });
        contextEvent.items.push({
            label: "Copy URL",
            icon: "copy",
            onClick: () => { if (link.href) clipboard.writeText(link.href); },
            disabled: !link.href,
        });
        if (link.imgSrc) {
            const imageUrl = link.imgSrc;
            contextEvent.items.push(
                {
                    label: "Copy Image URL",
                    icon: "copy",
                    onClick: () => clipboard.writeText(imageUrl),
                    startGroup: true,
                },
                {
                    label: "Open Image in New Tab",
                    icon: "open-file",
                    onClick: async () => {
                        const { pagesModel } = await import("../../api/pages");
                        pagesModel.openImageInNewTab(imageUrl);
                    },
                },
            );
        }
        contextEvent.items.push(
            {
                label: "Unpin",
                icon: "pin-filled",
                onClick: () => model.togglePinLink(link.id),
                startGroup: true,
            },
            {
                label: "Delete",
                icon: "delete",
                onClick: () => { void model.deleteLink(link.id); },
            },
        );
        event.contextMenuPromise = app.events.linkContextMenu.sendAsync(contextEvent);
    };
}
