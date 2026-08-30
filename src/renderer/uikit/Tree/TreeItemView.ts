import { applyRestProps, clearRestListeners, createRestPropsState } from "../shared/dom-props";
import type { RestPropsState } from "../shared/dom-props";
import { fillSlot, type SlotContent } from "../shared/fill-slot";
import { highlightInto } from "../shared/highlight";
import { createIconElement, createIconPlaceholderElement, isIconName } from "../shared/slots";
import type { IconRef, SlotText } from "../shared/slots";
import { SpinnerView } from "../Spinner/SpinnerView";
import { attachTooltip, type TooltipAttachment, type TooltipOptions } from "../Tooltip";
import { VanillaView } from "../shared/vanilla-view";
import { TreeIndents } from "./tree-indents";
import type { TreeItemProps } from "./TreeItem";
import "./TreeItem.css";

/** Which of the four shapes the chevron column currently holds. */
type ChevronMode = "none" | "spinner" | "chevron" | "stub";

const defaultIndentSize = 16;

/**
 * The tree row, and the single source of truth for its DOM.
 *
 * `TreeView` builds one per pooled cell and calls `update()` as that cell is re-pointed at
 * different rows. It is the sole driver: the `TreeItem` face that once wrapped this class for
 * app-layer JSX callers was deleted in EPIC-074, and `TreeItem.ts` now holds only `TreeItemProps`.
 * The class stays the single implementation because a second one — a row with six state attributes,
 * a four-way chevron column, N level guides and three slots — would drift, and nothing in the build
 * would catch it.
 *
 * **The root's child list is never rebuilt.** The four stable hosts are created once in `onMount`
 * and the indents are inserted *before* the chevron host, because `fillSlot` caches per-host state
 * in a module-level `WeakMap` and this view holds hard references to its hosts: a
 * `root.replaceChildren()` would leave that cache pointing at detached elements, and the next
 * `setIcon`/`setLabel` would render into a detached container with no error at all — a row with the
 * right height, the right background, working handlers and no content. It would also strand mounted
 * slot subtrees on detached trees and kill the chevron's listener while the row-level handlers (which
 * live on the cell wrapper, not here) kept working, so the symptom would read as "chevron bug".
 *
 * The icon and trailing hosts are real boxes rather than `display: contents`, because they were real
 * boxes in the earlier DOM (`<span className="tree-icon">` / `"tree-trailing"`) and carry their own
 * flex rules. The earlier renderer attached each only when its content was present, so both are attached and
 * detached rather than left empty in the flex flow.
 */
export type TreeItemViewProps = TreeItemProps;

