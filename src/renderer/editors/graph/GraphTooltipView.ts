import { pagesModel } from "../../api/pages";
import type { IconButtonProps } from "../../uikit/IconButton/IconButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { getOverlayLayer } from "../../uikit/shared/overlayLayer";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { GraphNode, getCustomProperties, toNavigableHref } from "./types";
import "../../uikit/IconButton/IconButton.css";
import "./GraphTooltip.css";

export interface GraphTooltipProps {
    node: GraphNode;
    x: number;
    y: number;
    /** Whether this node is the root node. */
    isRoot?: boolean;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

const OFFSET = 12;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Build markdown representation of the tooltip content for clipboard. */
export function buildMarkdown(node: GraphNode, isRoot?: boolean): string {
    const lines: string[] = [];
    const title = node.title || node.id;

    if (isRoot) lines.push("**Root Node**");
    if (node.isGroup) lines.push("**Group**");
    lines.push(`## ${title}`);
    if (node.title) lines.push(`\`${node.id}\``);

    const customProps = getCustomProperties(node);
    if (customProps.length > 0) {
        lines.push("");
        lines.push("| Property | Value |");
        lines.push("|----------|-------|");
        for (const [key, value] of customProps) {
            const escaped = value.replace(/\|/g, "\\|");
            lines.push(`| ${key} | ${escaped} |`);
        }
    }

    return lines.join("\n");
}

function appendWithLinks(parent: ParentNode, text: string): void {
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        const [, linkText, href] = match;
        const link = document.createElement("a");
        link.className = "graph-tooltip-link";
        link.href = toNavigableHref(href);
        link.title = href;
        link.textContent = linkText;
        parent.append(link);
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex === 0) {
        parent.append(document.createTextNode(text));
    } else if (lastIndex < text.length) {
        parent.append(document.createTextNode(text.slice(lastIndex)));
    }
}

function createTooltipGlyph(strokeWidth: string): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", strokeWidth);
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    return svg;
}

/** Copy icon (two overlapping rectangles). */
function createCopyIconElement(): SVGSVGElement {
    const svg = createTooltipGlyph("1.5");
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", "5.5");
    rect.setAttribute("y", "5.5");
    rect.setAttribute("width", "9");
    rect.setAttribute("height", "9");
    rect.setAttribute("rx", "1");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1");
    svg.append(rect, path);
    return svg;
}

/** Check icon (shown briefly after copy). */
function createCheckIconElement(): SVGSVGElement {
    const svg = createTooltipGlyph("2");
    const polyline = document.createElementNS(SVG_NS, "polyline");
    polyline.setAttribute("points", "3 8 7 12 13 4");
    svg.append(polyline);
    return svg;
}

export class GraphTooltipView extends VanillaView<GraphTooltipProps> {
    private readonly headerContent = document.createElement("div");
    private readonly properties = document.createElement("div");
    private readonly copyButton: IconButtonView;
    private readonly openButton: IconButtonView;
    private copied = false;
    private copyResetTimer: ReturnType<typeof setTimeout> | undefined;
    private live = true;

    public constructor(props: GraphTooltipProps) {
        super(props, document.createElement("div"));
        this.root.className = "graph-tooltip";
        this.root.dataset.type = "tooltip";
        this.root.setAttribute("role", "tooltip");
        this.headerContent.className = "graph-tooltip-header-content";
        this.properties.className = "graph-tooltip-properties";

        this.copyButton = new IconButtonView(this.copyButtonProps());
        this.openButton = new IconButtonView(this.openButtonProps());
    }

    protected onMount(): void {
        const header = document.createElement("div");
        header.className = "graph-tooltip-header";
        header.append(this.headerContent, this.copyButton.root, this.openButton.root);
        this.root.append(header, this.properties);

        this.listen(this.root, "mouseenter", this.handleMouseEnter);
        this.listen(this.root, "mouseleave", this.handleMouseLeave);
        this.own(() => {
            this.live = false;
            clearTimeout(this.copyResetTimer);
            this.copyResetTimer = undefined;
        });

        getOverlayLayer().append(this.root);
        this.syncContent();
        this.child(this.copyButton);
        this.child(this.openButton);
        this.copyButton.mount();
        this.openButton.mount();
        this.position();
    }

