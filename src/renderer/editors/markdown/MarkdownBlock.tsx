import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CheckedIcon, CopyIcon, OpenFileIcon, UncheckedIcon } from "../../theme/icons";
import { appendLinkOpenMenuItems } from "../shared/link-open-menu";
import { ContextMenuEvent } from "../../api/events/events";
import { createRehypeHighlight } from "./rehypeHighlight";
import { rehypeHeadingIds, slugifyHeading } from "./rehypeHeadingIds";
import { CodeBlock, createPreBlock } from "./CodeBlock";
import { MarkdownImage } from "./MarkdownImage";
import { isCurrentThemeDark } from "../../theme/themes";
import { settings } from "../../api/settings";
import { resolveRelatedLink } from "../../core/utils/path-utils";
import { detectGitRoot } from "./detect-git-root";
import "./MarkdownBlock.css";

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
    /** Scroll to a `#fragment` anchor (without the "#"). Returns false when no
     *  matching element exists yet — the caller may retry after a render. */
    scrollToAnchor(fragment: string): boolean;
}

// =============================================================================
// Styled root — all markdown content CSS
// =============================================================================




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
// Anchor resolution (US-901)
// =============================================================================

/**
 * Find the element a `#fragment` refers to, tolerantly. Three passes, in order:
 *
 * 1. exact `id` — the common case, matching the slugs `rehypeHeadingIds` emits;
 * 2. case-insensitive `id` — hand-authored links that don't match the slug's case;
 * 3. slug-of-fragment vs slug-of-heading-text — absorbs the GitHub / Azure DevOps
 *    dialect gap (ADO writes `#rtb.rul.2` where GitHub slugs `rtbrul2`).
 *
 * Scoped to `root`, never `document`: several Markdown views can be mounted at once.
 */
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
    return headings.find((h) => slugifyHeading(h.textContent || "") === slug) ?? null;
}

// =============================================================================
// Components for ReactMarkdown
// =============================================================================

const getComponents = (filePath: string, mermaidLightMode: boolean, wikiRoot?: string): Components => ({
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
            <a href={resolveRelatedLink(filePath, href, wikiRoot)} {...props}>
                {children}
            </a>
        );
    },
    img: ({ node, src, ...props }) => {
        return (
            <MarkdownImage
                src={resolveRelatedLink(filePath, typeof src === "string" ? src : undefined, wikiRoot)}
                {...props}
            />
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

        // Detect the enclosing git repo root once per file path. Leading-slash
        // links (Azure DevOps wiki: attachments + root-relative page links)
        // resolve against it. Async, so links render with the fallback first,
        // then re-render once the root resolves.
        const [wikiRoot, setWikiRoot] = useState<string | undefined>(undefined);
        useEffect(() => {
            if (!filePath || filePath.toLowerCase().startsWith("mneme://")) {
                setWikiRoot(undefined);
                return;
            }
            let cancelled = false;
            detectGitRoot(filePath).then((root) => {
                if (!cancelled) setWikiRoot(root);
            });
            return () => { cancelled = true; };
        }, [filePath]);

        const processedContent = useMemo(
            () => preprocessFencedContainers(preprocessFrontmatter(content)),
            [content],
        );
        const hasMermaid = processedContent.includes("```mermaid");

        const components = useMemo(
            () => getComponents(filePath || "", mermaidLightMode, wikiRoot),
            // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally gate re-render on mermaidLightMode only when content has mermaid (else `0` keeps memo stable across theme flips)
            [filePath, hasMermaid ? mermaidLightMode : 0, wikiRoot],
        );

        // Rehype plugin for search text highlighting
        const rehypePlugins = useMemo(() => {
            // rehypeHeadingIds runs unconditionally — `#fragment` links need heading
            // ids whether or not a search is active (US-901).
            const plugins: unknown[] = [rehypeRaw, rehypeHeadingIds];
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
                    const isExternal = href.startsWith("http://") || href.startsWith("https://");
                    // Same-document `#anchor` links scroll in place — there is no
                    // document to open in a tab. External links get the browser
                    // items below instead. Everything else (file://, mneme://, …)
                    // is a document: offer the tab that Ctrl+click already gives,
                    // for when the other hand isn't free. No pageId on the link
                    // data is what makes the open handler use a new tab rather
                    // than navigating this one.
                    if (!isExternal && !href.startsWith("#")) {
                        ctxEvent.items.push({
                            // Matches the tree/file menus, which group "Open in New Tab" off
                            // from what precedes it. Harmless when ours is the first item —
                            // `MenuModel` drops a leading separator (`&& out.length > 0`) —
                            // and correct when a deeper handler (a code block) got there first.
                            startGroup: true,
                            label: "Open in New Tab",
                            icon: <OpenFileIcon />,
                            onClick: async () => {
                                const { app } = await import("../../api/app");
                                const { createLinkData } = await import("../../../shared/link-data");
                                await app.events.openRawLink.sendAsync(
                                    // No `target`: a new tab picks its editor from the file
                                    // name, so a .md link lands in Preview and a .ts link in
                                    // Monaco. (The in-place navigation in MarkdownBody must
                                    // force "md-view" because an existing page keeps its
                                    // current editor otherwise — a new page has none to keep.)
                                    createLinkData(href, { sourceId: "markdown-link" }),
                                );
                            },
                        });
                    }
                    ctxEvent.items.push({
                        label: "Copy Link",
                        icon: <CopyIcon />,
                        onClick: () => navigator.clipboard.writeText(href),
                    });
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
            scrollToAnchor(fragment: string) {
                const el = rootRef.current;
                if (!el || !fragment) return false;
                const target = findAnchorTarget(el, fragment);
                if (!target) return false;
                // Synchronous and instant, unlike scrollToMatch: an anchor jump is the
                // reader's starting position for a document, not a movement within one.
                // The caller relies on the scroll being complete when this returns so it
                // can record the position (see MarkdownBody's PV4 handling).
                target.scrollIntoView({ block: "start", behavior: "auto" });
                return true;
            },
        }), []);

        const rootClassName = compact
            ? className ? `markdown-block compact ${className}` : "markdown-block compact"
            : className ? `markdown-block ${className}` : "markdown-block";

        return (
            <div
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
            </div>
        );
    },
);
