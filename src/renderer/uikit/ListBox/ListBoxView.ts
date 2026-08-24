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
import { ListItemView } from "./ListItemView";
import { SectionItemView } from "./SectionItemView";
import { defaultListBoxState, ListBoxModel } from "./ListBoxModel";
import type { IListBoxItem, ListBoxProps } from "./types";
import "./ListBox.css";

type Arm = "loading" | "empty" | "real";
type CellKind = "item" | "section" | "custom";

/**
 * Per-wrapper state for a pooled cell.
 *
 * The pool deliberately does **not** reset a released element — its children, classes, attributes
 * and listeners all survive — so this map is how a recycled wrapper is recognised on its way back
 * in. Do not "helpfully" clear elements in `CellPool.release()`: this view depends on the opposite.
 *
 * `index` is rewritten on every render and read by the listeners installed once at creation, which
 * is why the row index never has to appear as a `data-*` attribute (the React DOM has none either).
 */
interface CellRecord {
    kind: CellKind;
    index: number;
    view?: ListItemView | SectionItemView;
    slotCleanup?: () => void;
}

const columnWidth: ElementLength = (() => "100%" as Percent) as ElementLength;
const defaultRowHeight = 24;

/**
 * The list shell.
 *
 * Three things in here are worth knowing before editing:
 *
 * - **`renderCell` is a bound field, not a closure.** `VirtualGridModel.inputChanged()` compares it
 *   by identity, so a per-update closure would make the engine repaint every visible cell on every
 *   update — which is exactly what the React version did, and what the repaint gate exists to stop.
 * - **The three arms are three DOM states of one stable root.** React returned three different
 *   trees; here `applyArm()` owns every attribute that differs between them, including the removals.
 * - **The engine is created on entry to the real arm and disposed on leaving it**, which is what
 *   React did too. Keeping it alive behind `display: none` would be cheaper but would hand a stale
 *   scroll offset to a dataset that was replaced while the list was showing a spinner.
 */
export class ListBoxView<T = IListBoxItem> extends VanillaView<ListBoxProps<T>> {
    private readonly driver: ComponentModelDriver<
        typeof defaultListBoxState,
        ListBoxProps<T>,
        ListBoxModel<T>
    >;

    private readonly restPropsState: RestPropsState = createRestPropsState();
    private readonly repaintGate: DepsGate = createDepsGate();
    /** Every row view ever created, so disposal can reach the ones the pool still holds. */
    private readonly rowViews = new Set<ListItemView | SectionItemView>();
    private readonly cells = new WeakMap<HTMLElement, CellRecord>();

    private arm: Arm | undefined;
    private grid: VirtualGridView | null = null;
    private gridHost: HTMLDivElement | undefined;
    private messageHost: HTMLDivElement | undefined;
    private spinner: SpinnerView | undefined;
    private lastActiveIndex: number | null | undefined = undefined;
    private lastEmptyMessage: ListBoxProps<T>["emptyMessage"] | undefined = undefined;
    /**
     * Set before anything else is torn down, so a cell listener that fires during disposal — the
     * pooled wrappers keep their listeners by design — cannot reach a half-disposed model.
     */
    private inert = false;

    public constructor(props: ListBoxProps<T>) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "list-box";

        this.driver = createComponentModelDriver(
            props,
            ListBoxModel as unknown as ListBoxModel<T>,
            defaultListBoxState,
        );
        this.model.setElementId(nextElementId("lb"));

        // Registration order is load-bearing: disposal runs these FIFO, and the grid and the row
        // views must go before the driver, whose `onUnmount` reports `onModel(null)` to the host.
        this.own(() => { this.inert = true; });
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
    public get model(): ListBoxModel<T> {
        return this.driver.model;
    }

    protected onMount(): void {
        this.messageHost = document.createElement("div");
        this.messageHost.dataset.part = "message";

        this.gridHost = document.createElement("div");
        this.gridHost.dataset.part = "grid";
        this.gridHost.style.display = "contents";

        // Both listeners are permanent. `contextmenu` is on all three React arms; `keydown` is on
        // the real arm only, but it is gated below and a listener is not in a DOM snapshot.
        this.listen(this.root, "contextmenu", (event) => this.model.onRootContextMenu(event));
        this.listen(this.root, "keydown", (event) => {
            if (this.arm !== "real") return;
            this.model.onKeyDown(event);
        });

        this.applyArm(this.props);

        // After the grid exists: `init()` reports `onModel(this.model)`, and a consumer may call
        // `model.scrollToIndex()` synchronously from that callback.
        this.driver.mount();

        this.syncActiveScroll(this.props.activeIndex, false);
        this.repaintGate.prime(this.model.repaintSignature());
    }

