import { applyRestProps, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/dom-props";
import { fillSlot } from "../shared/fill-slot";
import { VanillaView } from "../shared/vanilla-view";
import { applyTextAttributes, resolveTextAttributes, type TextStyleProps } from "../Text/text-style";
import type { LabelProps } from "./Label";
import "./Label.css";
import "../Text/Text.css";

export class LabelView extends VanillaView<LabelProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private textElement: HTMLSpanElement | undefined;
    private requiredElement: HTMLSpanElement | undefined;
    private contentCleanup: (() => void) | undefined;
    private requiredCleanup: (() => void) | undefined;

    public constructor(props: LabelProps) {
        super(props, document.createElement("label"));
    }

    protected onMount(): void {
        this.applyConstructionRestProps(this.props);
        this.applyProps(this.props);
        this.renderText();
        this.own(() => this.clearContent());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: LabelProps): void {
        this.applyProps(props);
        this.renderText();
    }

    protected onDispose(): void {
        this.clearContent();
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: LabelProps): void {
        const {
            name,
            variant: _variant,
            color: _color,
            size: _size,
            italic: _italic,
            bold: _bold,
            nowrap: _nowrap,
            required: _required,
            disabled,
            children: _children,
            // These four fields intentionally remain in the residual props. The
            // React Label has always forwarded them to <label> without applying
            // them to its nested Text; Epic F owns their eventual cleanup.
            ..._rest
        } = props;

        this.root.dataset.type = "label";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        if (disabled) this.root.dataset.disabled = "";
        else delete this.root.dataset.disabled;
    }

    private applyConstructionRestProps(props: LabelProps): void {
        const {
            name: _name,
            variant: _variant,
            color: _color,
            size: _size,
            italic: _italic,
            bold: _bold,
            nowrap: _nowrap,
            required: _required,
            disabled: _disabled,
            children: _children,
            ...rest
        } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    private renderText(): void {
        const props = this.props;
        const textProps: TextStyleProps = {
            variant: props.variant ?? "default",
            color: props.color ?? "default",
            size: props.size ?? "sm",
            italic: props.italic,
            bold: props.bold,
            nowrap: props.nowrap ?? true,
        };
        const attributes = resolveTextAttributes(textProps);

        if (!this.textElement) {
            this.textElement = document.createElement("span");
            applyTextAttributes(this.textElement, attributes);
            this.root.append(this.textElement);
        } else {
            applyTextAttributes(this.textElement, attributes);
        }
        this.contentCleanup = fillSlot(this.textElement, props.children);

        if (props.required) {
            if (!this.requiredElement) {
                this.requiredElement = document.createElement("span");
                this.root.append(this.requiredElement);
            }
            applyTextAttributes(this.requiredElement, { ...attributes, color: "error", freeformColor: undefined });
            this.requiredCleanup = fillSlot(this.requiredElement, "*");
        } else if (this.requiredElement) {
            this.requiredCleanup?.();
            this.requiredCleanup = undefined;
            this.requiredElement.remove();
            this.requiredElement = undefined;
        }
    }

    private clearContent(): void {
        this.contentCleanup?.();
        this.requiredCleanup?.();
        this.contentCleanup = undefined;
        this.requiredCleanup = undefined;
        this.textElement?.remove();
        this.requiredElement?.remove();
        this.textElement = undefined;
        this.requiredElement = undefined;
    }
}
