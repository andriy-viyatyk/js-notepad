import { useCallback, useEffect, useMemo, useRef } from "react";
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
import type { TreeRef, TreeItemRenderContext } from "../../uikit";
import { CloseIcon } from "../../theme/icons";
import { LINK } from "../../editors/link-editor/linkTraits";
import { TraitTypeId, resolveTraits } from "../../core/traits";
import type { TraitDragPayload } from "../../core/traits";
import { TreeProviderItemIcon } from "./TreeProviderItemIcon";
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

// Chrome wrapper — purely keyboard-plumbing chrome (Ctrl+F intercept, focus return on
// Escape). UIKit Panel doesn't expose `outline` suppression, and the wiring is unique to
// this shared view, so we keep one styled div for the wrapper. UIKit primitives drive
// every other surface in this file.
const Root = styled.div({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    outline: "none",
}, { label: "TreeProviderViewRoot" });

export interface TreeProviderViewRef {
    refresh(): void;
    showSearch(): void;
    hideSearch(): void;
    collapseAll(): void;
    getState(): TreeProviderViewSavedState;
    /** Expand ancestors, load children if needed, and scroll to show item. */
    revealItem(href: string): void;
}

export function TreeProviderView(
    props: TreeProviderViewProps & { ref?: React.Ref<TreeProviderViewRef> },
) {
    const { ref, ...viewProps } = props;
    // Destructure named props referenced inside hook bodies so exhaustive-deps
    // can statically verify them (avoids the "missing dependency: 'props'" hint).
    const { provider, getLabel, onStateChange } = viewProps;
    const model = useComponentModel(
        viewProps,
        TreeProviderViewModel,
        defaultTreeProviderViewState,
    );
    const state = model.state.use();
    const treeRef = useRef<TreeRef>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        model.setTreeRef(treeRef.current);
    });

    // Expose ref methods
    useEffect(() => {
        if (!ref) return;
        const refValue: TreeProviderViewRef = {
            refresh: model.buildTree,
            showSearch: () => {
                model.showSearch();
                setTimeout(() => searchInputRef.current?.focus(), 0);
            },
            hideSearch: () => {
                model.hideSearch();
                rootRef.current?.focus();
            },
            collapseAll: () => {
                const rootPath = provider.rootPath;
                treeRef.current?.collapseAll();
                // Tree.collapseAll queues a microtask that walks every node including the
                // root — re-expand root after that microtask settles, otherwise the root
                // collapses and the user can't open it again (no chevron). setTimeout(0)
                // sequences after the microtask queue.
                setTimeout(() => {
                    treeRef.current?.expandItem(rootPath);
                }, 0);
                onStateChange?.({ expandedPaths: [rootPath] });
            },
            getState: model.getState,
            revealItem: model.revealItem,
        };
        if (typeof ref === "function") {
            ref(refValue);
        } else {
            (ref as React.MutableRefObject<TreeProviderViewRef | null>).current = refValue;
        }
        return () => {
            if (typeof ref === "function") {
                ref(null);
            } else {
                (ref as React.MutableRefObject<TreeProviderViewRef | null>).current = null;
            }
        };
    }, [ref, model, provider, onStateChange]);

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

    const isSelected = useCallback((node: TreeProviderNode) => {
        if (!props.selectedHref) return false;
        return node.data.href.toLowerCase() === props.selectedHref.toLowerCase();
    }, [props.selectedHref]);

    // Drag-drop (only if writable)
    const writable = props.provider.writable;

    const getDragData = useCallback((node: TreeProviderNode) => {
        if (!writable) return null;
        if (node.data.href === props.provider.rootPath) return null;
        return { items: [node.data], sourceId: props.provider.sourceUrl };
    }, [writable, props.provider.rootPath, props.provider.sourceUrl]);

    const canTraitDrop = useCallback((dropNode: TreeProviderNode, payload: TraitDragPayload) => {
        if (!writable) return false;
        const traits = resolveTraits(payload.typeId);
        const linkTrait = traits?.get(LINK);
        if (!linkTrait) return false;
        const items = linkTrait.getItems(payload.data);
        if (items.length === 1 && items[0].href === dropNode.data.href) return false;
        return true;
    }, [writable]);

    const onTraitDrop = useCallback((dropNode: TreeProviderNode, payload: TraitDragPayload) => {
        const traits = resolveTraits(payload.typeId);
        const linkTrait = traits?.get(LINK);
        if (!linkTrait) return;
        const items = linkTrait.getItems(payload.data);
        if (items.length) {
            model.moveItems(items, dropNode);
        }
    }, [model]);

    // Tree's onExpandChange emits string|number; our values are always strings (hrefs).
    const handleExpandChange = useCallback(
        (value: string | number, expanded: boolean) => {
            model.onExpandChange(String(value), expanded);
        },
        [model],
    );

    // Keyboard
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
            rootRef.current?.focus();
        }
    }, [state.searchVisible, model]);

    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            model.hideSearch();
            rootRef.current?.focus();
        }
    }, [model]);

    const handleSearchBlur = useCallback(() => {
        if (!state.searchText) {
            model.hideSearch();
        }
    }, [state.searchText, model]);

    const handleSearchClose = useCallback(() => {
        model.hideSearch();
        rootRef.current?.focus();
    }, [model]);

    const renderItem = useCallback((ctx: TreeItemRenderContext<TreeProviderNode>) => {
        const node = ctx.source;
        const labelContent = getLabel
            ? getLabel(node.data, state.searchText)
            : node.data.title;
        // Root is the single permanent ancestor in every tree-provider view — render it
        // without a chevron and without the chevron-column placeholder (icon sits flush
        // after zero indents). The model also blocks toggle for the root href so click
        // / collapseAll / keyboard cannot collapse it.
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
                onChevronClick={(e) => {
                    e.stopPropagation();
                    ctx.toggleExpanded();
                }}
                onContextMenu={(e) => model.onItemContextMenu(node, e)}
            />
        );
    }, [getLabel, state.searchText, model]);

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
            ref={rootRef}
            tabIndex={0}
            data-type="tree-provider-view"
            onKeyDown={handleKeyDown}
            onContextMenu={model.onBackgroundContextMenu}
        >
            <Tree<TreeProviderNode>
                name="tree-provider"
                key={state.searchKey}
                ref={treeRef}
                items={tNodes}
                getChildren={getNodeChildren}
                isSelected={isSelected}
                onChange={model.onItemClick}
                onItemDoubleClick={model.onItemDoubleClick}
                searchText={state.searchText}
                defaultExpandedValues={model.initialExpandMap}
                defaultExpandAll={isDeepSearch}
                onExpandChange={handleExpandChange}
                getHasChildren={getHasChildren}
                traitTypeId={writable ? TraitTypeId.ILink : undefined}
                getDragData={writable ? getDragData : undefined}
                acceptsDrop={writable}
                canTraitDrop={writable ? canTraitDrop : undefined}
                onTraitDrop={writable ? onTraitDrop : undefined}
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
