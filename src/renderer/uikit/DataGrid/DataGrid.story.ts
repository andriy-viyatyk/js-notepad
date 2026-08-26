import { ButtonView } from "../Button/ButtonView";
import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { PopoverView, type PopoverViewProps } from "../Popover/PopoverView";
import { DataGridView } from "./DataGridView";
import type { Column, DataGridInstance, DataGridProps } from "./types";
import { cycleTheme } from "../../theme/themes";
// eslint-disable-next-line import/no-restricted-paths
import { showGridContextMenu } from "../../ui/dialogs/poppers/grid-context-menu";
import color from "../../theme/color";
import type { Story } from "../../editors/storybook/storyTypes";

type PanelId = "theming" | "in-popover" | "element-renderer" | "context-menu" | "overflow-tooltip";

interface DemoRow { id: string; name: string; kind: string; size: number; ratio: number; }
const KINDS = ["source", "asset", "config", "test", "doc"];

function makeRows(count: number): DemoRow[] {
    return Array.from({ length: count }, (_, i) => ({ id: `r${i}`, name: `Grace Hopper ${i}`, kind: KINDS[i % KINDS.length], size: (i * 977) % 100000, ratio: ((i * 37) % 100) / 100 }));
}

const COLUMNS: Column<DemoRow>[] = [
    { key: "name", name: "Name", width: 200 }, { key: "kind", name: "Kind", width: 110 },
    { key: "size", name: "Size", width: 100, dataType: "number", align: "right" }, { key: "ratio", name: "Ratio", width: 90, dataType: "number", align: "right" },
];

function renderRatioBar(value: unknown): HTMLElement {
    const element = document.createElement("div");
    element.dataset.part = "ratio-bar"; element.style.display = "flex"; element.style.alignItems = "center";
    element.style.gap = "6px"; element.style.padding = "0 6px"; element.style.boxSizing = "border-box";
    const ratio = typeof value === "number" ? value : 0;
    const bar = document.createElement("div"); bar.style.height = "8px"; bar.style.width = `${Math.round(ratio * 60)}px`; bar.style.background = color.background.selection; bar.style.flex = "0 0 auto";
    const label = document.createElement("span"); label.textContent = ratio.toFixed(2);
    element.append(bar, label); return element;
}

interface TooltipRow { id: string; path: string; n: number; tag: string; bar: number; blob: string; when: Date; }
const TOOLTIP_ROWS: TooltipRow[] = [
    { id: "t1", path: "C:/projects/persephone/src/renderer/uikit/DataGrid/cell-tooltip.ts", n: 123456789012, tag: "needs-a-tooltip-because-it-is-far-too-long", bar: 3, blob: JSON.stringify({ note: "x".repeat(50000) }), when: new Date(Date.UTC(2026, 7, 22, 14, 3, 11)) },
    { id: "t2", path: "short.ts", n: 7, tag: "ok", bar: 1, blob: "{}", when: new Date(Date.UTC(2026, 0, 2, 9, 0, 0)) },
    { id: "t3", path: "C:/projects/persephone/doc/tasks/US-1024-cell-overflow-tooltip/README.md", n: 987654321098, tag: "another-one-that-does-not-fit-either", bar: 5, blob: "y".repeat(3000), when: new Date(Date.UTC(2026, 7, 22, 23, 59, 59)) },
];
const TOOLTIP_COLUMNS: Column<TooltipRow>[] = [
    { key: "path", name: "Path", width: 150 }, { key: "n", name: "Number", width: 80, dataType: "number" }, { key: "when", name: "When", width: 90 },
    { key: "tag", name: "Tag (render)", width: 110, render: (cell) => `<span class="avg-cell-text">${cell.highlight(String(cell.value))}</span>` },
    { key: "bar", name: "Bar", width: 90, formatValue: () => "", render: (cell) => { const element = document.createElement("div"); element.dataset.part = "ratio-bar"; element.style.height = "8px"; element.style.width = `${Number(cell.value) * 14}px`; element.style.background = color.background.selection; return element; } },
    { key: "blob", name: "Blob", width: 110 },
];

