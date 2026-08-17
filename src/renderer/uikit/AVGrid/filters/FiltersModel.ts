import { Column, TAnyFilter, TDisplayOption, TFilter, TPoint } from "../avGridTypes";
import { isNullOrUndefined } from "../../../core/utils/utils";
import { TComponentState } from "../../../core/state/state";
import { TComponentModel } from "../../../core/state/model";

export type TOnGetFilterOptions = (
    columns: Column[],
    filters: TFilter[],
    columnKey: string,
    search?: string,
) => TDisplayOption[] | Promise<TDisplayOption[]>;

export interface FiltersModelProps {
    filters: TFilter[];
    setFilters: (filters: TFilter[]) => void;
    onGetOptions: TOnGetFilterOptions;
}

export type TShowFilterPoper = (
    filter: TFilter,
    anchorEl?: HTMLElement,
    position?: TPoint,
    adjustPosition?: TPoint,
) => Promise<void>;

export interface FilterPopoverData {
    filter: TFilter;
    position?: TPoint;
    anchorEl?: HTMLElement;
    adjustPosition?: TPoint;
    onClose: () => void;
    onApplyFilter: (filter: TFilter) => void;
    closeFilterPoper: () => void;
}

interface FiltersModelState {
    poperData?: FilterPopoverData;
}

const defaultFiltersModelState: FiltersModelState = {};

export class FiltersModel extends TComponentModel<FiltersModelState, FiltersModelProps> {
    showFilterPoper: TShowFilterPoper = (
        filter,
        anchorEl,
        position,
        adjustPosition,
    ) => {
        return new Promise<void>((resolve) => {
            this.closeFilterPoper();
            const existing = this.props.filters.find(
                (f) => f.columnKey === filter.columnKey,
            ) ?? filter;
            this.state.update((s) => {
                s.poperData = {
                    filter: existing,
                    position,
                    anchorEl,
                    adjustPosition,
                    onClose: resolve,
                    onApplyFilter: this.applyFilter,
                    closeFilterPoper: this.closeFilterPoper,
                };
            });
        });
    };

    closeFilterPoper = () => {
        const poperData = this.state.get().poperData;
        if (!poperData) return;
        poperData.onClose();
        this.state.update((s) => {
            s.poperData = undefined;
        });
    };

    applyFilter = (filter: TFilter) => {
        let newFilters = [...this.props.filters];
        if (isNullOrUndefined((filter as TAnyFilter).value)) {
            newFilters = newFilters.filter((f) => f.columnKey !== filter.columnKey);
        } else {
            const current = newFilters.find((f) => f.columnKey === filter.columnKey);
            if (current) {
                newFilters = newFilters.map((f) =>
                    f.columnKey === filter.columnKey ? filter : f,
                );
            } else {
                newFilters.push(filter);
            }
        }
        this.props.setFilters(newFilters);
    };

    dispose = () => {
        this.closeFilterPoper();
    };
}

const NOOP_FILTERS_PROPS: FiltersModelProps = {
    filters: [],
    setFilters: () => {},
    onGetOptions: () => [],
};

/** Shared behavior for AVGrid instances that do not participate in filtering. */
export const NO_FILTERS = new FiltersModel(
    new TComponentState(defaultFiltersModelState),
);
NO_FILTERS.setPropsInternal(NOOP_FILTERS_PROPS);

export function resolveFiltersModel(model?: FiltersModel): FiltersModel {
    return model ?? NO_FILTERS;
}
