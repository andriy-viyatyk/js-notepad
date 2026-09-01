import { app } from "../../api/app";
import { settings } from "../../api/settings";
import { createLinkData } from "../../../shared/link-data";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { fpBasename } from "../../core/utils/file-path";
import { TraitTypeId, hasTraitDragData, setTraitDragData } from "../../core/traits";
import { createIconElement, createIconPlaceholderElement, isIconName } from "../../uikit/shared/slots";
import { fillSlot } from "../../uikit/shared/fill-slot";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { createBoardGlyphElement } from "../../editors/board/board-glyph-element";
import { subscribeBoardIconChanges } from "../../editors/board/board-icon-cache";
import { getCreatableItems, type CreatableItem } from "./tools-editors-registry";
import {
    decodePin,
    encodePin,
    getPinnedStrings,
    movePin,
    removePin,
    type PinnedRef,
} from "./pinned-items";
import "./PinnedRail.css";

// Kept at module scope intentionally: both existing PinnedRail surfaces share this drag sentinel.
let draggingPinnedIndex = -1;

export interface PinnedRailProps {
    layout: "horizontal" | "vertical";
    onClose?: () => void;
}

interface PinnedRow {
    ref: PinnedRef;
    index: number;
    item?: CreatableItem;
}

interface RowRecord {
    rowData: PinnedRow;
    iconCleanup: () => void;
    button: IconButtonView;
    listenersCleanup: () => void;
}

export class PinnedRailView extends VanillaView<PinnedRailProps> {
    private readonly scroll = document.createElement("div");
    private readonly rows = new WeakMap<HTMLDivElement, RowRecord>();
    private list: KeyedList<PinnedRow, string, HTMLDivElement> | undefined;

    public constructor(props: PinnedRailProps) {
        super(props);
    }

