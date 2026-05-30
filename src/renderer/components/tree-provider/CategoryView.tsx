import { useCallback, useEffect, useRef } from "react";
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

    "& .cv-footer": {
        padding: "2px 8px",
        borderTop: `1px solid ${color.border.light}`,
        flexShrink: 0,
        fontSize: 11,
        color: color.text.light,
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
    const { filteredItems } = state;
    const { provider } = props;

    useEffect(() => {
        gridModelRef.current?.update({ all: true });
    }, [filteredItems, props.selectedHref]);

    useEffect(() => {
        gridModelRef.current?.scrollToRow(0);
        gridModelRef.current?.update({ all: true });
    }, [viewMode]);

    const handleGridModel = useCallback((gm: RenderGridModel | null) => {
        gridModelRef.current = gm;
    }, []);

    const handleSelect = useCallback((link: ILink) => {
        model.onItemClick(link);
    }, [model]);

    const handleDoubleClick = useCallback((link: ILink) => {
        model.onItemDoubleClick(link);
    }, [model]);

    const handleContextMenu = useCallback((e: React.MouseEvent, link: ILink) => {
        model.onItemContextMenu(link, e);
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
        <CategoryViewRoot>
            {props.toolbarPortalRef && createPortal(toolbarElement, props.toolbarPortalRef)}
            <div className="cv-content">
                {filteredItems.length === 0 ? (
                    <div className="cv-empty">
                        {state.searchText ? "No matching items" : "Empty folder"}
                    </div>
                ) : isTileMode ? (
                    <LinksTiles
                        links={filteredItems}
                        viewMode={viewMode as Exclude<CategoryViewMode, "list">}
                        selectedId={props.selectedHref ?? undefined}
                        getId={getIdByHref}
                        onSelect={handleSelect}
                        onDoubleClick={handleDoubleClick}
                        onEdit={handleEdit}
                        onDelete={handleDelete ? (link) => handleDelete(link) : undefined}
                        onContextMenu={handleContextMenu}
                        onGridModel={handleGridModel}
                    />
                ) : (
                    <LinksList
                        links={filteredItems}
                        selectedId={props.selectedHref ?? undefined}
                        getId={getIdByHref}
                        searchText={state.searchText}
                        onSelect={handleSelect}
                        onDoubleClick={handleDoubleClick}
                        onEdit={handleEdit}
                        onDelete={handleDelete ? (link) => handleDelete(link) : undefined}
                        onContextMenu={handleContextMenu}
                        onGridModel={handleGridModel}
                    />
                )}
            </div>
            <div className="cv-footer">
                {filteredCount === totalCount
                    ? `${totalCount} items`
                    : `${filteredCount} of ${totalCount} items`}
            </div>
        </CategoryViewRoot>
    );
}
