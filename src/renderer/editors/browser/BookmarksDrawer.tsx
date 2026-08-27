import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, Splitter } from "../../uikit";
import { mountVanilla } from "../../uikit/shared/mount";
import color from "../../theme/color";
import { LinkActionView, LinkBreadcrumbView, LinkFooterView } from "../link-editor";
import { LinkBodyView } from "../link-editor/LinkBody";
import { BrowserBookmarks } from "./BrowserBookmarks";
import { BrowserSecondaryViews } from "./BrowserSecondaryViews";

const backdropStyle: React.CSSProperties = { flex: "1 1 auto", backgroundColor: color.background.backdrop };
const panelWrapStyle = (width: number, open: boolean): React.CSSProperties => ({
    width,
    maxWidth: "90%",
    height: "100%",
    transform: open ? "translateX(0)" : "translateX(100%)",
    transition: "transform 80ms ease-in-out",
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
        <Panel
            name="bookmarks-drawer-root"
            ref={rootRef}
            position="absolute" top={0} right={0} bottom={0} left={0} zIndex={6}
            direction="row"
            onKeyDown={handleKeyDown}
            tabIndex={-1}
        >
            <div data-bookmarks-backdrop onClick={onClose} style={backdropStyle} />
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
            <div data-bookmarks-panel-wrap style={panelWrapStyle(width, isAnimating)}>
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
                        {mountVanilla(LinkBreadcrumbView, { model: bookmarks.linkEditor })}
                        <Panel flex={1} />
                        {mountVanilla(LinkActionView, { model: bookmarks.linkEditor })}
                    </Panel>
                    <Panel name="bookmarks-editor-host" direction="row" flex={1} overflow="hidden">
                        <BrowserSecondaryViews host={bookmarks.panelHost} />
                        <Panel flex={1} overflow="hidden">
                            {mountVanilla(LinkBodyView, { model: bookmarks.linkEditor })}
                        </Panel>
                    </Panel>
                    <Panel
                        name="bookmarks-footer"
                        direction="row" align="center" gap="xs"
                        paddingX="md" paddingY="xs"
                        background="dark" borderTop
                        shrink={false} minHeight={22}
                    >
                        {mountVanilla(LinkFooterView, { model: bookmarks.linkEditor })}
                    </Panel>
                </Panel>
            </div>
        </Panel>
    );
}
