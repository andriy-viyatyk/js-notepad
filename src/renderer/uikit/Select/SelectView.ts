import React from "react";
import { createComponentModelDriver, type ComponentModelDriver } from "../../core/state/model";
import { nextElementId } from "../shared/element-id";
import {
    applyRestProps,
    bindRef,
    clearRestListeners,
    createRestPropsState,
    type RestPropsState,
} from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import { IconButtonView } from "../IconButton/IconButtonView";
import { InputView } from "../Input/InputView";
import { ListBoxView } from "../ListBox/ListBoxView";
import { PopoverView, type PopoverViewProps } from "../Popover/PopoverView";
import type { IListBoxItem, ListBoxProps } from "../ListBox/types";
import type { IconButtonProps } from "../IconButton/IconButton";
import type { InputProps } from "../Input/Input";
import { defaultSelectState, SelectModel, type SelectProps } from "./SelectModel";
import "./Select.css";

export type SelectViewProps<T = IListBoxItem> = SelectProps<T> & {
    ref?: React.Ref<HTMLInputElement>;
};

/**
 * The single-select dropdown: an `Input` with a chevron button, and a `Popover` hosting a `ListBox`.
 *
 * Five things in here are load-bearing:
 *
 * - **Zero React roots, open or closed.** The dropdown uses `PopoverView`'s `contentView` seam, so
 *   the floating root's children are native DOM, and the chevron's icon is passed as an `IconName`
 *   *string* rather than a React node. The latter is a change in kind: the React implementation
 *   passed `renderIcon("chevron-down")`, so every `Select` on screen carried a retained React root
 *   inside its chevron even while closed.
 * - **The popover is not an update channel.** `PopoverFloatingView.onUpdate` forwards nothing to its
 *   content view, so this view pushes the `ListBox`'s props itself, from `syncChildren()`. Do not
 *   copy `MenuContentView`'s "props are the model" shape: `Select`'s list output depends on
 *   `props.items`, `emptyMessage`, `rowHeight`, `maxVisibleItems`, `filter` and `filterMode`, every
 *   one of which can move with no state write at all.
 * - **The `ListBoxView` is owned by the floating branch, not by this view.** The `contentView`
 *   factory hands it to `PopoverFloatingView`, which claims it with `child()`; a second claim would
 *   throw on the shared ownership marker. This view keeps a bare reference so it can push props, and
 *   never disposes it.
 * - **State is read with one compound `bind` feeding one `syncChildren()`.** Six of the nine state
 *   fields are literally child props, which is the case Rule 9 sends to `bind()`. The three that are
 *   not (`loadedSources`, `itemsLoaded`, `itemsError`) render nothing; the first two are also written
 *   in the same update as `loadedItems` at every site, so neither can move alone.
 * - **`applyRoot` stays off the state path.** It runs `applyRestProps`, which removes and re-adds
 *   every `on*` listener per call, and rest props cannot have changed on a state write. The one
 *   exception is `data-state`, which is state-derived and therefore lives in `syncChildren()` — do
 *   not tidy it back into `applyRoot`.
 *
 * Deliberately absent: a `DepsGate` (the inputs that matter here are all reactive state, and Rule 9
 * forbids state in a signature — the gate would never run on the path that moves them), and any
 * per-field guard. The children's own gates absorb the duplicate pushes.
 */
export class SelectView<T = IListBoxItem> extends VanillaView<SelectViewProps<T>> {
    private readonly driver: ComponentModelDriver<
        typeof defaultSelectState,
        SelectProps<T>,
        SelectModel<T>
    >;

    private readonly restPropsState: RestPropsState = createRestPropsState();

    private input: InputView | undefined;
    private chevron: IconButtonView | undefined;
    private popover: PopoverView | undefined;

    /**
     * The list inside the open dropdown, or undefined while closed. Owned by the floating branch —
     * created by the `contentView` factory on open and disposed with the branch on close.
     */
    private listView: ListBoxView<IListBoxItem> | undefined;

    private inputElement: HTMLInputElement | null = null;
    private appliedCallerRef: React.Ref<HTMLInputElement> | undefined;
    private callerRefCleanup: (() => void) | undefined;

    public constructor(props: SelectViewProps<T>) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "select";

        this.driver = createComponentModelDriver(
            this.modelProps(props),
            SelectModel as unknown as SelectModel<T>,
            defaultSelectState,
        );
        this.model.setElementId(nextElementId("select"));

