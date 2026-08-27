import React from "react";
import { fillSlot, type SlotContent } from "../shared/fill-slot";
import {
    applyRestProps,
    bindRef,
    clearRestListeners,
    createRestPropsState,
    type RestPropsState,
} from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import type { InputProps } from "./Input";
// Owned by the view, not the shim: a vanilla parent may compose `InputView` directly (MultiListBox
// does), and the stylesheet has to travel with the DOM rather than with the React face.
import "./Input.css";

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
    private previousRef: React.Ref<HTMLInputElement> | undefined;
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

    private updateRef(ref: React.Ref<HTMLInputElement> | undefined): void {
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
