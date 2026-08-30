import { createComponentModelDriver, type ComponentModelDriver } from "../../core/state/model";
import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type NativeHTMLAttributes,
    type RestPropsState,
} from "../shared/dom-props";
import { createIconElement } from "../shared/slots";
import { VanillaView } from "../shared/vanilla-view";
import { InputView } from "../Input/InputView";
import { ListBoxView } from "../ListBox/ListBoxView";
import type { IListBoxItem, ListBoxProps } from "../ListBox/types";
import type { InputProps } from "../Input/InputView";
import type { Traited } from "../../core/traits/traits";
import type { SlotText } from "../shared/slots";
import { defaultMultiListBoxState, MultiListBoxModel } from "./MultiListBoxModel";
import "./MultiListBox.css";

// =============================================================================
// Types
// =============================================================================

export interface MultiListBoxProps<T = IListBoxItem>
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances in DOM inspector output. Never used for styling. */
    name?: string;
    /** Items to display. Plain `T[]` when `T = IListBoxItem`, or `Traited<unknown[]>` to drive a
     *  custom source shape (Rule 3). */
    items: T[] | Traited<unknown[]>;
    /** Currently-selected source items. Empty array when nothing is selected. */
    value: T[];
    /** Called whenever the selection changes -- caller replaces its `value` with the array. */
    onChange: (value: T[]) => void;
    /** Disabled state -- rows do not respond to clicks and the search input is read-only. */
    disabled?: boolean;
    /** Read-only state -- rows do not respond to clicks. The search box stays enabled. */
    readOnly?: boolean;
    /** Show the built-in search input above the list. Default: true. */
    showSearch?: boolean;
    /** Search filter mode. Default: "contains". `"off"` disables filtering entirely. */
    filterMode?: "contains" | "startsWith" | "off";
    /** Placeholder shown inside the built-in search input. Default: "Search...". */
    searchPlaceholder?: string;
    /** Show a tri-state "Select all" row at the top of the list. Default: false. */
    selectAll?: boolean;
    /** Label rendered next to the select-all checkbox. Default: "Select all". */
    selectAllLabel?: string;
    /** Pixel height of each list row. Forwarded to the inner ListBox. Default: 24. */
    rowHeight?: number;
    /**
     * Maximum number of visible list rows before the inner list scrolls. Default: 10.
     * Only consulted when no `height` is set.
     */
    maxVisibleItems?: number;
    /** Renders inside the list area when no rows match the filter. Default: "no rows". */
    emptyMessage?: SlotText;
    /** Fixed width — number becomes px; a string passes through. Default: fills parent (100%). */
    width?: number | string;
    /**
     * Fixed height — number becomes px; a string passes through. When unset, the inner list grows up
     * to `maxVisibleItems x rowHeight` plus the search row and select-all row chrome.
     */
    height?: number | string;
}

type CheckState = "true" | "mixed" | "false";

const defaultRowHeight = 24;
const defaultMaxVisibleItems = 10;

/**
 * The multi-select list shell: a search box, an optional tri-state select-all header, and a
 * `ListBox` whose rows carry a leading checkbox.
 *
 * Four things in here are load-bearing:
 *
 * - **No row renderer.** The rows are ordinary `ListItem`s with `checkbox: true` (EPIC-056 US-1016),
 *   which is what discharges US-1014's obligation: no consumer of `ListBox`'s `renderItem` hatch
 *   remains inside `uikit/`, so a settled scroll here creates no new slot subtrees.
 * - **State is read with one compound `bind`, not a `mutate`/`onStateApplied` funnel.** Both of this
 *   model's state fields (`searchText`, `activeIndex`) *are* child props, which is the case Rule 9
 *   sends to `bind()`. `Tree`'s funnel exists for internal state whose consequence is a render pass
 *   the children cannot express; nothing here is that.
 * - **Both paths call one `syncChildren()`.** The tri-state header derives from `filtered` (which
 *   depends on `searchText`) *and* from `props.value`, so narrowing the filter can flip the header
 *   with no prop change at all. A `bind` that refreshed only the input and the list would reproduce
 *   the masked defect this task exists to remove.
 * - **`applyRestProps` stays off the state path.** It removes and re-adds every `on*` listener per
 *   call, and rest props cannot have changed on a state write, so the root is written from
 *   `onUpdate` only.
 *
 * Deliberately absent: per-field guards (`lastSearchText`, `lastActiveIndex`). A guard maintained on
 * one of the two paths either re-pushes forever or skips a needed push; the children's own gates
 * (`InputView`'s value compare, `ListBoxView`'s `DepsGate` and `lastActiveIndex`) absorb the
 * duplicate for free.
 */
