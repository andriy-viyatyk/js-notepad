import type { Placement } from "@floating-ui/dom";
import { ButtonView } from "../Button/ButtonView";
import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { SubtreeSwap } from "../shared/subtree-swap";
import { VanillaView } from "../shared/vanilla-view";
import { PopoverView, type PopoverViewProps } from "./PopoverView";
import color from "../../theme/color";
import type { Story } from "../../editors/storybook/storyTypes";

const PLACEMENTS: Placement[] = [
    "top", "top-start", "top-end",
    "bottom", "bottom-start", "bottom-end",
    "left", "left-start", "left-end",
    "right", "right-start", "right-end",
];

interface PopoverDemoProps {
    placement?: Placement;
    offsetX?: number;
    offsetY?: number;
    maxHeight?: string;
    longContent?: boolean;
    useIgnoreSelector?: boolean;
    matchAnchorWidth?: boolean;
    resizable?: boolean;
}

interface PopoverContentProps {
    placement: Placement;
    longContent: boolean;
    resizable: boolean;
}

class PopoverContentView extends VanillaView<PopoverContentProps> {
    private contentPanel: HTMLDivElement | undefined;

    public constructor(props: PopoverContentProps, host: HTMLElement) {
        super(props, host);
    }

    protected onMount(): void {
        this.contentPanel = createPanelElement({
            direction: "column",
            padding: "md",
            gap: "sm",
            minWidth: "200px",
        });
        this.root.append(this.contentPanel);
        this.renderContent(this.props);
    }

    protected onUpdate(props: PopoverContentProps): void {
        this.renderContent(props);
    }

    private renderContent(props: PopoverContentProps): void {
        if (!this.contentPanel) return;
        const children: Node[] = [
            createTextElement("Hello from Popover"),
            createTextElement(`Placement: ${props.placement}`, { size: "sm", color: "light" }),
        ];
        if (props.resizable) {
            children.push(createTextElement(
                "Long line that overflows when the popover is narrow — drag the bottom-right corner to enlarge.",
                { size: "sm" },
            ));
        }
        if (props.longContent) {
            for (let index = 0; index < 30; index++) {
                children.push(createTextElement(`Item ${index + 1}`, { size: "sm" }));
            }
        }
        this.contentPanel.replaceChildren(...children);
    }
}

class PopoverDemoView extends VanillaView<PopoverDemoProps> {
    private open = false;
    private anchorView: ButtonView | undefined;
    private popoverView: PopoverView | undefined;
    private contentView: PopoverContentView | undefined;
    private popoverSwap: SubtreeSwap<"open"> | undefined;
    private ignoreSibling: HTMLSpanElement | undefined;

    public constructor(props: PopoverDemoProps) {
        super(props, createPanelElement({
            direction: "column",
            gap: "md",
            padding: "lg",
            align: "start",
        }));
    }

    protected onMount(): void {
        this.popoverSwap = new SubtreeSwap(this.root);
        this.own(() => this.popoverSwap?.dispose());

        const anchor = this.child(new ButtonView({
            children: this.buttonLabel(),
            onClick: this.togglePopover,
        }));
        this.anchorView = anchor;

        const controls: Node[] = [anchor.root];
        if (this.props.useIgnoreSelector) {
            this.ignoreSibling = document.createElement("span");
            this.ignoreSibling.dataset.testIgnore = "true";
            this.ignoreSibling.style.padding = "6px";
            this.ignoreSibling.style.border = `1px dashed ${color.border.default}`;
            this.ignoreSibling.textContent = "Ignored sibling — clicking here should NOT close popover";
            controls.push(this.ignoreSibling);
        }

        const row = createPanelElement({ direction: "row", gap: "md", align: "center" }, controls);
        this.root.append(row);
        anchor.mount();
        this.syncPopover();
    }

