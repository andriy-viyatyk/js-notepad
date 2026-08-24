import type React from "react";
import { maxSearchResults } from "../../../ipc/search-ipc";
import { applyCellStyle, VirtualGridView } from "../../uikit/VirtualGrid";
import type { RenderCellFunc } from "../../uikit/VirtualGrid";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { InputView } from "../../uikit/Input/InputView";
import { createIconElement } from "../../uikit/shared/slots";
import { claimViewOwnership, VanillaView } from "../../uikit/shared/vanilla-view";
import { createFileIconElement, subscribeFileIconElements } from "../icons/icon-elements";
import type { FileSearchProps } from "./FileSearch";
import {
    FileSearchModel,
    type FileSearchInternalState,
    type SearchResultFileRow,
    type SearchResultLineRow,
    type SearchResultRow,
} from "./FileSearchModel";
import "./FileSearch.css";

const ROW_HEIGHT = 22;
const FULL_WIDTH = () => "100%" as `${number}%`;

interface CellRecord {
    kind?: "file" | "line";
    row?: SearchResultRow;
    chevron?: HTMLSpanElement;
    fileIcon?: Element;
    fileName?: HTMLSpanElement;
    matchCount?: HTMLSpanElement;
    lineNumber?: HTMLSpanElement;
    lineText?: HTMLSpanElement;
}

type ChromeState = Pick<
    FileSearchInternalState,
    | "query"
    | "includePattern"
    | "excludePattern"
    | "showFilters"
    | "isSearching"
    | "filesSearched"
    | "totalMatches"
    | "totalFiles"
    | "truncated"
>;

/** Native owner for the file-search shell and its pooled VirtualGrid cells. */
export class FileSearchView extends VanillaView<FileSearchProps> {
    private readonly model: FileSearchModel;
    private readonly inputArea = document.createElement("div");
    private readonly queryRow = document.createElement("div");
    private readonly statusHost = document.createElement("div");
    private readonly resultsHost = document.createElement("div");
    private readonly gridHost = document.createElement("div");
    private readonly emptyHost = document.createElement("div");
    private readonly queryInput: InputView;
    private readonly includeInput: InputView;
    private readonly excludeInput: InputView;
    private readonly filterButton: IconButtonView;
    private readonly cellRecords = new WeakMap<HTMLElement, CellRecord>();
    private filtered: SearchResultRow[] = [];
    private grid: VirtualGridView | undefined;
    private queryField: HTMLInputElement | undefined;
    private focusFrame: number | undefined;
    private iconSubscription: (() => void) | undefined;
    private live = true;

    public constructor(props: FileSearchProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "file-search";

        this.model = new FileSearchModel(props.folder, props.state, props.onStateChange);
        this.iconSubscription = subscribeFileIconElements(() => {
            this.grid?.model.update({ all: true });
        });
        this.own(() => this.iconSubscription?.());
        this.own(() => this.model.dispose());
        this.own(() => this.leaveGrid());

        const state = this.model.state.get();
        this.queryInput = this.child(new InputView({
            value: state.query,
            placeholder: "Search...",
            ref: this.setQueryField,
            onChange: this.model.setQuery,
            onKeyDown: this.onQueryKeyDown,
            tone: "accent",
        }));
        this.includeInput = this.child(new InputView({
            value: state.includePattern,
            placeholder: "Include (e.g. *.ts, *.tsx)",
            onChange: this.model.setIncludePattern,
        }));
        this.excludeInput = this.child(new InputView({
            value: state.excludePattern,
            // node_modules and .git come from the search-exclude setting, so naming one here
            // would imply the field is what excludes it.
            placeholder: "Exclude — adds to Settings (e.g. dist, *.min.js)",
            onChange: this.model.setExcludePattern,
        }));
        this.filterButton = this.child(new IconButtonView({
            size: "sm",
            title: "Toggle Filters",
            onClick: this.model.toggleFilters,
            icon: state.showFilters ? "filter-arrow-up" : "filter-arrow-down",
        }));

        this.gridHost.style.display = "contents";
        this.emptyHost.className = "fs-empty";
        this.emptyHost.textContent = "No results found";
        this.statusHost.className = "fs-status";
        this.resultsHost.className = "fs-results";
        this.inputArea.className = "fs-input-area";
        this.queryRow.className = "fs-query-row";
        this.includeInput.root.classList.add("fs-filter-input");
        this.excludeInput.root.classList.add("fs-filter-input");
    }

