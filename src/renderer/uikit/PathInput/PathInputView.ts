import { createComponentModelDriver } from "../../core/state/model";
import { InputView } from "../Input/InputView";
import type { InputProps } from "../Input/InputView";
import { PopoverView, type PopoverViewProps } from "../Popover/PopoverView";
import { KeyedList } from "../shared/keyed-list";
import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    RestPropsState,
} from "../shared/dom-props";
import { VanillaView } from "../shared/vanilla-view";
import {
    defaultPathInputState,
    PathInputModel,
    PathInputProps,
} from "./PathInputModel";
import type { PathSuggestion } from "./suggestions";
import "./PathInput.css";

export type PathInputViewProps = PathInputProps;

interface RowMeta {
    item: PathSuggestion;
    index: number;
}

interface PathSuggestionContentProps {
    model: PathInputModel;
    suggestions: PathSuggestion[];
    separator?: string;
    activeIndex: number | null;
}

class PathSuggestionContentView extends VanillaView<PathSuggestionContentProps> {
    private suggestionHost: HTMLDivElement | null = null;
    private suggestionList: KeyedList<PathSuggestion, string, HTMLDivElement> | null = null;
    private readonly rowMeta = new WeakMap<HTMLDivElement, RowMeta>();
    private readonly rowElements = new Set<HTMLDivElement>();

    public constructor(props: PathSuggestionContentProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.root.dataset.type = "path-input";
        this.root.dataset.part = "suggestion-host";
        this.suggestionHost = this.root as HTMLDivElement;
        this.suggestionList = new KeyedList(this.suggestionHost, {
            keyOf: (item) => item.path,
            create: (item, index) => this.createRow(item, index),
            update: (element, item, index) => this.updateRow(element, item, index),
            remove: (element) => this.removeRow(element),
        });
        this.suggestionList.update(this.props.suggestions);
        this.updateActiveRows(this.props.activeIndex);
        this.own(() => this.disposeSuggestionList());
    }

    protected onUpdate(props: PathSuggestionContentProps): void {
        this.suggestionList?.update(props.suggestions);
        this.updateActiveRows(props.activeIndex);
    }

    private createRow(item: PathSuggestion, index: number): HTMLDivElement {
        const row = document.createElement("div");
        const prefix = document.createElement("span");
        const segment = document.createElement("span");
        const separator = document.createElement("span");
        prefix.dataset.part = "prefix";
        segment.dataset.part = "segment";
        separator.dataset.part = "separator";
        row.append(prefix, segment, separator);
        row.setAttribute("role", "option");
        row.dataset.part = "suggestion-row";
        this.rowElements.add(row);
        this.rowMeta.set(row, { item, index });
        this.listen(row, "mousedown", this.onRowMouseDown);
        this.listen(row, "click", this.onRowClick);
        this.listen(row, "mouseenter", this.onRowMouseEnter);
        return row;
    }

    private updateRow(row: HTMLDivElement, item: PathSuggestion, index: number): void {
        this.rowMeta.set(row, { item, index });
        const [prefix, segment, separator] = Array.from(row.children) as HTMLSpanElement[];
        prefix.textContent = item.matchPrefix;
        segment.textContent = item.label;
        separator.textContent = item.isFolder ? (this.props.separator ?? "/") : "";
        if (this.props.activeIndex === index) row.dataset.active = "";
        else delete row.dataset.active;
    }

    private removeRow(row: HTMLDivElement): void {
        row.removeEventListener("mousedown", this.onRowMouseDown);
        row.removeEventListener("click", this.onRowClick);
        row.removeEventListener("mouseenter", this.onRowMouseEnter);
        this.rowMeta.delete(row);
        this.rowElements.delete(row);
        this.props.model.setRowRef(this.rowPath(row), null);
    }

    private readonly onRowMouseDown = (event: MouseEvent): void => {
        this.props.model.onRowMouseDown(event);
    };

    private readonly onRowClick = (event: MouseEvent): void => {
        const row = event.currentTarget as HTMLDivElement;
        const meta = this.rowMeta.get(row);
        if (meta) this.props.model.onRowClick(meta.item);
    };

    private readonly onRowMouseEnter = (event: MouseEvent): void => {
        const row = event.currentTarget as HTMLDivElement;
        const meta = this.rowMeta.get(row);
        if (meta) this.props.model.onRowMouseEnter(meta.index);
    };

    private updateActiveRows(activeIndex: number | null): void {
        for (const row of this.rowElements) {
            const meta = this.rowMeta.get(row);
            if (!meta) continue;
            if (activeIndex === meta.index) row.dataset.active = "";
            else delete row.dataset.active;
        }

        if (activeIndex == null) return;
        const suggestion = this.props.suggestions[activeIndex];
        const row = suggestion && this.props.model.getRowRef(suggestion.path);
        row?.scrollIntoView({ block: "nearest" });
    }

    private rowPath(row: HTMLDivElement): string {
        return this.rowMeta.get(row)?.item.path ?? "";
    }

    private disposeSuggestionList(): void {
        this.suggestionList?.dispose();
        this.suggestionList = null;
        this.suggestionHost = null;
        for (const row of this.rowElements) {
            this.props.model.setRowRef(this.rowPath(row), null);
        }
        this.rowElements.clear();
    }
}