interface DemoProps { panel?: PanelId; rowCount?: number; searchString?: string; highlightString?: string; filterBar?: boolean; rowNoun?: string; }

interface BranchProps extends DemoProps { rows: DemoRow[]; viewport: string; popoverOpen: boolean; onReadViewport: () => void; onTogglePopover: () => void; onClosePopover: () => void; onGrid: (grid: DataGridInstance<DemoRow> | DataGridInstance<TooltipRow> | null) => void; }

class DataGridPopoverContentView extends VanillaView<{ props: DataGridProps<DemoRow> }> {
    private grid: DataGridView<DemoRow> | undefined;
    public constructor(props: { props: DataGridProps<DemoRow> }) { super(props, createPanelElement({ direction: "column", width: 420, height: 260 })); }
    protected onMount(): void { const grid = this.child(new DataGridView(this.props.props)); this.grid = grid; this.root.append(grid.root); grid.mount(); }
    protected onUpdate(props: { props: DataGridProps<DemoRow> }): void { this.grid?.update(props.props); }
}

class DataGridBranchView extends VanillaView<BranchProps> {
    private panel: PanelId;
    private demoGrid: DataGridView<DemoRow> | undefined;
    private tooltipGrid: DataGridView<TooltipRow> | undefined;
    private popover: PopoverView | undefined;
    private content: DataGridPopoverContentView | undefined;
    private viewportElement: HTMLElement | undefined;
    private anchor: ButtonView | undefined;

    public constructor(props: BranchProps) {
        const size = props.panel === "in-popover" ? {} : { width: 720, height: 420 };
        super(props, createPanelElement({ direction: "column", gap: props.panel === "in-popover" ? "md" : "sm", padding: props.panel === "in-popover" ? "lg" : undefined, align: props.panel === "in-popover" ? "start" : undefined, ...size }));
        this.panel = props.panel ?? "theming";
    }

    protected onMount(): void { this.build(this.props); }
    protected onUpdate(props: BranchProps): void { this.updateBranch(props); }

