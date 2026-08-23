import React from "react";
import {
    applyRestProps,
    bindRef,
    clearRestListeners,
    createRestPropsState,
    type RestPropsState,
} from "../shared/react-compat";
import { fillSlot } from "../shared/fill-slot";
import { highlightInto } from "../shared/highlight";
import { createIconElement, isIconName } from "../shared/slots";
import type { IconRef, SlotText } from "../shared/slots";
import { attachTooltip, type TooltipAttachment, type TooltipOptions } from "../Tooltip";
import { VanillaView } from "../shared/vanilla-view";
import type { ListItemProps } from "./ListItem";
import "./ListItem.css";

/**
 * The list row, and the single source of truth for its DOM.
 *
 * Two callers drive this class, which is the point: `ListBoxView` builds one per pooled cell and
 * calls `update()` as that cell is re-pointed at different rows, while `ListItem.tsx` is a
 * `mountVanilla` shim over the same class for the two app-layer JSX call sites. A second
 * implementation of a row with six state attributes, three slots, three variants x three selection
 * styles and a drop state would drift, and nothing in the build would catch it.
 *
 * **Slot hosts are stable for the view's lifetime.** Each of the three slots owns its own host
 * element and is written only through `fillSlot` (or, for a string label, `highlightInto`), because
 * `fillSlot` caches per-host state and re-renders an existing React root rather than building a new
 * one. Combined with the cell pool never resetting a recycled element, that is what makes a scrolled
 * list create React roots only during warm-up and none at all once it settles.
 *
 * The icon and trailing hosts are `display: contents`, so they are not layout boxes: the icon `svg`
 * remains a flex item of the row and its `flex-shrink: 0` still applies. They exist because
 * `fillSlot` needs a host it owns outright — a documented, layout-neutral deviation from React's
 * DOM, which put the `svg` directly under the row.
 */