export class TreeItemView extends VanillaView<TreeItemViewProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();

    private chevronHost: HTMLSpanElement | undefined;
    private iconHost: HTMLSpanElement | undefined;
    private labelHost: HTMLSpanElement | undefined;
    private trailingHost: HTMLSpanElement | undefined;

    private indents: TreeIndents | undefined;

    private chevronMode: ChevronMode | undefined;
    private chevronButton: HTMLButtonElement | undefined;
    private chevronRelease: (() => void) | undefined;
    private chevronIcon: SVGElement | undefined;
    private chevronExpanded: boolean | undefined;
    private chevronSpinner: SpinnerView | undefined;

    private iconCleanup: (() => void) | undefined;
    private directIconElement: Node | undefined;
    private labelCleanup: (() => void) | undefined;
    private trailingCleanup: (() => void) | undefined;
    /** Which mechanism currently owns the label host — they must never both write to it. */
    private labelOwner: "slot" | "text" = "text";
    private iconAttached = false;
    private trailingAttached = false;
    private appliedTrailingElement: Node | undefined;

    private tooltip: TooltipAttachment | undefined;

    public constructor(props: TreeItemProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.chevronHost = document.createElement("span");
        this.chevronHost.dataset.part = "chevron";
        this.chevronHost.style.display = "contents";

        this.iconHost = document.createElement("span");
        this.iconHost.className = "tree-icon";

        this.labelHost = document.createElement("span");
        this.labelHost.className = "label";

        this.trailingHost = document.createElement("span");
        this.trailingHost.className = "tree-trailing";

        // Only the chevron host and the label are unconditional; the indents insert before the
        // chevron host, so it has to exist before the first `sync()`.
        this.root.append(this.chevronHost, this.labelHost);
        this.indents = new TreeIndents(this.root, this.chevronHost, "tree-indent");

        // Attached unconditionally, even with no tooltip yet: `update` handles the empty/disabled
        // arms, so a row that gains a tooltip mid-life needs no attach/detach churn.
        this.tooltip = attachTooltip(this.root, this.tooltipOptions(this.props));

        this.applyProps(this.props);
        this.listen(this.root, "contextmenu", (event) => this.props.onContextMenu?.(event));

        this.applyConstructionRestProps(this.props);
        this.own(() => this.tooltip?.dispose());
        this.own(() => this.clearChevron());
        this.own(() => this.clearSlots());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: TreeItemProps): void {
        this.applyProps(props);
        this.tooltip?.update(this.tooltipOptions(props));
    }

    private applyProps(props: TreeItemViewProps): void {
        const {
            name,
            id,
            level,
            expanded,
            hasChildren,
            icon,
            iconElement,
            label,
            searchText,
            selected,
            active,
            dragging,
            dropActive,
            // `data-loading` carries no style of its own — the visible change is the
            // chevron-to-spinner swap below. The attribute is kept as the documented hook for a
            // future dim-while-loading rule, which is why there is no rule for it in the CSS.
            loading,
            disabled,
            // Consumed by the tooltip attachment, never forwarded to the DOM.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            tooltip: _tooltip,
            indentSize = defaultIndentSize,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            hideChevron: _hideChevron,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onChevronClick: _onChevronClick,
            // The row callback is owned by this view and must not enter the residual-prop listener path.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onContextMenu: _onContextMenu,
            trailing,
            trailingElement,
            trailingVisibility = "always",
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ...rest
        } = props;

        const chevronHost = this.chevronHost;
        const iconHost = this.iconHost;
        const labelHost = this.labelHost;
        const trailingHost = this.trailingHost;
        const indents = this.indents;
        if (!chevronHost || !iconHost || !labelHost || !trailingHost || !indents) return;

        const root = this.root;
        root.dataset.type = "tree-item";
        setAttr(root, "data-name", name);
        setAttr(root, "id", id);
        root.dataset.state = expanded ? "open" : "closed";
        toggleAttr(root, "data-selected", !!selected);
        toggleAttr(root, "data-active", !!active);
        toggleAttr(root, "data-dragging", !!dragging);
        toggleAttr(root, "data-drop-active", !!dropActive);
        toggleAttr(root, "data-loading", !!loading);
        toggleAttr(root, "data-disabled", !!disabled);
        root.dataset.trailingVisibility = trailingVisibility;
        root.setAttribute("role", "treeitem");
        root.setAttribute("aria-selected", selected ? "true" : "false");
        setAttr(root, "aria-expanded", hasChildren ? String(!!expanded) : undefined);
        root.setAttribute("aria-level", String(level + 1));
        setAttr(root, "aria-disabled", disabled ? "true" : undefined);

        indents.sync(level, indentSize);
        this.setChevron(props);
        this.setIcon(icon, iconElement);
        this.setLabel(label, searchText);
        this.setTrailing(trailing, trailingElement);

    }

    private applyConstructionRestProps(props: TreeItemViewProps): void {
        const {
            name: _name,
            id: _id,
            level: _level,
            expanded: _expanded,
            hasChildren: _hasChildren,
            icon: _icon,
            iconElement: _iconElement,
            label: _label,
            searchText: _searchText,
            selected: _selected,
            active: _active,
            dragging: _dragging,
            dropActive: _dropActive,
            loading: _loading,
            disabled: _disabled,
            tooltip: _tooltip,
            indentSize: _indentSize,
            hideChevron: _hideChevron,
            onChevronClick: _onChevronClick,
            onContextMenu: _onContextMenu,
            trailing: _trailing,
            trailingElement: _trailingElement,
            trailingVisibility: _trailingVisibility,
            ...rest
        } = props;
        // Residual props come last, matching the JSX order: a caller-supplied role or aria-* wins.
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    // -----------------------------------------------------------------------
    // Chevron column
    // -----------------------------------------------------------------------

    /**
     * Transcribed from the former ternary chain: hidden, else spinner while loading, else a button
     * when the row is expandable, else a same-width stub so every row's content lines up.
     */
    private setChevron(props: TreeItemProps): void {
        const mode: ChevronMode = props.hideChevron
            ? "none"
            : props.loading
                ? "spinner"
                : props.hasChildren
                    ? "chevron"
                    : "stub";

        if (mode === this.chevronMode) {
            // Only the chevron's own icon and aria-label can change without a mode change.
            if (mode === "chevron") this.updateChevronIcon(!!props.expanded);
            return;
        }

        this.clearChevron();
        this.chevronMode = mode;

        if (mode === "none") return;

        if (mode === "spinner") {
            const stub = document.createElement("div");
            stub.dataset.part = "chevron-stub";
            stub.setAttribute("aria-label", "Loading");
            const spinner = new SpinnerView({ size: 12 });
            spinner.mount();
            this.chevronSpinner = spinner;
            stub.append(spinner.root);
            this.chevronHost.append(stub);
            return;
        }

        if (mode === "stub") {
            const stub = document.createElement("div");
            stub.dataset.part = "chevron-stub";
            this.chevronHost.append(stub);
            return;
        }

        const button = document.createElement("button");
        button.className = "tree-chevron";
        button.type = "button";
        button.tabIndex = -1;
        // Read the handler from the live props at event time: this element outlives the row it was
        // created for, so a captured closure would call the previous row's callback.
        this.chevronRelease = this.listen(button, "click", (event) => {
            this.props.onChevronClick?.(event);
        });
        this.chevronButton = button;
        this.chevronHost.append(button);
        this.updateChevronIcon(!!props.expanded);
    }

    private updateChevronIcon(expanded: boolean): void {
        const button = this.chevronButton;
        if (!button || expanded === this.chevronExpanded) return;
        this.chevronExpanded = expanded;
        button.setAttribute("aria-label", expanded ? "Collapse" : "Expand");
        this.chevronIcon?.remove();
        this.chevronIcon = createIconElement(expanded ? "chevron-down" : "chevron-right");
        button.append(this.chevronIcon);
    }

    private clearChevron(): void {
        this.chevronRelease?.();
        this.chevronRelease = undefined;
        this.chevronSpinner?.dispose();
        this.chevronSpinner = undefined;
        this.chevronButton = undefined;
        this.chevronIcon = undefined;
        this.chevronExpanded = undefined;
        this.chevronMode = undefined;
        this.chevronHost.replaceChildren();
    }

    // -----------------------------------------------------------------------
    // Slots
    // -----------------------------------------------------------------------

    /** An icon *name* becomes a DOM `svg`. */
    private setIcon(icon: IconRef | undefined, iconElement: Node | undefined): void {
        if (iconElement === undefined && icon == null) {
            this.directIconElement = undefined;
            if (this.iconAttached) {
                this.iconCleanup?.();
                this.iconCleanup = undefined;
                this.iconHost.remove();
                this.iconAttached = false;
            }
            return;
        }
        if (!this.iconAttached) {
            this.root.insertBefore(this.iconHost, this.labelHost);
            this.iconAttached = true;
        }
        if (iconElement !== undefined) {
            // A pooled row may receive the same direct node repeatedly. Do not move it again: a
            // real DOM move can disturb focus or cancel an in-flight transition.
            if (this.directIconElement === iconElement) return;
            this.directIconElement = iconElement;
            this.iconCleanup = fillSlot(this.iconHost, iconElement);
            return;
        }
        this.directIconElement = undefined;
        // A string is always an icon-name attempt, never content: `renderIcon` returned `null` for
        // an unknown name, so an unknown name must render nothing here too. Falling through to
        // `fillSlot` would write the name into the row as literal text.
        if (typeof icon === "string") {
            const element = isIconName(icon) ? createIconElement(icon) : createIconPlaceholderElement();
            this.iconCleanup = fillSlot(this.iconHost, element);
            return;
        }
        this.iconCleanup = fillSlot(this.iconHost, icon);
    }

    private setLabel(label: SlotContent, searchText: string | undefined): void {
        if (typeof label === "string") {
            if (this.labelOwner === "slot") {
                // Release fillSlot's ownership of this host before writing to it directly.
                this.labelCleanup?.();
                this.labelCleanup = undefined;
                this.labelOwner = "text";
            }
            highlightInto(this.labelHost, label, searchText);
            return;
        }
        this.labelOwner = "slot";
        this.labelCleanup = fillSlot(this.labelHost, label);
    }

    /** The earlier renderer attached `<span className="tree-trailing">…` when trailing content was present. */
    private setTrailing(trailing: SlotContent, trailingElement?: Node): void {
        // A caller-owned DOM node takes the identity-checked arm. `fillSlot` replaces the host's
        // children unconditionally, so re-filling with the same node detaches and re-appends it —
        // which drops focus and hover on an interactive control and churns the DOM on every
        // virtual-scroll render. Comparing identity first keeps the node mounted.
        if (trailingElement !== undefined) {
            if (!this.trailingAttached) {
                this.root.append(this.trailingHost);
                this.trailingAttached = true;
            }
            if (this.appliedTrailingElement === trailingElement) return;
            this.appliedTrailingElement = trailingElement;
            this.trailingCleanup = fillSlot(this.trailingHost, trailingElement);
            return;
        }
        this.appliedTrailingElement = undefined;
        if (trailing == null) {
            if (this.trailingAttached) {
                this.trailingCleanup?.();
                this.trailingCleanup = undefined;
                this.trailingHost.remove();
                this.trailingAttached = false;
            }
            return;
        }
        if (!this.trailingAttached) {
            this.root.append(this.trailingHost);
            this.trailingAttached = true;
        }
        this.trailingCleanup = fillSlot(this.trailingHost, trailing);
    }

    /**
     * `null`, `false` and `""` all mean "no tooltip" in the public prop, but `attach-tooltip` only
     * treats the first two as empty — so the empty string has to become `disabled`.
     */
    private tooltipOptions(props: TreeItemProps): TooltipOptions {
        const content: SlotText | undefined = props.tooltip;
        const empty = content == null || content === false || content === "";
        return { content: empty ? null : content, disabled: empty };
    }

    private clearSlots(): void {
        this.iconCleanup?.();
        this.labelCleanup?.();
        this.trailingCleanup?.();
        this.iconCleanup = undefined;
        this.labelCleanup = undefined;
        this.trailingCleanup = undefined;
        this.directIconElement = undefined;
    }
}

function setAttr(root: HTMLElement, attribute: string, value: string | undefined): void {
    if (value === undefined) root.removeAttribute(attribute);
    else root.setAttribute(attribute, value);
}

function toggleAttr(root: HTMLElement, attribute: string, on: boolean): void {
    if (on) root.setAttribute(attribute, "");
    else root.removeAttribute(attribute);
}
