import type { ImageViewportModel, ImageViewportProps } from "../../uikit/ImageViewport/ImageViewport";
import { ImageViewportView } from "../../uikit/ImageViewport/ImageViewportView";
import {
    applyPanelAttributes,
    createPanelElement,
    resolvePanelAttributes,
    type PanelStyleProps,
} from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorConfig } from "../base/EditorConfig";
import type { SvgEditor } from "./SvgEditor";

export interface SvgBodyViewProps {
    model: SvgEditor;
    editorConfig?: EditorConfig;
    imageModelSetter?: (model: ImageViewportModel | null) => void;
}

function rootPanelProps(editorConfig?: EditorConfig): PanelStyleProps {
    const maxH = editorConfig?.maxEditorHeight;
    const embedded = maxH !== undefined;
    return {
        name: "svg-root",
        direction: "column",
        flex: embedded ? undefined : true,
        height: embedded ? maxH : 0,
    };
}

function viewportProps(
    content: string,
    imageModelSetter?: SvgBodyViewProps["imageModelSetter"],
): ImageViewportProps {
    return {
        onModel: imageModelSetter,
        src: `data:image/svg+xml,${encodeURIComponent(content)}`,
        alt: "SVG Preview",
    };
}

export class SvgBodyView extends VanillaView<SvgBodyViewProps> {
    private model: SvgEditor;
    private imageModelSetter: SvgBodyViewProps["imageModelSetter"];
    private readonly viewport: ImageViewportView;
    private hostSubscription: (() => void) | undefined;
    private boundModel: SvgEditor | undefined;
    private boundHost: SvgEditor["host"] = null;
    private queueSubscription: (() => void) | undefined;

    public constructor(props: SvgBodyViewProps) {
        const content = props.model.host?.state.get().content ?? "";
        const viewport = new ImageViewportView(
            viewportProps(content, props.imageModelSetter),
        );
        super(props, createPanelElement(rootPanelProps(props.editorConfig)));
        this.model = props.model;
        this.imageModelSetter = props.imageModelSetter;
        this.viewport = this.child(viewport);
        this.root.append(this.viewport.root);
    }

    protected onMount(): void {
        this.viewport.mount();
        this.bindToHostIfNeeded();
        this.queueSubscription = this.model.typedQueue.subscribe(() => {
            // Deliberate no-op: drain the focus queue to keep its lifecycle clean.
        });
        this.own(() => this.hostSubscription?.());
        this.own(() => this.queueSubscription?.());
    }

    protected onUpdate(props: SvgBodyViewProps): void {
        applyPanelAttributes(this.root, resolvePanelAttributes(rootPanelProps(props.editorConfig)));

        const modelChanged = this.model !== props.model;
        this.imageModelSetter = props.imageModelSetter;
        if (modelChanged) {
            this.queueSubscription?.();
            this.queueSubscription = undefined;
            this.model = props.model;
            this.queueSubscription = this.model.typedQueue.subscribe(() => {
                // Deliberate no-op: drain the focus queue to keep its lifecycle clean.
            });
        }

        this.bindToHostIfNeeded();
        this.viewport.update(
            viewportProps(
                this.model.host?.state.get().content ?? "",
                this.imageModelSetter,
            ),
        );
    }

    private bindToHostIfNeeded(): void {
        const host = this.model.host;
        if (this.model === this.boundModel && host === this.boundHost && this.hostSubscription) return;

        this.hostSubscription?.();
        this.hostSubscription = undefined;
        this.boundModel = this.model;
        this.boundHost = host;
        if (!host) return;

        this.hostSubscription = host.state.subscribe(
            (content: string) => {
                this.viewport.update(viewportProps(content, this.imageModelSetter));
            },
            (state) => state.content,
        );
    }
}
