import { applyRestProps, clearRestListeners, createRestPropsState } from "../shared/dom-props";
import type { RestPropsState } from "../shared/dom-props";
import { createComponentModelDriver, type ComponentModelDriver } from "../../core/state/model";
import { nextElementId } from "../shared/element-id";
import { VanillaView } from "../shared/vanilla-view";
import { IconButtonView } from "../IconButton/IconButtonView";
import { InputView } from "../Input/InputView";
import { MultiListBoxView } from "../MultiListBox/MultiListBoxView";
import { PopoverView, type PopoverViewProps } from "../Popover/PopoverView";
import type { IListBoxItem } from "../ListBox/types";
import type { MultiListBoxProps } from "../MultiListBox/MultiListBox";
import type { IconButtonProps } from "../IconButton/IconButtonView";
import type { InputProps } from "../Input/InputView";
import { defaultMultiSelectState, MultiSelectModel, type MultiSelectProps } from "./MultiSelectModel";
import "./MultiSelect.css";

export type MultiSelectViewProps<T = IListBoxItem> = MultiSelectProps<T>;

/**
 * The multi-select dropdown: a read-only `Input` with a chevron button, and a `Popover` hosting a
 * `MultiListBox`.
 *
 * Structurally this is `SelectView` with a different list and no in-trigger search — read that class
 * first; everything about the `contentView` seam, the ref split and the native-event unwrap is the
 * same shape. Four differences are deliberate and must not be "harmonised" away:
 *
 * - **The trigger is `readOnly` unconditionally**, and it takes no `onChange`. There is no typing in
 *   a `MultiSelect` trigger; the search box lives inside the `MultiListBox`. `props.readOnly`
 *   therefore reaches only the root's `data-readonly` and the list.
 * - **`disabled` and `readOnly` are not equivalent here.** `MultiSelectModel.tryOpen` checks
 *   `disabled` only, so a read-only `MultiSelect` still opens (rows are inspectable, not
 *   toggleable), and the chevron is disabled on `disabled` alone. `Select` refuses both. EPIC-056
 *   C3-5 says preserve, not reconcile.
 * - **`matchAnchorWidth` is a real prop**, defaulted in the view. `Select` hardcodes it.
 * - **The list carries `id = model.popoverId`.** The trigger has always advertised
 *   `aria-controls="…-popover"` and nothing ever carried that id, so the reference dangled in the
 *   previous implementation. C3-5 obliges this task to assert the aria pairing resolves, which a
 *   verbatim port cannot do — see US-1018 D8. This is the task's one intentional DOM delta.
 *
 * `applyRoot` stays off the state path: it runs `applyRestProps`, which removes and re-adds every
 * `on*` listener per call, and rest props cannot have changed on a state write. `data-state` is the
 * one state-derived root attribute and therefore lives in `syncChildren()`.
 */
export class MultiSelectView<T = IListBoxItem> extends VanillaView<MultiSelectViewProps<T>> {
    private readonly driver: ComponentModelDriver<
        typeof defaultMultiSelectState,
        MultiSelectProps<T>,
        MultiSelectModel<T>
    >;

    private readonly restPropsState: RestPropsState = createRestPropsState();

    private input: InputView | undefined;
    private chevron: IconButtonView | undefined;
    private popover: PopoverView | undefined;

    /**
     * The list inside the open dropdown, or undefined while closed. Owned by the floating branch —
     * created by the `contentView` factory on open and disposed with the branch on close.
     */
    private listView: MultiListBoxView<T> | undefined;


    public constructor(props: MultiSelectViewProps<T>) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "multiselect";

        this.driver = createComponentModelDriver(
            this.modelProps(props),
            MultiSelectModel as unknown as MultiSelectModel<T>,
            defaultMultiSelectState,
        );
        this.model.setElementId(nextElementId("multiselect"));

        // Registration order is load-bearing: disposal runs children first, then these FIFO, so both
        // composed views are already inert when the driver reports its unmount.
        this.own(() => this.driver.dispose());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    /** The live model, for the story and for tests. */
    public get model(): MultiSelectModel<T> {
        return this.driver.model;
    }

