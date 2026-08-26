import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { BreadcrumbView } from "./BreadcrumbView";
import type { BreadcrumbProps } from "./Breadcrumb";
import "./Breadcrumb.css";
import type { Story } from "../../editors/storybook/storyTypes";

interface BreadcrumbDemoViewProps {
    rootLabel?: string;
    initialValue?: string;
    separators?: string;
    trailingParentSeparator?: boolean;
    separatorContent?: string;
    size?: "sm" | "md";
}

class BreadcrumbDemoView extends VanillaView<BreadcrumbDemoViewProps> {
    private value: string;
    private breadcrumbView: BreadcrumbView | undefined;
    private valueText: HTMLSpanElement | undefined;

    public constructor(props: BreadcrumbDemoViewProps) {
        super(props, createPanelElement({ direction: "column", gap: "xl", padding: "xl", width: 520 }));
        this.value = props.initialValue ?? "project/settings/dev";
    }

    protected onMount(): void {
        const breadcrumbView = this.child(new BreadcrumbView(this.configurableProps(this.props)));
        this.breadcrumbView = breadcrumbView;
        this.valueText = createTextElement(`value: "${this.value}"`, { size: "xs", color: "light" });
        const configurablePanel = createPanelElement({ direction: "column", gap: "sm" }, [
            createTextElement("Configurable (click segments to navigate):", { size: "xs", color: "light" }),
            breadcrumbView.root,
            this.valueText,
        ]);

        const staticPanel = createPanelElement({ direction: "column", gap: "md" }, [
            createTextElement("Static examples:", { size: "xs", color: "light" }),
        ]);
        this.addStatic(staticPanel, { rootLabel: "Categories", value: "" });
        this.addStatic(staticPanel, { rootLabel: "Categories", value: "release" });
        this.addStatic(staticPanel, { rootLabel: "Categories", value: "release/1.0.1" });
        this.addStatic(staticPanel, {
            rootLabel: "Tags", value: "release:1.0.1", separators: ":", trailingParentSeparator: true,
        });
        this.addStatic(staticPanel, { rootLabel: "Path", value: "src/renderer/uikit/Breadcrumb", separatorContent: "/" });
        this.addStatic(staticPanel, { rootLabel: "Path", value: "src/renderer/uikit", size: "sm" });

        this.root.append(configurablePanel, staticPanel);
        breadcrumbView.mount();
        this.staticViews.forEach((view) => view.mount());
    }

    protected onUpdate(props: BreadcrumbDemoViewProps): void {
        this.valueText && (this.valueText.textContent = `value: "${this.value}"`);
        this.breadcrumbView?.update(this.configurableProps(props));
    }

    protected onDispose(): void {
        this.breadcrumbView = undefined;
        this.valueText = undefined;
        this.staticViews.length = 0;
    }

    private readonly staticViews: BreadcrumbView[] = [];

    private addStatic(panel: HTMLDivElement, props: Omit<BreadcrumbProps, "onChange">): void {
        const view = this.child(new BreadcrumbView({ ...props, onChange: () => {} }));
        this.staticViews.push(view);
        panel.append(view.root);
    }

    private configurableProps(props: BreadcrumbDemoViewProps): BreadcrumbProps {
        return {
            rootLabel: props.rootLabel ?? "Categories",
            value: this.value,
            onChange: this.setValue,
            separators: props.separators,
            trailingParentSeparator: props.trailingParentSeparator,
            separatorContent: props.separatorContent,
            size: props.size,
        };
    }

    private readonly setValue = (value: string): void => {
        this.value = value;
        this.valueText && (this.valueText.textContent = `value: "${value}"`);
        this.breadcrumbView?.update(this.configurableProps(this.props));
    };
}

export const breadcrumbStory: Story<BreadcrumbDemoViewProps> = {
    id: "breadcrumb",
    name: "Breadcrumb",
    section: "Bootstrap",
    view: BreadcrumbDemoView,
    props: [
        { name: "rootLabel",               type: "string",  default: "Categories" },
        { name: "initialValue",            type: "string",  default: "project/settings/dev" },
        { name: "separators",              type: "string",  default: "/\\" },
        { name: "trailingParentSeparator", type: "boolean", default: false },
        { name: "separatorContent",        type: "string",  default: ">" },
        { name: "size",                    type: "enum",    options: ["sm", "md"], default: "md" },
    ],
};
