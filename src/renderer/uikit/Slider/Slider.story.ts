import type { SliderProps } from "./SliderView";
import { SliderView } from "./SliderView";
import type { Story } from "../../editors/storybook/storyTypes";

export const sliderStory: Story<SliderProps> = {
    id: "slider",
    name: "Slider",
    section: "Bootstrap",
    view: SliderView,
    props: [
        { name: "value", type: "number", default: 50, min: 0, max: 100, step: 1 },
        { name: "min", type: "number", default: 0 },
        { name: "max", type: "number", default: 100 },
        { name: "step", type: "number", default: 1, min: 0.01, step: 0.01 },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "disabled", type: "boolean", default: false },
        { name: "showProgress", type: "boolean", default: false, label: "Show progress (fill played portion)" },
        { name: "width", type: "number", default: 0, min: 0, max: 600, step: 10, label: "Width (0 = fill parent)" },
    ],
    defaultProps: {
        onChange: () => {},
    },
};
