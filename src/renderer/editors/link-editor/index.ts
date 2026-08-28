import { TComponentState } from "../../core/state/state";
import type { BreadcrumbProps } from "../../uikit/Breadcrumb";
import { BreadcrumbView } from "../../uikit/Breadcrumb/BreadcrumbView";
import { ButtonView, type ButtonViewProps } from "../../uikit/Button/ButtonView";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { InputView } from "../../uikit/Input/InputView";
import type { InputProps } from "../../uikit/Input/InputView";
import { openMenu, type MenuHandle, type MenuItem } from "../../uikit/Menu";
import type { IconName } from "../../theme/icon-registry";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { TextChromeView } from "../base/TextChromeView";
import { LinkEditor, defaultLinkEditorState, type LinkEditorState } from "./LinkEditor";
import { LinkBodyView } from "./LinkBody";
import type { LinkViewMode } from "./linkTypes";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

const VIEW_MODE_LABELS: Record<LinkViewMode, string> = {
    "list": "List",
    "tiles-landscape": "Landscape",
    "tiles-landscape-big": "Landscape (Large)",
    "tiles-portrait": "Portrait",
    "tiles-portrait-big": "Portrait (Large)",
};

const VIEW_MODE_ICONS: Record<LinkViewMode, IconName> = {
    "list": "view-list",
    "tiles-landscape": "view-landscape",
    "tiles-landscape-big": "view-landscape-big",
    "tiles-portrait": "view-portrait",
    "tiles-portrait-big": "view-portrait-big",
};

const VIEW_MODE_ORDER: LinkViewMode[] = [
    "list",
    "tiles-landscape",
    "tiles-landscape-big",
    "tiles-portrait",
    "tiles-portrait-big",
];

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

function requireLinkModel(model: EditorModel): LinkEditor {
    if (!(model instanceof LinkEditor)) throw new Error("Link view received an invalid model.");
    return model;
}

interface LinkBreadcrumbProjection {
    expandedPanel: LinkEditorState["expandedPanel"];
    selectedCategory: string;
    selectedTag: string;
    selectedHostname: string;
}

function selectLinkBreadcrumb(state: LinkEditorState): LinkBreadcrumbProjection {
    return {
        expandedPanel: state.expandedPanel,
        selectedCategory: state.selectedCategory,
        selectedTag: state.selectedTag,
        selectedHostname: state.selectedHostname,
    };
}

export class LinkBreadcrumbView extends VanillaView<{ model: LinkEditor }> {
    private model: LinkEditor;
    private breadcrumb: BreadcrumbView | undefined;
    private stateSubscription: (() => void) | undefined;

    public constructor(props: { model: LinkEditor }) {
        super(props, createContentsRoot());
        this.model = props.model;
    }

    protected onMount(): void {
        this.breadcrumb = this.child(new BreadcrumbView(this.breadcrumbProps(
            selectLinkBreadcrumb(this.model.state.get()),
        )));
        this.root.append(this.breadcrumb.root);
        this.breadcrumb.mount();
        this.bindState();
        this.own(() => {
            this.stateSubscription?.();
            this.stateSubscription = undefined;
        });
    }

    protected onUpdate(props: { model: LinkEditor }): void {
        if (props.model !== this.model) {
            this.model = props.model;
            this.bindState();
        }
        this.sync(selectLinkBreadcrumb(this.model.state.get()));
    }

    protected onDispose(): void {
        this.breadcrumb = undefined;
    }

    private bindState(): void {
        this.stateSubscription?.();
        this.stateSubscription = this.model.state.subscribe<LinkBreadcrumbProjection>(
            (projection) => this.sync(projection),
            selectLinkBreadcrumb,
        );
    }

    private sync(projection: LinkBreadcrumbProjection): void {
        this.breadcrumb?.update(this.breadcrumbProps(projection));
    }

    private breadcrumbProps(projection: LinkBreadcrumbProjection): BreadcrumbProps {
        if (projection.expandedPanel === "tags") {
            return {
                name: "link-editor-breadcrumb-tags",
                rootLabel: "Tags",
                value: projection.selectedTag,
                onChange: this.model.setSelectedTag,
                separators: ":",
                trailingParentSeparator: true,
            };
        }
        if (projection.expandedPanel === "hostnames") {
            return {
                name: "link-editor-breadcrumb-hostnames",
                rootLabel: "Hostnames",
                value: projection.selectedHostname,
                onChange: this.model.setSelectedHostname,
            };
        }
        return {
            name: "link-editor-breadcrumb-categories",
            rootLabel: "Collections",
            value: projection.selectedCategory,
            onChange: this.model.setSelectedCategory,
        };
    }
}

