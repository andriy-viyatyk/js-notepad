import { applyRestProps, clearRestListeners, createRestPropsState } from "../shared/dom-props";
import type { RestPropsState } from "../shared/dom-props";
import { createComponentModelDriver, type ComponentModelDriver } from "../../core/state/model";
import { nextElementId } from "../shared/element-id";
import { fillSlot, type SlotContent } from "../shared/fill-slot";
import { VanillaView } from "../shared/vanilla-view";
import { InputView } from "../Input/InputView";
import { ListBoxView } from "../ListBox/ListBoxView";
import { PopoverView, type PopoverViewProps } from "../Popover/PopoverView";
import type { IListBoxItem, ListBoxProps } from "../ListBox/types";
import type { VirtualGridLayout } from "../VirtualGrid";
import type { InputProps } from "../Input/InputView";
import {
    AutocompleteModel,
    defaultAutocompleteState,
    type AutocompleteProps,
} from "./AutocompleteModel";
import "./Autocomplete.css";
// Borrowed: the header row composes a `[data-type="spacer"]` element directly rather than
// instantiating `SpacerView`, so nothing in this module's graph would pull the rule in.
import "../Spacer/Spacer.css";

export type AutocompleteViewProps = AutocompleteProps;

interface AutocompleteContentProps {
    header: SlotContent;
    headerAction: SlotContent;
    list: ListBoxProps<IListBoxItem>;
}

/**
 * The contents of the open dropdown: an optional header row above the suggestion `ListBox`.
 *
 * **This view adopts the popover's floating root as its own root** (`super(props, host)`), the shape
 * `MenuContentView` uses. It is here because `PopoverView.contentView` returns exactly *one*
 * `IOwnedView` while this dropdown has *two* children, and because both of them must stay direct
 * children of `.popover-shell` — a wrapper element would either become the popover's sole flex item
 * (moving the overflow and shrink semantics down a level) or, as `display: contents`, would stop the
 * header and the list being direct children at all.
 *
 * **Three writes this view must never make on `this.root`**, because `PopoverFloatingView`
 * reasserts them on every update and would silently win: `dataset.type` (it is `"popover"`), any
 * `className` assignment (it owns `popover-shell` and toggles `scroll-container`), and
 * `replaceChildren` (the resize handle is appended to this same root *after* the content mounts).
 * Tag children with `data-type` / `data-part` instead. Nothing here wants any of the three, which is
 * what makes the sharing safe — but the failure mode is an attribute quietly reverting one update
 * later, not an exception.
 *
 * The popover forwards no updates to a content view, so `AutocompleteView` pushes
 * `AutocompleteContentProps` here from its own single `syncChildren()`. `activeIndex` and the
 * filtered rows travel together inside `list`, so one push carries both and `ListBoxView` picks
 * `scrollToRowAfterPaint` correctly.
 */
class AutocompleteContentView extends VanillaView<AutocompleteContentProps> {
    private list: ListBoxView<IListBoxItem> | undefined;

    private headerRow: HTMLDivElement | undefined;
    private headerHost: HTMLSpanElement | undefined;
    private actionHost: HTMLSpanElement | undefined;
    private headerCleanup: (() => void) | undefined;
    private actionCleanup: (() => void) | undefined;

    public constructor(props: AutocompleteContentProps, host: HTMLElement) {
        super(props, host);
    }

    protected onMount(): void {
        this.list = this.child(new ListBoxView<IListBoxItem>(this.props.list));
        this.root.append(this.list.root);
        this.list.mount();

        // Registered once; the stored cleanup is reassigned per `fillSlot` call, and a superseded
        // cleanup is a no-op on its own.
        this.own(() => this.headerCleanup?.());
        this.own(() => this.actionCleanup?.());

        this.sync(this.props);
    }

    protected onUpdate(props: AutocompleteContentProps): void {
        this.sync(props);
    }