    private build(props: BranchProps): void {
        const panel = props.panel ?? "theming";
        if (panel === "theming") {
            const next = this.child(new DataGridView(this.demoProps(props)));
            this.demoGrid = next;
            const controls = createPanelElement({ direction: "row", gap: "sm", align: "center" });
            const theme = this.child(new ButtonView({ children: "Next theme", onClick: () => cycleTheme(1) }));
            const read = this.child(new ButtonView({ children: "Read viewport", onClick: props.onReadViewport }));
            this.viewportElement = createTextElement(props.viewport, { size: "sm", color: "light" });
            controls.append(theme.root, read.root, this.viewportElement); this.root.append(controls, createTextElement("Open a column filter popover, then a cell dropdown, then switch theme with all of them open. Each of the grid root, the popover, the list and the filter bar declares the whole --avg-* block on itself. Font must be Consolas, not a system sans.", { size: "sm", color: "light" }), createPanelElement({ direction: "column", flex: true }, [next.root]));
            theme.mount(); read.mount(); next.mount(); return;
        }
        if (panel === "in-popover") {
            const controls = createPanelElement({ direction: "row", gap: "sm", align: "center" });
            const anchor = this.child(new ButtonView({ children: props.popoverOpen ? "Close popover" : "Open grid in popover", onClick: props.onTogglePopover }));
            const read = this.child(new ButtonView({ children: "Read viewport", onClick: props.onReadViewport }));
            this.anchor = anchor; this.viewportElement = createTextElement(props.viewport, { size: "sm", color: "light" }); controls.append(anchor.root, read.root, this.viewportElement);
            this.root.append(controls, createTextElement("The shape ColumnsOptions needs. A popover sizes to its content, so the grid host must be given an explicit height — and the grid's own filter popover mounts on document.body, above this one.", { size: "sm", color: "light" }));
            this.popover = this.child(new PopoverView(this.popoverProps(props, anchor.root))); this.root.append(this.popover.root);
            anchor.mount(); read.mount(); this.popover.mount(); return;
        }
        if (panel === "element-renderer") {
            const columns = COLUMNS.map((column) => column.key === "ratio" ? { ...column, width: 160, render: (cell: import("./types").CellContext<DemoRow>) => renderRatioBar(cell.value) } : column);
            const button = this.child(new ButtonView({ children: "Scroll to the middle", onClick: () => void this.demoGrid?.grid?.scrollToRow(Math.floor((props.rowCount ?? 2000) / 2)) }));
            const text = createTextElement("Judge the Ratio column here, not at row 1: hover a row and select one, and the bar cell must take the same tint as the text cells beside it. If it paints over them, its content has been positioned — which it must not be.", { size: "sm", color: "light" });
            const row = createPanelElement({ direction: "row", gap: "sm", align: "center" }, [button.root, text]); const next = this.child(new DataGridView(this.commonProps(props, columns))); this.demoGrid = next;
            this.root.append(row, createPanelElement({ direction: "column", flex: true }, [next.root])); button.mount(); next.mount(); return;
        }
        if (panel === "overflow-tooltip") {
            const read = this.child(new ButtonView({ children: "Read viewport", onClick: props.onReadViewport })); this.viewportElement = createTextElement(props.viewport, { size: "sm", color: "light" });
            const columns = TOOLTIP_COLUMNS; const next = this.child(new DataGridView<TooltipRow>({ name: "data-grid-story-overflow-tooltip", rows: TOOLTIP_ROWS, columns, getRowKey: (row) => row.id, searchString: props.searchString || undefined, filterBar: props.filterBar, onGrid: (grid) => props.onGrid(grid) })); this.tooltipGrid = next;
            this.root.append(createPanelElement({ direction: "row", gap: "sm", align: "center" }, [read.root, this.viewportElement]), createTextElement("Every column is deliberately too narrow. Each clipped cell must show a real ellipsis and, after the hover delay, its full value; Number must truncate on the right, never lose its leading digits. Tag opts into the tooltip from a render string; Bar must show none at all. Blob is capped, with the count of what was dropped. Nothing may appear while dragging a range, while resizing a column, or over an open filter popover.", { size: "sm", color: "light" }), createPanelElement({ direction: "column", flex: true }, [next.root])); read.mount(); next.mount(); return;
        }
        const next = this.child(new DataGridView(this.demoProps(props))); this.demoGrid = next;
        this.root.append(createTextElement(`Right-click a cell: Persephone's own menu, with Persephone icons on the library's items. Neither av-grid's .avg-menu nor the browser menu should appear. The row items read "${props.rowNoun ?? "file"}", and "Reveal" is a host item passed through getContextMenuItems with its own icon left alone.`, { size: "sm", color: "light" }), createPanelElement({ direction: "column", flex: true }, [next.root])); next.mount();
    }

    private updateBranch(props: BranchProps): void {
        this.viewportElement && (this.viewportElement.textContent = props.viewport);
        if (this.anchor) this.anchor.update({ children: props.popoverOpen ? "Close popover" : "Open grid in popover", onClick: props.onTogglePopover });
        if (this.popover && this.anchor) this.popover.update(this.popoverProps(props, this.anchor.root));
        this.content?.update({ props: { ...this.commonProps(props, COLUMNS), rows: props.rows.slice(0, 200), filterBar: props.filterBar } });
        if (this.demoGrid && this.panel !== "in-popover" && this.panel !== "overflow-tooltip") this.demoGrid.update(this.demoProps(props));
    }

