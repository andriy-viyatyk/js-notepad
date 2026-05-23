import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
    Breadcrumb,
    Button,
    CollapsiblePanel,
    CollapsiblePanelStack,
    IconButton,
    Input,
    Panel,
    Splitter,
    Text,
} from "../../uikit";
import { HighlightedTextProvider } from "../../uikit/shared/highlight";
import { showAppPopupMenu } from "../../ui/dialogs";
import { pageNavigatorToggled, panelExpanded } from "../../core/state/events";
import {
    CloseIcon, PlusIcon,
    ViewLandscapeBigIcon, ViewLandscapeIcon, ViewListIcon, ViewPortraitBigIcon, ViewPortraitIcon,
} from "../../theme/icons";
import { defaultLinkEditorState, LinkViewModel, LinkEditorState } from "./LinkViewModel";
import { LinkEditorProps, LinkViewMode } from "./linkTypes";
import { LinkCategoryPanel } from "./panels/LinkCategoryPanel";
import { LinkTagsPanel } from "./panels/LinkTagsPanel";
import { LinkHostnamesPanel } from "./panels/LinkHostnamesPanel";
import { LinkItemList } from "./LinkItemList";
import { LinkItemTiles } from "./LinkItemTiles";
import { PinnedLinksPanel } from "./PinnedLinksPanel";
import { hasTraitDragData, getTraitDragData, resolveTraits } from "../../core/traits";
import { LINK } from "./linkTraits";
import { EditorError } from "../base/EditorError";
import { useContentViewModel } from "../base/useContentViewModel";

// =============================================================================
// View mode labels
// =============================================================================

const VIEW_MODE_LABELS: Record<LinkViewMode, string> = {
    "list": "List",
    "tiles-landscape": "Landscape",
    "tiles-landscape-big": "Landscape (Large)",
    "tiles-portrait": "Portrait",
    "tiles-portrait-big": "Portrait (Large)",
};

const VIEW_MODE_ICONS: Record<LinkViewMode, React.ReactNode> = {
    "list": <ViewListIcon />,
    "tiles-landscape": <ViewLandscapeIcon />,
    "tiles-landscape-big": <ViewLandscapeBigIcon />,
    "tiles-portrait": <ViewPortraitIcon />,
    "tiles-portrait-big": <ViewPortraitBigIcon />,
};

const VIEW_MODE_ORDER: LinkViewMode[] = [
    "list",
    "tiles-landscape",
    "tiles-landscape-big",
    "tiles-portrait",
    "tiles-portrait-big",
];

// =============================================================================
// Helpers
// =============================================================================

const noopUnsubscribe = () => () => {};
const getDefaultState = () => defaultLinkEditorState;

/** All link-editor sidebar panels — always shown regardless of data availability. */
const LINK_PANELS = ["link-category", "link-tags", "link-hostnames"];

// =============================================================================
// Component
// =============================================================================

