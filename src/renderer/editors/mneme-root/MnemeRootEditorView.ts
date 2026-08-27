import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import type { TextareaProps } from "../../uikit/Textarea/Textarea";
import { SelectView } from "../../uikit/Select/SelectView";
import type { SelectViewProps } from "../../uikit/Select/SelectView";
import { ButtonView } from "../../uikit/Button/ButtonView";
import type { ButtonViewProps } from "../../uikit/Button/ButtonView";
import { SpinnerView } from "../../uikit/Spinner/SpinnerView";
import { TagsInputView } from "../../uikit/TagsInput/TagsInputView";
import { DateInputView } from "../../uikit/DateInput/DateInputView";
import { MarkdownBlockView } from "../markdown/MarkdownBlockView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorModel } from "../base/EditorModel";
import {
    MnemeRootEditorModel,
    type MnemeRootEditorState,
    type MnemeSearchMode,
} from "./MnemeRootEditorModel";
import { resultsToMarkdown } from "./results-to-markdown";
import type { IListBoxItem } from "../../uikit/ListBox";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/Textarea/Textarea.css";
import "../../uikit/Select/Select.css";
import "../../uikit/Button/Button.css";
import "../../uikit/Spinner/Spinner.css";
import "../../uikit/TagsInput/TagsInput.css";
import "../../uikit/Input/Input.css";
import "../markdown/MarkdownBlock.css";

const MODE_ITEMS: IListBoxItem[] = [
    { value: "hybrid", label: "Hybrid" },
    { value: "text", label: "Text" },
    { value: "vector", label: "Vector" },
];

type RootProjection = Pick<MnemeRootEditorState,
    "rootName" | "resolving" | "error" | "searchQuery" | "searchMode" | "searching" |
    "results" | "searchNote" | "searchError" | "hasSearched" | "filterTags" |
    "filterExcludeTags" | "dateFrom" | "dateTo" | "tagVocab">;

function projectState(state: MnemeRootEditorState): RootProjection {
    return {
        rootName: state.rootName, resolving: state.resolving, error: state.error,
        searchQuery: state.searchQuery, searchMode: state.searchMode, searching: state.searching,
        results: state.results, searchNote: state.searchNote, searchError: state.searchError,
        hasSearched: state.hasSearched, filterTags: state.filterTags,
        filterExcludeTags: state.filterExcludeTags, dateFrom: state.dateFrom, dateTo: state.dateTo,
        tagVocab: state.tagVocab,
    };
}

function buttonProps(name: string, children: string, onClick: () => void): ButtonViewProps {
    return { name, size: "sm", children, onClick };
}

interface RootFiltersProps { model: MnemeRootEditorModel; state: RootProjection; onClear: () => void; }

class RootFiltersView extends VanillaView<RootFiltersProps> {
    private includeTags: TagsInputView | undefined;
    private excludeTags: TagsInputView | undefined;
    private dateFrom: DateInputView | undefined;
    private dateTo: DateInputView | undefined;
    private clearHost: HTMLDivElement | undefined;
    private clearButton: ButtonView | undefined;

    public constructor(props: RootFiltersProps) {
        super(props, createPanelElement({ direction: "column", gap: "xs" }));
    }

