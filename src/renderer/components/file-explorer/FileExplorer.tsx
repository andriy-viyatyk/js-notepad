import { useCallback, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { useComponentModel } from "../../core/state/model";
import { TreeView } from "../TreeView/TreeView";
import { TreeViewRef } from "../TreeView";
import { FileTypeIcon } from "../../editors/base/LanguageIcon";
import { FolderIcon } from "../../features/sidebar/FileIcon";
import { TextField } from "../basic/TextField";
import { Button } from "../basic/Button";
import { CloseIcon } from "../../theme/icons";
import { highlightText } from "../basic/useHighlightedText";
import color from "../../theme/color";
import { FileTreeItem } from "./file-tree-builder";
import {
    FileExplorerModel,
    FileExplorerProps,
    FileExplorerSavedState,
    defaultFileExplorerState,
} from "./FileExplorerModel";

const FileExplorerRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    outline: "none",

    "& .file-explorer-tree": {
        flex: "1 1 auto",
        overflow: "hidden",
        paddingLeft: 4,
    },

    "& .file-explorer-search": {
        padding: 4,
        borderTop: `1px solid ${color.border.light}`,
        flexShrink: 0,
        "& .text-field": {
            width: "100%",
        },
    },

    "& .file-explorer-error": {
        padding: 8,
        fontSize: 12,
        color: color.misc.red,
    },

    "& .file-explorer-empty": {
        padding: 8,
        fontSize: 12,
        color: color.text.light,
    },

    "& .file-item-label": {
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontSize: 14,
    },
});

export interface FileExplorerRef {
    refresh(): void;
    showSearch(): void;
    hideSearch(): void;
    collapseAll(): void;
    getState(): FileExplorerSavedState;
    getScrollTop(): number;
    setScrollTop(value: number): void;
}

export function FileExplorer(props: FileExplorerProps & { ref?: React.Ref<FileExplorerRef> }) {
    const { ref, ...explorerProps } = props;
    const model = useComponentModel(
        explorerProps,
        FileExplorerModel,
        defaultFileExplorerState,
    );
    const state = model.state.use();
    const treeViewRef = useRef<TreeViewRef>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        model.setTreeViewRef(treeViewRef.current);
    });

    // Expose ref methods
    useEffect(() => {
        if (!ref) return;
        const refValue: FileExplorerRef = {
            refresh: model.buildTree,
            showSearch: () => {
                model.showSearch();
                setTimeout(() => searchInputRef.current?.focus(), 0);
            },
            hideSearch: () => {
                model.hideSearch();
                rootRef.current?.focus();
            },
            collapseAll: () => {
                treeViewRef.current?.collapseAll();
                explorerProps.onStateChange?.({ expandedPaths: [] });
            },
            getState: model.getState,
            getScrollTop: () => treeViewRef.current?.getScrollTop() ?? 0,
            setScrollTop: (value: number) => treeViewRef.current?.setScrollTop(value),
        };
        if (typeof ref === "function") {
            ref(refValue);
        } else {
            (ref as React.MutableRefObject<FileExplorerRef | null>).current = refValue;
        }
        return () => {
            if (typeof ref === "function") {
                ref(null);
            } else {
                (ref as React.MutableRefObject<FileExplorerRef | null>).current = null;
            }
        };
    }, [ref, model]);

    const searchable = props.searchable !== false;
    const isDeepSearch = state.searchText.length >= 3;
    const defaultCollapsed = props.defaultCollapsed !== false;

    const getLabel = useCallback((item: FileTreeItem) => (
        <span className="file-item-label" title={item.filePath}>
            {state.searchText
                ? highlightText(state.searchText, item.label)
                : item.label
            }
        </span>
    ), [state.searchText]);

    const getIcon = useCallback((item: FileTreeItem) => (
        item.isFolder
            ? <FolderIcon />
            : <FileTypeIcon fileName={item.label} width={16} height={16} />
    ), []);

    const getId = useCallback((item: FileTreeItem) => item.filePath, []);

    const getHasChildren = useCallback((item: FileTreeItem) => item.isFolder, []);

    const getSelected = useCallback((item: FileTreeItem) => {
        if (!props.selectedFilePath) return false;
        return item.filePath.toLowerCase() === props.selectedFilePath.toLowerCase();
    }, [props.selectedFilePath]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (searchable && e.ctrlKey && e.key === "f") {
            e.preventDefault();
            e.stopPropagation();
            model.showSearch();
            setTimeout(() => searchInputRef.current?.focus(), 0);
        }
        if (e.key === "Escape" && state.searchVisible) {
            e.preventDefault();
            e.stopPropagation();
            model.hideSearch();
            rootRef.current?.focus();
        }
    }, [searchable, state.searchVisible, model]);

    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            model.hideSearch();
            rootRef.current?.focus();
        }
    }, [model]);

    const handleSearchBlur = useCallback(() => {
        if (!state.searchText) {
            model.hideSearch();
        }
    }, [state.searchText, model]);

    const handleSearchClose = useCallback(() => {
        model.hideSearch();
        rootRef.current?.focus();
    }, [model]);

    if (state.error) {
        return (
            <FileExplorerRoot>
                <div className="file-explorer-error">{state.error}</div>
            </FileExplorerRoot>
        );
    }

    if (!state.displayTree) {
        return (
            <FileExplorerRoot>
                <div className="file-explorer-empty">No folder selected</div>
            </FileExplorerRoot>
        );
    }

    return (
        <FileExplorerRoot
            ref={rootRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onContextMenu={model.onBackgroundContextMenu}
        >
            <div className="file-explorer-tree">
                <TreeView<FileTreeItem>
                    key={state.treeViewKey}
                    ref={treeViewRef}
                    root={state.displayTree}
                    getId={getId}
                    getLabel={getLabel}
                    getIcon={getIcon}
                    getHasChildren={getHasChildren}
                    getSelected={getSelected}
                    onItemClick={model.onItemClick}
                    onItemDoubleClick={model.onItemDoubleClick}
                    onItemContextMenu={model.onItemContextMenu}
                    onExpandChange={model.onExpandChange}
                    rootCollapsible={false}
                    defaultExpandAll={isDeepSearch || !defaultCollapsed}
                    initialExpandMap={model.initialExpandMap}
                    refreshKey={`${props.selectedFilePath || ""}-${state.searchText}`}
                />
            </div>
            {state.searchVisible && (
                <div className="file-explorer-search">
                    <TextField
                        ref={searchInputRef}
                        value={state.searchText}
                        onChange={model.setSearchText}
                        placeholder="Search files..."
                        onKeyDown={handleSearchKeyDown}
                        onBlur={handleSearchBlur}
                        endButtons={[
                            <Button
                                size="small"
                                type="icon"
                                key="close-search"
                                title="Close Search"
                                onClick={handleSearchClose}
                                invisible={!state.searchText}
                            >
                                <CloseIcon />
                            </Button>,
                        ]}
                    />
                </div>
            )}
        </FileExplorerRoot>
    );
}
