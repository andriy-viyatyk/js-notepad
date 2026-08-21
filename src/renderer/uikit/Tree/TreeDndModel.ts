import type React from "react";
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

    onDragStart = (e: DragEvent, rowIndex: number) => {
        const row = this.tree.rows.value[rowIndex];
        if (!row || row.item.section || row.item.disabled) {
            e.preventDefault();
            return;
        }
        // The public prop keeps its `React.DragEvent` signature — Epic F owns API cleanup — and its
        // one consumer only calls `dataTransfer`/`preventDefault`, which exist on the native event.
        if (
            this.tree.props.onDragStartOverride?.(
                row.source,
                row.level,
                e as unknown as React.DragEvent,
            )
        ) {
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

    onDragEnter = (e: DragEvent, rowIndex: number) => {
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

    onDragOver = (e: DragEvent, rowIndex: number) => {
        if (!this.canDropRow(rowIndex) || !this.acceptsDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isFileDrag(e.dataTransfer) ? "copy" : "move";
    };

    onDragLeave = (_e: DragEvent, rowIndex: number) => {
        const row = this.tree.rows.value[rowIndex];
        if (!row) return;
        if (!this.dragEnterCounts.leave(row.value)) return;
        this.cancelHoverExpand();
        this.update((state) => {
            if (state.dragOverValue === row.value) state.dragOverValue = null;
        });
    };

    onDrop = (e: DragEvent, rowIndex: number) => {
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

    /**
     * Every drag state write goes through the model's funnel, which is also what repaints.
     *
     * This is the one site that had no repaint of its own — it relied entirely on the repaint
     * `effect()` that the vanilla conversion deleted, so without the funnel a drag produces no
     * `data-dragging` / `data-drop-active` at all, with no error anywhere.
     *
     * The `queueMicrotask` this replaces was a React workaround (a synchronous `state.update` from
     * a render-phase path tripped React's "cannot update while rendering" warning). Every caller
     * here is a native drag event, and the schedule change is unobservable: the browser fires
     * `dragenter` on the new row before `dragleave` on the old, so the order of writes — and hence
     * `onDragLeave`'s guard — is the same either way.
     */
    private update(update: (state: TreeState) => void) {
        if (!this.tree.isLive) return;
        this.tree.mutateState(update);
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
