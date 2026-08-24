/**
 * The mounting shim: one av-grid instance, owned by a `VanillaView`.
 *
 * This is deliberately *not* a reconciliation layer (EPIC-057 C4-2). The former React grid was
 * fully controlled — the caller held rows, columns, focus, selection and the edit path in state
 * and passes them down. av-grid is the opposite: `AVGrid.create()` returns an instance that *owns*
 * that state, and options are initial values. The inversion is absorbed by each consumer, in the
 * model that already owns its persisted view state. All this file does is mount, forward, and
 * dispose.
 *
 * ## Two prop tiers, and why
 *
 * `mountVanilla`'s host calls `view.update(props)` on **every** parent render
 * (`shared/mount.tsx`), and a JSX caller builds a new props object each time. Pushing all of it
 * into `setOptions` would hand av-grid fresh `rows` / `columns` array identities constantly.
 *
 *  • **Callbacks** are bound once, at `create()`, as stable trampolines that read `this.props`
 *    live. Their identity is never re-pushed — an inline arrow in JSX changes identity on every
 *    render and would produce a `setOptions` call per render for nothing. Handler *behaviour*
 *    still updates, because the trampoline reads the current props when it fires. Only a change
 *    in **presence** is pushed, and only because presence is meaningful to av-grid: an
 *    `onGridContextMenu` that exists replaces the built-in menu, a `getRowKey` that exists
 *    suppresses key inference, and a `newRow` that exists overrides the default blank row. A
 *    trampoline for a prop the host never passed would silently return `undefined` into each of
 *    those decisions, so absent props get no trampoline at all.
 *  • **Values** are shallow-diffed by identity against the last pushed set, and only the changed
 *    keys reach `setOptions`.
 *
 * The value tier is derived by *exclusion*, not by an allow-list: any option av-grid adds in a
 * future version flows through without an edit here, which is the point of a shim whose props are
 * the library's own option names.
 */

import { AVGrid } from "av-grid";

import { VanillaView } from "../shared/vanilla-view";
import { CellTooltip } from "./cell-tooltip";
import type { DataGridInstance, DataGridProps } from "./types";
import "./DataGrid.css";

/**
 * The callback tier: forwarded through trampolines, diffed on presence only.
 *
 * `getRowKey`, `newRow`, `newColumn`, `onCellClass`, `rowClass`, `onGetOptions` and
 * `getContextMenuItems` are here despite not being `on*`-shaped: they are functions the grid
 * calls, so re-pushing them on identity change would be pure waste.
 */
const CALLBACK_KEYS = [
    "getContextMenuItems",
    "getRowKey",
    "newColumn",
    "newRow",
    "onAddColumns",
    "onAddRows",
    "onCellClass",
    "onCellClick",
    "onCellContextMenu",
    "onCellDoubleClick",
    "onColumnResize",
    "onColumnsChange",
    "onColumnsReorder",
    "onDeleteColumns",
    "onDeleteRows",
    "onEdit",
    "onFiltersChange",
    "onFocusChange",
    "onGetOptions",
    "onGridContextMenu",
    "onInvalidEdit",
    "onSelectionChange",
    "onSortChange",
    "onVisibleRowsChange",
    "rowClass",
] as const satisfies readonly (keyof DataGridProps)[];

const CALLBACK_KEY_SET: ReadonlySet<string> = new Set<string>(CALLBACK_KEYS);

/**
 * Props that are read at `create()` and never pushed again.
 *
 * `selected` is an *initial* option in av-grid: the grid owns the selection afterwards and reports
 * it through `onSelectionChange`. Re-pushing it on every render would fight the user's clicks.
 * `onGrid` belongs to this shim and is not an av-grid option at all.
 */
const INITIAL_ONLY_KEYS: ReadonlySet<string> = new Set<string>(["selected", "onGrid"]);

export class DataGridView<R = any> extends VanillaView<DataGridProps<R>> {
    /** The live instance, or `undefined` before mount and after dispose. */
    grid: DataGridInstance<R> | undefined;

    /** The value-tier options most recently handed to av-grid, for the identity diff. */
    private pushed: Record<string, unknown> = {};

    /** Callback props that currently have a trampoline installed — tracked by presence only. */
    private readonly bound = new Set<string>();

    /** Hover-to-read for clipped cells. Owned here so every consumer gets it — see `cell-tooltip`. */
    private cellTooltip: CellTooltip | undefined;

    // Rule 9: a concrete view declares a public constructor even when it only forwards.
    constructor(props: DataGridProps<R>) {
        const root = document.createElement("div");
        root.dataset.type = "data-grid";
        super(props, root);
    }

