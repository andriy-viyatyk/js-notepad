import type { NativeHTMLAttributes } from "../shared/dom-props";
import { TComponentModel } from "../../core/state/model";
import type { Cleanup } from "../../core/utils/DisposableStore";
import { exceedsMaxDepth, getPathSuggestions, PathSuggestion } from "./suggestions";

// =============================================================================
// Props
// =============================================================================

export interface PathInputProps
    extends Omit<
        NativeHTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onChange" | "onBlur"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Current path value. */
    value: string;
    /** Live-update handler — fires on every keystroke and on folder selection. */
    onChange: (value: string) => void;
    /** Available paths used to derive suggestions. */
    paths: string[];
    /** Path separator. Default: "/". */
    separator?: string;
    /** Placeholder shown when value is empty. */
    placeholder?: string;
    /**
     * Commit handler — fires once per edit session when the input commits or cancels.
     *   • leaf-selection: `finalValue = leaf path`
     *   • Enter on typed value: `finalValue = value`
     *   • blur: `finalValue = current value`
     *   • Escape (popover already closed) or Enter on empty/separator-trailing value: `finalValue = undefined`
     * Folder selection does NOT fire onBlur — the input keeps editing.
     */
    onBlur?: (finalValue?: string) => void;
    /** Auto-focus on mount with caret at end. Default: false. */
    autoFocus?: boolean;
    /**
     * Maximum number of separator-delimited segments. When the input has more
     * segments than this, suggestions are hidden.
     */
    maxDepth?: number;
    /** Disabled state — input cannot be focused, popover never opens. */
    disabled?: boolean;
    /** Read-only state — input is focusable, but typing/popover are blocked. */
    readOnly?: boolean;
    /** Control size. Default: "md". */
    size?: "sm" | "md";
    "aria-label"?: string;
    "aria-labelledby"?: string;
}

// =============================================================================
// State
// =============================================================================

export interface PathInputState {
    open: boolean;
    activeIndex: number | null;
}

export const defaultPathInputState: PathInputState = {
    open: false,
    activeIndex: null,
};

// =============================================================================
// Model
// =============================================================================

export class PathInputModel extends TComponentModel<PathInputState, PathInputProps> {
    // --- refs (DOM) ---
    inputRef: HTMLInputElement | null = null;
    private readonly rowRefs = new Map<string, HTMLDivElement>();

    setInputRef = (el: HTMLInputElement | null) => {
        this.inputRef = el;
    };

    setRowRef = (path: string, el: HTMLDivElement | null) => {
        if (el) this.rowRefs.set(path, el);
        else this.rowRefs.delete(path);
    };

    getRowRef = (path: string): HTMLDivElement | undefined => this.rowRefs.get(path);

    // --- internal flags (not state — flipping them must not re-render) ---
    private selectionMade = false;
    private escapeCancelled = false;

    // --- derived ---

    suggestions: PathSuggestion[] = [];
    private suggestionsDeps: [string, string[], string | undefined, number | undefined] | undefined;
    private blurTimer: Cleanup | undefined;

    private suggestionsChanged = (props: PathInputProps): boolean => {
        const nextDeps: [string, string[], string | undefined, number | undefined] = [
            props.value,
            props.paths,
            props.separator,
            props.maxDepth,
        ];
        const previous = this.suggestionsDeps;
        this.suggestionsDeps = nextDeps;
        return !previous || nextDeps.some((value, index) => !Object.is(value, previous[index]));
    };

    private applySuggestions = (next: PathSuggestion[]): void => {
        this.suggestions = next;
        const validPaths = new Set(next.map((suggestion) => suggestion.path));
        for (const path of this.rowRefs.keys()) {
            if (!validPaths.has(path)) this.rowRefs.delete(path);
        }
        this.state.update((state) => {
            state.activeIndex = null;
        });
    };

    setProps = (props: PathInputProps): void => {
        if (!this.suggestionsChanged(props)) return;

        const { value, paths, separator = "/", maxDepth } = props;
        this.applySuggestions(
            exceedsMaxDepth(value, separator, maxDepth)
                ? []
                : getPathSuggestions(value, paths, separator),
        );
    };

    // --- handlers ---

    selectSuggestion = (s: PathSuggestion) => {
        const sep = this.props.separator ?? "/";
        if (s.isFolder) {
            this.props.onChange(s.path + sep);
            this.inputRef?.focus();
        } else {
            this.selectionMade = true;
            this.props.onChange(s.path);
            this.state.update((st) => {
                st.open = false;
            });
            this.props.onBlur?.(s.path);
        }
    };

