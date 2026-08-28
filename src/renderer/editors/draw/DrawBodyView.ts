import { FONT_FAMILY, THEME } from "@excalidraw/excalidraw";
import type {
    AppState,
    BinaryFiles,
    ExcalidrawInitialDataState,
    ExcalidrawImperativeAPI,
    LibraryItemsSource,
} from "@excalidraw/excalidraw/dist/types/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/dist/types/excalidraw/element/types";
import { ui } from "../../api/ui";
import { pagesModel } from "../../api/pages";
import { browserUrlChanged, type BrowserUrlEvent } from "../../core/state/events";
import { guard } from "../../core/utils/guard";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { SpinnerView } from "../../uikit/Spinner/SpinnerView";
import "../../uikit/Spinner/Spinner.css";
import { createTextElement } from "../../uikit/Text/text-style";
import { mountReactHandle, type MountedReactRoot } from "./react-island";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { errMessage } from "../../../shared/utils";
import type { DrawEditor, DrawEditorState } from "./DrawEditor";
import { createExcalidrawIslandElement, LIBRARY_RETURN_URL } from "./ExcalidrawIsland";
import { createLibraryAdapter, initDefaultLibraryPath } from "./drawLibrary";

type DrawTheme = typeof THEME[keyof typeof THEME];

interface DrawBodyProjection {
    loading: boolean;
    error: string | null;
    darkMode: boolean;
}

type DrawBranchKey = "error" | "loading" | "ready";

function selectDrawBodyProjection(state: DrawEditorState): DrawBodyProjection {
    return {
        loading: state.loading,
        error: state.error,
        darkMode: state.darkMode,
    };
}

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

class DrawErrorView extends VanillaView<{ error: string }> {
    private readonly errorText: HTMLSpanElement;

    public constructor(props: { error: string }) {
        const errorText = createTextElement(props.error, { color: "warning", preWrap: true });
        super(
            props,
            createPanelElement(
                {
                    name: "editor-error",
                    flex: true,
                    justify: "center",
                    align: "center",
                    padding: "xxl",
                },
                [errorText],
            ),
        );
        this.errorText = errorText;
    }

    protected onUpdate(props: { error: string }): void {
        this.errorText.textContent = props.error;
    }
}

class DrawLoadingView extends VanillaView<Record<string, never>> {
    private readonly spinner: SpinnerView;

    public constructor() {
        const spinner = new SpinnerView({});
        super({}, spinner.root);
        this.spinner = this.child(spinner);
    }

    protected onMount(): void {
        this.spinner.mount();
    }
}

interface DrawReadyViewProps {
    editor: DrawEditor;
    theme: DrawTheme;
    libraryAdapter: ReturnType<typeof createLibraryAdapter>;
    onApi: (api: ExcalidrawImperativeAPI) => void;
    onChange: (
        elements: readonly OrderedExcalidrawElement[],
        appState: AppState,
        files: BinaryFiles,
    ) => void;
}

class DrawReadyView extends VanillaView<DrawReadyViewProps> {
    private readonly editor: DrawEditor;
    private readonly libraryAdapter: DrawReadyViewProps["libraryAdapter"];
    private readonly onApi: DrawReadyViewProps["onApi"];
    private readonly onChange: DrawReadyViewProps["onChange"];
    private readonly initialData: ExcalidrawInitialDataState;
    private theme: DrawTheme;
    private reactHandle: MountedReactRoot | undefined;

    public constructor(props: DrawReadyViewProps) {
        const wrapper = document.createElement("div");
        wrapper.style.flex = "1 1 auto";
        wrapper.style.width = "100%";
        wrapper.style.height = "100%";
        const islandHost = document.createElement("div");
        // The island host is an element the React original did not have: `<Excalidraw>` used to be
        // the wrapper's direct child. Without an explicit size it is `display: block; height: 0`,
        // and Excalidraw's own container is `height: 100%` — so it resolves against 0 and the whole
        // drawing surface collapses to zero height while every React-root measurement still looks
        // correct. Verified live before this line existed: draw-root 1507x951 -> wrapper 1507x951
        // -> host 1507x0 -> canvases 1507x0.
        islandHost.style.width = "100%";
        islandHost.style.height = "100%";
        wrapper.append(islandHost);

        super(
            props,
            createPanelElement(
                {
                    name: "draw-root",
                    direction: "column",
                    flex: 1,
                    overflow: "hidden",
                    position: "relative",
                },
                [wrapper],
            ),
        );
        this.editor = props.editor;
        this.libraryAdapter = props.libraryAdapter;
        this.onApi = props.onApi;
        this.onChange = props.onChange;
        this.theme = props.theme;
        this.initialData = {
            elements: props.editor.elements,
            appState: {
                ...props.editor.appState,
                currentItemFontFamily: props.editor.appState.currentItemFontFamily ?? FONT_FAMILY.Helvetica,
            },
            files: props.editor.files,
        };
        this.islandHost = islandHost;
        this.wrapper = wrapper;
    }

    private readonly wrapper: HTMLDivElement;
    private readonly islandHost: HTMLDivElement;

    protected onMount(): void {
        this.listen(this.wrapper, "contextmenu", (event) => event.stopPropagation());
        this.listen(this.wrapper, "click", (event) => {
            if (!(event.target instanceof Element)) return;
            const anchor = event.target.closest("a.library-menu-browse-button");
            if (!anchor) return;
            event.preventDefault();
            const href = anchor.getAttribute("href");
            if (href !== null) pagesModel.openUrlInBrowserTab(href);
        });
        this.reactHandle = mountReactHandle(this.islandHost, this.createIslandElement());
        const handle = this.reactHandle;
        this.own(() => {
            handle.dispose();
            this.reactHandle = undefined;
        });
    }

