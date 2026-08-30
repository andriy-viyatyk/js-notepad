import { createIconElement, type IconRef } from "../shared/slots";
import { VanillaView } from "../shared/vanilla-view";
import { SplitButtonView } from "./SplitButtonView";
import type { SplitButtonProps } from "./SplitButtonView";
import type { Story } from "../../editors/storybook/storyTypes";

type SplitButtonDemoViewProps = Omit<SplitButtonProps, "icon"> & {
    icon?: IconRef | null;
};

function createContentsHost(): HTMLDivElement {
    const element = document.createElement("div");
    element.style.display = "contents";
    return element;
}

class SplitButtonDemoView extends VanillaView<SplitButtonDemoViewProps> {
    private splitButtonView: SplitButtonView | undefined;

    public constructor(props: SplitButtonDemoViewProps) {
        super(props, createContentsHost());
    }

    protected onMount(): void {
        const splitButtonView = this.child(new SplitButtonView(this.splitButtonProps(this.props)));
        this.splitButtonView = splitButtonView;
        this.root.append(splitButtonView.root);
        splitButtonView.mount();
    }

    protected onUpdate(props: SplitButtonDemoViewProps): void {
        this.splitButtonView?.update(this.splitButtonProps(props));
    }

    private splitButtonProps(props: SplitButtonDemoViewProps): SplitButtonProps {
        const { icon: _icon, title, menuTitle, ...rest } = props;
        return {
            ...rest,
            title: title || undefined,
            menuTitle: menuTitle || undefined,
            icon: this.makeIcon(props),
            onClick: () => console.log("SplitButton primary clicked"),
            items: [
                { label: "Pull (merge)", icon: this.makeIcon(props), onClick: () => console.log("Pull (merge)") },
                { label: "Fetch all", startGroup: true, onClick: () => console.log("Fetch all") },
            ],
        };
    }

    private makeIcon(props: SplitButtonDemoViewProps): IconRef {
        if (props.icon instanceof Node) {
            return props.icon.cloneNode(true);
        }
        return props.icon ?? createIconElement("download");
    }
}

export const splitButtonStory: Story<SplitButtonDemoViewProps> = {
    id: "split-button",
    name: "SplitButton",
    section: "Bootstrap",
    view: SplitButtonDemoView,
    props: [
        { name: "icon", type: "icon", default: "folder", label: "Primary icon" },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "title", type: "string", default: "Pull — merge" },
        { name: "menuTitle", type: "string", default: "More actions" },
        { name: "disabled", type: "boolean", default: false, label: "Disable primary" },
        { name: "menuDisabled", type: "boolean", default: false, label: "Disable caret" },
    ],
};