    private commonProps(props: BranchProps, columns: Column<DemoRow>[]): DataGridProps<DemoRow> { return { name: `data-grid-story-${props.panel ?? "theming"}`, rows: props.rows, columns, getRowKey: (row) => row.id, rowNoun: props.rowNoun, searchString: props.searchString || undefined, highlightString: props.highlightString || undefined, onGrid: props.onGrid }; }
    private demoProps(props: BranchProps): DataGridProps<DemoRow> {
        if (this.panel === "element-renderer") {
            const columns = COLUMNS.map((column) => column.key === "ratio" ? { ...column, width: 160, render: (cell: import("./types").CellContext<DemoRow>) => renderRatioBar(cell.value) } : column);
            return this.commonProps(props, columns);
        }
        if (this.panel === "context-menu") {
            return { ...this.commonProps(props, COLUMNS), editable: true, canAddRows: true, canDeleteRows: true, newRow: (index) => ({ id: `new${index}`, name: "", kind: "source", size: 0, ratio: 0 }), getContextMenuItems: (event) => [{ label: `Reveal ${event.rowKey ?? "nothing"}`, onClick: () => undefined }], onGridContextMenu: showGridContextMenu };
        }
        return { ...this.commonProps(props, COLUMNS), filterBar: props.filterBar, editable: this.panel === "theming" };
    }
    private popoverProps(props: BranchProps, anchor: HTMLElement): PopoverViewProps { return { open: props.popoverOpen, elementRef: anchor, placement: "bottom-start", offset: [0, 4], scroll: false, onClose: props.onClosePopover, contentView: (host) => { const content = new DataGridPopoverContentView({ props: { ...this.commonProps(props, COLUMNS), rows: props.rows.slice(0, 200), filterBar: props.filterBar } }); host.append(content.root); this.content = content; return content; } }; }
}

class DataGridDemoView extends VanillaView<DemoProps> {
    private rows: DemoRow[] = [];
    private rowsKey = "";
    private viewport = "";
    private popoverOpen = false;
    private branch: DataGridBranchView | undefined;
    private grid: DataGridInstance<DemoRow> | DataGridInstance<TooltipRow> | null = null;
    private previousPanel: PanelId = "theming";

    public constructor(props: DemoProps) { super(props, createPanelElement({ direction: "column", width: 720, height: 420 })); }
    protected onMount(): void { this.syncRows(this.props); this.mountBranch(this.props); this.previousPanel = this.props.panel ?? "theming"; }
    protected onUpdate(props: DemoProps): void { this.syncRows(props); if ((props.panel ?? "theming") !== this.previousPanel) this.mountBranch(props); else this.branch?.update(this.branchProps(props)); this.previousPanel = props.panel ?? "theming"; }
    private syncRows(props: DemoProps): void { const key = String(props.rowCount ?? 2000); if (key !== this.rowsKey) { this.rows = makeRows(props.rowCount ?? 2000); this.rowsKey = key; } }
    private readonly readViewport = (): void => { const state = this.grid?.getState(); this.viewport = state ? `viewport ${Math.round(state.viewport.width)}×${Math.round(state.viewport.height)} · ${state.rowCount} rows` : "no grid"; this.branch?.update(this.branchProps(this.props)); };
    private readonly togglePopover = (): void => { this.popoverOpen = !this.popoverOpen; this.branch?.update(this.branchProps(this.props)); };
    private readonly closePopover = (): void => { this.popoverOpen = false; this.branch?.update(this.branchProps(this.props)); };
    private readonly setGrid = (grid: DataGridInstance<DemoRow> | DataGridInstance<TooltipRow> | null): void => { this.grid = grid; };
    private branchProps(props: DemoProps): BranchProps { return { ...props, rows: this.rows, viewport: this.viewport, popoverOpen: this.popoverOpen, onReadViewport: this.readViewport, onTogglePopover: this.togglePopover, onClosePopover: this.closePopover, onGrid: this.setGrid }; }
    private mountBranch(props: DemoProps): void { this.branch?.dispose(); this.branch = this.child(new DataGridBranchView(this.branchProps(props))); this.root.replaceChildren(this.branch.root); this.branch.mount(); }
    protected onDispose(): void { this.branch = undefined; this.grid = null; }
}

export const dataGridStory: Story<DemoProps> = { id: "data-grid", name: "DataGrid", section: "Lists", view: DataGridDemoView, props: [
    { name: "panel", type: "enum", options: ["theming", "in-popover", "element-renderer", "context-menu", "overflow-tooltip"], default: "theming" },
    { name: "rowCount", type: "number", default: 2000, min: 0, step: 100 }, { name: "searchString", type: "string", default: "" }, { name: "highlightString", type: "string", default: "" },
    { name: "filterBar", type: "boolean", default: true }, { name: "rowNoun", type: "string", default: "file" },
] };
