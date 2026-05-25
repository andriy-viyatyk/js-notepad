import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    CollapsiblePanel,
    CollapsiblePanelStack,
    Panel,
    Splitter,
    Text,
} from "../../uikit";
import { HighlightedTextProvider } from "../../uikit/shared/highlight";
import { useOptionalState } from "../../core/state/state";
import { pageNavigatorToggled, panelExpanded } from "../../core/state/events";
import { hasTraitDragData, getTraitDragData, resolveTraits } from "../../core/traits";
import { LINK } from "./linkTraits";
import { LinkCategoryPanel } from "./panels/LinkCategoryPanel";
import { LinkTagsPanel } from "./panels/LinkTagsPanel";
import { LinkHostnamesPanel } from "./panels/LinkHostnamesPanel";
import { LinkItemList } from "./LinkItemList";
import { LinkItemTiles } from "./LinkItemTiles";
import { PinnedLinksPanel } from "./PinnedLinksPanel";
import { EditorError } from "../base/EditorError";
import type { LinkEditor } from "./LinkEditor";

/**
 * EPIC-028 / US-555 — native v4 Link editor body. Replaces today's
 * `LinkView.tsx` view (preserved for browser-embed + future notebook-embed).
 *
 * - `useContentViewModel` retired — `editor` is the v4 model directly.
 * - `useSyncExternalStore` retired — `editor.state.use((s) => ({...}))` selector.
 * - Toolbar / footer portals retired — `LinkToolbarBits` / `LinkFooterBits`
 *   compose into TextChrome slots in `./index.tsx`.
 * - LK6 — sidebar panel registration: view watches `pageNavigatorModel.state`
 *   and calls `editor.setSidebarPanels(open)`. Cleanup function disappears
 *   entirely (model handles "demote survives" via `beforeNavigateAway`).
 */
