import React from "react";
import { SplitButton } from "./SplitButton";
import { resolveIconPreset } from "../../editors/storybook/iconPresets";
import { createIconElement } from "../shared/slots";
import { Story } from "../../editors/storybook/storyTypes";

const SplitButtonWithPreset = (props: any) => {
    const { iconPreset, title, menuTitle, ...rest } = props;
    // A DOM icon node is single-use: appending it to a second host *moves* it, blanking the first.
    // The primary button and the menu row are two hosts, so each needs its own node.
    const makeIcon = () => resolveIconPreset(iconPreset) ?? createIconElement("download");
    return React.createElement(SplitButton, {
        ...rest,
        title: title || undefined,
        menuTitle: menuTitle || undefined,
        icon: makeIcon(),
        onClick: () => console.log("SplitButton primary clicked"),
        items: [
            { label: "Pull (merge)", icon: makeIcon(), onClick: () => console.log("Pull (merge)") },
            { label: "Fetch all", startGroup: true, onClick: () => console.log("Fetch all") },
        ],
    });
};

export const splitButtonStory: Story = {
    id: "split-button",
    name: "SplitButton",
    section: "Bootstrap",
    component: SplitButtonWithPreset,
    props: [
        { name: "iconPreset", type: "icon", default: "folder", label: "Primary icon" },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "title", type: "string", default: "Pull — merge" },
        { name: "menuTitle", type: "string", default: "More actions" },
        { name: "disabled", type: "boolean", default: false, label: "Disable primary" },
        { name: "menuDisabled", type: "boolean", default: false, label: "Disable caret" },
    ],
};