export class PathInputView extends VanillaView<PathInputViewProps> {
    private readonly driver;
    private readonly popoverView: PopoverView;
    private readonly inputView: InputView;
    private suggestionContentView: PathSuggestionContentView | undefined;
    private readonly restPropsState: RestPropsState = createRestPropsState();

    public constructor(props: PathInputViewProps) {
        super(props);
        this.driver = createComponentModelDriver(
            this.modelProps(props),
            PathInputModel,
            defaultPathInputState,
        );
        this.own(() => this.driver.dispose());
        this.inputView = this.child(new InputView(this.inputProps(props)));
        this.popoverView = this.child(new PopoverView(this.popoverProps(props)));
    }

    protected onMount(): void {
        this.applyConstructionRestProps(this.props);
        this.applyRootProps(this.props);
        this.driver.mount();

        this.root.append(this.inputView.root);
        this.inputView.mount();
        this.driver.model.setInputRef(this.inputView.inputElement);
        this.root.append(this.popoverView.root);
        this.popoverView.mount();

        this.bind(
            this.driver.model.state,
            (state) => ({ open: state.open, activeIndex: state.activeIndex }),
            () => this.syncChildren(),
        );
    }

    protected onUpdate(props: PathInputViewProps): void {
        this.driver.update(this.modelProps(props));
        this.applyRootProps(props);
        this.syncChildren();
    }

    protected onDispose(): void {
        clearRestListeners(this.root, this.restPropsState);
    }

    public get inputElement(): HTMLInputElement {
        return this.inputView.inputElement;
    }

    private modelProps(props: PathInputViewProps): PathInputProps {
        return props;
    }

    private inputProps(props: PathInputViewProps): InputProps {
        const { value, placeholder, autoFocus, disabled, readOnly, size = "md" } = props;
        const showSuggestions = this.driver.model.state.get().open
            && this.driver.model.suggestions.length > 0;
        return {
            size,
            value,
            onChange: this.driver.model.onInputChange,
            placeholder,
            disabled,
            readOnly,
            autoFocus,
            onFocus: this.driver.model.onInputFocus,
            onBlur: this.driver.model.onInputBlur,
            onKeyDown: this.driver.model.onInputKeyDown,
            autoComplete: "off",
            "aria-label": props["aria-label"],
            "aria-labelledby": props["aria-labelledby"],
            "aria-haspopup": "listbox",
            "aria-expanded": showSuggestions,
        };
    }

    private syncChildren(): void {
        const open = this.driver.model.state.get().open;
        const shouldOpen = open && this.driver.model.suggestions.length > 0;
        this.root.dataset.state = open ? "open" : "closed";
        this.inputView.update(this.inputProps(this.props));
        this.popoverView.update(this.popoverProps(this.props));

        if (shouldOpen) this.suggestionContentView?.update(this.suggestionProps(this.props));
        else this.suggestionContentView = undefined;
    }

    private suggestionProps(props: PathInputViewProps): PathSuggestionContentProps {
        return {
            model: this.driver.model,
            suggestions: this.driver.model.suggestions,
            separator: props.separator,
            activeIndex: this.driver.model.state.get().activeIndex,
        };
    }

    private popoverProps(props: PathInputViewProps): PopoverViewProps {
        const { name } = props;
        const state = this.driver.model.state.get();
        return {
            name,
            open: state.open && this.driver.model.suggestions.length > 0,
            onClose: this.driver.model.onPopoverClose,
            elementRef: this.driver.model.inputRef,
            placement: "bottom-start",
            offset: [0, 2],
            matchAnchorWidth: true,
            maxHeight: 240,
            outsideClickIgnoreSelector: '[data-type="path-input"]',
            role: "listbox",
            contentView: (host) => {
                const content = new PathSuggestionContentView(this.suggestionProps(props));
                host.append(content.root);
                this.suggestionContentView = content;
                return content;
            },
        };
    }

    private applyRootProps(props: PathInputViewProps): void {
        const {
            name,
            value: _value,
            onChange: _onChange,
            paths: _paths,
            separator: _separator,
            placeholder: _placeholder,
            onBlur: _onBlur,
            autoFocus: _autoFocus,
            maxDepth: _maxDepth,
            disabled,
            readOnly,
            size: _size,
            children: _children,
            "aria-label": _ariaLabel,
            "aria-labelledby": _ariaLabelledBy,
            ..._attributes
        } = props;

        // Forward residual props first; the component-owned attributes below
        // are authoritative even if a caller passes conflicting data-* props.
        this.root.dataset.type = "path-input";
        if (name !== undefined) this.root.dataset.name = name;
        else delete this.root.dataset.name;
        if (disabled) this.root.dataset.disabled = "";
        else delete this.root.dataset.disabled;
        if (readOnly) this.root.dataset.readonly = "";
        else delete this.root.dataset.readonly;
    }

    private applyConstructionRestProps(props: PathInputViewProps): void {
        const {
            name: _name,
            value: _value,
            onChange: _onChange,
            paths: _paths,
            separator: _separator,
            placeholder: _placeholder,
            onBlur: _onBlur,
            autoFocus: _autoFocus,
            maxDepth: _maxDepth,
            disabled: _disabled,
            readOnly: _readOnly,
            size: _size,
            children: _children,
            "aria-label": _ariaLabel,
            "aria-labelledby": _ariaLabelledBy,
            ...attributes
        } = props;
        applyRestProps(this.root, attributes, this.restPropsState);
    }

}
