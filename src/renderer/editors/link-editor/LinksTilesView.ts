import type { ILink } from "../../api/types/io.tree";
import { getFaviconPath, getFaviconPathSync, getHostname, onFaviconReady } from "../../components/icons/favicon-cache";
import { TraitTypeId, setTraitDragData } from "../../core/traits";
import { isArchivePath } from "../../core/utils/file-path";
import color from "../../theme/color";
import type { IconName } from "../../theme/icon-registry";
import { RenderGrid } from "../../uikit/DataGrid";
import type { ElementLength, GridModelCapability, Percent, RenderCellFunc, RenderCellParams, RenderSizeOptional } from "../../uikit/DataGrid";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { applyCellStyle } from "../../uikit/shared/cell-style";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { LinkViewMode } from "./linkTypes";
import type { LinksTilesProps } from "./LinksTiles";
import { getPipeImageSrcSync, resolvePipeImageSrc } from "./pipe-image-src";
import { resolveTorSrc, type TorProxyInfo } from "./tor-src";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/Panel/Panel.css";

interface TileDimensions {
    cellWidth: number;
    cellHeight: number;
    imageHeight: number;
}

const TILE_DIMENSIONS: Record<Exclude<LinkViewMode, "list">, TileDimensions> = {
    "tiles-landscape":     { cellWidth: 252, cellHeight: 192, imageHeight: 144 },
    "tiles-landscape-big": { cellWidth: 372, cellHeight: 276, imageHeight: 216 },
    "tiles-portrait":      { cellWidth: 168, cellHeight: 276, imageHeight: 216 },
    "tiles-portrait-big":  { cellWidth: 252, cellHeight: 408, imageHeight: 336 },
};

const defaultGetId = (link: ILink): string => link.id ?? link.href;
const columnWidth: ElementLength = (() => "100%" as Percent) as ElementLength;

interface CellRecord {
    cell: HTMLElement;
    tileRoot: HTMLDivElement;
    panel: HTMLDivElement;
    imageHost: HTMLDivElement;
    titleElement: HTMLSpanElement;
    additionalIconHost: HTMLSpanElement;
    actionsHost: HTMLDivElement;
    overlayHost: HTMLDivElement;
    primaryImage: HTMLImageElement;
    index: number;
    link?: ILink;
    selected: boolean;
    dropTarget: boolean;
    isDragging: boolean;
    failedSrc?: string;
    imageSource: string | null;
    imageProxy?: TorProxyInfo | null;
    dragSourceId?: string;
    additionalIcon?: IconName;
    onDragStartOverride?: LinksTilesProps["onDragStartOverride"];
    onSelect?: LinksTilesProps["onSelect"];
    onEdit?: LinksTilesProps["onEdit"];
    onDelete?: LinksTilesProps["onDelete"];
    onDoubleClick?: LinksTilesProps["onDoubleClick"];
    onContextMenu?: LinksTilesProps["onContextMenu"];
    onDragEnter?: LinksTilesProps["onItemDragEnter"];
    onDragOver?: LinksTilesProps["onItemDragOver"];
    onDragLeave?: LinksTilesProps["onItemDragLeave"];
    onDrop?: LinksTilesProps["onItemDrop"];
    editButton?: IconButtonView;
    deleteButton?: IconButtonView;
}

export class LinksTilesView extends VanillaView<LinksTilesProps> {
    private readonly cells = new WeakMap<HTMLElement, CellRecord>();
    private readonly cellRecords = new Set<CellRecord>();
    private readonly ownedViews = new Set<IconButtonView>();
    private readonly hostnameRows = new Map<string, number[]>();
    private readonly imageRows = new Map<string, number[]>();
    private grid: RenderGrid | undefined;
    private columnCountValue = 1;
    private width: number | undefined;
    private subscribedLinks: ILink[] | undefined;
    private previousViewMode: LinksTilesProps["viewMode"];
    private faviconUnsubs: Array<() => void> = [];
    private faviconGeneration = 0;
    private imageGeneration = 0;
    private inert = false;
    private gridModel: GridModelCapability | null = null;

    private readonly rowCount = (): number => {
        return this.props.links.length > 0
            ? Math.ceil(this.props.links.length / this.columnCountValue)
            : 0;
    };

    private readonly columnCount = (): number => this.columnCountValue;

    /** Bound field: the model compares renderer identity as an input gate. */
    private readonly renderCell: RenderCellFunc = (params: RenderCellParams) => {
        const index = params.row * this.columnCountValue + params.col;
        const link = this.props.links[index];
        const cell = params.previous ?? params.recycle?.() ?? document.createElement("div");
        let record = this.cells.get(cell);
        if (!record) {
            record = this.createCell(cell);
            this.cells.set(cell, record);
            this.cellRecords.add(record);
        }
        if (link) this.admitCell(record, params, link);
        else this.admitEmptyCell(record, params);
        return cell;
    };

