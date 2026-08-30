import type { ILink } from "../../api/types/io.tree";
import {
    createTreeProviderItemIconElement,
} from "../../components/icons/icon-elements";
import {
    getFaviconPath,
    getHostname,
    onFaviconReady,
} from "../../components/icons/favicon-cache";
import { TraitTypeId, setTraitDragData } from "../../core/traits";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { ListItemView } from "../../uikit/ListBox/ListItemView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import {
    applyCellStyle,
    VirtualGridView,
} from "../../uikit/VirtualGrid";
import type {
    ElementLength,
    Percent,
    RenderCellFunc,
    RenderCellParams,
} from "../../uikit/VirtualGrid";
import { attachTooltip, type TooltipAttachment } from "../../uikit/Tooltip/attach-tooltip";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { IconName } from "../../theme/icon-registry";
import { createLinkTooltipContent } from "./LinkTooltipView";
import type { LinksListProps } from "./LinksList";
import type { TorProxyInfo } from "./tor-src";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/ListBox/ListItem.css";
import "../../uikit/Panel/Panel.css";

const ROW_HEIGHT = 24;

const defaultGetId = (link: ILink): string => link.id ?? link.href;

interface CellParts {
    cell: HTMLElement;
    index: number;
    rowWrapper: HTMLElement;
    rowView: ListItemView;
    actionsHost: HTMLElement;
    additionalIconHost: HTMLElement;
    additionalIcon?: IconName;
    editButton?: IconButtonView;
    editButtonRelease?: () => void;
    deleteButton?: IconButtonView;
    deleteButtonRelease?: () => void;
    tooltip: TooltipAttachment;
    link: ILink;
    selected: boolean;
    dropTarget: boolean;
    isDragging: boolean;
    searchText: string;
    dragSourceId?: string;
    onDragStartOverride?: LinksListProps["onDragStartOverride"];
    allTags?: string[];
    imageProxy?: TorProxyInfo | null;
    onSelect?: LinksListProps["onSelect"];
    onEdit?: LinksListProps["onEdit"];
    onDelete?: LinksListProps["onDelete"];
    onDoubleClick?: LinksListProps["onDoubleClick"];
    onContextMenu?: LinksListProps["onContextMenu"];
    onToggleTag?: LinksListProps["onToggleTag"];
    onDragEnter?: LinksListProps["onItemDragEnter"];
    onDragOver?: LinksListProps["onItemDragOver"];
    onDragLeave?: LinksListProps["onItemDragLeave"];
    onDrop?: LinksListProps["onItemDrop"];
}

const columnWidth: ElementLength = (() => "100%" as Percent) as ElementLength;

function createFocusScope(): HTMLDivElement {
    const element = createPanelElement({
        name: "links-list-focus-scope",
        direction: "column",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
    });
    element.tabIndex = 0;
    element.setAttribute("data-focus-selection", "");
    return element;
}

export class LinksListView extends VanillaView<LinksListProps> {
    private readonly cells = new WeakMap<HTMLElement, CellParts>();
    private readonly cellRecords = new Set<CellParts>();
    /** Retains pooled child views so disposal can reach detached cells. */
    private readonly ownedViews = new Set<ListItemView | IconButtonView>();
    private readonly hostnameRows = new Map<string, number[]>();
    private readonly rowCount = (): number => this.props.links.length;
    private readonly grid: VirtualGridView;
    private faviconUnsubs: Array<() => void> = [];
    private faviconGeneration = 0;
    private subscribedLinks: ILink[] | undefined;
    private inert = false;

    private readonly onGridView = (view: VirtualGridView | null): void => {
        this.props.onGridModel?.(view?.model ?? null);
    };

