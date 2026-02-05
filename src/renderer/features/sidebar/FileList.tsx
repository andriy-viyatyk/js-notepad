import styled from "@emotion/styled";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { List } from "../../components/form/List";
import color from "../../theme/color";
import { MenuItem } from "../../components/overlay/PopupMenu";
import { FileIcon, FolderIcon } from "./FileIcon";
import { TextField } from "../../components/basic/TextField";
import { HighlightedTextProvider, highlightText, searchMatch } from "../../components/basic/useHighlightedText";
import { Button } from "../../components/basic/Button";
import { CloseIcon } from "../../theme/icons";

const FileListWrapper = styled("div")({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    outline: "none",
    "& .file-list-search": {
        padding: "4px",
        "& .text-field": {
            width: "100%",
        },
    },
});

const FileListStyled = styled(List)({
    "& .list-item": {
        boxSizing: "border-box",
        borderRadius: 4,
        border: `1px solid transparent`,
        userSelect: "none",
        "& svg": {
            width: 16,
            height: 16,
        },
        "&:hover": {
            backgroundColor: color.background.dark,
            borderColor: color.border.default,
        },
        "&.selected": {
            backgroundColor: color.background.default,
            borderColor: color.border.default,
        },
    },
});

export interface FileListItem {
    filePath: string;
    title: string;
    isFolder?: boolean;
}

const getFileLabel = (item: FileListItem) => item.title;
const getFileIcon = (item: FileListItem) => {
    if (item.isFolder) {
        return <FolderIcon />;
    }
    return <FileIcon path={item.filePath} />;
};
const getTooltip = (item: FileListItem) => item.filePath;

interface FileListProps {
    items: FileListItem[];
    onClick: (item: FileListItem) => void;
    getContextMenu?: (item: FileListItem) => MenuItem[] | undefined;
    onContextMenu?: (e: React.MouseEvent) => void;
    searchable?: boolean;
}

export interface FileListRef {
    showSearch: () => void;
    hideSearch: () => void;
}

export const FileList = forwardRef<FileListRef, FileListProps>(
    function FileList(props, ref) {
        const [searchText, setSearchText] = useState("");
        const [searchVisible, setSearchVisible] = useState(false);
        const rootRef = useRef<HTMLDivElement>(null);
        const searchInputRef = useRef<HTMLInputElement>(null);

        useImperativeHandle(ref, () => ({
            showSearch: () => {
                setSearchVisible(true);
                setTimeout(() => searchInputRef.current?.focus(), 0);
            },
            hideSearch,
        }));

        const hideSearch = () => {
            setSearchVisible(false);
            setSearchText("");
        };

        const hideSearchAndFocus = () => {
            hideSearch();
            rootRef.current?.focus();
        };

        const onSearchBlur = () => {
            if (!searchText) {
                hideSearch();
            }
        };

        const filteredItems = useMemo(() => {
            if (!searchText) {
                return props.items;
            }
            const searchLower = searchText
                .toLowerCase()
                .split(" ")
                .filter((s) => s);
            return props.items.filter((item) =>
                searchMatch(item, searchLower, [(i) => i.title])
            );
        }, [props.items, searchText]);

        const onKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Escape" && searchVisible) {
                e.preventDefault();
                e.stopPropagation();
                hideSearchAndFocus();
            }
        };

        const onSearchKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                hideSearchAndFocus();
            }
        };

        const getFileLabelHighlighted = (item: FileListItem) => {
            return highlightText(searchText, item.title);
        };

        return (
            <FileListWrapper ref={rootRef} tabIndex={0} onKeyDown={onKeyDown}>
                {searchVisible && (
                    <div className="file-list-search">
                        <TextField
                            ref={searchInputRef}
                            value={searchText}
                            onChange={setSearchText}
                            placeholder="Search..."
                            onKeyDown={onSearchKeyDown}
                            onBlur={onSearchBlur}
                            endButtons={[
                                <Button
                                    size="small"
                                    type="icon"
                                    key="clear-search"
                                    title="Clear Search"
                                    onClick={hideSearchAndFocus}
                                    invisible={!searchText}
                                >
                                    <CloseIcon />
                                </Button>,
                            ]}
                        />
                    </div>
                )}
                <HighlightedTextProvider value={searchText}>
                    <FileListStyled
                        options={filteredItems}
                        getLabel={searchText ? getFileLabelHighlighted : getFileLabel}
                        getIcon={getFileIcon}
                        selectedIcon={<span />}
                        rowHeight={28}
                        onClick={props.onClick}
                        itemMarginY={1}
                        getTooltip={getTooltip}
                        getContextMenu={props.getContextMenu}
                        onContextMenu={props.onContextMenu}
                        emptyMessage="no files"
                    />
                </HighlightedTextProvider>
            </FileListWrapper>
        );
    }
);
