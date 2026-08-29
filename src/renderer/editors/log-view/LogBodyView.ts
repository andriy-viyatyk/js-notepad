import { errMessage } from "../../../shared/utils";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { VirtualFlexGridView, type VirtualFlexCellFunc, type VirtualFlexGridProps } from "../../uikit/VirtualGrid/VirtualFlexGridView";
import type { Percent } from "../../uikit/VirtualGrid/types";
import type { LogEntry } from "./logTypes";
import type { LogViewEditor, LogViewEditorState } from "./LogViewEditor";
import { LogEntryWrapperView } from "./LogEntryWrapper";

const RIGHT_GUTTER = 40;
const AUTO_SCROLL_THRESHOLD = 50;
const columnWidth = (column: number): number | Percent => column === 0 ? "100%" : RIGHT_GUTTER;

interface LogProjection {
    entries: LogEntry[];
    entryCount: number;
    error: string | undefined;
    showTimestamps: boolean;
}

interface CellRecord {
    cell: HTMLElement;
    kind: string;
    index: number;
    entry: LogEntry;
    view: LogEntryWrapperView;
    failed?: boolean;
}

function selectProjection(state: LogViewEditorState): LogProjection {
    return { entries: state.entries, entryCount: state.entryCount, error: state.error, showTimestamps: state.showTimestamps };
}

export interface LogBodyViewProps { model: LogViewEditor; }

export class LogBodyView extends VanillaView<LogBodyViewProps> {
    private readonly editor: LogViewEditor;
    private readonly listHost = createPanelElement({ name: "log-view-list", direction: "column", flex: 1, overflow: "hidden", minHeight: 0 });
    private readonly messageHost = createPanelElement({ name: "log-view-message", flex: 1, align: "center", justify: "center" });
    private readonly cells = new WeakMap<HTMLElement, CellRecord>();
    private readonly cellRecords = new Set<CellRecord>();
    private projection: LogProjection;
    private readonly isAtBottom = { value: true };
    private previousEntryCount = 0;
    private scrollTimers: ReturnType<typeof setTimeout>[] = [];
    private readonly grid: VirtualFlexGridView;
    private stateUnsubscribe: (() => void) | undefined;
    private queueUnsubscribe: (() => void) | undefined;
    private readonly getInitialRowHeight = (row: number): number | undefined => {
        const entry = this.projection.entries[row];
        return entry ? this.editor.getEntryHeight(entry.id) : undefined;
    };
    private readonly getScrollElement = (): HTMLElement | undefined => this.grid.scrollElement;

    /** Bound field: VirtualGridModel uses renderer identity as an input gate. */
    private readonly renderCell: VirtualFlexCellFunc = (params) => {
        if (params.col === 1) return undefined;
        const entry = this.projection.entries[params.row];
        if (!entry) return undefined;
        const kind = entry.type;
        const previousRecord = params.previous ? this.cells.get(params.previous) : undefined;
        const previous = params.previous && (!previousRecord || previousRecord.kind === kind) ? params.previous : undefined;
        const cell = previous ?? params.recycle?.(kind) ?? document.createElement("div");
        params.setReuseKey?.(cell, kind);
        let record = this.cells.get(cell);
        if (record?.failed) { this.discardRecord(record); record = undefined; }
        try {
            if (!record) {
                cell.replaceChildren();
                const view = new LogEntryWrapperView(this.entryProps(entry, params.row));
                record = { cell, kind, index: params.row, entry, view };
                this.cells.set(cell, record);
                this.cellRecords.add(record);
                view.mount();
                cell.append(view.root);
            }
            record.kind = kind;
            record.index = params.row;
            record.entry = entry;
            record.view.update(this.entryProps(entry, params.row));
            params.measure(record.view.root);
        } catch (error) {
            this.renderCellFailure(cell, error);
            if (record) {
                record.failed = true;
                this.discardRecord(record);
            }
            params.measure(cell);
        }
        return cell;
    };

    public constructor(props: LogBodyViewProps) {
        super(props, createPanelElement({ name: "log-view-root", direction: "column", flex: 1, overflow: "hidden", minHeight: 0 }));
        this.editor = props.model;
        this.projection = selectProjection(this.editor.state.get());
        this.grid = this.child(new VirtualFlexGridView(this.gridProps()));
    }

