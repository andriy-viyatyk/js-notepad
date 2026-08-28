import { TComponentState } from "../../core/state/state";
import { NotebookEditor, defaultNotebookEditorState, type NotebookEditorState } from "./NotebookEditor";
import { NotebookBodyView } from "./NotebookBodyView";
import { TextChromeView } from "../base/TextChromeView";
import { BreadcrumbView } from "../../uikit/Breadcrumb/BreadcrumbView";
import type { BreadcrumbProps } from "../../uikit/Breadcrumb/Breadcrumb";
import { ButtonView, type ButtonViewProps } from "../../uikit/Button/ButtonView";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { InputView } from "../../uikit/Input/InputView";
import type { InputProps } from "../../uikit/Input/InputView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";
import "../../uikit/Button/Button.css";

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

function requireNotebookModel(model: EditorModel): NotebookEditor {
    if (!(model instanceof NotebookEditor)) throw new Error("Notebook view received an invalid model.");
    return model;
}

interface NotebookBreadcrumbProjection {
    expandedPanel: NotebookEditorState["expandedPanel"];
    selectedCategory: string;
    selectedTag: string;
}

function selectNotebookBreadcrumb(state: NotebookEditorState): NotebookBreadcrumbProjection {
    return {
        expandedPanel: state.expandedPanel,
        selectedCategory: state.selectedCategory,
        selectedTag: state.selectedTag,
    };
}

class NotebookBreadcrumbView extends VanillaView<{ model: NotebookEditor }> {
    private model: NotebookEditor;
    private breadcrumb: BreadcrumbView | undefined;
    private stateSubscription: (() => void) | undefined;

    public constructor(props: { model: NotebookEditor }) {
        super(props, createContentsRoot());
        this.model = props.model;
    }

    protected onMount(): void {
        this.breadcrumb = this.child(new BreadcrumbView(this.breadcrumbProps(selectNotebookBreadcrumb(this.model.state.get()))));
        this.root.append(this.breadcrumb.root);
        this.breadcrumb.mount();
        this.bindState();
        this.own(() => {
            this.stateSubscription?.();
            this.stateSubscription = undefined;
        });
    }

    protected onUpdate(props: { model: NotebookEditor }): void {
        if (props.model !== this.model) {
            this.model = props.model;
            this.bindState();
        }
        this.sync(selectNotebookBreadcrumb(this.model.state.get()));
    }

    protected onDispose(): void {
        this.breadcrumb = undefined;
    }

    private bindState(): void {
        this.stateSubscription?.();
        this.stateSubscription = this.model.state.subscribe(
            (projection: NotebookBreadcrumbProjection) => this.sync(projection),
            selectNotebookBreadcrumb,
        );
    }

    private sync(projection: NotebookBreadcrumbProjection): void {
        this.breadcrumb?.update(this.breadcrumbProps(projection));
    }

    private breadcrumbProps(projection: NotebookBreadcrumbProjection): BreadcrumbProps {
        if (projection.expandedPanel === "tags") {
            return {
                name: "notebook-breadcrumb",
                rootLabel: "Tags",
                value: projection.selectedTag,
                onChange: this.model.setSelectedTag,
                separators: ":",
                trailingParentSeparator: true,
                size: "sm",
            };
        }
        return {
            name: "notebook-breadcrumb",
            rootLabel: "Categories",
            value: projection.selectedCategory,
            onChange: this.model.setSelectedCategory,
            size: "sm",
        };
    }
}

class NotebookToolbarBitsView extends VanillaView<{ model: NotebookEditor }> {
    private model: NotebookEditor;
    private addButton: ButtonView | undefined;
    private searchInput: InputView | undefined;
    private searchClear: IconButtonView | undefined;
    private stateSubscription: (() => void) | undefined;

    public constructor(props: { model: NotebookEditor }) {
        super(props, createContentsRoot());
        this.model = props.model;
    }

    protected onMount(): void {
        this.addButton = this.child(new ButtonView(this.addButtonProps()));
        this.searchInput = this.child(new InputView(this.searchInputProps(this.model.state.get().searchText)));
        this.root.append(this.addButton.root, this.searchInput.root);
        this.addButton.mount();
        this.searchInput.mount();
        this.bindState();
        this.sync(this.model.state.get().searchText);
        this.own(() => {
            this.stateSubscription?.();
            this.stateSubscription = undefined;
        });
    }

    protected onUpdate(props: { model: NotebookEditor }): void {
        if (props.model !== this.model) {
            this.model = props.model;
            this.bindState();
        }
        this.sync(this.model.state.get().searchText);
    }

    protected onDispose(): void {
        this.addButton = undefined;
        this.searchInput = undefined;
        this.searchClear = undefined;
    }

    private bindState(): void {
        this.stateSubscription?.();
        this.stateSubscription = this.model.state.subscribe<string>(
            (searchText) => this.sync(searchText),
            (state) => state.searchText,
        );
    }

