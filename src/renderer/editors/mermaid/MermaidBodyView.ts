import type { MermaidEditor, MermaidEditorState } from "./MermaidEditor";
import { createPanelElement, applyPanelAttributes, resolvePanelAttributes, type PanelStyleProps } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { SpinnerView } from "../../uikit/Spinner/SpinnerView";
import { ImageViewportView } from "../../uikit/ImageViewport/ImageViewportView";
import type { ImageViewportProps } from "../../uikit/ImageViewport/ImageViewportView";
import type { EditorConfig } from "../base/EditorConfig";
import { guard } from "../../core/utils/guard";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { ui } from "../../api/ui";
import { errMessage } from "../../../shared/utils";

export interface MermaidBodyViewProps {
    model: MermaidEditor;
    editorConfig?: EditorConfig;
}

interface MermaidProjection {
    svgUrl: string;
    error: string;
    loading: boolean;
}

type ContentKey = "loading" | "viewport";

function selectMermaidProjection(state: MermaidEditorState): MermaidProjection {
    return {
        svgUrl: state.svgUrl,
        error: state.error,
        loading: state.loading,
    };
}

function rootPanelProps(editorConfig?: EditorConfig): PanelStyleProps {
    const maxH = editorConfig?.maxEditorHeight;
    const embedded = maxH !== undefined;
    return {
        name: "mermaid-root",
        direction: "column",
        flex: embedded ? undefined : true,
        overflow: "hidden",
        position: "relative",
        height: embedded ? maxH : 0,
    };
}

class MermaidLoadingView extends VanillaView<Record<string, never>> {
    private readonly spinner: SpinnerView;

    public constructor() {
        const spinner = new SpinnerView({});
        super(
            {},
            createPanelElement(
                { flex: true, align: "center", justify: "center", background: "default" },
                [spinner.root],
            ),
        );
        this.spinner = this.child(spinner);
    }

    protected onMount(): void {
        this.spinner.mount();
    }
}

export class MermaidBodyView extends VanillaView<MermaidBodyViewProps> {
    private model: MermaidEditor;
    private modelSubscription: (() => void) | undefined;
    private queueSubscription: (() => void) | undefined;
    private readonly errorPanel: HTMLDivElement;
    private readonly errorText: HTMLSpanElement;
    private readonly overlayPanel: HTMLDivElement;
    private readonly overlaySpinner: SpinnerView;
    private readonly contentSwap: SubtreeSwap<ContentKey>;
    private activeContentKey: ContentKey | null = null;
    private activeViewport: ImageViewportView | undefined;

    public constructor(props: MermaidBodyViewProps) {
        super(props, createPanelElement(rootPanelProps(props.editorConfig)));
        this.model = props.model;

        this.errorText = createTextElement("", { color: "warning", preWrap: true });
        this.errorPanel = createPanelElement(
            { flex: true, align: "center", justify: "center", padding: "xxxl" },
            [this.errorText],
        );

        this.overlaySpinner = this.child(new SpinnerView({}));
        this.overlayPanel = createPanelElement(
            {
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                zIndex: 1,
                align: "center",
                justify: "center",
            },
            [this.overlaySpinner.root],
        );

        this.contentSwap = new SubtreeSwap<ContentKey>(this.root);
        this.root.append(this.errorPanel, this.overlayPanel);
    }

    protected onMount(): void {
        this.overlaySpinner.mount();
        this.applyProjection(selectMermaidProjection(this.model.state.get()));
        this.subscribeToModel();
        this.own(() => this.contentSwap.dispose());
    }

    protected onUpdate(props: MermaidBodyViewProps): void {
        applyPanelAttributes(this.root, resolvePanelAttributes(rootPanelProps(props.editorConfig)));

        const modelChanged = this.model !== props.model;

        if (modelChanged) {
            this.unsubscribeFromModel();
            this.model = props.model;
            this.subscribeToModel();
        }
        this.applyProjection(selectMermaidProjection(this.model.state.get()));
    }

    private subscribeToModel(): void {
        this.modelSubscription = this.ownSubscription(this.model.state.subscribe(
            (projection) => this.applyProjection(projection),
            selectMermaidProjection,
        ));
        this.queueSubscription = this.ownSubscription(this.model.typedQueue.subscribe(() => {
            // PV8: deliberate no-op; drain the focus queue to keep its lifecycle clean.
        }));
    }

    private unsubscribeFromModel(): void {
        this.modelSubscription?.();
        this.modelSubscription = undefined;
        this.queueSubscription?.();
        this.queueSubscription = undefined;
    }

    private applyProjection(projection: MermaidProjection): void {
        this.errorText.textContent = projection.error;
        this.errorPanel.hidden = !projection.error;
        this.overlayPanel.hidden = !(projection.loading && !!projection.svgUrl);

        const contentKey: ContentKey | null = projection.loading && !projection.svgUrl
            ? "loading"
            : projection.svgUrl
                ? "viewport"
                : null;

        if (
            contentKey === "viewport"
            && this.activeContentKey === "viewport"
            && this.activeViewport
        ) {
            this.activeViewport.update(this.viewportProps(projection.svgUrl));
        } else {
            if (contentKey !== "viewport") this.activeViewport = undefined;
            void guard("Failed to update Mermaid content", () => {
                this.contentSwap.set(contentKey, (key) => this.createContentBranch(key, projection.svgUrl));
                this.activeContentKey = contentKey;
            });
            return;
        }
        this.activeContentKey = contentKey;
    }

    private createContentBranch(key: ContentKey, svgUrl: string): MermaidLoadingView | ImageViewportView {
        if (key === "loading") {
            const loadingView = new MermaidLoadingView();
            loadingView.mount();
            return loadingView;
        }

        const viewport = new ImageViewportView(this.viewportProps(svgUrl));
        this.activeViewport = viewport;
        viewport.mount();
        return viewport;
    }

    private viewportProps(svgUrl: string): ImageViewportProps {
        return {
            src: svgUrl,
            alt: "Mermaid Diagram",
        };
    }

    public copyImage = (): void => {
        void this.model.copyImageToClipboard().catch((error: unknown) => {
            ui.notify(`Failed to copy Mermaid image: ${errMessage(error)}`, "error");
        });
    }
}