    protected onMount(): void {
        const includePanel = createPanelElement({ direction: "column", gap: "xs" });
        includePanel.append(createTextElement("Include tags", { size: "xs", color: "light" }));
        this.includeTags = this.child(new TagsInputView(this.includeProps()));
        includePanel.append(this.includeTags.root);
        this.includeTags.mount();

        const excludePanel = createPanelElement({ direction: "column", gap: "xs" });
        excludePanel.append(createTextElement("Exclude tags", { size: "xs", color: "light" }));
        this.excludeTags = this.child(new TagsInputView(this.excludeProps()));
        excludePanel.append(this.excludeTags.root);
        this.excludeTags.mount();

        const dates = createPanelElement({ direction: "row", gap: "md", align: "center", justify: "between", wrap: true });
        const dateInputs = createPanelElement({ direction: "row", gap: "md", align: "center", wrap: true });
        const from = createPanelElement({ direction: "row", gap: "xs", align: "center" });
        from.append(createTextElement("Created from", { size: "xs", color: "light" }));
        this.dateFrom = this.child(new DateInputView(this.dateProps("from")));
        from.append(this.dateFrom.root);
        this.dateFrom.mount();
        const to = createPanelElement({ direction: "row", gap: "xs", align: "center" });
        to.append(createTextElement("to", { size: "xs", color: "light" }));
        this.dateTo = this.child(new DateInputView(this.dateProps("to")));
        to.append(this.dateTo.root);
        this.dateTo.mount();
        dateInputs.append(from, to);
        this.clearHost = createPanelElement({ direction: "row", gap: "sm", justify: "end" });
        dates.append(dateInputs, this.clearHost);

        this.root.append(includePanel, excludePanel, dates);
        this.sync(this.props);
    }

    protected onUpdate(props: RootFiltersProps): void { this.sync(props); }

    protected onDispose(): void {
        this.clearButton = undefined;
        this.includeTags = undefined; this.excludeTags = undefined;
        this.dateFrom = undefined; this.dateTo = undefined;
        this.clearHost = undefined;
    }

    private sync(props: RootFiltersProps): void {
        const { includeTags, excludeTags, dateFrom, dateTo, clearHost } = this;
        if (!includeTags || !excludeTags || !dateFrom || !dateTo || !clearHost) return;
        includeTags.update(this.includeProps());
        excludeTags.update(this.excludeProps());
        dateFrom.update(this.dateProps("from"));
        dateTo.update(this.dateProps("to"));
        const hasFilters = props.state.filterTags.length > 0 || props.state.filterExcludeTags.length > 0
            || Boolean(props.state.dateFrom || props.state.dateTo);
        if (hasFilters && !this.clearButton) {
            this.clearButton = this.child(new ButtonView({
                ...buttonProps("mneme-filters-clear", "Clear", props.onClear), variant: "link", icon: "close",
            }));
            clearHost.append(this.clearButton.root); this.clearButton.mount();
        } else if (!hasFilters && this.clearButton) {
            this.releaseChild(this.clearButton); this.clearButton = undefined;
        } else {
            this.clearButton?.update({
                ...buttonProps("mneme-filters-clear", "Clear", props.onClear), variant: "link", icon: "close",
            });
        }
    }

    private includeProps() {
        return {
            name: "mneme-filter-tags", value: this.props.state.filterTags,
            onChange: (value: string[]) => this.props.model.setFilterTags(value),
            items: this.props.state.tagVocab, placeholder: "Add tag…", size: "sm" as const,
            disabled: !this.props.state.rootName,
        };
    }

    private excludeProps() {
        return {
            name: "mneme-filter-exclude-tags", value: this.props.state.filterExcludeTags,
            onChange: (value: string[]) => this.props.model.setExcludeTags(value),
            items: this.props.state.tagVocab, placeholder: "Add tag…", size: "sm" as const,
            tagVariant: "outlined" as const, disabled: !this.props.state.rootName,
        };
    }

    private dateProps(kind: "from" | "to") {
        return {
            name: kind === "from" ? "mneme-filter-date-from" : "mneme-filter-date-to",
            value: kind === "from" ? this.props.state.dateFrom : this.props.state.dateTo,
            onChange: (value: string) => kind === "from"
                ? this.props.model.setDateFrom(value) : this.props.model.setDateTo(value),
            size: "sm" as const, width: 150, disabled: !this.props.state.rootName,
        };
    }
}

interface RootStatusProps { searching: boolean; searchError?: string; searchNote?: string; }

class RootStatusView extends VanillaView<RootStatusProps> {
    private spinner: SpinnerView | undefined;
    private message: HTMLSpanElement | undefined;

