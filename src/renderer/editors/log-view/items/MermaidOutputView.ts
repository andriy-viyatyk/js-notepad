import { errMessage } from "../../../../shared/utils";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { createTextElement } from "../../../uikit/Text/text-style";
import { IconButtonView } from "../../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { pagesModel } from "../../../api/pages";
import { themeState } from "../../../theme/theme-state";
import { renderMermaidSvg, svgToDataUrl } from "../../mermaid/render-mermaid";
import type { MermaidOutputEntry } from "../logTypes";
import { DialogHeaderView } from "./DialogHeader";

export interface MermaidOutputViewProps { entry: MermaidOutputEntry; }

async function copyImageToClipboard(image: HTMLImageElement): Promise<void> {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export class MermaidOutputView extends VanillaView<MermaidOutputViewProps> {
    private readonly header: DialogHeaderView;
    private readonly content = createPanelElement({ name: "log-mermaid-content", paddingY: "sm", justify: "center", align: "center" });
    private readonly panel = createPanelElement({ name: "log-mermaid-output", direction: "column", position: "relative", width: "100%", revealChildrenOnHover: true });
    private readonly openButton: IconButtonView;
    private readonly copyButton: IconButtonView;
    private readonly actions = createPanelElement({ name: "log-mermaid-hover-actions", position: "absolute", top: 4, right: 4, direction: "row", gap: "sm", zIndex: 1 });
    private image: HTMLImageElement | undefined;
    private renderGeneration = 0;
    private svgUrl: string | null = null;
    private error = "";
    private renderedText: string | undefined;
    private renderedDark: boolean | undefined;

    public constructor(props: MermaidOutputViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.header = new DialogHeaderView({ title: props.entry.title });
        this.openButton = new IconButtonView({ name: "log-mermaid-open-in-editor", hideUntilParentHover: true, size: "sm", icon: "open-link", title: "Open in Mermaid editor", onClick: this.handleOpenInEditor });
        this.copyButton = new IconButtonView({ name: "log-mermaid-copy", hideUntilParentHover: true, size: "sm", icon: "copy", title: "Copy image to clipboard", onClick: this.handleCopy });
        this.actions.append(this.openButton.root, this.copyButton.root);
        this.panel.append(this.header.root, this.content, this.actions);
        this.child(this.header);
        this.child(this.openButton);
        this.child(this.copyButton);
    }

    protected onMount(): void {
        this.own(themeState.subscribe(() => this.startRender()));
        this.root.append(this.panel);
        this.header.mount();
        this.openButton.mount();
        this.copyButton.mount();
        this.startRender();
    }

    protected onUpdate(props: MermaidOutputViewProps): void { this.header.update({ title: props.entry.title }); this.startRender(); }

    protected onDispose(): void { this.renderGeneration += 1; }

    private startRender(): void {
        const isDark = themeState.get().isDark;
        if (this.renderedText === this.props.entry.text && this.renderedDark === isDark) return;
        this.renderedText = this.props.entry.text;
        this.renderedDark = isDark;
        const generation = ++this.renderGeneration;
        this.svgUrl = null;
        this.error = "";
        this.image = undefined;
        this.renderContent();
        const lightMode = !isDark;
        queueMicrotask(() => {
            void renderMermaidSvg(this.props.entry.text, lightMode)
                .then((svg) => {
                    if (generation !== this.renderGeneration) return;
                    this.svgUrl = svgToDataUrl(svg, undefined, !lightMode);
                    this.renderContent();
                })
                .catch((error: unknown) => {
                    if (generation !== this.renderGeneration) return;
                    this.error = errMessage(error, "Failed to render diagram");
                    this.renderContent();
                });
        });
    }

    private renderContent(): void {
        this.content.replaceChildren();
        if (this.error) {
            const panel = createPanelElement({ paddingX: "xl", paddingY: "xl" });
            panel.append(createTextElement(this.error, { size: "md", color: "error" }));
            this.content.append(panel);
        } else if (!this.svgUrl) {
            const panel = createPanelElement({ paddingX: "xxl", paddingY: "xxl" });
            panel.append(createTextElement("Rendering...", { size: "md", color: "light" }));
            this.content.append(panel);
        } else {
            this.image = document.createElement("img");
            this.image.src = this.svgUrl;
            this.image.alt = "Mermaid Diagram";
            this.image.style.maxWidth = "100%";
            this.image.style.height = "auto";
            this.content.append(this.image);
        }
        this.copyButton.update({ name: "log-mermaid-copy", hideUntilParentHover: true, size: "sm", icon: "copy", title: "Copy image to clipboard", disabled: !this.svgUrl, onClick: this.handleCopy });
    }

    private readonly handleCopy = (): void => {
        if (this.image) void copyImageToClipboard(this.image).catch((error: unknown) => console.error(errMessage(error, "Failed to copy diagram")));
    };

    private readonly handleOpenInEditor = (): void => {
        const title = typeof this.props.entry.title === "string" ? this.props.entry.title : "Mermaid Diagram";
        pagesModel.addEditorPage("mermaid-view", "mermaid", title, this.props.entry.text);
    };
}