    public setHeaderSlots(header: SlotContent, headerAction: SlotContent): void {
        this.syncHeader(header, headerAction);
    }

    public setItems(items: ListBoxProps<IListBoxItem>["items"]): void {
        this.list?.setItems(items);
    }

    public setActiveIndex(activeIndex: ListBoxProps<IListBoxItem>["activeIndex"]): void {
        this.list?.setActiveIndex(activeIndex);
    }

    public setEmptyMessage(emptyMessage: ListBoxProps<IListBoxItem>["emptyMessage"]): void {
        this.list?.setEmptyMessage(emptyMessage);
    }

    public setLayout(layout: VirtualGridLayout): void {
        this.list?.setLayout(layout);
    }

    private sync(props: AutocompleteContentProps): void {
        const list = this.list;
        if (!list) return;

        this.syncHeader(props.header, props.headerAction);
        list.setItems(props.list.items);
        list.setEmptyMessage(props.list.emptyMessage);
        list.setLayout({
            rowHeight: props.list.rowHeight,
            growToHeight: typeof props.list.growToHeight === "number"
                ? `${props.list.growToHeight}px`
                : props.list.growToHeight,
            fitToWidth: true,
            whiteSpaceY: props.list.whiteSpaceY,
        });
        list.setActiveIndex(props.list.activeIndex);
    }

    private syncHeader(header: SlotContent, headerAction: SlotContent): void {
        const present = header != null && header !== false;
        if (present) {
            const headerHost = this.headerHost;
            const actionHost = this.actionHost;
            if (!headerHost || !actionHost) return;

            const row = this.headerRow ?? this.createHeaderRow();
            if (!row.isConnected && this.list) this.root.insertBefore(row, this.list.root);
            this.headerCleanup = fillSlot(headerHost, header);
            this.actionCleanup = fillSlot(actionHost, headerAction);
        } else if (this.headerRow?.isConnected) {
            this.headerRow.remove();
        }
    }

    /**
     * Replaces the `Panel` + `Spacer` composition the React implementation used (EPIC-056 US-1018
     * D4) — `Panel`'s last consumer inside `uikit/`. The two slot hosts are `display: contents`, as
     * `fillSlot`'s own React container is, so the header content and the action stay flex items of
     * the row exactly as they were when React rendered them as direct children.
     */
    private createHeaderRow(): HTMLDivElement {
        const row = document.createElement("div");
        row.dataset.type = "autocomplete-header";

        this.headerHost = document.createElement("span");
        this.headerHost.style.display = "contents";

        const spacer = document.createElement("span");
        spacer.dataset.type = "spacer";

        this.actionHost = document.createElement("span");
        this.actionHost.style.display = "contents";

        row.append(this.headerHost, spacer, this.actionHost);
        this.headerRow = row;
        return row;
    }
}

/**
 * The typeahead input: an `Input` whose `Popover` hosts a filtered `ListBox`.
 *
 * Three things here differ from `SelectView`, which is otherwise the reference implementation for
 * everything structural in this file:
 *
 * - **`data-state` and "the popover exists" are different facts.** The popover opens on
 *   `model.popoverOpen`, which is false for an open component whose filter matched nothing and that
 *   has no `emptyMessage`. `data-state` still reports `state.open`. Do not collapse them.
 * - **The width props go to the inner `Input`, not to the root.** The React implementation forwarded
 *   `width`/`minWidth`/`maxWidth` to `Input` and wrote no inline style on the root at all. `Select`
 *   does the opposite. Both are preserved as they were.
 * - **The `contentView` factory does not append anything**, because `AutocompleteContentView` adopts
 *   the host as its root. `SelectView`'s factory must append, because a `ListBoxView` builds its own
 *   detached root. Do not "fix" one to look like the other.
 *
 * `applyRoot` stays off the state path: `applyRestProps` removes and re-adds every `on*` listener per
 * call, and rest props cannot have changed on a state write.
 */
