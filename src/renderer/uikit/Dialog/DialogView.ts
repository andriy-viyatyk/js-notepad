import { fillSlot, type SlotContent } from "../shared/fill-slot";
import {
    applyRestProps,
    bindRef,
    clearRestListeners,
    createRestPropsState,
    type RestPropsState,
} from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import type { DialogProps } from "./Dialog";

const FOCUSABLE_SELECTOR = [
    "button:not([disabled])",
    "[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
    "[contenteditable='true']",
].join(",");

function getFocusable(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
    );
}

function setOptionalDataAttribute(
    root: HTMLElement,
    name: string,
    value: string | undefined,
): void {
    if (value === undefined) root.removeAttribute(name);
    else root.setAttribute(name, value);
}

function getNativeChildren(children: SlotContent): Node | undefined {
    if (children instanceof Node) return children;
    if (!Array.isArray(children) || !children.every((child) => child instanceof Node)) {
        return undefined;
    }
    const fragment = document.createDocumentFragment();
    children.forEach((child) => {
        if (child instanceof Node) fragment.append(child);
    });
    return fragment;
}

export class DialogView extends VanillaView<DialogProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private childrenHost: HTMLSpanElement | undefined;
    private childrenCleanup: (() => void) | undefined;
    private refCleanup: (() => void) | undefined;
    private boundRef: DialogProps["ref"];
    private previousFocus: HTMLElement | null = null;
    private focusApplied = false;

    public constructor(props: DialogProps) {
        super(props, document.createElement("div"));
        this.root.classList.add("dialog-shell");
    }

    protected onMount(): void {
        this.previousFocus =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;

        this.applyProps(this.props);
        this.setRef(this.props.ref);
        this.listen(this.root, "click", this.onClick);
        this.listen(this.root, "keydown", this.onKeyDown);

        this.childrenHost = document.createElement("span");
        this.childrenHost.dataset.part = "react-slot";
        this.childrenHost.style.display = "contents";
        this.root.append(this.childrenHost);
        const children = this.props.children;
        const nativeChildren = getNativeChildren(children);
        this.childrenCleanup = fillSlot(this.childrenHost, nativeChildren);
        this.runFocusPass();

        this.own(() => this.childrenCleanup?.());
        this.own(() => this.clearRef());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: DialogProps): void {
        this.applyProps(props);
        this.setRef(props.ref);
        if (this.childrenHost) {
            const children = props.children;
            const nativeChildren = getNativeChildren(children);
            this.childrenCleanup = fillSlot(this.childrenHost, nativeChildren);
            this.runFocusPass();
        }
    }

    protected onDispose(): void {
        const previous = this.previousFocus;
        if (previous && document.contains(previous)) {
            previous.focus();
        }
        this.previousFocus = null;
    }

    private applyProps(props: DialogProps): void {
        const {
            name,
            position = "center",
            onBackdropClick: _onBackdropClick,
            autoFocus: _autoFocus,
            children: _children,
            onKeyDown: _onKeyDown,
            onClick: _onClick,
            ref: _ref,
            ...rest
        } = props;

        // Preserve the legacy rest-wins behavior for general attributes. Position is
        // intentionally restored afterward because it selects the component geometry.
        this.root.dataset.type = "dialog";
        setOptionalDataAttribute(this.root, "data-name", name);
        this.root.dataset.position = position;
        this.root.tabIndex = -1;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
        this.root.dataset.position = position;
        this.root.classList.add("dialog-shell");
    }

    private setRef(ref: DialogProps["ref"]): void {
        if (ref === this.boundRef) return;
        this.refCleanup?.();
        this.boundRef = ref;
        this.refCleanup = bindRef(this.root as HTMLDivElement, ref);
    }

    private clearRef(): void {
        this.refCleanup?.();
        this.refCleanup = undefined;
        this.boundRef = undefined;
    }

    private readonly runFocusPass = (): void => {
        if (this.focusApplied) return;
        this.focusApplied = true;
        if (!this.props.autoFocus) return;

        const focusables = getFocusable(this.root);
        if (focusables.length > 0) {
            focusables[0].focus();
        } else {
            this.root.focus();
        }
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        this.props.onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== "Tab") return;

        const focusables = getFocusable(this.root);
        if (focusables.length === 0) {
            event.preventDefault();
            this.root.focus();
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
            if (active === first || !this.root.contains(active)) {
                event.preventDefault();
                last.focus();
            }
        } else if (active === last || !this.root.contains(active)) {
            event.preventDefault();
            first.focus();
        }
    };

    private readonly onClick = (event: MouseEvent): void => {
        this.props.onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.target === this.root) this.props.onBackdropClick?.();
    };
}
