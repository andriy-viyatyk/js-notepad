import { useCallback, useEffect, useRef } from "react";
import { monacoLanguages } from "../../core/utils/monaco-languages";
import { pagesModel } from "../../api/pages";
import { CopyIcon, OpenLinkIcon } from "../../theme/icons";
import { renderMermaidSvg, svgToDataUrl } from "../mermaid/render-mermaid";
import { ColorizedCode } from "../shared/ColorizedCode";
import { TComponentModel, useComponentModel } from "../../core/state/model";

/** Shape of a hast (rehype/remark) AST node passed in by react-markdown. */
interface HastNode {
    type?: string;
    tagName?: string;
    properties?: Record<string, unknown>;
    children?: HastNode[];
    value?: string;
}

interface CodeBlockProps {
    className?: string;
    children?: React.ReactNode;
    node?: HastNode;
    [key: string]: unknown;
}

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

/** Check if a className contains language-mermaid */
function isMermaidLanguage(className?: string): boolean {
    if (!className) return false;
    const match = className.match(/language-(\S+)/);
    return match?.[1].toLowerCase() === "mermaid";
}

export function CodeBlock({ className, children, node, ...props }: CodeBlockProps) {
    const language = resolveLanguage(className);
    const code = String(children).replace(/\n$/, "");

    if (language) {
        return (
            <ColorizedCode
                code={code}
                language={language}
                className={className}
                {...props}
            />
        );
    }

    return (
        <code className={className} {...props}>
            {children}
        </code>
    );
}

// Copy an <img> element to clipboard as PNG
export async function copyImageToClipboard(img: HTMLImageElement) {
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

// Inline Mermaid diagram renderer for markdown code blocks
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
    setSvgUrl = (svgUrl: string | null) => this.state.update((s) => { s.svgUrl = svgUrl; });
    setError = (error: string) => this.state.update((s) => { s.error = error; });
    setCopied = (copied: boolean) => this.state.update((s) => { s.copied = copied; });
}

function MermaidBlock({ code, lightMode }: MermaidBlockProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const model = useComponentModel({ code, lightMode }, MermaidModel, defaultMermaidState);
    const svgUrl = model.state.use((s) => s.svgUrl);
    const error = model.state.use((s) => s.error);
    const copied = model.state.use((s) => s.copied);

    useEffect(() => {
        let cancelled = false;
        renderMermaidSvg(code, lightMode)
            .then((svg) => {
                if (!cancelled) {
                    model.setSvgUrl(svgToDataUrl(svg, undefined, true));
                    model.setError("");
                }
            })
            .catch((e) => {
                if (!cancelled) {
                    model.setError(e.message || "Failed to render diagram");
                    model.setSvgUrl(null);
                }
            });
        return () => { cancelled = true; };
    }, [code, lightMode, model]);

    const handleCopy = useCallback(() => {
        if (!imgRef.current) return;
        copyImageToClipboard(imgRef.current);
        model.setCopied(true);
        setTimeout(() => model.setCopied(false), 750);
    }, [model]);

    const handleOpen = useCallback(() => {
        pagesModel.addEditorPage("mermaid-view", "mermaid", "Mermaid Diagram", code);
    }, [code]);

    if (error) {
        return <div className="mermaid-error">{error}</div>;
    }

    if (!svgUrl) {
        return <div className="mermaid-diagram mermaid-loading">Rendering...</div>;
    }

    return (
        <div className="mermaid-diagram">
            <img ref={imgRef} src={svgUrl} alt="Mermaid Diagram" />
            <div className="diagram-toolbar">
                <button className="toolbar-btn" onClick={handleOpen} title="Open in Editor">
                    <OpenLinkIcon width={14} height={14} />
                </button>
                <button
                    className={`toolbar-btn ${copied ? "copied" : ""}`}
                    onClick={handleCopy}
                    title="Copy"
                >
                    <CopyIcon width={14} height={14} />
                </button>
            </div>
        </div>
    );
}

// Creates a PreBlock component with the given mermaid light mode.
// Called from MarkdownView to capture the current theme mode via closure.
interface PreBlockProps {
    children?: React.ReactNode;
    node?: HastNode;
    [key: string]: unknown;
}

export function createPreBlock(mermaidLightMode: boolean) {
    return function PreBlock({ children, node, ...props }: PreBlockProps) {
        // Detect mermaid code block from AST node
        const codeNode = node?.children?.[0];
        const codeClassName = codeNode?.properties?.className;
        const isMermaid = Array.isArray(codeClassName)
            ? codeClassName.some((c) => isMermaidLanguage(c as string))
            : isMermaidLanguage(codeClassName as string | undefined);

        if (isMermaid) {
            const code = codeNode?.children
                ?.map((c) => c.value || "")
                .join("")
                .replace(/\n$/, "") || "";
            return <MermaidBlock code={code} lightMode={mermaidLightMode} />;
        }

        return <CodePreBlock {...props}>{children}</CodePreBlock>;
    };
}

interface CodePreState {
    copied: boolean;
}

const defaultCodePreState: CodePreState = { copied: false };

class CodePreModel extends TComponentModel<CodePreState, Record<string, never>> {
    setCopied = (copied: boolean) => this.state.update((s) => { s.copied = copied; });
}

// Code pre block with copy-to-clipboard button
function CodePreBlock({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) {
    const preRef = useRef<HTMLPreElement>(null);
    const model = useComponentModel({}, CodePreModel, defaultCodePreState);
    const copied = model.state.use((s) => s.copied);

    const handleCopy = useCallback(() => {
        const text = preRef.current?.textContent || "";
        navigator.clipboard.writeText(text);
        model.setCopied(true);
        setTimeout(() => model.setCopied(false), 750);
    }, [model]);

    return (
        <div className="code-block-wrapper">
            <pre ref={preRef} {...props}>{children}</pre>
            <button
                className={`copy-btn ${copied ? "copied" : ""}`}
                onClick={handleCopy}
                title="Copy"
            >
                <CopyIcon width={14} height={14} />
            </button>
        </div>
    );
}
