import React from "react";
import { TComponentState } from "../../core/state/state";
import { createComponentModelDriver } from "../../core/state/model";
import { Input } from "../Input";
import { PopoverView, type PopoverViewProps } from "../Popover/PopoverView";
import { KeyedList } from "../shared/keyed-list";
import { mountReact } from "../shared/mount";
import {
    applyRestProps,
    bindRef,
    clearRestListeners,
    createRestPropsState,
    RestPropsState,
} from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import {
    defaultPathInputState,
    PathInputModel,
    PathInputProps,
} from "./PathInputModel";
import type { PathSuggestion } from "./suggestions";
import "./PathInput.css";

export type PathInputViewProps = PathInputProps & {
    ref?: React.Ref<HTMLInputElement>;
};

interface RowMeta {
    item: PathSuggestion;
    index: number;
}

interface PathInputBridgeProps {
    view: PathInputView;
    model: PathInputModel;
    propsState: TComponentState<PathInputViewProps>;
}

function PathInputBridge({ view, model, propsState }: PathInputBridgeProps) {
    const { open, activeIndex } = model.state.use((state) => ({
        open: state.open,
        activeIndex: state.activeIndex,
    }));
    const props = propsState.use((state) => state);
    const {
        value,
        placeholder,
        autoFocus,
        disabled,
        readOnly,
        size = "md",
        "aria-label": ariaLabel,
        "aria-labelledby": ariaLabelledBy,
    } = props;
    const showSuggestions = open && model.suggestions.length > 0;

    const setInputRef = React.useCallback(
        (element: HTMLInputElement | null) => view.setInputRef(element, props.ref),
        [props.ref, view],
    );
    // Read activeIndex so the bridge follows model state. The suggestion rows
    // themselves remain owned by the vanilla KeyedList.
    void activeIndex;

    return (
        <>
            <Input
                ref={setInputRef}
                size={size}
                value={value}
                onChange={model.onInputChange}
                placeholder={placeholder}
                disabled={disabled}
                readOnly={readOnly}
                autoFocus={autoFocus}
                onFocus={model.onInputFocus}
                onBlur={model.onInputBlur}
                onKeyDown={(event) => model.onInputKeyDown(event.nativeEvent)}
                autoComplete="off"
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                aria-haspopup="listbox"
                aria-expanded={showSuggestions}
            />
        </>
    );
}

export class PathInputView extends VanillaView<PathInputViewProps> {
    private readonly propsState: TComponentState<PathInputViewProps>;
    private readonly driver;
    private readonly popoverView: PopoverView;
    private readonly suggestionContent: React.ReactElement;
    private suggestionHost: HTMLDivElement | null = null;
    private suggestionList: KeyedList<PathSuggestion, string, HTMLDivElement> | null = null;
    private readonly rowMeta = new WeakMap<HTMLDivElement, RowMeta>();
    private readonly rowElements = new Set<HTMLDivElement>();
    private inputElement: HTMLInputElement | null = null;
    private externalRef: React.Ref<HTMLInputElement> | undefined;
    private externalRefCleanup: (() => void) | undefined;
    private readonly restPropsState: RestPropsState = createRestPropsState();

    public constructor(props: PathInputViewProps) {
        super(props);
        this.propsState = new TComponentState(props);
        this.driver = createComponentModelDriver(
            this.modelProps(props),
            PathInputModel,
            defaultPathInputState,
        );
        this.own(() => this.driver.dispose());

        this.suggestionContent = (
            <div
                ref={(element: HTMLDivElement | null) => this.setSuggestionHost(element)}
                data-type="path-input"
                data-part="suggestion-host"
            />
        );
        this.popoverView = this.child(new PopoverView(this.popoverProps(props)));
    }

    protected onMount(): void {
        this.applyRootProps(this.props);
        this.driver.mount();

        // The parent bridge owns the input. The PopoverView owns its own
        // floating React content bridge and keeps this logical root visible in
        // the PathInput ownership tree.
        this.mountBridge();
        this.root.append(this.popoverView.root);
        this.popoverView.mount();

        this.bind(
            this.driver.model.state,
            (state) => ({ open: state.open, activeIndex: state.activeIndex }),
            ({ open, activeIndex }) => {
                this.root.dataset.state = open ? "open" : "closed";
                this.updateActiveRows(activeIndex);
                this.popoverView.update(this.popoverProps(this.props));
            },
        );
        this.own(() => this.disposeSuggestionList());
    }

    protected onUpdate(props: PathInputViewProps): void {
        this.driver.update(this.modelProps(props));
        this.propsState.set(props);
        this.applyRootProps(props);
        this.popoverView.update(this.popoverProps(props));
        this.suggestionList?.update(this.driver.model.suggestions);
    }

    protected onDispose(): void {
        clearRestListeners(this.root, this.restPropsState);
        this.clearInputRef();
        this.disposeSuggestionList();
    }

