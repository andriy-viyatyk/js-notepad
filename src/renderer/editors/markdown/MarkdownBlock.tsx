import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import styled from "@emotion/styled";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import color from "../../theme/color";
import { CheckedIcon, CopyIcon, UncheckedIcon } from "../../theme/icons";
import { appendLinkOpenMenuItems } from "../shared/link-open-menu";
import { ContextMenuEvent } from "../../api/events/events";
import { createRehypeHighlight } from "./rehypeHighlight";
import { CodeBlock, createPreBlock } from "./CodeBlock";
import { isCurrentThemeDark } from "../../theme/themes";
import { settings } from "../../api/settings";
import { resolveRelatedLink } from "../../core/utils/path-utils";

// =============================================================================
// Types
// =============================================================================

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
    style?: React.CSSProperties;
    /** Called when the number of search highlight matches changes. */
    onMatchCountChange?: (count: number) => void;
}

export interface MarkdownBlockHandle {
    /** The root DOM element. */
    readonly container: HTMLDivElement | null;
    /** Number of search highlight matches. */
    readonly totalMatches: number;
    /** Scroll to and highlight the Nth match (0-based). */
    scrollToMatch(index: number): void;
}

// =============================================================================
// Styled root — all markdown content CSS
// =============================================================================

const MarkdownBlockRoot = styled.div({
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
    fontSize: 16,
    lineHeight: 1.5,
    wordWrap: "break-word",
    "& > *": {
        maxWidth: "100%",
        wordWrap: "break-word",
        overflowWrap: "break-word",
    },

    // Code block wrapper (from PreBlock component)
    "& .code-block-wrapper": {
        position: "relative",
        width: "fit-content",
        maxWidth: "100%",
        "& .copy-btn": {
            position: "absolute",
            top: 6,
            right: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            color: color.text.light,
            backgroundColor: color.background.light,
            border: `1px solid ${color.border.default}`,
            borderRadius: 4,
            cursor: "pointer",
            opacity: 0,
            transition: "opacity 0.2s ease",
            "& svg": {
                transition: "transform 0.15s ease-out",
            },
            "&:hover": {
                opacity: 1,
            },
            "&.copied svg": {
                transform: "scale(0.65)",
                transition: "transform 0.1s ease-in",
            },
            "&.copied": {
                opacity: 1,
            },
        },
        "&:hover .copy-btn": {
            opacity: 0.5,
        },
        "&:hover .copy-btn:hover": {
            opacity: 1,
        },
        "&:hover .copy-btn.copied": {
            opacity: 1,
        },
    },

    // Mermaid diagrams rendered from ```mermaid code blocks
    "& .mermaid-diagram": {
        position: "relative",
        margin: "1em 0",
        textAlign: "center",
        "& img": {
            maxWidth: "100%",
            height: "auto",
        },
        "& .diagram-toolbar": {
            position: "absolute",
            top: -10,
            right: 0,
            display: "flex",
            gap: 4,
            opacity: 0,
            transition: "opacity 0.2s ease",
        },
        "& .toolbar-btn": {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            color: color.text.light,
            backgroundColor: color.background.light,
            border: `1px solid ${color.border.default}`,
            borderRadius: 4,
            cursor: "pointer",
            "& svg": {
                transition: "transform 0.15s ease-out",
            },
            "&:hover": {
                color: color.text.default,
            },
            "&.copied svg": {
                transform: "scale(0.65)",
                transition: "transform 0.1s ease-in",
            },
        },
        "&:hover .diagram-toolbar": {
            opacity: 0.5,
        },
        "&:hover .diagram-toolbar:hover": {
            opacity: 1,
        },
    },
    "& .mermaid-diagram.mermaid-loading": {
        padding: "2em",
        color: color.text.light,
        fontSize: 13,
    },
    "& .mermaid-error": {
        margin: "1em 0",
        padding: "1em",
        backgroundColor: color.background.dark,
        borderRadius: 6,
        color: color.misc.red,
        fontSize: 13,
    },

    // Code blocks
    "& pre": {
        maxWidth: "100%",
        whiteSpace: "pre-wrap",
        wordWrap: "break-word",
        padding: 16,
        backgroundColor: color.background.dark,
        borderRadius: 6,
        fontSize: "85%",
        lineHeight: 1.45,
        width: "fit-content",
    },
    // Code inside pre — reset inline code styles
    "& pre code": {
        display: "inline",
        padding: 0,
        backgroundColor: "transparent",
        borderRadius: 0,
        fontSize: "inherit",
    },
    // Inline code
    "& code": {
        display: "inline-block",
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        backgroundColor: color.background.light,
        padding: ".2em .4em",
        borderRadius: 6,
        fontSize: "85%",
    },
    "& img": {
        maxWidth: "100%",
        height: "auto",
        boxSizing: "content-box",
    },
    "& a": {
        color: color.misc.link,
        textDecoration: "none",
        "&:hover": {
            textDecoration: "underline",
        },
        "& strong": {
            color: color.misc.link,
        },
    },

    // Headings
    "& h1, & h2, & h3, & h4, & h5, & h6": {
        marginTop: "1.5rem",
        marginBottom: "1rem",
        fontWeight: 600,
        lineHeight: 1.25,
    },
    "& h1": {
        paddingBottom: ".3em",
        fontSize: "2em",
        borderBottom: `1px solid ${color.border.default}`,
    },
    "& h2": {
        paddingBottom: ".3em",
        fontSize: "1.5em",
        borderBottom: `1px solid ${color.border.default}`,
    },
    "& h3": {
        fontSize: "1.25em",
    },
    "& h4": {
        fontSize: "1em",
    },
    "& h5": {
        fontSize: ".875em",
    },
    "& h6": {
        fontSize: ".85em",
        color: color.text.light,
    },

    // Lists
    "& ul, & ol": {
        paddingLeft: "2em",
    },
    "& li + li": {
        marginTop: ".25em",
    },
    "& li": {
        lineHeight: 1.5,
    },
    // Nested list styles
    "& ol ol, & ul ol": {
        listStyleType: "lower-roman",
    },
    "& ul ul ol, & ul ol ol, & ol ul ol, & ol ol ol": {
        listStyleType: "lower-alpha",
    },

    // Tables
    "& table": {
        borderSpacing: 0,
        borderCollapse: "collapse",
        width: "max-content",
        maxWidth: "100%",
        overflow: "auto",
        marginTop: "1em",
        marginBottom: "1em",
    },
    "& th, & td": {
        border: `1px solid ${color.border.default}`,
        padding: "6px 13px",
        textAlign: "left",
    },
    "& th": {
        fontWeight: 600,
    },
    "& tr": {
        borderTop: `1px solid ${color.border.default}`,
    },
    "& tr:nth-of-type(2n)": {
        backgroundColor: color.background.dark,
    },

    "& blockquote": {
        margin: 0,
        borderLeft: `.25em solid ${color.border.default}`,
        color: color.text.light,
        padding: "0 1em",
    },
    "& b, & strong": {
        color: color.text.strong,
    },
    "& .task-list-item": {
        display: "flex",
        alignItems: "center",
        "& svg": {
            flexShrink: 0,
            marginRight: 6,
        },
    },
    "& hr": {
        height: ".25em",
        padding: 0,
        margin: "1.5rem 0",
        backgroundColor: color.border.default,
        border: 0,
    },
    "& sup": {
        marginLeft: 3,
    },
    "& p": {
        marginTop: 0,
        marginBottom: 10,
        lineHeight: 1.5,
    },

    // Compact mode — reduced font size and spacing
    "&.compact": {
        fontSize: 14,
        lineHeight: 1.2,
    },
    "&.compact h1, &.compact h2, &.compact h3, &.compact h4, &.compact h5, &.compact h6": {
        marginTop: ".4rem",
        marginBottom: ".25rem",
        lineHeight: 1.1,
    },
    "&.compact h1": { fontSize: "1.4em" },
    "&.compact h2": { fontSize: "1.2em" },
    "&.compact h3": { fontSize: "1.05em" },
    "&.compact pre": {
        padding: "6px 10px",
        lineHeight: 1.3,
    },
    "&.compact th, &.compact td": {
        padding: "3px 6px",
    },
    "&.compact hr": {
        margin: ".4rem 0",
    },
    "&.compact p": {
        marginBottom: 3,
        lineHeight: 1.25,
    },
    "&.compact li": {
        lineHeight: 1.25,
    },
    "&.compact li + li": {
        marginTop: ".1em",
    },
    "&.compact ul, &.compact ol": {
        marginTop: 2,
        marginBottom: 2,
    },
    "&.compact blockquote": {
        padding: "0 .75em",
    },
});

