import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { InputView } from "../../uikit/Input/InputView";
import { TagView } from "../../uikit/Tag/TagView";
import { DotView } from "../../uikit/Dot/DotView";
import { ProgressBarView } from "../../uikit/ProgressBar/ProgressBarView";
import { DividerView } from "../../uikit/Divider/DividerView";
import { claimViewOwnership, VanillaView } from "../../uikit/shared/vanilla-view";
import { KeyedList } from "../../uikit/shared/keyed-list";
import type { MnemeConfigEditorState } from "./MnemeConfigEditorModel";
import { MnemeConfigEditorModel } from "./MnemeConfigEditorModel";
import type { StaleIndexEntry, WikiRootConfig, WikiRootStatus, WikiReindexProgress } from "./mnemeTypes";
import { formatBytes, isReindexActive } from "./mnemeTypes";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/Button/Button.css";
import "../../uikit/Input/Input.css";
import "../../uikit/Tag/Tag.css";
import "../../uikit/ProgressBar/ProgressBar.css";
import "../../uikit/Divider/Divider.css";

export interface RootsPanelProps {
    model: MnemeConfigEditorModel;
    state: MnemeConfigEditorState;
}

interface RootRowProps {
    model: MnemeConfigEditorModel;
    root: WikiRootStatus;
    reindexProgress: Record<string, WikiReindexProgress>;
    rootConfigs: Record<string, WikiRootConfig>;
    staleIndexes: Record<string, StaleIndexEntry[]>;
}

function text(value: string, color?: "light" | "error" | "success", size: "xs" | "sm" | "md" | "base" = "md"): HTMLSpanElement {
    return createTextElement(value, { size, color });
}

export class RootsPanelView extends VanillaView<RootsPanelProps> {
    private rowsHost: HTMLDivElement | undefined;
    private emptyMessage: HTMLSpanElement | undefined;
    private rows: KeyedList<WikiRootStatus, string, HTMLElement> | undefined;
    private rowViews = new Map<HTMLElement, RootRowView>();
    private addButton: ButtonView | undefined;
    private reindexAllButton: ButtonView | undefined;

    public constructor(props: RootsPanelProps) {
        super(props, createPanelElement({ direction: "column" }));
    }

    protected onMount(): void {
        const header = createPanelElement({
            background: "dark", borderBottom: true, direction: "row", align: "center", gap: "sm",
            paddingX: "lg", paddingY: "sm",
        });
        header.append(text("Roots", undefined, "base"), createPanelElement({ flex: true }));
        this.addButton = this.child(new ButtonView({ name: "mneme-add-root", size: "sm", children: "+ Add root", onClick: this.addRoot }));
        this.reindexAllButton = this.child(new ButtonView({ name: "mneme-reindex-all", size: "sm", children: "Reindex all", onClick: this.reindexAll }));
        header.append(this.addButton.root, this.reindexAllButton.root);
        this.addButton.mount(); this.reindexAllButton.mount();

        const body = createPanelElement({ direction: "column", gap: "sm", padding: "lg" });
        this.emptyMessage = text("No roots configured. Add one to start indexing.", "light");
        this.rowsHost = createPanelElement({ direction: "column", gap: "sm" });
        body.append(this.emptyMessage, this.rowsHost);
        this.root.append(header, body);
        this.rows = new KeyedList<WikiRootStatus, string, HTMLElement>(this.rowsHost, {
            keyOf: (root) => root.name,
            create: (root) => this.createRow(root),
            update: (element, root) => this.updateRow(element, root),
            remove: (element) => this.removeRow(element),
        });
        this.own(() => this.rows.dispose());
        this.sync(this.props.state);
    }

    protected onUpdate(props: RootsPanelProps): void { this.sync(props.state); }

    protected onDispose(): void {
        this.rowViews.clear();
        this.rows = undefined; this.rowsHost = undefined;
        this.emptyMessage = undefined; this.addButton = undefined;
        this.reindexAllButton = undefined;
    }

