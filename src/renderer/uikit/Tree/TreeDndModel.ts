import React from "react";
import { getTraitDragDataFromEvent, hasTraitDragData, isFileDrag, setTraitDragData } from "../../core/traits/dnd";
import { DragEnterCounter } from "../shared/drag-enter-counter";
import type { ITreeItem, TreeRow } from "./types";
import type { TreeModel, TreeState } from "./TreeModel";

/** Tree's trait/native-file drag-and-drop interaction submodel. */
export class TreeDndModel<T = ITreeItem> {
    private readonly dragEnterCounts = new DragEnterCounter<string | number>();
    private hoverExpandTimer: number | null = null;

    constructor(private readonly tree: TreeModel<T>) {}

    get isEnabled(): boolean {
        const { props } = this.tree;
        return (!!props.traitTypeId && !!props.getDragData) || !!props.acceptsDrop;
    }

    canDragRow = (rowIndex: number): boolean => {
        const { props } = this.tree;
        if ((!props.traitTypeId || !props.getDragData) && !props.onDragStartOverride) return false;
        const row = this.tree.rows.value[rowIndex];
        return !!row && !row.item.section && !row.item.disabled;
    };

    canDropRow = (rowIndex: number): boolean => {
        if (!this.tree.props.acceptsDrop) return false;
        const row = this.tree.rows.value[rowIndex];
        return !!row && !row.item.section && !row.item.disabled;
    };

    isDraggingAt = (rowIndex: number): boolean => {
        const row = this.tree.rows.value[rowIndex];
        return !!row && this.tree.state.get().draggingValue === row.value;
    };

    isDropTargetAt = (rowIndex: number): boolean => {
        const row = this.tree.rows.value[rowIndex];
        return !!row && this.tree.state.get().dragOverValue === row.value;
    };

    onDragStart = (e: React.DragEvent<HTMLDivElement>, rowIndex: number) => {
        const row = this.tree.rows.value[rowIndex];
        if (!row || row.item.section || row.item.disabled) {
            e.preventDefault();
            return;
        }
        if (this.tree.props.onDragStartOverride?.(row.source, row.level, e)) {
            e.stopPropagation();
            return;
        }
        const { traitTypeId, getDragData } = this.tree.props;
        if (!traitTypeId || !getDragData) {
            e.preventDefault();
            return;
        }
        const data = getDragData(row.source, row.level);
        if (data == null) {
            e.preventDefault();
            return;
        }
        e.stopPropagation();
        setTraitDragData(e.dataTransfer, traitTypeId, data);
        this.update((state) => { state.draggingValue = row.value; });
    };

    onDragEnd = () => {
        this.dragEnterCounts.clear();
        this.cancelHoverExpand();
        this.update((state) => {
            state.draggingValue = null;
            state.dragOverValue = null;
        });
    };

    onDragEnter = (e: React.DragEvent<HTMLDivElement>, rowIndex: number) => {
        if (!this.canDropRow(rowIndex) || !this.acceptsDrag(e.dataTransfer)) return;
        const row = this.tree.rows.value[rowIndex];
        if (!row) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isFileDrag(e.dataTransfer) ? "copy" : "move";
        if (this.dragEnterCounts.enter(row.value)) {
            this.update((state) => { state.dragOverValue = row.value; });
            this.scheduleHoverExpand(row);
        }
    };

    onDragOver = (e: React.DragEvent<HTMLDivElement>, rowIndex: number) => {
        if (!this.canDropRow(rowIndex) || !this.acceptsDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isFileDrag(e.dataTransfer) ? "copy" : "move";
    };

    onDragLeave = (_e: React.DragEvent<HTMLDivElement>, rowIndex: number) => {
        const row = this.tree.rows.value[rowIndex];
        if (!row) return;
        if (!this.dragEnterCounts.leave(row.value)) return;
        this.cancelHoverExpand();
        this.update((state) => {
            if (state.dragOverValue === row.value) state.dragOverValue = null;
        });
    };

    onDrop = (e: React.DragEvent<HTMLDivElement>, rowIndex: number) => {
        if (!this.canDropRow(rowIndex)) return;
        e.preventDefault();
        e.stopPropagation();
        this.dragEnterCounts.clear();
        this.cancelHoverExpand();
        const payload = getTraitDragDataFromEvent(e);
        this.update((state) => {
            state.dragOverValue = null;
            state.draggingValue = null;
        });
        if (!payload) return;
        const row = this.tree.rows.value[rowIndex];
        if (!row) return;
        if (this.tree.props.canTraitDrop?.(row.source, payload, row.level) ?? true) {
            this.tree.props.onTraitDrop?.(row.source, payload, row.level);
        }
    };

    dispose() {
        this.cancelHoverExpand();
        this.dragEnterCounts.clear();
    }

    private acceptsDrag(dataTransfer: DataTransfer): boolean {
        return hasTraitDragData(dataTransfer)
            || (!!this.tree.props.acceptsFileDrop && isFileDrag(dataTransfer));
    }

    private update(update: (state: TreeState) => void) {
        queueMicrotask(() => {
            if (!this.tree.isLive) return;
            this.tree.state.update(update);
        });
    }

    private scheduleHoverExpand(row: TreeRow<T>) {
        this.cancelHoverExpand();
        const delay = this.tree.props.expandOnDragHoverDelay ?? 500;
        if (delay <= 0 || !row.hasChildren || row.expanded) return;
        this.hoverExpandTimer = window.setTimeout(() => {
            this.hoverExpandTimer = null;
            if (!this.tree.isLive || this.tree.state.get().dragOverValue !== row.value) return;
            const index = this.tree.indexByValue.value.get(row.value);
            const current = index == null ? undefined : this.tree.rows.value[index];
            if (index != null && current && !current.expanded) this.tree.toggleAt(index);
        }, delay);
    }

    private cancelHoverExpand() {
        if (this.hoverExpandTimer != null) window.clearTimeout(this.hoverExpandTimer);
        this.hoverExpandTimer = null;
    }
}
