import styled from "@emotion/styled";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ListBox, LIST_ITEM_KEY, Input, IconButton, Panel } from "../../uikit";
import { fontSize } from "../../uikit/tokens";
import type { MenuItem } from "../../uikit/Menu";
import { TraitSet, traited } from "../../core/traits/traits";
import { FileIcon, FolderIcon } from "../icons/FileIcon";
import type { IconRef } from "../../uikit";
import { TComponentModel, useComponentModel } from "../../core/state/model";

export interface FileListItem {
    filePath: string;
    title: string;
    isFolder?: boolean;
    /** Optional explicit icon override. When set, it is used instead of the
     *  folder / file-type default (e.g. a board's custom icon). */
    icon?: IconRef;
}

interface FileListProps {
    items: FileListItem[];
    onClick: (item: FileListItem) => void;
    getContextMenu?: (item: FileListItem) => MenuItem[] | undefined;
    onContextMenu?: (e: React.MouseEvent) => void;
    searchable?: boolean;
    /** Optional right-aligned trailing content per row (e.g. a git status
     *  badge). When omitted, rows render the default ListBox trailing. */
    getTrailing?: (item: FileListItem) => ReactNode;
    /** Compact mode — smaller font + tighter rows. Use for dense lists such as
     *  the git Changes panel where relative paths are shown. */
    compact?: boolean;
    /** When set, the row whose `filePath` matches renders as persistently
     *  selected (accent background). Use for browse lists where the selected
     *  item's details are shown elsewhere (e.g. the commit Diff panel's file
     *  list, whose selection drives the diff to its right). */
    selectedPath?: string;
    onModel?: (model: FileListModel | null) => void;
}

const FileListWrapper = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    outline: "none",

    '&[data-compact="true"]': {
        fontSize: fontSize.sm,
    },
});

interface FileListState {
    searchText: string;
    searchVisible: boolean;
    activeIndex: number | null;
}

const defaultFileListState: FileListState = {
    searchText: "",
    searchVisible: false,
    activeIndex: null,
};

export class FileListModel extends TComponentModel<FileListState, FileListProps> {
    private focusSearchInput?: () => void;
    private focusRoot?: () => void;
    setSearchText = (searchText: string) => {
        this.state.update((s) => { s.searchText = searchText; });
    };

    setSearchVisible = (searchVisible: boolean) => {
        this.state.update((s) => { s.searchVisible = searchVisible; });
    };

    setActiveIndex = (activeIndex: number | null) => {
        this.state.update((s) => { s.activeIndex = activeIndex; });
    };

    showSearch = () => {
        this.setSearchVisible(true);
        setTimeout(() => this.focusSearchInput?.(), 0);
    };

    hideSearch = () => {
        this.setSearchVisible(false);
        this.setSearchText("");
    };

    hideSearchAndFocus = () => {
        this.hideSearch();
        this.focusRoot?.();
    };

    setViewFocusHandlers = (focusSearchInput: () => void, focusRoot: () => void) => {
        this.focusSearchInput = focusSearchInput;
        this.focusRoot = focusRoot;
    };

    clearViewFocusHandlers = () => {
        this.focusSearchInput = undefined;
        this.focusRoot = undefined;
    };
}

export const FileList = function FileList(props: FileListProps) {
        const model = useComponentModel(props, FileListModel, defaultFileListState);
        const onModel = props.onModel;
        const { searchText, searchVisible, activeIndex } = model.state.use();
        const rootRef = useRef<HTMLDivElement>(null);
        const searchInputRef = useRef<HTMLInputElement>(null);

        useEffect(() => {
            model.setViewFocusHandlers(
                () => searchInputRef.current?.focus(),
                () => rootRef.current?.focus(),
            );
            onModel?.(model);
            return () => {
                model.clearViewFocusHandlers();
                onModel?.(null);
            };
        }, [model, onModel]);

        const onSearchBlur = () => {
            if (!searchText) {
                model.hideSearch();
            }
        };

        const { getTrailing, selectedPath } = props;
        const isSelected = useMemo(
            () =>
                selectedPath != null
                    ? (item: FileListItem) => item.filePath === selectedPath
                    : undefined,
            [selectedPath],
        );
        const fileListTraits = useMemo(
            () =>
                new TraitSet().add(LIST_ITEM_KEY, {
                    value: (item: unknown) => (item as FileListItem).filePath,
                    label: (item: unknown) => (item as FileListItem).title,
                    icon: (item: unknown) => {
                        const it = item as FileListItem;
                        if (it.icon !== undefined) return it.icon;
                        return it.isFolder
                            ? <FolderIcon />
                            : <FileIcon path={it.filePath} />;
                    },
                    ...(getTrailing
                        ? { trailing: (item: unknown) => getTrailing(item as FileListItem) }
                        : {}),
                }),
            [getTrailing],
        );

        const filteredItems = useMemo(() => {
            if (!searchText) {
                return props.items;
            }
            const lower = searchText
                .toLowerCase()
                .split(" ")
                .filter((s) => s);
            return props.items.filter((item) => {
                const title = item.title.toLowerCase();
                return lower.every((s) => title.includes(s));
            });
        }, [props.items, searchText]);

        const tItems = useMemo(
            () => traited(filteredItems, fileListTraits),
            [filteredItems, fileListTraits]
        );

        const onKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Escape" && searchVisible) {
                e.preventDefault();
                e.stopPropagation();
                model.hideSearchAndFocus();
            }
        };

        const onSearchKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                model.hideSearchAndFocus();
            }
        };

        return (
            <FileListWrapper
                ref={rootRef}
                tabIndex={0}
                onKeyDown={onKeyDown}
                data-compact={props.compact ? "true" : undefined}
            >
                {searchVisible && (
                    <Panel name="file-list-search" padding="sm">
                        <Input
                            name="file-list-search-input"
                            ref={searchInputRef}
                            value={searchText}
                            onChange={model.setSearchText}
                            placeholder="Search..."
                            onKeyDown={onSearchKeyDown}
                            onBlur={onSearchBlur}
                            endSlot={
                                searchText ? (
                                    <IconButton
                                        name="file-list-search-clear"
                                        icon="close"
                                        title="Clear Search"
                                        size="sm"
                                        onClick={model.hideSearchAndFocus}
                                    />
                                ) : null
                            }
                        />
                    </Panel>
                )}
                <ListBox<FileListItem>
                    name="file-list"
                    items={tItems}
                    searchText={searchText || undefined}
                    rowHeight={props.compact ? 20 : 22}
                    activeIndex={activeIndex}
                    onActiveChange={model.setActiveIndex}
                    onChange={props.onClick}
                    isSelected={isSelected}
                    selectionStyle={selectedPath != null ? "accent" : undefined}
                    getTooltip={(item) => item.filePath}
                    getContextMenu={props.getContextMenu}
                    onContextMenu={props.onContextMenu}
                    emptyMessage="no files"
                    variant="browse"
                />
            </FileListWrapper>
        );
    };