interface LinkActionProjection {
    searchText: string;
    viewMode: LinkViewMode;
}

function selectLinkActions(editor: LinkEditor) {
    return (state: LinkEditorState): LinkActionProjection => ({
        searchText: state.searchText,
        viewMode: editor.getViewMode(state),
    });
}

export class LinkActionView extends VanillaView<{ model: LinkEditor }> {
    private model: LinkEditor;
    private addButton: ButtonView | undefined;
    private viewModeButton: ButtonView | undefined;
    private searchInput: InputView | undefined;
    private clearButton: IconButtonView | undefined;
    private stateSubscription: (() => void) | undefined;
    private menu: MenuHandle | undefined;
    private previousFocus: Element | null = null;

    public constructor(props: { model: LinkEditor }) {
        super(props, createContentsRoot());
        this.model = props.model;
    }

    protected onMount(): void {
        const projection = selectLinkActions(this.model)(this.model.state.get());
        this.addButton = this.child(new ButtonView(this.addButtonProps()));
        this.viewModeButton = this.child(new ButtonView(this.viewModeButtonProps(projection.viewMode)));
        this.syncClearButton(projection.searchText);
        this.searchInput = this.child(new InputView(this.searchInputProps(projection.searchText)));
        this.root.append(this.addButton.root, this.viewModeButton.root, this.searchInput.root);
        this.addButton.mount();
        this.viewModeButton.mount();
        this.searchInput.mount();
        this.bindState();
        this.sync(projection);
        this.own(() => {
            this.stateSubscription?.();
            this.stateSubscription = undefined;
        });
        this.own(() => {
            this.menu?.dispose();
            this.menu = undefined;
        });
    }

    protected onUpdate(props: { model: LinkEditor }): void {
        if (props.model !== this.model) {
            this.closeMenu();
            this.model = props.model;
            this.bindState();
        }
        this.sync(selectLinkActions(this.model)(this.model.state.get()));
    }

    protected onDispose(): void {
        this.addButton = undefined;
        this.viewModeButton = undefined;
        this.searchInput = undefined;
        this.clearButton = undefined;
    }

    private bindState(): void {
        this.stateSubscription?.();
        const selector = selectLinkActions(this.model);
        this.stateSubscription = this.model.state.subscribe<LinkActionProjection>(
            (projection) => this.sync(projection),
            selector,
        );
    }

    private sync(projection: LinkActionProjection): void {
        this.addButton?.update(this.addButtonProps());
        this.viewModeButton?.update(this.viewModeButtonProps(projection.viewMode));
        this.syncClearButton(projection.searchText);
        this.searchInput?.update(this.searchInputProps(projection.searchText));
        this.menu?.update({
            items: this.viewModeMenuItems(projection.viewMode),
            placement: "bottom-start",
            offset: [-4, 4],
            onClose: this.handleMenuClose,
        });
    }

    private syncClearButton(searchText: string): void {
        if (searchText && !this.clearButton) {
            this.clearButton = this.child(new IconButtonView(this.clearButtonProps()));
            this.clearButton.mount();
        } else if (!searchText && this.clearButton) {
            this.releaseChild(this.clearButton);
            this.clearButton = undefined;
        }
    }

    private addButtonProps(): ButtonViewProps {
        return {
            name: "link-editor-add",
            size: "sm",
            variant: "link",
            title: "Add Link",
            icon: "plus",
            onClick: () => { void this.model.showLinkDialog(); },
            children: "Add Link",
        };
    }

    private viewModeButtonProps(viewMode: LinkViewMode): ButtonViewProps {
        return {
            name: "link-editor-view-mode",
            size: "sm",
            variant: "ghost",
            title: "View Mode",
            icon: VIEW_MODE_ICONS[viewMode],
            onClick: (event) => this.openViewModeMenu(event.nativeEvent),
            children: VIEW_MODE_LABELS[viewMode],
        };
    }

    private searchInputProps(searchText: string): InputProps {
        return {
            name: "link-editor-search",
            tone: "accent",
            width: 180,
            value: searchText,
            onChange: this.model.setSearchText,
            placeholder: "Search...",
            endSlot: this.clearButton?.root,
        };
    }

    private clearButtonProps(): IconButtonViewProps {
        return {
            name: "link-editor-search-clear",
            size: "sm",
            title: "Clear search",
            icon: "close",
            onClick: this.model.clearSearch,
        };
    }

    private viewModeMenuItems(viewMode: LinkViewMode): MenuItem[] {
        return VIEW_MODE_ORDER.map((mode) => ({
            label: VIEW_MODE_LABELS[mode],
            icon: VIEW_MODE_ICONS[mode],
            selected: mode === viewMode,
            onClick: () => this.model.setViewMode(mode),
        }));
    }

