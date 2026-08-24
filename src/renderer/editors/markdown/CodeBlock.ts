import { createComponentModelDriver, TComponentModel, type ComponentModelDriver } from "../../core/state/model";
import { monacoLanguages } from "../../core/utils/monaco-languages";
import { pagesModel } from "../../api/pages";
import { CopyIcon, OpenLinkIcon } from "../../theme/icons";
import { renderMermaidSvg, svgToDataUrl } from "../mermaid/render-mermaid";
import { ColorizedCodeView, type ColorizedCodeProps } from "../shared/ColorizedCodeView";
import { errMessage } from "../../../shared/utils";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { hastText } from "./hast-dom";
import type { Element } from "hast";
import type { MarkdownRenderContext } from "./MarkdownBlockView";

// Build reverse lookup: alias/id (lowercase) → Monaco language ID
// e.g., "ts" → "typescript", "js" → "javascript", "py" → "python", "bash" → "shell"
const languageAliasMap = new Map<string, string>();
for (const lang of monacoLanguages) {
    languageAliasMap.set(lang.id.toLowerCase(), lang.id);
    for (const alias of lang.aliases) {
        languageAliasMap.set(alias.toLowerCase(), lang.id);
    }
}
// Extra markdown-common aliases not in Monaco's list
languageAliasMap.set("bash", "shell");
languageAliasMap.set("dockerfile", "dockerfile");
languageAliasMap.set("jsonc", "json");
languageAliasMap.set("tsx", "typescript");
languageAliasMap.set("jsx", "javascript");

function resolveLanguage(className?: string): string | undefined {
    if (!className) return undefined;
    const match = className.match(/language-(\S+)/);
    if (!match) return undefined;
    return languageAliasMap.get(match[1].toLowerCase());
}

/** Check if a className contains language-mermaid. */
function isMermaidLanguage(className?: string): boolean {
    if (!className) return false;
    const match = className.match(/language-(\S+)/);
    return match?.[1].toLowerCase() === "mermaid";
}

function classNameValue(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join(" ");
    return undefined;
}

function codeClassName(node: Element): string | undefined {
    return classNameValue(node.properties?.className);
}

function codeNodeText(node: Element | undefined): string {
    return node ? hastText(node).replace(/\n$/, "") : "";
}

export function createCodeBlockNode(
    node: Element,
    context: MarkdownRenderContext,
): Node {
    const properties = context.toDomProperties(node.properties, "html");
    const language = resolveLanguage(classNameValue(properties.className));
    if (!language) {
        return context.renderElement("code", node.properties, node.children, "html");
    }

    const view = new ColorizedCodeView({
        ...properties,
        code: codeNodeText(node),
        language,
    } as ColorizedCodeProps);
    context.track(view);
    return view.root;
}

// Copy an <img> element to clipboard as PNG
export async function copyImageToClipboard(img: HTMLImageElement): Promise<void> {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
    );
    if (!blob) return;
    await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
    ]);
}

interface MermaidBlockProps {
    code: string;
    lightMode: boolean;
}

interface MermaidState {
    svgUrl: string | null;
    error: string;
    copied: boolean;
}

const defaultMermaidState: MermaidState = { svgUrl: null, error: "", copied: false };

class MermaidModel extends TComponentModel<MermaidState, MermaidBlockProps> {
    private renderGeneration = 0;
    private started = false;

    setSvgUrl = (svgUrl: string | null): void => this.state.update((s) => { s.svgUrl = svgUrl; });
    setError = (error: string): void => this.state.update((s) => { s.error = error; });
    setCopied = (copied: boolean): void => this.state.update((s) => { s.copied = copied; });

    setProps = (props: MermaidBlockProps): void => {
        if (this.started) this.render(props);
    };

    start = (): void => {
        this.started = true;
        this.render(this.props);
    };

    private render(props: MermaidBlockProps): void {
        const generation = ++this.renderGeneration;
        this.setSvgUrl(null);
        this.setError("");
        queueMicrotask(() => {
            if (!this.isLive || generation !== this.renderGeneration) return;
            void renderMermaidSvg(props.code, props.lightMode)
                .then((svg) => {
                    if (!this.isLive || generation !== this.renderGeneration) return;
                    this.setSvgUrl(svgToDataUrl(svg, undefined, true));
                })
                .catch((error: unknown) => {
                    if (!this.isLive || generation !== this.renderGeneration) return;
                    this.setError(errMessage(error, "Failed to render diagram"));
                    this.setSvgUrl(null);
                });
        });
    };

    dispose = (): void => {
        this.renderGeneration += 1;
    };
}

type MermaidMode = "error" | "loading" | "diagram";

export class MermaidBlockView extends VanillaView<MermaidBlockProps> {
    private readonly driver: ComponentModelDriver<MermaidState, MermaidBlockProps, MermaidModel>;
    private image: HTMLImageElement | undefined;
    private copyButton: HTMLButtonElement | undefined;
    private copiedTimer: ReturnType<typeof setTimeout> | undefined;
    private mode: MermaidMode | undefined;

    public constructor(props: MermaidBlockProps) {
        super(props, document.createElement("div"));
        this.driver = createComponentModelDriver(props, MermaidModel, defaultMermaidState);
    }

    protected onMount(): void {
        this.driver.mount();
        this.driver.model.start();
        this.bind(this.driver.model.state, (state) => state, (state) => this.applyState(state));
    }