export class MultiListBoxView<T = IListBoxItem> extends VanillaView<MultiListBoxProps<T>> {
    private readonly driver: ComponentModelDriver<
        typeof defaultMultiListBoxState,
        MultiListBoxProps<T>,
        MultiListBoxModel<T>
    >;

    private readonly restPropsState: RestPropsState = createRestPropsState();

    private searchRow: HTMLDivElement | undefined;
    private selectAllRow: HTMLDivElement | undefined;
    private selectAllIconHost: HTMLSpanElement | undefined;
    private selectAllLabelHost: HTMLSpanElement | undefined;
    private listWrapper: HTMLDivElement | undefined;

    private input: InputView | undefined;
    private list: ListBoxView<T> | undefined;

    private selectAllGlyph: SVGElement | undefined;
    private appliedCheckState: CheckState | undefined;
    private appliedSelectAllLabel: string | undefined;

    public constructor(props: MultiListBoxProps<T>) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "multilistbox";

        this.driver = createComponentModelDriver(
            props,
            MultiListBoxModel as unknown as MultiListBoxModel<T>,
            defaultMultiListBoxState,
        );

        // Registration order matters: disposal runs children first, then these FIFO, so both child
        // views are already inert when the driver reports its unmount.
        this.own(() => this.driver.dispose());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    /** The live model, for the story and for tests. */
    public get model(): MultiListBoxModel<T> {
        return this.driver.model;
    }

    public setItems(items: MultiListBoxProps<T>["items"]): void {
        this.applyTargeted({ items });
    }

    public setValue(value: MultiListBoxProps<T>["value"]): void {
        this.applyTargeted({ value });
    }

    public setOnChange(onChange: MultiListBoxProps<T>["onChange"]): void {
        this.applyTargeted({ onChange });
    }

    public setDisabled(disabled: MultiListBoxProps<T>["disabled"]): void {
        this.applyTargeted({ disabled });
    }

    public setReadOnly(readOnly: MultiListBoxProps<T>["readOnly"]): void {
        this.applyTargeted({ readOnly });
    }

    public setSearchSettings(
        showSearch: MultiListBoxProps<T>["showSearch"],
        filterMode: MultiListBoxProps<T>["filterMode"],
        searchPlaceholder: MultiListBoxProps<T>["searchPlaceholder"],
    ): void {
        this.applyTargeted({ showSearch, filterMode, searchPlaceholder });
    }

    public setSelectAll(
        selectAll: MultiListBoxProps<T>["selectAll"],
        selectAllLabel: MultiListBoxProps<T>["selectAllLabel"],
    ): void {
        this.applyTargeted({ selectAll, selectAllLabel });
    }

    public setEmptyMessage(emptyMessage: MultiListBoxProps<T>["emptyMessage"]): void {
        this.applyTargeted({ emptyMessage });
    }

    public setLayout(layout: Pick<MultiListBoxProps<T>, "rowHeight" | "maxVisibleItems" | "height">): void {
        this.applyTargeted(layout, true);
    }

