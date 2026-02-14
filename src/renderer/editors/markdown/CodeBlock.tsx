import { useCallback, useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor";
import { monacoLanguages } from "../../core/utils/monaco-languages";
import { CopyIcon } from "../../theme/icons";
import { renderMermaidSvg, svgToDataUrl } from "../mermaid/render-mermaid";

interface CodeBlockProps {
    className?: string;
    children?: React.ReactNode;
    node?: any;
    [key: string]: any;
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
    const [colorizedHtml, setColorizedHtml] = useState<string | null>(null);

    useEffect(() => {
        if (!language) return;

        let cancelled = false;
        monaco.editor.colorize(code, language, { tabSize: 4 }).then((html) => {
            if (!cancelled) {
                setColorizedHtml(html);
            }
        });

        return () => { cancelled = true; };
    }, [code, language]);

    if (language && colorizedHtml) {
        return (
            <code
                className={className}
                dangerouslySetInnerHTML={{ __html: colorizedHtml }}
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
async function copyImageToClipboard(img: HTMLImageElement) {
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
function MermaidBlock({ code, lightMode }: { code: string; lightMode: boolean }) {
    const imgRef = useRef<HTMLImageElement>(null);
    const [svgUrl, setSvgUrl] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;
        renderMermaidSvg(code, lightMode)
            .then((svg) => {
                if (!cancelled) {
                    setSvgUrl(svgToDataUrl(svg, undefined, true));
                    setError("");
                }
            })
            .catch((e) => {
                if (!cancelled) {
                    setError(e.message || "Failed to render diagram");
                    setSvgUrl(null);
                }
            });
        return () => { cancelled = true; };
    }, [code, lightMode]);

    const handleCopy = useCallback(() => {
        if (!imgRef.current) return;
        copyImageToClipboard(imgRef.current);
        setCopied(true);
        setTimeout(() => setCopied(false), 750);
    }, []);

    if (error) {
        return <div className="mermaid-error">{error}</div>;
    }

    if (!svgUrl) {
        return <div className="mermaid-diagram mermaid-loading">Rendering...</div>;
    }

    return (
        <div className="mermaid-diagram">
            <img ref={imgRef} src={svgUrl} alt="Mermaid Diagram" />
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

// Creates a PreBlock component with the given mermaid light mode.
// Called from MarkdownView to capture the current theme mode via closure.
export function createPreBlock(mermaidLightMode: boolean) {
    return function PreBlock({ children, node, ...props }: any) {
        // Detect mermaid code block from AST node
        const codeNode = node?.children?.[0];
        const codeClassName = codeNode?.properties?.className;
        const isMermaid = Array.isArray(codeClassName)
            ? codeClassName.some((c: string) => isMermaidLanguage(c))
            : isMermaidLanguage(codeClassName);

        if (isMermaid) {
            const code = codeNode?.children
                ?.map((c: any) => c.value || "")
                .join("")
                .replace(/\n$/, "") || "";
            return <MermaidBlock code={code} lightMode={mermaidLightMode} />;
        }

        return <CodePreBlock {...props}>{children}</CodePreBlock>;
    };
}

// Code pre block with copy-to-clipboard button
function CodePreBlock({ children, ...props }: any) {
    const preRef = useRef<HTMLPreElement>(null);
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        const text = preRef.current?.textContent || "";
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 750);
    }, []);

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