    protected onMount(): void {
        this.root.append(this.listHost, this.messageHost);
        this.attachGridRoot();
        this.grid.mount();
        this.stateUnsubscribe = this.ownSubscription(this.editor.state.subscribe(this.handleState, selectProjection));
        this.queueUnsubscribe = this.ownSubscription(this.editor.typedQueue.subscribe(this.handleQueue));
        this.applyProjection(this.projection);
        this.applyRowsAndAutoScroll(this.projection.entryCount);
        this.listenForScroll();
    }

    protected onUpdate(props: LogBodyViewProps): void {
        if (props.model !== this.editor) return;
        this.handleState(selectProjection(this.editor.state.get()));
    }

    protected onDispose(): void {
        this.clearScrollTimers();
        const records = [...this.cellRecords];
        this.cellRecords.clear();
        for (const record of records) {
            this.cells.delete(record.cell);
            try { record.view.dispose(); } catch (error) { console.error("Disposing a log cell threw", errMessage(error)); }
        }
    }

    private readonly handleState = (next: LogProjection): void => {
        const previous = this.projection;
        this.projection = next;
        this.applyProjection(next);
        if (previous.entries !== next.entries || previous.entryCount !== next.entryCount) this.applyRowsAndAutoScroll(next.entryCount);
        if (previous.showTimestamps !== next.showTimestamps) this.grid.gridModel?.update({ all: true });
    };

    private readonly handleQueue = (event: { type: "focus" | "scrollToBottom" }): void => {
        if (event.type === "focus") this.getScrollElement()?.focus();
        else this.scheduleScrollToBottom();
    };

    private listenForScroll(): void {
        const element = this.getScrollElement();
        if (element) this.listen(element, "scroll", this.handleScroll, { passive: true });
    }

    private readonly handleScroll = (): void => {
        const element = this.getScrollElement();
        if (!element) return;
        this.isAtBottom.value = element.scrollTop + element.clientHeight >= element.scrollHeight - AUTO_SCROLL_THRESHOLD;
    };

    private applyRowsAndAutoScroll(count: number): void {
        this.clearScrollTimers();
        this.grid.gridModel?.update({ all: true });
        if (count > this.previousEntryCount && this.isAtBottom.value && count > 0) {
            this.previousEntryCount = count;
            this.scheduleScrollToBottom();
        } else this.previousEntryCount = count;
    }

    private scheduleScrollToBottom(): void {
        this.clearScrollTimers();
        const count = this.previousEntryCount;
        if (count <= 0) return;
        const scrollToEnd = (): void => { void this.grid.gridModel?.scrollToRow(count - 1, "bottom"); };
        scrollToEnd();
        this.scrollTimers = [setTimeout(scrollToEnd, 50), setTimeout(scrollToEnd, 150), setTimeout(scrollToEnd, 300)];
    }

    private clearScrollTimers(): void { for (const timer of this.scrollTimers) clearTimeout(timer); this.scrollTimers = []; }

    private applyProjection(projection: LogProjection): void {
        const showMessage = Boolean(projection.error) || projection.entryCount === 0;
        this.listHost.style.display = showMessage ? "none" : "";
        this.messageHost.style.display = showMessage ? "" : "none";
        this.messageHost.replaceChildren();
        if (projection.error) this.messageHost.append(createTextElement(projection.error, { color: "warning", preWrap: true }));
        else if (projection.entryCount === 0) this.messageHost.append(createTextElement("No log entries", { size: "base", color: "light" }));
        this.attachGridRoot();
    }

    /** Idempotent attachment avoids reparenting the grid's scroller. */
    private attachGridRoot(): void {
        if (this.listHost.childElementCount === 1 && this.listHost.firstElementChild === this.grid.root) return;
        this.listHost.replaceChildren(this.grid.root);
    }

    private entryProps(entry: LogEntry, index: number) { return { vm: this.editor, entry, index, showTimestamp: this.projection.showTimestamps }; }

    private gridProps(): VirtualFlexGridProps {
        return { name: "log-flex-grid", rowCount: () => this.projection.entryCount, columnCount: 2, columnWidth, renderCell: this.renderCell, fitToWidth: true, minRowHeight: 18, getInitialRowHeight: this.getInitialRowHeight, preferMinHeightForNewRows: true };
    }

    private renderCellFailure(cell: HTMLElement, error: unknown): void { cell.replaceChildren(createTextElement(`This log entry failed to render: ${errMessage(error)}`, { color: "error", preWrap: true })); }

    private discardRecord(record: CellRecord): void {
        this.cells.delete(record.cell);
        this.cellRecords.delete(record);
        try { record.view.dispose(); } catch (error) { console.error("Disposing a failed log cell threw", errMessage(error)); }
    }
}