    protected onMount(): void {
        this.searchRow = document.createElement("div");
        this.searchRow.dataset.part = "search";

        this.selectAllRow = document.createElement("div");
        this.selectAllRow.dataset.type = "multilistbox-select-all";
        this.selectAllRow.dataset.part = "select-all";
        this.selectAllRow.setAttribute("role", "checkbox");

        this.selectAllIconHost = document.createElement("span");
        this.selectAllIconHost.dataset.part = "icon";
        this.selectAllLabelHost = document.createElement("span");
        this.selectAllLabelHost.dataset.part = "label";
        this.selectAllRow.append(this.selectAllIconHost, this.selectAllLabelHost);

        this.listWrapper = document.createElement("div");
        this.listWrapper.dataset.part = "list";

        // The list wrapper is always present and always last, so the two conditional rows above it
        // are attached with `insertBefore` and their order needs no bookkeeping.
        this.root.append(this.listWrapper);

        // Both children are created unconditionally and `showSearch` only attaches or detaches the
        // search row: `child()` claims a view for its whole lifetime, so create/dispose on a prop
        // flip would grow the children array. An unattached input costs one detached element.
        this.input = this.child(new InputView(this.inputProps()));
        this.searchRow.append(this.input.root);
        this.input.mount();

        this.list = this.child(new ListBoxView<T>(this.listProps()));
        this.listWrapper.append(this.list.root);
        this.list.mount();

        this.listen(this.selectAllRow, "click", () => this.model.toggleSelectAll());

        this.applyRoot(this.props);
        applyRestProps(this.root, this.restProps(this.props), this.restPropsState);
        this.driver.mount();

        // Applies once immediately, which seeds the first sync; then fires on every state write.
        this.bind(
            this.model.state,
            (state) => ({ searchText: state.searchText, activeIndex: state.activeIndex }),
            () => this.syncChildren(),
        );
    }

    protected onUpdate(props: MultiListBoxProps<T>): void {
        this.driver.update(props);
        this.applyRoot(props);
        this.syncChildren();
    }

    private applyTargeted(
        changes: Partial<MultiListBoxProps<T>>,
        sync = false,
    ): void {
        const props = { ...this.props, ...changes };
        this.props = props;
        this.driver.update(props);
        if (sync) this.syncChildren();
    }

    // -----------------------------------------------------------------------
    // Root
    // -----------------------------------------------------------------------

    /**
     * Root attributes, inline size and rest props. Called from `onUpdate` only — never from the
     * state path.
     */
    private applyRoot(props: MultiListBoxProps<T>): void {
        const root = this.root;
        setOrRemove(root, "data-name", props.name);
        toggle(root, "data-disabled", !!props.disabled);
        toggle(root, "data-readonly", !!props.readOnly);

        // When both width values are undefined, leave the inline width empty, leaving the stylesheet's
        // `width: 100%` in charge; an empty string reproduces that exactly.
        root.style.width = props.width === undefined ? "" : cssLength(props.width);
        root.style.height = props.height === undefined ? "" : cssLength(props.height);

    }

    // -----------------------------------------------------------------------
    // Children
    // -----------------------------------------------------------------------

    /** The single consequence of both the prop pump and a state write. */
    private syncChildren(): void {
        const searchRow = this.searchRow;
        const selectAllRow = this.selectAllRow;
        const listWrapper = this.listWrapper;
        const input = this.input;
        const list = this.list;
        if (!searchRow || !selectAllRow || !listWrapper || !input || !list) return;

        const props = this.props;

        const showSearch = props.showSearch ?? true;
        if (showSearch && !searchRow.isConnected) {
            this.root.insertBefore(searchRow, listWrapper);
        } else if (!showSearch && searchRow.isConnected) {
            searchRow.remove();
        }

        const selectAll = props.selectAll ?? false;
        if (selectAll && !selectAllRow.isConnected) {
            this.root.insertBefore(selectAllRow, listWrapper);
        } else if (!selectAll && selectAllRow.isConnected) {
            selectAllRow.remove();
        }
        if (selectAll) this.syncSelectAll(props);

        input.update(this.inputProps());
        const { searchText, activeIndex } = this.model.state.get();
        const rowHeight = props.rowHeight ?? defaultRowHeight;
        const maxVisibleItems = props.maxVisibleItems ?? defaultMaxVisibleItems;
        list.setItems(this.model.listBoxItems);
        list.setSelection(this.model.isSelected, this.model.selectedKeys);
        list.setSearchText(searchText);
        list.setEmptyMessage(props.emptyMessage ?? "no rows");
        list.setLayout({
            rowHeight,
            growToHeight: props.height === undefined ? `${maxVisibleItems * rowHeight}px` : undefined,
            fitToWidth: true,
            whiteSpaceY: undefined,
        });
        list.setActiveIndex(activeIndex);
    }

