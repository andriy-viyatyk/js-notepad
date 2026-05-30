import { useLayoutEffect, useRef, ReactNode } from "react";
import { createPortal } from "react-dom";
import { GroupContainer } from "./GroupContainer";

interface AppPageManagerProps {
    /** All page IDs in display order */
    pageIds: string[];
    /** Active page ID */
    activeId: string;
    /** Grouped page ID (the partner of the active page, if grouped) */
    groupedActiveId?: string;
    /** Grouping map: left page ID → right page ID */
    grouping: Map<string, string>;
    /** Set of left page IDs in compare mode — hides splitter and right placeholder */
    compareModeIds?: Set<string>;
    /** Render function for page content */
    renderPage: (id: string) => ReactNode;
    /** Optional CSS class for the container */
    className?: string;
}

/**
 * Portal-based page manager with grouping support.
 *
 * Each page gets a stable placeholder div that is never destroyed until the
 * page closes. Placeholders are NEVER reparented (moved between containers)
 * because that causes iframes/webviews to reload. Instead, grouping is
 * achieved purely via CSS absolute positioning on the same container.
 *
 * React content renders into each placeholder via createPortal().
 */
export function AppPageManager({
    pageIds,
    activeId,
    groupedActiveId,
    grouping,
    compareModeIds,
    renderPage,
    className,
}: AppPageManagerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const placeholdersRef = useRef(new Map<string, HTMLDivElement>());
    const groupContainersRef = useRef(new Map<string, GroupContainer>());
    const hasBeenActiveRef = useRef(new Set<string>());

    // Track which pages have been activated (for deferred rendering)
    if (activeId) hasBeenActiveRef.current.add(activeId);
    if (groupedActiveId) hasBeenActiveRef.current.add(groupedActiveId);

    // Create placeholders eagerly during render so createPortal finds them
    const placeholders = placeholdersRef.current;
    for (const id of pageIds) {
        if (!placeholders.has(id)) {
            const el = document.createElement("div");
            applyStandaloneStyle(el);
            el.style.display = "none";
            placeholders.set(id, el);
        }
    }

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const groupContainers = groupContainersRef.current;

        const currentIds = new Set(pageIds);
        const currentGroupIds = new Set<string>();

        // 1. Remove placeholders for closed pages
        for (const [id, el] of placeholders) {
            if (!currentIds.has(id)) {
                if (el.parentNode) el.parentNode.removeChild(el);
                placeholders.delete(id);
                hasBeenActiveRef.current.delete(id);
            }
        }

        // 2. Determine which groupings exist now
        for (const [leftId, rightId] of grouping) {
            if (currentIds.has(leftId) && currentIds.has(rightId)) {
                currentGroupIds.add(leftId);
            }
        }

        // 3. Dispose group containers that no longer exist or whose right page changed
        for (const [leftId, gc] of groupContainers) {
            const rightId = grouping.get(leftId);
            const expectedRightEl = rightId && currentGroupIds.has(leftId)
                ? placeholders.get(rightId)
                : undefined;
            if (!expectedRightEl || gc.rightPlaceholder !== expectedRightEl) {
                gc.dispose();
                groupContainers.delete(leftId);
            }
        }

        // 4. Create new group containers (CSS-based, no reparenting)
        for (const leftId of currentGroupIds) {
            if (!groupContainers.has(leftId)) {
                const rightId = grouping.get(leftId);
                if (!rightId) continue;
                const leftEl = placeholders.get(leftId);
                const rightEl = placeholders.get(rightId);
                const gc = new GroupContainer(container, leftEl, rightEl);
                groupContainers.set(leftId, gc);
            }
        }

        // 5. Append placeholders that aren't in the DOM yet
        for (const id of pageIds) {
            const el = placeholders.get(id);
            if (el && !el.parentNode) {
                container.appendChild(el);
            }
        }

        // 6. Update visibility
        const activeGroupId = findGroupId(activeId, grouping);

        for (const [id, el] of placeholders) {
            const groupId = findGroupId(id, grouping);
            if (groupId !== undefined) {
                const isActiveGroup = groupId === activeGroupId;
                const inCompareMode = compareModeIds ? compareModeIds.has(groupId) : false;
                if (!isActiveGroup) {
                    el.style.display = "none";
                } else if (inCompareMode) {
                    const isLeft = grouping.has(id);
                    if (isLeft) {
                        applyStandaloneStyle(el);
                        el.style.display = "flex";
                    } else {
                        el.style.display = "none";
                    }
                } else {
                    el.style.display = "flex";
                }
            } else {
                el.style.display = id === activeId ? "flex" : "none";
            }
        }

        // Update compare mode state and splitter visibility for each group
        for (const [leftId, gc] of groupContainers) {
            const isActive = leftId === activeGroupId;
            const inCompareMode = compareModeIds ? compareModeIds.has(leftId) : false;

            if (gc.compareMode !== inCompareMode) {
                gc.setCompareMode(inCompareMode);
            }

            gc.splitter.element.style.display = isActive && !inCompareMode ? "" : "none";
        }
    }, [pageIds, activeId, groupedActiveId, grouping, compareModeIds, placeholders]);

    // Build the list of portals to render
    const hasBeenActive = hasBeenActiveRef.current;
    const portals: ReactNode[] = [];

    for (const id of pageIds) {
        if (!hasBeenActive.has(id)) continue;
        const placeholder = placeholders.get(id);
        if (!placeholder) continue;
        portals.push(createPortal(renderPage(id), placeholder, id));
    }

    return (
        <>
            <div ref={containerRef} className={className} />
            {portals}
        </>
    );
}

/** Apply styles for a standalone (non-grouped) page placeholder.
 *  Clears individual positioning properties first so `inset: 0` takes full effect. */
function applyStandaloneStyle(el: HTMLDivElement) {
    Object.assign(el.style, {
        top: "",
        bottom: "",
        left: "",
        right: "",
        width: "",
        minWidth: "",
        maxWidth: "",
        flex: "",
        flexShrink: "",
    });
    Object.assign(el.style, {
        position: "absolute",
        inset: "0",
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
    });
}

/** Find the group left ID for a page (returns the left ID if the page is part of a group). */
function findGroupId(
    pageId: string,
    grouping: Map<string, string>,
): string | undefined {
    if (grouping.has(pageId)) return pageId;
    for (const [leftId, rightId] of grouping) {
        if (rightId === pageId) return leftId;
    }
    return undefined;
}
