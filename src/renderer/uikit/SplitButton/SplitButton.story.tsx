import React from "react";
import { SplitButton } from "./SplitButton";
import { resolveIconPreset } from "../../editors/storybook/iconPresets";
import { DownloadIcon } from "../../theme/icons";
import { Story } from "../../editors/storybook/storyTypes";

const SplitButtonWithPreset = (props: any) => {
    const { iconPreset, title, menuTitle, ...rest } = props;
    const icon = resolveIconPreset(iconPreset) ?? React.createElement(DownloadIcon);
    return React.createElement(SplitButton, {
        ...rest,
        title: title || undefined,
        menuTitle: menuTitle || undefined,
        icon,
        onClick: () => console.log("SplitButton primary clicked"),
        items: [
            { label: "Pull (merge)", icon, onClick: () => console.log("Pull (merge)") },
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
