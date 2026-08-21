import React from "react";
import {
    applyRestProps,
    bindRef,
    clearRestListeners,
    createRestPropsState,
    type RestPropsState,
} from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import type { SectionItemProps } from "./SectionItem";
import "./SectionItem.css";

/**
 * A non-interactive section header row. Pure DOM: its label is a `string`, so there is no slot, no
 * React root and no tooltip.
 */
export class SectionItemView extends VanillaView<SectionItemProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private refCleanup: () => void = () => undefined;
    private boundRef: React.Ref<HTMLDivElement> | undefined;

    public constructor(props: SectionItemProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.setRef(this.props.ref);
        this.own(() => this.clearRef());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: SectionItemProps): void {
        this.applyProps(props);
        this.setRef(props.ref);
    }

    private applyProps(props: SectionItemProps): void {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { name, id, label, ref: _ref, ...rest } = props;

        const root = this.root;
        root.dataset.type = "list-section";
        if (name === undefined) root.removeAttribute("data-name");
        else root.dataset.name = name;
        if (id === undefined) root.removeAttribute("id");
        else root.id = id;
        root.setAttribute("role", "presentation");
        root.textContent = label;

        applyRestProps(root, rest as Record<string, unknown>, this.restPropsState);
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
}
