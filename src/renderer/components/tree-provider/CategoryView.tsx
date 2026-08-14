import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { useComponentModel } from "../../core/state/model";
import { RenderGridModel } from "../../uikit/RenderGrid";
import { Input } from "../../uikit/Input";
import { IconButton } from "../../uikit/IconButton";
import {
    CloseIcon,
    ViewListIcon, ViewLandscapeIcon, ViewLandscapeBigIcon,
    ViewPortraitIcon, ViewPortraitBigIcon,
} from "../../theme/icons";
import { showAppPopupMenu } from "../../ui/dialogs";
import color from "../../theme/color";
import { Panel } from "../../uikit/Panel/Panel";
import { Spacer } from "../../uikit/Spacer/Spacer";
import { LinksList } from "../../editors/link-editor/LinksList";
import { LinksTiles } from "../../editors/link-editor/LinksTiles";
import type { ILink } from "../../api/types/io.tree";
import {
    CategoryViewModel,
    CategoryViewProps,
    CategoryViewMode,
    defaultCategoryViewState,
} from "./CategoryViewModel";

export type { CategoryViewProps } from "./CategoryViewModel";
export type { CategoryViewMode } from "./CategoryViewModel";

// =============================================================================
// View mode constants
// =============================================================================

const VIEW_MODE_LABELS: Record<CategoryViewMode, string> = {
    "list": "List",
    "tiles-landscape": "Landscape",
    "tiles-landscape-big": "Landscape (Large)",
    "tiles-portrait": "Portrait",
    "tiles-portrait-big": "Portrait (Large)",
};

const VIEW_MODE_ICONS: Record<CategoryViewMode, React.ReactNode> = {
    "list": <ViewListIcon />,
    "tiles-landscape": <ViewLandscapeIcon />,
    "tiles-landscape-big": <ViewLandscapeBigIcon />,
    "tiles-portrait": <ViewPortraitIcon />,
    "tiles-portrait-big": <ViewPortraitBigIcon />,
};

const VIEW_MODE_ORDER: CategoryViewMode[] = [
    "list", "tiles-landscape", "tiles-landscape-big",
    "tiles-portrait", "tiles-portrait-big",
];

const CategoryViewRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    overflow: "hidden",

    "& .cv-content": {
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },

    "& .cv-footer-count": {
        color: color.text.light,
        padding: "0 4px",
        fontSize: 13,
    },

    "& .cv-error": {
        padding: 8,
        fontSize: 12,
        color: color.misc.red,
    },

    "& .cv-empty": {
        padding: 8,
        fontSize: 12,
        color: color.text.light,
    },

    "& .cv-loading": {
        padding: 8,
        fontSize: 12,
        color: color.text.light,
    },

    // Whitespace drop target — an inset ring around the whole view, so it reads as "into this
    // folder" and never competes with a folder row's own highlight.
    "&[data-drop-active]": {
        outline: `2px solid ${color.border.active}`,
        outlineOffset: -2,
    },
});

const getIdByHref = (link: ILink) => link.href;

