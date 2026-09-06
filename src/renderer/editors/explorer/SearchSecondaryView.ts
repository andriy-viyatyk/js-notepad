import { guard } from "../../core/utils/guard";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { FileSearchView } from "../../components/file-search/FileSearchView";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../ui/secondary-views/SideBarPanelHeaderView";
import { fpBasename } from "../../core/utils/file-path";
import type { ExplorerEditor } from "./ExplorerEditorModel";

function createFileSearchView(model: ExplorerEditor): FileSearchView {
    return new FileSearchView({
        folder: model.rootPath,
        state: model.searchState,
        onStateChange: model.setSearchState,
        onResultClick: (filePath, lineNumber) => { void model.openSearchResult(filePath, lineNumber); },
    });
}

function searchTitle(model: ExplorerEditor): { text: string; path: string } {
    const searchFolder = model.searchState?.searchFolder || model.rootPath;
    return {
        text: `Search [${fpBasename(searchFolder)}]`,
        path: searchFolder,
    };
}

export default class SearchSecondaryView extends VanillaView<SecondaryViewProps> {
    private model: ExplorerEditor;
    private searchRootPath: string;
    private fileSearch: FileSearchView;
    private readonly closeButton: IconButtonView;
    private readonly header: SideBarPanelHeaderHandle;

    public constructor(props: SecondaryViewProps) {
        const model = props.model as ExplorerEditor;
        const fileSearch = createFileSearchView(model);
        super(
            props,
            createPanelElement(
                {
                    name: "search-secondary-view",
                    direction: "column",
                    flex: true,
                    minHeight: 0,
                    overflow: "hidden",
                },
                [fileSearch.root],
            ),
        );

        this.model = model;
        this.searchRootPath = model.rootPath;
        this.fileSearch = fileSearch;
        this.closeButton = this.createCloseButton();
        const title = searchTitle(model);
        this.header = createSideBarPanelHeader({
            headerHost: props.headerHost,
            icon: props.iconElement,
            title: title.text,
            titleAttribute: title.path,
            actions: this.closeButton.root,
        });
    }

    protected onMount(): void {
        this.closeButton.mount();
        this.fileSearch.mount();
        this.updateHeader(this.props);
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const model = props.model as ExplorerEditor;
        const bodyChanged = this.model !== model || this.searchRootPath !== model.rootPath;
        this.model = model;

        if (bodyChanged) {
            this.replaceFileSearch(model);
            this.searchRootPath = model.rootPath;
        }
        this.updateHeader(props);
    }

    protected onDispose(): void {
        try {
            this.fileSearch.dispose();
        } finally {
            this.fileSearch.root.remove();
            try {
                this.closeButton.dispose();
            } finally {
                this.closeButton.root.remove();
                this.header.dispose();
            }
        }
    }

    private createCloseButton(): IconButtonView {
        return new IconButtonView({
            name: "search-secondary-close",
            size: "sm",
            title: "Close Search",
            icon: "close",
            onClick: (event) => {
                event.stopPropagation();
                this.model.closeSearch();
            },
        });
    }

    private updateHeader(props: SecondaryViewProps): void {
        const title = searchTitle(this.model);
        this.header.update({
            headerHost: props.headerHost,
            icon: props.iconElement,
            title: title.text,
            titleAttribute: title.path,
            actions: this.closeButton.root,
        });
    }

    private replaceFileSearch(model: ExplorerEditor): void {
        const next = createFileSearchView(model);
        this.root.append(next.root);
        try {
            next.mount();
        } catch (error) {
            try {
                next.dispose();
            } finally {
                next.root.remove();
            }
            throw error;
        }

        const previous = this.fileSearch;
        this.fileSearch = next;
        void guard("Failed to dispose file search", () => {
            try {
                previous.dispose();
            } finally {
                previous.root.remove();
            }
        });
    }
}
