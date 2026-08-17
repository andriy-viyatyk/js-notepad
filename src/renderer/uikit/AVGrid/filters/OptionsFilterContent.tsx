import React, {
    CSSProperties,
    useCallback,
    useMemo,
    useState,
} from "react";
import styled from "@emotion/styled";

import { MultiListBox } from "../../MultiListBox";
import { Button } from "../../Button";
import { TDisplayOption, TFilterType, TOptionsFilter } from "../avGridTypes";
import { FiltersModel, TOnGetFilterOptions } from "./FiltersModel";
import type { AVGridModel } from "../model/AVGridModel";
import { useResolveOptions } from "../useResolveOptions";

const Root = styled.div<{ width: CSSProperties["width"] }>(
    (props) => ({
        minWidth: props.width,
        display: "flex",
        flexDirection: "column",
        flex: "1 1 auto",
        minHeight: 0,
        "& .list-wrap": {
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            padding: "0 4px",
        },
        "& .buttonsContainer": {
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            columnGap: 12,
            padding: 4,
        },
    }),
);

const minWidth = 260;

/** Local label used when an option's value is null/undefined. Inlined from the
 *  former `components/form/utils` `emptyLabel` so AVGrid no longer reaches into
 *  the legacy form/ folder. */
const emptyLabel = "(empty)";

interface OptionsFilterContentProps {
    model: AVGridModel<any>;
    filtersModel: FiltersModel;
    filter: TOptionsFilter;
    onApplyFilter: (filter: TOptionsFilter) => void;
    width?: number;
    onGetOptions: TOnGetFilterOptions;
    columnFilterType: TFilterType;
    resized?: boolean;
}

export function OptionsFilterContent(
    props: Readonly<OptionsFilterContentProps>,
) {
    const { filter, onApplyFilter, width = minWidth, onGetOptions, model, filtersModel } = props;

    const [selected, setSelected] = useState<TDisplayOption[]>(
        filter.type === "options" && Array.isArray(filter.value)
            ? filter.value
            : [],
    );

    const { filters } = filtersModel.props;

    const optionsOrPromise = useMemo(() => {
        return onGetOptions(model.data.columns, filters, filter.columnKey, undefined);
    }, [onGetOptions, filter.columnKey, model, filters]);

    const [options] = useResolveOptions<TDisplayOption>(optionsOrPromise);

    // Put already-selected options at the top so the user sees their selection
    // immediately without scrolling. Matches legacy ListMultiselect behaviour.
    const reorderedOptions = useMemo(() => {
        if (
            filter.type === "options" &&
            Array.isArray(filter.value) &&
            options.length
        ) {
            const sel = options.filter((o) =>
                filter.value?.find((v) => v.value === o.value),
            );
            return [...sel, ...options.filter((o) => !sel.includes(o))];
        }
        return [...options];
    }, [filter, options]);

    // MultiListBox renders TDisplayOption directly as IListBoxItem (value/label
    // shapes match). Empty-string labels become "(empty)" so the row reads as
    // intentional rather than blank. Italic styling for empty/italic options is
    // dropped in this migration — minor cosmetic regression, can be added back
    // via a custom renderItem if/when needed.
    const items = useMemo(() => {
        return reorderedOptions.map((o) => ({
            value: o.value as string | number,
            label: typeof o.label === "string" && o.label.length === 0 ? emptyLabel : o.label,
        }));
    }, [reorderedOptions]);

    const value = useMemo(() => {
        return selected.map((o) => ({
            value: o.value as string | number,
            label: typeof o.label === "string" && o.label.length === 0 ? emptyLabel : o.label,
        }));
    }, [selected]);

    const handleSelectionChange = useCallback(
        (next: { value: string | number; label: React.ReactNode }[]) => {
            // Map back to TDisplayOption preserving label provenance.
            const result: TDisplayOption[] = next.map((it) => {
                const src = reorderedOptions.find((o) => o.value === it.value);
                return src ?? { value: it.value, label: String(it.label ?? "") };
            });
            setSelected(result);
        },
        [reorderedOptions],
    );

    const onApply = useCallback(() => {
        if (filter.type === "options") {
            const applySelected = selected.filter(
                (o, idx, arr) =>
                    arr.findIndex(
                        (i) => i.label === o.label && i.value === o.value,
                    ) === idx,
            );
            onApplyFilter({
                ...filter,
                type: filter.type,
                value: applySelected.length ? applySelected : undefined,
            });
        }
    }, [filter, onApplyFilter, selected]);

    const onClear = useCallback(() => {
        onApplyFilter({ ...filter, value: undefined });
    }, [filter, onApplyFilter]);

    return (
        <Root width={Math.max(width, minWidth)}>
            <div className="list-wrap">
                <MultiListBox
                    name="avgrid-options-filter"
                    items={items}
                    value={value}
                    onChange={handleSelectionChange}
                    selectAll
                    height="100%"
                />
            </div>
            <div className="buttonsContainer">
                <Button onClick={onApply} disabled={!selected.length}>
                    Apply
                </Button>
                <Button onClick={onClear}>Clear</Button>
            </div>
        </Root>
    );
}
