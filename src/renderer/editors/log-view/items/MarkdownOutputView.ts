import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { IconButtonView } from "../../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { pagesModel } from "../../../api/pages";
import { MarkdownBlockView } from "../../markdown/MarkdownBlockView";
import type { MarkdownOutputEntry } from "../logTypes";
import { DialogHeaderView } from "./DialogHeader";

export interface MarkdownOutputViewProps { entry: MarkdownOutputEntry; }

export class MarkdownOutputView extends VanillaView<MarkdownOutputViewProps> {
    private readonly header: DialogHeaderView;
    private readonly markdown: MarkdownBlockView;
    private readonly action: IconButtonView;
    private readonly content = createPanelElement({ name: "log-markdown-content", paddingY: "sm" });
    private readonly panel = createPanelElement({ name: "log-markdown-output", direction: "column", position: "relative", width: "100%", revealChildrenOnHover: true });

    public constructor(props: MarkdownOutputViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.header = new DialogHeaderView({ title: props.entry.title });
        this.markdown = new MarkdownBlockView({ content: props.entry.text, compact: true });
        this.action = new IconButtonView({ name: "log-markdown-open-in-editor", hideUntilParentHover: true, size: "sm", icon: "open-link", title: "Open in Markdown editor", onClick: this.handleOpenInEditor });
        this.content.append(this.markdown.root);
        const actions = createPanelElement({ name: "log-markdown-hover-actions", position: "absolute", top: 4, right: 4, zIndex: 1 });
        actions.append(this.action.root);
        this.panel.append(this.header.root, this.content, actions);
        this.child(this.header);
        this.child(this.markdown);
        this.child(this.action);
    }

    protected onMount(): void { this.header.mount(); this.markdown.mount(); this.action.mount(); this.root.append(this.panel); }
    protected onUpdate(props: MarkdownOutputViewProps): void { this.header.update({ title: props.entry.title }); this.markdown.update({ content: props.entry.text, compact: true }); }

    private readonly handleOpenInEditor = (): void => {
        const title = typeof this.props.entry.title === "string" ? this.props.entry.title : "Markdown";
        pagesModel.addEditorPage("md-view", "markdown", title, this.props.entry.text);
    };
}