    private sync(state: MnemeConfigEditorState): void {
        const { emptyMessage, addButton, reindexAllButton, rows } = this;
        if (!emptyMessage || !addButton || !reindexAllButton || !rows) return;
        const roots = state.status?.roots ?? [];
        emptyMessage.hidden = roots.length !== 0;
        addButton.update({ name: "mneme-add-root", size: "sm", children: "+ Add root", onClick: this.addRoot });
        reindexAllButton.update({
            name: "mneme-reindex-all", size: "sm", children: "Reindex all", disabled: state.connectionStatus !== "connected" || !!state.reindexProgress.__all__, onClick: this.reindexAll,
        });
        rows.update(roots);
    }

    private createRow(root: WikiRootStatus): HTMLElement {
        const view = new RootRowView(this.rowProps(root));
        claimViewOwnership(view); view.mount(); this.rowViews.set(view.root, view); return view.root;
    }

    private updateRow(element: HTMLElement, root: WikiRootStatus): void {
        this.rowViews.get(element)?.update(this.rowProps(root));
    }

    private removeRow(element: HTMLElement): void {
        const view = this.rowViews.get(element); view?.dispose(); this.rowViews.delete(element);
    }

    private rowProps(root: WikiRootStatus): RootRowProps {
        const state = this.props.state;
        return { model: this.props.model, root, reindexProgress: state.reindexProgress, rootConfigs: state.rootConfigs, staleIndexes: state.staleIndexes };
    }

    private readonly addRoot = (): void => { void this.props.model.addRoot(); };
    private readonly reindexAll = (): void => { void this.props.model.reindex(); };
}

class RootRowView extends VanillaView<RootRowProps> {
    private title: HTMLSpanElement | undefined;
    private folder: HTMLSpanElement | undefined;
    private docs: HTMLSpanElement | undefined;
    private bytes: HTMLSpanElement | undefined;
    private indexInfo: HTMLSpanElement | undefined;
    private filtersButton: ButtonView | undefined;
    private reindexButton: ButtonView | undefined;
    private removeButton: ButtonView | undefined;
    private progressHost: HTMLDivElement | undefined;
    private progressView: ProgressBarView | undefined;
    private progressText: HTMLSpanElement | undefined;
    private errorText: HTMLSpanElement | undefined;
    private staleHost: HTMLDivElement | undefined;
    private staleList: KeyedList<StaleIndexEntry, string, HTMLElement> | undefined;
    private staleViews = new Map<HTMLElement, StaleIndexRowView>();
    private filtersHost: HTMLDivElement | undefined;
    private filtersView: FiltersEditorView | undefined;
    private expanded = false;

    public constructor(props: RootRowProps) {
        super(props, createPanelElement({ direction: "column", gap: "xs", paddingY: "sm", border: true, rounded: "md", paddingX: "md" }));
    }

    protected onMount(): void {
        const top = createPanelElement({ direction: "row", align: "center", gap: "md" });
        this.title = text(this.props.root.name, undefined, "md"); this.title.dataset.variant = "link"; this.title.dataset.bold = "";
        this.folder = text(this.props.root.folder, "light"); this.folder.dataset.truncate = ""; this.folder.dataset.hoverUnderline = ""; this.folder.title = `Open in Explorer: ${this.props.root.folder}`;
        this.docs = text(`${this.props.root.docCount} docs`, "light"); this.bytes = text(formatBytes(this.props.root.indexBytes), "light");
        this.listen(this.title, "click", () => this.props.model.openRoot(this.props.root.folder));
        this.listen(this.folder, "click", () => this.props.model.showRootInExplorer(this.props.root.folder));
        const spacer = this.child(new SpacerView({}));
        top.append(this.title, this.folder, spacer.root, this.docs, this.bytes);

        const actions = createPanelElement({ direction: "row", align: "center", gap: "sm" });
        this.indexInfo = text("");
        const activeDot = this.child(new DotView({ size: "xs", color: "success" }));
        const activeText = text("active", "success", "xs");
        const fill = createPanelElement({ flex: true });
        this.filtersButton = this.child(new ButtonView({ name: this.filterName(), size: "sm", variant: "link", children: "Filters", onClick: this.toggleFilters }));
        this.reindexButton = this.child(new ButtonView(this.reindexProps()));
        this.removeButton = this.child(new ButtonView(this.removeProps()));
        actions.append(this.indexInfo, activeDot.root, activeText, fill, this.filtersButton.root, this.reindexButton.root, this.removeButton.root);
        activeDot.mount(); spacer.mount(); this.filtersButton.mount(); this.reindexButton.mount(); this.removeButton.mount();

        this.progressHost = createPanelElement({}); this.progressText = text("", "light", "xs");
        this.errorText = text("Background indexing failed — check the Mneme log; try Reindex.", "error", "xs"); this.errorText.hidden = true;
        this.staleHost = createPanelElement({ direction: "column", gap: "xs", paddingTop: "xs" });
        this.filtersHost = createPanelElement({});
        this.root.append(top, actions, this.progressHost, this.errorText, this.staleHost, this.filtersHost);
        this.staleList = new KeyedList<StaleIndexEntry, string, HTMLElement>(this.staleHost, {
            keyOf: (entry) => entry.path,
            create: (entry) => this.createStale(entry),
            update: (element, entry) => this.staleViews.get(element)?.update({ model: this.props.model, root: this.props.root.name, entry }),
            remove: (element) => this.removeStale(element),
        });
        this.own(() => this.staleList.dispose());
        this.sync(this.props);
    }

