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
import { MultiListBoxView } from "../MultiListBox/MultiListBoxView";
import { PopoverView, type PopoverViewProps } from "../Popover/PopoverView";
import type { IListBoxItem } from "../ListBox/types";
import type { MultiListBoxProps } from "../MultiListBox/MultiListBox";
import type { IconButtonProps } from "../IconButton/IconButton";
import type { InputProps } from "../Input/Input";
import { defaultMultiSelectState, MultiSelectModel, type MultiSelectProps } from "./MultiSelectModel";
import "./MultiSelect.css";

export type MultiSelectViewProps<T = IListBoxItem> = MultiSelectProps<T> & {
    ref?: React.Ref<HTMLInputElement>;
};

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
 *   React implementation. C3-5 obliges this task to assert the aria pairing resolves, which a
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

    private input!: InputView;
    private chevron!: IconButtonView;
    private popover!: PopoverView;

    /**
     * The list inside the open dropdown, or undefined while closed. Owned by the floating branch —
     * created by the `contentView` factory on open and disposed with the branch on close.
     */
    private listView: MultiListBoxView<T> | undefined;

    private inputElement: HTMLInputElement | null = null;
    private appliedCallerRef: React.Ref<HTMLInputElement> | undefined;
    private callerRefCleanup: (() => void) | undefined;

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
        this.own(() => this.callerRefCleanup?.());
    }

    /** The live model, for the story and for tests. */
    public get model(): MultiSelectModel<T> {
        return this.driver.model;
    }

    protected onMount(): void {
        // Built before the input, because its root is the input's `endSlot`.
        this.chevron = this.child(new IconButtonView(this.chevronProps()));
        this.chevron.mount();

        this.input = this.child(new InputView(this.inputProps()));
        this.root.append(this.input.root);
        this.input.mount();

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
            (state) => ({ open: state.open, popoverResized: state.popoverResized }),
            () => this.syncChildren(),
        );
    }

    protected onUpdate(props: MultiSelectViewProps<T>): void {
        this.driver.update(this.modelProps(props));
        this.applyRoot(props);
        this.syncCallerRef(false);
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

        // React passed no `style` at all when all three were undefined, leaving `MultiSelect.css`'s
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
        const open = this.model.state.get().open;
        this.root.dataset.state = open ? "open" : "closed";

        this.chevron.update(this.chevronProps());
        this.input.update(this.inputProps());
        this.popover.update(this.popoverProps());

        if (open) {
            this.listView?.update(this.listProps());
        } else {
            // Hygiene rather than correctness: the branch has just been torn down by the popover
            // update above. The reference must not survive into a re-open, and the factory
            // reassigns it there.
            this.listView = undefined;
        }
    }

    private inputProps(): InputProps {
        const props = this.props;
        return {
            ref: this.setInputElement,
            size: props.size ?? "md",
            value: this.model.displayText.value,
            placeholder: props.placeholder,
            disabled: props.disabled,
            // Always read-only: the trigger displays a formatted selection and is never typed into.
            readOnly: true,
            onFocus: this.model.onInputFocus,
            onClick: this.model.onInputClick,
            onKeyDown: this.handleInputKeyDown,
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
     * `createIconElement`, no React root. The React implementation passed
     * `renderIcon("chevron-down")`, so every `MultiSelect` on screen carried a retained React root
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
            onMouseDown: this.handleChevronMouseDown,
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
    // The forwarded ref
    // -----------------------------------------------------------------------

    /**
     * One identity for this view's whole life, so `InputView` binds it exactly once. A per-update
     * merged closure — the literal translation of the React `useCallback` — would make
     * `InputView.updateRef`'s identity gate fire on every update, and its `clearRef` calls
     * `ref(null)`, so `model.inputRef` would go transiently null each time.
     */
    private readonly setInputElement = (el: HTMLInputElement | null): void => {
        this.inputElement = el;
        this.model.setInputRef(el);
        this.syncCallerRef(true);
    };

    /**
     * The caller's ref needs the opposite cadence: re-bound whenever its identity moves, so the
     * previous ref is released before the next one receives the element.
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

    /*
     * `applyRestProps` installs these on the real elements and delivers a `toPublicEvent` facade, so
     * the model takes the native event and the view unwraps it — the `PathInputView` seam.
     */

    private readonly handleInputKeyDown = (event: React.SyntheticEvent<HTMLElement>): void => {
        this.model.onInputKeyDown(event.nativeEvent as KeyboardEvent);
    };

    private readonly handleChevronMouseDown = (event: React.SyntheticEvent<HTMLElement>): void => {
        this.model.onChevronMouseDown(event.nativeEvent as MouseEvent);
    };

    // -----------------------------------------------------------------------

    private modelProps(props: MultiSelectViewProps<T>): MultiSelectProps<T> {
        const { ref: _ref, ...modelProps } = props;
        return modelProps as MultiSelectProps<T>;
    }

    private restProps(props: MultiSelectViewProps<T>): Record<string, unknown> {
        const {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ref: _ref, name: _name, items: _items, value: _value, onChange: _onChange,
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
