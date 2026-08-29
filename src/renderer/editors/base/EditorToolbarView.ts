import { applyPanelAttributes, createPanelElement, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { fillSlot, type SlotContent } from "../../uikit/shared/fill-slot";
import { VanillaView } from "../../uikit/shared/vanilla-view";

export interface EditorToolbarViewProps {
    name?: string;
    borderTop?: boolean;
    borderBottom?: boolean;
    children?: SlotContent;
}

function panelProps(props: EditorToolbarViewProps) {
    return {
        name: props.name ?? "editor-toolbar",
        direction: "row" as const,
        align: "center" as const,
        gap: "sm" as const,
        overflow: "hidden" as const,
        background: "dark" as const,
        paddingX: "sm" as const,
        paddingY: "xs" as const,
        shrink: false,
        borderTop: props.borderTop,
        borderBottom: props.borderBottom,
        hideWhenEmpty: true,
    };
}

export class EditorToolbarView extends VanillaView<EditorToolbarViewProps> {
    private contentCleanup: (() => void) | undefined;

    public constructor(props: EditorToolbarViewProps) {
        super(props, createPanelElement(panelProps(props)));
    }

    public setConfiguration(props: Omit<EditorToolbarViewProps, "children">): void {
        this.props = { ...this.props, ...props };
        this.syncPanel(this.props);
    }

    public setContent(children: SlotContent | undefined): void {
        this.props = { ...this.props, children };
        this.updateContent(children);
    }

    protected onMount(): void {
        this.syncPanel(this.props);
        this.updateContent(this.props.children);
        this.own(() => {
            this.contentCleanup?.();
            this.contentCleanup = undefined;
        });
    }

    protected onUpdate(props: EditorToolbarViewProps): void {
        this.syncPanel(props);
        this.updateContent(props.children);
    }

    private syncPanel(props: EditorToolbarViewProps): void {
        applyPanelAttributes(this.root, resolvePanelAttributes(panelProps(props)));
    }

    private updateContent(children: SlotContent | undefined): void {
        this.contentCleanup = fillSlot(this.root, children);
    }
}