    protected onMount(): void {
        this.root.dataset.type = "tools-editors-pinned";
        this.root.dataset.layout = this.props.layout;

        const header = document.createElement("div");
        header.dataset.part = "section-header";
        header.textContent = "Pinned";
        this.scroll.dataset.part = "scroll";
        this.root.append(header, this.scroll);

        this.list = new KeyedList<PinnedRow, string, HTMLDivElement>(this.scroll, {
            keyOf: (row) => encodePin(row.ref),
            create: (row) => this.createRow(row),
            update: (element, row) => this.updateRow(element, row),
            remove: (element) => this.removeRow(element),
        });
        this.own(() => this.list?.dispose());
        this.own(subscribeBoardIconChanges(() => this.refresh()));
        this.own(() => {
            draggingPinnedIndex = -1;
            this.scroll.querySelectorAll<HTMLElement>("[data-dragging], [data-drag-over]").forEach((row) => {
                row.removeAttribute("data-dragging");
                row.removeAttribute("data-drag-over");
            });
        });
        const settingsSubscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "browser-profiles" || key === "pinned-editors") this.refresh();
        });
        this.own(settingsSubscription);

        this.refresh();
    }

    protected onUpdate(props: PinnedRailProps): void {
        this.root.dataset.layout = props.layout;
        this.refresh();
    }

    private refresh(): void {
        const editorById = new Map<string, CreatableItem>();
        for (const item of getCreatableItems(settings.get("browser-profiles"))) {
            editorById.set(item.id, item);
        }

        const storedPins = getPinnedStrings();
        const rows = storedPins.map((stored, index) => {
            const ref = decodePin(stored);
            return {
                ref,
                index,
                item: ref.kind === "editor" ? editorById.get(ref.id) : undefined,
            } satisfies PinnedRow;
        }).filter((row) => row.ref.kind === "board" || row.item !== undefined);

        this.root.hidden = storedPins.length === 0;
        this.list?.update(rows);
    }

    private createRow(rowData: PinnedRow): HTMLDivElement {
        const row = document.createElement("div");
        const iconHost = document.createElement("span");
        const label = document.createElement("span");
        const buttonHost = document.createElement("span");
        iconHost.className = "item-icon";
        label.className = "item-label";
        buttonHost.className = "pin-button-wrapper";
        row.append(iconHost, label, buttonHost);

        const button = new IconButtonView({
            size: "sm",
            icon: "pin-filled",
            title: "Unpin",
            onClick: (event) => {
                event.stopPropagation();
                removePin(this.rows.get(row)?.rowData.ref ?? rowData.ref);
            },
        });
        button.mount();
        buttonHost.append(button.root);

        const record: RowRecord = {
            rowData,
            iconCleanup: () => undefined,
            button,
            listenersCleanup: () => undefined,
        };
        this.rows.set(row, record);
        const releases: Array<() => void> = [];
        const registerListener = <K extends keyof HTMLElementEventMap>(type: K, listener: (event: HTMLElementEventMap[K]) => void): void => {
            releases.push(this.listen(row, type, listener));
        };
        registerListener("click", () => this.activate(record.rowData.ref));
        registerListener("dragstart", (event) => this.onDragStart(row, event));
        registerListener("dragend", () => this.onDragEnd());
        registerListener("dragenter", (event) => this.onDragEnter(row, event));
        registerListener("dragover", (event) => this.onDragOver(row, event));
        registerListener("dragleave", () => this.setDragOver(row, false));
        registerListener("drop", (event) => this.onDrop(event));
        record.listenersCleanup = () => releases.forEach((release) => release());
        return row;
    }

    private updateRow(row: HTMLDivElement, rowData: PinnedRow): void {
        const record = this.rows.get(row);
        if (!record) return;
        record.rowData = rowData;
        const editor = rowData.item;
        const rowClass = rowData.ref.kind === "board" ? "tools-board-row" : "tools-editor-row";
        row.classList.toggle("tools-board-row", rowData.ref.kind === "board");
        row.classList.toggle("tools-editor-row", rowData.ref.kind === "editor");
        row.dataset.type = rowClass;
        row.setAttribute("draggable", "true");
        if (rowData.ref.kind === "board") {
            row.querySelector<HTMLElement>(".item-label")!.textContent = fpBasename(rowData.ref.root);
            record.iconCleanup = fillSlot(
                row.querySelector<HTMLElement>(".item-icon")!,
                createBoardGlyphElement(rowData.ref.root),
            );
        } else if (editor) {
            row.querySelector<HTMLElement>(".item-label")!.textContent = editor.label;
            record.iconCleanup = fillSlot(
                row.querySelector<HTMLElement>(".item-icon")!,
                typeof editor.icon === "string"
                    ? (isIconName(editor.icon) ? createIconElement(editor.icon) : createIconPlaceholderElement())
                    : editor.icon ?? null,
            );
        }
    }

    private removeRow(row: HTMLDivElement): void {
        const record = this.rows.get(row);
        if (!record) return;
        record.listenersCleanup();
        record.iconCleanup();
        record.button.dispose();
        record.button.root.remove();
        this.rows.delete(row);
    }

    private activate(ref: PinnedRef): void {
        if (ref.kind === "board") {
            void app.events.openRawLink.sendAsync(
                createLinkData(encodePersephoneBoardLink(ref.root)),
            );
        } else {
            const item = getCreatableItems(settings.get("browser-profiles")).find((candidate) =>
                candidate.id === ref.id,
            );
            item?.create();
        }
        this.props.onClose?.();
    }

    private onDragStart(row: HTMLDivElement, event: DragEvent): void {
        event.stopPropagation();
        const record = this.rows.get(row);
        if (!record) return;
        draggingPinnedIndex = record.rowData.index;
        setTraitDragData(event.dataTransfer, TraitTypeId.PinnedEditor, {
            index: record.rowData.index,
        });
        row.setAttribute("data-dragging", "");
    }

    private onDragEnd(): void {
        draggingPinnedIndex = -1;
        this.clearDragFlags();
    }

    private onDragEnter(row: HTMLDivElement, event: DragEvent): void {
        const record = this.rows.get(row);
        if (!record || !hasTraitDragData(event.dataTransfer) ||
            draggingPinnedIndex < 0 || draggingPinnedIndex === record.rowData.index) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        row.setAttribute("data-drag-over", "");
    }

    private onDragOver(row: HTMLDivElement, event: DragEvent): void {
        const record = this.rows.get(row);
        if (!record || !hasTraitDragData(event.dataTransfer) ||
            draggingPinnedIndex < 0 || draggingPinnedIndex === record.rowData.index) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        // Read the hover index BEFORE moving. `movePin` persists synchronously, which re-runs
        // `refresh()` and replaces `record.rowData` with this row's post-move data — so reading
        // the index afterwards yields the hovered item's new index instead of the position the
        // dragged item was just moved to. The previous renderer captured `index` during rendering
        // closure, which is why it could read it either side of the move.
        const hoverIndex = record.rowData.index;
        movePin(draggingPinnedIndex, hoverIndex);
        draggingPinnedIndex = hoverIndex;
    }

    private onDrop(event: DragEvent): void {
        event.preventDefault();
        this.clearDragFlags();
    }

    private setDragOver(row: HTMLDivElement, active: boolean): void {
        if (active) row.setAttribute("data-drag-over", "");
        else row.removeAttribute("data-drag-over");
    }

    private clearDragFlags(): void {
        this.scroll.querySelectorAll<HTMLElement>("[data-dragging], [data-drag-over]").forEach((row) => {
            row.removeAttribute("data-dragging");
            row.removeAttribute("data-drag-over");
        });
    }
}