        // Registration order is load-bearing: disposal runs children first, then these FIFO, so both
        // composed views are already inert when the driver reports its unmount.
        this.own(() => this.driver.dispose());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
        this.own(() => this.callerRefCleanup?.());
    }

    /** The live model, for the story and for tests. */
    public get model(): SelectModel<T> {
        return this.driver.model;
    }

    protected onMount(): void {
        // Built before the input, because its root is the input's `endSlot`. `IconButtonView.mount`
        // installs listeners and a tooltip attachment; it measures nothing, so mounting it while
        // detached is safe.
        this.chevron = this.child(new IconButtonView(this.chevronProps()));
        this.chevron.mount();
        this.listen(this.chevron.root, "mousedown", this.handleChevronMouseDown);

        this.input = this.child(new InputView(this.inputProps()));
        this.root.append(this.input.root);
        this.input.mount();
        if (this.inputElement) {
            this.listen(this.inputElement, "keydown", this.handleInputKeyDown);
        }

        // `PopoverView`'s own root is `display: contents`; the floating branch lives in the overlay
        // layer, so this append contributes no box.
        this.popover = this.child(new PopoverView(this.popoverProps()));
        this.root.append(this.popover.root);
        this.popover.mount();

        this.applyRoot(this.props);
        this.driver.mount();

        // Applies once immediately, which seeds the first sync; then fires on every state write.
        this.bind(
            this.model.state,
            (state) => ({
                open: state.open,
                searchText: state.searchText,
                activeIndex: state.activeIndex,
                popoverResized: state.popoverResized,
                loadedItems: state.loadedItems,
                itemsLoading: state.itemsLoading,
            }),
            () => this.syncChildren(),
        );
    }

    protected onUpdate(props: SelectViewProps<T>): void {
        this.driver.update(this.modelProps(props));
        this.applyRoot(props);
        this.syncCallerRef(false);
        this.syncChildren();
    }

    // -----------------------------------------------------------------------
    // Root
    // -----------------------------------------------------------------------

    /**
     * Root attributes, inline size and rest props. Called from `onUpdate` only — never from the
     * state path. `data-state` is the one root attribute that is state-derived, and it is written by
     * `syncChildren()` instead.
     */
    private applyRoot(props: SelectViewProps<T>): void {
        const root = this.root;
        setOrRemove(root, "data-name", props.name);
        root.setAttribute("data-id", this.model.selectId);
        toggle(root, "data-disabled", !!props.disabled);
        toggle(root, "data-readonly", !!props.readOnly);

        // React passed no `style` at all when all three were undefined, leaving `Select.css`'s
        // `width: 100%` in charge; an empty string reproduces that exactly.
        root.style.width = props.width === undefined ? "" : cssLength(props.width);
        root.style.minWidth = props.minWidth === undefined ? "" : cssLength(props.minWidth);
        root.style.maxWidth = props.maxWidth === undefined ? "" : cssLength(props.maxWidth);

        applyRestProps(root, this.restProps(props), this.restPropsState);
    }

    // -----------------------------------------------------------------------
    // Children
    // -----------------------------------------------------------------------

    /** The single consequence of both the prop pump and a state write. */
    private syncChildren(): void {
        const input = this.input;
        const chevron = this.chevron;
        const popover = this.popover;
        if (!input || !chevron || !popover) return;

        const open = this.model.state.get().open;
        this.root.dataset.state = open ? "open" : "closed";

        chevron.update(this.chevronProps());
        input.update(this.inputProps());
        popover.update(this.popoverProps());

        if (open) {
            this.listView?.update(this.listProps());
        } else {
            // Hygiene rather than correctness: the branch has just been torn down by the popover
            // update above, and `VanillaView.update()` early-returns on a disposed view anyway. The
            // reference must not survive into a re-open, and the factory reassigns it there.
            this.listView = undefined;
        }
    }

    private inputProps(): InputProps {
        const props = this.props;
        return {
            ref: this.setInputElement,
            size: props.size ?? "md",
            value: this.model.displayText.value,
            onChange: this.model.onInputChange,
            placeholder: props.placeholder,
            disabled: props.disabled,
            readOnly: props.readOnly,
            onFocus: this.model.onInputFocus,
            onClick: this.model.onInputClick,
            "aria-haspopup": "listbox",
            "aria-expanded": this.model.state.get().open,
            "aria-controls": this.model.listboxId,
            "aria-label": props["aria-label"],
            "aria-labelledby": props["aria-labelledby"],
            endSlot: this.chevron.root,
        };
    }

    /**
     * The icon is an `IconName` string, which takes `IconButtonView.updateIcon`'s DOM branch —
     * `createIconElement`, no React root. `chevron-up` and `chevron-down` are distinct registry
     * glyphs; do not substitute a CSS rotation, which would make the DOM incomparable to the React
     * implementation an agent may be querying.
     */
    private chevronProps(): IconButtonProps {
        const props = this.props;
        return {
            icon: this.model.state.get().open ? "chevron-up" : "chevron-down",
            size: "sm",
            tabIndex: -1,
            disabled: props.disabled || props.readOnly,
            onClick: this.model.onChevronClick,
        };
    }

    /**
     * Exactly the props `PopoverView` names — never this component's rest props, which would land on
     * the floating root and be reinstalled on every keystroke.
     *
     * The `position()` round trip this triggers per keystroke is deliberately unguarded: `autoUpdate`
     * already calls it on every scroll and resize frame, so it is designed for that frequency, and a
     * parent-side "did the popover props change?" guard is the hazard Rule 9 bans.
     */
    private popoverProps(): PopoverViewProps {
        const props = this.props;
        return {
            open: this.model.state.get().open,
            onClose: this.model.onPopoverClose,
            elementRef: this.root,
            placement: "bottom-start",
            offset: [0, 2],
            matchAnchorWidth: true,
            resizable: props.resizable,
            onResize: this.model.onPopoverResize,
            outsideClickIgnoreSelector:
                `[data-type="select"][data-id="${this.model.selectId}"]`,
            contentView: (host) => {
                // `ListBoxView`'s constructor builds its own detached root and
                // `PopoverFloatingView.onMount` never appends what the factory returns — it only
                // claims and mounts it. Omit this append and the dropdown renders empty.
                const list = new ListBoxView<IListBoxItem>(this.listProps());
                host.append(list.root);
                this.listView = list;
                return list;
            },
        };
    }

    private listProps(): ListBoxProps<IListBoxItem> {
        const props = this.props;
        const { activeIndex, popoverResized, itemsLoading } = this.model.state.get();
        const { filteredItems } = this.model.filtered.value;
        return {
            id: this.model.listboxId,
            items: filteredItems,
            value: this.model.selectedResolved.value ?? null,
            activeIndex,
            onActiveChange: this.model.onActiveIndexChange,
            onChange: this.model.onListChange,
            searchText: this.model.state.get().searchText,
            rowHeight: this.model.rowHeight,
            growToHeight: popoverResized
                ? undefined
                : this.model.maxVisibleItems * this.model.rowHeight,
            loading: itemsLoading,
            emptyMessage: props.emptyMessage ?? "no results",
        };
    }

    // -----------------------------------------------------------------------
    // The forwarded ref
    // -----------------------------------------------------------------------

    /**
     * One identity for this view's whole life, so `InputView` binds it exactly once. A per-update
     * merged closure — the literal translation of the React `useCallback` — would make
     * `InputView.updateRef`'s identity gate fire on every keystroke, and its `clearRef` calls
     * `ref(null)`, so `model.inputRef` would go transiently null each time the user typed.
     */
    private readonly setInputElement = (el: HTMLInputElement | null): void => {
        this.inputElement = el;
        this.model.setInputRef(el);
        this.syncCallerRef(true);
    };

    /**
     * The caller's ref needs the opposite cadence: re-bound whenever its identity moves, so the
     * previous ref is released (its own cleanup, or `ref(null)`) before the next one receives the
     * element. A purely stable callback reading `this.props.ref` live would never hand the element to
     * a replacement ref. The former React grid's cell editor passed a fresh arrow per render, which is exactly what
     * the React `useCallback([model, ref])` re-bound too.
     */
    private syncCallerRef(force: boolean): void {
        const ref = this.props.ref;
        if (!force && ref === this.appliedCallerRef) return;
        this.callerRefCleanup?.();
        this.appliedCallerRef = ref;
        this.callerRefCleanup = bindRef(this.inputElement, ref);
    }

    // -----------------------------------------------------------------------
    // Native event unwrapping
    // -----------------------------------------------------------------------

    /** Native listeners attached to the child Input and chevron roots after they mount. */

    private readonly handleInputKeyDown = (event: KeyboardEvent): void => {
        this.model.onInputKeyDown(event);
    };

    private readonly handleChevronMouseDown = (event: MouseEvent): void => {
        this.model.onChevronMouseDown(event);
    };

    // -----------------------------------------------------------------------

    private modelProps(props: SelectViewProps<T>): SelectProps<T> {
        const { ref: _ref, ...modelProps } = props;
        return modelProps as SelectProps<T>;
    }

    private restProps(props: SelectViewProps<T>): Record<string, unknown> {
        const {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ref: _ref, name: _name, items: _items, value: _value, onChange: _onChange,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onItemsLoadError: _onItemsLoadError, placeholder: _placeholder,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            disabled: _disabled, readOnly: _readOnly, size: _size,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            filterMode: _filterMode, filter: _filter, emptyMessage: _emptyMessage,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onEscape: _onEscape, maxVisibleItems: _maxVisibleItems, rowHeight: _rowHeight,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            resizable: _resizable, width: _width, minWidth: _minWidth, maxWidth: _maxWidth,
            ...rest
        } = props;
        return rest as Record<string, unknown>;
    }
}

/** React adds `px` to a bare number in a style value; a DOM write cannot. */
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
