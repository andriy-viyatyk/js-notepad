import type { ProgressBarProps } from "./ProgressBarView";
import { ProgressBarView } from "./ProgressBarView";
import type { Story } from "../../editors/storybook/storyTypes";

export const progressBarStory: Story<ProgressBarProps> = {
    id: "progress-bar",
    name: "ProgressBar",
    section: "Bootstrap",
    view: ProgressBarView,
    props: [
        { name: "value", type: "number", default: 50, min: 0, max: 100, step: 1 },
        { name: "max", type: "number", default: 100, min: 1, max: 1000, step: 1 },
        { name: "completed", type: "boolean", default: false },
        { name: "variant", type: "enum", options: ["default", "success", "warning", "danger"], default: "default" },
        { name: "height", type: "number", default: 6, min: 2, max: 24, step: 1 },
        { name: "width", type: "number", default: 240, min: 80, max: 600, step: 20, label: "Width (px)" },
    ],
};
