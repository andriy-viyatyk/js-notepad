import { TruncatedTextView, type TruncatedTextViewProps } from "./TruncatedTextView";
import type { Story } from "../../editors/storybook/storyTypes";

export const truncatedTextStory: Story<TruncatedTextViewProps> = {
    id: "truncated-text",
    name: "TruncatedText",
    section: "Bootstrap",
    view: TruncatedTextView,
    props: [
        { name: "children", type: "string", default: "Some very long text that will overflow its container when constrained" },
        { name: "name", type: "string", default: "" },
    ],
};
