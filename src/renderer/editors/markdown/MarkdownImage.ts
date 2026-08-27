import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { CopyIcon, OpenLinkIcon } from "../../theme/icons";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { applyHastProperties, type HastProperties } from "./hast-dom";
import { copyImageToClipboard } from "./CodeBlock";

export interface MarkdownImageViewProps {
    /** Already-resolved image source (passed through resolveRelatedLink). */
    src?: string;
    properties: HastProperties;
}

// Rendered markdown image with a hover toolbar (Copy + Open in new tab),
// mirroring the Mermaid diagram toolbar for visual consistency. The wrapper is
// inline-block because markdown images are inline-level content.
export class MarkdownImageView extends VanillaView<MarkdownImageViewProps> {
    private image!: HTMLImageElement;
    private copiedTimer: ReturnType<typeof setTimeout> | undefined;
    private copyButton: HTMLButtonElement | undefined;

    public constructor(props: MarkdownImageViewProps) {
        const root = document.createElement("span");
        root.className = "md-image";
        super(props, root);
    }

    protected onMount(): void {
        this.image = document.createElement("img");
        const properties = { ...this.props.properties, src: this.props.src };
        applyHastProperties(this.image, properties, "html");

        const toolbar = document.createElement("div");
        toolbar.className = "diagram-toolbar";
        const canOpen = !!this.props.src && !/^(data:|blob:)/i.test(this.props.src);

        if (canOpen) {
            const openButton = document.createElement("button");
            openButton.className = "toolbar-btn";
            openButton.title = "Open in new tab";
            const openIcon = OpenLinkIcon.createElement({ width: 14, height: 14 });
            if (openIcon) openButton.append(openIcon);
            this.listen(openButton, "click", () => {
                if (!this.props.src) return;
                void app.events.openRawLink.sendAsync(createLinkData(this.props.src));
            });
            toolbar.append(openButton);
        }

        const copyButton = document.createElement("button");
        copyButton.className = "toolbar-btn";
        copyButton.title = "Copy";
        const copyIcon = CopyIcon.createElement({ width: 14, height: 14 });
        if (copyIcon) copyButton.append(copyIcon);
        this.listen(copyButton, "click", () => {
            void copyImageToClipboard(this.image);
            copyButton.classList.add("copied");
            if (this.copiedTimer !== undefined) clearTimeout(this.copiedTimer);
            this.copiedTimer = setTimeout(() => copyButton.classList.remove("copied"), 750);
        });
        toolbar.append(copyButton);
        this.copyButton = copyButton;
        this.root.append(this.image, toolbar);
    }

    protected onDispose(): void {
        if (this.copiedTimer !== undefined) clearTimeout(this.copiedTimer);
        this.copyButton = undefined;
    }
}

export function createMarkdownImageNode(
    properties: HastProperties,
): MarkdownImageView {
    const src = typeof properties.src === "string" ? properties.src : undefined;
    return new MarkdownImageView({ src, properties });
}
