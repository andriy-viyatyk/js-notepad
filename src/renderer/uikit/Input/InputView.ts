import { applyRestProps, bindRef, clearRestListeners, createRestPropsState } from "../shared/dom-props";
import type { ElementRef, NativeInputHTMLAttributes, RestPropsState } from "../shared/dom-props";
import { fillSlot, type SlotContent } from "../shared/fill-slot";
import { VanillaView } from "../shared/vanilla-view";
// Owned by the view, not the shim: a vanilla parent may compose `InputView` directly (MultiListBox
// does), and the stylesheet has to travel with the DOM rather than with the React face.
import "./Input.css";

export interface InputProps
    extends Omit<NativeInputHTMLAttributes<HTMLInputElement>, "onChange" | "size" | "onKeyDown"> {
    ref?: ElementRef<HTMLInputElement>;
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Change handler — receives the string value directly, not the event. */
    onChange?: (value: string) => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    /** Control height. Default: "md". */
    size?: "sm" | "md";
    /**
     * Visual variant. `"default"` renders the standard chrome (dark background, gray border).
     * `"ghost"` renders transparent background and border at rest, with a gray border on hover
     * and a blue border on focus — for inline-edit fields embedded in list/grid rows. Default:
     * `"default"`.
     */
    variant?: "default" | "ghost";
    /**
     * Text tone. `"default"` uses the theme text colour. `"accent"` paints the input text in
     * `color.misc.blue` — use for inputs whose value carries "filter is active" semantics
     * (search boxes, etc.). Default: `"default"`.
     */
    tone?: "default" | "accent";
    /**
     * Content rendered inside the input chrome, before the text. A DOM `Node` is appended directly
     * with no React root — that is how a vanilla parent supplies a composed view's root
     * (`Select` passes its chevron `IconButtonView`'s root here).
     */
    startSlot?: SlotContent;
    /** Content rendered inside the input chrome, after the text. See `startSlot`. */
    endSlot?: SlotContent;
    /** When true, paints a red border (`color.error.border`) — for required/validated
     *  fields whose current value is rejected. Persists through focus. Default: false. */
    invalid?: boolean;
    /** Fixed width — number → px, string passes through. Default: fills parent (100%). */
    width?: number | string;
    /** Minimum width — number → px, string passes through. */
    minWidth?: number | string;
    /** Maximum width — number → px, string passes through. */
    maxWidth?: number | string;
}

export function cssLength(value: number | string): string {
    return typeof value === "number" ? `${value}px` : value;
}

function hasSlot(value: SlotContent): boolean {
    return value !== undefined && value !== null && value !== false;
}

export class InputView extends VanillaView<InputProps> {
    private readonly field: HTMLInputElement;
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private readonly slotHosts = new Map<"start" | "end", HTMLDivElement>();
    private readonly slotCleanups = new Map<"start" | "end", () => void>();
    /**
     * The last value handed to `fillSlot` per slot. `fillSlot`'s node path runs
     * `replaceChildren()` then `append()`, and `updateSlot` is called on every update — so without
     * this gate a vanilla parent passing a stable element (`Select`'s chevron button) would have it
     * detached and re-appended on every keystroke: layout invalidation, a restarted transition, and
     * a spurious `MutationObserver` record, for identical content.
     *
     * Safe for both arms. The same `Node` means the same content, and a React element built inline
     * is always a new object, so a genuinely-changed subtree always has a new identity.
     */
    private readonly appliedSlots = new Map<"start" | "end", SlotContent>();
    private refCleanup: (() => void) | undefined;
    private previousRef: ElementRef<HTMLInputElement> | undefined;
    private previousAutoFocus = false;

    public constructor(props: InputProps) {
        super(props, document.createElement("div"));
        this.field = document.createElement("input");
    }

    protected onMount(): void {
        this.root.append(this.field);
        this.applyProps(this.props);
        this.updateSlots(this.props);
        this.updateRef(this.props.ref);
        this.listen(this.field, "input", this.handleInput);
        this.listen(this.field, "keydown", this.handleKeyDown);

        this.own(() => this.clearSlots());
        this.own(() => this.clearRef());
        this.own(() => clearRestListeners(this.field, this.restPropsState));
    }

    protected onUpdate(props: InputProps): void {
        this.applyProps(props);
        this.updateSlots(props);
        if (props.ref !== this.previousRef) {
            this.updateRef(props.ref);
        }
    }