    /** Keep this renderer's identity stable: VirtualGridModel uses it as an input gate. */
    private renderCell: RenderCellFunc = (p: RenderCellParams) => {
        const link = this.props.links[p.row];
        if (!link) return undefined;

        const cell = p.previous ?? p.recycle?.() ?? document.createElement("div");
        let record = this.cells.get(cell);
        if (!record) {
            record = this.createCell(cell, link, p.row);
            this.cells.set(cell, record);
            this.cellRecords.add(record);
        }

        this.admitCell(record, p, link);
        return cell;
    };

    public constructor(props: LinksListProps) {
        super(props, createFocusScope());

        this.grid = new VirtualGridView(this.gridOptions());

        // Match ListBoxView's teardown order: listeners become inert, then the grid releases its
        // pool, then overlay attachments and retained row/button views are disposed.
        this.own(() => { this.inert = true; });
        this.own(() => this.disposeFaviconSubscriptions());
        this.own(() => this.grid.dispose());
        this.own(() => {
            this.cellRecords.forEach((record) => record.tooltip.dispose());
            this.cellRecords.clear();
        });
        this.own(() => {
            this.ownedViews.forEach((view) => view.dispose());
            this.ownedViews.clear();
        });
    }

    private gridOptions() {
        return {
            rowCount: this.rowCount,
            columnCount: 1,
            rowHeight: ROW_HEIGHT,
            columnWidth,
            renderCell: this.renderCell,
            fitToWidth: true,
            onView: this.onGridView,
        };
    }

    protected onMount(): void {
        this.root.append(this.grid.root);
        this.grid.mount();
        this.installFaviconSubscriptions(this.props.links);
    }

    protected onUpdate(props: LinksListProps): void {
        if (props.links !== this.subscribedLinks) {
            this.installFaviconSubscriptions(props.links);
        }

        // Keep the child's lifecycle callback current without changing any renderer identity.
        this.grid.update(this.gridOptions());

        // All prop-driven row state is read by the stable renderer from this.props. Mark the
        // current coordinates dirty explicitly; a new closure must never be used as the signal.
        this.grid.model.update({ rows: props.links.map((_link, index) => index) });
    }

    private installFaviconSubscriptions(links: ILink[]): void {
        this.disposeFaviconSubscriptions();
        this.faviconGeneration++;
        const generation = this.faviconGeneration;
        this.subscribedLinks = links;

        for (let row = 0; row < links.length; row++) {
            const hostname = getHostname(links[row].href);
            if (!hostname) continue;
            const rows = this.hostnameRows.get(hostname);
            if (rows) rows.push(row);
            else this.hostnameRows.set(hostname, [row]);
        }

        for (const hostname of this.hostnameRows.keys()) {
            void getFaviconPath(hostname)
                .then((path) => {
                    if (path) this.repaintHostname(hostname, generation);
                })
                .catch((): void => undefined);
            this.faviconUnsubs.push(
                onFaviconReady(hostname, () => this.repaintHostname(hostname, generation)),
            );
        }
    }

    private disposeFaviconSubscriptions(): void {
        this.faviconGeneration++;
        for (const unsubscribe of this.faviconUnsubs) unsubscribe();
        this.faviconUnsubs = [];
        this.hostnameRows.clear();
    }

    private repaintHostname(hostname: string, generation: number): void {
        if (this.inert || generation !== this.faviconGeneration) return;
        const rows = this.hostnameRows.get(hostname);
        if (rows?.length) this.grid.model.update({ rows: [...rows] });
    }

