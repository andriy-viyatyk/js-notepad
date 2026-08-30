import type { VirtualElement } from "@floating-ui/dom";
import { TPopperModel } from "./types";
import { closePopper, showPopper } from "./Poppers";
import { MenuView } from "../../../uikit/Menu/MenuView";
import type { MenuProps } from "../../../uikit/Menu/MenuModel";
import type { MenuItem } from "../../../uikit/Menu";
import { CopyIcon, CursorIcon, EmptyIcon } from "../../../theme/icons";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { TComponentState } from "../../../core/state/state";
import { overlayRegistry } from "../../../uikit/shared/overlayRegistry";
import { restoreFocus } from "../../../uikit/shared/focus-restore";
import { api } from "../../../../ipc/renderer/api";
import type { DialogViewProps } from "../dialog-view-registry";
import { registerDialogView } from "../dialog-view-registry";

const defaultAppPopupMenuState = {
    x: 0,
    y: 0,
    items: [] as MenuItem[],
    skipInspect: false,
};

type AppPopupMenuState = typeof defaultAppPopupMenuState;
type AppPopupMenuPositionState = Pick<AppPopupMenuState, "items" | "x" | "y">;

class AppPopupMenuModel extends TPopperModel<AppPopupMenuState, void> {
    addDefaultMenus = async () => {
        const savedSelection = window.getSelection();
        const selText = savedSelection?.toString();
        const activeElement = document.activeElement;
        const isInputOrTextareaFocused =
            activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement;
        const isEditableDivFocused =
            activeElement instanceof HTMLDivElement &&
            (activeElement.contentEditable === "true" ||
                activeElement.contentEditable === "plaintext-only");
        const clipboardText =
            isInputOrTextareaFocused || isEditableDivFocused
                ? await navigator.clipboard.readText()
                : "";
        let savedRange = null as Range | null;
        if (clipboardText && isEditableDivFocused) {
            if (savedSelection && savedSelection.rangeCount > 0) {
                savedRange = savedSelection.getRangeAt(0).cloneRange();
            }
        }

        this.state.update((s) => {
            if (clipboardText) {
                s.items.unshift({
                    label: "Paste",
                    onClick: () => {
                        if (
                            activeElement instanceof HTMLInputElement ||
                            activeElement instanceof HTMLTextAreaElement
                        ) {
                            activeElement.focus();
                            document.execCommand(
                                "insertText",
                                false,
                                clipboardText
                            );
                        } else if (
                            activeElement instanceof HTMLDivElement &&
                            (activeElement.contentEditable === "true" ||
                                activeElement.contentEditable ===
                                    "plaintext-only")
                        ) {
                            // activeElement.focus();
                            if (savedSelection && savedRange) {
                                const textNode =
                                    document.createTextNode(clipboardText);

                                // Delete any selected content before inserting
                                savedRange.deleteContents();

                                // Insert the text node at the cursor position
                                savedRange.insertNode(textNode);

                                // Collapse the range to the end of the newly inserted text
                                savedRange.setStartAfter(textNode);
                                savedRange.setEndAfter(textNode);

                                // Update the selection to the new cursor position
                                savedSelection.removeAllRanges();
                                savedSelection.addRange(savedRange);
                            }

                            // Dispatch input event so contentEditable handlers (e.g., TextAreaField) update
                            activeElement.dispatchEvent(new Event("input", { bubbles: true }));
                        }
                    },
                    icon: CopyIcon.createElement({}),
                });
            }

            if (selText) {
                s.items.unshift({
                    label: "Copy",
                    onClick: () => {
                        navigator.clipboard.writeText(selText ?? "");
                    },
                    icon: CopyIcon.createElement({}),
                    startGroup: true,
                });
            }

            if (!s.skipInspect) {
                s.items.push({
                    label: "Inspect",
                    startGroup: s.items.length > 0,
                    onClick: () => {
                        const { x, y } = this.state.get();
                        api.inspectElement(x, y);
                    },
                    icon: CursorIcon.createElement({}),
                });
            }

            const anyIcon = s.items.some((item) => Boolean(item.icon));
            if (anyIcon) {
                s.items.forEach((item) => {
                    if (!item.icon) {
                        item.icon = EmptyIcon.createElement({});
                    }
                });
            }
        });
    };
}

const defaultOffset = [8, 0] as [number, number];
const showAppPopupMenuId = Symbol("AppPopupMenu");

class AppPopupMenuView extends VanillaView<DialogViewProps> {
    private readonly model: AppPopupMenuModel;
    private readonly menuView: MenuView;
    private readonly elementRef: VirtualElement;
    private registeredRef: HTMLDivElement | null = null;

    public constructor(props: DialogViewProps) {
        const model = props.model as AppPopupMenuModel;
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.model = model;
        this.elementRef = {
            getBoundingClientRect: () => {
                const { x, y } = model.state.get();
                return {
                    x,
                    y,
                    top: y,
                    left: x,
                    bottom: y,
                    right: x,
                    width: 0,
                    height: 0,
                };
            },
        };
        this.menuView = this.child(new MenuView(this.menuProps(model.state.get())));
    }

    protected onMount(): void {
        this.menuView.mount();
        this.bind(
            this.model.state,
            (state) => ({ items: state.items, x: state.x, y: state.y }),
            (state) => this.menuView.update(this.menuProps(state)),
        );
    }

    private menuProps(state: AppPopupMenuPositionState): MenuProps & {
        ref: (element: HTMLDivElement | null) => void;
    } {
        return {
            name: "app-popup-menu",
            open: true,
            items: state.items,
            elementRef: this.elementRef,
            offset: defaultOffset,
            onClose: () => { void this.model.close(); },
            ref: this.setMenuRef,
        };
    }

    // Callback ref: register the Popover's floated root with overlayRegistry so
    // page-level Tooltips are suppressed while the menu is open. Tooltips inside
    // this subtree (e.g. on menu items themselves) remain allowed via
    // overlayRegistry.isSuppressed's `contains()` check.
    private readonly setMenuRef = (el: HTMLDivElement | null): void => {
        if (this.registeredRef) {
            overlayRegistry.unregister(this.registeredRef);
        }
        this.registeredRef = el;
        if (el) overlayRegistry.register(el);
    };
}

registerDialogView(showAppPopupMenuId, AppPopupMenuView);

export interface ShowAppPopupMenuOptions {
    /** Skip the default "Inspect" menu item (e.g. when the caller provides its own). */
    skipInspect?: boolean;
}

/** Close any currently open app popup menu. */
export const closeAppPopupMenu = () => {
    closePopper(showAppPopupMenuId);
};

export const showAppPopupMenu = async (
    x: number,
    y: number,
    items: MenuItem[],
    options?: ShowAppPopupMenuOptions,
) => {
    // Close any existing popup menu before showing a new one.
    // This handles cases where the close-on-click-outside doesn't fire
    // (e.g. right-click inside a webview goes through IPC, not DOM).
    closePopper(showAppPopupMenuId);

    // Save focused element to restore after menu closes
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const state = new TComponentState(defaultAppPopupMenuState);
    state.update((s) => {
        s.x = x;
        s.y = y;
        s.items = [...items];
        s.skipInspect = options?.skipInspect || false;
    });
    const model = new AppPopupMenuModel(state);
    await model.addDefaultMenus();
    if (!model.state.get().items.length) {
        return;
    }
    await showPopper<void>({
        viewId: showAppPopupMenuId,
        model,
    });

    // Restore focus after menu closes
    if (previouslyFocused) restoreFocus(previouslyFocused);
};
