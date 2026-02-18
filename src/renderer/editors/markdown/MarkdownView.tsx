import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import styled from "@emotion/styled";
import { TextFileModel } from "../text";
import color from "../../theme/color";
import { CheckedIcon, CompactViewIcon, CopyIcon, NormalViewIcon, UncheckedIcon } from "../../theme/icons";
import { useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Minimap } from "../../components/layout/Minimap";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import { PageModel, useEditorConfig } from "../base";
import { pagesModel } from "../../store/pages-store";
import { createRehypeHighlight } from "./rehypeHighlight";
import { CodeBlock, createPreBlock } from "./CodeBlock";
import { isCurrentThemeDark } from "../../theme/themes";
import { appSettings } from "../../store/app-settings";
import { resolveRelatedLink } from "../../core/utils/path-utils";
import { Button } from "../../components/basic/Button";
import { MarkdownSearchBar } from "./MarkdownSearchBar";

const MdViewRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "row",
    overflow: "hidden",
    outline: "none",
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
        fontSize: 14,
        padding: "0 8px",
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
    compactMode: false,
    searchVisible: false,
    searchText: "",
    currentMatchIndex: 0,
    totalMatches: 0,
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

    toggleCompact = () => {
        this.state.update((s) => {
            s.compactMode = !s.compactMode;
        });
    };

    // --- Search ---

    openSearch = () => {
        this.state.update((s) => {
            s.searchVisible = true;
        });
    };

    closeSearch = () => {
        this.state.update((s) => {
            s.searchVisible = false;
            s.searchText = "";
            s.currentMatchIndex = 0;
            s.totalMatches = 0;
        });
        this.clearActiveMatchClass();
    };

    setSearchText = (text: string) => {
        this.state.update((s) => {
            s.searchText = text;
            s.currentMatchIndex = 0;
        });
    };

    nextMatch = () => {
        const { totalMatches, currentMatchIndex } = this.state.get();
        if (totalMatches === 0) return;
        const newIndex = (currentMatchIndex + 1) % totalMatches;
        this.state.update((s) => {
            s.currentMatchIndex = newIndex;
        });
        this.navigateToMatch(newIndex);
    };

    prevMatch = () => {
        const { totalMatches, currentMatchIndex } = this.state.get();
        if (totalMatches === 0) return;
        const newIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches;
        this.state.update((s) => {
            s.currentMatchIndex = newIndex;
        });
        this.navigateToMatch(newIndex);
    };

    private navigateToMatch(index: number) {
        const container = this.state.get().container;
        if (!container) return;
        const spans = container.querySelectorAll(".highlighted-text");
        this.applyActiveMatchClass(spans, index);
        this.scrollToActiveMatch();
    }

    /** Called after render to update match count and highlight the active match */
    updateMatchNavigation = () => {
        const { container, searchText, searchVisible } = this.state.get();
        if (!container || !searchText || !searchVisible) {
            if (this.state.get().totalMatches !== 0) {
                this.state.update((s) => { s.totalMatches = 0; });
            }
            return;
        }

        const spans = container.querySelectorAll(".highlighted-text");
        const total = spans.length;
        const { totalMatches, currentMatchIndex } = this.state.get();

        // Clamp index if matches changed
        let index = currentMatchIndex;
        if (total > 0 && index >= total) {
            index = 0;
        }

        if (total !== totalMatches || index !== currentMatchIndex) {
            this.state.update((s) => {
                s.totalMatches = total;
                s.currentMatchIndex = index;
            });
        }

        this.applyActiveMatchClass(spans, index);
        if (total > 0) {
            this.scrollToActiveMatch();
        }
    };

    private clearActiveMatchClass() {
        const container = this.state.get().container;
        if (!container) return;
        const active = container.querySelector(".highlighted-text-active");
        if (active) active.classList.remove("highlighted-text-active");
    }

    private applyActiveMatchClass(spans: NodeListOf<Element>, index: number) {
        // Remove old active class
        const container = this.state.get().container;
        if (!container) return;
        const oldActive = container.querySelector(".highlighted-text-active");
        if (oldActive) oldActive.classList.remove("highlighted-text-active");

        // Apply to current
        if (spans.length > 0 && index < spans.length) {
            spans[index].classList.add("highlighted-text-active");
        }
    }

    private scrollToActiveMatch() {
        // Use microtask so the DOM class is applied first
        Promise.resolve().then(() => {
            const container = this.state.get().container;
            if (!container) return;
            const active = container.querySelector(".highlighted-text-active");
            if (active) {
                active.scrollIntoView({ block: "center", behavior: "smooth" });
            }
        });
    }
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

    // Determine effective highlight text: own search takes priority, then external
    const highlightText = pageState.searchVisible && pageState.searchText
        ? pageState.searchText
        : editorConfig.highlightText || "";

    // Rehype plugin for search text highlighting
    const rehypePlugins = useMemo(() => {
        const plugins: any[] = [rehypeRaw];
        if (highlightText) {
            plugins.push(createRehypeHighlight(highlightText));
        }
        return plugins;
    }, [highlightText]);

    // Update match navigation after content renders with highlights
    useEffect(() => {
        if (pageState.searchVisible && pageState.searchText) {
            // Defer to after React renders the highlighted spans
            const timer = setTimeout(() => pageModel.updateMatchNavigation(), 0);
            return () => clearTimeout(timer);
        }
    }, [pageState.searchText, pageState.searchVisible, content]);

    useEffect(() => {
        const focusSubscription = pagesModel.onFocus.subscribe(
            pageModel.pageFocused,
        );
        return () => {
            focusSubscription.unsubscribe();
        };
    }, []);

    // Keyboard handler for search shortcuts
    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            pageModel.openSearch();
        } else if (e.key === "Escape" && pageState.searchVisible) {
            e.preventDefault();
            pageModel.closeSearch();
        } else if (e.key === "F3" && e.shiftKey) {
            e.preventDefault();
            pageModel.prevMatch();
        } else if (e.key === "F3") {
            e.preventDefault();
            pageModel.nextMatch();
        }
    }, [pageState.searchVisible]);

    const onContextMenu = useCallback((e: React.MouseEvent) => {
        const anchor = (e.target as HTMLElement).closest("a");
        if (anchor) {
            const href = anchor.getAttribute("href");
            if (href) {
                if (!e.nativeEvent.menuItems) {
                    e.nativeEvent.menuItems = [];
                }
                e.nativeEvent.menuItems.push({
                    label: "Copy Link",
                    icon: <CopyIcon />,
                    onClick: () => navigator.clipboard.writeText(href),
                });
            }
        }
    }, []);

    // Apply max height constraint from context (e.g., when embedded in notebook)
    const rootStyle = editorConfig.maxEditorHeight
        ? { maxHeight: editorConfig.maxEditorHeight }
        : undefined;

    const showMinimap = !editorConfig.hideMinimap;
    const compact = editorConfig.compact || pageState.compactMode;

    // Only show own search bar when not embedded with external highlight
    const showSearchBar = pageState.searchVisible && !editorConfig.highlightText;

    return (
        <>
            {Boolean(model.editorToolbarRefLast) &&
                createPortal(
                    <Button
                        size="small"
                        type="icon"
                        title={pageState.compactMode ? "Normal View" : "Compact View"}
                        onClick={pageModel.toggleCompact}
                    >
                        {pageState.compactMode ? <NormalViewIcon /> : <CompactViewIcon />}
                    </Button>,
                    model.editorToolbarRefLast,
                )}
            <MdViewRoot
                style={rootStyle}
                className={`${showMinimap ? "" : "show-scrollbar"} ${compact ? "compact" : ""}`}
                onKeyDown={onKeyDown}
                onContextMenu={onContextMenu}
                tabIndex={-1}
            >
                {showSearchBar && (
                    <MarkdownSearchBar
                        searchText={pageState.searchText}
                        currentMatch={pageState.currentMatchIndex}
                        totalMatches={pageState.totalMatches}
                        onSearchTextChange={pageModel.setSearchText}
                        onNext={pageModel.nextMatch}
                        onPrev={pageModel.prevMatch}
                        onClose={pageModel.closeSearch}
                    />
                )}
                <div
                    className="md-scroll-container"
                    ref={pageModel.setContainer}
                    onScroll={pageModel.containerScroll}
                >
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={rehypePlugins}
                        components={components}
                        urlTransform={(url) => {
                            try { return decodeURIComponent(url); } catch { return url; }
                        }}
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
        </>
    );
}

const moduleExport = {
    Editor: MarkdownView,
};

export default moduleExport;

// Re-export with old names for backward compatibility
export { MarkdownView as MdView };
export type { MarkdownViewProps as MdViewProps };
