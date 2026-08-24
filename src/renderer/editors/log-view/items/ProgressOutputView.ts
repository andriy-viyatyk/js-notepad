import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { createTextElement } from "../../../uikit/Text/text-style";
import { ProgressBarView } from "../../../uikit/ProgressBar/ProgressBarView";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import type { ProgressOutputEntry } from "../logTypes";
import { StyledTextView } from "../StyledTextView";

export interface ProgressOutputViewProps { entry: ProgressOutputEntry; }

export class ProgressOutputView extends VanillaView<ProgressOutputViewProps> {
    private readonly labelRow = createPanelElement({ name: "log-progress-label-row", direction: "row", align: "center", gap: "md" });
    private readonly labelText = createTextElement("", { size: "md" });
    private readonly labelStyled = this.child(new StyledTextView({ text: "" }));
    private readonly valueText = createTextElement("", { size: "sm", color: "light" });
    private readonly progress = new ProgressBarView({ name: "log-progress" });
    private readonly rootPanel = createPanelElement({ name: "log-progress-output", direction: "column", gap: "xs" });

    public constructor(props: ProgressOutputViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.labelText.append(this.labelStyled.root);
        this.labelRow.append(this.labelText);
        this.rootPanel.append(this.labelRow, this.progress.root, this.valueText);
        this.child(this.progress);
    }

    protected onMount(): void {
        this.root.append(this.rootPanel);
        this.labelStyled.mount();
        this.progress.update(this.progressProps(this.props));
        this.progress.mount();
        this.applyProps(this.props);
    }

    protected onUpdate(props: ProgressOutputViewProps): void {
        this.progress.update(this.progressProps(props));
        this.applyProps(props);
    }

    private applyProps(props: ProgressOutputViewProps): void {
        const entry = props.entry;
        this.labelRow.style.display = entry.label ? "" : "none";
        this.labelStyled.update({ text: entry.label ?? "" });
        this.valueText.style.display = entry.value != null && !entry.completed ? "" : "none";
        this.valueText.textContent = entry.value != null && !entry.completed ? `${entry.value} / ${entry.max ?? 100}` : "";
    }

    private progressProps(props: ProgressOutputViewProps) {
        return { name: "log-progress", value: props.entry.value, max: props.entry.max, completed: props.entry.completed, width: 160 };
    }
}
