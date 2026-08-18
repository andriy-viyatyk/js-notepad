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

/** Copy icon (two overlapping rectangles). */
const CopyIcon = () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5.5" y="5.5" width="9" height="9" rx="1" />
        <path d="M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1" />
    </svg>
);

/** Check icon (shown briefly after copy). */
const CheckIcon = () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 8 7 12 13 4" />
    </svg>
);

/** Open/launch icon (matches OpenLinkIcon from the Links editor). */
const OpenIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24">
        <path d="M14 4l6 5-6 5V10c-5 0-9 2-11 7 1-7 5-11 11-12V4z" fill="currentColor" />
    </svg>
);

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
                    icon={copied ? <CheckIcon /> : <CopyIcon />}
                    onClick={handleCopy}
                    title="Copy as Markdown"
                />
                <IconButton
                    size="sm"
                    icon={<OpenIcon />}
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
