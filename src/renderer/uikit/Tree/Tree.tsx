import React, { useEffect, useId } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { gap, spacing } from "../tokens";
import { useComponentModel } from "../../core/state/model";
import { RenderGrid } from "../RenderGrid";
import type {
    ElementLength,
    Percent,
    RenderCellFunc,
} from "../RenderGrid";
import { Spinner } from "../Spinner";
import { focusSelectionOverride } from "../shared/selection-style";
import { TreeItem } from "./TreeItem";
import { SectionItem } from "./SectionItem";
import { TreeModel, defaultTreeState } from "./TreeModel";
import { ITreeItem, TreeProps } from "./types";

// --- Styled ---

const Root = styled.div(
    {
        display: "flex",
        flexDirection: "column",
        flex: "1 1 auto",
        // Without `min-width: 0` the flex item defaults to `min-width: auto`
        // (= min-content), so a Tree with wide TreeItem labels pushes its
        // own box wider than the parent — bleeding past sidebar panels and
        // covering adjacent splitters. Setting it to 0 lets the Tree shrink
        // to the parent's available width; per-row overflow is handled by
        // each TreeItem's own truncate / wrap rules.
        minWidth: 0,
        outline: "none",
        "&[data-disabled]": { opacity: 0.6, pointerEvents: "none" },

        // Focused-list selection visuals (gray when blurred → blue + outline when the tree
        // is focused). Shared with ListBox via uikit/shared/selection-style. Gated on
        // data-focus-selection (set for keyboardNav or focusSelection trees); descendant
        // selectors, because rows may be consumer-rendered via `renderItem` (they still
        // render a TreeItem carrying data-type="tree-item"). Opt-out trees are unaffected.
        ...focusSelectionOverride('[data-type="tree-item"]'),
    },
    { label: "Tree" },
);

const EmptyRoot = styled.div(
    {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: gap.md,
        flex: "1 1 auto",
        padding: spacing.md,
        color: color.text.light,
    },
    { label: "TreeEmpty" },
);

// --- Constants ---

const columnWidth: ElementLength = (() => "100%" as Percent) as ElementLength;
const defaultRowHeight = 22;
const defaultIndentSize = 16;

// --- Component ---

