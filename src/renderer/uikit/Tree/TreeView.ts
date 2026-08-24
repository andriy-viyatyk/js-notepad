import React from "react";
import { createComponentModelDriver, type ComponentModelDriver } from "../../core/state/model";
import { createDepsGate, type DepsGate } from "../shared/deps-gate";
import { nextElementId } from "../shared/element-id";
import { fillSlot } from "../shared/fill-slot";
import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type RestPropsState,
} from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import { SpinnerView } from "../Spinner/SpinnerView";
import { applyCellStyle, VirtualGridView } from "../VirtualGrid";
import type {
    ElementLength,
    Percent,
    RenderCellFunc,
    RenderCellParams,
} from "../VirtualGrid";
import { TreeItemView } from "./TreeItemView";
import { SectionItemView } from "./SectionItemView";
import { defaultTreeState, TreeModel } from "./TreeModel";
import type { ITreeItem, TreeProps, TreeRow } from "./types";
import "./Tree.css";

type Arm = "loading" | "empty" | "real";
type CellKind = "item" | "section" | "custom";

/**
 * Per-wrapper state for a pooled cell.
 *
 * The pool deliberately does **not** reset a released element — its children, classes, attributes
 * and listeners all survive — so this map is how a recycled wrapper is recognised on its way back
 * in. `index` is rewritten on every render and read by the listeners installed once at creation,
 * which is why the row index never has to appear as a `data-*` attribute (the React DOM had none).
 */
interface CellRecord {
    kind: CellKind;
    index: number;
    view?: TreeItemView | SectionItemView;
    slotCleanup?: () => void;
}

const columnWidth: ElementLength = (() => "100%" as Percent) as ElementLength;
const defaultRowHeight = 22;
const defaultIndentSize = 16;

/**
 * The tree shell.
 *
 * Four things are worth knowing before editing:
 *
 * - **`renderCell` is a bound field, not a closure.** `VirtualGridModel.inputChanged()` compares it
 *   by identity, so a per-update closure would make the engine repaint every visible cell on every
 *   update — which is what the React version did, and what the repaint gate exists to stop.
 * - **A state change arrives through `model.onStateApplied`, not through props.** Expansion, lazy
 *   loading and drag state all live in `TreeState`, and a vanilla driver pumps only props. The
 *   model's `mutate()` funnel calls `refresh()` here, and `refresh` re-runs the *render pass* rather
 *   than only repainting cells — see the comment on it.
 * - **The three arms are three DOM states of one stable root.** React returned three different
 *   trees; here `applyArm()` owns every attribute that differs between them, including the removals.
 * - **The engine is created on entry to the real arm and disposed on leaving it**, which is what
 *   React did. Keeping it alive behind `display: none` would be cheaper but would hand a stale
 *   scroll offset to a dataset that was replaced while the tree showed a spinner.
 */
export class TreeView<T = ITreeItem> extends VanillaView<TreeProps<T>> {
    private readonly driver: ComponentModelDriver<
        typeof defaultTreeState,
        TreeProps<T>,
        TreeModel<T>
    >;

    private readonly restPropsState: RestPropsState = createRestPropsState();
    private readonly repaintGate: DepsGate = createDepsGate();
    /** Every row view ever created, so disposal can reach the ones the pool still holds. */
    private readonly rowViews = new Set<TreeItemView | SectionItemView>();
    private readonly cells = new WeakMap<HTMLElement, CellRecord>();

    private arm: Arm | undefined;
    private grid: VirtualGridView | null = null;
    private gridHost: HTMLDivElement | undefined;
    private messageHost: HTMLDivElement | undefined;
    private spinner: SpinnerView | undefined;
    private lastActiveIndex: number | null | undefined = undefined;
    private lastEmptyMessage: TreeProps<T>["emptyMessage"] | undefined = undefined;
    /**
     * Set before anything else is torn down, so a cell listener that fires during disposal — the
     * pooled wrappers keep their listeners by design — cannot reach a half-disposed model.
     */
    private inert = false;

    public constructor(props: TreeProps<T>) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "tree";

        this.driver = createComponentModelDriver(
            props,
            TreeModel as unknown as TreeModel<T>,
            defaultTreeState,
        );
        this.model.setElementId(nextElementId("tree"));
        // Registered before `driver.mount()`, so a state write from a consumer's `onModel` callback
        // already has somewhere to land.
        this.model.onStateApplied = this.refresh;

