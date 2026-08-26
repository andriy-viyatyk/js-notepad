import { IconButtonView } from "../IconButton/IconButtonView";
import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { CollapsiblePanelStackView } from "./CollapsiblePanelStackView";
import type { CollapsiblePanelProps, CollapsiblePanelStackProps } from "./CollapsiblePanelStack";
import type { Story } from "../../editors/storybook/storyTypes";

interface CollapsiblePanelStackDemoProps {
    width?: number;
    initialActive?: string;
}

function createActiveLabel(): { element: HTMLSpanElement; value: HTMLElement } {
    const element = createTextElement("");
    const value = document.createElement("strong");
    element.append(document.createTextNode("Active: "), value);
    return { element, value };
}

class CollapsiblePanelStackDemoView extends VanillaView<CollapsiblePanelStackDemoProps> {
    private active: string;
    private stackView: CollapsiblePanelStackView | undefined;
    private refreshButtonView: IconButtonView | undefined;
    private activeValue: HTMLElement | undefined;

    public constructor(props: CollapsiblePanelStackDemoProps) {
        super(props, createPanelElement({ direction: "row", gap: "xl", padding: "xl", height: 400 }));
        this.active = props.initialActive ?? "tags";
    }

    protected onMount(): void {
        const activeLabel = createActiveLabel();
        activeLabel.value.textContent = this.active;
        this.activeValue = activeLabel.value;
        const details = createPanelElement({ direction: "column", gap: "md" }, [
            activeLabel.element,
            createTextElement(
                "Click a panel header to switch. Click the active header to go back to the previous panel.",
                { size: "xs", color: "light" },
            ),
        ]);

        const refreshButton = new IconButtonView({
            size: "sm",
            title: "Refresh",
            icon: "refresh",
            onClick: () => alert("refresh"),
        });
        this.refreshButtonView = refreshButton;
        const stack = this.child(new CollapsiblePanelStackView(this.stackProps(this.props)));
        this.child(refreshButton);
        refreshButton.mount();
        this.stackView = stack;
        this.root.append(stack.root, details);
        stack.mount();
    }

    protected onUpdate(props: CollapsiblePanelStackDemoProps): void {
        this.stackView?.update(this.stackProps(props));
        if (this.activeValue) this.activeValue.textContent = this.active;
    }

    private readonly setActivePanel = (panelId: string): void => {
        this.active = panelId;
        this.stackView?.update(this.stackProps(this.props));
        if (this.activeValue) this.activeValue.textContent = this.active;
    };

    private stackProps(props: CollapsiblePanelStackDemoProps): Omit<CollapsiblePanelStackProps, "children"> & {
        panels: CollapsiblePanelProps[];
    } {
        return {
            activePanel: this.active,
            setActivePanel: this.setActivePanel,
            width: props.width ?? 240,
            minWidth: 100,
            maxWidth: "60%",
            panels: [
                {
                    id: "tags",
                    title: "Tags",
                    children: createPanelElement({ direction: "column", padding: "sm", gap: "sm" }, [
                        createTextElement("Tags content. Click another header to collapse this panel."),
                        createTextElement(
                            "Clicking the same header again returns to the previously expanded panel.",
                            { size: "xs", color: "light" },
                        ),
                    ]),
                },
                {
                    id: "categories",
                    title: "Categories",
                    children: createPanelElement({ direction: "column", padding: "sm", gap: "xs" }, [
                        createTextElement("Categories content."),
                        createTextElement("- Project", { size: "xs", color: "light" }),
                        createTextElement("- Settings", { size: "xs", color: "light" }),
                        createTextElement("- Dev", { size: "xs", color: "light" }),
                    ]),
                },
                {
                    id: "hostnames",
                    title: "Hostnames",
                    buttons: this.refreshButtonView?.root,
                    children: createPanelElement({ direction: "column", padding: "sm" }, [
                        createTextElement("Hostnames content. Header has a buttons slot — chevron is hidden."),
                    ]),
                },
            ],
        };
    }

    protected onDispose(): void {
        this.refreshButtonView = undefined;
        this.stackView = undefined;
        this.activeValue = undefined;
    }
}

export const collapsiblePanelStackStory: Story<CollapsiblePanelStackDemoProps> = {
    id: "collapsible-panel-stack",
    name: "CollapsiblePanelStack",
    section: "Layout",
    view: CollapsiblePanelStackDemoView,
    props: [
        { name: "width",         type: "number", default: 240, min: 100, max: 500, step: 20 },
        { name: "initialActive", type: "enum",   options: ["tags", "categories", "hostnames"], default: "tags" },
    ],
};
