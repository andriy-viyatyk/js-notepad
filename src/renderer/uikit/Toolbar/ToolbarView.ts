import { fillSlot, type SlotContent } from "../shared/fill-slot";
import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type NativeHTMLAttributes,
    type RestPropsState,
} from "../shared/dom-props";
import { VanillaView } from "../shared/vanilla-view";
import { applyToolbarAttributes } from "./toolbar-style";
import "./Toolbar.css";

// --- Types ---

export interface ToolbarProps
    extends Omit<
        NativeHTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onKeyDown" | "onFocusCapture" | "children"
    > {
    onKeyDown?: (event: KeyboardEvent) => void;
    onFocusCapture?: (event: FocusEvent) => void;
    /**
     * ToolbarView owns the toolbar root's direct children and may replace them during an update.
     * Callers of an updatable toolbar must provide stable native nodes through this slot.
     */
    children?: NativeHTMLAttributes<HTMLDivElement>["children"];
    orientation?: "horizontal" | "vertical";
    background?: "default" | "light" | "dark";
    borderTop?: boolean;
    borderBottom?: boolean;
    disabled?: boolean;
    "aria-label"?: string;
}

function findFocusable(element: Element): HTMLElement | null {
    const candidates = element.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]',
    );
    const all = element.matches("button,input,select,textarea,a[href],[tabindex]")
        ? [element as HTMLElement, ...Array.from(candidates)]
        : Array.from(candidates);
    for (const candidate of all) {
        if (candidate.hasAttribute("disabled")) continue;
        if (candidate.getAttribute("tabindex") === "-1" && !candidate.hasAttribute("data-roving-host")) {
            continue;
        }
        return candidate;
    }
    return null;
}

export class ToolbarView extends VanillaView<ToolbarProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private childrenCleanup: (() => void) | undefined;
    private slotChildNodes: Node[] | undefined;
    private activeIndex = 0;
    private observer: MutationObserver | undefined;

    public constructor(props: ToolbarProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.applyConstructionRestProps(this.props);
        this.childrenCleanup = fillSlot(this.root, this.props.children as SlotContent);
        if (import.meta.env.DEV) this.snapshotSlotChildren();
        this.listen(this.root, "keydown", this.onKeyDown);
        this.listen(this.root, "focusin", this.onFocusIn, { capture: true });
        this.observer = new MutationObserver(() => this.applyRovingTabIndex());
        this.observer.observe(this.root, { childList: true, subtree: true });
        this.own(() => this.observer?.disconnect());
        this.own(() => this.childrenCleanup?.());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
        queueMicrotask(() => this.applyRovingTabIndex());
    }

    protected onUpdate(props: ToolbarProps): void {
        this.applyProps(props);
        if (import.meta.env.DEV) this.warnIfSlotRootMutated();
        this.childrenCleanup = fillSlot(this.root, props.children as SlotContent);
        if (import.meta.env.DEV) this.snapshotSlotChildren();
        this.applyRovingTabIndex();
    }

    protected onDispose(): void {
        this.observer?.disconnect();
        this.observer = undefined;
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: ToolbarProps): void {
        const {
            orientation = "horizontal",
            background = "dark",
            borderTop,
            borderBottom,
            disabled,
            children: _children,
            onKeyDown: _onKeyDown,
            onFocusCapture: _onFocusCapture,
            ..._rest
        } = props;

        applyToolbarAttributes(this.root, { orientation, background, borderTop, borderBottom, disabled });
        this.root.dataset.rovingHost = "";

    }

    private applyConstructionRestProps(props: ToolbarProps): void {
        const {
            orientation: _orientation,
            background: _background,
            borderTop: _borderTop,
            borderBottom: _borderBottom,
            disabled: _disabled,
            children: _children,
            onKeyDown: _onKeyDown,
            onFocusCapture: _onFocusCapture,
            ...rest
        } = props;
        // Toolbar's callbacks remain separate from its roving listeners.
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    private snapshotSlotChildren(): void {
        this.slotChildNodes = Array.from(this.root.childNodes);
    }

    private warnIfSlotRootMutated(): void {
        const expected = this.slotChildNodes;
        const current = this.root.childNodes;
        if (
            expected
            && (current.length !== expected.length
                || expected.some((node, index) => current[index] !== node))
        ) {
            console.warn("ToolbarView root children were mutated outside its children slot.");
        }
    }

    private collectStops(): HTMLElement[] {
        const stops: HTMLElement[] = [];
        for (const child of Array.from(this.root.children)) {
            const host = child.hasAttribute("data-roving-host")
                ? child as HTMLElement
                : child.querySelector<HTMLElement>("[data-roving-host]");
            if (host) {
                const inner = host.querySelector<HTMLElement>('[tabindex="0"]') ?? findFocusable(host);
                if (inner) stops.push(inner);
                continue;
            }
            const focusable = findFocusable(child);
            if (focusable) stops.push(focusable);
        }
        return stops;
    }

    private applyRovingTabIndex(): void {
        const stops = this.collectStops();
        if (this.props.disabled) {
            stops.forEach((stop) => { stop.tabIndex = -1; });
            return;
        }
        if (stops.length === 0) return;
        const index = Math.min(this.activeIndex, stops.length - 1);
        stops.forEach((stop, i) => { stop.tabIndex = i === index ? 0 : -1; });
    }

    private move(direction: 1 | -1): void {
        const stops = this.collectStops();
        if (stops.length === 0) return;
        let next = this.activeIndex;
        for (let step = 0; step < stops.length; step++) {
            next = (next + direction + stops.length) % stops.length;
            if (!stops[next].hasAttribute("disabled")) {
                stops[next].focus();
                this.activeIndex = next;
                this.applyRovingTabIndex();
                return;
            }
        }
    }

    private jump(target: "first" | "last"): void {
        const stops = this.collectStops();
        const indices = target === "first"
            ? stops.map((_stop, index) => index)
            : stops.map((_stop, index) => stops.length - index - 1);
        for (const index of indices) {
            if (!stops[index].hasAttribute("disabled")) {
                stops[index].focus();
                this.activeIndex = index;
                this.applyRovingTabIndex();
                return;
            }
        }
    }

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        const target = event.target as HTMLElement | null;
        const nestedHost = target?.closest("[data-roving-host]");
        if (nestedHost && nestedHost !== this.root && this.root.contains(nestedHost)) return;

        const orientation = this.props.orientation ?? "horizontal";
        const forward = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
        const backward = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
        if (event.key === forward) {
            event.preventDefault();
            this.move(1);
        } else if (event.key === backward) {
            event.preventDefault();
            this.move(-1);
        } else if (event.key === "Home") {
            event.preventDefault();
            this.jump("first");
        } else if (event.key === "End") {
            event.preventDefault();
            this.jump("last");
        }

        const callback = this.props.onKeyDown;
        callback?.(event);
    };

    private readonly onFocusIn = (event: FocusEvent): void => {
        const stops = this.collectStops();
        const target = event.target as Node | null;
        const index = stops.findIndex((stop) => stop === target || stop.contains(target));
        if (index >= 0) {
            this.activeIndex = index;
            this.applyRovingTabIndex();
        }
        this.props.onFocusCapture?.(event);
    };
}
