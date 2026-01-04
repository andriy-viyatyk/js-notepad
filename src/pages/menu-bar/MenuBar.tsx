import styled from "@emotion/styled";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { TComponentModel, useComponentModel } from "../../common/classes/model";
import { Button } from "../../controls/Button";
import { List } from "../../controls/List";
import { api } from "../../ipc/renderer/api";
import { pagesModel } from "../../model/pages-model";
import color from "../../theme/color";
import { ArrowRightIcon, NewWindowIcon, OpenFileIcon } from "../../theme/icons";
import { OpenTabsList } from "./OpenTabsList";

const MenuBarRoot = styled("div")({
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    zIndex: 6,
    "& .menu-bar-content": {
        height: "100%",
        display: "flex",
        flexDirection: "column",
        width: 600,
        maxWidth: "90%",
        borderRight: `1px solid ${color.border.default}`,
        borderTopRightRadius: 4,
        borderBottomRightRadius: 4,
        overflow: "hidden",
        backgroundColor: color.background.dark,
        transform: "translateX(-100%)",
        transition: "transform 50ms ease-in-out",
        "& .menu-bar-header": {
            display: "flex",
            alignItems: "center",
            columnGap: 4,
        },
        "& .menu-bar-splitter": {
            height: 400,
            flex: "1 1 auto",
            display: "flex",
            flexDirection: "row",
            "& .menu-bar-panel": {
                flex: "1 1 50%",
                width: "50%",
                display: "flex",
                flexDirection: "column",
                padding: 2,
            },
            "& .menu-bar-left": {
                borderRight: `1px solid ${color.border.light}`,
                "& .list-item": {
                    boxSizing: "border-box",
                    borderRadius: 4,
                    border: `1px solid transparent`,
                    "&:hover": {
                        backgroundColor: color.background.dark,
                        borderColor: color.border.default,
                    },
                },
                "& .list-item.selected": {
                    backgroundColor: color.background.default,
                    borderColor: color.border.default,
                },
            },
        },
    },
    "&.open .menu-bar-content": {
        transform: "translateX(0)", // Slide in when open
    },
    "& button svg": {
        width: 20,
        height: 20,
    }
});

interface MenuBarProps {
    open?: boolean;
    onClose?: () => void;
}

const defaultMenuBarState = {
    leftItems: ["Open Tabs", "Recent Files"],
    leftItem: "Open Tabs",
};

type MenuBarState = typeof defaultMenuBarState;

class MenuBarModel extends TComponentModel<MenuBarState, MenuBarProps> {
    private initialized = false;

    init = () => {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
    };

    contentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    contentKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            this.props.onClose?.();
        }
    };

    openFile = async () => {
        this.props.onClose?.();
        pagesModel.openFileWithDialog();
    };

    newWindow = async () => {
        this.props.onClose?.();
        api.openNewWindow();
    };

    setLeftItem = (item: string) => {
        this.state.update((s) => {
            s.leftItem = item;
        });
    };

    getLeftItemsHovered = (item: string) => {
        return item === this.state.get().leftItem;
    };
}

export function MenuBar(props: MenuBarProps) {
    const model = useComponentModel(props, MenuBarModel, defaultMenuBarState);
    const state = model.state.use();
    const [isAnimating, setIsAnimating] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (props.open) {
            model.init();
            const timer = setTimeout(() => setIsAnimating(true), 10);
            contentRef.current?.focus();
            return () => clearTimeout(timer);
        } else {
            setIsAnimating(false);
        }
    }, [props.open]);

    if (!props.open) {
        return null;
    }

    return (
        <MenuBarRoot
            className={clsx("menu-bar-backdrop", { open: isAnimating })}
            onClick={props.onClose}
        >
            <div
                ref={contentRef}
                className="menu-bar-content"
                onClick={model.contentClick}
                onKeyDown={model.contentKeyDown}
                tabIndex={0}
            >
                <div className="menu-bar-header">
                    <Button
                        size="medium"
                        type="icon"
                        background="dark"
                        onClick={model.openFile}
                        title="Open File"
                    >
                        <OpenFileIcon />
                    </Button>
                    <Button
                        size="medium"
                        type="icon"
                        background="dark"
                        onClick={model.newWindow}
                        title="New Window"
                    >
                        <NewWindowIcon />
                    </Button>
                </div>
                <div className="menu-bar-splitter">
                    <div className="menu-bar-panel menu-bar-left">
                        <List
                            options={state.leftItems}
                            getSelected={model.getLeftItemsHovered}
                            onClick={model.setLeftItem}
                            selectedIcon={<ArrowRightIcon />}
                            rowHeight={28}
                            itemMarginY={1}
                        />
                    </div>
                    <div className="menu-bar-panel">
                        {state.leftItem === "Open Tabs" && (
                            <OpenTabsList onClose={props.onClose} />
                        )}
                    </div>
                </div>
            </div>
        </MenuBarRoot>
    );
}
