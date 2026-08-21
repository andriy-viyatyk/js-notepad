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

    private iconHost!: HTMLSpanElement;
    private labelHost!: HTMLSpanElement;
    private trailingHost!: HTMLSpanElement;

    private iconCleanup: (() => void) | undefined;
    private labelCleanup: (() => void) | undefined;
    private trailingCleanup: (() => void) | undefined;
    /** Which mechanism currently owns the label host — they must never both write to it. */
    private labelOwner: "slot" | "text" = "text";

    private tooltip: TooltipAttachment | undefined;
    private refCleanup: () => void = () => undefined;
    private boundRef: React.Ref<HTMLDivElement> | undefined;

    public constructor(props: ListItemProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.iconHost = document.createElement("span");
        this.iconHost.dataset.part = "icon";
        this.iconHost.style.display = "contents";

        this.labelHost = document.createElement("span");
        this.labelHost.className = "label";

        this.trailingHost = document.createElement("span");
        this.trailingHost.dataset.part = "trailing";
        this.trailingHost.style.display = "contents";

        this.root.append(this.iconHost, this.labelHost, this.trailingHost);

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
            variant = "select",
            selectionStyle = "check",
            showSelectionIcon = true,
            dropActive,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ref: _ref,
            ...rest
        } = props;

        const root = this.root;
        root.dataset.type = "list-item";
        setAttr(root, "data-name", name);
        setAttr(root, "id", id);
        root.dataset.variant = variant;
        root.dataset.selectionStyle = selectionStyle;
        toggleAttr(root, "data-selected", !!selected);
        toggleAttr(root, "data-active", !!active);
        toggleAttr(root, "data-disabled", !!disabled);
        toggleAttr(root, "data-drop-active", !!dropActive);
        root.setAttribute("role", "option");
        root.setAttribute("aria-selected", selected ? "true" : "false");
        setAttr(root, "aria-disabled", disabled ? "true" : undefined);

        this.setIcon(icon);
        this.setLabel(label, searchText);
        this.setTrailing(trailing, selected, showSelectionIcon, selectionStyle);

        // Residual props come last, matching the JSX order: a caller-supplied role or aria-* wins.
        applyRestProps(root, rest as Record<string, unknown>, this.restPropsState);
    }

    /**
     * An icon *name* becomes a DOM `svg` with no React root; anything else is a React node and goes
     * through `fillSlot`. Passing names through `fillSlot`'s React arm would put a root behind the
     * library's most common non-empty slot, which is the cost this whole design exists to avoid.
     */
    private setIcon(icon: IconRef | undefined): void {
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
        selected: boolean | undefined,
        showSelectionIcon: boolean,
        selectionStyle: "check" | "accent" | "focus",
    ): void {
        if (trailing !== undefined && trailing !== null) {
            this.trailingCleanup = fillSlot(this.trailingHost, trailing);
            return;
        }
        // Transcribed from the React default-trailing expression, unchanged.
        if (selected && showSelectionIcon && selectionStyle !== "focus") {
            const name = selectionStyle === "accent" ? "chevron-right" : "check";
            this.trailingCleanup = fillSlot(this.trailingHost, createIconElement(name));
            return;
        }
        this.trailingCleanup = fillSlot(this.trailingHost, null);
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
        this.iconCleanup?.();
        this.labelCleanup?.();
        this.trailingCleanup?.();
        this.iconCleanup = undefined;
        this.labelCleanup = undefined;
        this.trailingCleanup = undefined;
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