export class AutocompleteView extends VanillaView<AutocompleteViewProps> {
    private readonly driver: ComponentModelDriver<
        typeof defaultAutocompleteState,
        AutocompleteProps,
        AutocompleteModel
    >;

    private readonly restPropsState: RestPropsState = createRestPropsState();

    private input: InputView | undefined;
    private popover: PopoverView | undefined;

    /**
     * The dropdown contents, or undefined while closed. Owned by the floating branch — created by
     * the `contentView` factory and disposed with the branch, so this reference is bare.
     */
    private contentView: AutocompleteContentView | undefined;


    public constructor(props: AutocompleteViewProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "autocomplete";

        this.driver = createComponentModelDriver(
            this.modelProps(props),
            AutocompleteModel,
            defaultAutocompleteState,
        );
        this.model.setElementId(nextElementId("autocomplete"));

        this.own(() => this.driver.dispose());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    /** The live model, for the story and for tests. */
    public get model(): AutocompleteModel {
        return this.driver.model;
    }

    protected onMount(): void {
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
            (state) => ({ open: state.open, activeIndex: state.activeIndex }),
            () => this.syncChildren(),
        );
    }

    protected onUpdate(props: AutocompleteViewProps): void {
        this.driver.update(this.modelProps(props));
        this.applyRoot(props);
        this.syncChildren();
    }

    // -----------------------------------------------------------------------
    // Root
    // -----------------------------------------------------------------------

    private applyRoot(props: AutocompleteViewProps): void {
        const root = this.root;
        setOrRemove(root, "data-name", props.name);
        root.setAttribute("data-id", this.model.autocompleteId);
        toggle(root, "data-disabled", !!props.disabled);
        toggle(root, "data-readonly", !!props.readOnly);

        // No inline size: the width trio is forwarded to the inner Input, which is what the React
        // implementation did. `Autocomplete.css`'s `width: 100%` owns the root.
    }

    // -----------------------------------------------------------------------
    // Children
    // -----------------------------------------------------------------------

    /** The single consequence of both the prop pump and a state write. */
    private syncChildren(): void {
        const input = this.input;
        const popover = this.popover;
        if (!input || !popover) return;

        // `state.open`, not `popoverOpen` — see the class comment.
        this.root.dataset.state = this.model.state.get().open ? "open" : "closed";

        input.update(this.inputProps());
        this.syncPopover(popover);

        if (this.model.popoverOpen) {
            this.syncContent();
        } else {
            // The branch has just been torn down by the popover update above. The reference must not
            // survive into a re-open, and the factory reassigns it there.
            this.contentView = undefined;
        }
    }

    private syncPopover(popover: PopoverView): void {
        popover.setOpen(this.model.popoverOpen);
        popover.setAnchor(this.root);
        popover.setPlacement("bottom-start");
        popover.setOffset([0, 2]);
        popover.setSizing({ matchAnchorWidth: true, resizable: false, scroll: false });
    }

    private syncContent(): void {
        const content = this.contentView;
        if (!content) return;

        const props = this.props;
        content.setHeaderSlots(props.header, props.headerAction);
        const { filteredItems } = this.model.filtered;
        content.setItems(filteredItems);
        content.setEmptyMessage(props.emptyMessage);
        content.setLayout({
            rowHeight: this.model.rowHeight,
            growToHeight: `${this.model.maxVisibleItems * this.model.rowHeight}px`,
            fitToWidth: true,
            whiteSpaceY: undefined,
        });
        // The final ListBox operation carries the filtered rows and active index together for
        // the correct after-paint scroll path.
        content.setActiveIndex(this.model.state.get().activeIndex);
    }

