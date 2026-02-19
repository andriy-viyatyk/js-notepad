import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { NavPanelModel } from "./nav-panel-store";
import { FileExplorer, FileExplorerRef } from "../../components/file-explorer";
import { MenuItem } from "../../components/overlay/PopupMenu";
import { Button } from "../../components/basic/Button";
import { Splitter } from "../../components/layout/Splitter";
import { SearchResultsPanel } from "./SearchResultsPanel";
import {
    ChevronDownIcon,
    ChevronRightIcon,
    CloseIcon,
    CollapseAllIcon,
    FolderUpIcon,
    RefreshIcon,
    SearchIcon,
} from "../../theme/icons";
import color from "../../theme/color";
import { pagesModel } from "../../store";
import { isTextFileModel } from "../../editors/text";

const path = require("path");

const NavigationPanelRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    backgroundColor: color.background.default,

    "& .nav-header": {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        padding: "4px 4px 4px 4px",
        borderBottom: `1px solid ${color.border.light}`,
        flexShrink: 0,
    },

    "& .nav-header-spacer": {
        flex: "1 1 auto",
    },

    "& .nav-btn-toggled": {
        backgroundColor: color.icon.active,
        borderRadius: 3,
        "& svg": {
            color: `${color.text.strong} !important`,
        },
    },

    "& .nav-search-panel": {
        flexShrink: 0,
        padding: "4px",
        borderBottom: `1px solid ${color.border.light}`,
        display: "flex",
        flexDirection: "column",
        gap: 3,
    },

    "& .nav-search-row": {
        display: "flex",
        alignItems: "center",
        gap: 2,
    },

    "& .nav-search-input-wrap": {
        flex: "1 1 auto",
        display: "flex",
        alignItems: "center",
        backgroundColor: color.background.dark,
        border: `1px solid ${color.border.default}`,
        borderRadius: 3,
        padding: "0 4px",
        gap: 2,
        "&:focus-within": {
            borderColor: color.border.active,
        },
    },

    "& .nav-search-icon": {
        flexShrink: 0,
        color: color.icon.dark,
        display: "flex",
        alignItems: "center",
    },

    "& .nav-search-input": {
        flex: "1 1 auto",
        background: "none",
        border: "none",
        outline: "none",
        color: color.text.default,
        fontSize: 12,
        padding: "3px 0",
        minWidth: 0,
        "&::placeholder": {
            color: color.text.dark,
        },
    },

    "& .nav-filter-input": {
        flex: "1 1 auto",
        background: color.background.dark,
        border: `1px solid ${color.border.default}`,
        borderRadius: 3,
        outline: "none",
        color: color.text.default,
        fontSize: 11,
        padding: "2px 4px",
        minWidth: 0,
        "&::placeholder": {
            color: color.text.dark,
        },
        "&:focus": {
            borderColor: color.border.active,
        },
    },

    "& .nav-search-status": {
        fontSize: 11,
        color: color.text.dark,
        padding: "0 2px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },

    "& .nav-content": {
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },

    "& .nav-explorer-wrap": {
        overflow: "hidden",
    },
});

interface NavigationPanelProps {
    model: NavPanelModel;
    pageId: string;
}