        // Registration order is load-bearing: disposal runs these FIFO, and the grid and the row
        // views must go before the driver, whose `onUnmount` reports `onModel(null)` to the host.
        this.own(() => { this.inert = true; });
        this.own(() => { this.model.onStateApplied = null; });
        this.own(() => {
            this.grid?.dispose();
            this.grid = null;
        });
        this.own(() => {
            this.rowViews.forEach((view) => view.dispose());
            this.rowViews.clear();
        });
        this.own(() => this.spinner?.dispose());
        this.own(() => this.driver.dispose());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    /** The live model, for the React shim's `onModel` contract and for the story. */
    public get model(): TreeModel<T> {
        return this.driver.model;
    }

    /** Repaint pooled rows after an external DOM projection (for example a cached icon) changed. */
    public refreshRows(): void {
        if (this.inert || this.arm !== "real") return;
        this.grid?.model.update({ all: true });
    }

    protected onMount(): void {
        this.messageHost = document.createElement("div");
        this.messageHost.dataset.part = "message";

        this.gridHost = document.createElement("div");
        this.gridHost.dataset.part = "grid";
        this.gridHost.style.display = "contents";

        // `contextmenu` is on all three React arms; `keydown` and `mouseleave` were on the real arm
        // only, so they are gated. A listener is not in a DOM snapshot, so permanence is free.
        this.listen(this.root, "contextmenu", (event) => this.model.onRootContextMenu(event));
        this.listen(this.root, "keydown", (event) => {
            if (this.arm !== "real") return;
            this.model.onKeyDown(event);
        });
        this.listen(this.root, "mouseleave", () => {
            if (this.arm !== "real") return;
            this.model.onRootMouseLeave();
        });

        this.applyArm(this.props);

        // After the grid exists: `init()` reports `onModel(this.model)`, and a consumer may call
        // `model.revealItem()` synchronously from that callback.
        this.driver.mount();

        this.syncActiveScroll(this.props.activeIndex, false);
        this.repaintGate.prime(this.model.repaintSignature());
    }

    protected onUpdate(props: TreeProps<T>): void {
        this.driver.update(props);
        this.applyArm(props);
        const contentChanged = this.repaintGate.changed(this.model.repaintSignature());
        if (contentChanged) {
            this.grid?.model.update({ all: true });
        }
        if (props.activeIndex !== this.lastActiveIndex) {
            this.syncActiveScroll(props.activeIndex, contentChanged);
        }
    }

    /**
     * The consequence of a state write, registered as `model.onStateApplied`.
     *
     * This re-runs the **render pass**, not just a cell repaint, because root attributes can be
     * state-derived: `aria-activedescendant` reads `rows.length` for its bounds check *and*
     * `rows.value[i].value` for the id itself, so a `collapseAll()` with a high `activeIndex` has to
     * remove the attribute, and an in-range collapse has to rewrite it. React got that for free by
     * re-rendering the whole root.
     *
     * Three things it deliberately does not do:
     * - it does not call `applyRestProps`, which removes and re-adds every `on*` listener on every
     *   call. Rest props cannot have changed on a state write, and reinstalling the root's listeners
     *   during a drag is a hazard rather than mere churn;
     * - it does not evaluate the arm work unless the arm actually changed (see below);
     * - it does not skip re-priming the gate. Immer gives `expanded` a new identity, so `rows.value`
     *   is a new array and the next props pump — any pump — would otherwise report "changed" and
     *   repaint a second time. Priming is safe here precisely because this method just painted
     *   everything, so the gate and the DOM agree.
     */
    private refresh = (): void => {
        if (this.inert) return;
        // Insurance for a branch that is unreachable today: `rows.push` is unconditional per source
        // and only the recursion is gated on expansion, so `rows.length === 0` iff `props.items` is
        // empty, and no state write can flip the arm. The proof dies the day `searchText` filters
        // instead of highlighting, and this costs one cached-memo read.
        if (this.armFor(this.props) !== this.arm) {
            this.applyArm(this.props);
            return;
        }
        this.applyActiveDescendant(this.props);
        this.repaintGate.prime(this.model.repaintSignature());
        this.grid?.model.update({ all: true });
    };

    // -----------------------------------------------------------------------
    // Arms
    // -----------------------------------------------------------------------

