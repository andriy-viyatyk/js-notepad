import type { LabelProps } from "./Label";
import { LabelView } from "./LabelView";
import type { Story } from "../../editors/storybook/storyTypes";

export const labelStory: Story<LabelProps> = {
    id: "label",
    name: "Label",
    section: "Bootstrap",
    view: LabelView,
    props: [
        { name: "children", type: "string", default: "Field label" },
        { name: "variant", type: "enum", options: ["default", "uppercased"], default: "default" },
        { name: "color",   type: "enum", options: ["default", "light", "dark", "inherit", "error", "warning", "success", "primary"], default: "default" },
        { name: "size",    type: "enum", options: ["xs", "sm", "md", "base", "lg", "xl", "xxl"], default: "sm" },
        { name: "italic",  type: "boolean", default: false },
        { name: "bold",    type: "boolean", default: false },
        { name: "nowrap",  type: "boolean", default: true },
        { name: "required", type: "boolean", default: false },
        { name: "disabled", type: "boolean", default: false },
    ],
};