    setInputRef(element: HTMLInputElement | null, ref: React.Ref<HTMLInputElement> | undefined): void {
        if (element === this.inputElement && ref === this.externalRef) return;

        this.clearInputRef();
        this.inputElement = element;
        this.externalRef = ref;
        this.driver.model.setInputRef(element);
        this.popoverView.update(this.popoverProps(this.props));

        if (element && this.props.autoFocus) {
            const length = element.value.length;
            element.setSelectionRange(length, length);
        }

        this.externalRefCleanup = bindRef(element, ref);
    }

    setSuggestionHost(host: HTMLDivElement | null): void {
        if (host === this.suggestionHost) return;

        this.disposeSuggestionList();
        this.suggestionHost = host;
        if (!host) return;

        this.suggestionList = new KeyedList<PathSuggestion, string, HTMLDivElement>(host, {
            keyOf: (item) => item.path,
            create: (item, index) => this.createRow(item, index),
            update: (element, item, index) => this.updateRow(element, item, index),
            remove: (element) => this.removeRow(element),
        });
        this.suggestionList.update(this.driver.model.suggestions);
    }

    private modelProps(props: PathInputViewProps): PathInputProps {
        const { ref: _ref, ...modelProps } = props;
        return modelProps;
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
            children: this.suggestionContent,
        };
    }

    private mountBridge(): void {
        // Register the parent bridge after the Popover child. VanillaView
        // disposes children in registration order, so the Popover branch is
        // detached before this parent-owned React root is unmounted.
        this.child({
            root: this.root,
            dispose: mountReact(
                this.root,
                <PathInputBridge
                    view={this}
                    model={this.driver.model}
                    propsState={this.propsState}
                />,
            ),
        });
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
            ref: _ref,
            children: _children,
            "aria-label": _ariaLabel,
            "aria-labelledby": _ariaLabelledBy,
            ...attributes
        } = props;

        // Forward residual props first; the component-owned attributes below
        // are authoritative even if a caller passes conflicting data-* props.
        applyRestProps(this.root, attributes, this.restPropsState);

        this.root.dataset.type = "path-input";
        if (name !== undefined) this.root.dataset.name = name;
        else delete this.root.dataset.name;
        if (disabled) this.root.dataset.disabled = "";
        else delete this.root.dataset.disabled;
        if (readOnly) this.root.dataset.readonly = "";
        else delete this.root.dataset.readonly;
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
        row.addEventListener("mousedown", this.onRowMouseDown);
        row.addEventListener("click", this.onRowClick);
        row.addEventListener("mouseenter", this.onRowMouseEnter);
        return row;
    }

    private updateRow(row: HTMLDivElement, item: PathSuggestion, index: number): void {
        this.rowMeta.set(row, { item, index });
        const [prefix, segment, separator] = Array.from(row.children) as HTMLSpanElement[];
        prefix.textContent = item.matchPrefix;
        segment.textContent = item.label;
        separator.textContent = item.isFolder ? (this.props.separator ?? "/") : "";
        if (this.driver.model.state.get().activeIndex === index) row.dataset.active = "";
        else delete row.dataset.active;
    }

    private removeRow(row: HTMLDivElement): void {
        row.removeEventListener("mousedown", this.onRowMouseDown);
        row.removeEventListener("click", this.onRowClick);
        row.removeEventListener("mouseenter", this.onRowMouseEnter);
        this.rowMeta.delete(row);
        this.rowElements.delete(row);
        this.driver.model.setRowRef(this.rowPath(row), null);
    }

    private readonly onRowMouseDown = (event: MouseEvent): void => {
        this.driver.model.onRowMouseDown(event);
    };

    private readonly onRowClick = (event: MouseEvent): void => {
        const row = event.currentTarget as HTMLDivElement;
        const meta = this.rowMeta.get(row);
        if (meta) this.driver.model.onRowClick(meta.item);
    };

    private readonly onRowMouseEnter = (event: MouseEvent): void => {
        const row = event.currentTarget as HTMLDivElement;
        const meta = this.rowMeta.get(row);
        if (meta) this.driver.model.onRowMouseEnter(meta.index);
    };

    private updateActiveRows(activeIndex: number | null): void {
        for (const row of this.rowElements) {
            const meta = this.rowMeta.get(row);
            if (!meta) continue;
            if (activeIndex === meta.index) row.dataset.active = "";
            else delete row.dataset.active;
        }

        if (activeIndex == null) return;
        const suggestion = this.driver.model.suggestions[activeIndex];
        const row = suggestion && this.driver.model.getRowRef(suggestion.path);
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
            this.driver.model.setRowRef(this.rowPath(row), null);
        }
        this.rowElements.clear();
    }

    private clearInputRef(): void {
        const ref = this.externalRef;
        if (ref) {
            if (this.externalRefCleanup) this.externalRefCleanup();
            else if (typeof ref === "function") ref(null);
            else ref.current = null;
        }
        this.externalRefCleanup = undefined;
        this.externalRef = undefined;
        this.inputElement = null;
        this.driver.model.setInputRef(null);
    }

}