    private armFor(props: TreeProps<T>): Arm {
        if (props.loading) return "loading";
        return this.model.rows.value.length === 0 ? "empty" : "real";
    }

    /**
     * Bring the DOM to the arm `props` implies, then write every root attribute.
     *
     * Every per-arm attribute is written in both directions. React expressed the arms as three
     * different elements, so an attribute it simply omitted in one arm has to be *removed* here —
     * and `root.tabIndex = -1` is not the same as no `tabindex` at all.
     */
    private applyArm(props: TreeProps<T>): void {
        const messageHost = this.messageHost;
        if (!messageHost) return;

        const arm = this.armFor(props);
        const changed = arm !== this.arm;
        this.arm = arm;

        if (arm === "real") {
            if (changed) {
                messageHost.remove();
                this.enterRealArm(props);
            } else {
                this.grid?.update(this.gridProps(props));
            }
        } else {
            if (changed) {
                this.leaveRealArm();
                this.root.append(messageHost);
            }
            // Only when the content can actually have changed: re-running `fillSlot` every update
            // would move the spinner element and rewrite the text node for nothing.
            if (changed || props.emptyMessage !== this.lastEmptyMessage) {
                this.lastEmptyMessage = props.emptyMessage;
                this.fillMessage(arm, props);
            }
        }

        const root = this.root;
        const focusAware = (props.keyboardNav ?? false) || (props.focusSelection ?? false);

        setOrRemove(root, "id", this.model.rootId);
        setOrRemove(root, "data-name", props.name);
        // Unlike ListBox, these two are on all three React arms (Tree.tsx's three Root variants).
        toggle(root, "data-keyboard-nav", props.keyboardNav ?? false);
        toggle(root, "data-focus-selection", focusAware);
        toggle(root, "data-loading", arm === "loading");
        toggle(root, "data-empty", arm === "empty");

        if (arm === "real") {
            toggle(root, "data-multi-select", props.multiSelect ?? false);
            root.setAttribute("role", "tree");
            setOrRemove(root, "aria-multiselectable", props.multiSelect ? "true" : undefined);
            root.tabIndex = focusAware ? 0 : -1;
            this.applyActiveDescendant(props);
        } else {
            root.removeAttribute("data-multi-select");
            root.removeAttribute("role");
            root.removeAttribute("aria-multiselectable");
            root.removeAttribute("tabindex");
            root.removeAttribute("aria-activedescendant");
        }

        // Residual props last, matching the JSX spread order: a caller-supplied role, tabIndex or
        // aria-* wins over the arm's own value.
        applyRestProps(root, this.restProps(props), this.restPropsState);
    }

    /**
     * The one writer of `aria-activedescendant`, called from `applyArm`'s real arm and from
     * `refresh`. Both the bounds check and the id are derived from `rows`, so this cannot be folded
     * into the props path.
     */
    private applyActiveDescendant(props: TreeProps<T>): void {
        if (this.arm !== "real") return;
        const rowCount = this.model.rows.value.length;
        const activeIndex = props.activeIndex;
        const activeId =
            activeIndex != null && activeIndex >= 0 && activeIndex < rowCount
                ? this.model.itemId(activeIndex)
                : undefined;
        setOrRemove(this.root, "aria-activedescendant", activeId);
    }

    private enterRealArm(props: TreeProps<T>): void {
        if (!this.gridHost) return;
        this.root.append(this.gridHost);
        const grid = new VirtualGridView(this.gridProps(props));
        this.gridHost.append(grid.root);
        grid.mount();
        this.grid = grid;
        this.model.setGridRef(grid.model);
    }

    private leaveRealArm(): void {
        this.model.setGridRef(null);
        this.grid?.dispose();
        this.grid = null;
        this.gridHost?.remove();
        // The pool is gone with the engine, so nothing may hold a recycled wrapper any more.
        this.rowViews.forEach((view) => view.dispose());
        this.rowViews.clear();
        if (this.gridHost) this.gridHost.replaceChildren();
    }

    private fillMessage(arm: Arm, props: TreeProps<T>): void {
        const messageHost = this.messageHost;
        if (!messageHost) return;

        if (arm === "loading") {
            if (!this.spinner) {
                this.spinner = new SpinnerView({ size: 16 });
                this.spinner.mount();
            }
            const fragment = document.createDocumentFragment();
            fragment.append(this.spinner.root, document.createTextNode("loading…"));
            fillSlot(messageHost, fragment);
            return;
        }
        fillSlot(messageHost, props.emptyMessage ?? "no items");
    }