    private createCell(cell: HTMLElement, link: ILink, index: number): CellParts {
        const actionsHost = document.createElement("span");
        actionsHost.style.display = "flex";
        actionsHost.style.gap = "2px";
        actionsHost.style.alignItems = "center";
        actionsHost.style.flexShrink = "0";

        const additionalIconHost = document.createElement("span");
        additionalIconHost.style.display = "flex";
        additionalIconHost.style.alignItems = "center";
        additionalIconHost.style.flexShrink = "0";
        actionsHost.append(additionalIconHost);

        const rowView = new ListItemView({
            name: "link-row",
            variant: "browse",
            selectionStyle: "focus",
            showSelectionIcon: false,
            selected: false,
            dropActive: false,
            searchText: "",
            iconElement: createTreeProviderItemIconElement(link),
            label: link.title || "Untitled",
            trailingElement: actionsHost,
            drag: { draggable: false },
        });
        rowView.mount();
        this.ownedViews.add(rowView);

        const rowWrapper = document.createElement("div");
        rowWrapper.style.flex = "1 1 0%";
        rowWrapper.style.minWidth = "0";
        rowWrapper.style.display = "flex";

        const rowPanel = createPanelElement({
            name: "link-row-wrapper",
            revealChildrenOnHover: true,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            position: "relative",
        }, [rowView.root]);
        rowWrapper.append(rowPanel);
        cell.append(rowWrapper);

        const tooltip = attachTooltip(rowView.root, {
            content: this.tooltipContent(link),
            delayShow: 1200,
        });

        const record: CellParts = {
            cell,
            index,
            rowWrapper,
            rowView,
            actionsHost,
            additionalIconHost,
            tooltip,
            link,
            selected: false,
            dropTarget: false,
            isDragging: false,
            searchText: "",
        };
        this.installCellListeners(record);
        return record;
    }

    private admitCell(record: CellParts, p: RenderCellParams, link: ILink): void {
        const props = this.props;
        const getId = props.getId ?? defaultGetId;
        const selected = props.selectedIds
            ? props.selectedIds.has(getId(link))
            : getId(link) === props.selectedId;
        const dropTarget = !!props.dropTargetId && getId(link) === props.dropTargetId;

        // This is intentionally a total write. `previous` identifies a coordinate, not an item;
        // after a scroll every one of these values may belong to the previous occupant.
        record.index = p.row;
        record.link = link;
        record.selected = selected;
        record.dropTarget = dropTarget;
        record.isDragging = false;
        record.searchText = props.searchText ?? "";
        record.dragSourceId = props.dragSourceId;
        record.onDragStartOverride = props.onDragStartOverride;
        record.allTags = props.allTags;
        record.imageProxy = props.imageProxy;
        record.onSelect = props.onSelect;
        record.onEdit = props.onEdit;
        record.onDelete = props.onDelete;
        record.onDoubleClick = props.onDoubleClick;
        record.onContextMenu = props.onContextMenu;
        record.onToggleTag = props.onToggleTag;
        record.onDragEnter = props.onItemDragEnter;
        record.onDragOver = props.onItemDragOver;
        record.onDragLeave = props.onItemDragLeave;
        record.onDrop = props.onItemDrop;

        applyCellStyle(record.cell, p.style, p.row, p.col, p.renderInfo.input.columnCount);
        record.cell.style.boxSizing = "border-box";
        record.cell.style.padding = "0 4px";
        record.cell.style.display = "flex";
        record.cell.style.alignItems = "stretch";
        record.rowWrapper.style.opacity = "";

        record.rowView.root.style.fontWeight = link.isDirectory ? "500" : "";
        record.rowView.update({
            name: "link-row",
            variant: "browse",
            selectionStyle: "focus",
            showSelectionIcon: false,
            selected,
            dropActive: dropTarget,
            searchText: record.searchText,
            iconElement: createTreeProviderItemIconElement(link),
            label: link.title || "Untitled",
            trailingElement: record.actionsHost,
            drag: { draggable: !!record.dragSourceId },
        });

        record.additionalIcon = props.getAdditionalIcon?.(link);
        record.additionalIconHost.replaceChildren();
        if (record.additionalIcon) {
            record.additionalIconHost.append(
                createIconElement(record.additionalIcon, { width: 16, height: 16 }),
            );
        }
        this.syncActionButton(record, "edit", !!record.onEdit);
        this.syncActionButton(record, "delete", !!record.onDelete);
        record.tooltip.update({
            content: this.tooltipContent(link, record),
            delayShow: 1200,
        });
    }