export function LinkBody({ model }: { model: LinkEditor }) {
    const pageState = model.state.use((s) => ({
        leftPanelWidth: s.leftPanelWidth,
        expandedPanel: s.expandedPanel,
        searchText: s.searchText,
        selectedLinkId: s.selectedLinkId,
        error: s.error,
        filteredLinks: s.filteredLinks,
        allLinks: s.data.links,
        pinnedLinksRaw: s.data.state.pinnedLinks,
        pinnedPanelWidth: s.data.state.pinnedPanelWidth ?? 100,
    }));

    const pageId = model.page?.id;

    // LK6 — translate sidebar open/close into model state. Pure view dispatcher.
    const isNavigatorOpen = useOptionalState(
        model.page?.pageNavigatorModel?.state,
        (s) => s.open,
        false,
    );
    useEffect(() => {
        model.setSidebarPanels(isNavigatorOpen);
    }, [isNavigatorOpen, model]);

    // panelExpanded global event → maps sidebar panel IDs to expandedPanel state
    // (today's pattern preserved verbatim).
    useEffect(() => {
        if (!pageId) return;
        const subs = [
            pageNavigatorToggled.subscribe(() => {
                // No-op: isNavigatorOpen above tracks the state. Subscribe just
                // so we re-render if needed (kept for parity with today).
            }),
            panelExpanded.subscribe((event) => {
                if (event?.pageId !== pageId) return;
                const map: Record<string, string> = {
                    "link-category": "categories",
                    "link-tags": "tags",
                    "link-hostnames": "hostnames",
                };
                const expandedPanel = map[event.panelId];
                if (expandedPanel) {
                    model.setExpandedPanel(expandedPanel);
                }
            }),
        ];
        return () => subs.forEach((s) => s.unsubscribe());
    }, [pageId, model]);

    // Queue focus event (LK10): refocus container element on `focus` event.
    model.queue.use((ev) => {
        if (ev.type === "focus") model.refocus();
    });

    // Update grid when filtered links change (React rendering concern preserved).
    useEffect(() => {
        model.gridModel?.update({ all: true });
    }, [model, pageState.filteredLinks]);

    const viewMode = model.getViewMode();
    const pinnedLinks = model.getPinnedLinks();
    const pinnedLinkIds = useMemo(
        () => new Set(pageState.pinnedLinksRaw ?? []),
        [pageState.pinnedLinksRaw],
    );

    // Center panel drop zone — preserved verbatim from today's LinkView.
    const [centerDragOver, setCenterDragOver] = useState(false);
    const centerDragCount = useRef(0);

    const handleCenterDragEnter = useCallback((e: React.DragEvent) => {
        centerDragCount.current++;
        if (hasTraitDragData(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setCenterDragOver(true);
        }
    }, []);

    const handleCenterDragOver = useCallback((e: React.DragEvent) => {
        if (hasTraitDragData(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        }
    }, []);

    const handleCenterDragLeave = useCallback(() => {
        centerDragCount.current--;
        if (centerDragCount.current <= 0) {
            centerDragCount.current = 0;
            setCenterDragOver(false);
        }
    }, []);

    const handleCenterDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        centerDragCount.current = 0;
        setCenterDragOver(false);
        const payload = getTraitDragData(e.dataTransfer);
        if (!payload) return;
        const traits = resolveTraits(payload.typeId);
        const linkTrait = traits?.get(LINK);
        if (!linkTrait) return;
        const items = linkTrait.getItems(payload.data);
        if (items.length) {
            model.importLinks(items);
        }
    }, [model]);

    if (pageState.error) {
        return (
            <Panel name="link-editor-error-root" flex={1} overflow="hidden">
                <EditorError>{pageState.error}</EditorError>
            </Panel>
        );
    }

    const showPanelsInSidebar = isNavigatorOpen;
    const links = pageState.filteredLinks;
    const allLinks = pageState.allLinks;

    return (
        <Panel
            name="link-editor-root"
            ref={(el) => { model.containerElement = el; }}
            tabIndex={-1}
            direction="row"
            overflow="hidden"
            flex={1}
        >
            {!showPanelsInSidebar && (
                <>
                    <CollapsiblePanelStack
                        name="link-editor-left-panels"
                        width={pageState.leftPanelWidth}
                        minWidth={100}
                        maxWidth="80%"
                        activePanel={pageState.expandedPanel}
                        setActivePanel={model.setExpandedPanel}
                    >
                        <CollapsiblePanel id="categories" name="categories" title="Categories">
                            <LinkCategoryPanel vm={model} useOpenRawLink={false} />
                        </CollapsiblePanel>
                        <CollapsiblePanel id="tags" name="tags" title="Tags">
                            <LinkTagsPanel vm={model} />
                        </CollapsiblePanel>
                        <CollapsiblePanel id="hostnames" name="hostnames" title="Hostnames">
                            <LinkHostnamesPanel vm={model} />
                        </CollapsiblePanel>
                    </CollapsiblePanelStack>
                    <Splitter
                        name="link-editor-left-splitter"
                        orientation="vertical"
                        value={pageState.leftPanelWidth}
                        onChange={model.setLeftPanelWidth}
                        side="before"
                        border="after"
                    />
                </>
            )}
            <HighlightedTextProvider value={pageState.searchText}>
                <Panel
                    name="link-editor-center"
                    direction="column"
                    flex={1}
                    minWidth={0}
                    overflow="hidden"
                    position="relative"
                    border={centerDragOver || undefined}
                    borderColor={centerDragOver ? "active" : undefined}
                    onDragEnter={handleCenterDragEnter}
                    onDragOver={handleCenterDragOver}
                    onDragLeave={handleCenterDragLeave}
                    onDrop={handleCenterDrop}
                >
                    {allLinks.length === 0 ? (
                        <Panel
                            name="link-editor-empty"
                            direction="column"
                            flex={1}
                            align="center"
                            justify="center"
                            gap="xl"
                            padding="xl"
                        >
                            <Text size="xxl" color="default">Links</Text>
                            <Text color="light">No links yet</Text>
                            <Text color="light">Click "Add Link" to create your first link</Text>
                        </Panel>
                    ) : links.length === 0 ? (
                        <Panel
                            name="link-editor-empty-filtered"
                            direction="column"
                            flex={1}
                            align="center"
                            justify="center"
                            gap="xl"
                            padding="xl"
                        >
                            <Text color="light">No links match the current filter</Text>
                        </Panel>
                    ) : viewMode === "list" ? (
                        <LinkItemList
                            links={links}
                            model={model}
                            selectedLinkId={pageState.selectedLinkId}
                            pinnedLinkIds={pinnedLinkIds}
                        />
                    ) : (
                        <LinkItemTiles
                            links={links}
                            model={model}
                            viewMode={viewMode}
                            selectedLinkId={pageState.selectedLinkId}
                            pinnedLinkIds={pinnedLinkIds}
                        />
                    )}
                </Panel>
            </HighlightedTextProvider>
            {pinnedLinks.length > 0 && (
                <>
                    <Splitter
                        name="link-editor-pinned-splitter"
                        orientation="vertical"
                        value={pageState.pinnedPanelWidth}
                        onChange={model.setPinnedPanelWidth}
                        side="after"
                        border="before"
                    />
                    <PinnedLinksPanel
                        pinnedLinks={pinnedLinks}
                        model={model}
                        selectedLinkId={pageState.selectedLinkId}
                        width={pageState.pinnedPanelWidth}
                    />
                </>
            )}
        </Panel>
    );
}
