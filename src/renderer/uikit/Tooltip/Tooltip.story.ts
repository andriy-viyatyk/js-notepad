import type { Placement } from "@floating-ui/dom";
import { ButtonView } from "../Button/ButtonView";
import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { attachTooltip, type TooltipAttachment, type TooltipOptions } from "./attach-tooltip";
import type { Story } from "../../editors/storybook/storyTypes";

const PLACEMENTS: Placement[] = [
    "top", "top-start", "top-end",
    "bottom", "bottom-start", "bottom-end",
    "left", "left-start", "left-end",
    "right", "right-start", "right-end",
];

interface TooltipDemoProps {
    placement?: Placement;
    delayShow?: number;
    delayHide?: number;
    offsetX?: number;
    offsetY?: number;
    richContent?: boolean;
    disabled?: boolean;
}

class TooltipDemoView extends VanillaView<TooltipDemoProps> {
    private triggerView: ButtonView | undefined;
    private attachment: TooltipAttachment | undefined;
    private richContent: HTMLDivElement | undefined;

    public constructor(props: TooltipDemoProps) {
        super(props, createPanelElement({ direction: "column", gap: "lg", padding: "xl", align: "start" }));
    }

    protected onMount(): void {
        const trigger = this.child(new ButtonView({ children: "Hover me" }));
        this.triggerView = trigger;
        this.root.append(
            createTextElement(
                "Hover the button. Default delays: 800 ms show, 100 ms hide.",
                { size: "sm", color: "light" },
            ),
            trigger.root,
        );
        trigger.mount();
        this.attachment = attachTooltip(trigger.root, this.tooltipOptions(this.props));
        this.own(() => this.attachment?.dispose());
    }

    protected onUpdate(props: TooltipDemoProps): void {
        this.attachment?.update(this.tooltipOptions(props));
    }

    private tooltipOptions(props: TooltipDemoProps): TooltipOptions {
        return {
            content: this.tooltipContent(props.richContent ?? false),
            placement: props.placement ?? "top",
            offset: [props.offsetX ?? 0, props.offsetY ?? 8],
            delayShow: props.delayShow ?? 800,
            delayHide: props.delayHide ?? 100,
            disabled: props.disabled ?? false,
        };
    }

    private tooltipContent(rich: boolean): string | Node {
        if (!rich) return "Hello from Tooltip";
        if (!this.richContent) {
            this.richContent = createPanelElement({ direction: "column", gap: "sm" }, [
                createTextElement("Rich content", { bold: true }),
                createTextElement("Multi-line tooltip body with secondary text.", { size: "sm", color: "light" }),
                createTextElement("Hover the tooltip itself — it stays open while the cursor is on it.", { size: "sm" }),
            ]);
        }
        return this.richContent;
    }

    protected onDispose(): void {
        this.triggerView = undefined;
        this.attachment = undefined;
        this.richContent = undefined;
    }
}

export const tooltipStory: Story<TooltipDemoProps> = {
    id: "tooltip",
    name: "Tooltip",
    section: "Overlay",
    view: TooltipDemoView,
    props: [
        { name: "placement",   type: "enum",    options: PLACEMENTS, default: "top" },
        { name: "delayShow",   type: "number",  default: 800 },
        { name: "delayHide",   type: "number",  default: 100 },
        { name: "offsetX",     type: "number",  default: 0 },
        { name: "offsetY",     type: "number",  default: 8 },
        { name: "richContent", type: "boolean", default: false },
        { name: "disabled",    type: "boolean", default: false },
    ],
};