    protected onMount(): void {
        this.queryRow.append(this.queryInput.root, this.filterButton.root);
        this.inputArea.append(this.queryRow, this.includeInput.root, this.excludeInput.root);
        this.resultsHost.append(this.gridHost, this.emptyHost);
        this.root.append(this.inputArea, this.statusHost, this.resultsHost);

        this.queryInput.mount();
        this.includeInput.mount();
        this.excludeInput.mount();
        this.filterButton.mount();

        this.bind(this.model.state, (state) => ({
            query: state.query,
            includePattern: state.includePattern,
            excludePattern: state.excludePattern,
            showFilters: state.showFilters,
            isSearching: state.isSearching,
            filesSearched: state.filesSearched,
            totalMatches: state.totalMatches,
            totalFiles: state.totalFiles,
            truncated: state.truncated,
        }), this.applyChrome);
        this.bind(this.model.state, (state) => state.resultsVersion, () => {
            this.filtered = this.model.getFilteredResults();
            this.applyArm(this.model.state.get());
            this.grid?.model.update({ all: true });
        });

        this.focusFrame = requestAnimationFrame(() => {
            this.focusFrame = undefined;
            if (this.live) this.queryField?.focus();
        });
        this.own(() => {
            if (this.focusFrame !== undefined) {
                cancelAnimationFrame(this.focusFrame);
                this.focusFrame = undefined;
            }
        });
    }

    /** Props are lifetime inputs; unrelated parent renders must not touch the grid. */
    protected onUpdate(_props: FileSearchProps): void {}

    protected onDispose(): void {
        this.live = false;
    }

    private readonly setQueryField = (field: HTMLInputElement | null): void => {
        this.queryField = field ?? undefined;
    };

    private readonly onQueryKeyDown = (event: React.KeyboardEvent): void => {
        if (event.key === "Enter") {
            event.preventDefault();
            this.model.triggerSearch();
        } else if (event.key === "Escape") {
            event.preventDefault();
            const query = this.model.state.get().query;
            if (query) this.model.setQuery("");
            else this.queryField?.blur();
        }
    };

    private readonly applyChrome = (state: ChromeState): void => {
        this.queryInput.update({
            value: state.query,
            placeholder: "Search...",
            ref: this.setQueryField,
            onChange: this.model.setQuery,
            onKeyDown: this.onQueryKeyDown,
            tone: "accent",
        });
        this.includeInput.update({
            value: state.includePattern,
            placeholder: "Include (e.g. *.ts, *.tsx)",
            onChange: this.model.setIncludePattern,
        });
        this.excludeInput.update({
            value: state.excludePattern,
            placeholder: "Exclude — adds to Settings (e.g. dist, *.min.js)",
            onChange: this.model.setExcludePattern,
        });
        this.includeInput.root.toggleAttribute("data-hidden", !state.showFilters);
        this.excludeInput.root.toggleAttribute("data-hidden", !state.showFilters);
        this.filterButton.update({
            size: "sm",
            title: "Toggle Filters",
            onClick: this.model.toggleFilters,
            icon: state.showFilters ? "filter-arrow-up" : "filter-arrow-down",
        });

        const status = this.statusText(state);
        this.statusHost.textContent = status;
        this.statusHost.toggleAttribute("data-empty", !status);
        this.applyArm(state);
    };

    private statusText(state: ChromeState): string {
        if (state.isSearching) return `Searching... ${state.filesSearched} files`;
        if (!state.query.trim()) return "";
        if (state.totalFiles === 0) return "No results";
        let text = `${state.totalMatches} matches in ${state.totalFiles} files`;
        if (state.truncated) {
            text += ` (first ${maxSearchResults} results — refine your search)`;
        }
        return text;
    }

    private applyArm(state: Pick<FileSearchInternalState, "query" | "isSearching">): void {
        if (this.filtered.length > 0) {
            this.enterGrid();
        } else {
            this.leaveGrid();
        }

        const showEmpty = Boolean(this.filtered.length === 0 && state.query.trim() && !state.isSearching);
        this.emptyHost.toggleAttribute("data-hidden", !showEmpty);
    }

    private enterGrid(): void {
        if (this.grid) return;
        const grid = new VirtualGridView({
            rowCount: () => this.filtered.length,
            columnCount: 1,
            rowHeight: ROW_HEIGHT,
            columnWidth: FULL_WIDTH,
            renderCell: this.renderCell,
            fitToWidth: true,
        });
        claimViewOwnership(grid);
        this.grid = grid;
        this.gridHost.append(grid.root);
        try {
            grid.mount();
        } catch (error) {
            this.grid = undefined;
            grid.dispose();
            grid.root.remove();
            throw error;
        }
    }

