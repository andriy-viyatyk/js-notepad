import { BoardIcon, createIconComponentElement } from "../../theme/icons";
import {
    applyPanelAttributes,
    createPanelElement,
    resolvePanelAttributes,
} from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "../../uikit/Panel/Panel.css";

/** 16:10 — the shape board authors are asked to capture. */
const ASPECT = 0.625;
const DEFAULT_WIDTH = 200;

export interface BoardScreenshotViewProps {
    /** Resolved screenshot URL from the catalog entry (`screenshotUrl`). */
    url?: string;
    /** Rendered width in px; height follows the 16:10 aspect. */
    width?: number;
}

function screenshotPanelProps(props: BoardScreenshotViewProps) {
    const width = props.width ?? DEFAULT_WIDTH;
    return {
        width,
        height: Math.round(width * ASPECT),
        shrink: false,
        border: true as const,
        borderColor: "default" as const,
        rounded: "sm" as const,
        overflow: "hidden" as const,
        background: "light" as const,
        align: "center" as const,
        justify: "center" as const,
    };
}

export class BoardScreenshotView extends VanillaView<BoardScreenshotViewProps> {
    private image!: HTMLImageElement;
    private placeholder!: SVGElement;
    private failed = false;
    private lastUrl: string | undefined;

    public constructor(props: BoardScreenshotViewProps) {
        super(props, createPanelElement(screenshotPanelProps(props)));
        this.root.dataset.type = "board-screenshot";
    }

    protected onMount(): void {
        this.image = document.createElement("img");
        this.image.alt = "";
        this.image.style.width = "100%";
        this.image.style.height = "100%";
        this.image.style.objectFit = "cover";
        this.image.style.display = "block";
        this.placeholder = createIconComponentElement(BoardIcon, {
            width: 32,
            height: 32,
            opacity: 0.35,
        });
        this.root.append(this.image, this.placeholder);
        this.listen(this.image, "error", this.handleError);
        this.lastUrl = this.props.url;
        this.applyContent(this.props);
    }

    protected onUpdate(props: BoardScreenshotViewProps): void {
        applyPanelAttributes(this.root, resolvePanelAttributes(screenshotPanelProps(props)));
        this.root.dataset.type = "board-screenshot";
        if (props.url !== this.lastUrl) {
            this.failed = false;
            this.lastUrl = props.url;
        }
        this.applyContent(props);
    }

    private readonly handleError = (): void => {
        this.failed = true;
        this.applyVisibility();
    };

    private applyContent(props: BoardScreenshotViewProps): void {
        this.image.src = props.url ?? "";
        this.applyVisibility();
    }

    private applyVisibility(): void {
        const showImage = Boolean(this.props.url) && !this.failed;
        this.image.hidden = !showImage;
        if (showImage) this.placeholder.removeAttribute("hidden");
        else this.placeholder.setAttribute("hidden", "");
    }
}
