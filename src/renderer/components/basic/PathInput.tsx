import styled from "@emotion/styled";
import clsx from "clsx";
import { useEffect } from "react";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import color from "../../theme/color";
import { Popper } from "../overlay/Popper";

// =============================================================================
// Styles
// =============================================================================

const PathInputRoot = styled.div({
    position: "relative",
    display: "inline-flex",
    "& .path-input-field": {
        flex: 1,
        minWidth: 0,
        padding: "2px 6px",
        fontSize: 13,
        border: `1px solid ${color.border.default}`,
        borderRadius: 4,
        backgroundColor: color.background.default,
        color: color.text.default,
        outline: "none",
        "&:focus": {
            borderColor: color.misc.blue,
        },
        "&::placeholder": {
            color: color.text.light,
        },
    },
});

const SuggestionList = styled.div({
    minWidth: 150,
    maxWidth: 400,
    "& .suggestion-item": {
        padding: "4px 8px",
        fontSize: 13,
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        color: color.text.default,
        "&:hover, &.highlighted": {
            backgroundColor: color.background.selection,
            // Use darker text for all parts when highlighted
            "& .suggestion-match, & .suggestion-segment": {
                color: color.text.strong,
            },
        },
        "& .suggestion-match": {
            color: color.text.light,
        },
        "& .suggestion-segment": {
            color: color.text.default,
        },
    },
    "& .no-suggestions": {
        padding: "4px 8px",
        fontSize: 13,
        color: color.text.light,
        fontStyle: "italic",
    },
});

// =============================================================================
// Types
// =============================================================================

export interface PathInputProps {
    /** Current path value */
    value: string;
    /** Called when path changes */
    onChange: (value: string) => void;
    /** Available paths for autocomplete */
    paths: string[];
    /** Path separator (default: "/") */
    separator?: string;
    /** Placeholder text */
    placeholder?: string;
    /** Additional class name */
    className?: string;
    /** Called when input loses focus (after selection). Optional finalValue for when selection was made. */
    onBlur?: (finalValue?: string) => void;
    /** Auto-focus input on mount with caret at end */
    autoFocus?: boolean;
    /** Maximum depth of suggestions to show. When set, suggestions are hidden once
     *  the input already contains this many separator-delimited segments.
     *  E.g., maxDepth=1 with separator=":" hides popup after "parent:child" level. */
    maxDepth?: number;
}

interface Suggestion {
    /** Full path */
    path: string;
    /** Display label (last segment or full path) */
    label: string;
    /** Whether this is a "folder" (has children) */
    isFolder: boolean;
    /** The matching prefix part */
    matchPrefix: string;
}

// =============================================================================
// Model
// =============================================================================

const defaultPathInputState = {
    open: false,
    highlightedIndex: -1, // -1 means no selection
};

type PathInputState = typeof defaultPathInputState;

class PathInputModel extends TComponentModel<PathInputState, PathInputProps> {
    // Refs
    inputRef: HTMLInputElement | null = null;

    // Cache for suggestions to avoid recalculating on every render
    private cachedSuggestions: Suggestion[] = [];
    private cachedSuggestionsKey = "";

    // Flags to prevent double onBlur calls
    private selectionMade = false;
    private escapeCancelled = false;

    setInputRef = (ref: HTMLInputElement | null) => {
        this.inputRef = ref;
    };

    // Computed properties
    get separator(): string {
        return this.props.separator ?? "/";
    }

    get suggestions(): Suggestion[] {
        const { value, paths, maxDepth } = this.props;
        const key = `${value}|${paths.join(",")}|${this.separator}|${maxDepth}`;

        if (key !== this.cachedSuggestionsKey) {
            this.cachedSuggestionsKey = key;

            // When maxDepth is set, hide suggestions once input has enough segments
            if (maxDepth !== undefined && value) {
                const segmentCount = value.split(this.separator).length;
                // If value ends with separator, next segment hasn't started yet
                const effectiveDepth = value.endsWith(this.separator)
                    ? segmentCount - 1
                    : segmentCount;
                if (effectiveDepth > maxDepth) {
                    this.cachedSuggestions = [];
                    this.state.update((s) => { s.highlightedIndex = -1; });
                    return this.cachedSuggestions;
                }
            }

            this.cachedSuggestions = this.getSuggestions(value, paths, this.separator);

            // Reset highlighted index when suggestions change (no selection)
            this.state.update((s) => {
                s.highlightedIndex = -1;
            });
        }

        return this.cachedSuggestions;
    }