export function LinkEditor(props: LinkEditorProps) {
    const { model, swapLayout } = props;
    const vm = useContentViewModel<LinkViewModel>(model, "link-view");

    const pageState: LinkEditorState = useSyncExternalStore(
        vm ? (cb) => vm.state.subscribe(cb) : noopUnsubscribe,
        vm ? () => vm.state.get() : getDefaultState,
    );

    // ── PageNavigator state via global event ────────────────────────────

    const hasPage = !!model.page;
    const pageId = model.page?.id;

    const [isNavigatorOpen, setIsNavigatorOpen] = useState(() =>
        model.page?.pageNavigatorModel?.state.get().open ?? false
    );

    useEffect(() => {
        if (!pageId) return;
        const subs = [
            pageNavigatorToggled.subscribe((event) => {
                if (event?.pageId === pageId) {
                    setIsNavigatorOpen(event.isOpen);
                }
            }),
            panelExpanded.subscribe((event) => {
                if (!vm || event?.pageId !== pageId) return;
                // Map sidebar panel IDs to LinkViewModel's expandedPanel values
                const map: Record<string, string> = {
                    "link-category": "categories",
                    "link-tags": "tags",
                    "link-hostnames": "hostnames",
                };
                const expandedPanel = map[event.panelId];
                if (expandedPanel) {
                    vm.setExpandedPanel(expandedPanel);
                }
            }),
        ];
        return () => subs.forEach((s) => s.unsubscribe());
    }, [pageId, vm]);

    // ── Secondary editor registration ───────────────────────────────────

    const showPanelsInSidebar = hasPage && isNavigatorOpen;

    useEffect(() => {
        if (!vm) return;

        if (!showPanelsInSidebar) {
            if (model.secondaryEditor?.length) {
                model.secondaryEditor = undefined;
            }
            return;
        }

        model.secondaryEditor = LINK_PANELS;

        // Expand the sidebar panel matching LinkViewModel's current expandedPanel
        const reverseMap: Record<string, string> = {
            "categories": "link-category",
            "tags": "link-tags",
            "hostnames": "link-hostnames",
        };
        const panelToExpand = reverseMap[pageState.expandedPanel] ?? "link-category";
        model.page?.expandPanel(panelToExpand);

        return () => {
            // Don't clear panels if this model was demoted to secondary-only
            // (still in secondaryEditors[] but no longer mainEditor)
            const page = model.page;
            if (page && page.mainEditor !== model && page.secondaryEditors.includes(model)) {
                return;
            }
            model.secondaryEditor = undefined;
        };
    }, [vm, showPanelsInSidebar]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Grid and view mode ──────────────────────────────────────────────

    // Update grid when filtered links change (React rendering concern)
    useEffect(() => {
        vm?.gridModel?.update({ all: true });
    }, [vm, pageState.filteredLinks]);

    const allLinks = pageState.data.links;
    const links = pageState.filteredLinks;
    const viewMode = vm?.getViewMode() ?? "list";
    const pinnedLinks = vm?.getPinnedLinks() ?? [];
    const pinnedLinkIds = useMemo(
        () => new Set(pageState.data.state.pinnedLinks ?? []),
        [pageState.data.state.pinnedLinks],
    );
    const pinnedPanelWidth = pageState.data.state.pinnedPanelWidth ?? 100;

    // ── Center panel drop zone ──────────────────────────────────────────
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
            vm.importLinks(items);
        }
    }, [vm]);

    const showViewModeMenu = useCallback((e: React.MouseEvent) => {
        if (!vm) return;
        const rect = e.currentTarget.getBoundingClientRect();
        showAppPopupMenu(rect.left, rect.bottom + 2, VIEW_MODE_ORDER.map((mode) => ({
            label: VIEW_MODE_LABELS[mode],
            icon: VIEW_MODE_ICONS[mode],
            selected: mode === viewMode,
            onClick: () => vm.setViewMode(mode),
        })));
    }, [vm, viewMode]);

    if (!vm) return null;

    if (pageState.error) {
        return (
            <Panel name="link-editor-error-root" flex={1} overflow="hidden">
                <EditorError>{pageState.error}</EditorError>
            </Panel>
        );
    }

    // Portal refs: use props when provided, otherwise fall back to model refs
    const toolbarFirst = props.toolbarRefFirst !== undefined ? props.toolbarRefFirst : model.editorToolbarRefFirst;
    const toolbarLast = props.toolbarRefLast !== undefined ? props.toolbarRefLast : model.editorToolbarRefLast;
    const footerLast = props.footerRefLast !== undefined ? props.footerRefLast : model.editorFooterRefLast;

    return (
        <>
            {Boolean(toolbarFirst) &&
                createPortal(
                    pageState.expandedPanel === "tags" ? (
                        <Breadcrumb
                            name="link-editor-breadcrumb-tags"
                            rootLabel="Tags"
                            value={pageState.selectedTag}
                            onChange={vm.setSelectedTag}
                            separators=":"
                            trailingParentSeparator
                        />
                    ) : pageState.expandedPanel === "hostnames" ? (
                        <Breadcrumb
                            name="link-editor-breadcrumb-hostnames"
                            rootLabel="Hostnames"
                            value={pageState.selectedHostname}
                            onChange={vm.setSelectedHostname}
                        />
                    ) : (
                        <Breadcrumb
                            name="link-editor-breadcrumb-categories"
                            rootLabel="Categories"
                            value={pageState.selectedCategory}
                            onChange={vm.setSelectedCategory}
                        />
                    ),
                    toolbarFirst!,
                )}
            {Boolean(toolbarLast) &&
                createPortal(
                    <>
                        <Button
                            name="link-editor-add"
                            size="sm"
                            variant="link"
                            title="Add Link"
                            icon={<PlusIcon />}
                            onClick={() => vm.showLinkDialog()}
                        >
                            Add Link
                        </Button>
                        <Button
                            name="link-editor-view-mode"
                            size="sm"
                            variant="ghost"
                            title="View Mode"
                            icon={VIEW_MODE_ICONS[viewMode]}
                            onClick={showViewModeMenu}
                        >
                            {VIEW_MODE_LABELS[viewMode]}
                        </Button>
                        <Input
                            name="link-editor-search"
                            tone="accent"
                            width={180}
                            value={pageState.searchText}
                            onChange={vm.setSearchText}
                            placeholder="Search..."
                            endSlot={
                                pageState.searchText ? (
                                    <IconButton
                                        name="link-editor-search-clear"
                                        size="sm"
                                        title="Clear search"
                                        icon={<CloseIcon />}
                                        onClick={vm.clearSearch}
                                    />
                                ) : undefined
                            }
                        />
                    </>,
                    toolbarLast!,
                )}
            <Panel
                name="link-editor-root"
                ref={(el) => { vm.containerElement = el; }}
                tabIndex={-1}
                direction={swapLayout ? "row-reverse" : "row"}
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
                            setActivePanel={vm.setExpandedPanel}
                        >
                            <CollapsiblePanel id="categories" name="categories" title="Categories">
                                <LinkCategoryPanel vm={vm} useOpenRawLink={false} />
                            </CollapsiblePanel>
                            <CollapsiblePanel id="tags" name="tags" title="Tags">
                                <LinkTagsPanel vm={vm} />
                            </CollapsiblePanel>
                            <CollapsiblePanel id="hostnames" name="hostnames" title="Hostnames">
                                <LinkHostnamesPanel vm={vm} />
                            </CollapsiblePanel>
                        </CollapsiblePanelStack>
                        <Splitter
                            name="link-editor-left-splitter"
                            orientation="vertical"
                            value={pageState.leftPanelWidth}
                            onChange={vm.setLeftPanelWidth}
                            side={swapLayout ? "after" : "before"}
                            border={swapLayout ? "before" : "after"}
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
                                model={vm}
                                selectedLinkId={pageState.selectedLinkId}
                                pinnedLinkIds={pinnedLinkIds}
                            />
                        ) : (
                            <LinkItemTiles
                                links={links}
                                model={vm}
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
                            value={pinnedPanelWidth}
                            onChange={vm.setPinnedPanelWidth}
                            side={swapLayout ? "before" : "after"}
                            border={swapLayout ? "after" : "before"}
                        />
                        <PinnedLinksPanel
                            pinnedLinks={pinnedLinks}
                            model={vm}
                            selectedLinkId={pageState.selectedLinkId}
                            width={pinnedPanelWidth}
                        />
                    </>
                )}
            </Panel>
            {Boolean(footerLast) &&
                createPortal(
                    <span>
                        {links.length === allLinks.length
                            ? `${allLinks.length} links`
                            : `${links.length} of ${allLinks.length} links`}
                    </span>,
                    footerLast!,
                )}
        </>
    );
}
