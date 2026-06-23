import React, { useMemo, useState } from "react";
import { Tree, TreeItem } from "../../uikit";
import type { MenuItem, TreeItemRenderContext } from "../../uikit";
import { FolderIcon } from "../../components/icons/FileIcon";
import { BoardGlyph } from "./BoardGlyph";
import { buildBoardsTree, type BoardTreeNode } from "./boards-tree-build";

/**
 * The single reusable boards view (EPIC-036 / US-759). A presentational tree of boards built
 * from a finite path list and rendered via the UIKit `Tree`, fully expanded. Pure component —
 * no trust reads, no link encoding, no pin state: consumers wire those through the slots.
 *
 * Used in single-root mode (Explorer panel, in-board toolbar popover — pass `baseRoot`) and
 * multi-root mode (global Tools & Editors tab — omit `baseRoot`). Folder nodes show a
 * `FolderIcon` and toggle on the chevron; board nodes show their `BoardGlyph` and fire
 * `onOpenBoard` on click.
 */
export interface BoardsTreeProps {
    /** Debug label → `data-name` (UIKit Rule 1). */
    name?: string;
    /** Absolute board-root paths to display (e.g. the trusted-boards registry, pre-filtered). */
    boards: string[];
    /** Single-root mode: relativize paths to this base. Omit for multi-root (forest). */
    baseRoot?: string;
    /** Fires when a board row is clicked. The consumer opens it (e.g. via `persephone-board://`). */
    onOpenBoard: (root: string) => void;
    /** Optional right-aligned per-board action (e.g. the global tab's pin button). Boards only. */
    renderTrailing?: (root: string) => React.ReactNode;
    /** When provided and `false` for a board, its trailing reveals on row hover only; otherwise
     *  it stays visible (e.g. a pinned board keeps its filled pin). Boards only; default visible. */
    trailingVisible?: (root: string) => boolean;
    /** Optional per-board context menu (e.g. the global tab's "Remove"). Boards only. */
    getBoardContextMenu?: (root: string) => MenuItem[] | undefined;
    /** Shown when `boards` is empty. */
    emptyMessage?: React.ReactNode;
}

export function BoardsTree({
    name,
    boards,
    baseRoot,
    onOpenBoard,
    renderTrailing,
    trailingVisible,
    getBoardContextMenu,
    emptyMessage,
}: BoardsTreeProps) {
    const nodes = useMemo(() => buildBoardsTree(boards, baseRoot), [boards, baseRoot]);

    // Transient hover highlight — Tree routes onItemMouseEnter → onActiveChange and styles the
    // [data-active] row (lighter background), matching the file tree. Visual-only view-local state.
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const handleChange = (src: BoardTreeNode) => {
        if (src.kind === "board" && src.root) onOpenBoard(src.root);
    };

    const getContextMenu = (src: BoardTreeNode): MenuItem[] | undefined =>
        src.kind === "board" && src.root ? getBoardContextMenu?.(src.root) : undefined;

    const renderItem = (ctx: TreeItemRenderContext<BoardTreeNode>) => {
        const src = ctx.source;
        const isBoard = src.kind === "board";
        return (
            <TreeItem
                id={ctx.id}
                level={ctx.level}
                expanded={ctx.expanded}
                hasChildren={ctx.hasChildren}
                selected={ctx.selected}
                active={ctx.active}
                icon={isBoard ? <BoardGlyph boardRoot={src.root} /> : <FolderIcon />}
                label={src.label}
                trailing={isBoard ? renderTrailing?.(src.root) : undefined}
                trailingVisibility={
                    isBoard && trailingVisible && !trailingVisible(src.root) ? "hover" : "always"
                }
                onChevronClick={(e) => {
                    e.stopPropagation();
                    ctx.toggleExpanded();
                }}
            />
        );
    };

    return (
        <Tree<BoardTreeNode>
            name={name}
            items={nodes}
            defaultExpandAll
            rowHeight={28}
            activeIndex={activeIndex}
            onActiveChange={setActiveIndex}
            onChange={handleChange}
            getContextMenu={getContextMenu}
            renderItem={renderItem}
            emptyMessage={emptyMessage}
        />
    );
}