    protected onUpdate(props: PopoverDemoProps): void {
        if (this.ignoreSibling && !props.useIgnoreSelector) {
            this.ignoreSibling.remove();
            this.ignoreSibling = undefined;
        }
        if (props.useIgnoreSelector && !this.ignoreSibling) {
            const sibling = document.createElement("span");
            sibling.dataset.testIgnore = "true";
            sibling.style.padding = "6px";
            sibling.style.border = `1px dashed ${color.border.default}`;
            sibling.textContent = "Ignored sibling — clicking here should NOT close popover";
            this.ignoreSibling = sibling;
            const row = this.anchorView?.root.parentElement;
            row?.append(sibling);
        }
        this.anchorView?.update({
            children: this.buttonLabel(),
            onClick: this.togglePopover,
        });
        this.syncPopover();
    }

    private readonly togglePopover = (): void => {
        this.open = !this.open;
        this.anchorView?.update({
            children: this.buttonLabel(),
            onClick: this.togglePopover,
        });
        this.syncPopover();
    };

    private readonly closePopover = (): void => {
        this.open = false;
        this.anchorView?.update({
            children: this.buttonLabel(),
            onClick: this.togglePopover,
        });
        this.syncPopover();
    };

    private syncPopover(): void {
        if (!this.popoverSwap) return;
        if (!this.open) {
            this.contentView = undefined;
            this.popoverView = undefined;
            this.popoverSwap.clear();
            return;
        }

        const props = this.popoverProps(this.props);
        if (this.popoverView) {
            this.popoverView.update(props);
            this.contentView?.update(this.contentProps(this.props));
            return;
        }

        let created: PopoverView | undefined;
        this.popoverSwap.set("open", () => {
            created = new PopoverView(props);
            this.popoverView = created;
            return created;
        });
        if (created) {
            try {
                created.mount();
            } catch (error) {
                this.popoverView = undefined;
                this.contentView = undefined;
                try {
                    this.popoverSwap.clear();
                } catch {
                    // Preserve the original mount failure after attempting cleanup.
                }
                throw error;
            }
        }
    }

    private popoverProps(props: PopoverDemoProps): PopoverViewProps {
        return {
            open: true,
            elementRef: this.anchorView?.root ?? null,
            placement: props.placement ?? "bottom-start",
            offset: [props.offsetX ?? 0, props.offsetY ?? 4],
            maxHeight: props.maxHeight || undefined,
            outsideClickIgnoreSelector: props.useIgnoreSelector
                ? '[data-test-ignore="true"]'
                : undefined,
            matchAnchorWidth: props.matchAnchorWidth,
            resizable: props.resizable,
            onClose: this.closePopover,
            contentView: (host) => {
                const content = new PopoverContentView(this.contentProps(this.props), host);
                this.contentView = content;
                return content;
            },
        };
    }

    private contentProps(props: PopoverDemoProps): PopoverContentProps {
        return {
            placement: props.placement ?? "bottom-start",
            longContent: props.longContent ?? false,
            resizable: props.resizable ?? false,
        };
    }

    private buttonLabel(): string {
        return this.open ? "Close popover" : "Open popover";
    }

    protected onDispose(): void {
        this.ignoreSibling = undefined;
        this.anchorView = undefined;
        this.popoverView = undefined;
        this.contentView = undefined;
        this.popoverSwap = undefined;
    }
}

export const popoverStory: Story<PopoverDemoProps> = {
    id: "popover",
    name: "Popover",
    section: "Overlay",
    view: PopoverDemoView,
    props: [
        { name: "placement",         type: "enum",    options: PLACEMENTS, default: "bottom-start" },
        { name: "offsetX",           type: "number",  default: 0 },
        { name: "offsetY",           type: "number",  default: 4 },
        { name: "maxHeight",         type: "string",  default: "" },
        { name: "longContent",       type: "boolean", default: false },
        { name: "useIgnoreSelector", type: "boolean", default: false },
        { name: "matchAnchorWidth",  type: "boolean", default: false },
        { name: "resizable",         type: "boolean", default: false },
    ],
};