    private gridProps(props: TreeProps<T>) {
        return {
            // A thunk, so a pure row-count change is detected by the engine's own `inputChanged()`
            // and needs no slot in the repaint signature.
            rowCount: () => this.model.rows.value.length,
            columnCount: 1,
            columnWidth,
            rowHeight: props.rowHeight ?? defaultRowHeight,
            renderCell: this.renderCell,
            overscanRow: 2,
            fitToWidth: true,
            // `TreeProps.growToHeight` is a CSS height, so it may be a bare number; the engine's
            // prop is a string, and React would have added the unit itself.
            growToHeight: cssLength(props.growToHeight),
            whiteSpaceY: props.whiteSpaceY,
        };
    }

    // -----------------------------------------------------------------------
    // Cells
    // -----------------------------------------------------------------------

    private renderCell: RenderCellFunc = (p: RenderCellParams) => {
        const row = this.model.rows.value[p.row];
        if (!row) return undefined;

        let wrapper = p.previous ?? p.recycle?.();
        let record = wrapper ? this.cells.get(wrapper) : undefined;
        if (!wrapper || !record) {
            wrapper = document.createElement("div");
            record = { kind: "item", index: p.row };
            this.cells.set(wrapper, record);
            this.installCellListeners(wrapper);
            // A fresh record claims "item" but owns nothing yet, so force the install below.
            record.view = undefined;
        }
        record.index = p.row;
        applyCellStyle(wrapper, p.style, p.row, p.col, p.renderInfo.input.columnCount);

        const dndEnabled = this.model.isDndEnabled;
        const canDrag = dndEnabled && this.model.canDragRow(p.row);
        // React wrote `draggable={canDrag || undefined}`. Use the IDL property, not
        // `setAttribute`: `draggable` is an enumerated attribute whose only valid keywords are
        // "true" and "false", and `""` falls back to `auto`, i.e. not draggable.
        wrapper.draggable = canDrag;

        const id = this.model.itemId(p.row);
        const kind: CellKind = row.item.section
            ? "section"
            : this.props.renderItem
                ? "custom"
                : "item";

        if (record.kind !== kind || (kind !== "custom" && !record.view)) {
            this.releaseCell(record);
            record.kind = kind;
            if (kind === "section") {
                const view = new SectionItemView(this.sectionProps(row, id));
                view.mount();
                this.rowViews.add(view);
                record.view = view;
                record.slotCleanup = fillSlot(wrapper, view.root);
            } else if (kind === "item") {
                const view = new TreeItemView(this.itemProps(row, id, p.row));
                view.mount();
                this.rowViews.add(view);
                record.view = view;
                record.slotCleanup = fillSlot(wrapper, view.root);
            }
        } else if (kind === "section") {
            record.view?.update(this.sectionProps(row, id) as never);
        } else if (kind === "item") {
            record.view?.update(this.itemProps(row, id, p.row) as never);
        }

        if (kind === "custom") {
            const node = this.props.renderItem?.(this.renderContext(row, id, p.row));
            // Keyed by cell coordinate, exactly as React's `<div key={key}>` was: a scroll must
            // unmount the outgoing row's subtree rather than let its state bleed into the incoming
            // one. The array is what makes the key meaningful — a lone child is not keyed.
            record.slotCleanup = fillSlot(wrapper, [
                React.createElement(React.Fragment, { key: p.key }, node),
            ]);
        }

        return wrapper;
    };

    private sectionProps(row: TreeRow<T>, id: string) {
        return {
            id,
            level: row.level,
            label: row.item.label,
            indentSize: this.props.indentSize ?? defaultIndentSize,
        };
    }

