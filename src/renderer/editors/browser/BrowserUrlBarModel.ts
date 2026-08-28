import {
    detectSearchEngine,
    SEARCH_ENGINES,
} from "./BrowserEditorModel";
import { searchHistoryManager } from "./browser-search-history";
import type { MenuItem } from "../../uikit";
import { ContextMenuEvent } from "../../api/events/events";
import type { BrowserEditorModel } from "./BrowserEditorModel";

/**
 * Manages URL bar input, suggestions dropdown, and search engine selection
 * for the browser editor.
 */
export class BrowserUrlBarModel {
    readonly model: BrowserEditorModel;

    /** DOM reference for the URL input element. */
    urlInputRef: HTMLInputElement | null = null;

    constructor(model: BrowserEditorModel) {
        this.model = model;
    }

    /** Ref setter for the URL input element. Used in the view. */
    setUrlInputRef = (ref: HTMLInputElement | null) => {
        this.urlInputRef = ref;
    };

    /** Focus and select all text in the URL input. */
    focusUrlInput = () => {
        this.urlInputRef?.focus();
        setTimeout(() => this.urlInputRef?.select(), 0);
    };

    /**
     * Sync the URL input from an external source (navigation event, tab switch).
     * Closes suggestions dropdown.
     */
    syncFromUrl = (url: string) => {
        this.model.state.update((s) => {
            s.urlInput = url;
            s.suggestionsOpen = false;
        });
    };

    /** Refresh search entries from the search history storage. */
    loadSearchEntries = () => {
        const storage = this.searchStorage;
        if (storage) {
            this.model.state.update((s) => {
                s.searchEntries = storage.getAll();
            });
        }
    };

    // =====================================================================
    // Computed Getters
    // =====================================================================

    get searchStorage() {
        const { profileName, isIncognito } = this.model.state.get();
        return searchHistoryManager.get(profileName, isIncognito);
    }

    get detectedSearch() {
        const { urlInput } = this.model.state.get();
        return detectSearchEngine(urlInput);
    }

    get isBlankPage() {
        const { urlInput } = this.model.state.get();
        return !urlInput || urlInput === "about:blank";
    }

    get showSearchEngineSelector() {
        if (this.isBlankPage || this.detectedSearch) return true;
        const { urlInput } = this.model.state.get();
        if (!urlInput) return false;
        const trimmed = urlInput.trim();
        // Hide for URLs with a protocol scheme
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return false;
        // Show for anything else (search queries, partial text)
        return true;
    }

    get currentEngineName() {
        const detected = this.detectedSearch;
        if (detected) return detected.engine.label;
        const { searchEngineId } = this.model.state.get();
        return SEARCH_ENGINES.find((e) => e.id === searchEngineId)?.label || "Google";
    }

    get suggestionsMode(): "navigation" | "search" {
        const { userHasTyped, urlInput } = this.model.state.get();
        return (!userHasTyped && urlInput)
            ? "navigation"
            : "search";
    }

    get suggestionsItems(): string[] {
        const s = this.model.state.get();
        if (!s.suggestionsOpen) return [];
        const mode = this.suggestionsMode;
        if (mode === "navigation") {
            const activeTab = s.tabs.find((t) => t.id === s.activeTabId);
            return activeTab?.navHistory ?? [];
        }
        const text = s.urlInput.trim();
        if (!text) return s.searchEntries;
        const words = text.toLowerCase().split(/\s+/).filter((w) => w);
        if (!words.length) return s.searchEntries;
        return s.searchEntries.filter((entry) => {
            const lower = entry.toLowerCase();
            return words.every((w) => lower.includes(w));
        });
    }

    get searchEngineMenuItems(): MenuItem[] {
        const detected = this.detectedSearch;
        return SEARCH_ENGINES.map((engine) => ({
            label: engine.label,
            onClick: () => {
                if (detected) {
                    this.model.switchSearchEngine(engine.id);
                } else {
                    this.model.setSearchEngine(engine.id);
                }
            },
        }));
    }

    // =====================================================================
    // Event Handlers
    // =====================================================================

    handleUrlKeyDown = (e: KeyboardEvent) => {
        const s = this.model.state.get();
        const items = this.suggestionsItems;

        if (s.suggestionsOpen && items.length > 0) {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    this.model.state.update((st) => {
                        st.hoveredIndex = Math.min(st.hoveredIndex + 1, items.length - 1);
                    });
                    return;
                case "ArrowUp":
                    e.preventDefault();
                    this.model.state.update((st) => {
                        st.hoveredIndex = Math.max(st.hoveredIndex - 1, -1);
                    });
                    return;
                case "Enter":
                    if (s.hoveredIndex >= 0 && s.hoveredIndex < items.length) {
                        e.preventDefault();
                        const value = items[s.hoveredIndex];
                        this.model.state.update((st) => {
                            st.urlInput = value;
                            st.suggestionsOpen = false;
                        });
                        this.model.navigate(value);
                        this.urlInputRef?.blur();
                        return;
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    this.model.state.update((st) => {
                        st.suggestionsOpen = false;
                    });
                    return;
            }
        }
        if (e.key === "Enter") {
            e.preventDefault();
            this.model.state.update((st) => {
                st.suggestionsOpen = false;
            });
            this.model.navigate(s.urlInput);
            this.urlInputRef?.blur();
        } else if (e.key === "Escape") {
            this.model.state.update((st) => {
                st.suggestionsOpen = false;
                st.urlInput = st.url;
            });
            this.urlInputRef?.blur();
        }
    };

    handleNavigate = () => {
        this.model.state.update((s) => {
            s.suggestionsOpen = false;
        });
        const { urlInput } = this.model.state.get();
        this.model.navigate(urlInput);
        this.urlInputRef?.blur();
    };

    handleUrlContextMenu = (e: MouseEvent) => {
        const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "browser-url-bar");
        ctxEvent.items.push({
            label: "Paste and Go",
            startGroup: true,
            onClick: async () => {
                const text = await navigator.clipboard.readText();
                if (text) {
                    this.model.state.update((s) => {
                        s.urlInput = text;
                    });
                    this.model.navigate(text);
                }
            },
        });
    };

    handleUrlFocus = () => {
        setTimeout(() => this.urlInputRef?.select(), 0);
        this.model.state.update((s) => {
            s.suggestionsOpen = true;
            s.userHasTyped = false;
            s.hoveredIndex = -1;
        });
        this.loadSearchEntries();
    };

    handleUrlBlur = () => {
        // Clear any lingering DOM selection from the URL input so it doesn't
        // leak into global context menus as phantom "selected text".
        window.getSelection()?.removeAllRanges();
        this.model.state.update((s) => {
            s.suggestionsOpen = false;
        });
    };

    handleUrlChange = (value: string) => {
        this.model.state.update((s) => {
            s.urlInput = value;
            s.userHasTyped = true;
            s.hoveredIndex = -1;
        });
    };

    handleSuggestionSelect = (value: string) => {
        this.model.state.update((s) => {
            s.urlInput = value;
            s.suggestionsOpen = false;
        });
        this.model.navigate(value);
        this.urlInputRef?.blur();
    };

    handleClearVisible = () => {
        const storage = this.searchStorage;
        if (!storage) return;
        storage.removeMany(this.suggestionsItems);
        this.model.state.update((s) => {
            s.searchEntries = storage.getAll();
        });
    };
}