// =============================================================================
// Azure DevOps wiki container syntax → standard fenced code block
// =============================================================================

// Rewrite `::: mermaid ... :::` fenced containers (Azure DevOps wiki, Pandoc
// fenced divs) into ```mermaid``` fences so the existing mermaid renderer
// picks them up. Only the `mermaid` container is converted — other names
// are left as-is.
const MERMAID_CONTAINER_RE = /^:::[ \t]+mermaid[ \t]*\r?\n([\s\S]*?)\r?\n:::[ \t]*(?=\r?\n|$)/gm;

function preprocessFencedContainers(content: string): string {
    if (!content.includes(":::")) return content;
    return content.replace(MERMAID_CONTAINER_RE, (_, body) => `\`\`\`mermaid\n${body}\n\`\`\``);
}

// =============================================================================
// YAML frontmatter → ```yaml``` code block
// =============================================================================

// A leading `---\n…\n---` (or `…\n...`) block is YAML frontmatter. CommonMark
// renders it as broken thematic-break + paragraph noise, so rewrite it into a
// ```yaml``` fence — the existing CodeBlock/ColorizedCode path highlights it.
// Only matches at the very document start (optional BOM allowed, no leading
// blank lines). Render-only: the file on disk is never touched.
const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/;

function preprocessFrontmatter(content: string): string {
    // Strip an optional leading BOM so `^---` can anchor at the document start;
    // re-prepend it (sliced from the source) only if a rewrite actually happened.
    const hasBom = content.charCodeAt(0) === 0xfeff;
    const body = hasBom ? content.slice(1) : content;
    if (body.charCodeAt(0) !== 0x2d /* - */) return content; // fast bail: no leading `---`
    const rewritten = body.replace(FRONTMATTER_RE, (match, yaml) => {
        if (!yaml.trim()) return match; // empty frontmatter — leave as-is, don't emit a stray block
        return `\`\`\`yaml\n${yaml}\n\`\`\``;
    });
    return rewritten === body ? content : (hasBom ? content[0] + rewritten : rewritten);
}

