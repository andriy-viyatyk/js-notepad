import React from "react";
import type { ITreeItem } from "./types";
import type { TreeModel } from "./TreeModel";

/** Keyboard interaction submodel for Tree. Selection remains controlled by Tree props;
 * this class owns only keyboard gesture interpretation and the transient range anchor. */
export class TreeKeyboardHandler<T = ITreeItem> {
    private anchorValue: string | number | null = null;

    constructor(private readonly tree: TreeModel<T>) {}

    setAnchor(value: string | number | null) {
        this.anchorValue = value;
    }

    /** Resolves the transient anchor at gesture time, so rebuilt rows cannot shift it. */
    anchorIndex(): number | null {
        if (this.anchorValue == null) return null;
        return this.tree.indexByValue.value.get(this.anchorValue) ?? null;
    }

    onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const { tree } = this;
        if (!tree.props.keyboardNav) return;
        const rows = tree.rows.value;
        const n = rows.length;
        if (n === 0) return;
        const cur = tree.props.activeIndex ?? tree.selectedRowIndex();
        const apply = (target: number) => {
            if (target < 0) return;
            tree.props.onActiveChange?.(target);
            tree.gridRef?.scrollToRow(target);
        };
        const applyWithSelection = (target: number) => {
            if (target < 0) return;
            apply(target);
            if (!tree.props.multiSelect) return;
            if (e.shiftKey) {
                tree.emitSelection(tree.rangeIndices(this.anchorIndex() ?? target, target));
            } else {
                this.anchorValue = rows[target]?.value ?? null;
            }
        };

        if (
            tree.props.multiSelect
            && e.ctrlKey
            && !e.altKey
            && !e.shiftKey
            && e.key.toLowerCase() === "a"
        ) {
            e.preventDefault();
            e.stopPropagation();
            tree.emitSelection(rows.map((_, i) => i));
            return;
        }

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                applyWithSelection(tree.findNextInteractive(Math.min(n - 1, cur + 1), 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                applyWithSelection(tree.findNextInteractive(Math.max(0, cur - 1), -1));
                break;
            case "Home":
                e.preventDefault();
                applyWithSelection(tree.findNextInteractive(0, 1));
                break;
            case "End":
                e.preventDefault();
                applyWithSelection(tree.findNextInteractive(n - 1, -1));
                break;
            case "PageDown": {
                e.preventDefault();
                const page = Math.max(1, tree.gridRef?.visibleRowCount ?? 1);
                const target = tree.findNextInteractive(Math.min(n - 1, (cur < 0 ? 0 : cur) + page), 1);
                applyWithSelection(target >= 0 ? target : tree.findNextInteractive(n - 1, -1));
                break;
            }
            case "PageUp": {
                e.preventDefault();
                const page = Math.max(1, tree.gridRef?.visibleRowCount ?? 1);
                const target = tree.findNextInteractive(Math.max(0, (cur < 0 ? 0 : cur) - page), -1);
                applyWithSelection(target >= 0 ? target : tree.findNextInteractive(0, 1));
                break;
            }
            case "ArrowRight": {
                e.preventDefault();
                if (cur < 0) break;
                const row = rows[cur];
                if (!row) break;
                if ((row.hasChildren || row.lazyChildren) && !row.expanded) tree.toggleAt(cur);
                else if (row.hasChildren && row.expanded) apply(tree.findNextInteractive(cur + 1, 1));
                break;
            }
            case "ArrowLeft": {
                e.preventDefault();
                if (cur < 0) break;
                const row = rows[cur];
                if (!row) break;
                if ((row.hasChildren || row.lazyChildren) && row.expanded) tree.toggleAt(cur);
                else apply(tree.findParentIndex(cur));
                break;
            }
            case "Enter":
                if (cur >= 0) {
                    e.preventDefault();
                    tree.onItemClick(cur);
                }
                break;
        }
    };
}
