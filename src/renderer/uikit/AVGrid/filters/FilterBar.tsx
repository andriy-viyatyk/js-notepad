import { clsx } from "clsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";

import { FiltersModel, NO_FILTERS, TShowFilterPoper } from "./FiltersModel";
import { TFilter, TOptionsFilter } from "../avGridTypes";
import { formatDispayValue } from "../avGridUtils";
import {
    ChevronDownIcon,
    ChevronUpIcon,
    CloseIcon,
    RefreshIcon,
} from "../../../theme/icons";
import { Tag } from "../../Tag";
import { IconButton } from "../../IconButton";
import color from "../../../theme/color";
import { AVGridModel } from "../model/AVGridModel";

const FilterChipLabel = styled.span({
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    "& .filter-chip-name": {
        color: color.text.light,
    },
    "& .filter-chip-values": {
        marginLeft: 4,
        textOverflow: "ellipsis",
        overflow: "hidden",
        paddingRight: 2,
        color: color.text.default,
    },
    "& .filter-chip-open-icon": {
        display: "inline-block",
        padding: "0 4px",
        borderRight: `solid 1px ${color.border.default}`,
        width: 16,
        height: 16,
    },
    "&.disabled": {
        color: color.icon.disabled,
    },
    "& .empty-label": {
        fontStyle: "italic",
    },
});

const FilterBarRoot = styled.div({
    padding: "2px 4px",
    borderBottom: `solid 1px ${color.border.light}`,
    backgroundColor: color.background.dark,
    display: "flex",
    alignItems: "center",
    "&.no-filters": {
        display: "none",
    },
    "& .chips-content": {
        flex: "1 1 auto",
        display: "flex",
        rowGap: 8,
        columnGap: 8,
        flexWrap: "wrap",
    },
    "& .clear-filters-button": {
        marginRight: 4,
    },
});

const maxFilterLabelCharCount = 25;

function optionsFilterValues(filter: TOptionsFilter, maxCharCount: number) {
    if (filter.value) {
        const values = [...filter.value];
        let textRes = "";
        const res = [];
        let idx = 0;
        while (textRes.length < maxCharCount && values.length) {
            let el = formatDispayValue(
                values.shift()?.label,
                filter.displayFormat
            );

            if (textRes.length + el.length > maxCharCount) {
                el = el.substring(0, maxCharCount - textRes.length);
            }

            res.push(
                <React.Fragment key={++idx}>
                    {textRes ? "," : ""}
                    {el}
                </React.Fragment>
            );
            textRes += `${textRes ? "," : ""}${el}`;
        }

        res.push(
            <React.Fragment key={++idx}>
                {values.length ? ` (+${values.length})` : ""}
            </React.Fragment>
        );
        return res;
    }
    return "";
}

function filterValues(filter: TFilter, maxCharCount: number) {
    switch (filter.type) {
        case "options":
            return optionsFilterValues(filter as TOptionsFilter, maxCharCount);
        default:
            return "";
    }
}

interface FilterChipProps {
    filter: TFilter;
    showFilterPoper: TShowFilterPoper;
    onDelete: (filter: TFilter) => void;
    disabled?: boolean;
}

export function FilterChip(props: FilterChipProps) {
    const { filter, showFilterPoper, onDelete, disabled } = props;
    const [open, setOpen] = useState(false);
    const chipRef = useRef<HTMLSpanElement>(null);
    const liveRef = useRef(false);

    useEffect(() => {
        liveRef.current = true;
        return () => {
            liveRef.current = false;
        };
    }, []);

    const handleDelete = useCallback(() => {
        onDelete(filter);
    }, [filter, onDelete]);

    const handleClick = useCallback(
        async (e: React.MouseEvent) => {
            setOpen(true);
            await showFilterPoper(
                filter,
                chipRef.current ?? undefined,
                {
                    x: e.clientX,
                    y: e.clientY,
                },
                // y=4 (was 2): the chip ref points to the inner FilterChipLabel,
                // which sits inside the Tag's padding+border. The extra 2px clears
                // the Tag chrome so the popover doesn't overlap the chip edge.
                { x: 0, y: 4 }
            );
            if (liveRef.current) {
                setOpen(false);
            }
        },
        [filter, showFilterPoper]
    );

    // Tag's body click does not give us a MouseEvent, so we attach the
    // chip-anchor positioning data via a wrapping span ref + ambient handler.
    const label = (
        <FilterChipLabel
            ref={chipRef}
            className={clsx({ disabled: disabled })}
            onClick={(e) => {
                if (disabled) return;
                e.stopPropagation();
                handleClick(e);
            }}
        >
            <span className="filter-chip-name">{filter.columnName}:</span>
            <span className="filter-chip-values">
                {filterValues(filter, maxFilterLabelCharCount)}
            </span>
            {open ? (
                <ChevronUpIcon className="filter-chip-open-icon" />
            ) : (
                <ChevronDownIcon className="filter-chip-open-icon" />
            )}
        </FilterChipLabel>
    );

    return (
        <Tag
            name="avgrid-filter-chip"
            label=""
            size="sm"
            onRemove={handleDelete}
            disabled={disabled}
            selected={open}
            removeAriaLabel="Remove filter"
        >
            {label}
        </Tag>
    );
}

export interface FilterBarProps {
    /** Optional debug label emitted as `data-name` on the FilterBar root. */
    name?: string;
    disabled?: boolean;
    gridModel?: AVGridModel<any>;
    filtersModel?: FiltersModel;
}

export function FilterBar(props: FilterBarProps) {
    const { name, disabled, gridModel, filtersModel } = props;
    const activeFiltersModel = filtersModel ?? NO_FILTERS;
    const { filters, setFilters, showFilterPoper } = {
        filters: activeFiltersModel.props.filters,
        setFilters: activeFiltersModel.props.setFilters,
        showFilterPoper: activeFiltersModel.showFilterPoper,
    };
    const [frozen, setFrozen] = useState(false);

    useEffect(() => {
        const subs = gridModel?.data.onChange.subscribe(e => {
            if (e?.rowsFrozen) {
                setFrozen(gridModel.data.rowsFrozen);
            }
        });
        return () => {
            subs?.unsubscribe();
        };
    }, [gridModel]);

    const onDelete = useCallback(
        (filter: TFilter) => {
            setFilters(filters.filter((f) => f !== filter));
        },
        [filters, setFilters]
    );

    return (
        <FilterBarRoot
            data-type="filter-bar"
            data-name={name}
            className={clsx({
                "no-filters": filters.length === 0,
            })}
        >
            <div className="chips-content">
                {filters.map((f) => (
                    <FilterChip
                        key={f.columnKey}
                        filter={f}
                        showFilterPoper={showFilterPoper}
                        onDelete={onDelete}
                        disabled={disabled}
                    />
                ))}
                {frozen && (
                    <IconButton
                        name="avgrid-unfreeze-rows"
                        icon={<RefreshIcon />}
                        size="sm"
                        onClick={() => { gridModel?.models.rows.unfreezeRows(); }}
                        title="Rows are frozen while editing. Click to unfreeze."
                    />
                )}
            </div>
            <IconButton
                name="avgrid-clear-filters"
                icon={<CloseIcon />}
                size="sm"
                className="clear-filters-button"
                onClick={() => setFilters([])}
                disabled={disabled}
                title="Remove all filters"
            />
        </FilterBarRoot>
    );
}