    private leaveGrid(): void {
        const grid = this.grid;
        if (!grid) return;
        this.grid = undefined;
        try {
            grid.dispose();
        } finally {
            grid.root.remove();
        }
    }

    private readonly renderCell: RenderCellFunc = (params) => {
        const row = this.filtered[params.row];
        if (!row) return undefined;

        const cell = params.previous ?? params.recycle?.() ?? document.createElement("div");
        let record = this.cellRecords.get(cell);
        if (!record) {
            record = { row };
            this.cellRecords.set(cell, record);
            cell.addEventListener("click", () => {
                if (!this.live || !record?.row) return;
                const current = record.row;
                if (current.type === "file") {
                    this.props.onResultClick?.(current.filePath);
                } else {
                    this.props.onResultClick?.(current.filePath, current.lineNumber);
                }
            });
        }
        record.row = row;
        applyCellStyle(
            cell,
            params.style,
            params.row,
            params.col,
            params.renderInfo.input.columnCount,
        );

        if (row.type === "file") this.renderFileCell(cell, record, row);
        else this.renderLineCell(cell, record, row);
        return cell;
    };

    private renderFileCell(cell: HTMLElement, record: CellRecord, row: SearchResultFileRow): void {
        cell.className = "fs-row fs-file-row";
        cell.title = row.filePath;
        if (record.kind !== "file") {
            cell.replaceChildren();
            record.kind = "file";
            record.chevron = document.createElement("span");
            record.chevron.className = "fs-file-icon";
            record.chevron.addEventListener("click", (event) => {
                event.stopPropagation();
                if (!this.live || record.row?.type !== "file") return;
                this.model.toggleFileExpanded(record.row.filePath);
            });
            record.fileName = document.createElement("span");
            record.fileName.className = "fs-file-name";
            record.matchCount = document.createElement("span");
            record.matchCount.className = "fs-match-count";
            cell.append(record.chevron, record.fileName, record.matchCount);
        }

        record.chevron!.replaceChildren(createIconElement(
            row.expanded ? "chevron-down" : "chevron-right",
            { width: 12, height: 12 },
        ));
        const icon = createFileIconElement({ path: row.filePath, width: 16, height: 16 });
        record.fileIcon?.replaceWith(icon);
        record.fileIcon = icon;
        record.chevron!.after(icon);
        record.fileName!.textContent = row.fileName;
        record.matchCount!.textContent = String(row.matchedLinesCount);
    }

    private renderLineCell(cell: HTMLElement, record: CellRecord, row: SearchResultLineRow): void {
        cell.className = "fs-row fs-line-row";
        cell.removeAttribute("title");
        if (record.kind !== "line") {
            cell.replaceChildren();
            record.kind = "line";
            record.lineNumber = document.createElement("span");
            record.lineNumber.className = "fs-line-number";
            record.lineText = document.createElement("span");
            record.lineText.className = "fs-line-text";
            cell.append(record.lineNumber, record.lineText);
        }
        record.lineNumber!.textContent = String(row.lineNumber);
        this.renderMatchText(record.lineText!, row);
    }

    /** Keep the FileSearch-specific ellipsis offset; highlightInto has different semantics. */
    private renderMatchText(host: HTMLSpanElement, row: SearchResultLineRow): void {
        const contextChars = 60;
        let displayText = row.lineText.trimStart();
        const trimmedChars = row.lineText.length - displayText.length;
        const adjustedStart = row.matchStart - trimmedChars;

        let startOffset = 0;
        if (adjustedStart > contextChars) {
            startOffset = adjustedStart - contextChars;
            displayText = "…" + displayText.substring(startOffset + 1);
        }

        const highlightStart = adjustedStart - startOffset + (startOffset > 0 ? 1 : 0);
        const before = displayText.substring(0, highlightStart);
        const match = displayText.substring(highlightStart, highlightStart + row.matchLength);
        const after = displayText.substring(highlightStart + row.matchLength);
        const highlight = document.createElement("span");
        highlight.className = "highlighted-text";
        highlight.textContent = match;
        host.replaceChildren(document.createTextNode(before), highlight, document.createTextNode(after));
    }
}
