import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type RestPropsState,
} from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import type { TextareaProps } from "./Textarea";

function innerTextToString(text: string): string {
    if (text === "\n") return "";
    if (text.endsWith("\n")) return text.slice(0, -1);
    return text;
}

function cssLength(value: number | string): string {
    return typeof value === "number" ? `${value}px` : value;
}

function flexValue(value: TextareaProps["flex"]): string | undefined {
    if (value === undefined || value === false) return undefined;
    if (value === true) return "1 1 auto";
    if (typeof value === "number") return `${value} 1 auto`;
    return value;
}

export class TextareaView extends VanillaView<TextareaProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private editableListenersAttached = false;
    private lastSyncedValue: string | undefined;
    private previousAutoFocus = false;
    private autoFocusTimer: ReturnType<typeof setTimeout> | undefined;

    public constructor(props: TextareaProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.syncEditableListeners();
        this.scheduleAutoFocus(this.props.autoFocus);
        this.own(() => this.cancelAutoFocus());
        this.own(() => this.detachEditableListeners());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: TextareaProps): void {
        const shouldAutoFocus = Boolean(props.autoFocus) && !this.previousAutoFocus;
        this.applyProps(props);
        this.syncEditableListeners();
        if (shouldAutoFocus) {
            this.scheduleAutoFocus(true);
        }
    }

    protected onDispose(): void {
        this.cancelAutoFocus();
        this.detachEditableListeners();
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: TextareaProps): void {
        const {
            name,
            value,
            onChange: _onChange,
            placeholder,
            disabled,
            readOnly,
            singleLine,
            minHeight,
            maxHeight,
            width,
            minWidth,
            maxWidth,
            flex,
            size = "md",
            variant = "default",
            autoFocus: _autoFocus,
            onKeyDown: _onKeyDown,
            onPaste: _onPaste,
            ...rest
        } = props;

        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);

        this.root.setAttribute("role", "textbox");
        this.root.setAttribute("aria-multiline", String(!singleLine));
        this.root.setAttribute("contenteditable", disabled || readOnly ? "false" : "plaintext-only");
        this.root.contentEditable = disabled || readOnly ? "false" : "plaintext-only";
        this.root.spellcheck = false;
        this.root.setAttribute("spellcheck", "false");
        this.root.dataset.type = "textarea";
        this.setOptionalDataset("name", name);
        this.root.dataset.size = size;
        this.root.dataset.variant = variant;
        this.setBooleanDataset("disabled", disabled);
        this.setBooleanDataset("readonly", readOnly);
        this.setBooleanDataset("single-line", singleLine);
        this.setOptionalDataset("placeholder", placeholder);
        this.root.tabIndex = disabled || readOnly ? -1 : 0;

        if (this.lastSyncedValue !== value) {
            if (innerTextToString(this.root.innerText) !== value) {
                this.root.innerText = value ?? "";
            }
            this.lastSyncedValue = value;
        }

        this.setLengthProperty("--textarea-min-height", minHeight);
        this.setLengthProperty("--textarea-max-height", maxHeight);
        this.setLengthProperty("--textarea-width", width);
        this.setLengthProperty("--textarea-min-width", minWidth);
        this.setLengthProperty("--textarea-max-width", maxWidth);
        const nextFlex = flexValue(flex);
        if (nextFlex === undefined) this.root.style.removeProperty("--textarea-flex");
        else this.root.style.setProperty("--textarea-flex", nextFlex);

        this.previousAutoFocus = Boolean(props.autoFocus);
    }

    private syncEditableListeners(): void {
        const editable = !this.props.disabled && !this.props.readOnly;
        if (editable === this.editableListenersAttached) return;
        if (editable) {
            this.root.addEventListener("input", this.handleInput);
            this.root.addEventListener("paste", this.handlePaste);
            this.root.addEventListener("keydown", this.handleKeyDown);
        } else {
            this.detachEditableListeners();
        }
        this.editableListenersAttached = editable;
    }

    private detachEditableListeners(): void {
        if (!this.editableListenersAttached) return;
        this.root.removeEventListener("input", this.handleInput);
        this.root.removeEventListener("paste", this.handlePaste);
        this.root.removeEventListener("keydown", this.handleKeyDown);
        this.editableListenersAttached = false;
    }

    private scheduleAutoFocus(autoFocus: boolean | undefined): void {
        this.cancelAutoFocus();
        if (!autoFocus) return;
        this.autoFocusTimer = setTimeout(() => {
            this.autoFocusTimer = undefined;
            this.root.focus();
        }, 0);
    }

    private cancelAutoFocus(): void {
        if (this.autoFocusTimer === undefined) return;
        clearTimeout(this.autoFocusTimer);
        this.autoFocusTimer = undefined;
    }

    private setOptionalDataset(key: string, value: string | undefined): void {
        const attribute = `data-${key}`;
        if (value === undefined) this.root.removeAttribute(attribute);
        else this.root.setAttribute(attribute, value);
    }

    private setBooleanDataset(key: string, value: boolean | undefined): void {
        const attribute = `data-${key}`;
        if (value) this.root.setAttribute(attribute, "");
        else this.root.removeAttribute(attribute);
    }

    private setLengthProperty(name: string, value: number | string | undefined): void {
        if (value === undefined) this.root.style.removeProperty(name);
        else this.root.style.setProperty(name, cssLength(value));
    }

    private readonly handleInput = (event: Event): void => {
        let text = (event.currentTarget as HTMLDivElement).innerText;
        if (this.props.singleLine && text.includes("\n")) {
            text = text.replace(/\n/g, "");
            this.root.innerText = text;
        } else {
            text = innerTextToString(text);
        }
        this.props.onChange?.(text);
    };

    private readonly handlePaste = (event: ClipboardEvent): void => {
        this.props.onPaste?.(event);
        if (event.defaultPrevented) return;

        event.preventDefault();
        let text = event.clipboardData?.getData("text/plain") ?? "";
        if (this.props.singleLine) text = text.replace(/\n/g, "");

        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        selection.deleteFromDocument();
        const node = document.createTextNode(text);
        selection.getRangeAt(0).insertNode(node);
        const range = document.createRange();
        range.setStartAfter(node);
        range.setEndAfter(node);
        selection.removeAllRanges();
        selection.addRange(range);

        this.props.onChange?.(innerTextToString(this.root.innerText));
    };

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        this.props.onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (this.props.singleLine && event.key === "Enter") {
            event.preventDefault();
        }
    };
}