    onInputChange = (v: string) => {
        // A keystroke starts a fresh edit session, so the previous session's leaf selection must
        // not keep suppressing the blur commit -- `onInputBlur` bails out while this flag is set,
        // which would silently drop a value typed after a selection.
        this.selectionMade = false;
        this.props.onChange(v);
        if (!this.props.disabled && !this.props.readOnly && !this.state.get().open) {
            this.state.update((s) => {
                s.open = true;
            });
        }
    };

    onInputClick = () => {
        // Selecting a leaf closes the popover but leaves the input focused, so a second click
        // produces no `focus` event and nothing else would reopen it -- adding several tags in a
        // row meant clicking away and back between every one. A click is an explicit gesture at
        // the field, so treat it as a request to see the suggestions.
        if (this.props.disabled || this.props.readOnly) return;
        if (this.state.get().open) return;
        this.state.update((s) => {
            s.open = true;
        });
    };

    onInputFocus = () => {
        if (!this.props.disabled && !this.props.readOnly) {
            this.state.update((s) => {
                s.open = true;
            });
        }
    };

    onInputBlur = () => {
        // 150ms grace so suggestion-row mouse clicks (and the Tab fall-through)
        // get a chance to set selectionMade before the commit fires.
        this.blurTimer?.();
        this.blurTimer = this.schedule.timeout(150, () => {
            this.blurTimer = undefined;
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
        });
    };

    onRowMouseDown = (e: MouseEvent) => {
        // Prevent the input from losing focus when a row is clicked.
        e.preventDefault();
    };

    onRowClick = (s: PathSuggestion) => {
        this.selectSuggestion(s);
    };

    setActiveIndex = (i: number | null): void => {
        this.state.update((s) => {
            s.activeIndex = i;
        });
    };

    onRowMouseEnter = (i: number) => {
        this.setActiveIndex(i);
    };

    onInputKeyDown = (e: KeyboardEvent) => {
        const { open, activeIndex } = this.state.get();
        const { disabled, readOnly, value } = this.props;
        const sep = this.props.separator ?? "/";

        if (!open) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (!disabled && !readOnly) {
                    this.state.update((s) => {
                        s.open = true;
                    });
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.escapeCancelled = true;
                this.inputRef?.blur();
                this.props.onBlur?.(undefined);
            }
            return;
        }

        const suggestions = this.suggestions;
        const n = suggestions.length;
        switch (e.key) {
            case "ArrowDown": {
                e.preventDefault();
                if (n === 0) break;
                const next = activeIndex == null || activeIndex < 0
                    ? 0
                    : activeIndex < n - 1 ? activeIndex + 1 : 0;
                this.setActiveIndex(next);
                break;
            }
            case "ArrowUp": {
                e.preventDefault();
                if (n === 0) break;
                const next = activeIndex == null || activeIndex <= 0
                    ? n - 1
                    : activeIndex - 1;
                this.setActiveIndex(next);
                break;
            }
            case "Enter": {
                e.preventDefault();
                if (activeIndex != null && activeIndex >= 0 && suggestions[activeIndex]) {
                    this.selectSuggestion(suggestions[activeIndex]);
                } else if (value !== "" && !value.endsWith(sep)) {
                    this.selectionMade = true;
                    this.state.update((s) => {
                        s.open = false;
                    });
                    this.props.onBlur?.(value);
                }
                break;
            }
            case "Tab": {
                if (activeIndex != null && activeIndex >= 0 && suggestions[activeIndex]) {
                    e.preventDefault();
                    this.selectSuggestion(suggestions[activeIndex]);
                }
                break;
            }
            case "Escape": {
                e.preventDefault();
                this.state.update((s) => {
                    s.open = false;
                });
                break;
            }
        }
    };

    onPopoverClose = () => {
        this.state.update((s) => {
            s.open = false;
        });
    };

    // --- lifecycle ---

    init() {
        // The vanilla view performs the input-ref completion after the nested view
        // bridge commits, so there are no lifecycle effects for the model driver to run.
    }

    dispose = (): void => {
        this.blurTimer?.();
        this.blurTimer = undefined;
        this.rowRefs.clear();
        this.inputRef = null;
    }
}