    protected onUpdate(props: ListBoxProps<T>): void {
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

    // -----------------------------------------------------------------------
    // Arms
    // -----------------------------------------------------------------------

    private armFor(props: ListBoxProps<T>): Arm {
        if (props.loading) return "loading";
        return this.model.resolved.value.resolved.length === 0 ? "empty" : "real";
    }

    /**
     * Bring the DOM to the arm `props` implies, then write every root attribute.
     *
     * Every per-arm attribute is written in both directions. React expressed the arms as three
     * different elements, so an attribute it simply omitted in one arm has to be *removed* here —
     * and `root.tabIndex = -1` is not the same as no `tabindex` at all.
     */
    private applyArm(props: ListBoxProps<T>): void {
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
        setOrRemove(root, "id", this.model.rootId);
        setOrRemove(root, "data-name", props.name);
        toggle(root, "data-loading", arm === "loading");
        toggle(root, "data-empty", arm === "empty");

        if (arm === "real") {
            const resolvedCount = this.model.resolved.value.resolved.length;
            const activeIndex = props.activeIndex;
            const activeId =
                activeIndex != null && activeIndex >= 0 && activeIndex < resolvedCount
                    ? this.model.itemId(activeIndex)
                    : undefined;
            const focusAware = (props.keyboardNav ?? false) || props.selectionStyle === "focus";

            root.setAttribute("role", "listbox");
            root.tabIndex = focusAware ? 0 : -1;
            toggle(root, "data-focus-selection", props.selectionStyle === "focus");
            setOrRemove(root, "aria-activedescendant", activeId);
        } else {
            root.removeAttribute("role");
            root.removeAttribute("tabindex");
            root.removeAttribute("data-focus-selection");
            root.removeAttribute("aria-activedescendant");
        }

        // Residual props last, matching the JSX spread order: a caller-supplied role, tabIndex or
        // aria-* wins over the arm's own value.
        applyRestProps(root, this.restProps(props), this.restPropsState);
    }

    private enterRealArm(props: ListBoxProps<T>): void {
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

    private fillMessage(arm: Arm, props: ListBoxProps<T>): void {
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
        fillSlot(messageHost, props.emptyMessage ?? "no rows");
    }

    private gridProps(props: ListBoxProps<T>) {
        return {
            // A thunk, so a pure row-count change is detected by the engine's own `inputChanged()`
            // and needs no slot in the repaint signature.
            rowCount: () => this.model.resolved.value.resolved.length,
            columnCount: 1,
            columnWidth,
            rowHeight: props.rowHeight ?? defaultRowHeight,
            renderCell: this.renderCell,
            overscanRow: 2,
            fitToWidth: true,
            // `ListBoxProps.growToHeight` is a CSS height, so it may be a bare number — and two
            // real call sites pass one (`UrlSuggestionsDropdown` 400, `Select`
            // maxVisibleItems * rowHeight). The engine's prop is a string, and React would have
            // added the unit itself.
            growToHeight: cssLength(props.growToHeight),
            whiteSpaceY: props.whiteSpaceY,
        };
    }

    // -----------------------------------------------------------------------
    // Cells
    // -----------------------------------------------------------------------

    private renderCell: RenderCellFunc = (p: RenderCellParams) => {
        const { resolved, sources } = this.model.resolved.value;
        const item = resolved[p.row];
        if (!item) return undefined;

        let wrapper = p.previous ?? p.recycle?.();
        let record = wrapper ? this.cells.get(wrapper) : undefined;
        if (!wrapper || !record) {
            wrapper = document.createElement("div");
            record = { kind: "item", index: p.row };
            this.cells.set(wrapper, record);
            this.installCellListeners(wrapper);
            // A fresh record claims "item" but owns nothing yet, so force the install below.
            record.kind = "item";
            record.view = undefined;
        }
        record.index = p.row;
        applyCellStyle(wrapper, p.style, p.row, p.col, p.renderInfo.input.columnCount);

        const id = this.model.itemId(p.row);
        const kind: CellKind = item.section
            ? "section"
            : this.props.renderItem
                ? "custom"
                : "item";

        if (record.kind !== kind || (kind !== "custom" && !record.view)) {
            this.releaseCell(record);
            record.kind = kind;
            if (kind === "section") {
                const view = new SectionItemView({ id, label: item.label });
                view.mount();
                this.rowViews.add(view);
                record.view = view;
                record.slotCleanup = fillSlot(wrapper, view.root);
            } else if (kind === "item") {
                const view = new ListItemView(this.itemProps(item, id, p.row, sources));
                view.mount();
                this.rowViews.add(view);
                record.view = view;
                record.slotCleanup = fillSlot(wrapper, view.root);
            }
        } else if (kind === "section") {
            record.view?.update({ id, label: item.label } as never);
        } else if (kind === "item") {
            record.view?.update(this.itemProps(item, id, p.row, sources) as never);
        }

        if (kind === "custom") {
            const node = this.props.renderItem?.({
                item,
                source: sources[p.row],
                index: p.row,
                selected: this.model.isSelectedAt(p.row),
                active: p.row === this.props.activeIndex,
                id,
            });
            // Keyed by cell coordinate, exactly as React's `<div key={key}>` was: a scroll must
            // unmount the outgoing row's subtree rather than let its state bleed into the incoming
            // one. The array is what makes the key meaningful — a lone child is not keyed.
            record.slotCleanup = fillSlot(wrapper, [
                React.createElement(React.Fragment, { key: p.key }, node),
            ]);
        }

        return wrapper;
    };

    private itemProps(
        item: IListBoxItem,
        id: string,
        index: number,
        sources: T[],
    ) {
        return {
            id,
            icon: item.icon,
            iconElement: item.iconElement,
            rowClass: item.rowClass,
            label: item.label,
            trailing: item.trailing,
            trailingElement: item.trailingElement,
            drag: item.drag,
            searchText: this.props.searchText,
            selected: this.model.isSelectedAt(index),
            active: index === this.props.activeIndex,
            disabled: item.disabled,
            tooltip: this.props.getTooltip?.(sources[index], index),
            variant: this.props.variant,
            selectionStyle: this.props.selectionStyle,
            checkbox: this.props.checkbox,
        };
    }

    /**
     * Installed once per wrapper, never per render — a released element keeps its listeners, so
     * re-adding them on recycle would stack an unbounded set on every pooled cell.
     */
    private installCellListeners(wrapper: HTMLElement): void {
        wrapper.addEventListener("click", () => {
            const record = this.activeRecord(wrapper);
            if (record) this.model.onItemClick(record.index);
        });
        wrapper.addEventListener("mouseenter", () => {
            const record = this.activeRecord(wrapper);
            if (record) this.model.onItemMouseEnter(record.index);
        });
        wrapper.addEventListener("contextmenu", (event) => {
            const record = this.activeRecord(wrapper);
            if (record) this.model.onItemContextMenu(event, record.index);
        });
    }

    private activeRecord(wrapper: HTMLElement): CellRecord | undefined {
        if (this.inert || this.arm !== "real") return undefined;
        return this.cells.get(wrapper);
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
     * One unconditional call. The engine queues the request itself when it has no usable size yet
     * and flushes it on its first real measurement, which is what the React version's
     * `setTimeout(0)` was approximating without being able to test the actual condition.
     *
     * `afterPaint` is set when the item set changed in the same update. `scrollTop` clamps to the
     * scrollable extent, and the extent is written inside the *next* paint — so a list that grew
     * and moved `activeIndex` past the old extent in one update would otherwise scroll short, with
     * nothing re-issuing it. Mount is already safe (the grid is unmeasured, so the engine's pending
     * slot catches it); a live update was not. When the rows did not change, scroll immediately —
     * one frame is visible in keyboard navigation.
     */
    private syncActiveScroll(activeIndex: number | null | undefined, afterPaint: boolean): void {
        this.lastActiveIndex = activeIndex;
        if (activeIndex == null || activeIndex < 0) return;
        if (afterPaint) this.grid?.model.scrollToRowAfterPaint(activeIndex);
        else void this.grid?.model.scrollToRow(activeIndex);
    }

    // -----------------------------------------------------------------------

    private restProps(props: ListBoxProps<T>): Record<string, unknown> {
        const {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            name: _name, onModel: _onModel, loading: _loading, emptyMessage: _emptyMessage,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            searchText: _searchText, renderItem: _renderItem, keyboardNav: _keyboardNav,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            rowHeight: _rowHeight, growToHeight: _growToHeight, whiteSpaceY: _whiteSpaceY,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            activeIndex: _activeIndex, getTooltip: _getTooltip, variant: _variant,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            selectionStyle: _selectionStyle, items: _items, value: _value, onChange: _onChange,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            isSelected: _isSelected, onActiveChange: _onActiveChange,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onContextMenu: _onContextMenu, getContextMenu: _getContextMenu, id: _id,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            checkbox: _checkbox,
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
