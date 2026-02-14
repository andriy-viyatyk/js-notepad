import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import styled from "@emotion/styled";
import { TextFileModel } from "../text";
import color from "../../theme/color";
import { CheckedIcon, UncheckedIcon } from "../../theme/icons";
import { useEffect, useMemo } from "react";
import { Minimap } from "../../components/layout/Minimap";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import { PageModel, useEditorConfig } from "../base";
import { pagesModel } from "../../store/pages-store";
import { createRehypeHighlight } from "./rehypeHighlight";
import { CodeBlock, createPreBlock } from "./CodeBlock";
import { isCurrentThemeDark } from "../../theme/themes";
import { appSettings } from "../../store/app-settings";
import { resolveRelatedLink } from "../../core/utils/path-utils";

const MdViewRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "row",
    overflow: "hidden",
    "& .md-scroll-container": {
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        padding: "0 24px",
        overflowY: "auto",
        overflowX: "hidden",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
        fontSize: 16,
        lineHeight: 1.5,
        wordWrap: "break-word",
        "&::-webkit-scrollbar": {
            display: "none",
        },
    },
    // Show scrollbar when minimap is hidden
    "&.show-scrollbar .md-scroll-container::-webkit-scrollbar": {
        display: "block",
        width: 8,
    },
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
        "& .copy-btn": {
            position: "absolute",
            top: -10,
            right: 0,
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
        color: color.misc.blue,
        textDecoration: "none",
        "&:hover": {
            textDecoration: "underline",
        },
        "& strong": {
            color: color.misc.blue,
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

    // Compact mode — reduced font size and spacing for embedded views
    "&.compact .md-scroll-container": {
        fontSize: 15,
        padding: "0 8px",
        lineHeight: 1.25,
    },
    "&.compact h1, &.compact h2, &.compact h3, &.compact h4, &.compact h5, &.compact h6": {
        marginTop: ".4rem",
        marginBottom: ".25rem",
        lineHeight: 1.15,
    },
    "&.compact h1": { fontSize: "1.5em" },
    "&.compact h2": { fontSize: "1.25em" },
    "&.compact h3": { fontSize: "1.1em" },
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

const getComponents = (filePath: string, mermaidLightMode: boolean): Components => ({
    code: CodeBlock as any,
    pre: createPreBlock(mermaidLightMode),
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

export interface MarkdownViewProps {
    model: TextFileModel;
}

const defaultMarkdownViewState = {
    container: null as HTMLDivElement | null,
};

type MarkdownViewState = typeof defaultMarkdownViewState;

class MarkdownViewModel extends TComponentModel<MarkdownViewState, MarkdownViewProps> {
    containerSrollTop = 0;

    setContainer = (el: HTMLDivElement | null) => {
        this.state.update((s) => {
            s.container = el;
        });
    };

    pageFocused = (page?: PageModel) => {
        if (
            page === this.props.model ||
            pagesModel.activePage === this.props.model
        ) {
            Promise.resolve().then(() => {
                const container = this.state.get().container;
                if (container) container.scrollTop = this.containerSrollTop;
            });
        }
    };

    containerScroll = (e: React.UIEvent<HTMLDivElement>) => {
        this.containerSrollTop = e.currentTarget?.scrollTop ?? 0;
    };
}

export function MarkdownView(props: MarkdownViewProps) {
    const { model } = props;
    const editorConfig = useEditorConfig();
    const pageModel = useComponentModel(props, MarkdownViewModel, defaultMarkdownViewState);
    const pageState = pageModel.state.use();
    const { content, filePath } = model.state.use((s) => ({
        content: s.content,
        filePath: s.filePath,
    }));

    // Subscribe to theme changes — only affects mermaid diagram rendering
    const themeId = appSettings.use("theme");
    const mermaidLightMode = !isCurrentThemeDark();
    const hasMermaid = content.includes("```mermaid");

    const components = useMemo(
        () => getComponents(filePath || "", mermaidLightMode),
        [filePath, hasMermaid ? mermaidLightMode : 0],
    );

    // Rehype plugin for external search text highlighting
    const rehypePlugins = useMemo(() => {
        const plugins: any[] = [rehypeRaw];
        if (editorConfig.highlightText) {
            plugins.push(createRehypeHighlight(editorConfig.highlightText));
        }
        return plugins;
    }, [editorConfig.highlightText]);

    useEffect(() => {
        const focusSubscription = pagesModel.onFocus.subscribe(
            pageModel.pageFocused,
        );
        return () => {
            focusSubscription.unsubscribe();
        };
    }, []);

    // Apply max height constraint from context (e.g., when embedded in notebook)
    const rootStyle = editorConfig.maxEditorHeight
        ? { maxHeight: editorConfig.maxEditorHeight }
        : undefined;

    const showMinimap = !editorConfig.hideMinimap;
    const compact = editorConfig.compact;

    return (
        <MdViewRoot style={rootStyle} className={`${showMinimap ? "" : "show-scrollbar"} ${compact ? "compact" : ""}`}>
            <div
                className="md-scroll-container"
                ref={pageModel.setContainer}
                onScroll={pageModel.containerScroll}
            >
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={rehypePlugins}
                    components={components}
                >
                    {content}
                </ReactMarkdown>
            </div>
            {showMinimap && (
                <Minimap
                    scrollContainer={pageState.container}
                    className="md-minimap"
                />
            )}
        </MdViewRoot>
    );
}

const moduleExport = {
    Editor: MarkdownView,
};

export default moduleExport;

// Re-export with old names for backward compatibility
export { MarkdownView as MdView };
export type { MarkdownViewProps as MdViewProps };