export function NavigationPanel({ model, pageId }: NavigationPanelProps) {
    const { rootFilePath, currentFilePath } = model.state.use();
    const searchModel = model.searchModel;
    const {
        searchOpen,
        query,
        includePattern,
        excludePattern,
        showFilters,
        isSearching,
        totalMatches,
        totalFiles,
        filesSearched,
    } = searchModel.state.use();

    const fileExplorerRef = useRef<FileExplorerRef>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const parentPath = path.dirname(rootFilePath);
    const canNavigateUp = parentPath !== rootFilePath;

    const hasQuery = query.trim().length > 0;
    const hasResults = totalFiles > 0;

    // Auto-focus search input when search panel opens; restore editor focus when it closes
    useEffect(() => {
        if (searchOpen) {
            requestAnimationFrame(() => searchInputRef.current?.focus());
        } else {
            const page = pagesModel.findPage(pageId);
            if (page && isTextFileModel(page)) {
                requestAnimationFrame(() => page.editor.focusEditor());
            }
        }
    }, [searchOpen]);

    const handleFileClick = useCallback((filePath: string) => {
        if (filePath.toLowerCase() === currentFilePath?.toLowerCase()) return;
        // Save scroll position before navigation triggers remount
        model.scrollTop = fileExplorerRef.current?.getScrollTop() ?? 0;
        const options = searchOpen
            ? { forceTextEditor: true, highlightText: hasQuery ? query : undefined }
            : undefined;
        pagesModel.navigatePageTo(pageId, filePath, options);
    }, [pageId, currentFilePath, model, searchOpen, hasQuery, query]);

    // Restore scroll position after remount (navigation transfers NavPanelModel)
    useEffect(() => {
        if (model.scrollTop > 0) {
            const saved = model.scrollTop;
            model.scrollTop = 0;
            // Tree rebuild is deferred via setTimeout(0) in TreeViewModel.setProps,
            // so we retry until the container is scrollable and scroll takes effect.
            const tryRestore = (retries: number) => {
                fileExplorerRef.current?.setScrollTop(saved);
                const actual = fileExplorerRef.current?.getScrollTop() ?? 0;
                if (actual === 0 && retries > 0) {
                    requestAnimationFrame(() => tryRestore(retries - 1));
                }
            };
            requestAnimationFrame(() => tryRestore(10));
        }
    }, []);

    const handleRefresh = useCallback(() => {
        fileExplorerRef.current?.refresh();
    }, []);

    const handleCollapseAll = useCallback(() => {
        fileExplorerRef.current?.collapseAll();
    }, []);

    const handleNavigateUp = useCallback(() => {
        if (!canNavigateUp) return;
        const currentState = fileExplorerRef.current?.getState();
        const expandedPaths = [...(currentState?.expandedPaths ?? [])];
        // Add old root to expanded paths so it stays expanded as a subfolder
        const rootLower = rootFilePath.toLowerCase();
        if (!expandedPaths.some(p => p.toLowerCase() === rootLower)) {
            expandedPaths.push(rootFilePath);
        }
        model.fileExplorerState = { expandedPaths };
        model.state.update((s) => {
            s.rootFilePath = parentPath;
        });
    }, [canNavigateUp, rootFilePath, parentPath, model]);

    const handleMakeRoot = useCallback((folderPath: string) => {
        if (folderPath.toLowerCase() === rootFilePath.toLowerCase()) return;
        const currentState = fileExplorerRef.current?.getState();
        const folderLower = folderPath.toLowerCase() + path.sep;
        const expandedPaths = (currentState?.expandedPaths ?? [])
            .filter(p => p.toLowerCase().startsWith(folderLower));
        model.fileExplorerState = { expandedPaths };
        model.state.update((s) => {
            s.rootFilePath = folderPath;
        });
    }, [rootFilePath, model]);

    const getExtraMenuItems = useCallback((filePath: string, isFolder: boolean): MenuItem[] => {
        if (!isFolder || filePath.toLowerCase() === rootFilePath.toLowerCase()) return [];
        return [{
            startGroup: true,
            label: "Make Root",
            onClick: () => handleMakeRoot(filePath),
        }];
    }, [rootFilePath, handleMakeRoot]);

    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            searchModel.triggerSearch();
        } else if (e.key === "Escape") {
            if (hasQuery) {
                searchModel.clearSearch();
            } else {
                searchModel.toggleSearchOpen();
            }
        }
    }, [searchModel, hasQuery]);

    const handleFilterKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            searchModel.triggerSearch();
        }
    }, [searchModel]);

    const [explorerHeight, setExplorerHeight] = useState(200);
    const showResultsPanel = hasQuery && hasResults && !isSearching;

    // Memoize filterPaths Set so FileExplorer only re-filters when results change
    const filterPaths = useMemo(() => {
        if (!showResultsPanel) return undefined;
        return searchModel.matchingFilePaths;
    }, [showResultsPanel, totalFiles]);

    const handleMatchClick = useCallback((filePath: string, lineNumber: number) => {
        if (filePath.toLowerCase() === currentFilePath?.toLowerCase()) {
            // Same file — reveal line directly in the current editor
            const page = pagesModel.findPage(pageId);
            if (page && isTextFileModel(page)) {
                page.editor.revealLine(lineNumber);
            }
        } else {
            // Different file — navigate with revealLine + highlightText
            model.scrollTop = fileExplorerRef.current?.getScrollTop() ?? 0;
            pagesModel.navigatePageTo(pageId, filePath, {
                revealLine: lineNumber,
                highlightText: query,
            });
        }
    }, [pageId, currentFilePath, model, query]);

    // Sync search highlighting to current Monaco editor
    useEffect(() => {
        const page = pagesModel.findPage(pageId);
        if (!page || !isTextFileModel(page)) return;

        const highlightText = showResultsPanel ? query : undefined;
        page.editor.setHighlightText(highlightText);

        return () => {
            page.editor.setHighlightText(undefined);
        };
    }, [showResultsPanel, query, pageId, currentFilePath]);

    return (
        <NavigationPanelRoot>
            <div className="nav-header">
                <Button
                    type="icon"
                    size="small"
                    title={canNavigateUp ? `Up to ${path.basename(parentPath)}` : "Already at root"}
                    onClick={handleNavigateUp}
                    disabled={!canNavigateUp}
                >
                    <FolderUpIcon width={14} height={14} />
                </Button>
                <span className="nav-header-spacer" />
                <Button
                    type="icon"
                    size="small"
                    title="Search in Files"
                    onClick={searchModel.toggleSearchOpen}
                    className={searchOpen ? "nav-btn-toggled" : undefined}
                >
                    <SearchIcon width={14} height={14} />
                </Button>
                <Button
                    type="icon"
                    size="small"
                    title="Collapse All"
                    onClick={handleCollapseAll}
                >
                    <CollapseAllIcon width={14} height={14} />
                </Button>
                <Button
                    type="icon"
                    size="small"
                    title="Refresh"
                    onClick={handleRefresh}
                >
                    <RefreshIcon width={14} height={14} />
                </Button>
                <Button
                    type="icon"
                    size="small"
                    title="Close Panel"
                    onClick={model.close}
                >
                    <CloseIcon width={14} height={14} />
                </Button>
            </div>
            {searchOpen && (
                <div className="nav-search-panel">
                    <div className="nav-search-row">
                        <div className="nav-search-input-wrap">
                            <span className="nav-search-icon">
                                <SearchIcon width={12} height={12} />
                            </span>
                            <input
                                ref={searchInputRef}
                                className="nav-search-input"
                                type="text"
                                placeholder="Search in files..."
                                value={query}
                                onChange={(e) => searchModel.setQuery(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                spellCheck={false}
                            />
                        </div>
                        <Button
                            type="icon"
                            size="small"
                            title={showFilters ? "Hide Filters" : "Show Filters"}
                            onClick={searchModel.toggleFilters}
                        >
                            {showFilters
                                ? <ChevronDownIcon width={14} height={14} />
                                : <ChevronRightIcon width={14} height={14} />}
                        </Button>
                        {hasQuery && (
                            <Button
                                type="icon"
                                size="small"
                                title="Clear Search"
                                onClick={searchModel.clearSearch}
                            >
                                <CloseIcon width={14} height={14} />
                            </Button>
                        )}
                    </div>
                    {showFilters && (
                        <>
                            <input
                                className="nav-filter-input"
                                type="text"
                                placeholder="Files to include (e.g. *.ts,*.tsx)"
                                value={includePattern}
                                onChange={(e) => searchModel.setIncludePattern(e.target.value)}
                                onKeyDown={handleFilterKeyDown}
                                spellCheck={false}
                            />
                            <input
                                className="nav-filter-input"
                                type="text"
                                placeholder="Files to exclude (e.g. *.test.ts,dist)"
                                value={excludePattern}
                                onChange={(e) => searchModel.setExcludePattern(e.target.value)}
                                onKeyDown={handleFilterKeyDown}
                                spellCheck={false}
                            />
                        </>
                    )}
                    {(isSearching || (hasQuery && hasResults)) && (
                        <div className="nav-search-status">
                            {isSearching
                                ? `Searching... ${filesSearched} files scanned`
                                : `${totalMatches} match${totalMatches !== 1 ? "es" : ""} in ${totalFiles} file${totalFiles !== 1 ? "s" : ""}`
                            }
                        </div>
                    )}
                    {hasQuery && !isSearching && !hasResults && (
                        <div className="nav-search-status">No results found</div>
                    )}
                </div>
            )}
            <div className="nav-content">
                <div
                    className="nav-explorer-wrap"
                    style={showResultsPanel
                        ? { height: explorerHeight, flexShrink: 0 }
                        : { flex: "1 1 auto" }}
                >
                    <FileExplorer
                        ref={fileExplorerRef}
                        key={rootFilePath}
                        id={`nav-${pageId}`}
                        rootPath={rootFilePath}
                        selectedFilePath={currentFilePath}
                        filterPaths={filterPaths}
                        onFileClick={handleFileClick}
                        onFolderDoubleClick={handleMakeRoot}
                        enableFileOperations
                        showOpenInNewTab
                        initialState={model.fileExplorerState}
                        onStateChange={model.setFileExplorerState}
                        getExtraMenuItems={getExtraMenuItems}
                    />
                </div>
                {showResultsPanel && (
                    <>
                        <Splitter
                            type="horizontal"
                            initialHeight={explorerHeight}
                            onChangeHeight={setExplorerHeight}
                            borderSized="bottom"
                        />
                        <SearchResultsPanel
                            searchModel={searchModel}
                            pageId={pageId}
                            onMatchClick={handleMatchClick}
                        />
                    </>
                )}
            </div>
        </NavigationPanelRoot>
    );
}
