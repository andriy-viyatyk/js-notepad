import { applyPanelAttributes, createPanelElement, resolvePanelAttributes } from "../../../uikit/Panel/panel-style";
import { createTextElement } from "../../../uikit/Text/text-style";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import type { StyledText } from "../logTypes";
import { StyledTextView } from "../StyledTextView";

export interface DialogHeaderViewProps { title?: StyledText; }

export class DialogHeaderView extends VanillaView<DialogHeaderViewProps> {
    private readonly text = createTextElement("", { size: "md", color: "light" });
    private readonly styled = this.child(new StyledTextView({ text: "" }));

    public constructor(props: DialogHeaderViewProps) {
        super(props, createPanelElement({ name: "log-dialog-header", background: "dark", rounded: "md", paddingX: "md", paddingY: "xs" }));
    }

    protected onMount(): void {
        this.root.append(this.text, this.styled.root);
        this.styled.update({ text: this.props.title ?? "" });
        this.styled.mount();
        this.applyProps(this.props);
    }

    protected onUpdate(props: DialogHeaderViewProps): void {
        this.styled.update({ text: props.title ?? "" });
        this.applyProps(props);
    }

    private applyProps(props: DialogHeaderViewProps): void {
        const visible = Boolean(props.title);
        this.root.style.display = visible ? "" : "none";
        applyPanelAttributes(this.root, resolvePanelAttributes({ name: "log-dialog-header", background: "dark", rounded: "md", paddingX: "md", paddingY: "xs" }));
    }
}