export function CategoryView(props: CategoryViewProps) {
    const model = useComponentModel(
        props,
        CategoryViewModel,
        defaultCategoryViewState,
    );
    const state = model.state.use();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const gridModelRef = useRef<RenderGridModel | null>(null);

    const viewMode = props.viewMode ?? "list";
    const isTileMode = viewMode !== "list";
    const { filteredItems, selectedHrefs } = state;
    const { provider, multiSelect } = props;

    // In multiSelect mode the set replaces `selectedId` as the source of the per-row selected
    // state; leaving it undefined otherwise keeps every other consumer on the single-select path.
    const selectedIds = useMemo(
        () => (multiSelect ? new Set(selectedHrefs) : undefined),
        [multiSelect, selectedHrefs],
    );

    // RenderGrid does not repaint a row on its own — selection and drop-target changes must
    // be pushed.
    useEffect(() => {
        gridModelRef.current?.update({ all: true });
    }, [filteredItems, props.selectedHref, selectedIds, state.dropTargetHref]);

    useEffect(() => {
        gridModelRef.current?.scrollToRow(0);
        gridModelRef.current?.update({ all: true });
    }, [viewMode]);

    const handleGridModel = useCallback((gm: RenderGridModel | null) => {
        gridModelRef.current = gm;
    }, []);

    const handleSelect = useCallback((link: ILink, e?: React.MouseEvent) => {
        model.onItemClick(link, e);
    }, [model]);

    const handleDoubleClick = useCallback((link: ILink) => {
        model.onItemDoubleClick(link);
    }, [model]);

    const handleContextMenu = useCallback((e: React.MouseEvent, link: ILink) => {
        model.onItemContextMenu(link, e);
    }, [model]);

    // Row drop targets — only folders take a drop of their own; a file row is the same target
    // as whitespace (the open folder), so its events are left to bubble to the root.
    const acceptsDrops = model.acceptsDrops;
    const handleItemDragEnter = useCallback((link: ILink, e: React.DragEvent) => {
        if (link.isDirectory) model.onDragEnter(link, e);
    }, [model]);
    const handleItemDragOver = useCallback((link: ILink, e: React.DragEvent) => {
        if (link.isDirectory) model.onDragOver(link, e);
    }, [model]);
    const handleItemDragLeave = useCallback((link: ILink, e: React.DragEvent) => {
        if (link.isDirectory) model.onDragLeave(link, e);
    }, [model]);
    const handleItemDrop = useCallback((link: ILink, e: React.DragEvent) => {
        if (link.isDirectory) model.onDrop(link, e);
    }, [model]);

    // Drag out. Every row hands off to a native OS drag (`startOsFileDrag`) — see
    // model.handleOsDragStart for why that beats the in-process trait drag here. `dragSourceId`
    // is what makes the rows draggable at all; the trait payload it names is only reached if the
    // override declines (nothing draggable), so it never carries a real drag in this view.
    const allowsDrag = model.allowsDrag;
    const handleDragStartOverride = useCallback((link: ILink, e: React.DragEvent) => {
        return model.handleOsDragStart(link, e);
    }, [model]);

    // Whitespace: the root covers the gaps below/between items and the "Empty folder"
    // placeholder — dropping into an empty folder is the likeliest first use of this.
    const handleRootDragEnter = useCallback((e: React.DragEvent) => {
        model.onDragEnter(null, e);
    }, [model]);
    const handleRootDragOver = useCallback((e: React.DragEvent) => {
        model.onDragOver(null, e);
    }, [model]);
    const handleRootDragLeave = useCallback((e: React.DragEvent) => {
        model.onDragLeave(null, e);
    }, [model]);
    const handleRootDrop = useCallback((e: React.DragEvent) => {
        model.onDrop(null, e);
    }, [model]);

    // `useCallback` must be called unconditionally; the ternary then chooses
    // whether to forward the callback to the child or omit it.
    const editCallback = useCallback((link: ILink) => { model.renameItem(link); }, [model]);
    const deleteCallback = useCallback((link: ILink) => { model.deleteItemAction(link); }, [model]);
    const handleEdit = provider.writable && provider.rename ? editCallback : undefined;
    const handleDelete = provider.writable && provider.deleteItem ? deleteCallback : undefined;

    const { onViewModeChange } = props;
    const handleViewModeMenu = useCallback((e: React.MouseEvent) => {
        if (!onViewModeChange) return;
        const rect = e.currentTarget.getBoundingClientRect();
        showAppPopupMenu(rect.left, rect.bottom + 2, VIEW_MODE_ORDER.map((mode) => ({
            label: VIEW_MODE_LABELS[mode],
            icon: VIEW_MODE_ICONS[mode],
            selected: mode === viewMode,
            onClick: () => onViewModeChange(mode),
        })));
    }, [viewMode, onViewModeChange]);

    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            model.setSearchText("");
        }
    }, [model]);

    const handleSearchClose = useCallback(() => {
        model.setSearchText("");
        searchInputRef.current?.blur();
    }, [model]);

    // Error state
    if (state.error) {
        return (
            <CategoryViewRoot>
                <div className="cv-error">{state.error}</div>
            </CategoryViewRoot>
        );
    }

    // Loading state
    if (state.loading && state.items.length === 0) {
        return (
            <CategoryViewRoot>
                <div className="cv-loading">Loading...</div>
            </CategoryViewRoot>
        );
    }

    const totalCount = state.items.length;
    const filteredCount = filteredItems.length;

    const toolbarElement = (
        <>
            <Input
                ref={searchInputRef}
                value={state.searchText}
                onChange={model.setSearchText}
                placeholder="Search..."
                onKeyDown={handleSearchKeyDown}
                endSlot={state.searchText
                    ? <IconButton
                          size="sm"
                          title="Clear"
                          onClick={handleSearchClose}
                          icon={<CloseIcon />}
                      />
                    : undefined}
            />
            {props.onViewModeChange && (
                <IconButton
                    size="sm"
                    title="View Mode"
                    onClick={handleViewModeMenu}
                    icon={VIEW_MODE_ICONS[viewMode]}
                />
            )}
        </>
    );

    return (
        // tabIndex lets the root receive the keys that bubble up from the focused item grid
        // (Ctrl+A / Delete / Escape). The search Input renders through toolbarPortalRef into
        // the page toolbar — outside this subtree — so typing there never reaches onKeyDown.
        <CategoryViewRoot
            onContextMenu={model.onBackgroundContextMenu}
            onKeyDown={model.onKeyDown}
            tabIndex={-1}
            // The whitespace highlight means "the open folder is the target" — shown only
            // while the drag is inside the view and no folder row has claimed it.
            data-drop-active={
                (state.dropOverView && !state.dropTargetHref) || undefined
            }
            onDragEnter={acceptsDrops ? handleRootDragEnter : undefined}
            onDragOver={acceptsDrops ? handleRootDragOver : undefined}
            onDragLeave={acceptsDrops ? handleRootDragLeave : undefined}
            onDrop={acceptsDrops ? handleRootDrop : undefined}
        >
            {props.toolbarPortalRef && createPortal(toolbarElement, props.toolbarPortalRef)}
            <div className="cv-content">
                {filteredItems.length === 0 ? (
                    <div className="cv-empty">
                        {state.searchText ? "No matching items" : "Empty folder"}
                    </div>
                ) : isTileMode ? (
                    // LinksTiles has no focus scope of its own (LinksList brings one), so wrap
                    // it — without a focusable element the keyboard actions never fire in tile
                    // mode, and the focus-aware selection color has nothing to key off.
                    <Panel
                        name="links-tiles-focus-scope"
                        direction="column"
                        flex={1}
                        minWidth={0}
                        minHeight={0}
                        overflow="hidden"
                        tabIndex={0}
                        data-focus-selection=""
                    >
                        <LinksTiles
                            links={filteredItems}
                            viewMode={viewMode as Exclude<CategoryViewMode, "list">}
                            selectedId={props.selectedHref ?? undefined}
                            selectedIds={selectedIds}
                            getId={getIdByHref}
                            onSelect={handleSelect}
                            onDoubleClick={handleDoubleClick}
                            onEdit={handleEdit}
                            onDelete={handleDelete ? (link) => handleDelete(link) : undefined}
                            onContextMenu={handleContextMenu}
                            onGridModel={handleGridModel}
                            onItemDragEnter={acceptsDrops ? handleItemDragEnter : undefined}
                            onItemDragOver={acceptsDrops ? handleItemDragOver : undefined}
                            onItemDragLeave={acceptsDrops ? handleItemDragLeave : undefined}
                            onItemDrop={acceptsDrops ? handleItemDrop : undefined}
                            dropTargetId={state.dropTargetHref}
                            dragSourceId={allowsDrag ? provider.sourceUrl : undefined}
                            onDragStartOverride={allowsDrag ? handleDragStartOverride : undefined}
                        />
                    </Panel>
                ) : (
                    <LinksList
                        links={filteredItems}
                        selectedId={props.selectedHref ?? undefined}
                        selectedIds={selectedIds}
                        getId={getIdByHref}
                        searchText={state.searchText}
                        onSelect={handleSelect}
                        onDoubleClick={handleDoubleClick}
                        onEdit={handleEdit}
                        onDelete={handleDelete ? (link) => handleDelete(link) : undefined}
                        onContextMenu={handleContextMenu}
                        onGridModel={handleGridModel}
                        onItemDragEnter={acceptsDrops ? handleItemDragEnter : undefined}
                        onItemDragOver={acceptsDrops ? handleItemDragOver : undefined}
                        onItemDragLeave={acceptsDrops ? handleItemDragLeave : undefined}
                        onItemDrop={acceptsDrops ? handleItemDrop : undefined}
                        dropTargetId={state.dropTargetHref}
                        dragSourceId={allowsDrag ? provider.sourceUrl : undefined}
                        onDragStartOverride={allowsDrag ? handleDragStartOverride : undefined}
                    />
                )}
            </div>
            {/* Footer mirrors the Monaco editor's EditorToolbar footer (same dark bg /
                top border / centered row), but with a fixed 29px height. The shared
                EditorToolbar is content-height-driven, so a text-only row would sit at
                ~20px while Monaco's icon-bearing row is 29px — hardcode the height to
                keep the two footers visually aligned. */}
            <Panel
                name="category-footer"
                direction="row"
                align="center"
                gap="sm"
                paddingX="sm"
                background="dark"
                borderTop
                shrink={false}
                height={29}
            >
                <Spacer />
                <span className="cv-footer-count">
                    {filteredCount === totalCount
                        ? `${totalCount} items`
                        : `${filteredCount} of ${totalCount} items`}
                    {/* Raw selection count — it describes what is highlighted, not what an
                        action would touch (a nested selection prunes to fewer). */}
                    {selectedHrefs.length > 1 && ` (${selectedHrefs.length} selected)`}
                </span>
            </Panel>
        </CategoryViewRoot>
    );
}