    protected onUpdate(_props: GraphTooltipProps): void {
        this.syncContent();
        this.copyButton.update(this.copyButtonProps());
        this.openButton.update(this.openButtonProps());
        this.position();
    }

    protected onDispose(): void {
        this.root.remove();
    }

    private syncContent(): void {
        const { node, isRoot } = this.props;
        const title = node.title || node.id;
        this.headerContent.replaceChildren();

        if (isRoot) this.headerContent.append(this.createBadge("Root Node"));
        if (node.isGroup) this.headerContent.append(this.createBadge("Group"));

        const titleElement = document.createElement("div");
        titleElement.className = "graph-tooltip-title";
        appendWithLinks(titleElement, title);
        this.headerContent.append(titleElement);

        if (node.title) {
            const idElement = document.createElement("div");
            idElement.className = "graph-tooltip-id";
            idElement.textContent = node.id;
            this.headerContent.append(idElement);
        }

        const customProperties = getCustomProperties(node);
        this.properties.replaceChildren();
        this.properties.hidden = customProperties.length === 0;
        for (const [key, value] of customProperties) {
            const keyElement = document.createElement("span");
            keyElement.className = "graph-tooltip-property-key";
            keyElement.textContent = key;
            const valueElement = document.createElement("span");
            valueElement.className = "graph-tooltip-property-value";
            valueElement.title = value;
            appendWithLinks(valueElement, value);
            this.properties.append(keyElement, valueElement);
        }
    }

    private createBadge(text: string): HTMLDivElement {
        const badge = document.createElement("div");
        badge.className = "graph-tooltip-badge";
        badge.textContent = text;
        return badge;
    }

    private copyButtonProps(): IconButtonProps {
        return {
            size: "sm",
            icon: this.copied ? createCheckIconElement() : createCopyIconElement(),
            onClick: this.handleCopy,
            title: "Copy as Markdown",
        };
    }

    private openButtonProps(): IconButtonProps {
        return {
            size: "sm",
            icon: createIconElement("open-link"),
            onClick: this.handleOpen,
            title: "Open in new page",
        };
    }

    private readonly handleCopy = (): void => {
        const markdown = buildMarkdown(this.props.node, this.props.isRoot);
        void navigator.clipboard.writeText(markdown).then(() => {
            if (!this.live) return;
            this.copied = true;
            this.copyButton.update(this.copyButtonProps());
            clearTimeout(this.copyResetTimer);
            this.copyResetTimer = setTimeout(() => {
                if (!this.live) return;
                this.copied = false;
                this.copyResetTimer = undefined;
                this.copyButton.update(this.copyButtonProps());
            }, 1500);
        });
    };

    private readonly handleOpen = (): void => {
        const markdown = buildMarkdown(this.props.node, this.props.isRoot);
        const title = this.props.node.title || this.props.node.id;
        pagesModel.addEditorPage("md-view", "markdown", title, markdown);
    };

    private readonly handleMouseEnter = (): void => {
        this.props.onMouseEnter?.();
    };

    private readonly handleMouseLeave = (): void => {
        this.props.onMouseLeave?.();
    };

    private position(): void {
        const rect = this.root.getBoundingClientRect();
        let left = this.props.x + OFFSET;
        let top = this.props.y + OFFSET;
        let maxHeight: number | undefined;

        if (left + rect.width > window.innerWidth - OFFSET) {
            left = this.props.x - rect.width - OFFSET;
        }

        if (top + rect.height > window.innerHeight - OFFSET) {
            top = this.props.y - rect.height - OFFSET;
        }

        if (top < OFFSET) {
            top = OFFSET;
            maxHeight = window.innerHeight - OFFSET * 2;
        } else if (top + rect.height > window.innerHeight - OFFSET) {
            maxHeight = window.innerHeight - top - OFFSET;
        }

        this.root.style.left = `${left}px`;
        this.root.style.top = `${top}px`;
        this.root.style.maxHeight = maxHeight === undefined ? "" : `${maxHeight}px`;
        this.root.style.overflowY = maxHeight === undefined ? "" : "auto";
    }
}
