import ReactDOM from "react-dom";
import { useMemo } from "react";

import { TPopperModel } from "./types";
import { showPopper } from "./Poppers";
import { VirtualElement } from "@floating-ui/react";
import { MenuItem, PopupMenu } from "../../../components/overlay/PopupMenu";
import { PopperProps } from "../../../components/overlay/Popper";
import { CopyIcon, CursorIcon, EmptyIcon } from "../../../theme/icons";
import { DefaultView, ViewPropsRO, Views } from "../../../core/state/view";
import { TComponentState } from "../../../core/state/state";
import { api } from "../../../../ipc/renderer/api";

const defaultAppPopupMenuState = {
    x: 0,
    y: 0,
    items: [] as MenuItem[],
    poperProps: undefined as PopperProps | undefined,
};

type AppPopupMenuState = typeof defaultAppPopupMenuState;

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
                        }
                    },
                    icon: <CopyIcon />,
                });
            }

            if (selText) {
                s.items.unshift({
                    label: "Copy",
                    onClick: () => {
                        navigator.clipboard.writeText(selText ?? "");
                    },
                    icon: <CopyIcon />,
                    startGroup: true,
                });
            }

            s.items.push({
                label: "Inspect",
                startGroup: s.items.length > 0,
                onClick: () => {
                    const { x, y } = this.state.get();
                    api.inspectElement(x, y);
                },
                icon: <CursorIcon />,
            });

            const anyIcon = s.items.some((item) => Boolean(item.icon));
            if (anyIcon) {
                s.items.forEach((item) => {
                    if (!item.icon) {
                        item.icon = <EmptyIcon />;
                    }
                });
            }
        });
    };
}

const defaultOffset = [8, 0] as [number, number];
const showAppPopupMenuId = Symbol("AppPopupMenu");

function AppPopupMenu({ model }: ViewPropsRO<AppPopupMenuModel>) {
    const { items, x, y, poperProps } = model.state.use();
    const el = useMemo<VirtualElement | Element>(() => {
        const res: VirtualElement = {
            getBoundingClientRect() {
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
        return res;
    }, [x, y]);

    return ReactDOM.createPortal(
        <PopupMenu
            open
            items={items}
            elementRef={el}
            onClose={() => model.close()}
            offset={defaultOffset}
            {...poperProps}
        />,
        document.body
    );
}

Views.registerView(showAppPopupMenuId, AppPopupMenu as DefaultView);

export const showAppPopupMenu = async (
    x: number,
    y: number,
    items: MenuItem[],
    poperProps?: PopperProps
) => {
    const state = new TComponentState(defaultAppPopupMenuState);
    state.update((s) => {
        s.x = x;
        s.y = y;
        s.items = items;
        s.poperProps = poperProps;
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
};
