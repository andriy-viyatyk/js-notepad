import { app } from "../../api/app";
import { pagesModel } from "../../api/pages";
import { createLinkData } from "../../../shared/link-data";
import {
    applyPanelAttributes,
    createPanelElement,
    resolvePanelAttributes,
    type PanelStyleProps,
} from "../../uikit/Panel/panel-style";
import { MinimapView } from "../../uikit/Minimap/MinimapView";
import type { MinimapProps } from "../../uikit/Minimap/Minimap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorConfig } from "../base/EditorConfig";
import { FindBarView, type FindBarProps } from "../shared/FindBarView";
import { MarkdownBlockView, type MarkdownBlockProps } from "./MarkdownBlockView";
import type { MarkdownEditor, MarkdownEditorState, MarkdownQueueEvent } from "./MarkdownEditor";
import { isLocalMarkdownHref } from "./markdown-nav";

export interface MarkdownBodyViewProps {
    model: MarkdownEditor;
    editorConfig?: EditorConfig;
}

interface MarkdownProjection {
    compactMode: MarkdownEditorState["compactMode"];
    searchVisible: MarkdownEditorState["searchVisible"];
    searchText: MarkdownEditorState["searchText"];
    currentMatchIndex: MarkdownEditorState["currentMatchIndex"];
    totalMatches: MarkdownEditorState["totalMatches"];
}

interface HostProjection {
    content: string;
    filePath: string | undefined;
}

const EMPTY_HOST: HostProjection = { content: "", filePath: undefined };

function selectProjection(state: MarkdownEditorState): MarkdownProjection {
    return {
        compactMode: state.compactMode,
        searchVisible: state.searchVisible,
        searchText: state.searchText,
        currentMatchIndex: state.currentMatchIndex,
        totalMatches: state.totalMatches,
    };
}

function selectHostProjection(state: { content: string; filePath?: string }): HostProjection {
    return { content: state.content, filePath: state.filePath };
}

function rootPanelProps(editorConfig?: EditorConfig): PanelStyleProps {
    const maxHeight = editorConfig?.maxEditorHeight;
    const embedded = maxHeight !== undefined;
    return {
        name: "markdown-view-root",
        direction: "row",
        flex: embedded ? undefined : 1,
        height: embedded ? undefined : 0,
        overflow: "hidden",
        maxHeight,
    };
}

function findColumnProps(): PanelStyleProps {
    return {
        name: "markdown-find-column",
        direction: "column",
        flex: 1,
        width: 0,
    };
}

function scrollPanelProps(
    editorConfig: EditorConfig | undefined,
    compact: boolean,
    showMinimap: boolean,
): PanelStyleProps {
    const maxHeight = editorConfig?.maxEditorHeight;
    const embedded = maxHeight !== undefined;
    return {
        name: "markdown-scroll",
        direction: "column",
        flex: embedded ? undefined : 1,
        height: embedded ? undefined : 0,
        maxHeight: embedded ? maxHeight : undefined,
        overflowY: "auto",
        overflowX: "hidden",
        scrollbar: showMinimap ? "hidden" : "auto",
        paddingX: compact ? "md" : "xxl",
    };
}

function sameBlockProps(a: MarkdownBlockProps | undefined, b: MarkdownBlockProps): boolean {
    return !!a
        && a.commandQueue === b.commandQueue
        && a.content === b.content
        && a.highlightText === b.highlightText
        && a.compact === b.compact
        && a.filePath === b.filePath
        && a.onMatchCountChange === b.onMatchCountChange;
}

export class MarkdownBodyView extends VanillaView<MarkdownBodyViewProps> {
    private model: MarkdownEditor;
    private findColumn!: HTMLDivElement;
    private scrollPanel!: HTMLDivElement;
    private markdownBlock!: MarkdownBlockView;
    private findBar: FindBarView | undefined;
    private minimap: MinimapView | undefined;

    private modelSubscription: (() => void) | undefined;
    private hostSubscription: (() => void) | undefined;
    private queueSubscription: (() => void) | undefined;
    private pageFocusSubscription: { unsubscribe: () => void } | undefined;
    private boundModel: MarkdownEditor | undefined;
    private boundHost: MarkdownEditor["host"] = null;

    private hostProjection: HostProjection;
    private lastProjection: MarkdownProjection | undefined;
    private lastBlockProps: MarkdownBlockProps | undefined;
    private appliedRootMaxHeight: number | undefined;
    private rootLayoutApplied = false;
    private appliedScrollLayout: {
        maxHeight: number | undefined;
        compact: boolean;
        showMinimap: boolean;
    } | undefined;
    private scrollTop = 0;
    private anchorRetry: number | null = null;
    private lifecycleGeneration = 0;
    private active = true;