    protected onMount(): void {
        const values = this.collectValues(this.props);
        this.pushed = values;

        this.grid = AVGrid.create(this.root, {
            ...(values as Partial<DataGridProps<R>>),
            ...this.syncTrampolines(this.props),
            // The library's own sheet is unlayered and would outrank every layered rule in the
            // app. `DataGrid.css` imports it into `@layer uikit` instead.
            injectStyles: false,
        } as any);

        // Registered before the grid-destroy disposer below, because disposal runs in
        // registration order and the tooltip's listeners must be gone before the grid they read
        // from is torn down.
        this.cellTooltip = new CellTooltip(this.root, () => this.grid, this.props.name);
        this.own(() => {
            this.cellTooltip?.dispose();
            this.cellTooltip = undefined;
        });

        const grid = this.grid;
        this.own(() => {
            this.grid = undefined;
            grid.destroy();
        });

        this.props.onGrid?.(grid);
    }

    protected onUpdate(props: DataGridProps<R>): void {
        const grid = this.grid;
        if (!grid || grid.isDestroyed()) return;

        const next = this.collectValues(props);
        const delta: Record<string, unknown> = {};
        let changed = false;

        // The union of both key sets: a prop that disappears has to be pushed as `undefined`, or
        // the grid would keep applying an option the caller has stopped passing.
        for (const key of new Set([...Object.keys(this.pushed), ...Object.keys(next)])) {
            if (this.pushed[key] !== next[key]) {
                delta[key] = next[key];
                changed = true;
            }
        }

        const callbackDelta = this.syncTrampolines(props);
        for (const [key, value] of Object.entries(callbackDelta)) {
            delta[key] = value;
            changed = true;
        }

        this.pushed = next;
        if (changed) {
            this.pushDelta(grid, delta);
        }
    }

    /**
     * Apply a delta, splitting a simultaneous columns+rows change into a safe order.
     *
     * `setOptions` applies columns **before** rows internally, and `setColumns` validates every
     * column against the data the grid is holding *at that moment* — so a schema change pushed as
     * one delta validates the new columns against the **old** rows and throws
     * `AVGridError: Unknown column "…"`. That is not hypothetical: it is what a recycled grid cell
     * re-pointed from one dataset to another does every time, and no amount of total-writing the
     * delta avoids it, because the fault is in the order the library applies a single call.
     *
     * Clearing columns first makes the intermediate state trivially valid — validating an empty
     * column set against any rows cannot fail — so rows land unguarded and the real columns are
     * then checked against the data they belong to. All three calls happen in one task, so no
     * frame is painted with the empty column set.
     */
    private pushDelta(grid: DataGridInstance<R>, delta: Record<string, unknown>): void {
        const hasColumns = Object.prototype.hasOwnProperty.call(delta, "columns");
        const hasRows = Object.prototype.hasOwnProperty.call(delta, "rows");
        if (!hasColumns || !hasRows) {
            grid.setOptions(delta as Partial<DataGridProps<R>>);
            return;
        }

        // Rows first, then columns. Never push an empty column set to reach the same ordering: an
        // observable intermediate state can be reported back through the grid's own callbacks and
        // re-enter this update through the owning model, which loops.
        const { columns, ...withoutColumns } = delta;
        grid.setOptions(withoutColumns as Partial<DataGridProps<R>>);
        grid.setOptions({ columns } as Partial<DataGridProps<R>>);
    }

    /**
     * Forget the previous occupant's value baseline before a recycled host is re-pointed.
     * Equality against that invisible occupant is not meaningful: the next update must push
     * every value the new owner supplies, including equal-looking rows or columns.
     */
    invalidatePushed(): void {
        this.pushed = {};
    }

    protected onDispose(): void {
        // `destroy()` is already registered by `own()` in onMount — do not call it twice.
        this.props.onGrid?.(null);
    }

    /** Every prop that is neither a callback nor initial-only, with `undefined` entries dropped. */
    private collectValues(props: DataGridProps<R>): Record<string, unknown> {
        const values: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(props)) {
            if (CALLBACK_KEY_SET.has(key) || INITIAL_ONLY_KEYS.has(key)) continue;
            if (value === undefined) continue;
            values[key] = value;
        }
        return values;
    }

    /**
     * Install or remove trampolines so that av-grid sees a function for exactly the callback props
     * the host is currently passing. Returns only what changed.
     *
     * The trampoline forwards the return value rather than swallowing it: `onEdit`, `onAddRows`,
     * `onDeleteRows`, `onAddColumns` and `onDeleteColumns` all use a `false` return to veto the
     * operation.
     */
    private syncTrampolines(props: DataGridProps<R>): Record<string, unknown> {
        const delta: Record<string, unknown> = {};
        for (const key of CALLBACK_KEYS) {
            const present = props[key] !== undefined;
            if (present === this.bound.has(key)) continue;

            if (present) {
                this.bound.add(key);
                delta[key] = (...args: unknown[]): unknown => {
                    const handler = this.props[key] as ((...a: unknown[]) => unknown) | undefined;
                    return handler?.(...args);
                };
            } else {
                this.bound.delete(key);
                delta[key] = undefined;
            }
        }
        return delta;
    }
}
