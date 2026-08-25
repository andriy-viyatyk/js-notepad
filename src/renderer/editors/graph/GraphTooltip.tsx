import { Fragment, useCallback, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { IconButton } from "../../uikit";
import { GraphNode, getCustomProperties, toNavigableHref } from "./types";
import { pagesModel } from "../../api/pages";
import color from "../../theme/color";
import { getOverlayLayer } from "../../uikit/shared/overlayLayer";

// =============================================================================
// Inline-style constants
// =============================================================================

const rootStyleBase: React.CSSProperties = {
    position: "fixed",
    zIndex: 10,
    pointerEvents: "auto",
    userSelect: "text",
    cursor: "text",
    backgroundColor: color.background.default,
    color: color.graph.labelText,
    border: `1px solid ${color.border.default}`,
    borderRadius: 4,
    padding: "6px 8px",
    fontSize: 12,
    maxWidth: 400,
    boxShadow: `0 2px 8px ${color.shadow.default}`,
    lineHeight: 1.4,
};

const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: 4,
};

const headerContentStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
};

const badgeStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: color.graph.nodeSpecial,
    marginBottom: 2,
};

const titleStyle: React.CSSProperties = {
    fontWeight: 600,
    marginBottom: 2,
};

const idStyle: React.CSSProperties = {
    fontSize: 11,
    opacity: 0.7,
    marginBottom: 4,
};

const propsGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "1px 8px",
    fontSize: 11,
    borderTop: `1px solid ${color.border.default}`,
    paddingTop: 4,
    marginTop: 2,
};

const propKeyStyle: React.CSSProperties = {
    opacity: 0.7,
};

const propValueStyle: React.CSSProperties = {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
};

const linkStyle: React.CSSProperties = {
    color: color.graph.nodeSpecial,
    cursor: "pointer",
    textDecoration: "none",
};

// =============================================================================
// Component
// =============================================================================

interface GraphTooltipProps {
    node: GraphNode;
    x: number;
    y: number;
    /** Whether this node is the root node. */
    isRoot?: boolean;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

const OFFSET = 12;

/** Parse text that may contain markdown links into React elements. */
function renderWithLinks(text: string): React.ReactNode {
    const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = LINK_RE.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        const [, linkText, href] = match;
        parts.push(
            <a
                key={match.index}
                style={linkStyle}
                href={toNavigableHref(href)}
                title={href}
            >
                {linkText}
            </a>,
        );
        lastIndex = match.index + match[0].length;
    }

    if (parts.length === 0) return text;
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return <>{parts}</>;
}

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

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * DOM builders for this tooltip's two local glyphs. They are NOT the registry's `copy` and `check`
 * icons — those are 24/16-viewBox fill-based paths, while these are 12x12 stroke-based outlines —
 * so the registry names would change the rendering. A fresh element per call: a DOM node is
 * single-use, and this pair alternates on the same host as `copied` flips (EPIC-064 E6-6 concern 3).
 */
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

function GraphTooltip({ node, x, y, isRoot, onMouseEnter, onMouseLeave }: GraphTooltipProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number; maxHeight?: number }>({
        left: x + OFFSET, top: y + OFFSET,
    });

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        let left = x + OFFSET;
        let top = y + OFFSET;
        let maxHeight: number | undefined;

        if (left + rect.width > window.innerWidth - OFFSET) {
            left = x - rect.width - OFFSET;
        }

        if (top + rect.height > window.innerHeight - OFFSET) {
            top = y - rect.height - OFFSET;
        }

        if (top < OFFSET) {
            top = OFFSET;
            maxHeight = window.innerHeight - OFFSET * 2;
        } else if (top + rect.height > window.innerHeight - OFFSET) {
            maxHeight = window.innerHeight - top - OFFSET;
        }

        setPos({ left, top, maxHeight });
    }, [x, y]);

    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        const md = buildMarkdown(node, isRoot);
        navigator.clipboard.writeText(md).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [node, isRoot]);

    const handleOpen = useCallback(() => {
        const md = buildMarkdown(node, isRoot);
        const title = node.title || node.id;
        pagesModel.addEditorPage("md-view", "markdown", title, md);
    }, [node, isRoot]);

    const title = node.title || node.id;
    const showId = !!node.title;
    const customProps = getCustomProperties(node);

    const rootStyle: React.CSSProperties = {
        ...rootStyleBase,
        left: pos.left,
        top: pos.top,
        maxHeight: pos.maxHeight,
        overflowY: pos.maxHeight ? "auto" : undefined,
    };

    return ReactDOM.createPortal(
        <div ref={ref} style={rootStyle} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
            <div style={headerStyle}>
                <div style={headerContentStyle}>
                    {isRoot && <div style={badgeStyle}>Root Node</div>}
                    {node.isGroup && <div style={badgeStyle}>Group</div>}
                    <div style={titleStyle}>{renderWithLinks(title)}</div>
                    {showId && <div style={idStyle}>{node.id}</div>}
                </div>
                <IconButton
                    size="sm"
                    icon={copied ? createCheckIconElement() : createCopyIconElement()}
                    onClick={handleCopy}
                    title="Copy as Markdown"
                />
                <IconButton
                    size="sm"
                    icon="open-link"
                    onClick={handleOpen}
                    title="Open in new page"
                />
            </div>
            {customProps.length > 0 && (
                <div style={propsGridStyle}>
                    {customProps.map(([key, value], i) => (
                        <Fragment key={i}>
                            <span style={propKeyStyle}>{key}</span>
                            <span style={propValueStyle} title={value}>{renderWithLinks(value)}</span>
                        </Fragment>
                    ))}
                </div>
            )}
        </div>,
        getOverlayLayer(),
    );
}

export { GraphTooltip };
