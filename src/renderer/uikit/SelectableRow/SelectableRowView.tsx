import React from "react";
import { applyRestProps, bindRef, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/react-compat";
import { fillSlot } from "../shared/fill-slot";
import { VanillaView } from "../shared/vanilla-view";
import type { SelectableRowProps } from "./SelectableRow";
import "./SelectableRow.css";

export class SelectableRowView extends VanillaView<SelectableRowProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private contentCleanup: (() => void) | undefined;
    private refCleanup: () => void = () => undefined;
    private boundRef: React.Ref<HTMLDivElement> | undefined;

    public constructor(props: SelectableRowProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.updateContent(this.props.children);
        this.setRef(this.props.ref);
        this.own(() => this.clearContent());
        this.own(() => this.clearRef());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: SelectableRowProps): void {
        this.applyProps(props);
        this.updateContent(props.children);
        this.setRef(props.ref);
    }

    protected onDispose(): void {
        this.clearContent();
        this.clearRef();
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: SelectableRowProps): void {
        const { name, selected, active, children: _children, ref: _ref, ...rest } = props;
        this.root.dataset.type = "selectable-row";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        if (selected) this.root.dataset.selected = "";
        else delete this.root.dataset.selected;
        if (active) this.root.dataset.active = "";
        else delete this.root.dataset.active;
        // Residual props historically came after the owned JSX attributes.
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    private updateContent(children: React.ReactNode): void {
        this.contentCleanup = fillSlot(this.root, children);
    }

    private setRef(ref: React.Ref<HTMLDivElement> | undefined): void {
        if (ref === this.boundRef) return;
        this.refCleanup();
        this.boundRef = ref;
        this.refCleanup = bindRef(this.root, ref);
    }

    private clearRef(): void {
        this.refCleanup();
        this.refCleanup = () => undefined;
        this.boundRef = undefined;
    }

    private clearContent(): void {
        this.contentCleanup?.();
        this.contentCleanup = undefined;
    }
}
