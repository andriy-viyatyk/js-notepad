import React, { useMemo, useState } from "react";
import { Tree, TreeItem } from "../../uikit";
import type { MenuItem, TreeItemRenderContext } from "../../uikit";
import { FolderIcon } from "../../components/icons/FileIcon";
import { ToolsIcon } from "../../theme/icons";
import { buildToolsTree, type ToolTreeNode, type ToolsetTreeInput } from "./tools-tree-build";

/**
 * The single reusable registered-tools view (EPIC-038 / US-805). A presentational tree of
 * toolsets built from a finite list and rendered via the UIKit `Tree`, fully expanded. Pure
 * component — no trust reads, no link encoding: consumers wire those through the slots. Mirrors
 * `BoardsTree`.
 *
 * Used in single-root mode (Explorer panel Tools mode — pass `baseRoot`) and multi-root mode
 * (global Tools & Editors "Tools" segment — omit `baseRoot`). Folder nodes show a `FolderIcon`;
 * toolset nodes show a `ToolsIcon` and fire `onOpenToolset` on click.
 */
export interface ToolsTreeProps {
    /** Debug label → `data-name` (UIKit Rule 1). */
    name?: string;
    /** Registered toolsets to display (`{ root, name }`). */
    toolsets: ToolsetTreeInput[];
    /** Single-root mode: relativize paths to this base. Omit for multi-root (forest). */
    baseRoot?: string;
    /** Fires when a toolset row is clicked. The consumer opens it (e.g. via `persephone-toolset://`). */
    onOpenToolset: (root: string) => void;
    /** Optional right-aligned per-toolset action. Toolsets only. */
    renderTrailing?: (root: string) => React.ReactNode;
    /** Optional per-toolset context menu (e.g. "Remove"). Toolsets only. */
    getContextMenu?: (root: string) => MenuItem[] | undefined;
    /** Shown when `toolsets` is empty. */
    emptyMessage?: React.ReactNode;
}

export function ToolsTree({
    name,
    toolsets,
    baseRoot,
    onOpenToolset,
    renderTrailing,
    getContextMenu,
    emptyMessage,
}: ToolsTreeProps) {
    const nodes = useMemo(() => buildToolsTree(toolsets, baseRoot), [toolsets, baseRoot]);

    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const handleChange = (src: ToolTreeNode) => {
        if (src.kind === "toolset" && src.root) onOpenToolset(src.root);
    };

    const getMenu = (src: ToolTreeNode): MenuItem[] | undefined =>
        src.kind === "toolset" && src.root ? getContextMenu?.(src.root) : undefined;

    const renderItem = (ctx: TreeItemRenderContext<ToolTreeNode>) => {
        const src = ctx.source;
        const isToolset = src.kind === "toolset";
        return (
            <TreeItem
                id={ctx.id}
                level={ctx.level}
                expanded={ctx.expanded}
                hasChildren={ctx.hasChildren}
                selected={ctx.selected}
                active={ctx.active}
                icon={isToolset ? <ToolsIcon width={16} height={16} /> : <FolderIcon />}
                label={src.label}
                trailing={isToolset ? renderTrailing?.(src.root) : undefined}
                onChevronClick={(e) => {
                    e.stopPropagation();
                    ctx.toggleExpanded();
                }}
            />
        );
    };

    return (
        <Tree<ToolTreeNode>
            name={name}
            items={nodes}
            defaultExpandAll
            rowHeight={28}
            activeIndex={activeIndex}
            onActiveChange={setActiveIndex}
            onChange={handleChange}
            getContextMenu={getMenu}
            renderItem={renderItem}
            emptyMessage={emptyMessage}
        />
    );
}