    private readonly onGridResize = (size: RenderSizeOptional): void => {
        if (this.inert) return;
        const nextWidth = size.width;
        const dimensions = TILE_DIMENSIONS[this.props.viewMode];
        const nextColumnCount = nextWidth
            ? Math.max(1, Math.floor(nextWidth / dimensions.cellWidth))
            : 1;
        const widthChanged = this.width !== nextWidth;
        const columnsChanged = this.columnCountValue !== nextColumnCount;
        this.width = nextWidth;
        this.columnCountValue = nextColumnCount;
        if (columnsChanged) this.rebuildAsyncRows(this.props.links);
        if (widthChanged || columnsChanged) {
            // Width and column-count changes invalidate tile geometry and can change the
            // link-to-row mapping, so every current tile row needs repainting.
            this.gridModel?.update({ all: true });
        }
    };

    public constructor(props: LinksTilesProps) {
        const root = document.createElement("div");
        root.style.display = "contents";
        super(props, root);
        this.previousViewMode = props.viewMode;
        this.own(() => { this.inert = true; });
        this.own(() => this.disposeAsyncSubscriptions());
        this.own(() => {
            this.gridModel = null;
            this.props.onGridModel?.(null);
        });
        this.own(() => {
            this.grid?.destroy();
            this.grid = undefined;
        });
        this.own(() => {
            const records = [...this.cellRecords];
            this.cellRecords.clear();
            for (const record of records) this.cells.delete(record.cell);
        });
        this.own(() => {
            for (const view of this.ownedViews) view.dispose();
            this.ownedViews.clear();
        });
    }

    private gridOptions() {
        const dimensions = TILE_DIMENSIONS[this.props.viewMode];
        return {
            rowCount: this.rowCount,
            columnCount: this.columnCount,
            rowHeight: dimensions.cellHeight,
            columnWidth,
            renderCell: this.renderCell,
            fitToWidth: true,
            onResize: this.onGridResize,
            keepCellsAttached: true,
        };
    }

    protected onMount(): void {
        const grid = new RenderGrid(this.root, this.gridOptions());
        this.grid = grid;
        this.gridModel = grid.model;
        this.props.onGridModel?.(grid.model);
        this.rebuildAsyncRows(this.props.links);
    }

    protected onUpdate(props: LinksTilesProps): void {
        const linksChanged = props.links !== this.subscribedLinks;
        const viewModeChanged = props.viewMode !== this.previousViewMode;
        if (linksChanged || viewModeChanged) this.rebuildAsyncRows(props.links);
        this.previousViewMode = props.viewMode;
        this.grid?.setOptions(this.gridOptions());
        if (linksChanged) {
            this.grid?.model.update({
                rows: Array.from({ length: this.rowCount() }, (_, row) => row),
            });
        }
        if (linksChanged || viewModeChanged) void this.grid?.model.scrollToRow(0);
    }