    protected onMount(): void {
        // Built before the input, because its root is the input's `endSlot`.
        this.chevron = this.child(new IconButtonView(this.chevronProps()));
        this.chevron.mount();
        this.listen(this.chevron.root, "mousedown", this.handleChevronMouseDown);

        this.input = this.child(new InputView(this.inputProps()));
        this.root.append(this.input.root);
        this.input.mount();
        this.model.setInputRef(this.input.inputElement);
        this.listen(this.input.inputElement, "keydown", this.handleInputKeyDown);

        // `PopoverView`'s own root is `display: contents`; the floating branch lives in the overlay
        // layer, so this append contributes no box.
        this.popover = this.child(new PopoverView(this.popoverProps()));
        this.root.append(this.popover.root);
        this.popover.mount();

        this.applyRoot(this.props);
        applyRestProps(this.root, this.restProps(this.props), this.restPropsState);
        this.driver.mount();

        // Applies once immediately, which seeds the first sync; then fires on every state write.
        this.bind(
            this.model.state,
            (state) => ({ open: state.open, popoverResized: state.popoverResized }),
            () => this.syncChildren(),
        );
    }

    protected onUpdate(props: MultiSelectViewProps<T>): void {
        this.driver.update(this.modelProps(props));
        this.applyRoot(props);
        this.syncChildren();
    }

    // -----------------------------------------------------------------------
    // Root
    // -----------------------------------------------------------------------

    private applyRoot(props: MultiSelectViewProps<T>): void {
        const root = this.root;
        setOrRemove(root, "data-name", props.name);
        root.setAttribute("data-id", this.model.multiSelectId);
        toggle(root, "data-disabled", !!props.disabled);
        toggle(root, "data-readonly", !!props.readOnly);

        // When all three width values are undefined, leave the inline width empty, leaving `MultiSelect.css`'s
        // `width: 100%` in charge; an empty string reproduces that exactly.
        root.style.width = props.width === undefined ? "" : cssLength(props.width);
        root.style.minWidth = props.minWidth === undefined ? "" : cssLength(props.minWidth);
        root.style.maxWidth = props.maxWidth === undefined ? "" : cssLength(props.maxWidth);

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
        this.syncPopover(popover);

        if (open) {
            this.syncList();
        } else {
            // Hygiene rather than correctness: the branch has just been torn down by the popover
            // update above. The reference must not survive into a re-open, and the factory
            // reassigns it there.
            this.listView = undefined;
        }
    }

    private syncPopover(popover: PopoverView): void {
        const props = this.props;
        popover.setOpen(this.model.state.get().open);
        popover.setAnchor(this.root);
        popover.setPlacement("bottom-start");
        popover.setOffset([0, 2]);
        popover.setSizing({
            matchAnchorWidth: props.matchAnchorWidth ?? true,
            resizable: props.resizable,
            scroll: false,
        });
    }

    private syncList(): void {
        const list = this.listView;
        if (!list) return;

        const props = this.props;
        const { popoverResized } = this.model.state.get();
        list.setItems(props.items);
        list.setValue(props.value);
        list.setOnChange(props.onChange);
        list.setDisabled(props.disabled);
        list.setReadOnly(props.readOnly);
        list.setSearchSettings(true, props.filterMode, undefined);
        list.setSelectAll(props.selectAll, props.selectAllLabel);
        list.setEmptyMessage(props.emptyMessage);
        list.setLayout({
            rowHeight: props.rowHeight,
            maxVisibleItems: popoverResized ? 999 : props.maxVisibleItems,
            height: popoverResized ? "100%" : undefined,
        });
    }

    private inputProps(): InputProps {
        const props = this.props;
        return {
            size: props.size ?? "md",
            value: this.model.displayText,
            placeholder: props.placeholder,
            disabled: props.disabled,
            // Always read-only: the trigger displays a formatted selection and is never typed into.
            readOnly: true,
            onFocus: this.model.onInputFocus,
            onClick: this.model.onInputClick,
            "aria-haspopup": "listbox",
            "aria-expanded": this.model.state.get().open,
            "aria-controls": this.model.popoverId,
            "aria-label": props["aria-label"],
            "aria-labelledby": props["aria-labelledby"],
            endSlot: this.chevron.root,
        };
    }

