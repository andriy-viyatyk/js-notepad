import type React from "react";
import { createComponentModelDriver, type ComponentModelDriver } from "../../core/state/model";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { InputView } from "../../uikit/Input/InputView";
import { ListBoxView } from "../../uikit/ListBox/ListBoxView";
import type { IListBoxItem, ListBoxProps } from "../../uikit/ListBox/types";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createFileIconElement, createFolderIconElement, subscribeFileIconElements } from "../icons/icon-elements";
import { defaultFileListState, FileListModel, type FileListItem, type FileListProps } from "./FileList";
import "./FileList.css";

type FileListRow = FileListItem & IListBoxItem;
type FileListListProps = ListBoxProps<FileListRow>;
type FileListState = { searchText: string; searchVisible: boolean; activeIndex: number | null };

export class FileListView extends VanillaView<FileListProps> {
    private readonly driver: ComponentModelDriver<FileListState, FileListProps, FileListModel>;
    private readonly list: ListBoxView<FileListRow>;
    private readonly searchHost = document.createElement("div");
    private readonly input: InputView;
    private readonly clearButton: IconButtonView;
    private searchInput: HTMLInputElement | undefined;
    private sourceItems: FileListItem[] | undefined;
    private sourceTrailing: FileListProps["getTrailing"] | undefined;
    private sourceRows: FileListRow[] = [];
    private filteredSearch: string | undefined;
    private filteredRows: FileListRow[] = [];
    private iconCacheInvalid = false;

    public constructor(props: FileListProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "file-list";
        this.root.tabIndex = 0;
        this.driver = createComponentModelDriver(props, FileListModel, defaultFileListState);

        this.list = this.child(new ListBoxView<FileListRow>(this.listProps(props, defaultFileListState)));
        this.input = this.child(new InputView({
            name: "file-list-search-input",
            value: "",
            placeholder: "Search...",
            ref: (element) => { this.searchInput = element ?? undefined; },
            onChange: this.driver.model.setSearchText,
            onKeyDown: this.onSearchKeyDown,
            onBlur: this.onSearchBlur,
        }));
        this.clearButton = this.child(new IconButtonView({
            name: "file-list-search-clear",
            icon: "close",
            title: "Clear Search",
            size: "sm",
            onClick: this.driver.model.hideSearchAndFocus,
        }));

        this.own(() => this.driver.model.clearViewFocusHandlers());
        this.own(() => this.driver.dispose());
    }

    protected onMount(): void {
        this.searchHost.dataset.part = "search";
        this.searchHost.dataset.name = "file-list-search";
        this.searchHost.append(this.input.root);
        this.root.append(this.list.root);
        this.input.mount();
        this.clearButton.mount();
        this.list.mount();

        this.driver.model.setViewFocusHandlers(
            () => this.searchInput?.focus(),
            () => this.root.focus(),
        );
        this.props.onModel?.(this.driver.model);
        this.own(() => this.props.onModel?.(null));
        this.own(() => this.iconSubscription?.());
        this.iconSubscription = subscribeFileIconElements(() => {
            this.iconCacheInvalid = true;
            this.applyState(this.driver.model.state.get());
        });

        this.listen(this.root, "keydown", this.onRootKeyDown);
        this.applyRootProps(this.props);
        this.bind(this.driver.model.state, (state) => ({
            searchText: state.searchText,
            searchVisible: state.searchVisible,
            activeIndex: state.activeIndex,
        }), this.applyState);
    }

    private iconSubscription: (() => void) | undefined;

    protected onUpdate(props: FileListProps): void {
        this.driver.update(props);
        this.applyRootProps(props);
        this.applyState(this.driver.model.state.get());
    }

    private applyRootProps(props: FileListProps): void {
        if (props.compact) this.root.dataset.compact = "true";
        else this.root.removeAttribute("data-compact");
    }

    private readonly applyState = (state: FileListState): void => {
        if (state.searchVisible) {
            if (!this.searchHost.isConnected) this.root.insertBefore(this.searchHost, this.list.root);
        } else {
            this.searchHost.remove();
        }
        this.input.update({
            name: "file-list-search-input",
            value: state.searchText,
            placeholder: "Search...",
            ref: (element) => { this.searchInput = element ?? undefined; },
            onChange: this.driver.model.setSearchText,
            onKeyDown: this.onSearchKeyDown,
            onBlur: this.onSearchBlur,
            endSlot: state.searchText ? this.clearButton.root : undefined,
        });
        this.list.update(this.listProps(this.props, state));
    };

    private listProps(props: FileListProps, state: FileListState): FileListListProps {
        return {
            name: "file-list",
            items: this.rowsFor(props.items, props.getTrailing, state.searchText),
            searchText: state.searchText || undefined,
            rowHeight: props.compact ? 20 : 22,
            activeIndex: state.activeIndex,
            keyboardNav: true,
            onActiveChange: this.driver.model.setActiveIndex,
            onChange: this.onListChange,
            isSelected: this.isSelected,
            selectionStyle: props.selectedPath != null ? "accent" : undefined,
            getTooltip: this.getTooltip,
            getContextMenu: this.getContextMenu,
            onContextMenu: props.onContextMenu,
            emptyMessage: "no files",
            variant: "browse",
        };
    }

    private rowsFor(items: FileListItem[], getTrailing: FileListProps["getTrailing"], searchText: string): FileListRow[] {
        if (this.iconCacheInvalid || this.sourceItems !== items || this.sourceTrailing !== getTrailing) {
            this.sourceItems = items;
            this.sourceTrailing = getTrailing;
            this.iconCacheInvalid = false;
            this.sourceRows = items.map((item) => ({
                ...item,
                value: item.filePath,
                label: item.title,
                icon: item.icon,
                iconElement: item.icon !== undefined
                    ? undefined
                    : item.isFolder
                        ? createFolderIconElement()
                        : createFileIconElement({ path: item.filePath, width: 16, height: 16 }),
                trailing: getTrailing?.(item),
            }));
            this.filteredSearch = undefined;
        }
        if (this.filteredSearch === searchText) return this.filteredRows;
        this.filteredSearch = searchText;
        if (!searchText) return (this.filteredRows = this.sourceRows);
        const parts = searchText.toLowerCase().split(" ").filter(Boolean);
        return (this.filteredRows = this.sourceRows.filter((item) => {
            const title = item.title.toLowerCase();
            return parts.every((part) => title.includes(part));
        }));
    }

    private readonly onListChange = (item: FileListRow): void => this.props.onClick(item);
    private readonly isSelected = (item: FileListRow): boolean =>
        this.props.selectedPath != null && item.filePath === this.props.selectedPath;
    private readonly getTooltip = (item: FileListRow): string => item.filePath;
    private readonly getContextMenu = (item: FileListRow) => this.props.getContextMenu?.(item);

    private readonly onRootKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Escape" || !this.driver.model.state.get().searchVisible) return;
        event.preventDefault();
        event.stopPropagation();
        this.driver.model.hideSearchAndFocus();
    };

    private readonly onSearchKeyDown = (event: React.KeyboardEvent): void => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        this.driver.model.hideSearchAndFocus();
    };

    private readonly onSearchBlur = (): void => {
        if (!this.driver.model.state.get().searchText) this.driver.model.hideSearch();
    };
}