    protected onUpdate(props: DrawReadyViewProps): void {
        if (props.editor !== this.editor) {
            throw new Error("Draw ready view received a different model instance.");
        }
        if (props.theme === this.theme) return;
        this.theme = props.theme;
        this.reactHandle?.render(this.createIslandElement());
    }

    private createIslandElement() {
        return createExcalidrawIslandElement({
            theme: this.theme,
            initialData: this.initialData,
            libraryAdapter: this.libraryAdapter,
            onApi: this.onApi,
            onChange: this.onChange,
        });
    }
}

export class DrawBodyView extends VanillaView<{ model: DrawEditor }> {
    private readonly model: DrawEditor;
    private readonly libraryAdapter = createLibraryAdapter();
    private readonly branchHost: HTMLDivElement;
    private readonly branchSwap: SubtreeSwap<DrawBranchKey>;
    private activeBranch: DrawErrorView | DrawLoadingView | DrawReadyView | undefined;
    private activeBranchKey: DrawBranchKey | undefined;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    public constructor(props: { model: DrawEditor }) {
        super(props, createContentsRoot());
        this.model = props.model;
        this.branchHost = document.createElement("div");
        this.branchHost.style.display = "contents";
        this.branchSwap = new SubtreeSwap<DrawBranchKey>(this.branchHost);
        this.root.append(this.branchHost);
    }

    protected onMount(): void {
        this.own(() => this.branchSwap.dispose());
        this.own(() => {
            if (this.debounceTimer !== undefined) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = undefined;
            }
            this.model.clearExcalidrawApi();
        });
        this.own(browserUrlChanged.subscribe(this.handleBrowserUrl).unsubscribe);
        void guard("Failed to initialize drawing library", initDefaultLibraryPath);
        this.bind(
            this.model.state,
            selectDrawBodyProjection,
            (projection) => this.syncBranch(projection),
        );
    }

    protected onUpdate(props: { model: DrawEditor }): void {
        if (props.model !== this.model) {
            throw new Error("Draw body received a different model instance.");
        }
    }

    private readonly handleChange = (
        elements: readonly OrderedExcalidrawElement[],
        appState: AppState,
        files: BinaryFiles,
    ): void => {
        if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            this.model.updateFromExcalidraw(elements, appState, files);
        }, 500);
    };

    private readonly handleApi = (api: ExcalidrawImperativeAPI): void => {
        this.model.setExcalidrawApi(api);
    };

    private readonly handleBrowserUrl = (event?: BrowserUrlEvent): void => {
        const api = this.model.excalidrawApi;
        if (!event || event.handled || !api) return;
        if (!event.url.startsWith(LIBRARY_RETURN_URL)) return;
        const hashIndex = event.url.indexOf("#");
        if (hashIndex === -1) return;
        const params = new URLSearchParams(event.url.slice(hashIndex + 1));
        const libraryUrl = params.get("addLibrary");
        if (!libraryUrl) return;

        event.handled = true;
        const hostId = this.model.host?.state.get().id;
        if (hostId) pagesModel.showPage(hostId);
        const decoded = decodeURIComponent(libraryUrl);
        fetch(decoded)
            .then((response) => response.blob())
            .then((blob) => {
                api.updateLibrary({
                    libraryItems: blob as unknown as LibraryItemsSource,
                    merge: true,
                    prompt: true,
                    openLibraryMenu: true,
                });
            })
            .catch((err) => {
                ui.notify(`Failed to install library: ${errMessage(err)}`, "error");
            });
    };

    private syncBranch(projection: DrawBodyProjection): void {
        const key: DrawBranchKey = projection.error
            ? "error"
            : projection.loading
                ? "loading"
                : "ready";

        if (this.activeBranchKey === key && this.activeBranch) {
            if (key === "error" && this.activeBranch instanceof DrawErrorView) {
                this.activeBranch.update({ error: projection.error ?? "" });
            } else if (key === "ready" && this.activeBranch instanceof DrawReadyView) {
                this.activeBranch.update({
                    editor: this.model,
                    theme: projection.darkMode ? THEME.DARK : THEME.LIGHT,
                    libraryAdapter: this.libraryAdapter,
                    onApi: this.handleApi,
                    onChange: this.handleChange,
                });
            }
            return;
        }

        const branch = this.createBranch(key, projection);
        try {
            this.branchSwap.set(key, () => branch);
            branch.mount();
            this.activeBranch = branch;
            this.activeBranchKey = key;
        } catch (error) {
            this.activeBranch = undefined;
            this.activeBranchKey = undefined;
            this.branchSwap.clear();
            throw error;
        }
    }

    private createBranch(
        key: DrawBranchKey,
        projection: DrawBodyProjection,
    ): DrawErrorView | DrawLoadingView | DrawReadyView {
        if (key === "error") return new DrawErrorView({ error: projection.error ?? "" });
        if (key === "loading") return new DrawLoadingView();
        return new DrawReadyView({
            editor: this.model,
            theme: projection.darkMode ? THEME.DARK : THEME.LIGHT,
            libraryAdapter: this.libraryAdapter,
            onApi: this.handleApi,
            onChange: this.handleChange,
        });
    }
}