    /**
     * The icon is an `IconName` string, which takes `IconButtonView.updateIcon`'s DOM branch —
     * `createIconElement`; the previous implementation passed
     * `renderIcon("chevron-down")`, so every `MultiSelect` carried a retained icon subtree
     * inside its chevron even while closed.
     */
    private chevronProps(): IconButtonProps {
        const props = this.props;
        return {
            icon: this.model.state.get().open ? "chevron-up" : "chevron-down",
            size: "sm",
            tabIndex: -1,
            // `disabled` only — see the class comment.
            disabled: props.disabled,
            onClick: this.model.onChevronClick,
        };
    }

    /**
     * Exactly the props `PopoverView` names — never this component's rest props, which would land on
     * the floating root and be reinstalled on every update.
     */
    private popoverProps(): PopoverViewProps {
        const props = this.props;
        return {
            name: "multiselect-popover",
            open: this.model.state.get().open,
            onClose: this.model.onPopoverClose,
            elementRef: this.root,
            placement: "bottom-start",
            offset: [0, 2],
            matchAnchorWidth: props.matchAnchorWidth ?? true,
            resizable: props.resizable,
            onResize: this.model.onPopoverResize,
            scroll: false,
            outsideClickIgnoreSelector:
                `[data-type="multiselect"][data-id="${this.model.multiSelectId}"]`,
            contentView: (host) => {
                // `PopoverFloatingView.onMount` never appends what the factory returns — it only
                // claims and mounts it. Omit this append and the dropdown renders empty.
                const list = new MultiListBoxView<T>(this.listProps());
                host.append(list.root);
                this.listView = list;
                return list;
            },
        };
    }

    private listProps(): MultiListBoxProps<T> {
        const props = this.props;
        const { popoverResized } = this.model.state.get();
        return {
            // The element `aria-controls` points at. See the class comment and US-1018 D8.
            id: this.model.popoverId,
            items: props.items,
            value: props.value,
            onChange: props.onChange,
            disabled: props.disabled,
            readOnly: props.readOnly,
            filterMode: props.filterMode,
            rowHeight: props.rowHeight,
            // Once the user has resized the dropdown, the row cap stops governing its height.
            maxVisibleItems: popoverResized ? 999 : props.maxVisibleItems,
            selectAll: props.selectAll,
            selectAllLabel: props.selectAllLabel,
            emptyMessage: props.emptyMessage,
            height: popoverResized ? "100%" : undefined,
        };
    }

    // -----------------------------------------------------------------------
    // Owned input access
    // -----------------------------------------------------------------------

    /**
     * One identity for this view's whole life, so `InputView` binds it exactly once. A per-update
     * merged closure — the literal translation of the previous stable callback — would make
     * `InputView.updateRef`'s identity gate fire on every update, and its `clearRef` calls
     * `ref(null)`, so `model.inputRef` would go transiently null each time.
     */
    /**
     * The caller's ref needs the opposite cadence: re-bound whenever its identity moves, so the
     * previous ref is released before the next one receives the element.
     */
    public get inputElement(): HTMLInputElement | null {
        return this.input?.inputElement ?? null;
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

    private modelProps(props: MultiSelectViewProps<T>): MultiSelectProps<T> {
        return props;
    }

    private restProps(props: MultiSelectViewProps<T>): Record<string, unknown> {
        const {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            name: _name, items: _items, value: _value, onChange: _onChange,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            placeholder: _placeholder, disabled: _disabled, readOnly: _readOnly, size: _size,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            filterMode: _filterMode, rowHeight: _rowHeight, maxVisibleItems: _maxVisibleItems,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            selectAll: _selectAll, selectAllLabel: _selectAllLabel, emptyMessage: _emptyMessage,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            resizable: _resizable, matchAnchorWidth: _matchAnchorWidth,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            formatSelection: _formatSelection,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            width: _width, minWidth: _minWidth, maxWidth: _maxWidth,
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