    protected onUpdate(props: RootRowProps): void { this.sync(props); }

    protected onDispose(): void {
        this.filtersView = undefined; this.progressView = undefined; this.staleViews.clear();
        this.staleList = undefined; this.filtersHost = undefined;
        this.progressHost = undefined; this.staleHost = undefined;
    }

    private sync(props: RootRowProps): void {
        const { title, folder, docs, bytes, indexInfo, filtersButton, reindexButton, removeButton, progressHost, progressText, errorText, staleList, filtersHost } = this;
        if (!title || !folder || !docs || !bytes || !indexInfo || !filtersButton || !reindexButton || !removeButton || !progressHost || !progressText || !errorText || !staleList || !filtersHost) return;
        const root = props.root; const manual = props.reindexProgress[root.name]; const bg = root.reindex;
        const bgActive = isReindexActive(bg); const progress = manual ?? (bgActive ? bg : undefined);
        title.textContent = root.name; folder.textContent = root.folder; folder.title = `Open in Explorer: ${root.folder}`;
        docs.textContent = `${root.docCount} docs`; bytes.textContent = formatBytes(root.indexBytes);
        indexInfo.textContent = `index: ${root.model}-${root.precision} · v${root.schemaVer}`;
        filtersButton.update({ name: this.filterName(), size: "sm", variant: "link", children: this.expanded ? "Hide filters" : "Filters", onClick: this.toggleFilters });
        reindexButton.update(this.reindexProps()); removeButton.update(this.removeProps());
        errorText.hidden = !( !manual && bg?.phase === "error");

        if (progress && !this.progressView) {
            const row = createPanelElement({ direction: "row", align: "center", gap: "sm" });
            const barHost = createPanelElement({ flex: true });
            this.progressView = this.child(new ProgressBarView({ value: progress.total > 0 ? progress.processed : undefined, max: progress.total > 0 ? progress.total : undefined }));
            barHost.append(this.progressView.root); this.progressView.mount();
            progressText.textContent = ""; row.append(barHost, progressText); progressHost.append(row);
        } else if (!progress && this.progressView) {
            this.releaseChild(this.progressView); this.progressView = undefined; progressHost.replaceChildren();
        } else if (progress && this.progressView) {
            this.progressView.update({ value: progress.total > 0 ? progress.processed : undefined, max: progress.total > 0 ? progress.total : undefined });
        }
        progressText.textContent = progress ? `${progress.phase}${progress.total > 0 ? ` ${progress.processed}/${progress.total}` : ""}` : "";

        const stale = (props.staleIndexes[root.name] ?? []).filter((entry) => !entry.active);
        staleList.update(stale);
        if (this.expanded) {
            if (!this.filtersView) {
                this.filtersView = this.child(new FiltersEditorView({ model: props.model, root: root.name, config: props.rootConfigs[root.name] }));
                filtersHost.append(this.filtersView.root); this.filtersView.mount();
            } else this.filtersView.update({ model: props.model, root: root.name, config: props.rootConfigs[root.name] });
        }
    }

