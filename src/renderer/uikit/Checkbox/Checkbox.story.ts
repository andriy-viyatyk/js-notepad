import type { CheckboxProps } from "./Checkbox";
import { CheckboxView } from "./CheckboxView";
import type { Story } from "../../editors/storybook/storyTypes";

export const checkboxStory: Story<CheckboxProps> = {
    id: "checkbox",
    name: "Checkbox",
    section: "Bootstrap",
    view: CheckboxView,
    props: [
        { name: "checked", type: "boolean", default: false },
        { name: "children", type: "string", default: "Checkbox label" },
        { name: "disabled", type: "boolean", default: false },
    ],
    defaultProps: {
        onChange: () => {},
    },
};