    public constructor(props: RootStatusProps) {
        super(props, createPanelElement({ direction: "row", gap: "sm", align: "center", paddingX: "md", paddingY: "sm", shrink: false }));
    }

    protected onMount(): void {
        this.message = createTextElement("", { size: "sm", color: "light" });
        this.root.append(this.message); this.sync(this.props);
    }

    protected onUpdate(props: RootStatusProps): void { this.sync(props); }

    protected onDispose(): void {
        this.spinner = undefined; this.message = undefined;
    }

    private sync(props: RootStatusProps): void {
        const message = this.message;
        if (!message) return;
        if (props.searching && !this.spinner) {
            this.spinner = this.child(new SpinnerView({ size: 14 }));
            this.root.insertBefore(this.spinner.root, message); this.spinner.mount();
        } else if (!props.searching && this.spinner) {
            this.releaseChild(this.spinner); this.spinner = undefined;
        }
        const error = !props.searching && props.searchError;
        const note = !props.searching && !props.searchError && props.searchNote;
        this.message.textContent = props.searching ? "Searching…" : error || note || "";
        this.message.dataset.color = error ? "error" : "light";
    }
}

type ResultKind = "initial" | "not-searched" | "empty" | "results";
interface RootResultProps { kind: ResultKind; message: string; markdown: string; highlightText: string; }

class RootResultView extends VanillaView<RootResultProps> {
    private messageElement: HTMLSpanElement | undefined;
    private markdownView: MarkdownBlockView | undefined;

    public constructor(props: RootResultProps) {
        super(props, createPanelElement({ flex: true, align: "center", justify: "center", padding: "md" }));
    }

    protected onMount(): void { this.sync(this.props); }
    protected onUpdate(props: RootResultProps): void { this.sync(props); }
    protected onDispose(): void { this.messageElement = undefined; this.markdownView = undefined; }

    private sync(props: RootResultProps): void {
        if (props.kind === "results") {
            if (!this.markdownView) {
                applyPanelAttributes(this.root, resolvePanelAttributes({
                    name: "mneme-search-results", direction: "column", paddingX: "md", paddingY: "sm", shrink: false,
                }));
                this.markdownView = this.child(new MarkdownBlockView({
                    content: props.markdown, compact: true, highlightText: props.highlightText,
                }));
                this.root.append(this.markdownView.root); this.markdownView.mount();
            } else {
                this.markdownView.update({ content: props.markdown, compact: true, highlightText: props.highlightText });
            }
            this.messageElement?.remove(); this.messageElement = undefined; return;
        }
        if (this.markdownView) {
            this.releaseChild(this.markdownView); this.markdownView = undefined;
        }
        applyPanelAttributes(this.root, resolvePanelAttributes({ flex: true, align: "center", justify: "center", padding: "md" }));
        if (!this.messageElement) {
            this.messageElement = createTextElement(props.message, { color: "light" }); this.root.append(this.messageElement);
        } else this.messageElement.textContent = props.message;
    }
}

export interface MnemeRootEditorViewProps { model: EditorModel; }

function requireRootModel(model: EditorModel): MnemeRootEditorModel {
    if (!(model instanceof MnemeRootEditorModel)) throw new Error("Mneme root view received an invalid model.");
    return model;
}

export class MnemeRootEditorView extends VanillaView<MnemeRootEditorViewProps> {
    private model: MnemeRootEditorModel | undefined;
    private stateSubscription: (() => void) | undefined;
    private live = false;
    private filtersOpen = false;
    private toolbar: HTMLDivElement | undefined;
    private filtersHost: HTMLDivElement | undefined;
    private statusHost: HTMLDivElement | undefined;
    private resultsHost: HTMLDivElement | undefined;
    private queryInput: TextareaView | undefined;
    private modeSelect: SelectView<IListBoxItem> | undefined;
    private filtersButton: ButtonView | undefined;
    private searchButton: ButtonView | undefined;
    private filtersView: RootFiltersView | undefined;
    private statusView: RootStatusView | undefined;
    private resultView: RootResultView | undefined;
    private resultKind: ResultKind | undefined;

