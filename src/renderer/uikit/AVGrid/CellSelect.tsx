import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Ref } from "react";
import styled from "@emotion/styled";
import { Select } from "../Select";
import type { IListBoxItem } from "../ListBox";

/**
 * Cell-edit wrapper over `uikit/Select`. Used inside AVGrid's
 * `DefaultEditFormater` for `Column.options`-backed dropdown editing.
 *
 * Responsibilities:
 *   • Autofocus the inner input on mount (opens the popover via Select's
 *     focus-triggered open).
 *   • Forward selection via `onChange` (AVGrid commits and exits edit mode
 *     immediately on item pick — same as legacy behaviour).
 *   • Forward Escape via `onCancel` so AVGrid's EditingModel can call
 *     `closeEdit(false)`. UIKit Select stops Esc propagation internally;
 *     without this hook the grid's content keydown handler would not see it.
 *   • Fit the wrapped Select flush inside the cell via descendant selectors.
 */
export interface CellSelectProps<T = unknown> {
    ref?: Ref<HTMLInputElement>;
    name?: string;
    /** Current value (free-form — Select renders by matching against `options`). */
    value: T | null | undefined;
    /** Options source. AVGrid `Column.options` shape — accepts a sync array or async
     *  function. The wrapper resolves both forms before forwarding to Select. */
    options: T[] | (() => T[] | Promise<T[]>);
    /** Fires when the user picks an option. AVGrid uses this to set
     *  `cellEdit.value`/`changed` and call `closeEdit(true, true)`. */
    onChange: (value: T) => void;
    /** Fires when the user presses Escape inside the open popover. */
    onCancel?: () => void;
}

const Root = styled.div({
    position: "absolute",
    inset: 1,
    display: "flex",
    // Mirror CellInput's cell-fit overrides — UIKit Select wraps a UIKit Input
    // whose `data-size="md"` enforces a 26px height. Override to fill the cell
    // (`cell.height - 2px`) and align the inner field text to the cell's
    // `padding: 0 4px` baseline (1px Root inset + 3px field padding = 4px).
    '& [data-type="select"]': {
        flex: 1,
        minWidth: 0,
        height: "100%",
    },
    '& [data-type="select"] [data-type="input"]': {
        border: "none",
        borderRadius: 0,
        backgroundColor: "transparent",
        height: "100%",
    },
    '& [data-type="select"] [data-type="input"] input': {
        paddingLeft: 3,
        paddingRight: 3,
        fontSize: "inherit",
    },
});

export function CellSelect<T = unknown>({ name, value, options, onChange, onCancel, ref }: CellSelectProps<T>) {
    const innerRef = useRef<HTMLInputElement | null>(null);

    // Bridge AVGrid `Column.options` (T[] | () => T[] | Promise<T[]>) to UIKit
    // Select's `ItemsSource<T>` (T[] | Traited<T[]> | Promise<T[]> | (() => ...)).
    // For raw-T inputs we synthesize a minimal IListBoxItem ({ value, label }) so
    // Select can render and filter without consumer-provided accessors.
    const resolvedItems = useMemo<IListBoxItem[] | (() => IListBoxItem[] | Promise<IListBoxItem[]>)>(() => {
        const toItem = (v: unknown): IListBoxItem => ({
            value: v as IListBoxItem["value"],
            label: v == null ? "" : String(v),
        });
        if (typeof options === "function") {
            return () => {
                const raw = (options as () => T[] | Promise<T[]>)();
                if (raw instanceof Promise) return raw.then((arr) => arr.map(toItem));
                return raw.map(toItem);
            };
        }
        return options.map(toItem);
    }, [options]);

    const selected = useMemo<IListBoxItem | null>(() => {
        if (value == null) return null;
        return { value: value as IListBoxItem["value"], label: String(value) };
    }, [value]);

    const handleChange = useCallback(
        (item: IListBoxItem) => {
            onChange(item.value as T);
        },
        [onChange],
    );

    useEffect(() => {
        innerRef.current?.focus();
    }, []);

    return (
        <Root onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}>
            <Select<IListBoxItem>
                ref={(el) => {
                    innerRef.current = el;
                    if (typeof ref === "function") ref(el);
                    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
                }}
                name={name}
                items={resolvedItems}
                value={selected}
                onChange={handleChange}
                onEscape={onCancel}
            />
        </Root>
    );
}
