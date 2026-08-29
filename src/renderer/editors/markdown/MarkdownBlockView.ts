import type { NativeCSSProperties } from "../../uikit/shared/dom-props";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import type { Properties, Root, RootContent } from "hast";
import { ContextMenuEvent } from "../../api/events/events";
import { themeState } from "../../theme/theme-state";
import { CopyIcon, OpenFileIcon } from "../../theme/icons";
import { appendLinkOpenMenuItems } from "../shared/link-open-menu";
import { detectGitRoot } from "./detect-git-root";
import type { MarkdownEditor, MarkdownQueueRequest } from "./MarkdownEditor";
import { rehypeHeadingIds, slugifyHeading } from "./rehypeHeadingIds";
import { createRehypeHighlight } from "./rehypeHighlight";
import { rehypeMarkdownOverrides } from "./rehypeMarkdownOverrides";
import { createCodeBlockNode, createPreBlockNode } from "./CodeBlock";
import { createMarkdownImageNode } from "./MarkdownImage";
import {
    applyHastProperties,
    toDomProperties,
    type HastNamespace,
} from "./hast-dom";
import { claimViewOwnership, type IOwnedView, VanillaView } from "../../uikit/shared/vanilla-view";
import { errMessage } from "../../../shared/utils";
import "./MarkdownBlock.css";

export interface MarkdownBlockProps {
    /** Markdown content to render. */
    content: string;
    /** Text to highlight (search). Empty/undefined = no highlight. */
    highlightText?: string;
    /** Use compact mode (reduced font, spacing). */
    compact?: boolean;
    /** File path for resolving relative links. */
    filePath?: string;
    /** Additional CSS class on the root element. */
    className?: string;
    /** Inline style on the root element. */
    style?: NativeCSSProperties;
    /** Called when the number of search highlight matches changes. */
    onMatchCountChange?: (count: number) => void;
    commandQueue?: MarkdownEditor["typedQueue"];
}

export interface MarkdownRenderContext {
    renderNode(node: RootContent, namespace?: HastNamespace): Node;
    renderElement(
        tagName: string,
        properties: Properties | undefined,
        children: RootContent[],
        namespace: HastNamespace,
    ): HTMLElement | SVGElement;
    applyProperties(
        element: globalThis.Element,
        properties: Properties | undefined,
        namespace: HastNamespace,
    ): void;
    toDomProperties(properties: Properties | undefined, namespace: HastNamespace): Record<string, unknown>;
    track(view: IOwnedView & { mount(): HTMLElement }): void;
}

// =============================================================================
// Azure DevOps wiki container syntax → standard fenced code block
// =============================================================================

const MERMAID_CONTAINER_RE = /^:::[ \t]+mermaid[ \t]*\r?\n([\s\S]*?)\r?\n:::[ \t]*(?=\r?\n|$)/gm;

function preprocessFencedContainers(content: string): string {
    if (!content.includes(":::")) return content;
    return content.replace(MERMAID_CONTAINER_RE, (_, body) => `\`\`\`mermaid\n${body}\n\`\`\``);
}

// =============================================================================
// YAML frontmatter → ```yaml``` code block
// =============================================================================

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/;

function preprocessFrontmatter(content: string): string {
    const hasBom = content.charCodeAt(0) === 0xfeff;
    const body = hasBom ? content.slice(1) : content;
    if (body.charCodeAt(0) !== 0x2d /* - */) return content;
    const rewritten = body.replace(FRONTMATTER_RE, (match, yaml) => {
        if (!yaml.trim()) return match;
        return `\`\`\`yaml\n${yaml}\n\`\`\``;
    });
    return rewritten === body ? content : (hasBom ? content[0] + rewritten : rewritten);
}

// =============================================================================
// Anchor resolution (US-901)
// =============================================================================

function findAnchorTarget(root: HTMLElement, fragment: string): HTMLElement | null {
    const exact = root.querySelector<HTMLElement>(`[id="${CSS.escape(fragment)}"]`);
    if (exact) return exact;

    const lower = fragment.toLowerCase();
    const withId = Array.from(root.querySelectorAll<HTMLElement>("[id]"));
    const caseInsensitive = withId.find((el) => el.id.toLowerCase() === lower);
    if (caseInsensitive) return caseInsensitive;

    const slug = slugifyHeading(fragment);
    if (!slug) return null;
    const headings = Array.from(
        root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
    );
    return headings.find((heading) => slugifyHeading(heading.textContent || "") === slug) ?? null;
}

function childNamespace(namespace: HastNamespace, tagName: string): HastNamespace {
    return namespace === "svg" && tagName.toLowerCase() === "foreignobject" ? "html" : namespace;
}

function elementNamespace(parent: HastNamespace, tagName: string): HastNamespace {
    if (tagName.toLowerCase() === "svg") return "svg";
    if (parent === "svg") return "svg";
    return "html";
}