    protected onDispose(): void {
        this.clearSlots();
        this.clearRef();
        clearRestListeners(this.field, this.restPropsState);
    }

    private applyProps(props: InputProps): void {
        const {
            name,
            onChange: _onChange,
            onKeyDown: _onKeyDown,
            size = "md",
            variant = "default",
            tone = "default",
            disabled,
            readOnly,
            startSlot: _startSlot,
            endSlot: _endSlot,
            invalid,
            width,
            minWidth,
            maxWidth,
            ref: _ref,
            value,
            defaultValue,
            checked,
            autoFocus,
            ...rest
        } = props;

        applyRestProps(this.field, rest as Record<string, unknown>, this.restPropsState);

        this.root.dataset.type = "input";
        this.setOptionalDataset("name", name);
        this.root.dataset.size = size;
        this.root.dataset.variant = variant;
        this.root.dataset.tone = tone;
        this.setBooleanDataset("disabled", disabled);
        this.setBooleanDataset("readonly", readOnly);
        this.setBooleanDataset("invalid", invalid);

        this.field.dataset.size = size;
        this.field.dataset.tone = tone;
        this.setBooleanDatasetOnField("has-start", hasSlot(props.startSlot));
        this.setBooleanDatasetOnField("has-end", hasSlot(props.endSlot));
        this.field.disabled = Boolean(disabled);
        this.field.readOnly = Boolean(readOnly);

        if (value !== undefined && String(value) !== this.field.value) {
            this.field.value = String(value);
        }
        if (defaultValue !== undefined && this.field.defaultValue !== String(defaultValue)) {
            this.field.defaultValue = String(defaultValue);
        }
        if (checked !== undefined && this.field.checked !== Boolean(checked)) {
            this.field.checked = Boolean(checked);
        }

        if (width === undefined) this.root.style.removeProperty("--input-width");
        else this.root.style.setProperty("--input-width", cssLength(width));
        if (minWidth === undefined) this.root.style.removeProperty("--input-min-width");
        else this.root.style.setProperty("--input-min-width", cssLength(minWidth));
        if (maxWidth === undefined) this.root.style.removeProperty("--input-max-width");
        else this.root.style.setProperty("--input-max-width", cssLength(maxWidth));

        if (autoFocus && !this.previousAutoFocus) {
            this.field.focus();
        }
        this.previousAutoFocus = Boolean(autoFocus);
    }

    private updateSlots(props: InputProps): void {
        this.updateSlot("start", props.startSlot);
        this.updateSlot("end", props.endSlot);
    }

    private updateSlot(kind: "start" | "end", value: SlotContent): void {
        const present = hasSlot(value);
        const host = this.slotHosts.get(kind);

        if (!present) {
            this.slotCleanups.get(kind)?.();
            this.slotCleanups.delete(kind);
            this.appliedSlots.delete(kind);
            host?.remove();
            this.slotHosts.delete(kind);
            return;
        }

        // `host` is undefined on the first application, which must always run.
        if (host && this.appliedSlots.get(kind) === value) return;
        const nextHost = host ?? this.createSlotHost(kind);
        this.appliedSlots.set(kind, value);
        this.slotCleanups.set(kind, fillSlot(nextHost, value));
    }

    private createSlotHost(kind: "start" | "end"): HTMLDivElement {
        const host = document.createElement("div");
        host.dataset.part = kind === "start" ? "start-slot" : "end-slot";
        if (kind === "start") this.root.insertBefore(host, this.field);
        else this.root.append(host);
        this.slotHosts.set(kind, host);
        return host;
    }

    private clearSlots(): void {
        for (const cleanup of this.slotCleanups.values()) cleanup();
        this.slotCleanups.clear();
        this.appliedSlots.clear();
        for (const host of this.slotHosts.values()) host.remove();
        this.slotHosts.clear();
    }

    private updateRef(ref: ElementRef<HTMLInputElement> | undefined): void {
        this.clearRef();
        this.refCleanup = bindRef(this.field, ref);
        this.previousRef = ref;
    }

    private clearRef(): void {
        this.refCleanup?.();
        this.refCleanup = undefined;
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

    private setBooleanDatasetOnField(key: string, value: boolean): void {
        const attribute = `data-${key}`;
        if (value) this.field.setAttribute(attribute, "");
        else this.field.removeAttribute(attribute);
    }

    private readonly handleInput = (event: Event): void => {
        this.props.onChange?.((event.currentTarget as HTMLInputElement).value);
    };

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        this.props.onKeyDown?.(event);
    };
}