    private createStale(entry: StaleIndexEntry): HTMLElement {
        const view = new StaleIndexRowView({ model: this.props.model, root: this.props.root.name, entry });
        claimViewOwnership(view); view.mount(); this.staleViews.set(view.root, view); return view.root;
    }
    private removeStale(element: HTMLElement): void { this.staleViews.get(element)?.dispose(); this.staleViews.delete(element); }
    private filterName(): string { return `mneme-filters-${this.props.root.name}`; }
    private readonly toggleFilters = (): void => {
        this.expanded = !this.expanded;
        if (!this.expanded && this.filtersView) { this.releaseChild(this.filtersView); this.filtersView = undefined; }
        if (this.expanded && !this.props.rootConfigs[this.props.root.name]) void this.props.model.getRootConfig(this.props.root.name);
        this.filtersButton.update({ name: this.filterName(), size: "sm", variant: "link", children: this.expanded ? "Hide filters" : "Filters", onClick: this.toggleFilters });
        if (this.expanded) this.sync(this.props);
    };
    private reindexProps() {
        const manual = this.props.reindexProgress[this.props.root.name]; const bgActive = isReindexActive(this.props.root.reindex);
        return manual ? { name: `mneme-cancel-${this.props.root.name}`, size: "sm" as const, variant: "danger" as const, children: "Cancel", onClick: () => this.props.model.cancelReindex(this.props.root.name) }
            : { name: `mneme-reindex-${this.props.root.name}`, size: "sm" as const, variant: "default" as const, children: bgActive ? "Indexing…" : "Reindex", disabled: bgActive, onClick: () => { void this.props.model.reindex(this.props.root.name); } };
    }
    private removeProps() {
        const busy = !!this.props.reindexProgress[this.props.root.name] || isReindexActive(this.props.root.reindex);
        return { name: `mneme-remove-${this.props.root.name}`, size: "sm" as const, variant: "danger" as const, children: "Remove", disabled: busy, onClick: () => { void this.props.model.removeRoot(this.props.root.name); } };
    }
}

interface StaleIndexRowProps { model: MnemeConfigEditorModel; root: string; entry: StaleIndexEntry; }
class StaleIndexRowView extends VanillaView<StaleIndexRowProps> {
    private label: HTMLSpanElement | undefined; private bytes: HTMLSpanElement | undefined; private button: ButtonView | undefined;
    public constructor(props: StaleIndexRowProps) { super(props, createPanelElement({ direction: "row", align: "center", gap: "sm" })); }
    protected onMount(): void {
        this.label = text(""); this.bytes = text("", "light"); this.button = this.child(new ButtonView(this.buttonProps()));
        const spacer = createPanelElement({ flex: true }); this.root.append(this.label, this.bytes, spacer, this.button.root); this.button.mount(); this.sync(this.props);
    }
    protected onUpdate(props: StaleIndexRowProps): void { this.sync(props); }
    private sync(props: StaleIndexRowProps): void { const { label, bytes, button } = this; if (!label || !bytes || !button) return; label.textContent = `stale: ${props.entry.modelId} / v${props.entry.schemaVer}`; bytes.textContent = formatBytes(props.entry.bytes); button.update(this.buttonProps()); }
    private buttonProps() { const e = this.props.entry; return { name: `mneme-delidx-${this.props.root}-${e.modelId}-${e.schemaVer}`, size: "sm" as const, variant: "danger" as const, children: "Delete", onClick: () => { void this.props.model.deleteIndex(this.props.root, e.modelId, e.schemaVer); } }; }
}

interface FiltersEditorProps { model: MnemeConfigEditorModel; root: string; config?: WikiRootConfig; }
export class FiltersEditorView extends VanillaView<FiltersEditorProps> {
    private content: HTMLDivElement | undefined; private loading: HTMLSpanElement | undefined;
    private include: string[] | null = null; private ignore: string[] | null = null;
    private includeDraft = ""; private ignoreDraft = ""; private live = false;
    private includeList: KeyedList<string, string, HTMLSpanElement> | undefined;
    private ignoreList: KeyedList<string, string, HTMLSpanElement> | undefined;
    private tagViews = new Map<HTMLSpanElement, TagView>();
    private includeTags: HTMLDivElement | undefined; private ignoreTags: HTMLDivElement | undefined;
    private includeInput: InputView | undefined; private ignoreInput: InputView | undefined;
    private addIncludeButton: ButtonView | undefined; private addIgnoreButton: ButtonView | undefined;
    private applyButton: ButtonView | undefined; private resetButton: ButtonView | undefined;
    private divider: DividerView | undefined;