    private inputProps(): InputProps {
        const props = this.props;
        return {
            size: props.size ?? "md",
            value: props.value,
            onChange: this.model.onInputChange,
            placeholder: props.placeholder,
            disabled: props.disabled,
            readOnly: props.readOnly,
            autoFocus: props.autoFocus,
            onFocus: this.model.onInputFocus,
            onClick: this.model.onInputClick,
            startSlot: props.startSlot,
            endSlot: props.endSlot,
            width: props.width,
            minWidth: props.minWidth,
            maxWidth: props.maxWidth,
            "aria-haspopup": "listbox",
            "aria-expanded": this.model.state.get().open,
            "aria-autocomplete": "list",
            "aria-controls": this.model.listboxId,
            "aria-label": props["aria-label"],
            "aria-labelledby": props["aria-labelledby"],
        };
    }

    private popoverProps(): PopoverViewProps {
        return {
            open: this.model.popoverOpen,
            onClose: this.model.onPopoverClose,
            elementRef: this.root,
            placement: "bottom-start",
            offset: [0, 2],
            matchAnchorWidth: true,
            scroll: false,
            outsideClickIgnoreSelector:
                `[data-type="autocomplete"][data-id="${this.model.autocompleteId}"]`,
            contentView: (host) => {
                // No `host.append` here: the content view adopts the host as its root, which is how
                // its two children stay direct children of the popover.
                const content = new AutocompleteContentView(this.contentProps(), host);
                this.contentView = content;
                return content;
            },
        };
    }

    private contentProps(): AutocompleteContentProps {
        const props = this.props;
        return {
            header: props.header,
            headerAction: props.headerAction,
            list: this.listProps(),
        };
    }

    /**
     * `searchText` is deliberately absent: `Autocomplete` has never highlighted the matched
     * substring in a suggestion label, and adding it here would be a visual change.
     */
    private listProps(): ListBoxProps<IListBoxItem> {
        const props = this.props;
        const { filteredItems } = this.model.filtered;
        return {
            id: this.model.listboxId,
            items: filteredItems,
            activeIndex: this.model.state.get().activeIndex,
            onActiveChange: this.model.onActiveIndexChange,
            onChange: this.model.onListChange,
            rowHeight: this.model.rowHeight,
            growToHeight: this.model.maxVisibleItems * this.model.rowHeight,
            emptyMessage: props.emptyMessage,
            keyboardNav: false,
        };
    }

    // -----------------------------------------------------------------------
    // Owned input access
    // -----------------------------------------------------------------------

    public get inputElement(): HTMLInputElement | null {
        return this.input?.inputElement ?? null;
    }

    // -----------------------------------------------------------------------

    /** Native listener attached to the child Input's field after it mounts. */
    private readonly handleInputKeyDown = (event: KeyboardEvent): void => {
        this.model.onInputKeyDown(event);
    };

    private modelProps(props: AutocompleteViewProps): AutocompleteProps {
        return props;
    }

    private restProps(props: AutocompleteViewProps): Record<string, unknown> {
        const {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            name: _name, value: _value, onChange: _onChange, items: _items,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            filterMode: _filterMode, filter: _filter, openOnFocus: _openOnFocus,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onSubmit: _onSubmit, onEscape: _onEscape, header: _header,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            headerAction: _headerAction, emptyMessage: _emptyMessage, placeholder: _placeholder,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            disabled: _disabled, readOnly: _readOnly, size: _size, autoFocus: _autoFocus,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            startSlot: _startSlot, endSlot: _endSlot, width: _width, minWidth: _minWidth,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            maxWidth: _maxWidth, maxVisibleItems: _maxVisibleItems, rowHeight: _rowHeight,
            ...rest
        } = props;
        return rest as Record<string, unknown>;
    }
}

function setOrRemove(root: HTMLElement, attribute: string, value: string | undefined): void {
    if (value === undefined) root.removeAttribute(attribute);
    else root.setAttribute(attribute, value);
}

function toggle(root: HTMLElement, attribute: string, on: boolean): void {
    if (on) root.setAttribute(attribute, "");
    else root.removeAttribute(attribute);
}
