import type { IMnemeRootEditor, IMnemeSearchHit, MnemeSearchMode } from "../../api/types/mneme-root-editor";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { MnemeRootEditorModel, WikiSearchHit } from "../../editors/mneme-root/MnemeRootEditorModel";

const MNEME_ROOT_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "mneme-search-input", purpose: "Locate the Mneme search query input." },
    { name: "mneme-search-mode", purpose: "Locate the Mneme text/vector/hybrid search-mode selector." },
    { name: "mneme-filters-toggle", purpose: "Locate the Mneme search filters toggle." },
    { name: "mneme-search-run", purpose: "Locate the Mneme search submit control." },
    { name: "mneme-filter-tags", purpose: "Locate the included-tag filter." },
    { name: "mneme-filter-exclude-tags", purpose: "Locate the excluded-tag filter." },
    { name: "mneme-filter-date-from", purpose: "Locate the inclusive lower date filter." },
    { name: "mneme-filter-date-to", purpose: "Locate the inclusive upper date filter." },
    { name: "mneme-filters-clear", purpose: "Locate the visible clear-filters control." },
];

const MNEME_ROOT_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id: mneme-root." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "rootFolder", kind: "property", summary: "The configured root folder, or undefined when empty." },
    { name: "rootName", kind: "property", summary: "The resolved Mneme root name, or undefined before resolution." },
    { name: "resolving", kind: "property", summary: "Whether the model is resolving the root against Mneme." },
    { name: "error", kind: "property", summary: "The root-resolution error, or undefined when there is none." },
    { name: "query", kind: "property", summary: "The current search query." },
    { name: "mode", kind: "property", summary: "The current validated search mode." },
    { name: "filterTags", kind: "property", summary: "Copied included-tag filters." },
    { name: "filterExcludeTags", kind: "property", summary: "Copied excluded-tag filters." },
    { name: "dateFrom", kind: "property", summary: "The inclusive lower date bound, or undefined when cleared." },
    { name: "dateTo", kind: "property", summary: "The inclusive upper date bound, or undefined when cleared." },
    { name: "tagVocab", kind: "property", summary: "Copied tag vocabulary after a successful model-backed load." },
    { name: "selectedDocumentHref", kind: "property", summary: "The selected document's model/tree href, or undefined when none is selected." },
    { name: "hasSearched", kind: "property", summary: "Whether a search attempt has completed." },
    { name: "searching", kind: "property", summary: "Whether a search call is in flight." },
    { name: "results", kind: "property", summary: "Copied search hits after a search attempt, or undefined before one." },
    { name: "searchNote", kind: "property", summary: "The current search degradation note, or undefined when absent." },
    { name: "searchError", kind: "property", summary: "The current search error, or undefined when absent." },
    { name: "setQuery", kind: "method", signature: "setQuery(query: string): void", summary: "Set the query without starting a search." },
    { name: "setMode", kind: "method", signature: "setMode(mode: MnemeSearchMode): void", summary: "Set text, vector, or hybrid mode without starting a search." },
    { name: "setFilterTags", kind: "method", signature: "setFilterTags(tags: string[]): void", summary: "Set included-tag filters." },
    { name: "setExcludeTags", kind: "method", signature: "setExcludeTags(tags: string[]): void", summary: "Set excluded-tag filters." },
    { name: "setDateFrom", kind: "method", signature: "setDateFrom(date: string): void", summary: "Set or clear the inclusive lower date bound." },
    { name: "setDateTo", kind: "method", signature: "setDateTo(date: string): void", summary: "Set or clear the inclusive upper date bound." },
    { name: "clearFilters", kind: "method", signature: "clearFilters(): void", summary: "Clear all tag and date filters." },
    { name: "runSearch", kind: "method", signature: "runSearch(): Promise<void>", summary: "Run the model-backed search with the current query and filters." },
];

