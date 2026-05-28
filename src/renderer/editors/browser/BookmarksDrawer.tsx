import { useCallback, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Panel, Splitter } from "../../uikit";
import { LinkBody } from "../link-editor/LinkBody";
import {
    LinkActionBits,
    LinkBreadcrumbBits,
    LinkFooterBits,
} from "../link-editor";
import { BrowserBookmarks } from "./BrowserBookmarks";

// =============================================================================
// Styled — single styled(Panel) wrapper for drawer backdrop + slide-in animation
// (Rule 7 exception)
// =============================================================================

const BookmarksDrawerRoot = styled(Panel)({
    "[data-bookmarks-backdrop]": {
        flex: "1 1 auto",
        backgroundColor: "rgba(0, 0, 0, 0.3)",
    },
    "[data-bookmarks-panel-wrap]": {
        height: "100%",
        transform: "translateX(100%)",
        transition: "transform 80ms ease-in-out",
    },
    "&[data-open] [data-bookmarks-panel-wrap]": {
        transform: "translateX(0)",
    },
});

// =============================================================================
// Component
// =============================================================================

interface BookmarksDrawerProps {
    open: boolean;
    bookmarks: BrowserBookmarks;
    width: number;
    onChangeWidth: (width: number) => void;
    onClose: () => void;
}

export function BookmarksDrawer({
    open,
    bookmarks,
    width,
    onChangeWidth,
    onClose,
}: BookmarksDrawerProps) {
    const [isAnimating, setIsAnimating] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open && width === 0 && rootRef.current) {
            const containerWidth = rootRef.current.offsetWidth;
            onChangeWidth(Math.round(containerWidth * 0.6));
        }
    }, [open, width, onChangeWidth]);

    useEffect(() => {
        if (open) {
            const timer = setTimeout(() => setIsAnimating(true), 10);
            panelRef.current?.focus();
            return () => clearTimeout(timer);
        } else {
            setIsAnimating(false);
        }
    }, [open]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        },
        [onClose],
    );

    if (!open) return null;

    return (
        <BookmarksDrawerRoot
            name="bookmarks-drawer-root"
            ref={rootRef}
            position="absolute" top={0} right={0} bottom={0} left={0} zIndex={6}
            direction="row"
            data-open={isAnimating || undefined}
            onKeyDown={handleKeyDown}
            tabIndex={-1}
        >
            <div data-bookmarks-backdrop onClick={onClose} />
            <Splitter
                name="bookmarks-splitter"
                orientation="vertical"
                value={width}
                onChange={onChangeWidth}
                side="after"
                background="default"
                hoverBackground="light"
                border="none"
            />
            <div data-bookmarks-panel-wrap style={{ width, maxWidth: "90%" }}>
                <Panel
                    name="bookmarks-panel"
                    ref={panelRef}
                    direction="column" background="default" borderLeft
                    height="100%" overflow="hidden"
                >
                    <Panel
                        name="bookmarks-toolbar"
                        direction="row" align="center" gap="xs"
                        paddingX="md" paddingY="xs"
                        background="dark" borderBottom
                        shrink={false} minHeight={32}
                    >
                        <LinkBreadcrumbBits model={bookmarks.linkEditor} />
                        <Panel flex={1} />
                        <LinkActionBits model={bookmarks.linkEditor} />
                    </Panel>
                    <Panel name="bookmarks-editor-host" flex={1} overflow="hidden">
                        <LinkBody model={bookmarks.linkEditor} />
                    </Panel>
                    <Panel
                        name="bookmarks-footer"
                        direction="row" align="center" gap="xs"
                        paddingX="md" paddingY="xs"
                        background="dark" borderTop
                        shrink={false} minHeight={22}
                    >
                        <LinkFooterBits model={bookmarks.linkEditor} />
                    </Panel>
                </Panel>
            </div>
        </BookmarksDrawerRoot>
    );
}
