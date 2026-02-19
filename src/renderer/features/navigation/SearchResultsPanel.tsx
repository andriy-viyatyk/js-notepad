import { useCallback, useMemo, useState } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { ChevronDownIcon, ChevronRightIcon } from "../../theme/icons";
import { NavigationSearchModel, FileSearchResult } from "./NavigationSearchModel";
import { SearchMatch } from "../../../ipc/search-ipc";

const path = require("path");

const SearchResultsPanelRoot = styled.div({
    flex: "1 1 auto",
    overflow: "auto",
    fontSize: 12,
    userSelect: "none",

    "&::-webkit-scrollbar": {
        width: 8,
    },
    "&::-webkit-scrollbar-thumb": {
        backgroundColor: color.background.scrollBarThumb,
        borderRadius: 4,
    },
    "&::-webkit-scrollbar-track": {
        backgroundColor: "transparent",
    },

    "& .sr-file-header": {
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "2px 4px",
        cursor: "pointer",
        "&:hover": {
            backgroundColor: color.background.light,
        },
    },

    "& .sr-file-icon": {
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        color: color.icon.dark,
    },

    "& .sr-file-name": {
        fontWeight: 600,
        color: color.text.default,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },

    "& .sr-file-dir": {
        color: color.text.dark,
        fontSize: 11,
        marginLeft: 4,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },

    "& .sr-match-count": {
        flexShrink: 0,
        marginLeft: "auto",
        color: color.text.dark,
        fontSize: 11,
        padding: "0 4px",
    },

    "& .sr-match-line": {
        display: "flex",
        alignItems: "baseline",
        padding: "1px 4px 1px 20px",
        cursor: "pointer",
        lineHeight: "18px",
        "&:hover": {
            backgroundColor: color.background.light,
        },
    },

    "& .sr-line-number": {
        flexShrink: 0,
        width: 36,
        textAlign: "right",
        color: color.text.dark,
        marginRight: 6,
        fontSize: 11,
    },

    "& .sr-line-text": {
        flex: "1 1 auto",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: color.text.default,
    },

    "& .sr-match-highlight": {
        backgroundColor: color.highlight.activeMatch,
        borderRadius: 2,
    },
});

interface SearchResultsPanelProps {
    searchModel: NavigationSearchModel;
    pageId: string;
    onMatchClick: (filePath: string, lineNumber: number) => void;
}

function MatchLineText({ lineText, matchStart, matchLength }: SearchMatch) {
    // Show a window around the match for long lines
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
        <span className="sr-line-text">
            {before}
            <span className="sr-match-highlight">{match}</span>
            {after}
        </span>
    );
}

function FileResultGroup({ result, onMatchClick }: {
    result: FileSearchResult;
    onMatchClick: (filePath: string, lineNumber: number) => void;
}) {
    const [expanded, setExpanded] = useState(true);
    const fileName = path.basename(result.filePath);
    const dirName = path.dirname(result.filePath);

    const handleToggle = useCallback(() => {
        setExpanded((prev) => !prev);
    }, []);

    // Deduplicate matches by line number — show each line once,
    // but highlight all matches within it
    const lineGroups = useMemo(() => {
        const map = new Map<number, SearchMatch[]>();
        for (const m of result.matches) {
            const existing = map.get(m.lineNumber);
            if (existing) {
                existing.push(m);
            } else {
                map.set(m.lineNumber, [m]);
            }
        }
        return Array.from(map.entries());
    }, [result.matches]);

    return (
        <div>
            <div className="sr-file-header" onClick={handleToggle}>
                <span className="sr-file-icon">
                    {expanded
                        ? <ChevronDownIcon width={12} height={12} />
                        : <ChevronRightIcon width={12} height={12} />}
                </span>
                <span className="sr-file-name">{fileName}</span>
                <span className="sr-file-dir" title={dirName}>
                    {path.basename(dirName)}
                </span>
                <span className="sr-match-count">
                    {result.matches.length}
                </span>
            </div>
            {expanded && lineGroups.map(([lineNumber, matches]) => (
                <div
                    key={lineNumber}
                    className="sr-match-line"
                    onClick={() => onMatchClick(result.filePath, lineNumber)}
                >
                    <span className="sr-line-number">{lineNumber}</span>
                    <MatchLineText {...matches[0]} />
                </div>
            ))}
        </div>
    );
}

export function SearchResultsPanel({ searchModel, pageId, onMatchClick }: SearchResultsPanelProps) {
    const { results } = searchModel.state.use((s) => ({
        results: s.results,
    }));

    if (results.length === 0) return null;

    return (
        <SearchResultsPanelRoot>
            {results.map((result) => (
                <FileResultGroup
                    key={result.filePath}
                    result={result}
                    onMatchClick={onMatchClick}
                />
            ))}
        </SearchResultsPanelRoot>
    );
}