// =============================================================================
// Components for ReactMarkdown
// =============================================================================

const getComponents = (filePath: string, mermaidLightMode: boolean): Components => ({
    code: CodeBlock as Components["code"],
    pre: createPreBlock(mermaidLightMode) as Components["pre"],
    input: ({ node, ...props }) => {
        if (props.type === "checkbox") {
            return props.checked ? (
                <CheckedIcon width={14} height={14} />
            ) : (
                <UncheckedIcon width={14} height={14} />
            );
        }
        return <input {...props} />;
    },
    a: ({ node, href, children, ...props }) => {
        return (
            <a href={resolveRelatedLink(filePath, href)} {...props}>
                {children}
            </a>
        );
    },
});

// =============================================================================
// MarkdownBlock component
// =============================================================================

export const MarkdownBlock = forwardRef<MarkdownBlockHandle, MarkdownBlockProps>(
    function MarkdownBlock(props, ref) {
        const { content, highlightText, compact, filePath, className, style, onMatchCountChange } = props;
        const rootRef = useRef<HTMLDivElement>(null);
        const totalMatchesRef = useRef(0);

        // Subscribe to theme changes — only affects mermaid diagram rendering
        settings.use("theme");
        const mermaidLightMode = !isCurrentThemeDark();

        const processedContent = useMemo(
            () => preprocessFencedContainers(preprocessFrontmatter(content)),
            [content],
        );
        const hasMermaid = processedContent.includes("```mermaid");

        const components = useMemo(
            () => getComponents(filePath || "", mermaidLightMode),
            // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally gate re-render on mermaidLightMode only when content has mermaid (else `0` keeps memo stable across theme flips)
            [filePath, hasMermaid ? mermaidLightMode : 0],
        );

        // Rehype plugin for search text highlighting
        const rehypePlugins = useMemo(() => {
            const plugins: unknown[] = [rehypeRaw];
            if (highlightText) {
                plugins.push(createRehypeHighlight(highlightText));
            }
            return plugins as Parameters<typeof ReactMarkdown>[0]["rehypePlugins"];
        }, [highlightText]);

        // Context menu for links — copy link, open external
        const onContextMenu = useCallback((e: React.MouseEvent) => {
            const anchor = (e.target as HTMLElement).closest("a");
            if (anchor) {
                const href = anchor.getAttribute("href");
                if (href) {
                    const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "markdown-link");
                    ctxEvent.items.push({
                        label: "Copy Link",
                        icon: <CopyIcon />,
                        onClick: () => navigator.clipboard.writeText(href),
                    });
                    const isExternal = href.startsWith("http://") || href.startsWith("https://");
                    if (isExternal) {
                        appendLinkOpenMenuItems(ctxEvent.items, href);
                    }
                }
            }
        }, []);

        // Count search matches after render and notify parent
        useEffect(() => {
            const el = rootRef.current;
            if (!el || !highlightText) {
                if (totalMatchesRef.current !== 0) {
                    totalMatchesRef.current = 0;
                    onMatchCountChange?.(0);
                }
                return;
            }
            const spans = el.querySelectorAll(".highlighted-text");
            const count = spans.length;
            if (count !== totalMatchesRef.current) {
                totalMatchesRef.current = count;
                onMatchCountChange?.(count);
            }
        });

        // Expose imperative handle
        useImperativeHandle(ref, () => ({
            get container() { return rootRef.current; },
            get totalMatches() { return totalMatchesRef.current; },
            scrollToMatch(index: number) {
                const el = rootRef.current;
                if (!el) return;
                // Remove old active class
                const oldActive = el.querySelector(".highlighted-text-active");
                if (oldActive) oldActive.classList.remove("highlighted-text-active");
                // Apply to target
                const spans = el.querySelectorAll(".highlighted-text");
                if (spans.length > 0 && index < spans.length) {
                    spans[index].classList.add("highlighted-text-active");
                    // Use microtask so the DOM class is applied first
                    Promise.resolve().then(() => {
                        spans[index]?.scrollIntoView({ block: "center", behavior: "smooth" });
                    });
                }
            },
        }), []);

        const rootClassName = compact
            ? className ? `compact ${className}` : "compact"
            : className || undefined;

        return (
            <MarkdownBlockRoot
                ref={rootRef}
                className={rootClassName}
                style={style}
                onContextMenu={onContextMenu}
            >
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={rehypePlugins}
                    components={components}
                    urlTransform={(url) => {
                        try { return decodeURIComponent(url); } catch { return url; }
                    }}
                >
                    {processedContent}
                </ReactMarkdown>
            </MarkdownBlockRoot>
        );
    },
);