    public constructor(props: FiltersEditorProps) { super(props, createPanelElement({ direction: "column", gap: "sm", paddingY: "sm" })); }
    protected onMount(): void {
        this.live = true; this.content = createPanelElement({}); this.loading = text("Loading filters…", "light", "xs"); this.root.append(this.content); this.sync(this.props);
    }
    protected onUpdate(props: FiltersEditorProps): void { this.sync(props); }
    protected onDispose(): void { this.live = false; this.disposeControls(); this.content = undefined; this.loading = undefined; }

    private sync(props: FiltersEditorProps): void {
        const { content, loading } = this;
        if (!content || !loading) return;
        if (!props.config) {
            if (this.hasControls()) this.disposeControls();
            if (content.firstChild !== loading) content.replaceChildren(loading);
            return;
        }
        if (!this.hasControls()) this.createControls();
        const { includeInput, ignoreInput, resetButton, applyButton } = this;
        if (!includeInput || !ignoreInput || !resetButton || !applyButton) return;
        const cfg = props.config; const inc = this.include ?? cfg.include; const ign = this.ignore ?? cfg.ignore;
        this.includeList?.update(inc); this.ignoreList?.update(ign);
        includeInput.update({ name: `mneme-include-add-${props.root}`, size: "sm", placeholder: "add include glob (e.g. **/*.md)", value: this.includeDraft, onChange: (v) => { this.includeDraft = v; this.includeInput?.update(this.includeInputProps("include")); }, onKeyDown: this.keyHandler("include"), width: 260 });
        ignoreInput.update({ name: `mneme-ignore-add-${props.root}`, size: "sm", placeholder: "add ignore glob (e.g. drafts/**)", value: this.ignoreDraft, onChange: (v) => { this.ignoreDraft = v; this.ignoreInput?.update(this.includeInputProps("ignore")); }, onKeyDown: this.keyHandler("ignore"), width: 260 });
        const dirty = JSON.stringify(inc) !== JSON.stringify(cfg.include) || JSON.stringify(ign) !== JSON.stringify(cfg.ignore);
        resetButton.update({ name: `mneme-filters-reset-${props.root}`, size: "sm", variant: "ghost", children: "Reset", disabled: !dirty, onClick: this.reset });
        applyButton.update({ name: `mneme-filters-apply-${props.root}`, size: "sm", variant: "primary", children: "Apply & reindex", disabled: !dirty, onClick: this.apply });
    }