    protected onUpdate(props: MermaidBlockProps): void {
        this.driver.update(props);
    }

    protected onDispose(): void {
        if (this.copiedTimer !== undefined) clearTimeout(this.copiedTimer);
        this.driver.dispose();
    }

    private applyState(state: MermaidState): void {
        if (state.error) {
            if (this.mode === "error") {
                this.root.textContent = state.error;
                return;
            }
            this.mode = "error";
            this.image = undefined;
            this.copyButton = undefined;
            this.root.className = "mermaid-error";
            this.root.textContent = state.error;
            return;
        }

        if (!state.svgUrl) {
            if (this.mode === "loading") return;
            this.mode = "loading";
            this.image = undefined;
            this.copyButton = undefined;
            this.root.className = "mermaid-diagram mermaid-loading";
            this.root.textContent = "Rendering...";
            return;
        }

        if (this.mode !== "diagram") {
            this.mode = "diagram";
            this.root.className = "mermaid-diagram";
            this.root.replaceChildren();

            const image = document.createElement("img");
            image.alt = "Mermaid Diagram";
            const toolbar = document.createElement("div");
            toolbar.className = "diagram-toolbar";

            const openButton = document.createElement("button");
            openButton.className = "toolbar-btn";
            openButton.title = "Open in Editor";
            const openIcon = OpenLinkIcon.createElement?.({ width: 14, height: 14 });
            if (openIcon) openButton.append(openIcon);
            this.listen(openButton, "click", () => {
                pagesModel.addEditorPage("mermaid-view", "mermaid", "Mermaid Diagram", this.props.code);
            });

            const copyButton = document.createElement("button");
            copyButton.className = "toolbar-btn";
            copyButton.title = "Copy";
            const copyIcon = CopyIcon.createElement?.({ width: 14, height: 14 });
            if (copyIcon) copyButton.append(copyIcon);
            this.listen(copyButton, "click", () => {
                if (!this.image) return;
                void copyImageToClipboard(this.image);
                this.driver.model.setCopied(true);
                if (this.copiedTimer !== undefined) clearTimeout(this.copiedTimer);
                this.copiedTimer = setTimeout(() => this.driver.model.setCopied(false), 750);
            });

            toolbar.append(openButton, copyButton);
            this.root.append(image, toolbar);
            this.image = image;
            this.copyButton = copyButton;
        }

        if (this.image && this.image.src !== state.svgUrl) this.image.src = state.svgUrl;
        this.copyButton?.classList.toggle("copied", state.copied);
    }
}

interface CodePreBlockProps {
    node: Element;
    context: MarkdownRenderContext;
}

interface CodePreState {
    copied: boolean;
}

const defaultCodePreState: CodePreState = { copied: false };

class CodePreModel extends TComponentModel<CodePreState, Record<string, never>> {
    setCopied = (copied: boolean): void => this.state.update((s) => { s.copied = copied; });
}

/** Fenced code wrapper with the existing copy-to-clipboard affordance. */
class CodePreBlockView extends VanillaView<CodePreBlockProps> {
    private readonly driver: ComponentModelDriver<CodePreState, Record<string, never>, CodePreModel>;
    private readonly pre: HTMLPreElement;
    private readonly copyButton: HTMLButtonElement;
    private copiedTimer: ReturnType<typeof setTimeout> | undefined;

    public constructor(props: CodePreBlockProps) {
        const root = document.createElement("div");
        root.className = "code-block-wrapper";
        const pre = document.createElement("pre");
        props.context.applyProperties(pre, props.node.properties, "html");
        const codeNode = props.node.children.find((child): child is Element => child.type === "element");
        if (codeNode) pre.append(props.context.renderNode(codeNode, "html"));
        const copyButton = document.createElement("button");
        copyButton.className = "copy-btn";
        copyButton.title = "Copy";
        const copyIcon = CopyIcon.createElement?.({ width: 14, height: 14 });
        if (copyIcon) copyButton.append(copyIcon);
        root.append(pre, copyButton);
        super(props, root);
        this.pre = pre;
        this.copyButton = copyButton;
        this.driver = createComponentModelDriver({}, CodePreModel, defaultCodePreState);
    }

    protected onMount(): void {
        this.driver.mount();
        this.bind(this.driver.model.state, (state) => state.copied, (copied) => {
            this.copyButton.classList.toggle("copied", copied);
        });
        this.listen(this.copyButton, "click", () => {
            void navigator.clipboard.writeText(this.pre.textContent || "");
            this.driver.model.setCopied(true);
            if (this.copiedTimer !== undefined) clearTimeout(this.copiedTimer);
            this.copiedTimer = setTimeout(() => this.driver.model.setCopied(false), 750);
        });
    }

    protected onDispose(): void {
        if (this.copiedTimer !== undefined) clearTimeout(this.copiedTimer);
        this.driver.dispose();
    }
}

export function createPreBlockNode(
    node: Element,
    mermaidLightMode: boolean,
    context: MarkdownRenderContext,
): Node {
    const codeNode = node.children.find((child): child is Element => child.type === "element");
    const className = codeClassName(codeNode ?? node);
    if (isMermaidLanguage(className)) {
        const view = new MermaidBlockView({
            code: codeNodeText(codeNode),
            lightMode: mermaidLightMode,
        });
        context.track(view);
        return view.root;
    }

    const view = new CodePreBlockView({ node, context });
    context.track(view);
    return view.root;
}