    public constructor(props: MnemeRootEditorViewProps) {
        super(props, createPanelElement({ direction: "column", flex: true, width: "100%" }));
        this.model = requireRootModel(props.model);
    }

    protected onMount(): void {
        const model = this.model;
        if (!model) return;
        this.live = true; this.buildShell(); this.subscribeToModel(model); this.sync(projectState(model.state.get()));
    }

    protected onUpdate(props: MnemeRootEditorViewProps): void {
        const model = requireRootModel(props.model);
        if (model !== this.model) this.replaceModelSubscription(model);
        this.sync(projectState(model.state.get()));
    }

    protected onDispose(): void {
        this.live = false;
        this.stateSubscription?.(); this.stateSubscription = undefined;
        this.model = undefined;
        this.toolbar = undefined; this.filtersHost = undefined;
        this.statusHost = undefined; this.resultsHost = undefined;
        this.queryInput = undefined; this.modeSelect = undefined;
        this.filtersButton = undefined; this.searchButton = undefined;
        this.filtersView = undefined; this.statusView = undefined; this.resultView = undefined;
    }

    private buildShell(): void {
        this.toolbar = createPanelElement({
            name: "mneme-search-toolbar", direction: "column", gap: "sm", background: "dark",
            borderBottom: true, shrink: false, paddingX: "sm", paddingY: "xs",
        });
        const controls = createPanelElement({ direction: "row", gap: "sm", align: "start" });
        this.queryInput = this.child(new TextareaView(this.queryProps()));
        this.modeSelect = this.child(new SelectView<IListBoxItem>(this.modeProps()));
        this.filtersButton = this.child(new ButtonView(this.filterButtonProps()));
        this.searchButton = this.child(new ButtonView(this.searchButtonProps()));
        controls.append(this.queryInput.root, this.modeSelect.root, this.filtersButton.root, this.searchButton.root);
        this.queryInput.mount(); this.modeSelect.mount(); this.filtersButton.mount(); this.searchButton.mount();
        this.filtersHost = createPanelElement({ direction: "column", gap: "xs" });
        this.toolbar.append(controls, this.filtersHost);
        this.statusHost = createPanelElement({});
        this.resultsHost = createPanelElement({ direction: "column", flex: true, height: 0, width: "100%", overflowY: "auto" });
        this.root.append(this.toolbar, this.statusHost, this.resultsHost);
    }

    private subscribeToModel(model: MnemeRootEditorModel): void {
        this.stateSubscription?.();
        this.stateSubscription = model.state.subscribe(() => {
            if (!this.live || this.model !== model) return;
            this.sync(projectState(model.state.get()));
        });
    }

    private replaceModelSubscription(model: MnemeRootEditorModel): void {
        this.stateSubscription?.(); this.stateSubscription = undefined;
        this.model = model; this.subscribeToModel(model);
    }