    // Auto-focus on mount
    autoFocusIfNeeded = () => {
        if (this.props.autoFocus && this.inputRef) {
            this.inputRef.focus();
            // Position caret at end of text
            const len = this.inputRef.value.length;
            this.inputRef.setSelectionRange(len, len);
        }
    };

    // Event handlers
    selectSuggestion = (suggestion: Suggestion) => {
        if (suggestion.isFolder) {
            // For folders, append separator and keep editing
            this.props.onChange(suggestion.path + this.separator);
            this.inputRef?.focus();
        } else {
            // For leaves, set value and close
            // Mark that selection was made to prevent handleBlur from firing again
            this.selectionMade = true;
            // Pass the final value to onBlur since React state update is async
            this.props.onChange(suggestion.path);
            this.state.update((s) => {
                s.open = false;
            });
            this.props.onBlur?.(suggestion.path);
        }
    };

    setHighlightedIndex = (index: number) => {
        this.state.update((s) => {
            s.highlightedIndex = index;
        });
    };

    handleKeyDown = (e: React.KeyboardEvent) => {
        const { open, highlightedIndex } = this.state.get();
        const { value } = this.props;
        const suggestions = this.suggestions;

        if (!open) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                this.state.update((s) => {
                    s.open = true;
                });
                e.preventDefault();
            } else if (e.key === "Escape") {
                // Second Escape - cancel and exit edit mode
                e.preventDefault();
                this.escapeCancelled = true;
                this.inputRef?.blur();
                this.props.onBlur?.();
            }
            return;
        }

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                if (suggestions.length > 0) {
                    this.state.update((s) => {
                        // From no selection (-1) go to first, otherwise cycle
                        s.highlightedIndex = s.highlightedIndex < suggestions.length - 1
                            ? s.highlightedIndex + 1
                            : 0;
                    });
                }
                break;
            case "ArrowUp":
                e.preventDefault();
                if (suggestions.length > 0) {
                    this.state.update((s) => {
                        // From no selection (-1) or first (0) go to last, otherwise decrement
                        s.highlightedIndex = s.highlightedIndex <= 0
                            ? suggestions.length - 1
                            : s.highlightedIndex - 1;
                    });
                }
                break;
            case "Enter":
                e.preventDefault();
                // If a suggestion is selected, apply it
                if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
                    this.selectSuggestion(suggestions[highlightedIndex]);
                } else if (value !== "" && !value.endsWith(this.separator)) {
                    // No selection and input has value without trailing separator - apply input
                    this.selectionMade = true;
                    this.state.update((s) => {
                        s.open = false;
                    });
                    this.props.onBlur?.(value);
                }
                // If empty or ends with separator and no selection - do nothing
                break;
            case "Tab":
                // Tab to autocomplete highlighted suggestion (only if selected)
                if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
                    e.preventDefault();
                    this.selectSuggestion(suggestions[highlightedIndex]);
                }
                break;
            case "Escape":
                e.preventDefault();
                this.state.update((s) => {
                    s.open = false;
                });
                break;
        }
    };

    handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.props.onChange(e.target.value);
        this.state.update((s) => {
            s.open = true;
        });
    };

    handleFocus = () => {
        this.state.update((s) => {
            s.open = true;
        });
    };

    handleClose = () => {
        this.state.update((s) => {
            s.open = false;
        });
    };

    handleBlur = () => {
        // Small delay to allow click on suggestion to fire first
        setTimeout(() => {
            // Skip if selection or escape already handled (onBlur was called from those handlers)
            if (this.selectionMade || this.escapeCancelled) {
                this.selectionMade = false;
                this.escapeCancelled = false;
                return;
            }
            if (!this.inputRef?.contains(document.activeElement)) {
                this.state.update((s) => {
                    s.open = false;
                });
                this.props.onBlur?.(this.props.value);
            }
        }, 150);
    };

    // Helper: Get suggestions based on current input and available paths
    private getSuggestions(
        input: string,
        paths: string[],
        separator: string
    ): Suggestion[] {
        // Find the last separator position to determine current level
        const lastSepIndex = input.lastIndexOf(separator);
        const currentPrefix = lastSepIndex >= 0 ? input.slice(0, lastSepIndex + 1) : "";
        const currentSegment = lastSepIndex >= 0 ? input.slice(lastSepIndex + 1) : input;
        const currentSegmentLower = currentSegment.toLowerCase();

        // Collect unique next-level paths
        const suggestions = new Map<string, Suggestion>();

        // First, add matching paths
        paths.forEach((path) => {
            const pathLower = path.toLowerCase();

            // Path must start with the current prefix
            if (currentPrefix && !pathLower.startsWith(currentPrefix.toLowerCase())) {
                return;
            }

            // Get the remaining part after the prefix
            const remaining = path.slice(currentPrefix.length);

            // Current segment must match the beginning of remaining
            if (currentSegmentLower && !remaining.toLowerCase().startsWith(currentSegmentLower)) {
                return;
            }

            // Find the next separator in remaining
            const nextSepIndex = remaining.indexOf(separator);

            if (nextSepIndex >= 0) {
                // This is a folder - show up to next separator
                const folderPath = currentPrefix + remaining.slice(0, nextSepIndex);
                if (!suggestions.has(folderPath)) {
                    suggestions.set(folderPath, {
                        path: folderPath,
                        label: remaining.slice(0, nextSepIndex),
                        isFolder: true,
                        matchPrefix: currentPrefix,
                    });
                }
            } else {
                // This is a leaf path
                if (!suggestions.has(path)) {
                    suggestions.set(path, {
                        path,
                        label: remaining,
                        isFolder: false,
                        matchPrefix: currentPrefix,
                    });
                }
            }
        });

        // Sort: folders first, then alphabetically
        return Array.from(suggestions.values()).sort((a, b) => {
            if (a.isFolder !== b.isFolder) {
                return a.isFolder ? -1 : 1;
            }
            return a.label.localeCompare(b.label);
        });
    }
}