    private itemProps(row: TreeRow<T>, id: string, index: number) {
        return {
            id,
            level: row.level,
            expanded: row.expanded,
            // From the consumer's POV, "hasChildren" means "row is expandable (chevron should
            // render)". A lazy row whose children have not loaded yet still belongs in this set.
            hasChildren: row.hasChildren || row.lazyChildren,
            icon: row.item.icon,
            iconElement: this.props.getIconElement?.(row.source, row.level),
            label: row.item.label,
            searchText: this.props.searchText,
            selected: this.model.isSelectedAt(index),
            active: index === this.props.activeIndex,
            dragging: this.model.isDraggingAt(index),
            dropActive: this.model.isDropTargetAt(index),
            loading: this.model.isLoadingAt(index),
            disabled: row.item.disabled,
            tooltip: this.props.getTooltip?.(row.source, row.level),
            indentSize: this.props.indentSize ?? defaultIndentSize,
            hideChevron: this.props.getHideChevron?.(row.source, row.level),
            trailing: this.props.renderTrailing?.(row.source, row.level),
            onContextMenu: this.props.onItemContextMenu
                ? (event: React.MouseEvent<HTMLDivElement>) => {
                    this.props.onItemContextMenu?.(row.source, row.level, event);
                }
                : undefined,
            // A fresh closure per render is fine here — it is a row *prop*, not the engine's
            // `renderCell`, and `update()` re-supplies it with the current index on every render, so
            // a recycled row never calls the previous row's handler.
            onChevronClickNative: (event: MouseEvent) => {
                this.model.onChevronClick(event, index);
            },
        };
    }

    private renderContext(row: TreeRow<T>, id: string, index: number) {
        return {
            item: row.item,
            source: row.source,
            level: row.level,
            expanded: row.expanded,
            hasChildren: row.hasChildren || row.lazyChildren,
            rowIndex: index,
            selected: this.model.isSelectedAt(index),
            active: index === this.props.activeIndex,
            dragging: this.model.isDraggingAt(index),
            dropActive: this.model.isDropTargetAt(index),
            loading: this.model.isLoadingAt(index),
            id,
            toggleExpanded: () => this.model.toggleAt(index),
        };
    }

    /**
     * Installed once per wrapper, never per render — a released element keeps its listeners, so
     * re-adding them on recycle would stack an unbounded set on every pooled cell.
     *
     * The drag gates are inside the handlers because a pooled wrapper outlives the row that decided
     * whether it could drag. A gated no-op is behaviourally identical to React's `undefined`
     * handler: for `dragenter`/`dragover`, "no handler" and "a handler that does not
     * `preventDefault`" both mean "drop not allowed".
     */
    private installCellListeners(wrapper: HTMLElement): void {
        wrapper.addEventListener("click", (event) => {
            const record = this.activeRecord(wrapper);
            if (record) this.model.onItemClick(record.index, event);
        });
        wrapper.addEventListener("dblclick", () => {
            const record = this.activeRecord(wrapper);
            if (record) this.model.onItemDoubleClick(record.index);
        });
        wrapper.addEventListener("mouseenter", () => {
            const record = this.activeRecord(wrapper);
            if (record) this.model.onItemMouseEnter(record.index);
        });
        wrapper.addEventListener("contextmenu", (event) => {
            const record = this.activeRecord(wrapper);
            if (record) this.model.onItemContextMenu(event, record.index);
        });

        wrapper.addEventListener("dragstart", (event) => {
            const index = this.dragIndex(wrapper);
            if (index != null) this.model.onDragStart(event, index);
        });
        wrapper.addEventListener("dragend", () => {
            const index = this.dragIndex(wrapper);
            if (index != null) this.model.onDragEnd();
        });
        wrapper.addEventListener("dragenter", (event) => {
            const index = this.dropIndex(wrapper);
            if (index != null) this.model.onDragEnter(event, index);
        });
        wrapper.addEventListener("dragover", (event) => {
            const index = this.dropIndex(wrapper);
            if (index != null) this.model.onDragOver(event, index);
        });
        wrapper.addEventListener("dragleave", (event) => {
            const index = this.dropIndex(wrapper);
            if (index != null) this.model.onDragLeave(event, index);
        });
        wrapper.addEventListener("drop", (event) => {
            const index = this.dropIndex(wrapper);
            if (index != null) this.model.onDrop(event, index);
        });
    }

    private activeRecord(wrapper: HTMLElement): CellRecord | undefined {
        if (this.inert || this.arm !== "real") return undefined;
        return this.cells.get(wrapper);
    }

    private dragIndex(wrapper: HTMLElement): number | undefined {
        const record = this.activeRecord(wrapper);
        if (!record || !this.model.isDndEnabled) return undefined;
        return this.model.canDragRow(record.index) ? record.index : undefined;
    }