    /**
     * The tri-state value is computed once and written to both attributes. The earlier implementation derived it
     * three times from two getters, each of which walks the filtered item list.
     */
    private syncSelectAll(props: MultiListBoxProps<T>): void {
        const selectAllRow = this.selectAllRow;
        const selectAllIconHost = this.selectAllIconHost;
        const selectAllLabelHost = this.selectAllLabelHost;
        if (!selectAllRow || !selectAllIconHost || !selectAllLabelHost) return;

        const model = this.model;
        const checkState: CheckState = model.allVisibleSelected
            ? "true"
            : model.someVisibleSelected
                ? "mixed"
                : "false";

        if (this.appliedCheckState !== checkState) {
            selectAllRow.dataset.checked = checkState;
            selectAllRow.setAttribute("aria-checked", checkState);
            // Direct DOM, never `fillSlot`: an `IconName` is rendered directly as an SVG. Gated on the applied
            // value so a re-sync does not rebuild the `svg`.
            const next = createIconElement(
                checkState === "true" ? "checked" : checkState === "mixed" ? "indeterminate" : "unchecked",
            );
            if (this.selectAllGlyph) selectAllIconHost.replaceChild(next, this.selectAllGlyph);
            else selectAllIconHost.append(next);
            this.selectAllGlyph = next;
            this.appliedCheckState = checkState;
        }

        const label = props.selectAllLabel ?? "Select all";
        if (this.appliedSelectAllLabel !== label) {
            selectAllLabelHost.textContent = label;
            this.appliedSelectAllLabel = label;
        }
    }

    private inputProps(): InputProps {
        const props = this.props;
        const { searchText } = this.model.state.get();
        return {
            name: "multilistbox-search",
            size: "sm",
            value: searchText,
            onChange: this.model.setSearchText,
            placeholder: props.searchPlaceholder ?? "Search...",
            disabled: props.disabled,
            tone: searchText ? "accent" : "default",
        };
    }

    /**
     * Exactly the props `ListBoxView` names — never this component's rest props. `applyRestProps`
     * reinstalls every listener it is given, and this object is pushed on every keystroke.
     *
     * `selectionStyle` is deliberately unset: its default (`"check"`) renders no trailing icon once
     * `checkbox` is true, and none of its selection backgrounds apply to that style.
     */
    private listProps(): ListBoxProps<T> {
        const props = this.props;
        const { searchText, activeIndex } = this.model.state.get();
        const rowHeight = props.rowHeight ?? defaultRowHeight;
        const maxVisibleItems = props.maxVisibleItems ?? defaultMaxVisibleItems;
        return {
            items: this.model.listBoxItems,
            isSelected: this.model.isSelected,
            onChange: this.model.toggle,
            activeIndex,
            onActiveChange: this.model.setActiveIndex,
            searchText,
            checkbox: true,
            variant: "browse",
            keyboardNav: true,
            rowHeight,
            growToHeight: props.height === undefined ? maxVisibleItems * rowHeight : undefined,
            emptyMessage: props.emptyMessage ?? "no rows",
        };
    }

    // -----------------------------------------------------------------------

    private restProps(props: MultiListBoxProps<T>): Record<string, unknown> {
        const {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            name: _name, items: _items, value: _value, onChange: _onChange,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            disabled: _disabled, readOnly: _readOnly, showSearch: _showSearch,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            filterMode: _filterMode, searchPlaceholder: _searchPlaceholder,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            selectAll: _selectAll, selectAllLabel: _selectAllLabel, rowHeight: _rowHeight,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            maxVisibleItems: _maxVisibleItems, emptyMessage: _emptyMessage,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            width: _width, height: _height,
            ...rest
        } = props;
        return rest as Record<string, unknown>;
    }
}

/** A DOM property typed as a string does not add `px` to a bare number; normalize numeric lengths before writing it. */
function cssLength(value: number | string): string {
    return typeof value === "number" ? `${value}px` : value;
}

function setOrRemove(root: HTMLElement, attribute: string, value: string | undefined): void {
    if (value === undefined) root.removeAttribute(attribute);
    else root.setAttribute(attribute, value);
}

function toggle(root: HTMLElement, attribute: string, on: boolean): void {
    if (on) root.setAttribute(attribute, "");
    else root.removeAttribute(attribute);
}
