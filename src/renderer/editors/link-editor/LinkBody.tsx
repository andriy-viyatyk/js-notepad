import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, Splitter, Text } from "../../uikit";
import { HighlightedTextProvider } from "../../uikit/shared/highlight";
import { hasTraitDragData, getTraitDragData, LINK, resolveTraits } from "../../core/traits";
import { LinkItemList } from "./LinkItemList";
import { LinkItemTiles } from "./LinkItemTiles";
import { PinnedLinksPanel } from "./PinnedLinksPanel";
import { EditorError } from "../base/EditorError";
import type { LinkEditor } from "./LinkEditor";

export function LinkBody({ model }: { model: LinkEditor }) {
    const pageState = model.state.use((s) => ({
        searchText: s.searchText,
        selectedLinkId: s.selectedLinkId,
        error: s.error,
        filteredLinks: s.filteredLinks,
        allLinks: s.data.links,
        pinnedLinksRaw: s.data.state.pinnedLinks,
        pinnedPanelWidth: s.data.state.pinnedPanelWidth ?? 100,
        // Derived inside the selector on purpose: the mode is stored under
        // `data.state.*ViewMode`, which nothing else here reads, so calling
        // getViewMode() outside the selector left the body frozen on the old
        // mode until some other selected field happened to change.
        viewMode: model.getViewMode(s),
    }));

    // The sidebar active-panel → `expandedPanel` sync lives on the model
    // (`LinkEditor.onPanelExpanded`), not here — it must keep working while the
    // editor is demoted to a sidebar and this body is unmounted.

    // Queue focus event: refocus container element on `focus` event.
    model.queue.use((ev) => {
        if (ev.type === "focus") model.refocus();
    });

    // Update grid when filtered links change (React rendering concern preserved).
    useEffect(() => {
        model.gridModel?.update({ all: true });
    }, [model, pageState.filteredLinks]);

    const viewMode = pageState.viewMode;
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
            <HighlightedTextProvider value={pageState.searchText}>
                <Panel
                    name="link-editor-center"
                    direction="column"
                    flex={1}
                    width={0}
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