export class ListItemView extends VanillaView<ListItemProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();

    private checkHost: HTMLSpanElement | undefined;
    private iconHost: HTMLSpanElement | undefined;
    private labelHost: HTMLSpanElement | undefined;
    private trailingHost: HTMLSpanElement | undefined;

    private checkGlyph: SVGElement | undefined;
    /** Last value written to the check glyph, so a re-render does not rebuild the `svg`. */
    private appliedChecked: boolean | undefined;

    private iconCleanup: (() => void) | undefined;
    private appliedIconElement: Node | undefined;
    private labelCleanup: (() => void) | undefined;
    private trailingCleanup: (() => void) | undefined;
    private appliedTrailingElement: Node | undefined;
    private appliedRowClass = "";
    /** Which mechanism currently owns the label host — they must never both write to it. */
    private labelOwner: "slot" | "text" = "text";

    private tooltip: TooltipAttachment | undefined;
    private refCleanup: () => void = () => undefined;
    private boundRef: React.Ref<HTMLDivElement> | undefined;

    public constructor(props: ListItemProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        // Created but not attached: a row has no checkbox unless `checkbox` says so. Unlike the icon
        // and trailing hosts this is a real box (`inline-flex`, 16x16, `flex-shrink: 0`), because the
        // Emotion block it replaces sized `[data-part='check']` itself.
        this.checkHost = document.createElement("span");
        this.checkHost.dataset.part = "check";

        this.iconHost = document.createElement("span");
        this.iconHost.dataset.part = "icon";
        this.iconHost.style.display = "contents";

        this.labelHost = document.createElement("span");
        this.labelHost.className = "label";

        this.trailingHost = document.createElement("span");
        this.trailingHost.dataset.part = "trailing";
        this.trailingHost.style.display = "contents";

        this.root.append(this.iconHost, this.labelHost, this.trailingHost);

        this.listen(this.root, "dragstart", (event) => this.props.drag?.onDragStart?.(event));
        this.listen(this.root, "dragend", (event) => this.props.drag?.onDragEnd?.(event));
        this.listen(this.root, "dragenter", (event) => this.props.drag?.onDragEnter?.(event));
        this.listen(this.root, "dragover", (event) => this.props.drag?.onDragOver?.(event));
        this.listen(this.root, "dragleave", (event) => this.props.drag?.onDragLeave?.(event));
        this.listen(this.root, "drop", (event) => this.props.drag?.onDrop?.(event));

        // Attached unconditionally, even when there is no tooltip yet: `update` handles the
        // empty/disabled arms, so a row that gains a tooltip mid-life needs no attach/detach churn.
        this.tooltip = attachTooltip(this.root, this.tooltipOptions(this.props));

        this.applyProps(this.props);
        this.setRef(this.props.ref);

        this.own(() => this.tooltip?.dispose());
        this.own(() => this.clearSlots());
        this.own(() => this.clearRef());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: ListItemProps): void {
        this.applyProps(props);
        this.tooltip?.update(this.tooltipOptions(props));
        this.setRef(props.ref);
    }

    private applyProps(props: ListItemProps): void {
        const {
            name,
            id,
            icon,
            iconElement,
            rowClass,
            label,
            searchText,
            selected,
            active,
            disabled,
            // Consumed by the tooltip attachment, never forwarded to the DOM.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            tooltip: _tooltip,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            tooltipDelayShow: _tooltipDelayShow,
            trailing,
            trailingElement,
            drag,
            variant = "select",
            selectionStyle = "check",
            showSelectionIcon = true,
            checkbox,
            dropActive,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ref: _ref,
            ...rest
        } = props;

        const checkHost = this.checkHost;
        const iconHost = this.iconHost;
        const labelHost = this.labelHost;
        const trailingHost = this.trailingHost;
        if (!checkHost || !iconHost || !labelHost || !trailingHost) return;

        const root = this.root;
        root.dataset.type = "list-item";
        this.setRowClass(rowClass);
        setAttr(root, "data-name", name);
        setAttr(root, "id", id);
        root.dataset.variant = variant;
        root.dataset.selectionStyle = selectionStyle;
        toggleAttr(root, "data-selected", !!selected);
        toggleAttr(root, "data-active", !!active);
        toggleAttr(root, "data-disabled", !!disabled);
        toggleAttr(root, "data-drop-active", !!dropActive);
        // Read by `ListItem.css` to drop the `browse` hover background: a checkbox row's hover
        // feedback already arrives through `[data-active]`, because its list sets `activeIndex` on
        // mouseenter. See the rule for why keeping both would highlight two rows.
        toggleAttr(root, "data-checkbox", !!checkbox);
        root.setAttribute("role", "option");
        root.setAttribute("aria-selected", selected ? "true" : "false");
        setAttr(root, "aria-disabled", disabled ? "true" : undefined);
        if (drag?.draggable) root.setAttribute("draggable", "true");
        else root.removeAttribute("draggable");

        this.setCheck(!!checkbox, !!selected);
        this.setIcon(icon, iconElement);
        this.setLabel(label, searchText);
        this.setTrailing(
            trailing,
            trailingElement,
            selected,
            showSelectionIcon,
            selectionStyle,
            !!checkbox,
        );

        // Residual props come last, matching the JSX order: a caller-supplied role or aria-* wins.
        applyRestProps(root, rest as Record<string, unknown>, this.restPropsState);
    }

    /**
     * The leading checkbox glyph of a `checkbox` row.
     *
     * `createIconElement` is called directly rather than through `fillSlot` because an `IconName`
     * never needs a React root, and the host is owned outright by this view. The gate on
     * `appliedChecked` is what keeps a scroll from rebuilding an `svg` for every pooled cell on every
     * repaint — the pool re-points a cell at a new row far more often than a row's checked state
     * actually changes.
     */
    private setCheck(enabled: boolean, checked: boolean): void {
        if (!enabled) {
            if (this.checkGlyph) {
                this.checkHost.remove();
                this.checkHost.replaceChildren();
                this.checkGlyph = undefined;
                this.appliedChecked = undefined;
            }
            return;
        }
        if (!this.checkHost.isConnected) {
            this.root.insertBefore(this.checkHost, this.iconHost);
        }
        if (this.checkGlyph && this.appliedChecked === checked) return;
        const next = createIconElement(checked ? "checked" : "unchecked");
        if (this.checkGlyph) this.checkHost.replaceChild(next, this.checkGlyph);
        else this.checkHost.append(next);
        this.checkGlyph = next;
        this.appliedChecked = checked;
    }

    /**
     * An icon *name* becomes a DOM `svg` with no React root; anything else is a React node and goes
     * through `fillSlot`. Passing names through `fillSlot`'s React arm would put a root behind the
     * library's most common non-empty slot, which is the cost this whole design exists to avoid.
     */
    private setIcon(icon: IconRef | undefined, iconElement: Node | undefined): void {
        if (iconElement !== undefined) {
            if (this.appliedIconElement === iconElement) return;
            this.appliedIconElement = iconElement;
            this.iconCleanup = fillSlot(this.iconHost, iconElement);
            return;
        }
        this.appliedIconElement = undefined;
        // A string is always an icon-name attempt, never content: `renderIcon` returned `null` for
        // an unknown name, so an unknown name must render nothing here too. Falling through to
        // `fillSlot` would write the name into the row as literal text.
        if (typeof icon === "string") {
            const element = isIconName(icon) ? createIconElement(icon) : null;
            this.iconCleanup = fillSlot(this.iconHost, element);
            return;
        }
        this.iconCleanup = fillSlot(this.iconHost, icon ?? null);
    }

    private setLabel(label: React.ReactNode, searchText: string | undefined): void {
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

    private setTrailing(
        trailing: React.ReactNode,
        trailingElement: Node | undefined,
        selected: boolean | undefined,
        showSelectionIcon: boolean,
        selectionStyle: "check" | "accent" | "focus",
        checkbox: boolean,
    ): void {
        if (trailingElement !== undefined) {
            if (this.appliedTrailingElement === trailingElement) return;
            this.appliedTrailingElement = trailingElement;
            this.trailingCleanup = fillSlot(this.trailingHost, trailingElement);
            return;
        }
        this.appliedTrailingElement = undefined;
        if (trailing !== undefined && trailing !== null) {
            this.trailingCleanup = fillSlot(this.trailingHost, trailing);
            return;
        }
        // Transcribed from the React default-trailing expression, plus the `checkbox` arm: a leading
        // box already reports the selected state, and the row it replaces had no trailing check.
        if (selected && showSelectionIcon && selectionStyle !== "focus" && !checkbox) {
            const name = selectionStyle === "accent" ? "chevron-right" : "check";
            this.trailingCleanup = fillSlot(this.trailingHost, createIconElement(name));
            return;
        }
        this.trailingCleanup = fillSlot(this.trailingHost, null);
    }

    private setRowClass(rowClass: string | undefined): void {
        if (this.appliedRowClass === (rowClass ?? "")) return;

        if (this.appliedRowClass) {
            this.root.classList.remove(...this.appliedRowClass.split(/\s+/).filter(Boolean));
        }
        if (rowClass) {
            this.root.classList.add(...rowClass.split(/\s+/).filter(Boolean));
        }
        this.appliedRowClass = rowClass ?? "";
    }

    /**
     * `null`, `false` and `""` all mean "no tooltip" in the public prop, but `attach-tooltip` only
     * treats the first two as empty — so the empty string has to become `disabled`.
     */
    private tooltipOptions(props: ListItemProps): TooltipOptions {
        const content: SlotText | undefined = props.tooltip;
        const empty = content == null || content === false || content === "";
        return {
            content: empty ? null : content,
            disabled: empty,
            delayShow: props.tooltipDelayShow,
        };
    }

    private setRef(ref: React.Ref<HTMLDivElement> | undefined): void {
        if (ref === this.boundRef) return;
        this.refCleanup();
        this.boundRef = ref;
        this.refCleanup = bindRef(this.root, ref);
    }

    private clearRef(): void {
        this.refCleanup();
        this.refCleanup = () => undefined;
        this.boundRef = undefined;
    }

    private clearSlots(): void {
        // The check glyph has no `fillSlot` cleanup of its own — it is plain DOM this view owns — but
        // it is reset here so a disposed view holds no element references.
        this.checkHost.replaceChildren();
        this.checkGlyph = undefined;
        this.appliedChecked = undefined;
        this.iconCleanup?.();
        this.labelCleanup?.();
        this.trailingCleanup?.();
        this.iconCleanup = undefined;
        this.appliedIconElement = undefined;
        this.labelCleanup = undefined;
        this.trailingCleanup = undefined;
        this.appliedTrailingElement = undefined;
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
