import { createPanelElement } from "../Panel/panel-style";
import { VanillaView } from "../shared/vanilla-view";
import { DotView } from "./DotView";
import type { DotColor, DotProps } from "./DotView";
import type { Story } from "../../editors/storybook/storyTypes";

interface DotDemoViewProps {
    size?: string;
    color?: string;
    bordered?: boolean;
    selected?: boolean;
    clickable?: boolean;
}

const NAMED_SIZES = new Set(["xs", "sm", "md", "lg"]);

function parseSize(raw: string | undefined): "xs" | "sm" | "md" | "lg" | number {
    if (!raw) return "sm";
    if (NAMED_SIZES.has(raw)) return raw as "xs" | "sm" | "md" | "lg";
    const numberValue = Number(raw);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : "sm";
}

const SEMANTIC_COLORS: DotColor[] = ["success", "warning", "error", "info", "neutral", "active"];
const SAMPLE_HEX_COLORS = ["#e91e63", "#9c27b0", "#3f51b5", "#ff9800"];

function createText(text: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.textContent = text;
    return element;
}

function createHoverText(): HTMLSpanElement {
    const element = createText("");
    element.append(
        document.createTextNode("Hide until parent hover — pair with "),
        Object.assign(document.createElement("code"), { textContent: "Panel revealChildrenOnHover" }),
        document.createTextNode(". Hover the row below; the second dot fades in."),
    );
    return element;
}

class DotDemoView extends VanillaView<DotDemoViewProps> {
    private configurableDot: DotView | undefined;

    public constructor(props: DotDemoViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        const dots: DotView[] = [];
        const dot = (props: DotProps): HTMLSpanElement => {
            const view = this.child(new DotView(props));
            dots.push(view);
            return view.root;
        };
        const configurableDot = this.child(new DotView(this.configurableProps(this.props)));
        this.configurableDot = configurableDot;
        dots.push(configurableDot);

        const sizesNamed = createPanelElement({ direction: "column", gap: "md" }, [
            createText("Sizes (named — xs, sm, md, lg):"),
            createPanelElement({ direction: "row", align: "center", gap: "md" }, [
                dot({ size: "xs", color: "success" }),
                dot({ size: "sm", color: "success" }),
                dot({ size: "md", color: "success" }),
                dot({ size: "lg", color: "success" }),
            ]),
        ]);
        const sizesNumeric = createPanelElement({ direction: "column", gap: "md" }, [
            createText("Sizes (numeric — 7, 10, 14, 20):"),
            createPanelElement({ direction: "row", align: "center", gap: "md" }, [
                dot({ size: 7, color: "success" }),
                dot({ size: 10, color: "success" }),
                dot({ size: 14, color: "success" }),
                dot({ size: 20, color: "success" }),
            ]),
        ]);
        const semanticColors = createPanelElement({ direction: "column", gap: "md" }, [
            createText("Semantic colors:"),
            createPanelElement({ direction: "row", align: "center", gap: "md" },
                SEMANTIC_COLORS.map((color) => dot({ size: "md", color, title: color }))),
        ]);
        const rawColors = createPanelElement({ direction: "column", gap: "md" }, [
            createText("Raw hex (palette colors, with border):"),
            createPanelElement({ direction: "row", align: "center", gap: "md" },
                SAMPLE_HEX_COLORS.map((color) => dot({ size: "md", color, bordered: true, title: color }))),
        ]);
        const selection = createPanelElement({ direction: "column", gap: "md" }, [
            createText("Selection ring (palette swatches — middle one is selected):"),
            createPanelElement({ direction: "row", align: "center", gap: "md" }, [
                dot({ size: "lg", color: "#e91e63", selected: false, onClick: () => {}, title: "Pink" }),
                dot({ size: "lg", color: "#9c27b0", selected: true, onClick: () => {}, title: "Purple (selected)" }),
                dot({ size: "lg", color: "#3f51b5", selected: false, onClick: () => {}, title: "Blue" }),
            ]),
        ]);
        const hover = createPanelElement({ direction: "column", gap: "md" }, [
            createText("Hover affordance (hover over the dots):"),
            createPanelElement({ direction: "row", align: "center", gap: "md" }, [
                dot({ size: "md", color: "#444444", onClick: () => {}, title: "Clickable" }),
                dot({ size: "md", color: "success", onClick: () => {}, title: "Clickable" }),
                dot({ size: "md", color: "#ff9800", bordered: true, onClick: () => {}, title: "Clickable bordered" }),
            ]),
        ]);
        const bordered = createPanelElement({ direction: "column", gap: "md" }, [
            createText("Bordered vs. non-bordered (same dark color):"),
            createPanelElement({ direction: "row", align: "center", gap: "md" }, [
                dot({ size: "md", color: "#444444" }),
                dot({ size: "md", color: "#444444", bordered: true }),
            ]),
        ]);
        const reveal = createPanelElement({ direction: "column", gap: "md" }, [
            createHoverText(),
            createPanelElement({
                direction: "row", align: "center", gap: "md", padding: "md", border: true,
                rounded: "md", revealChildrenOnHover: true,
            }, [
                dot({ size: "md", color: "success", title: "Always visible" }),
                createText("Some row content"),
                dot({ size: "md", color: "info", hideUntilParentHover: true, title: "Revealed on hover" }),
            ]),
        ]);
        const configurable = createPanelElement({ direction: "row", align: "center", gap: "md" }, [
            createText("Configurable:"), configurableDot.root,
        ]);
        const outer = createPanelElement({ direction: "column", gap: "xl", padding: "xl" }, [
            configurable, sizesNamed, sizesNumeric, semanticColors, rawColors,
            selection, hover, bordered, reveal,
        ]);
        this.root.append(outer);
        dots.forEach((view) => view.mount());
    }

    protected onUpdate(props: DotDemoViewProps): void {
        this.configurableDot?.update(this.configurableProps(props));
    }

    protected onDispose(): void {
        this.configurableDot = undefined;
    }

    private configurableProps(props: DotDemoViewProps): DotProps {
        return {
            size: parseSize(props.size),
            color: props.color ?? "success",
            bordered: props.bordered,
            selected: props.selected,
            onClick: props.clickable ? () => console.log("dot clicked") : undefined,
            title: "Configurable dot",
        };
    }
}

export const dotStory: Story<DotDemoViewProps> = {
    id: "dot",
    name: "Dot",
    section: "Bootstrap",
    view: DotDemoView,
    props: [
        {
            name: "size",
            type: "enum",
            options: ["xs", "sm", "md", "lg", "7", "10", "14", "20"],
            default: "sm",
        },
        {
            name: "color",
            type: "enum",
            options: [
                "success", "warning", "error", "info", "neutral", "active",
                "#e91e63", "#9c27b0", "#3f51b5", "#ff9800",
            ],
            default: "success",
        },
        { name: "bordered", type: "boolean", default: false },
        { name: "selected", type: "boolean", default: false },
        { name: "clickable", type: "boolean", default: false },
    ],
};