function renderNode(
    context: MarkdownRenderContext,
    node: RootContent,
    parentNamespace: HastNamespace,
    mermaidLightMode: boolean,
): Node {
    if (node.type === "text") return document.createTextNode(node.value);
    if (node.type === "raw") return document.createTextNode(node.value);
    if (node.type !== "element") return document.createDocumentFragment();

    const namespace = elementNamespace(parentNamespace, node.tagName);
    if (node.tagName === "code") return createCodeBlockNode(node, context);
    if (node.tagName === "pre") return createPreBlockNode(node, mermaidLightMode, context);
    if (node.tagName === "img") {
        const view = createMarkdownImageNode(toDomProperties(node.properties, "html"));
        context.track(view);
        return view.root;
    }

    return context.renderElement(node.tagName, node.properties, node.children, namespace);
}

function renderHast(
    root: HTMLElement,
    tree: Root,
    context: MarkdownRenderContext,
    mermaidLightMode: boolean,
): void {
    const fragment = document.createDocumentFragment();
    for (const node of tree.children) {
        fragment.append(renderNode(context, node, "html", mermaidLightMode));
    }
    root.append(fragment);
}

function stylePropertyName(name: string): string {
    if (name.startsWith("--")) return name;
    return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export class MarkdownBlockView extends VanillaView<MarkdownBlockProps> {
    private transientViews: Array<IOwnedView & { mount(): HTMLElement }> = [];
    private registeredQueue: MarkdownEditor["typedQueue"] | undefined;
    private unregisterQueue: (() => void) | undefined;
    private wikiRoot: string | undefined;
    private lookupFilePath: string | undefined;
    private lookupGeneration = 0;
    private renderGeneration = 0;
    private renderedContent = "";
    private renderedHighlightText: string | undefined;
    private renderedFilePath: string | undefined;
    private renderedWikiRoot: string | undefined;
    private renderedMermaidLightMode = false;
    private renderedHasMermaid = false;
    private hasRendered = false;
    private totalMatches = 0;

    public constructor(props: MarkdownBlockProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.applyRootProps();
        this.listen(this.root, "contextmenu", (event) => this.onContextMenu(event));
        this.own(themeState.subscribe(
            () => {
                if (this.renderedHasMermaid) this.renderIfNeeded();
            },
            (state) => state.isDark,
        ));
        this.registerQueue(this.props.commandQueue);
        this.startWikiRootLookup();
        this.renderIfNeeded(true);
    }

    protected onUpdate(props: MarkdownBlockProps): void {
        this.applyRootProps();
        if (props.commandQueue !== this.registeredQueue) this.registerQueue(props.commandQueue);
        if (props.filePath !== this.lookupFilePath) this.startWikiRootLookup();
        this.renderIfNeeded();
    }

    protected onDispose(): void {
        this.lookupGeneration += 1;
        this.renderGeneration += 1;
        this.unregisterQueue?.();
        this.unregisterQueue = undefined;
        this.disposeTransientViews();
        this.root.replaceChildren();
    }

    private applyRootProps(): void {
        const { compact, className, style } = this.props;
        this.root.className = compact
            ? className ? `markdown-block compact ${className}` : "markdown-block compact"
            : className ? `markdown-block ${className}` : "markdown-block";

        this.root.style.cssText = "";
        for (const [name, value] of Object.entries(style ?? {})) {
            if (value == null || typeof value === "boolean") continue;
            if (name.startsWith("--")) this.root.style.setProperty(name, String(value));
            else this.root.style.setProperty(stylePropertyName(name), String(value));
        }
    }

    private registerQueue(queue: MarkdownEditor["typedQueue"] | undefined): void {
        this.unregisterQueue?.();
        this.registeredQueue = queue;
        if (!queue) {
            this.unregisterQueue = undefined;
            return;
        }

        this.unregisterQueue = queue.register((request: MarkdownQueueRequest) => {
            if (request.type === "scrollToMatch") {
                const spans = this.root.querySelectorAll<HTMLElement>(".highlighted-text");
                const oldActive = this.root.querySelector(".highlighted-text-active");
                oldActive?.classList.remove("highlighted-text-active");
                if (spans.length > 0 && request.index < spans.length) {
                    const span = spans[request.index];
                    span.classList.add("highlighted-text-active");
                    const renderGeneration = this.renderGeneration;
                    Promise.resolve().then(() => {
                        if (renderGeneration !== this.renderGeneration) return;
                        span.scrollIntoView({ block: "center", behavior: "smooth" });
                    });
                }
                return true;
            }

            if (!request.fragment) return false;
            const target = findAnchorTarget(this.root, request.fragment);
            if (!target) return false;
            target.scrollIntoView({ block: "start", behavior: "auto" });
            return true;
        });
    }

    private onContextMenu(event: MouseEvent): void {
        if (!(event.target instanceof Element)) return;
        const anchor = event.target.closest("a");
        const href = anchor?.getAttribute("href");
        if (!href) return;

        const contextEvent = ContextMenuEvent.fromNativeEvent(event, "markdown-link");
        const isExternal = href.startsWith("http://") || href.startsWith("https://");
        if (!isExternal && !href.startsWith("#")) {
            contextEvent.items.push({
                startGroup: true,
                label: "Open in New Tab",
                icon: OpenFileIcon.createElement(),
                onClick: async () => {
                    const { app } = await import("../../api/app");
                    const { createLinkData } = await import("../../../shared/link-data");
                    await app.events.openRawLink.sendAsync(
                        createLinkData(href, { sourceId: "markdown-link" }),
                    );
                },
            });
        }

        contextEvent.items.push({
            label: "Copy Link",
            icon: CopyIcon.createElement(),
            onClick: () => { void navigator.clipboard.writeText(href); },
        });
        if (isExternal) appendLinkOpenMenuItems(contextEvent.items, href);
    }

    private startWikiRootLookup(): void {
        const filePath = this.props.filePath;
        this.lookupFilePath = filePath;
        const generation = ++this.lookupGeneration;
        if (!filePath || filePath.toLowerCase().startsWith("mneme://")) {
            this.wikiRoot = undefined;
            return;
        }

        this.wikiRoot = undefined;
        void detectGitRoot(filePath)
            .then((root) => {
                if (generation !== this.lookupGeneration) return;
                this.wikiRoot = root;
                this.renderIfNeeded(true);
            })
            .catch((error: unknown) => {
                if (generation !== this.lookupGeneration) return;
                console.error(errMessage(error, "Failed to detect git root"));
            });
    }

    private renderIfNeeded(force = false): void {
        const processedContent = preprocessFencedContainers(preprocessFrontmatter(this.props.content));
        const hasMermaid = processedContent.includes("```mermaid");
        const mermaidLightMode = !themeState.get().isDark;
        const needsRender = force
            || !this.hasRendered
            || processedContent !== this.renderedContent
            || this.props.highlightText !== this.renderedHighlightText
            || this.props.filePath !== this.renderedFilePath
            || this.wikiRoot !== this.renderedWikiRoot
            || (hasMermaid && mermaidLightMode !== this.renderedMermaidLightMode);
        if (!needsRender) return;

        this.renderedContent = processedContent;
        this.renderedHighlightText = this.props.highlightText;
        this.renderedFilePath = this.props.filePath;
        this.renderedWikiRoot = this.wikiRoot;
        this.renderedMermaidLightMode = mermaidLightMode;
        this.renderedHasMermaid = hasMermaid;
        this.hasRendered = true;
        this.renderTree(processedContent, mermaidLightMode);
    }

    private renderTree(content: string, mermaidLightMode: boolean): void {
        this.renderGeneration += 1;
        this.disposeTransientViews();
        this.root.replaceChildren();

        const processor = unified()
            .use(remarkParse)
            .use(remarkGfm)
            .use(remarkRehype, { allowDangerousHtml: true })
            .use(rehypeRaw)
            .use(rehypeMarkdownOverrides, {
                filePath: this.props.filePath,
                wikiRoot: this.wikiRoot,
            })
            .use(rehypeHeadingIds);
        if (this.props.highlightText) {
            processor.use(createRehypeHighlight(this.props.highlightText));
        }

        const tree = processor.runSync(processor.parse(content)) as Root;
        const context = this.createRenderContext(mermaidLightMode);
        try {
            renderHast(this.root, tree, context, mermaidLightMode);
            for (const view of this.transientViews) view.mount();
        } catch (mountError: unknown) {
            this.disposeTransientViews();
            this.root.replaceChildren();
            throw mountError;
        }

        this.updateMatchCount();
    }

    private createRenderContext(mermaidLightMode: boolean): MarkdownRenderContext {
        const context: MarkdownRenderContext = {
            renderNode: (node, namespace = "html") =>
                renderNode(context, node, namespace, mermaidLightMode),
            renderElement: (tagName, properties, children, namespace) => {
                const element = namespace === "svg"
                    ? document.createElementNS("http://www.w3.org/2000/svg", tagName)
                    : document.createElement(tagName);
                applyHastProperties(element, properties, namespace);
                const childrenNamespace = childNamespace(namespace, tagName);
                for (const child of children) {
                    element.append(context.renderNode(child, childrenNamespace));
                }
                return element as HTMLElement | SVGElement;
            },
            applyProperties: (element, properties, namespace) => {
                applyHastProperties(element, properties, namespace);
            },
            toDomProperties,
            track: (view) => {
                claimViewOwnership(view);
                this.transientViews.push(view);
            },
        };
        return context;
    }

    private updateMatchCount(): void {
        const count = this.props.highlightText
            ? this.root.querySelectorAll(".highlighted-text").length
            : 0;
        if (count === this.totalMatches) return;
        this.totalMatches = count;
        this.props.onMatchCountChange?.(count);
    }

    private disposeTransientViews(): void {
        const views = this.transientViews;
        this.transientViews = [];
        for (const view of views) {
            try {
                view.dispose();
            } catch (error: unknown) {
                console.error(errMessage(error, "Failed to dispose markdown view"));
            } finally {
                view.root.remove();
            }
        }
    }
}