    private hasControls(): boolean { return !!this.includeInput; }
    private createControls(): void {
        this.content.replaceChildren(); this.divider = this.child(new DividerView({})); this.content.append(this.divider.root); this.divider.mount();
        this.content.append(text("Include (empty → defaults to *.md)", "light", "xs"));
        this.includeTags = createPanelElement({ direction: "row", wrap: true, gap: "xs", align: "center" }); this.content.append(this.includeTags);
        this.includeInput = this.child(new InputView(this.includeInputProps("include"))); this.addIncludeButton = this.child(new ButtonView({ name: `mneme-include-addbtn-${this.props.root}`, size: "sm", children: "Add", onClick: () => this.addGlob("include") }));
        const includeRow = createPanelElement({ direction: "row", gap: "xs", align: "center" }); includeRow.append(this.includeInput.root, this.addIncludeButton.root); this.content.append(includeRow); this.includeInput.mount(); this.addIncludeButton.mount();
        this.content.append(text("Ignore (gitignore-style)", "light", "xs"));
        this.ignoreTags = createPanelElement({ direction: "row", wrap: true, gap: "xs", align: "center" }); this.content.append(this.ignoreTags);
        this.ignoreInput = this.child(new InputView(this.includeInputProps("ignore"))); this.addIgnoreButton = this.child(new ButtonView({ name: `mneme-ignore-addbtn-${this.props.root}`, size: "sm", children: "Add", onClick: () => this.addGlob("ignore") }));
        const ignoreRow = createPanelElement({ direction: "row", gap: "xs", align: "center" }); ignoreRow.append(this.ignoreInput.root, this.addIgnoreButton.root); this.content.append(ignoreRow); this.ignoreInput.mount(); this.addIgnoreButton.mount();
        const actions = createPanelElement({ direction: "row", gap: "sm", justify: "end" }); this.resetButton = this.child(new ButtonView({})); this.applyButton = this.child(new ButtonView({})); actions.append(this.resetButton.root, this.applyButton.root); this.content.append(actions); this.resetButton.mount(); this.applyButton.mount();
        this.includeList = this.makeTagList(this.includeTags, "include"); this.ignoreList = this.makeTagList(this.ignoreTags, "ignore");
    }
    private disposeControls(): void {
        this.includeList?.dispose(); this.ignoreList?.dispose(); this.includeList = undefined; this.ignoreList = undefined; this.tagViews.clear();
        [this.includeInput, this.addIncludeButton, this.ignoreInput, this.addIgnoreButton, this.resetButton, this.applyButton, this.divider].forEach((view) => { if (view) this.releaseChild(view); });
        this.includeInput = undefined; this.ignoreInput = undefined; this.resetButton = undefined; this.applyButton = undefined; this.divider = undefined;
        this.addIncludeButton = undefined; this.addIgnoreButton = undefined;
    }
    private makeTagList(host: HTMLDivElement, kind: "include" | "ignore"): KeyedList<string, string, HTMLSpanElement> {
        const list = new KeyedList<string, string, HTMLSpanElement>(host, { keyOf: (glob) => glob, create: (glob) => this.createTag(glob, kind), update: (element, glob) => this.updateTag(element, glob, kind), remove: (element) => this.removeTag(element) });
        return list;
    }
    private createTag(glob: string, kind: "include" | "ignore"): HTMLSpanElement { const view = new TagView({ label: glob, size: "sm", onRemove: () => this.removeGlob(kind, glob) }); claimViewOwnership(view); view.mount(); this.tagViews.set(view.root, view); return view.root; }
    private updateTag(element: HTMLSpanElement, glob: string, kind: "include" | "ignore"): void { this.tagViews.get(element)?.update({ label: glob, size: "sm", onRemove: () => this.removeGlob(kind, glob) }); }
    private removeTag(element: HTMLSpanElement): void { this.tagViews.get(element)?.dispose(); this.tagViews.delete(element); }
    private addGlob(kind: "include" | "ignore"): void { const draft = (kind === "include" ? this.includeDraft : this.ignoreDraft).trim(); if (!draft) return; const current = kind === "include" ? this.include ?? this.props.config?.include ?? [] : this.ignore ?? this.props.config?.ignore ?? []; if (kind === "include") { this.include = [...current, draft]; this.includeDraft = ""; } else { this.ignore = [...current, draft]; this.ignoreDraft = ""; } this.sync(this.props); }
    private removeGlob(kind: "include" | "ignore", glob: string): void { const current = kind === "include" ? this.include ?? this.props.config?.include ?? [] : this.ignore ?? this.props.config?.ignore ?? []; if (kind === "include") this.include = current.filter((value) => value !== glob); else this.ignore = current.filter((value) => value !== glob); this.sync(this.props); }
    private readonly reset = (): void => { this.include = null; this.ignore = null; this.includeDraft = ""; this.ignoreDraft = ""; this.sync(this.props); };
    private readonly apply = async (): Promise<void> => { const cfg = this.props.config; if (!cfg) return; const include = this.include ?? cfg.include; const ignore = this.ignore ?? cfg.ignore; await this.props.model.setRootConfig(this.props.root, include, ignore); if (!this.live) return; this.include = null; this.ignore = null; this.sync(this.props); };
    private keyHandler(kind: "include" | "ignore") { return (event: KeyboardEvent): void => { if (event.key === "Enter") this.addGlob(kind); }; }
    private includeInputProps(kind: "include" | "ignore") { return { name: `mneme-${kind}-add-${this.props.root}`, size: "sm" as const, placeholder: kind === "include" ? "add include glob (e.g. **/*.md)" : "add ignore glob (e.g. drafts/**)", value: kind === "include" ? this.includeDraft : this.ignoreDraft, onChange: (v: string) => { if (kind === "include") this.includeDraft = v; else this.ignoreDraft = v; }, onKeyDown: this.keyHandler(kind), width: 260 }; }
}