// =============================================================================
// Component
// =============================================================================

export function PathInput(props: PathInputProps) {
    const {
        placeholder = "Enter path...",
        className,
    } = props;

    const model = useComponentModel(props, PathInputModel, defaultPathInputState);
    const { open, highlightedIndex } = model.state.use();
    const suggestions = model.suggestions;
    const separator = model.separator;

    // Auto-focus on mount with caret at end
    useEffect(() => {
        model.autoFocusIfNeeded();
    }, []);

    return (
        <PathInputRoot className={clsx("path-input", className)}>
            <input
                ref={model.setInputRef}
                type="text"
                className="path-input-field"
                value={props.value}
                onChange={model.handleChange}
                onFocus={model.handleFocus}
                onBlur={model.handleBlur}
                onKeyDown={model.handleKeyDown}
                placeholder={placeholder}
                autoComplete="off"
            />
            <Popper
                elementRef={model.inputRef}
                open={open && suggestions.length > 0}
                onClose={model.handleClose}
                placement="bottom-start"
                allowClickInClass="path-input"
            >
                <SuggestionList>
                    {suggestions.map((suggestion, index) => (
                        <div
                            key={suggestion.path}
                            className={clsx("suggestion-item", {
                                highlighted: index === highlightedIndex,
                            })}
                            onClick={() => model.selectSuggestion(suggestion)}
                            onMouseEnter={() => model.setHighlightedIndex(index)}
                        >
                            {suggestion.matchPrefix && (
                                <span className="suggestion-match">
                                    {suggestion.matchPrefix}
                                </span>
                            )}
                            <span className="suggestion-segment">
                                {suggestion.label}
                            </span>
                            {suggestion.isFolder && (
                                <span className="suggestion-match">
                                    {separator}
                                </span>
                            )}
                        </div>
                    ))}
                </SuggestionList>
            </Popper>
        </PathInputRoot>
    );
}
