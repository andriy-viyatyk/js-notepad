import { useCallback, useEffect, useMemo, useRef } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { ChevronDownIcon, ChevronRightIcon, FilterArrowDownIcon, FilterArrowUpIcon } from "../../theme/icons";
// Note: match highlighting uses global "highlighted-text" class (from useHighlightedText)
import { Input } from "../../uikit/Input";
import { IconButton } from "../../uikit/IconButton";
import { FileIcon } from "../icons/FileIcon";
import { RenderGrid, RenderGridModel } from "../../uikit/RenderGrid";
import type { RenderCellParams } from "../../uikit/RenderGrid";
import { maxSearchResults } from "../../../ipc/search-ipc";
import {
    FileSearchModel,
    type FileSearchState,
    type SearchResultFileRow,
    type SearchResultLineRow,
} from "./FileSearchModel";

// =============================================================================
// Types
// =============================================================================

export type { FileSearchState } from "./FileSearchModel";

export interface FileSearchProps {
    /** Root folder to search in. */
    folder: string;
    /** Restored state (query, results, filters). */
    state?: FileSearchState;
    /** Called when state changes (for persistence). */
    onStateChange?: (state: FileSearchState) => void;
    /** Called when user clicks a search result. */
    onResultClick?: (filePath: string, lineNumber?: number) => void;
}

// =============================================================================
// Styles
// =============================================================================

const ROW_HEIGHT = 22;

const FileSearchRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    overflow: "hidden",

    "& .fs-input-area": {
        padding: 4,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flexShrink: 0,
        "& .fs-query-row": {
            display: "flex",
            alignItems: "center",
            gap: 2,
            '& [data-type="input"]': {
                flex: "1 1 auto",
            },
        },
    },

    "& .fs-status": {
        padding: "2px 8px",
        fontSize: 11,
        color: color.text.light,
        flexShrink: 0,
    },

    "& .fs-results": {
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },

    "& .fs-row": {
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        fontSize: 13,
        cursor: "pointer",
        userSelect: "none",
        "&:hover": {
            backgroundColor: color.background.light,
        },
    },

    "& .fs-file-row": {
        gap: 2,
        padding: "0 4px",
        "& .fs-file-icon": {
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            color: color.icon.dark,
        },
        "& .fs-file-name": {
            fontWeight: 600,
            color: color.text.default,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
        },
        "& .fs-match-count": {
            flexShrink: 0,
            marginLeft: "auto",
            color: color.text.dark,
            fontSize: 11,
            padding: "0 4px",
        },
    },

    "& .fs-line-row": {
        padding: "0 8px",
        gap: 6,
        lineHeight: `${ROW_HEIGHT}px`,
        "& .fs-line-number": {
            flexShrink: 0,
            width: 36,
            textAlign: "right",
            color: color.text.dark,
            fontSize: 11,
        },
        "& .fs-line-text": {
            flex: "1 1 auto",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: color.text.default,
        },
    },

    "& .fs-empty": {
        padding: 8,
        fontSize: 12,
        color: color.text.light,
    },
});

// =============================================================================
// Component
// =============================================================================

type Percent = `${number}%`;
const FULL_WIDTH = () => "100%" as Percent;

