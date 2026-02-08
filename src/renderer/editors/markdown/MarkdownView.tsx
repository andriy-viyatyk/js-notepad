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
const path = require("path");
const url = require("url");

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
        padding: "0 16px",
        overflowY: "auto",
        overflowX: "hidden",
        fontFamily: "Arial",
        fontSize: 15,
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
    "& pre": {
        maxWidth: "100%",
        whiteSpace: "pre-wrap",
        wordWrap: "break-word",
        padding: "8px 16px",
        backgroundColor: color.background.light,
        borderRadius: 4,
        width: "fit-content",
    },
    "& code": {
        display: "inline-block",
        fontFamily: "monospace",
        backgroundColor: color.background.light,
        padding: "2px 4px",
        borderRadius: 4,
    },
    "& img": {
        maxWidth: "100%",
        height: "auto",
    },
    "& a": {
        color: color.misc.blue,
        "& strong": {
            color: color.misc.blue,
        },
    },
    "& h1, & h2": {
        borderBottom: `1px solid ${color.border.default}`,
        marginBlockStart: 0,
        marginBlockEnd: 0,
        paddingBlockStart: "0.67em",
        paddingBlockEnd: "0.3em",
    },
    "& h3, & h4, & h5, & h6": {
        marginBlockStart: 0,
        marginBlockEnd: 0,
        paddingBlockStart: "0.67em",
        paddingBlockEnd: "0.3em",
    },
    "& li": {
        marginBlockStart: 4,
        marginBlockEnd: 4,
        lineHeight: 1.4,
    },
    "& table": {
        borderCollapse: "collapse",
        width: "100%",
        marginTop: "1em",
        marginBottom: "1em",
    },
    "& th, & td": {
        border: `1px solid ${color.border.default}`,
        padding: "8px 12px",
        textAlign: "left",
    },
    "& th": {
        backgroundColor: color.background.light,
        fontWeight: "bold",
    },
    "& blockquote": {
        borderLeft: `4px solid ${color.border.default}`,
        color: color.text.light,
        paddingLeft: 16,
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
        border: "none",
        borderBottom: `1px solid ${color.border.default}`,
        width: "100%",
        marginBlockStart: "0.8em",
        marginBlockEnd: "0.8em",
    },
    "& sup": {
        marginLeft: 3,
    },
    "& p": {
        lineHeight: 1.4,
        marginBottom: "1.25rem",
    },
});

function resolveRelatedLink(currentFilePath?: string, link?: string) {
    if (!currentFilePath || !link) return link || "";

    const lowerLink = link.toLowerCase();
    if (
        lowerLink.startsWith("http://") ||
        lowerLink.startsWith("https://") ||
        lowerLink.startsWith("file://") ||
        lowerLink.startsWith("mailto:") ||
        lowerLink.startsWith("#")
    ) {
        return link;
    }

    try {
        const currentDir = path.dirname(currentFilePath);
        const absolutePath = path.resolve(currentDir, link);
        const fileUrl = url.pathToFileURL(absolutePath).href;
        return fileUrl;
    } catch {
        return link;
    }
}

const getComponents = (filePath: string): Components => ({
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

    const components = useMemo(
        () => getComponents(filePath || ""),
        [filePath],
    );

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

    return (
        <MdViewRoot style={rootStyle} className={showMinimap ? undefined : "show-scrollbar"}>
            <div
                className="md-scroll-container"
                ref={pageModel.setContainer}
                onScroll={pageModel.containerScroll}
            >
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
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
