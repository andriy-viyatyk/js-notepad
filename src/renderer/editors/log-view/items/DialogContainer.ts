import { applyPanelAttributes, createPanelElement, resolvePanelAttributes } from "../../../uikit/Panel/panel-style";
import { VanillaView, type IOwnedView } from "../../../uikit/shared/vanilla-view";

export interface DialogContainerViewProps {
    resolved: boolean;
    children: Node[];
    ownedChildren?: IOwnedView[];
}

export class DialogContainerView extends VanillaView<DialogContainerViewProps> {
    public constructor(props: DialogContainerViewProps) {
        super(props, createPanelElement({
            name: "log-dialog-container",
            direction: "column",
            border: true,
            borderColor: props.resolved ? "default" : "active",
            rounded: "md",
            overflow: "hidden",
            width: "fit-content",
            maxWidth: "100%",
        }));
        for (const child of props.ownedChildren ?? []) this.child(child);
    }

    protected onMount(): void {
        this.root.append(...this.props.children);
        for (const child of this.props.ownedChildren ?? []) (child as IOwnedView & { mount(): HTMLElement }).mount();
        this.applyProps(this.props);
    }

    protected onUpdate(props: DialogContainerViewProps): void {
        this.applyProps(props);
    }

    private applyProps(props: DialogContainerViewProps): void {
        applyPanelAttributes(this.root, resolvePanelAttributes({
            name: "log-dialog-container",
            direction: "column",
            border: true,
            borderColor: props.resolved ? "default" : "active",
            rounded: "md",
            overflow: "hidden",
            width: "fit-content",
            maxWidth: "100%",
        }));
    }
}