export function FileSearch({ folder, state: savedState, onStateChange, onResultClick }: FileSearchProps) {
    const modelRef = useRef<FileSearchModel | null>(null);
    if (!modelRef.current) {
        modelRef.current = new FileSearchModel(folder, savedState, onStateChange);
    }
    const model = modelRef.current;

    const searchState = model.state.use();
    const gridRef = useRef<RenderGridModel>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Use ref for onResultClick so RenderGrid cell callbacks are always stable
    const onResultClickRef = useRef(onResultClick);
    onResultClickRef.current = onResultClick;

    // Dispose on unmount
    useEffect(() => {
        return () => { model.dispose(); };
    }, [model]);

    // Build filtered results (excludes collapsed file lines)
    const filteredResults = useMemo(
        () => model.getFilteredResults(),
        // The rows live on the model, not in state — resultsVersion is the change signal
        // (bumped once per arriving batch, and on an expand/collapse toggle).
        [model, searchState.resultsVersion], // eslint-disable-line
    );

    // Refresh grid when filtered results change
    useEffect(() => {
        gridRef.current?.update({ all: true });
    }, [filteredResults]);

    // Focus search input on mount
    useEffect(() => {
        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });
    }, []);

    // ── Handlers ─────────────────────────────────────────────────────

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            model.triggerSearch();
        } else if (e.key === "Escape") {
            e.preventDefault();
            if (searchState.query) {
                model.setQuery("");
            } else {
                searchInputRef.current?.blur();
            }
        }
    }, [model, searchState.query]);

    const handleToggleFile = useCallback((filePath: string) => {
        model.toggleFileExpanded(filePath);
    }, [model]);

    const handleFileClick = useCallback((filePath: string) => {
        onResultClickRef.current?.(filePath);
    }, []);

    const handleLineClick = useCallback((filePath: string, lineNumber: number) => {
        onResultClickRef.current?.(filePath, lineNumber);
    }, []);

    // ── RenderGrid cell renderer ─────────────────────────────────────

    const renderCell = useCallback((p: RenderCellParams) => {
        const row = filteredResults[p.row];
        if (!row) return null;

        if (row.type === "file") {
            return (
                <div key={p.key} style={p.style} className="fs-row fs-file-row">
                    <FileResultRow
                        row={row}
                        onToggle={handleToggleFile}
                        onClick={handleFileClick}
                    />
                </div>
            );
        }

        return (
            <div key={p.key} style={p.style} className="fs-row fs-line-row">
                <LineResultRow
                    row={row}
                    onClick={handleLineClick}
                />
            </div>
        );
    }, [filteredResults, handleToggleFile, handleFileClick, handleLineClick]);

    // ── Status text ──────────────────────────────────────────────────

    let statusText: string;
    if (searchState.isSearching) {
        statusText = `Searching... ${searchState.filesSearched} files`;
    } else if (!searchState.query.trim()) {
        statusText = "";
    } else if (searchState.totalFiles === 0) {
        statusText = "No results";
    } else {
        statusText = `${searchState.totalMatches} matches in ${searchState.totalFiles} files`;
        if (searchState.truncated) {
            // The cap has to be visible — a silently short result list reads as a bug.
            statusText += ` (first ${maxSearchResults} results — refine your search)`;
        }
    }

    // ── Render ───────────────────────────────────────────────────────

    return (
        <FileSearchRoot>
            <div className="fs-input-area">
                <div className="fs-query-row">
                    <Input
                        ref={searchInputRef}
                        value={searchState.query}
                        onChange={model.setQuery}
                        placeholder="Search..."
                        onKeyDown={handleKeyDown}
                        tone="accent"
                    />
                    <IconButton
                        size="sm"
                        title="Toggle Filters"
                        onClick={model.toggleFilters}
                        icon={searchState.showFilters
                            ? <FilterArrowUpIcon width={14} height={14} />
                            : <FilterArrowDownIcon width={14} height={14} />}
                    />
                </div>
                {searchState.showFilters && (
                    <>
                        <Input
                            value={searchState.includePattern}
                            onChange={model.setIncludePattern}
                            placeholder="Include (e.g. *.ts, *.tsx)"
                        />
                        <Input
                            value={searchState.excludePattern}
                            onChange={model.setExcludePattern}
                            // node_modules and .git come from the search-exclude setting, so
                            // naming one here would imply the field is what excludes it.
                            placeholder="Exclude — adds to Settings (e.g. dist, *.min.js)"
                        />
                    </>
                )}
            </div>
            {statusText && <div className="fs-status">{statusText}</div>}
            <div className="fs-results">
                {filteredResults.length > 0 ? (
                    <RenderGrid
                        onModel={(grid) => { gridRef.current = grid; }}
                        rowCount={filteredResults.length}
                        columnCount={1}
                        rowHeight={ROW_HEIGHT}
                        columnWidth={FULL_WIDTH}
                        renderCell={renderCell}
                        fitToWidth
                    />
                ) : searchState.query.trim() && !searchState.isSearching ? (
                    <div className="fs-empty">No results found</div>
                ) : null}
            </div>
        </FileSearchRoot>
    );
}

// =============================================================================
// Row components
// =============================================================================

function FileResultRow({ row, onToggle, onClick }: {
    row: SearchResultFileRow;
    onToggle: (filePath: string) => void;
    onClick: (filePath: string) => void;
}) {
    const handleChevronClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle(row.filePath);
    }, [row.filePath, onToggle]);

    const handleClick = useCallback(() => {
        onClick(row.filePath);
    }, [row.filePath, onClick]);

    return (
        <div style={{ display: "contents" }} title={row.filePath} onClick={handleClick}>
            <span className="fs-file-icon" onClick={handleChevronClick}>
                {row.expanded
                    ? <ChevronDownIcon width={12} height={12} />
                    : <ChevronRightIcon width={12} height={12} />}
            </span>
            <FileIcon path={row.filePath} width={16} height={16} />
            <span className="fs-file-name">
                {row.fileName}
            </span>
            <span className="fs-match-count">
                {row.matchedLinesCount}
            </span>
        </div>
    );
}

function LineResultRow({ row, onClick }: {
    row: SearchResultLineRow;
    onClick: (filePath: string, lineNumber: number) => void;
}) {
    const handleClick = useCallback(() => {
        onClick(row.filePath, row.lineNumber);
    }, [row.filePath, row.lineNumber, onClick]);

    return (
        <div style={{ display: "contents" }} onClick={handleClick}>
            <span className="fs-line-number">{row.lineNumber}</span>
            <MatchLineText
                lineText={row.lineText}
                matchStart={row.matchStart}
                matchLength={row.matchLength}
            />
        </div>
    );
}

function MatchLineText({ lineText, matchStart, matchLength }: {
    lineText: string;
    matchStart: number;
    matchLength: number;
}) {
    const contextChars = 60;
    let displayText = lineText.trimStart();
    const trimmedChars = lineText.length - displayText.length;
    const adjustedStart = matchStart - trimmedChars;

    let startOffset = 0;
    if (adjustedStart > contextChars) {
        startOffset = adjustedStart - contextChars;
        displayText = "\u2026" + displayText.substring(startOffset + 1);
    }

    const highlightStart = adjustedStart - startOffset + (startOffset > 0 ? 1 : 0);
    const before = displayText.substring(0, highlightStart);
    const match = displayText.substring(highlightStart, highlightStart + matchLength);
    const after = displayText.substring(highlightStart + matchLength);

    return (
        <span className="fs-line-text">
            {before}
            <span className="highlighted-text">{match}</span>
            {after}
        </span>
    );
}