    private dropIndex(wrapper: HTMLElement): number | undefined {
        const record = this.activeRecord(wrapper);
        if (!record || !this.model.isDndEnabled) return undefined;
        return this.model.canDropRow(record.index) ? record.index : undefined;
    }

    /** Tear down whatever the wrapper held, for a kind change only — never on eviction. */
    private releaseCell(record: CellRecord): void {
        record.slotCleanup?.();
        record.slotCleanup = undefined;
        if (record.view) {
            this.rowViews.delete(record.view);
            record.view.dispose();
            record.view = undefined;
        }
    }

    // -----------------------------------------------------------------------
    // Active row
    // -----------------------------------------------------------------------

    /**
     * The engine queues the request itself when it has no usable size yet and flushes it on its
     * first real measurement, which is what the React version's `setTimeout(0)` was approximating
     * without being able to test the actual condition.
     *
     * `afterPaint` is set when the row set changed in the same update: `scrollTop` clamps to the
     * scrollable extent, and the extent is written inside the *next* paint, so scrolling now would
     * clamp against the old one. When nothing about the rows changed, scroll immediately — one frame
     * matters to keyboard navigation.
     */
    private syncActiveScroll(activeIndex: number | null | undefined, afterPaint: boolean): void {
        this.lastActiveIndex = activeIndex;
        if (activeIndex == null || activeIndex < 0) return;
        if (afterPaint) this.grid?.model.scrollToRowAfterPaint(activeIndex);
        else void this.grid?.model.scrollToRow(activeIndex);
    }

    // -----------------------------------------------------------------------

    private restProps(props: TreeProps<T>): Record<string, unknown> {
        const {
            /* eslint-disable @typescript-eslint/no-unused-vars */
            name: _name, onModel: _onModel, searchText: _searchText, renderItem: _renderItem,
            keyboardNav: _keyboardNav, focusSelection: _focusSelection,
            multiSelect: _multiSelect, rowHeight: _rowHeight, indentSize: _indentSize,
            growToHeight: _growToHeight, whiteSpaceY: _whiteSpaceY, activeIndex: _activeIndex,
            getTooltip: _getTooltip, loading: _loading, emptyMessage: _emptyMessage,
            getIconElement: _getIconElement, getHideChevron: _getHideChevron,
            renderTrailing: _renderTrailing, onItemContextMenu: _onItemContextMenu,
            items: _items, value: _value, onChange: _onChange,
            onItemDoubleClick: _onItemDoubleClick, isSelected: _isSelected,
            onSelectionChange: _onSelectionChange, onActiveChange: _onActiveChange,
            onContextMenu: _onContextMenu, getContextMenu: _getContextMenu,
            getChildren: _getChildren, defaultExpandedValues: _defaultExpandedValues,
            defaultExpandAll: _defaultExpandAll, onExpandChange: _onExpandChange, id: _id,
            getHasChildren: _getHasChildren, loadChildren: _loadChildren,
            onLoadError: _onLoadError, getAncestorValues: _getAncestorValues,
            canCollapse: _canCollapse, traitTypeId: _traitTypeId, getDragData: _getDragData,
            acceptsDrop: _acceptsDrop, canTraitDrop: _canTraitDrop, onTraitDrop: _onTraitDrop,
            expandOnDragHoverDelay: _expandOnDragHoverDelay, acceptsFileDrop: _acceptsFileDrop,
            onDragStartOverride: _onDragStartOverride,
            collapseDescendants: _collapseDescendants,
            /* eslint-enable @typescript-eslint/no-unused-vars */
            ...rest
        } = props;
        return rest as Record<string, unknown>;
    }
}

/** React adds `px` to a bare number in a style value; a DOM prop typed as a string cannot. */
function cssLength(value: React.CSSProperties["height"]): string | undefined {
    if (value === undefined || value === null) return undefined;
    return typeof value === "number" ? `${value}px` : String(value);
}

function setOrRemove(root: HTMLElement, attribute: string, value: string | undefined): void {
    if (value === undefined) root.removeAttribute(attribute);
    else root.setAttribute(attribute, value);
}

function toggle(root: HTMLElement, attribute: string, on: boolean): void {
    if (on) root.setAttribute(attribute, "");
    else root.removeAttribute(attribute);
}