    private readonly cancelAnchorRetry = (): void => {
        if (this.anchorRetry !== null) {
            cancelAnimationFrame(this.anchorRetry);
            this.anchorRetry = null;
        }
    };

    private readonly handleQueueEvent = (event: MarkdownQueueEvent): void => {
        if (!this.active) return;
        if (event.type === "focus") {
            this.scrollPanel.focus();
        } else {
            this.scrollToAnchor(event.fragment);
        }
    };

    private readonly onScroll = (): void => {
        this.scrollTop = this.scrollPanel.scrollTop;
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "f" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            this.model.openSearch();
        } else if (event.key === "Escape" && this.model.state.get().searchVisible) {
            event.preventDefault();
            this.model.closeSearch();
        } else if (event.key === "F3" && event.shiftKey) {
            event.preventDefault();
            this.model.prevMatch();
        } else if (event.key === "F3") {
            event.preventDefault();
            this.model.nextMatch();
        }
    };

    private readonly onLinkClickCapture = (event: MouseEvent): void => {
        // Embedded bodies leave link handling to their host. Check this at event
        // time because the same view can be updated between clicks.
        if (this.props.editorConfig?.maxEditorHeight !== undefined) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
            || event.button !== 0) return;
        if (!(event.target instanceof Element)) return;

        const anchor = event.target.closest("a");
        if (!anchor) return;
        const href = anchor.getAttribute("href") || "";
        if (href.startsWith("#")) {
            event.preventDefault();
            event.stopPropagation();
            let fragment = href.slice(1);
            try {
                fragment = decodeURIComponent(fragment);
            } catch {
                // Keep the raw fragment when it is not valid URI encoding.
            }
            this.scrollToAnchor(fragment);
            return;
        }
        if (!isLocalMarkdownHref(href)) return;

        const page = this.model.page;
        const pageId = page?.id;
        if (!pageId) return;

        event.preventDefault();
        event.stopPropagation();
        const current = this.model.host?.state.get();
        if (current?.filePath) {
            page.pushNavBack({ href: current.filePath, title: current.title });
        }
        void app.events.openRawLink.sendAsync(
            createLinkData(href, { pageId, target: "md-view", sourceId: "markdown-link" }),
        );
    };

    private readonly onMatchCountChange = (count: number): void => {
        if (!this.active) return;
        const { totalMatches, currentMatchIndex } = this.model.state.get();
        if (count === totalMatches) return;

        this.model.setMatchCount(count);
        if (count > 0) {
            const newIndex = currentMatchIndex >= count ? 0 : currentMatchIndex;
            void this.model.typedQueue.execute({ type: "scrollToMatch", index: newIndex });
        }
    };

    public constructor(props: MarkdownBodyViewProps) {
        const root = createPanelElement(rootPanelProps(props.editorConfig));

        super(props, root);
        this.model = props.model;
        this.appliedRootMaxHeight = props.editorConfig?.maxEditorHeight;
        this.rootLayoutApplied = true;
        this.hostProjection = props.model.host
            ? selectHostProjection(props.model.host.state.get())
            : EMPTY_HOST;
    }

    protected onMount(): void {
        this.model = this.props.model;
        const compact = this.props.editorConfig?.compact || this.model.state.get().compactMode;
        const showMinimap = !this.props.editorConfig?.hideMinimap;
        this.findColumn = createPanelElement(findColumnProps());
        this.scrollPanel = createPanelElement(
            scrollPanelProps(this.props.editorConfig, compact, showMinimap),
        );
        this.hostProjection = this.model.host
            ? selectHostProjection(this.model.host.state.get())
            : EMPTY_HOST;
        this.markdownBlock = this.child(new MarkdownBlockView({
            commandQueue: this.model.typedQueue,
            content: this.hostProjection.content,
            highlightText: this.getHighlightText(),
            compact,
            filePath: this.hostProjection.filePath,
            onMatchCountChange: this.onMatchCountChange,
        }));
        this.scrollPanel.append(this.markdownBlock.root);
        this.findColumn.append(this.scrollPanel);
        this.root.append(this.findColumn);
        this.root.tabIndex = -1;
        this.appliedScrollLayout = undefined;
        this.applyRootLayout(this.props.editorConfig);
        this.markdownBlock.mount();
        this.lastBlockProps = this.blockProps();
        this.reconcileMinimap();
        this.model.setContainer(this.scrollPanel);
        this.bindToHostIfNeeded();
        this.bindModel();
        this.bindPageFocus();

        this.listen(this.root, "keydown", this.onKeyDown);
        this.listen(this.scrollPanel, "scroll", this.onScroll);
        this.listen(this.scrollPanel, "click", this.onLinkClickCapture, { capture: true });

        // ComponentQueue.subscribe drains pending focus/anchor events synchronously.
        // The block request handler must therefore already be mounted.
        this.subscribeToQueue();
    }

    protected onUpdate(props: MarkdownBodyViewProps): void {
        this.applyRootLayout(props.editorConfig);

        if (this.model !== props.model) {
            this.replaceModel(props.model);
            return;
        }

        this.reconcileMinimap();
        this.bindToHostIfNeeded();
        this.applyProjection(selectProjection(this.model.state.get()));
    }

    protected onDispose(): void {
        this.active = false;
        this.lifecycleGeneration += 1;
        this.cancelAnchorRetry();
        this.queueSubscription?.();
        this.queueSubscription = undefined;
        this.modelSubscription?.();
        this.modelSubscription = undefined;
        this.hostSubscription?.();
        this.hostSubscription = undefined;
        this.pageFocusSubscription?.unsubscribe();
        this.pageFocusSubscription = undefined;
        this.model.setContainer(null);
    }

    private replaceModel(nextModel: MarkdownEditor): void {
        const oldModel = this.model;
        this.cancelAnchorRetry();
        this.lifecycleGeneration += 1;
        this.queueSubscription?.();
        this.queueSubscription = undefined;
        this.modelSubscription?.();
        this.modelSubscription = undefined;
        this.hostSubscription?.();
        this.hostSubscription = undefined;
        this.pageFocusSubscription?.unsubscribe();
        this.pageFocusSubscription = undefined;
        oldModel.setContainer(null);

        this.model = nextModel;
        this.boundModel = undefined;
        this.boundHost = null;
        this.hostProjection = nextModel.host
            ? selectHostProjection(nextModel.host.state.get())
            : EMPTY_HOST;
        this.lastProjection = undefined;
        this.lastBlockProps = undefined;
        this.model.setContainer(this.scrollPanel);
        this.reconcileMinimap();
        this.bindToHostIfNeeded();
        this.bindModel();
        this.bindPageFocus();
        this.subscribeToQueue();
    }

    private bindModel(): void {
        const model = this.model;
        const generation = this.lifecycleGeneration;
        this.lastProjection = undefined;
        this.applyProjection(selectProjection(model.state.get()));
        this.modelSubscription = model.state.subscribe(
            (projection) => {
                if (!this.isCurrent(model, generation)) return;
                this.applyProjection(projection);
            },
            selectProjection,
        );
    }

    private bindToHostIfNeeded(): void {
        const host = this.model.host;
        if (this.boundModel === this.model && this.boundHost === host) return;

        this.hostSubscription?.();
        this.hostSubscription = undefined;
        this.boundModel = this.model;
        this.boundHost = host;
        this.hostProjection = host ? selectHostProjection(host.state.get()) : EMPTY_HOST;
        this.updateMarkdownBlock();
        if (!host) return;

        const model = this.model;
        const generation = this.lifecycleGeneration;
        this.hostSubscription = host.state.subscribe(
            (projection) => {
                if (!this.isCurrent(model, generation)) return;
                this.hostProjection = projection;
                this.updateMarkdownBlock();
            },
            selectHostProjection,
        );
    }

    private bindPageFocus(): void {
        const model = this.model;
        const generation = this.lifecycleGeneration;
        this.pageFocusSubscription = pagesModel.onFocus.subscribe((page) => {
            if (!this.isCurrent(model, generation) || page !== model.page) return;
            Promise.resolve().then(() => {
                if (!this.isCurrent(model, generation)) return;
                this.scrollPanel.scrollTop = this.scrollTop;
            });
        });
    }

    private subscribeToQueue(): void {
        this.queueSubscription = this.model.typedQueue.subscribe(this.handleQueueEvent);
    }

    private applyProjection(projection: MarkdownProjection): void {
        if (!this.active) return;
        const previous = this.lastProjection;
        this.lastProjection = projection;
        this.reconcileMinimap();
        this.reconcileSearchBar(projection);
        this.updateMarkdownBlock();

        const matchChanged = !previous
            || previous.currentMatchIndex !== projection.currentMatchIndex
            || previous.totalMatches !== projection.totalMatches;
        if (matchChanged && projection.totalMatches > 0) {
            void this.model.typedQueue.execute({
                type: "scrollToMatch",
                index: projection.currentMatchIndex,
            });
        }
    }

    private reconcileSearchBar(projection: MarkdownProjection): void {
        const editorConfig = this.props.editorConfig;
        const visible = projection.searchVisible && !editorConfig?.highlightText;
        if (!visible) {
            if (this.findBar) {
                this.releaseChild(this.findBar);
                this.findBar = undefined;
            }
            return;
        }

        const props = this.findBarProps(projection);
        if (!this.findBar) {
            const findBar = this.child(new FindBarView(props));
            this.findColumn.insertBefore(findBar.root, this.scrollPanel);
            this.findBar = findBar;
            findBar.mount();
        } else {
            this.findBar.update(props);
        }
    }

    private reconcileMinimap(): void {
        const showMinimap = !this.props.editorConfig?.hideMinimap;
        const compact = this.props.editorConfig?.compact || this.model.state.get().compactMode;
        const maxHeight = this.props.editorConfig?.maxEditorHeight;
        const previousLayout = this.appliedScrollLayout;
        if (!previousLayout
            || previousLayout.maxHeight !== maxHeight
            || previousLayout.compact !== compact
            || previousLayout.showMinimap !== showMinimap
        ) {
            applyPanelAttributes(
                this.scrollPanel,
                resolvePanelAttributes(scrollPanelProps(this.props.editorConfig, compact, showMinimap)),
            );
            this.appliedScrollLayout = { maxHeight, compact, showMinimap };
        }

        if (!showMinimap) {
            if (this.minimap) {
                this.releaseChild(this.minimap);
                this.minimap = undefined;
            }
            return;
        }

        if (!this.minimap) {
            const minimapProps: MinimapProps = {
                name: "markdown-minimap",
                scrollContainer: this.scrollPanel,
            };
            const minimap = this.child(new MinimapView(minimapProps));
            this.root.append(minimap.root);
            this.minimap = minimap;
            minimap.mount();
        }
    }

    private applyRootLayout(editorConfig?: EditorConfig): void {
        const maxHeight = editorConfig?.maxEditorHeight;
        if (this.rootLayoutApplied && this.appliedRootMaxHeight === maxHeight) return;
        applyPanelAttributes(this.root, resolvePanelAttributes(rootPanelProps(editorConfig)));
        this.appliedRootMaxHeight = maxHeight;
        this.rootLayoutApplied = true;
    }

    private findBarProps(projection: MarkdownProjection): FindBarProps {
        return {
            text: projection.searchText,
            currentMatch: projection.currentMatchIndex,
            totalMatches: projection.totalMatches,
            onTextChange: this.model.setSearchText,
            onNext: this.model.nextMatch,
            onPrev: this.model.prevMatch,
            onClose: this.model.closeSearch,
        };
    }

    private getHighlightText(): string {
        const state = this.model.state.get();
        const externalHighlight = this.props.editorConfig?.highlightText || "";
        return state.searchVisible && state.searchText ? state.searchText : externalHighlight;
    }

    private blockProps(): MarkdownBlockProps {
        const state = this.model.state.get();
        return {
            commandQueue: this.model.typedQueue,
            content: this.hostProjection.content,
            highlightText: this.getHighlightText(),
            compact: !!(this.props.editorConfig?.compact || state.compactMode),
            filePath: this.hostProjection.filePath,
            onMatchCountChange: this.onMatchCountChange,
        };
    }

    private updateMarkdownBlock(): void {
        const nextProps = this.blockProps();
        if (sameBlockProps(this.lastBlockProps, nextProps)) return;

        const previousScrollTop = this.scrollPanel.scrollTop;
        this.lastBlockProps = nextProps;
        this.markdownBlock.update(nextProps);
        if (this.scrollPanel.scrollTop !== previousScrollTop) {
            this.scrollPanel.scrollTop = previousScrollTop;
        }
    }

    private scrollToAnchor(fragment: string): void {
        this.cancelAnchorRetry();
        const model = this.model;
        const generation = this.lifecycleGeneration;
        let attempts = 0;

        const attempt = (): void => {
            this.anchorRetry = null;
            if (!this.isCurrent(model, generation)) return;
            if (model.typedQueue.pendingRequestCount > 0) return;

            void model.typedQueue.execute({ type: "scrollToAnchor", fragment }).then(
                (found) => {
                    if (!this.isCurrent(model, generation)) return;
                    if (found) {
                        this.scrollTop = this.scrollPanel.scrollTop;
                        return;
                    }
                    if (++attempts <= 10 && this.isCurrent(model, generation)) {
                        this.anchorRetry = requestAnimationFrame(attempt);
                    }
                },
                () => {
                    // A replaced or disposed queue can reject its pending request.
                },
            );
        };

        attempt();
    }

    private isCurrent(model: MarkdownEditor, generation: number): boolean {
        return this.active && this.model === model && this.lifecycleGeneration === generation;
    }
}