    private readonly openViewModeMenu = (event: MouseEvent): void => {
        if (!(event.currentTarget instanceof Element)) return;
        this.closeMenu();
        this.previousFocus = document.activeElement;
        this.menu = openMenu(event.currentTarget, {
            items: this.viewModeMenuItems(this.model.getViewMode()),
            placement: "bottom-start",
            offset: [-4, 4],
            onClose: this.handleMenuClose,
        });
    };

    private readonly handleMenuClose = (): void => {
        this.menu = undefined;
        if (this.previousFocus instanceof HTMLElement) this.previousFocus.focus();
        this.previousFocus = null;
    };

    private closeMenu(): void {
        this.menu?.dispose();
        this.menu = undefined;
        this.previousFocus = null;
    }
}

interface LinkFooterProjection {
    filteredCount: number;
    totalCount: number;
}

function selectLinkFooter(state: LinkEditorState): LinkFooterProjection {
    return {
        filteredCount: state.filteredLinks.length,
        totalCount: state.data.links.length,
    };
}

export class LinkFooterView extends VanillaView<{ model: LinkEditor }> {
    private model: LinkEditor;
    private stateSubscription: (() => void) | undefined;

    public constructor(props: { model: LinkEditor }) {
        super(props, document.createElement("span"));
        this.model = props.model;
    }

    protected onMount(): void {
        this.bindState();
        this.sync(selectLinkFooter(this.model.state.get()));
        this.own(() => {
            this.stateSubscription?.();
            this.stateSubscription = undefined;
        });
    }

    protected onUpdate(props: { model: LinkEditor }): void {
        if (props.model !== this.model) {
            this.model = props.model;
            this.bindState();
        }
        this.sync(selectLinkFooter(this.model.state.get()));
    }

    private bindState(): void {
        this.stateSubscription?.();
        this.stateSubscription = this.model.state.subscribe<LinkFooterProjection>(
            (projection) => this.sync(projection),
            selectLinkFooter,
        );
    }

    private sync(projection: LinkFooterProjection): void {
        this.root.textContent = projection.filteredCount === projection.totalCount
            ? `${projection.totalCount} links`
            : `${projection.filteredCount} of ${projection.totalCount} links`;
    }
}

export class LinkEditorView extends VanillaView<{ model: EditorModel }> {
    private model: LinkEditor | undefined;
    private breadcrumb: LinkBreadcrumbView | undefined;
    private actions: LinkActionView | undefined;
    private footer: LinkFooterView | undefined;
    private body: LinkBodyView | undefined;
    private chrome: TextChromeView | undefined;

    public constructor(props: { model: EditorModel }) {
        super(props, createContentsRoot());
    }

    protected onMount(): void {
        const model = requireLinkModel(this.props.model);
        const breadcrumb = this.child(new LinkBreadcrumbView({ model }));
        const actions = this.child(new LinkActionView({ model }));
        const footer = this.child(new LinkFooterView({ model }));
        const body = this.child(new LinkBodyView({ model }));
        const chrome = this.child(new TextChromeView({
            model: this.props.model,
            toolbarContributions: breadcrumb.root,
            rightToolbarContributions: actions.root,
            footerContributions: footer.root,
            children: body.root,
        }));

        this.model = model;
        this.breadcrumb = breadcrumb;
        this.actions = actions;
        this.footer = footer;
        this.body = body;
        this.chrome = chrome;
        this.root.append(breadcrumb.root, actions.root, footer.root, chrome.root);
        breadcrumb.mount();
        actions.mount();
        footer.mount();
        body.mount();
        chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireLinkModel(props.model);
        this.model = model;
        this.breadcrumb?.update({ model });
        this.actions?.update({ model });
        this.footer?.update({ model });
        this.body?.update({ model });
        this.chrome?.update({
            model: props.model,
            toolbarContributions: this.breadcrumb?.root,
            rightToolbarContributions: this.actions?.root,
            footerContributions: this.footer?.root,
            children: this.body?.root,
        });
    }

    protected onDispose(): void {
        this.model = undefined;
        this.breadcrumb = undefined;
        this.actions = undefined;
        this.footer = undefined;
        this.body = undefined;
        this.chrome = undefined;
    }
}

export const linkModule: EditorModule = {
    createEditor: () =>
        new LinkEditor(new TComponentState({ ...defaultLinkEditorState })),
    View: LinkEditorView,
};

export { LinkEditor, defaultLinkEditorState };
export type { LinkEditorState, LinkQueueEvent, ExpandedPanel } from "./LinkEditor";
