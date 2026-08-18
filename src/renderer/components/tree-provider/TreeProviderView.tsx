import React, { useCallback, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { useComponentModel } from "../../core/state/model";
import { TraitSet, traited } from "../../core/traits/traits";
import {
    Tree,
    TREE_ITEM_KEY,
    TreeItem,
    Input,
    IconButton,
    Panel,
    Text,
} from "../../uikit";
import type { TreeItemRenderContext } from "../../uikit";
import type { TreeModel } from "../../uikit/Tree/TreeModel";
import { CloseIcon } from "../../theme/icons";
import { TraitTypeId } from "../../core/traits";
import type { TraitDragPayload } from "../../core/traits";
import { api } from "../../../ipc/renderer/api";
import { supportsOsClipboard } from "./os-clipboard";
import { TreeProviderItemIcon } from "../icons/TreeProviderItemIcon";
import { getTraitDropAction } from "./drop-dispatch";
import {
    TreeProviderViewModel,
    TreeProviderViewProps,
    TreeProviderViewSavedState,
    TreeProviderNode,
    defaultTreeProviderViewState,
} from "./TreeProviderViewModel";

export type { TreeProviderViewProps, TreeProviderViewSavedState };

// Trait set translates a TreeProviderNode into the UIKit Tree's ITreeItem accessors.
// `value` is the node's href (stable id), `label`/`icon` drive default rendering when
// `props.getLabel` is not supplied. Children are walked via the Tree's `getChildren`
// prop instead of a trait accessor — the accessor type would force a recursive resolve
// to ITreeItem, but a child of TreeProviderNode is itself a TreeProviderNode that the
// trait re-applies on the next level.
const tpvNodeTraits = new TraitSet().add(TREE_ITEM_KEY, {
    value: (node: unknown) => (node as TreeProviderNode).data.href,
    label: (node: unknown) => (node as TreeProviderNode).data.title,
    icon: (node: unknown) => (
        <TreeProviderItemIcon item={(node as TreeProviderNode).data} />
    ),
});

const getNodeChildren = (node: TreeProviderNode) => node.items;

// Chrome wrapper — purely keyboard-plumbing chrome (clipboard/Delete/F2 + Ctrl+F
// intercepts on bubbled keys; the Tree root itself is the tab stop). UIKit Panel doesn't
// expose `outline` suppression, and the wiring is unique to this shared view, so we keep
// one styled div for the wrapper. UIKit primitives drive every other surface in this file.
const Root = styled.div({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    outline: "none",
}, { label: "TreeProviderViewRoot" });

export function TreeProviderView(
    props: TreeProviderViewProps & {
        onModel?: (model: TreeProviderViewModel | null) => void;
    },
) {
    const { onModel, ...viewProps } = props;
    // Destructure named props referenced inside hook bodies so exhaustive-deps
    // can statically verify them (avoids the "missing dependency: 'props'" hint).
    const { getLabel, renderTrailing } = viewProps;
    const model = useComponentModel(
        { ...viewProps, onModel },
        TreeProviderViewModel,
        defaultTreeProviderViewState,
    );
    const state = model.state.use();
    const treeModel = useRef<TreeModel<TreeProviderNode> | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Transient hover highlight — Tree routes onItemMouseEnter → onActiveChange,
    // and styles the [data-active] row. Visual-only, so view-local state (same
    // pattern as the Git "Branches & Tags" tree).
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const setTreeModel = useCallback((tree: TreeModel<TreeProviderNode> | null) => {
        treeModel.current = tree;
        model.setTreeModel(tree);
    }, [model]);

    const isDeepSearch = state.searchText.length >= 3;
    const showLinks = props.showLinks !== false;

    const getHasChildren = useCallback(
        (node: TreeProviderNode) => {
            if (!node.data.isDirectory) return false;
            const { hasSubDirectories, hasItems } = node.data;
            // Undefined flags (FileTreeProvider, ArchiveTreeProvider) → assume expandable
            if (hasSubDirectories === undefined && hasItems === undefined) return true;
            if (showLinks) return !!(hasSubDirectories || hasItems);
            return !!hasSubDirectories;
        },
        [showLinks],
    );

    // Selection is the model's own `selectedValues` (sticky; folders included) —
    // `props.selectedHref` feeds it via the model's setProps sync, not directly. In
    // multiSelect mode this predicate is also the Tree's read path for the current set
    // (US-937), so it must stay cheap: a lowercase Set, not a scan.
    const selectedValues = state.selectedValues;
    const selectedSet = useMemo(
        () => new Set(selectedValues.map((href) => href.toLowerCase())),
        [selectedValues],
    );
    const isSelected = useCallback(
        (node: TreeProviderNode) => selectedSet.has(node.data.href.toLowerCase()),
        [selectedSet],
    );

    const handleSelectionChange = useCallback(
        (sources: TreeProviderNode[]) => {
            model.setSelection(sources.map((s) => s.data.href));
        },
        [model],
    );

    // The chevron-less permanent root must never collapse — without this, keyboard
    // ArrowLeft could close it with no way to re-open (its chevron is hidden).
    const canCollapse = useCallback(
        (node: TreeProviderNode) => node.data.href !== props.provider.rootPath,
        [props.provider.rootPath],
    );

    // Drag-drop (only if writable)
    const writable = props.provider.writable;

    // A drag that starts on a selected row carries the whole selection (model.dragItemsFor);
    // dragging an unselected row carries that row alone and leaves the selection untouched —
    // so dragstart deliberately does not write the selection.
    const getDragData = useCallback((node: TreeProviderNode) => {
        if (!writable) return null;
        if (node.data.href === props.provider.rootPath) return null;
        const items = model.dragItemsFor(node);
        if (!items.length) return null;
        return { items, sourceId: props.provider.sourceUrl };
    }, [model, writable, props.provider.rootPath, props.provider.sourceUrl]);

    // OS file drag-out (Windows Explorer / Teams) for local-file providers, where
    // `href` is an absolute path. Every file-row drag hands off to a native OS drag
    // (`webContents.startDrag`) — the only payload both Explorer AND Teams accept
    // cleanly. A native drag dropped back inside a Persephone window re-enters as an
    // ordinary OS file drop (GlobalEventService.captureDrop), so the same plain drag
    // serves internal drops too (see onTraitDrop). No modifier needed. Non-file
    // providers keep the in-process HTML5 trait drag only.
    const osDragEnabled = supportsOsClipboard(props.provider);
    const handleOsDragStart = useCallback(
        (node: TreeProviderNode, _level: number, e: React.DragEvent): boolean => {
            const href = node.data.href;
            if (!href || href === props.provider.rootPath) return false;
            const paths = model.dragItemsFor(node).map((i) => i.href);
            if (!paths.length) return false;
            e.preventDefault();
            // `webContents.startDrag` renders the icon of paths[0] only — Windows shows no
            // count badge for a multi-file drag and Electron exposes no way to compose one.
            void api.startOsFileDrag(paths);
            return true;
        },
        [model, props.provider.rootPath],
    );

    const canTraitDrop = useCallback((dropNode: TreeProviderNode, payload: TraitDragPayload) => {
        if (!writable) return false;
        return !!getTraitDropAction(props.provider, dropNode.data.href, payload);
    }, [writable, props.provider]);

    const onTraitDrop = useCallback((dropNode: TreeProviderNode, payload: TraitDragPayload) => {
        const action = getTraitDropAction(props.provider, dropNode.data.href, payload);
        if (!action) return;
        if (action.kind === "move") {
            void model.moveItems(action.items, dropNode);
            return;
        }
        if (action.kind === "import-links") {
            void model.importLinksTo(action.items, dropNode);
            return;
        }
        if (supportsOsClipboard(props.provider)) {
            void model.dropOsFilesInto(action.files, dropNode);
        } else {
            void model.importFiles(action.files, dropNode);
        }
    }, [model, props.provider]);

    // Tree's onExpandChange emits string|number; our values are always strings (hrefs).
    const handleExpandChange = useCallback(
        (value: string | number, expanded: boolean) => {
            model.onExpandChange(String(value), expanded);
        },
        [model],
    );

    // Keyboard — clipboard/Delete/F2 actions first (model decides + consumes),
    // then the search plumbing (Ctrl+F / Escape).
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (model.onTreeKeyDown(e)) return;
        if (e.ctrlKey && e.key === "f") {
            e.preventDefault();
            e.stopPropagation();
            model.showSearch();
            setTimeout(() => searchInputRef.current?.focus(), 0);
        }
        if (e.key === "Escape" && state.searchVisible) {
            e.preventDefault();
            e.stopPropagation();
            model.hideSearch();
            treeModel.current?.focusRoot();
        }
    }, [state.searchVisible, model]);

    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            model.hideSearch();
            treeModel.current?.focusRoot();
        }
    }, [model]);

    const handleSearchBlur = useCallback(() => {
        if (!state.searchText) {
            model.hideSearch();
        }
    }, [state.searchText, model]);

    const handleSearchClose = useCallback(() => {
        model.hideSearch();
            treeModel.current?.focusRoot();
    }, [model]);

    const renderItem = useCallback((ctx: TreeItemRenderContext<TreeProviderNode>) => {
        const node = ctx.source;
        const labelContent = getLabel
            ? getLabel(node.data, state.searchText)
            : node.data.title;
        // Root is the single permanent ancestor in every tree-provider view — render it
        // without a chevron and without the chevron-column placeholder (icon sits flush
        // after zero indents). The `canCollapse` prop blocks collapsing it (keyboard
        // ArrowLeft / toggleItem), and collapseAll re-expands it after the fact.
        return (
            <TreeItem
                id={ctx.id}
                level={ctx.level}
                expanded={ctx.expanded}
                hasChildren={ctx.hasChildren}
                hideChevron={ctx.level === 0}
                icon={<TreeProviderItemIcon item={node.data} />}
                label={labelContent}
                searchText={state.searchText}
                selected={ctx.selected}
                active={ctx.active}
                dragging={ctx.dragging}
                dropActive={ctx.dropActive}
                loading={ctx.loading}
                tooltip={node.data.href}
                trailing={renderTrailing?.(node.data)}
                onChevronClick={(e) => {
                    e.stopPropagation();
                    ctx.toggleExpanded();
                }}
                onContextMenu={(e) => model.onItemContextMenu(node, e)}
            />
        );
    }, [getLabel, renderTrailing, state.searchText, model]);

    // Items wrapped as a single-rooted Traited — the Tree memo walks children via the trait.
    const tNodes = useMemo(
        () => (state.displayTree ? traited([state.displayTree], tpvNodeTraits) : null),
        [state.displayTree],
    );

    // Error / empty states
    if (state.error) {
        return (
            <Panel padding="md" data-type="tree-provider-error">
                <Text size="sm" color="error">{state.error}</Text>
            </Panel>
        );
    }

    if (!tNodes) {
        return (
            <Panel padding="md" data-type="tree-provider-empty">
                <Text size="sm" color="light">No content</Text>
            </Panel>
        );
    }

    return (
        <Root
            data-type="tree-provider-view"
            onKeyDown={handleKeyDown}
            onContextMenu={model.onBackgroundContextMenu}
        >
            <Tree<TreeProviderNode>
                name="tree-provider"
                key={state.searchKey}
                onModel={setTreeModel}
                items={tNodes}
                getChildren={getNodeChildren}
                isSelected={isSelected}
                multiSelect={viewProps.multiSelect}
                onSelectionChange={handleSelectionChange}
                keyboardNav
                canCollapse={canCollapse}
                collapseDescendants
                activeIndex={activeIndex}
                onActiveChange={setActiveIndex}
                onChange={model.onItemClick}
                onItemDoubleClick={model.onItemDoubleClick}
                searchText={state.searchText}
                defaultExpandedValues={model.initialExpandMap}
                defaultExpandAll={isDeepSearch}
                onExpandChange={handleExpandChange}
                getHasChildren={getHasChildren}
                traitTypeId={writable ? ((props.provider.dragTraitTypeId as TraitTypeId) ?? TraitTypeId.ILink) : undefined}
                getDragData={writable ? getDragData : undefined}
                acceptsDrop={writable}
                acceptsFileDrop={writable && !!props.provider.importFiles}
                canTraitDrop={writable ? canTraitDrop : undefined}
                onTraitDrop={writable ? onTraitDrop : undefined}
                onDragStartOverride={osDragEnabled ? handleOsDragStart : undefined}
                renderItem={renderItem}
            />
            {state.searchVisible && (
                <Panel name="tree-provider-search" direction="row" padding="xs" borderTop data-type="tpv-search">
                    <Input
                        name="tree-provider-search-input"
                        ref={searchInputRef}
                        size="sm"
                        value={state.searchText}
                        onChange={model.setSearchText}
                        placeholder="Search..."
                        onKeyDown={handleSearchKeyDown}
                        onBlur={handleSearchBlur}
                        endSlot={state.searchText ? (
                            <IconButton
                                name="tree-provider-search-close"
                                size="sm"
                                title="Close Search"
                                icon={<CloseIcon />}
                                onClick={handleSearchClose}
                            />
                        ) : undefined}
                    />
                </Panel>
            )}
        </Root>
    );
}
