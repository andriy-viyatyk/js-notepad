import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Placement } from "@floating-ui/dom";
import { openMenu, type MenuHandle } from "./attach-menu";
import type { MenuItem } from "./types";

export interface WithMenuProps {
    /** Optional debug label forwarded to the inner Menu's `data-name`. Use to disambiguate
     *  multiple menus in DOM inspector output. Never used for styling. */
    name?: string;
    items: MenuItem[];
    /** Floating-ui placement. Default: "bottom-start". */
    placement?: Placement;
    /** [skidding, distance] — matches legacy WithPopupMenu default of [-4, 4]. */
    offset?: [number, number];
    /** Render-prop trigger. Receives a `setOpen` callback that opens/closes the menu
     *  anchored at the supplied element. Pass `null` to close. */
    children: (setOpen: (anchor: Element | null) => void) => React.ReactElement;
}

const DEFAULT_OFFSET: [number, number] = [-4, 4];

export function WithMenu({ name, items, placement = "bottom-start", offset = DEFAULT_OFFSET, children }: WithMenuProps) {
    const [anchor, setAnchor] = useState<Element | null>(null);
    const previousFocusRef = useRef<Element | null>(null);
    const menuHandleRef = useRef<MenuHandle | null>(null);

    const setOpen = useCallback((target: Element | null) => {
        if (target) {
            previousFocusRef.current = document.activeElement;
        }
        setAnchor(target);
    }, []);

    const handleClose = useCallback(() => {
        setAnchor(null);
        if (previousFocusRef.current instanceof HTMLElement) {
            previousFocusRef.current.focus();
        }
        previousFocusRef.current = null;
    }, []);

    useEffect(() => {
        if (!anchor) {
            menuHandleRef.current?.dispose();
            menuHandleRef.current = null;
            return;
        }

        const options = {
            name,
            items,
            placement,
            offset,
            onClose: handleClose,
        };
        if (!menuHandleRef.current) {
            menuHandleRef.current = openMenu(anchor, options);
        } else {
            menuHandleRef.current.update(options);
        }
    }, [anchor, handleClose, items, name, offset, placement]);

    useEffect(() => () => {
        menuHandleRef.current?.dispose();
        menuHandleRef.current = null;
    }, []);

    return (
        <>
            {children(setOpen)}
        </>
    );
}
