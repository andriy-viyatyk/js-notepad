import { TComponentModel } from "../../core/state/model";
import { isTraited, traited, Traited } from "../../core/traits/traits";
import { IListBoxItem, LIST_ITEM_KEY } from "../ListBox";
import type { MultiListBoxProps } from "./MultiListBox";

export interface MultiListBoxState {
    searchText: string;
    activeIndex: number | null;
}

export const defaultMultiListBoxState: MultiListBoxState = {
    searchText: "",
    activeIndex: null,
};

interface ResolvedItems<T> {
    resolved: IListBoxItem[];
    sources: T[];
    extractValue: (value: T) => string | number;
}

function resolveItems<T>(items: T[] | Traited<unknown[]>): ResolvedItems<T> {
    if (isTraited<unknown[]>(items)) {
        const accessor = items.traits.get(LIST_ITEM_KEY);
        const sources = items.target as T[];
        if (accessor) {
            return {
                resolved: sources.map((value) => ({
                    value: accessor.value(value) as string | number,
                    label: accessor.label(value),
                    icon: accessor.icon?.(value),
                    disabled: accessor.disabled ? Boolean(accessor.disabled(value)) : undefined,
                })),
                sources,
                extractValue: (value) => accessor.value(value) as string | number,
            };
        }
        return {
            resolved: sources as unknown as IListBoxItem[],
            sources,
            extractValue: (value) => (value as unknown as IListBoxItem).value,
        };
    }
    return {
        resolved: items as unknown as IListBoxItem[],
        sources: items,
        extractValue: (value) => (value as unknown as IListBoxItem).value,
    };
}

function matches(item: IListBoxItem, query: string, mode: "contains" | "startsWith" | "off"): boolean {
    if (mode === "off" || query === "") return true;
    const label = typeof item.label === "string" ? item.label.toLowerCase() : "";
    const normalizedQuery = query.toLowerCase();
    return mode === "startsWith" ? label.startsWith(normalizedQuery) : label.includes(normalizedQuery);
}

/** Controlled multi-select list state, filtering and selection operations. */
export class MultiListBoxModel<T = IListBoxItem> extends TComponentModel<
    MultiListBoxState,
    MultiListBoxProps<T>
> {
    resolvedItems = this.memo<ResolvedItems<T>>(
        () => resolveItems(this.props.items),
        () => [this.props.items],
    );

    selectedKeys = this.memo<Set<string | number>>(
        () => new Set(this.props.value.map(this.resolvedItems.value.extractValue)),
        () => [this.props.value, this.resolvedItems.value],
    );

    filtered = this.memo<{ sources: T[]; items: IListBoxItem[] }>(
        () => {
            const { resolved, sources } = this.resolvedItems.value;
            const { searchText } = this.state.get();
            const mode = this.props.filterMode ?? "contains";
            const filteredSources: T[] = [];
            const filteredItems: IListBoxItem[] = [];
            for (let index = 0; index < resolved.length; index++) {
                if (matches(resolved[index], searchText, mode)) {
                    filteredSources.push(sources[index]);
                    filteredItems.push(resolved[index]);
                }
            }
            return { sources: filteredSources, items: filteredItems };
        },
        () => [this.resolvedItems.value, this.state.get().searchText, this.props.filterMode],
    );

    listBoxItems = this.memo<T[] | Traited<unknown[]>>(
        () => {
            const { items } = this.props;
            return isTraited<unknown[]>(items)
                ? traited(this.filtered.value.sources, items.traits)
                : this.filtered.value.sources;
        },
        () => [this.props.items, this.filtered.value.sources],
    );

    visibleSelectedCount = this.memo<number>(
        () => this.filtered.value.items.filter((item) => this.selectedKeys.value.has(item.value)).length,
        () => [this.filtered.value.items, this.selectedKeys.value],
    );

    get allVisibleSelected(): boolean {
        return this.filtered.value.items.length > 0
            && this.visibleSelectedCount.value === this.filtered.value.items.length;
    }

    get someVisibleSelected(): boolean {
        return this.visibleSelectedCount.value > 0 && !this.allVisibleSelected;
    }

    setSearchText = (searchText: string) => {
        this.state.update((state) => { state.searchText = searchText; });
    };

    setActiveIndex = (activeIndex: number | null) => {
        this.state.update((state) => { state.activeIndex = activeIndex; });
    };

    isSelected = (source: T): boolean => this.selectedKeys.value.has(this.resolvedItems.value.extractValue(source));

    toggle = (source: T) => {
        if (this.props.disabled || this.props.readOnly) return;
        const { extractValue } = this.resolvedItems.value;
        const key = extractValue(source);
        this.props.onChange(
            this.selectedKeys.value.has(key)
                ? this.props.value.filter((value) => extractValue(value) !== key)
                : [...this.props.value, source],
        );
    };

    toggleSelectAll = () => {
        if (this.props.disabled || this.props.readOnly) return;
        const { items, sources } = this.filtered.value;
        const { extractValue } = this.resolvedItems.value;
        const visibleKeys = new Set(items.map((item) => item.value));
        if (this.allVisibleSelected) {
            this.props.onChange(this.props.value.filter((value) => !visibleKeys.has(extractValue(value))));
            return;
        }
        const next = this.props.value.slice();
        items.forEach((item, index) => {
            if (!this.selectedKeys.value.has(item.value)) next.push(sources[index]);
        });
        this.props.onChange(next);
    };
}