function TreeView<T = ITreeItem>(
    props: TreeProps<T>,
) {
    const reactId = useId();
    const model = useComponentModel(
        props,
        TreeModel as unknown as TreeModel<T>,
        defaultTreeState,
    );
    model.setReactId(reactId);
    const onModel = props.onModel;

    useEffect(() => {
        onModel?.(model);
        return () => onModel?.(null);
    }, [model, onModel]);

    const {
        name,
        // Captured for model registration; do not forward the callback to the DOM root.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onModel: _onModel,
        searchText,
        renderItem,
        keyboardNav = false,
        focusSelection = false,
        multiSelect = false,
        rowHeight = defaultRowHeight,
        indentSize = defaultIndentSize,
        growToHeight,
        whiteSpaceY,
        activeIndex,
        getTooltip,
        loading,
        emptyMessage,
        // captured (not forwarded) — model handles via this.props
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        items: _items,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        value: _value,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onChange: _onChange,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onItemDoubleClick: _onItemDoubleClick,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        isSelected: _isSelected,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onSelectionChange: _onSelectionChange,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onActiveChange: _onActiveChange,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onContextMenu: _onContextMenu,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getContextMenu: _getContextMenu,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getChildren: _getChildren,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        defaultExpandedValues: _defaultExpandedValues,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        defaultExpandAll: _defaultExpandAll,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onExpandChange: _onExpandChange,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        id: _id,
        // captured (model uses via this.props) — not forwarded onto the root
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getHasChildren: _getHasChildren,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        loadChildren: _loadChildren,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onLoadError: _onLoadError,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getAncestorValues: _getAncestorValues,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        canCollapse: _canCollapse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        traitTypeId: _traitTypeId,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getDragData: _getDragData,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        acceptsDrop: _acceptsDrop,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        canTraitDrop: _canTraitDrop,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onTraitDrop: _onTraitDrop,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        expandOnDragHoverDelay: _expandOnDragHoverDelay,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        acceptsFileDrop: _acceptsFileDrop,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onDragStartOverride: _onDragStartOverride,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        collapseDescendants: _collapseDescendants,
        ...rest
    } = props;

    // Subscribe the View to model state changes. Without this, expansion toggles and
    // drag-state flips update the underlying store but do NOT trigger a React re-render
    // here, so RenderGrid's gridRef.update({ all: true }) effect never fires. The state
    // shape is small (4 scalar fields), so the no-arg subscription is fine.
    model.state.use();

    const rootId = model.rootId;
    const rows = model.rows.value;

    const dndEnabled = model.isDndEnabled;

    // Focus-aware selection (Explorer look) is enabled by keyboardNav (back-compat) or the
    // dedicated focusSelection prop. It gates data-focus-selection + the root's tab stop.
    const focusAware = keyboardNav || focusSelection;

    const renderCell: RenderCellFunc = ({ row: idx, key, style }) => {
        const r = rows[idx];
        if (!r) return null;
        const id = model.itemId(idx);

        if (r.item.section) {
            return (
                <div key={key} style={style}>
                    <SectionItem
                        id={id}
                        level={r.level}
                        label={r.item.label}
                        indentSize={indentSize}
                    />
                </div>
            );
        }

        const selected = model.isSelectedAt(idx);
        const active = idx === activeIndex;
        const dragging = model.isDraggingAt(idx);
        const dropActive = model.isDropTargetAt(idx);
        const loading = model.isLoadingAt(idx);
        // From the consumer's POV, "hasChildren" means "row is expandable (chevron should
        // render)". A lazy row whose children haven't loaded yet still belongs in this set.
        const expandable = r.hasChildren || r.lazyChildren;
        const tooltip = getTooltip?.(r.source, r.level);

        const canDrag = dndEnabled && model.canDragRow(idx);
        const canDrop = dndEnabled && model.canDropRow(idx);

        const content = renderItem
            ? renderItem({
                item: r.item,
                source: r.source,
                level: r.level,
                expanded: r.expanded,
                hasChildren: expandable,
                rowIndex: idx,
                selected,
                active,
                dragging,
                dropActive,
                loading,
                id,
                toggleExpanded: () => model.toggleAt(idx),
            })
            : (
                <TreeItem
                    id={id}
                    level={r.level}
                    expanded={r.expanded}
                    hasChildren={expandable}
                    icon={r.item.icon}
                    label={r.item.label}
                    searchText={searchText}
                    selected={selected}
                    active={active}
                    dragging={dragging}
                    dropActive={dropActive}
                    loading={loading}
                    disabled={r.item.disabled}
                    tooltip={tooltip}
                    indentSize={indentSize}
                    onChevronClick={(e) => model.onChevronClick(e, idx)}
                />
            );

        return (
            <div
                key={key}
                style={style}
                draggable={canDrag || undefined}
                onClick={(e) => model.onItemClick(idx, e)}
                onDoubleClick={() => model.onItemDoubleClick(idx)}
                onMouseEnter={() => model.onItemMouseEnter(idx)}
                onContextMenu={(e) => model.onItemContextMenu(e, idx)}
                onDragStart={canDrag ? (e) => model.onDragStart(e, idx) : undefined}
                onDragEnd={canDrag ? () => model.onDragEnd() : undefined}
                onDragEnter={canDrop ? (e) => model.onDragEnter(e, idx) : undefined}
                onDragOver={canDrop ? (e) => model.onDragOver(e, idx) : undefined}
                onDragLeave={canDrop ? (e) => model.onDragLeave(e, idx) : undefined}
                onDrop={canDrop ? (e) => model.onDrop(e, idx) : undefined}
            >
                {content}
            </div>
        );
    };

    if (loading) {
        return (
            <Root
                id={rootId}
                data-type="tree"
                data-name={name}
                data-keyboard-nav={keyboardNav || undefined}
                data-focus-selection={focusAware || undefined}
                data-loading=""
                onContextMenu={model.onRootContextMenu}
                {...rest}
            >
                <EmptyRoot>
                    <Spinner size={16} /> loading…
                </EmptyRoot>
            </Root>
        );
    }

    if (rows.length === 0) {
        return (
            <Root
                id={rootId}
                data-type="tree"
                data-name={name}
                data-keyboard-nav={keyboardNav || undefined}
                data-focus-selection={focusAware || undefined}
                data-empty=""
                onContextMenu={model.onRootContextMenu}
                {...rest}
            >
                <EmptyRoot>{emptyMessage ?? "no items"}</EmptyRoot>
            </Root>
        );
    }

    const activeId =
        activeIndex != null && activeIndex >= 0 && activeIndex < rows.length
            ? model.itemId(activeIndex)
            : undefined;

    return (
        <Root
            id={rootId}
            data-type="tree"
            data-name={name}
            data-keyboard-nav={keyboardNav || undefined}
            data-focus-selection={focusAware || undefined}
            data-multi-select={multiSelect || undefined}
            role="tree"
            aria-multiselectable={multiSelect || undefined}
            tabIndex={focusAware ? 0 : -1}
            aria-activedescendant={activeId}
            onKeyDown={model.onKeyDown}
            onContextMenu={model.onRootContextMenu}
            onMouseLeave={model.onRootMouseLeave}
            {...rest}
        >
            <RenderGrid
                onModel={model.setGridRef}
                columnCount={1}
                rowCount={rows.length}
                columnWidth={columnWidth}
                rowHeight={rowHeight}
                renderCell={renderCell}
                overscanRow={2}
                fitToWidth
                growToHeight={growToHeight}
                whiteSpaceY={whiteSpaceY}
            />
        </Root>
    );
}

export const Tree = TreeView as <T = ITreeItem>(
    props: TreeProps<T>,
) => React.ReactElement | null;

// Re-export public types and the trait key from the canonical location.
export { TREE_ITEM_KEY } from "./types";
export type {
    ITreeItem,
    TreeProps,
    TreeRow,
    TreeItemRenderContext,
} from "./types";
