import type { SpinnerProps } from "./SpinnerView";
import { SpinnerView } from "./SpinnerView";
import type { Story } from "../../editors/storybook/storyTypes";

export const spinnerStory: Story<SpinnerProps> = {
    id: "spinner",
    name: "Spinner",
    section: "Bootstrap",
    view: SpinnerView,
    props: [
        { name: "size", type: "number", default: 32, min: 12, max: 96, step: 2 },
        { name: "color", type: "string", default: "" },
    ],
};