    private tooltipContent(link: ILink, record?: CellParts): Node {
        return createLinkTooltipContent({
            link,
            allTags: record?.allTags ?? this.props.allTags,
            onToggleTag: record?.onToggleTag ?? this.props.onToggleTag,
            imageProxy: record?.imageProxy ?? this.props.imageProxy,
        });
    }

    private syncActionButton(
        record: CellParts,
        kind: "edit" | "delete",
        enabled: boolean,
    ): void {
        const key = kind === "edit" ? "editButton" : "deleteButton";
        const releaseKey = kind === "edit" ? "editButtonRelease" : "deleteButtonRelease";
        const existing = record[key];
        if (!enabled) {
            if (existing) {
                record[releaseKey]?.();
                record[releaseKey] = undefined;
                existing.root.remove();
                existing.dispose();
                this.ownedViews.delete(existing);
                record[key] = undefined;
            }
            return;
        }
        if (existing) return;

        const button = new IconButtonView({
            name: kind === "edit" ? "link-row-edit" : "link-row-delete",
            size: "sm",
            title: kind === "edit" ? "Edit" : "Delete",
            icon: createIconElement(kind === "edit" ? "rename" : "delete"),
            hideUntilParentHover: true,
        });
        button.mount();
        record.actionsHost.append(button.root);
        this.ownedViews.add(button);
        record[key] = button;

        record[releaseKey] = this.listen(button.root, "click", (event) => {
            const current = this.cells.get(record.cell);
            if (!current || this.inert) return;
            event.stopPropagation();
            current.onSelect?.(current.link);
            if (kind === "edit") current.onEdit?.(current.link);
            else current.onDelete?.(current.link, event.ctrlKey);
        });
    }

    private installCellListeners(record: CellParts): void {
        const row = record.rowView.root;
        this.listen(row, "click", (event) => {
            const current = this.cells.get(record.cell);
            if (!current || this.inert) return;
            current.onSelect?.(
                current.link,
                event,
            );
        });
        this.listen(row, "dblclick", () => {
            const current = this.cells.get(record.cell);
            if (!current || this.inert) return;
            if (current.onDoubleClick) current.onDoubleClick(current.link);
            else current.onEdit?.(current.link);
        });
        this.listen(row, "contextmenu", (event) => {
            const current = this.cells.get(record.cell);
            if (!current || this.inert) return;
            current.onContextMenu?.(
                event,
                current.link,
            );
        });
        this.listen(row, "dragstart", (event) => {
            const current = this.cells.get(record.cell);
            if (!current || this.inert) return;
            if (!current.dragSourceId) {
                event.preventDefault();
                return;
            }
            event.stopPropagation();
            if (current.onDragStartOverride?.(
                current.link,
                event,
            )) return;
            if (!event.dataTransfer) return;
            setTraitDragData(event.dataTransfer, TraitTypeId.ILink, {
                items: [current.link],
                sourceId: current.dragSourceId,
            });
            current.isDragging = true;
            current.rowWrapper.style.opacity = "0.4";
        });
        this.listen(row, "dragend", () => {
            const current = this.cells.get(record.cell);
            if (!current || this.inert) return;
            current.isDragging = false;
            current.rowWrapper.style.opacity = "";
        });
        this.listen(row, "dragenter", (event) => this.forwardDrag(record, "onDragEnter", event));
        this.listen(row, "dragover", (event) => this.forwardDrag(record, "onDragOver", event));
        this.listen(row, "dragleave", (event) => this.forwardDrag(record, "onDragLeave", event));
        this.listen(row, "drop", (event) => this.forwardDrag(record, "onDrop", event));
    }

    private forwardDrag(
        record: CellParts,
        callback: "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop",
        event: DragEvent,
    ): void {
        const current = this.cells.get(record.cell);
        if (!current || this.inert) return;
        current[callback]?.(
            current.link,
            event,
        );
    }
}
