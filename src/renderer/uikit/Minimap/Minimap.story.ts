import { VanillaView } from "../shared/vanilla-view";
import { MinimapView } from "./MinimapView";
import type { MinimapProps } from "./Minimap";
import type { Story } from "../../editors/storybook/storyTypes";

interface MinimapDemoViewProps {}

class MinimapDemoView extends VanillaView<MinimapDemoViewProps> {
    private minimapView: MinimapView | undefined;

    public constructor(props: MinimapDemoViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "flex";
        this.root.style.width = "100%";
        this.root.style.height = "360px";
        this.root.style.gap = "8px";
    }

    protected onMount(): void {
        const scrollContainer = document.createElement("div");
        scrollContainer.style.flex = "1 1 auto";
        scrollContainer.style.overflow = "auto";
        scrollContainer.style.padding = "16px";
        for (let index = 0; index < 36; index++) {
            const line = document.createElement("div");
            line.style.padding = "6px 0";
            line.textContent = `${String(index + 1).padStart(2, "0")} — Minimap story content`;
            scrollContainer.append(line);
        }

        const minimapProps: MinimapProps = {
            name: "storybook-minimap",
            scrollContainer,
        };
        const minimapView = this.child(new MinimapView(minimapProps));
        this.minimapView = minimapView;
        this.root.append(scrollContainer, minimapView.root);
        minimapView.mount();
    }

    protected onDispose(): void {
        this.minimapView = undefined;
    }
}

export const minimapStory: Story<MinimapDemoViewProps> = {
    id: "minimap",
    name: "Minimap",
    section: "Media",
    view: MinimapDemoView,
    props: [],
};