    private rebuildAsyncRows(links: ILink[]): void {
        this.disposeAsyncSubscriptions();
        this.subscribedLinks = links;
        const generation = ++this.faviconGeneration;
        this.imageGeneration++;
        this.hostnameRows.clear();
        this.imageRows.clear();
        const hostnames = new Set<string>();

        for (let index = 0; index < links.length; index++) {
            const row = Math.floor(index / this.columnCountValue);
            const link = links[index];
            const hostname = getHostname(link.href);
            if (hostname) {
                this.addRow(this.hostnameRows, hostname, row);
                hostnames.add(hostname);
            }
            if (link.imgSrc && isArchivePath(link.imgSrc)) {
                this.addRow(this.imageRows, link.imgSrc, row);
            }
        }

        for (const hostname of hostnames) {
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

    private addRow(map: Map<string, number[]>, key: string, row: number): void {
        const rows = map.get(key);
        if (rows) {
            if (rows[rows.length - 1] !== row) rows.push(row);
        } else map.set(key, [row]);
    }

    private disposeAsyncSubscriptions(): void {
        this.faviconGeneration++;
        this.imageGeneration++;
        for (const unsubscribe of this.faviconUnsubs) unsubscribe();
        this.faviconUnsubs = [];
        this.hostnameRows.clear();
        this.imageRows.clear();
    }

    private repaintHostname(hostname: string, generation: number): void {
        if (this.inert || generation !== this.faviconGeneration) return;
        const rows = this.hostnameRows.get(hostname);
        if (rows?.length) this.grid?.model.update({ rows: [...rows] });
    }

    private repaintImage(source: string, generation: number): void {
        if (this.inert || generation !== this.imageGeneration) return;
        const rows = this.imageRows.get(source);
        if (rows?.length) this.grid?.model.update({ rows: [...rows] });
    }

    private ensureImageResolution(source: string): void {
        const generation = this.imageGeneration;
        void resolvePipeImageSrc(source).then(() => this.repaintImage(source, generation));
    }

    private createCell(cell: HTMLElement): CellRecord {
        const tileRoot = document.createElement("div");
        tileRoot.style.width = "100%";
        tileRoot.style.height = "100%";
        tileRoot.style.display = "flex";
        tileRoot.style.cursor = "default";

        const imageHost = document.createElement("div");
        imageHost.style.display = "flex";
        imageHost.style.alignItems = "center";
        imageHost.style.justifyContent = "center";
        imageHost.style.overflow = "hidden";

        const titleHost = document.createElement("div");
        titleHost.style.flex = "1";
        titleHost.style.display = "flex";
        titleHost.style.alignItems = "center";
        titleHost.style.padding = "4px 4px 4px 8px";
        titleHost.style.fontSize = "12px";
        titleHost.style.color = color.text.default;
        titleHost.style.overflow = "hidden";

        const titleElement = document.createElement("span");
        titleElement.style.flex = "1";
        titleElement.style.overflow = "hidden";
        titleElement.style.display = "-webkit-box";
        titleElement.style.webkitLineClamp = "2";
        titleElement.style.webkitBoxOrient = "vertical";
        titleElement.style.textOverflow = "ellipsis";
        titleElement.style.minWidth = "0";
        titleElement.style.wordBreak = "break-word";
        titleHost.append(titleElement);

        const additionalIconHost = document.createElement("span");
        additionalIconHost.style.position = "absolute";
        additionalIconHost.style.top = "4px";
        additionalIconHost.style.left = "4px";
        additionalIconHost.style.display = "flex";
        additionalIconHost.style.alignItems = "center";
        additionalIconHost.style.justifyContent = "center";
        additionalIconHost.style.padding = "2px";
        additionalIconHost.style.backgroundColor = color.background.overlay;
        additionalIconHost.style.border = `1px solid ${color.border.default}`;
        additionalIconHost.style.borderRadius = "6px";
        additionalIconHost.style.opacity = "0.8";
        additionalIconHost.style.pointerEvents = "none";

        const actionsHost = createPanelElement({
            name: "link-tile-actions",
            position: "absolute",
            top: 4,
            right: 4,
            gap: "xs",
        });

        const overlayHost = document.createElement("div");
        overlayHost.style.position = "absolute";
        overlayHost.style.inset = "0";
        overlayHost.style.pointerEvents = "none";

        const panel = createPanelElement({
            name: "link-tile",
            revealChildrenOnHover: true,
            direction: "column",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            position: "relative",
            rounded: "lg",
            border: true,
            borderColor: "subtle",
        }, [imageHost, titleHost, additionalIconHost, actionsHost, overlayHost]);
        tileRoot.append(panel);
        cell.append(tileRoot);

        const primaryImage = document.createElement("img");
        primaryImage.loading = "lazy";
        primaryImage.style.maxWidth = "calc(100% - 8px)";
        primaryImage.style.maxHeight = "calc(100% - 8px)";
        primaryImage.style.objectFit = "contain";
        primaryImage.style.margin = "4px";

        const record: CellRecord = {
            cell,
            tileRoot,
            panel,
            imageHost,
            titleElement,
            additionalIconHost,
            actionsHost,
            overlayHost,
            primaryImage,
            index: 0,
            selected: false,
            dropTarget: false,
            isDragging: false,
            imageSource: null,
        };
        this.listen(primaryImage, "error", () => {
            const current = this.cells.get(record.cell);
            if (!current || !current.imageSource) return;
            current.failedSrc = current.imageSource;
            this.grid?.model.update({ rows: [current.index] });
        });
        this.installCellListeners(record);
        return record;
    }

    private admitEmptyCell(record: CellRecord, params: RenderCellParams): void {
        record.index = params.row;
        record.link = undefined;
        record.selected = false;
        record.dropTarget = false;
        record.isDragging = false;
        record.imageSource = null;
        record.failedSrc = undefined;
        record.tileRoot.style.display = "none";
        record.tileRoot.draggable = false;
        record.tileRoot.title = "";
        record.tileRoot.style.opacity = "";
        this.writeCellGeometry(record, params);
        this.clearOptionalHosts(record);
    }

    private admitCell(record: CellRecord, params: RenderCellParams, link: ILink): void {
        const props = this.props;
        const getId = props.getId ?? defaultGetId;
        const dimensions = TILE_DIMENSIONS[props.viewMode];
        const selected = props.selectedIds
            ? props.selectedIds.has(getId(link))
            : getId(link) === props.selectedId;
        const dropTarget = !!props.dropTargetId && getId(link) === props.dropTargetId;
        const imageSource = this.imageSource(link.imgSrc, props.imageProxy);

        // This is intentionally a total write. previous is the same coordinate, not the same item.
        record.index = params.row;
        record.link = link;
        record.selected = selected;
        record.dropTarget = dropTarget;
        record.isDragging = false;
        record.imageProxy = props.imageProxy;
        record.dragSourceId = props.dragSourceId;
        record.additionalIcon = props.getAdditionalIcon?.(link);
        record.onDragStartOverride = props.onDragStartOverride;
        record.onSelect = props.onSelect;
        record.onEdit = props.onEdit;
        record.onDelete = props.onDelete;
        record.onDoubleClick = props.onDoubleClick;
        record.onContextMenu = props.onContextMenu;
        record.onDragEnter = props.onItemDragEnter;
        record.onDragOver = props.onItemDragOver;
        record.onDragLeave = props.onItemDragLeave;
        record.onDrop = props.onItemDrop;
        if (record.imageSource !== imageSource) record.failedSrc = undefined;
        record.imageSource = imageSource;

        record.tileRoot.style.display = "flex";
        record.tileRoot.draggable = !!record.dragSourceId;
        record.tileRoot.title = link.href || link.title;
        record.tileRoot.style.opacity = record.isDragging ? "0.4" : "";
        this.writeCellGeometry(record, params);
        record.imageHost.style.height = `${dimensions.imageHeight}px`;
        record.titleElement.textContent = link.title || "Untitled";
        this.syncPanelState(record);
        this.syncImage(record, link);
        this.syncAdditionalIcon(record);
        this.syncActionButton(record, "edit", !!record.onEdit);
        this.syncActionButton(record, "delete", !!record.onDelete);
        this.syncOverlay(record);
    }

    private writeCellGeometry(record: CellRecord, params: RenderCellParams): void {
        applyCellStyle(record.cell, params.style, params.row, params.col, params.renderInfo.input.columnCount);
        record.cell.style.boxSizing = "border-box";
        record.cell.style.padding = "4px";
        record.cell.style.display = "flex";
        record.cell.style.alignItems = "stretch";
    }

    private syncPanelState(record: CellRecord): void {
        applyPanelAttributes(record.panel, resolvePanelAttributes({
            name: "link-tile",
            revealChildrenOnHover: true,
            direction: "column",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            position: "relative",
            rounded: "lg",
            border: true,
            borderColor: record.selected ? "active" : "subtle",
        }));
    }

    private syncImage(record: CellRecord, link: ILink): void {
        const rawSource = link.imgSrc;
        const archive = !!rawSource && isArchivePath(rawSource);
        const pipedSource = getPipeImageSrcSync(rawSource);
        if (archive && !pipedSource && rawSource) this.ensureImageResolution(rawSource);
        const source = resolveTorSrc(
            pipedSource ?? (archive ? undefined : rawSource),
            record.imageProxy,
        );
        record.imageSource = source;
        const showImage = !!source && source !== record.failedSrc;
        record.imageHost.style.color = showImage ? "" : color.text.light;
        record.imageHost.style.fontSize = showImage ? "" : "12px";
        if (showImage && source) {
            if (record.primaryImage.getAttribute("src") !== source) record.primaryImage.src = source;
            record.primaryImage.alt = link.title;
            record.imageHost.replaceChildren(record.primaryImage);
            return;
        }

        const faviconPath = getFaviconPathSync(getHostname(link.href));
        if (faviconPath) {
            const favicon = document.createElement("img");
            favicon.src = `file://${faviconPath}`;
            favicon.alt = "";
            record.imageHost.replaceChildren(favicon);
        } else {
            record.imageHost.replaceChildren(createIconElement("globe", { width: 32, height: 32 }));
            const fallback = record.imageHost.lastElementChild;
            if (fallback) fallback.setAttribute("style", "opacity: 0.3");
        }
    }

    private syncAdditionalIcon(record: CellRecord): void {
        record.additionalIconHost.replaceChildren();
        if (record.additionalIcon) {
            record.additionalIconHost.append(createIconElement(record.additionalIcon, { width: 14, height: 14 }));
        }
    }

    private syncActionButton(record: CellRecord, kind: "edit" | "delete", enabled: boolean): void {
        const key = kind === "edit" ? "editButton" : "deleteButton";
        const existing = record[key];
        if (!enabled) {
            existing?.root.remove();
            return;
        }
        const button = existing ?? this.createActionButton(record, kind);
        if (button.root.parentElement !== record.actionsHost) record.actionsHost.append(button.root);
    }

    private createActionButton(record: CellRecord, kind: "edit" | "delete"): IconButtonView {
        const button = new IconButtonView({
            name: kind === "edit" ? "link-tile-edit" : "link-tile-delete",
            size: "sm",
            title: kind === "edit" ? "Edit" : "Delete",
            icon: kind === "edit" ? "rename" : "delete",
            hideUntilParentHover: true,
        });
        button.mount();
        this.ownedViews.add(button);
        if (kind === "edit") record.editButton = button;
        else record.deleteButton = button;
        this.listen(button.root, "click", (event) => {
            const current = this.cells.get(record.cell);
            if (!current?.link) return;
            event.stopPropagation();
            current.onSelect?.(current.link);
            if (kind === "edit") current.onEdit?.(current.link);
            else current.onDelete?.(current.link, event.ctrlKey);
        });
        return button;
    }

    private syncOverlay(record: CellRecord): void {
        record.overlayHost.style.display = record.selected || record.dropTarget ? "block" : "none";
        record.overlayHost.style.backgroundColor = color.background.selection;
        record.overlayHost.style.opacity = record.dropTarget ? "0.5" : "0.3";
        if (record.dropTarget) {
            record.overlayHost.style.outline = `2px solid ${color.border.active}`;
            record.overlayHost.style.outlineOffset = "-2px";
        } else {
            record.overlayHost.style.outline = "";
            record.overlayHost.style.outlineOffset = "";
        }
    }

    private clearOptionalHosts(record: CellRecord): void {
        record.imageHost.replaceChildren();
        record.titleElement.textContent = "";
        record.additionalIcon = undefined;
        record.additionalIconHost.replaceChildren();
        record.actionsHost.replaceChildren();
        record.overlayHost.style.display = "none";
    }

    private imageSource(src: string | undefined, proxy: TorProxyInfo | null | undefined): string | null {
        if (!src || isArchivePath(src)) return null;
        return resolveTorSrc(src, proxy);
    }

    private installCellListeners(record: CellRecord): void {
        const tile = record.tileRoot;
        this.listen(tile, "click", (event) => {
            const current = this.cells.get(record.cell);
            if (!current?.link) return;
            current.onSelect?.(current.link, event);
        });
        this.listen(tile, "dblclick", () => {
            const current = this.cells.get(record.cell);
            if (!current?.link) return;
            if (current.onDoubleClick) current.onDoubleClick(current.link);
            else current.onEdit?.(current.link);
        });
        this.listen(tile, "contextmenu", (event) => {
            const current = this.cells.get(record.cell);
            if (!current?.link) return;
            current.onContextMenu?.(event, current.link);
        });
        this.listen(tile, "dragstart", (event) => {
            const current = this.cells.get(record.cell);
            if (!current?.link) return;
            if (!current.dragSourceId) {
                event.preventDefault();
                return;
            }
            event.stopPropagation();
            const dragOverride = current.onDragStartOverride;
            if (dragOverride?.(
                current.link,
                event,
            )) return;
            if (!event.dataTransfer) return;
            setTraitDragData(event.dataTransfer, TraitTypeId.ILink, {
                items: [current.link],
                sourceId: current.dragSourceId,
            });
            current.isDragging = true;
            current.tileRoot.style.opacity = "0.4";
        });
        this.listen(tile, "dragend", () => {
            const current = this.cells.get(record.cell);
            if (!current) return;
            current.isDragging = false;
            current.tileRoot.style.opacity = "";
        });
        this.listen(tile, "dragenter", (event) => this.forwardDrag(record, "onDragEnter", event));
        this.listen(tile, "dragover", (event) => this.forwardDrag(record, "onDragOver", event));
        this.listen(tile, "dragleave", (event) => this.forwardDrag(record, "onDragLeave", event));
        this.listen(tile, "drop", (event) => this.forwardDrag(record, "onDrop", event));
    }

    private forwardDrag(
        record: CellRecord,
        callback: "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop",
        event: DragEvent,
    ): void {
        const current = this.cells.get(record.cell);
        if (!current?.link) return;
        const handler = current[callback];
        handler?.(current.link, event);
    }
}
