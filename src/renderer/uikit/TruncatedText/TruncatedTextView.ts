import { attachTooltip, type TooltipAttachment } from "../Tooltip/attach-tooltip";
import { fillSlot, type SlotContent } from "../shared/fill-slot";
import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type NativeHTMLAttributes,
    type RestPropsState,
} from "../shared/dom-props";
import { VanillaView } from "../shared/vanilla-view";

export interface TruncatedTextProps
    extends Omit<NativeHTMLAttributes<HTMLSpanElement>, "style" | "className" | "children"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances in DOM inspector output. Never used for styling. */
    name?: string;
    children?: SlotContent;
}

export type TruncatedTextViewProps = TruncatedTextProps;

function getTextFromSlotContent(children: SlotContent): string {
    if (children instanceof Node) return children.textContent ?? "";
    if (typeof children === "string" || typeof children === "number") return String(children);
    if (Array.isArray(children)) return children.map(getTextFromSlotContent).join("");
    return "";
}

export class TruncatedTextView extends VanillaView<TruncatedTextViewProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private contentCleanup: (() => void) | undefined;
    private tooltip: TooltipAttachment | undefined;
    private text = "";
    private overflow = false;
    private measureFrame: number | undefined;

    public constructor(props: TruncatedTextViewProps) {
        super(props, document.createElement("span"));
    }

    protected onMount(): void {
        this.applyConstructionRestProps(this.props);
        this.applyProps(this.props);
        this.updateContent(this.props.children);
        this.listen(this.root, "mouseenter", () => {
            this.measure();
            this.updateTooltip();
        });
        this.tooltip = attachTooltip(this.root, {
            content: null,
            name: this.props.name,
        });
        this.own(() => this.tooltip?.dispose());
        this.own(() => this.clearContent());
        this.own(() => this.cancelMeasure());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
        this.measure();
        this.scheduleMeasure();
    }

    protected onUpdate(props: TruncatedTextViewProps): void {
        this.applyProps(props);
        this.updateContent(props.children);
        this.measure();
        this.updateTooltip();
        this.scheduleMeasure();
    }

    private applyProps(props: TruncatedTextViewProps): void {
        const { name, children: _children, ..._rest } = props;
        this.root.dataset.type = "truncated-text";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
    }

    private applyConstructionRestProps(props: TruncatedTextViewProps): void {
        const { name: _name, children: _children, ...rest } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    /**
     * `fillSlot` owns the transition between content arms — it must not be
     * pre-cleared, or the cached slot state is discarded and the
     * next call builds a second root on the same element.
     */
    private updateContent(children: SlotContent): void {
        this.contentCleanup = fillSlot(this.root, children);
        this.text = getTextFromSlotContent(children);
    }

    private measure(): void {
        this.overflow = this.root.scrollWidth > this.root.offsetWidth;
    }

    private updateTooltip(): void {
        this.tooltip?.update({
            content: this.overflow && this.text ? this.text : null,
            name: this.props.name,
        });
    }

    private scheduleMeasure(): void {
        this.cancelMeasure();
        this.measureFrame = window.requestAnimationFrame(() => {
            this.measureFrame = undefined;
            this.measure();
            this.updateTooltip();
        });
    }

    private cancelMeasure(): void {
        if (this.measureFrame !== undefined) {
            window.cancelAnimationFrame(this.measureFrame);
            this.measureFrame = undefined;
        }
    }

    private clearContent(): void {
        this.contentCleanup?.();
        this.contentCleanup = undefined;
    }
}
