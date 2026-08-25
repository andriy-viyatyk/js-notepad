import { useMemo, useState, type KeyboardEvent } from "react";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Textarea } from "../../uikit/Textarea";
import { Select } from "../../uikit/Select";
import { Button } from "../../uikit/Button";
import { Spinner } from "../../uikit/Spinner";
import { TagsInput } from "../../uikit/TagsInput";
import { DateInput } from "../../uikit/DateInput";
import type { IListBoxItem } from "../../uikit/ListBox";
import { MarkdownBlock } from "../markdown";
import {
    MnemeRootEditorModel,
    type MnemeSearchMode,
} from "./MnemeRootEditorModel";
import { resultsToMarkdown } from "./results-to-markdown";

// =============================================================================
// Component — search main view (US-676). A query input + mode combobox feeds
// `search` scoped to this editor's root; results open via `openRawLink`.
// The editor's secondary surface remains its "Wiki" read-only tree panel.
// =============================================================================

/** Fixed mode options for the combobox (Hybrid selected by default). */
const MODE_ITEMS: IListBoxItem[] = [
    { value: "hybrid", label: "Hybrid" },
    { value: "text", label: "Text" },
    { value: "vector", label: "Vector" },
];

export function MnemeRootEditorView({ model }: { model: MnemeRootEditorModel }) {
    const s = model.state.use((st) => ({
        rootName: st.rootName,
        resolving: st.resolving,
        error: st.error,
        searchQuery: st.searchQuery,
        searchMode: st.searchMode,
        searching: st.searching,
        results: st.results,
        searchNote: st.searchNote,
        searchError: st.searchError,
        hasSearched: st.hasSearched,
        filterTags: st.filterTags,
        filterExcludeTags: st.filterExcludeTags,
        dateFrom: st.dateFrom,
        dateTo: st.dateTo,
        tagVocab: st.tagVocab,
    }));

    const busy = s.resolving || s.searching;
    const selectedMode = MODE_ITEMS.find((m) => m.value === s.searchMode) ?? MODE_ITEMS[0];

    // Results render as one generated markdown document (US-680). Document links are
    // `mneme://…` URLs that navigate via the standard openRawLink flow (open in a new page).
    const resultsMarkdown = useMemo(() => resultsToMarkdown(s.results), [s.results]);

    // Filters section — expand state is transient view UI (the filter *values* live in
    // model state). Tag vocabulary loads lazily on first expand.
    const [filtersOpen, setFiltersOpen] = useState(false);
    const activeFilterCount =
        (s.filterTags.length ? 1 : 0) +
        (s.filterExcludeTags.length ? 1 : 0) +
        (s.dateFrom || s.dateTo ? 1 : 0);

    const toggleFilters = () => {
        const next = !filtersOpen;
        setFiltersOpen(next);
        if (next) void model.loadTagVocab();
    };

    // Textarea is `singleLine`, so its internal handler suppresses Enter — but the
    // caller hook runs first and `preventDefault()` takes ownership for submit.
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void model.runSearch();
        }
    };

    return (
        <Panel direction="column" flex={1} width="100%">
            {/* Search + filters toolbar (dark, default-toolbar density) */}
            <Panel
                name="mneme-search-toolbar"
                direction="column"
                gap="sm"
                background="dark"
                borderBottom
                shrink={false}
                paddingX="sm"
                paddingY="xs"
            >
                <Panel direction="row" gap="sm" align="start">
                    <Textarea
                        name="mneme-search-input"
                        singleLine
                        size="sm"
                        flex={1}
                        minHeight={24}
                        maxHeight={140}
                        value={s.searchQuery}
                        onChange={(v) => model.setQuery(v)}
                        onKeyDown={handleKeyDown}
                        placeholder={s.rootName ? `Search ${s.rootName}…` : "Search…"}
                        disabled={busy}
                    />
                    <Select
                        name="mneme-search-mode"
                        size="sm"
                        width={110}
                        items={MODE_ITEMS}
                        value={selectedMode}
                        onChange={(item) => model.setMode(item.value as MnemeSearchMode)}
                        disabled={busy}
                        filterMode="off"
                    />
                    <Button
                        name="mneme-filters-toggle"
                        size="sm"
                        icon={filtersOpen ? "chevron-down" : "chevron-right"}
                        onClick={toggleFilters}
                    >
                        {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
                    </Button>
                    <Button
                        name="mneme-search-run"
                        size="sm"
                        icon="search"
                        onClick={() => void model.runSearch()}
                        disabled={busy || !s.rootName}
                    >
                        Search
                    </Button>
                </Panel>

                {filtersOpen && (
                    <>
                        <Panel direction="column" gap="xs">
                            <Text size="xs" color="light">Include tags</Text>
                            <TagsInput
                                name="mneme-filter-tags"
                                value={s.filterTags}
                                onChange={(t) => model.setFilterTags(t)}
                                items={s.tagVocab}
                                placeholder="Add tag…"
                                size="sm"
                                disabled={!s.rootName}
                            />
                        </Panel>
                        <Panel direction="column" gap="xs">
                            <Text size="xs" color="light">Exclude tags</Text>
                            <TagsInput
                                name="mneme-filter-exclude-tags"
                                value={s.filterExcludeTags}
                                onChange={(t) => model.setExcludeTags(t)}
                                items={s.tagVocab}
                                placeholder="Add tag…"
                                size="sm"
                                tagVariant="outlined"
                                disabled={!s.rootName}
                            />
                        </Panel>
                        <Panel direction="row" gap="md" align="center" justify="between" wrap>
                            <Panel direction="row" gap="md" align="center" wrap>
                                <Panel direction="row" gap="xs" align="center">
                                    <Text size="xs" color="light">Created from</Text>
                                    <DateInput
                                        name="mneme-filter-date-from"
                                        value={s.dateFrom}
                                        onChange={(d) => model.setDateFrom(d)}
                                        size="sm"
                                        width={150}
                                        disabled={!s.rootName}
                                    />
                                </Panel>
                                <Panel direction="row" gap="xs" align="center">
                                    <Text size="xs" color="light">to</Text>
                                    <DateInput
                                        name="mneme-filter-date-to"
                                        value={s.dateTo}
                                        onChange={(d) => model.setDateTo(d)}
                                        size="sm"
                                        width={150}
                                        disabled={!s.rootName}
                                    />
                                </Panel>
                            </Panel>
                            {activeFilterCount > 0 && (
                                <Button
                                    name="mneme-filters-clear"
                                    variant="link"
                                    size="sm"
                                    icon="close"
                                    onClick={() => model.clearFilters()}
                                >
                                    Clear
                                </Button>
                            )}
                        </Panel>
                    </>
                )}
            </Panel>

            {/* Status strip — loading / error / degraded-mode note */}
            {(s.searching || s.searchError || s.searchNote) && (
                <Panel direction="row" gap="sm" align="center" paddingX="md" paddingY="sm" shrink={false}>
                    {s.searching && (
                        <>
                            <Spinner size={14} />
                            <Text size="sm" color="light">Searching…</Text>
                        </>
                    )}
                    {!s.searching && s.searchError && (
                        <Text size="sm" color="error">{s.searchError}</Text>
                    )}
                    {!s.searching && !s.searchError && s.searchNote && (
                        <Text size="sm" color="light">{s.searchNote}</Text>
                    )}
                </Panel>
            )}

            {/* Results */}
            <Panel direction="column" flex={1} height={0} width="100%" overflowY="auto">
                {!s.rootName ? (
                    <Panel flex={1} align="center" justify="center" padding="md">
                        <Text color="light">
                            {s.error ?? (s.resolving ? "Connecting…" : "Mneme")}
                        </Text>
                    </Panel>
                ) : !s.hasSearched ? (
                    <Panel flex={1} align="center" justify="center" padding="md">
                        <Text color="light">Type a query and press Enter</Text>
                    </Panel>
                ) : s.results.length === 0 && !s.searching ? (
                    <Panel flex={1} align="center" justify="center" padding="md">
                        <Text color="light">No results</Text>
                    </Panel>
                ) : (
                    <Panel
                        name="mneme-search-results"
                        direction="column"
                        paddingX="md"
                        paddingY="sm"
                        shrink={false}
                    >
                        <MarkdownBlock content={resultsMarkdown} compact highlightText={s.searchQuery} />
                    </Panel>
                )}
            </Panel>
        </Panel>
    );
}