const MNEME_ROOT_HELP = `Access via pages[i].editor after narrowing editor.id to "mneme-root".
This page-scoped facade exposes the resolved root, search query/mode, tag/date filters, selected
document href, tag vocabulary, search status, and copied ranked search hits. It is a configuration
and browsing surface, not a knowledge-base or filesystem API. It never exposes rendered Markdown,
the tree provider, tree nodes, document contents, or document mutation operations; document work
belongs to the Mneme MCP server.

Empty root, date, and message strings are returned as undefined. filterTags and
filterExcludeTags are always copied arrays, including []. tagVocab is absent until the model has
successfully loaded the vocabulary, then remains [] when the vocabulary is genuinely empty.
results is absent before a search has run, and is [] after a completed no-hit or failed/no-client
attempt. Result records and their tag arrays are copied, and absent optional snapshot fields are
omitted. selectedDocumentHref is model/tree state only; selection and document opening remain in
page.panels["mneme-tree"].

setMode validates runtime values against exactly text, vector, and hybrid. runSearch delegates to
the model; an empty query or unresolved root follows the model's no-search behavior and does not
manufacture a result array.`;

export class MnemeRootEditorFacade implements IAiVisible, IMnemeRootEditor {
    constructor(
        private readonly editor: MnemeRootEditorModel,
        readonly id: "mneme-root",
        readonly name: string,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(MNEME_ROOT_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "MnemeRootEditor",
            summary: "Model-backed Mneme root search and browsing-state facade.",
            members: [...MNEME_ROOT_MEMBERS, ...elements.members],
            help: MNEME_ROOT_HELP,
            elements: MNEME_ROOT_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "MnemeRootEditor",
                id: this.id,
                name: this.name,
                ...(this.rootFolder !== undefined ? { rootFolder: this.rootFolder } : {}),
                ...(this.rootName !== undefined ? { rootName: this.rootName } : {}),
                resolving: this.resolving,
                query: this.query,
                mode: this.mode,
                hasSearched: this.hasSearched,
                searching: this.searching,
                ...(this.error !== undefined ? { error: this.error } : {}),
            }),
        };
    }

    get rootFolder(): string | undefined { return this.editor.state.get().rootFolder || undefined; }

    get rootName(): string | undefined { return this.editor.state.get().rootName || undefined; }

    get resolving(): boolean { return this.editor.state.get().resolving; }

    get error(): string | undefined { return this.editor.state.get().error || undefined; }

    get query(): string { return this.editor.state.get().searchQuery; }

    get mode(): MnemeSearchMode { return this.editor.state.get().searchMode; }

    get filterTags(): readonly string[] { return [...this.editor.state.get().filterTags]; }

    get filterExcludeTags(): readonly string[] { return [...this.editor.state.get().filterExcludeTags]; }

    get dateFrom(): string | undefined { return this.editor.state.get().dateFrom || undefined; }

    get dateTo(): string | undefined { return this.editor.state.get().dateTo || undefined; }

    get tagVocab(): readonly string[] | undefined {
        const state = this.editor.state.get();
        return state.tagVocabLoaded ? [...state.tagVocab] : undefined;
    }

    get selectedDocumentHref(): string | undefined { return this.editor.state.get().selectedHref || undefined; }

    get hasSearched(): boolean { return this.editor.state.get().hasSearched; }

    get searching(): boolean { return this.editor.state.get().searching; }

    get results(): readonly IMnemeSearchHit[] | undefined {
        const state = this.editor.state.get();
        return state.hasSearched ? state.results.map(copySearchHit) : undefined;
    }

    get searchNote(): string | undefined { return this.editor.state.get().searchNote || undefined; }

    get searchError(): string | undefined { return this.editor.state.get().searchError || undefined; }

    setQuery(query: string): void { this.editor.setQuery(query); }

    setMode(mode: MnemeSearchMode): void { this.editor.setMode(mode); }

    setFilterTags(tags: string[]): void { this.editor.setFilterTags([...tags]); }

    setExcludeTags(tags: string[]): void { this.editor.setExcludeTags([...tags]); }

    setDateFrom(date: string): void { this.editor.setDateFrom(date); }

    setDateTo(date: string): void { this.editor.setDateTo(date); }

    clearFilters(): void { this.editor.clearFilters(); }

    runSearch(): Promise<void> { return this.editor.runSearch(); }
}

function copySearchHit(hit: WikiSearchHit): IMnemeSearchHit {
    return { uri: hit.uri, title: hit.title, tags: [...hit.tags], snippet: hit.snippet, score: hit.score };
}
