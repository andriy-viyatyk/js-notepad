import React, { useEffect, useMemo, useRef } from "react";
import { Popover, Panel, Text, Button, Spacer, ListBox } from "../../uikit";
import type { IListBoxItem } from "../../uikit";
import type { ListBoxModel } from "../../uikit/ListBox/ListBoxModel";

export type SuggestionsMode = "search" | "navigation";

export interface UrlSuggestionsDropdownProps {
    anchorEl: Element | null;
    open: boolean;
    items: string[];
    mode: SuggestionsMode;
    searchText?: string;
    hoveredIndex: number;
    onHoveredIndexChange: (index: number) => void;
    onSelect: (value: string) => void;
    onClearVisible?: () => void;
}

export function UrlSuggestionsDropdown({
    anchorEl,
    open,
    items,
    mode,
    searchText,
    hoveredIndex,
    onHoveredIndexChange,
    onSelect,
    onClearVisible,
}: UrlSuggestionsDropdownProps) {
    const listBoxModel = useRef<ListBoxModel<IListBoxItem> | null>(null);

    const listItems = useMemo<IListBoxItem[]>(
        () => items.map((s) => ({ value: s, label: s })),
        [items],
    );

    useEffect(() => {
        if (hoveredIndex < 0) return;
        listBoxModel.current?.scrollToIndex(hoveredIndex);
    }, [hoveredIndex]);

    const isOpen = open && anchorEl != null && items.length > 0;
    const showClear = mode === "search" && onClearVisible != null;
    const headerLabel = mode === "search" ? "Search History" : "Navigation History";

    return (
        <Popover
            name="url-suggestions"
            open={isOpen}
            elementRef={anchorEl}
            placement="bottom-start"
            offset={[0, 2]}
            matchAnchorWidth
            onMouseDown={(e) => e.preventDefault()}
        >
            <Panel name="url-suggestions-header" direction="row" align="center" paddingY="sm" paddingX="md">
                <Text size="xs" color="light">{headerLabel}</Text>
                <Spacer />
                {showClear && (
                    <Button name="url-suggestions-clear" size="sm" variant="ghost" onClick={onClearVisible}>
                        Clear
                    </Button>
                )}
            </Panel>
            <ListBox
                name="url-suggestions-list"
                onModel={(model) => { listBoxModel.current = model; }}
                items={listItems}
                activeIndex={hoveredIndex}
                onActiveChange={onHoveredIndexChange}
                onChange={(item) => onSelect(item.value as string)}
                searchText={mode === "search" ? searchText : undefined}
                keyboardNav={false}
                growToHeight={400}
            />
        </Popover>
    );
}