    private sync(searchText: string): void {
        if (searchText && !this.searchClear) {
            this.searchClear = this.child(new IconButtonView(this.searchClearProps()));
            this.root.append(this.searchClear.root);
            this.searchClear.mount();
        } else if (!searchText && this.searchClear) {
            this.releaseChild(this.searchClear);
            this.searchClear = undefined;
        }

        this.searchInput?.update(this.searchInputProps(searchText));
    }

    private addButtonProps(): ButtonViewProps {
        return {
            name: "notebook-add-note",
            variant: "primary",
            size: "sm",
            icon: "plus",
            title: "Add Note",
            onClick: this.model.addNote,
            children: "Add Note",
        };
    }

    private searchInputProps(searchText: string): InputProps {
        return {
            name: "notebook-search",
            size: "sm",
            width: 200,
            value: searchText,
            onChange: this.model.setSearchText,
            placeholder: "Search...",
            endSlot: this.searchClear?.root,
        };
    }

    private searchClearProps(): IconButtonViewProps {
        return {
            name: "notebook-search-clear",
            size: "sm",
            icon: "close",
            title: "Clear search",
            onClick: this.model.clearSearch,
        };
    }
}

interface NotebookFooterProjection {
    filteredCount: number;
    totalCount: number;
}

function selectNotebookFooter(state: NotebookEditorState): NotebookFooterProjection {
    return {
        filteredCount: state.filteredNotes.length,
        totalCount: state.data.notes.length,
    };
}

function notebookFooterText(projection: NotebookFooterProjection): string {
    return projection.filteredCount === projection.totalCount
        ? `${projection.totalCount} notes`
        : `${projection.filteredCount} of ${projection.totalCount} notes`;
}

export class NotebookEditorView extends VanillaView<{ model: EditorModel }> {
    private model: NotebookEditor | undefined;
    private body: NotebookBodyView | undefined;
    private breadcrumb: NotebookBreadcrumbView | undefined;
    private toolbar: NotebookToolbarBitsView | undefined;
    private chrome: TextChromeView | undefined;
    private footer: HTMLSpanElement | undefined;

    public constructor(props: { model: EditorModel }) {
        super(props, createContentsRoot());
    }

    protected onMount(): void {
        const model = requireNotebookModel(this.props.model);
        this.model = model;
        const body = this.child(new NotebookBodyView({ model }));
        const breadcrumb = this.child(new NotebookBreadcrumbView({ model }));
        const toolbar = this.child(new NotebookToolbarBitsView({ model }));
        const footer = document.createElement("span");
        const chrome = this.child(new TextChromeView({
            model: this.props.model,
            children: body.root,
            toolbarContributions: breadcrumb.root,
            rightToolbarContributions: toolbar.root,
            footerContributions: footer,
        }));

        this.body = body;
        this.breadcrumb = breadcrumb;
        this.toolbar = toolbar;
        this.chrome = chrome;
        this.footer = footer;
        this.root.append(body.root, breadcrumb.root, toolbar.root, footer, chrome.root);
        body.mount();
        breadcrumb.mount();
        toolbar.mount();
        chrome.mount();
        this.bind(this.model.state, selectNotebookFooter, (projection) => {
            this.updateFooter(projection);
        });
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireNotebookModel(props.model);
        this.model = model;
        this.body?.update({ model });
        this.breadcrumb?.update({ model });
        this.toolbar?.update({ model });
        const body = this.body;
        const breadcrumb = this.breadcrumb;
        const toolbar = this.toolbar;
        const chrome = this.chrome;
        if (!body || !breadcrumb || !toolbar || !chrome) return;
        chrome.update({
            model: props.model,
            children: body.root,
            toolbarContributions: breadcrumb.root,
            rightToolbarContributions: toolbar.root,
            footerContributions: this.footer,
        });
        this.updateFooter(selectNotebookFooter(model.state.get()));
    }

    protected onDispose(): void {
        this.model = undefined;
        this.body = undefined;
        this.breadcrumb = undefined;
        this.toolbar = undefined;
        this.chrome = undefined;
        this.footer = undefined;
    }

    private updateFooter(projection: NotebookFooterProjection): void {
        if (this.footer) this.footer.textContent = notebookFooterText(projection);
    }
}

export const notebookModule: EditorModule = {
    createEditor: () =>
        new NotebookEditor(new TComponentState({ ...defaultNotebookEditorState })),
    View: NotebookEditorView,
};

// Barrel re-exports for consumers that import from "./notebook".
export { NotebookEditor, defaultNotebookEditorState };
export type { NotebookEditorState, NotebookQueueEvent } from "./NotebookEditor";
export type {
    NoteContent,
    NoteItem,
    NoteItemState,
    NotebookData,
    NotebookEditorProps,
    NotebookSource,
} from "./notebookTypes";