    private sync(state: RootProjection): void {
        const { queryInput, modeSelect, filtersButton, searchButton, statusHost, resultsHost } = this;
        const model = this.model;
        if (!model || !queryInput || !modeSelect || !filtersButton || !searchButton || !statusHost || !resultsHost) return;
        const busy = state.resolving || state.searching;
        queryInput.update(this.queryProps(state, busy)); modeSelect.update(this.modeProps(state, busy));
        filtersButton.update(this.filterButtonProps(state)); searchButton.update(this.searchButtonProps(state, busy));
        if (this.filtersOpen) this.filtersView?.update({ model, state, onClear: model.clearFilters });

        const statusVisible = state.searching || Boolean(state.searchError || state.searchNote);
        if (statusVisible && !this.statusView) {
            this.statusView = this.child(new RootStatusView({ searching: state.searching, searchError: state.searchError, searchNote: state.searchNote }));
            statusHost.append(this.statusView.root); this.statusView.mount();
        } else if (!statusVisible && this.statusView) {
            this.releaseChild(this.statusView); this.statusView = undefined;
        } else this.statusView?.update({ searching: state.searching, searchError: state.searchError, searchNote: state.searchNote });

        const kind = this.resultKindFor(state);
        const message = !state.rootName ? state.error ?? (state.resolving ? "Connecting…" : "Mneme")
            : !state.hasSearched ? "Type a query and press Enter" : "No results";
        const props: RootResultProps = { kind, message, markdown: resultsToMarkdown(state.results), highlightText: state.searchQuery };
        if (!this.resultView || this.resultKind !== kind) {
            const next = this.child(new RootResultView(props)); resultsHost.append(next.root); next.mount();
            const previous = this.resultView; this.resultView = next; this.resultKind = kind;
            if (previous) this.releaseChild(previous);
        } else this.resultView.update(props);
    }

    private resultKindFor(state: RootProjection): ResultKind {
        if (!state.rootName) return "initial";
        if (!state.hasSearched) return "not-searched";
        if (state.results.length === 0 && !state.searching) return "empty";
        return "results";
    }

    private toggleFilters = (): void => {
        const model = this.model;
        const filtersHost = this.filtersHost;
        const filtersButton = this.filtersButton;
        if (!model || !filtersHost || !filtersButton) return;
        this.filtersOpen = !this.filtersOpen;
        if (this.filtersOpen) {
            const state = projectState(model.state.get());
            this.filtersView = this.child(new RootFiltersView({ model, state, onClear: model.clearFilters }));
            filtersHost.append(this.filtersView.root); this.filtersView.mount(); void model.loadTagVocab();
        } else if (this.filtersView) {
            this.releaseChild(this.filtersView); this.filtersView = undefined;
        }
        filtersButton.update(this.filterButtonProps());
    };

    private readonly queryKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void this.model.runSearch(); }
    };

    private queryProps(state = projectState(this.model.state.get()), disabled = state.resolving || state.searching): TextareaProps {
        return {
            name: "mneme-search-input", singleLine: true, size: "sm", flex: true, minHeight: 24, maxHeight: 140,
            value: state.searchQuery, onChange: (value) => this.model.setQuery(value), onKeyDown: this.queryKeyDown,
            placeholder: state.rootName ? `Search ${state.rootName}…` : "Search…", disabled,
        };
    }

    private modeProps(state = projectState(this.model.state.get()), disabled = state.resolving || state.searching): SelectViewProps<IListBoxItem> {
        return {
            name: "mneme-search-mode", size: "sm", width: 110, items: MODE_ITEMS,
            value: MODE_ITEMS.find((item) => item.value === state.searchMode) ?? MODE_ITEMS[0],
            onChange: (item) => this.model.setMode(item.value as MnemeSearchMode), disabled, filterMode: "off",
        };
    }

    private filterButtonProps(state = projectState(this.model.state.get())): ButtonViewProps {
        const count = (state.filterTags.length ? 1 : 0) + (state.filterExcludeTags.length ? 1 : 0)
            + (state.dateFrom || state.dateTo ? 1 : 0);
        return {
            name: "mneme-filters-toggle", size: "sm", icon: this.filtersOpen ? "chevron-down" : "chevron-right",
            children: count > 0 ? `Filters (${count})` : "Filters", onClick: this.toggleFilters,
        };
    }

    private searchButtonProps(state = projectState(this.model.state.get()), disabled = state.resolving || state.searching): ButtonViewProps {
        return {
            name: "mneme-search-run", size: "sm", icon: "search", children: "Search",
            onClick: () => { void this.model.runSearch(); }, disabled: disabled || !state.rootName,
        };
    }
}
