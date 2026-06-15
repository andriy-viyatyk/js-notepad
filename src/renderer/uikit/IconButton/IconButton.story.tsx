import React from "react";
import { IconButton } from "./IconButton";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import { resolveIconPreset } from "../../editors/storybook/iconPresets";
import { SettingsIcon } from "../../theme/icons";
import { Story } from "../../editors/storybook/storyTypes";

const IconButtonWithPreset = (props: any) => {
    const { iconPreset, title, hideUntilParentHover, ...rest } = props;
    const icon = resolveIconPreset(iconPreset) ?? React.createElement(SettingsIcon);
    const iconButton = React.createElement(IconButton, {
        ...rest,
        title: title || undefined,
        hideUntilParentHover,
        icon,
    });
    if (!hideUntilParentHover) return iconButton;
    return React.createElement(
        Panel,
        { direction: "row", align: "center", gap: "md", padding: "md", border: true, rounded: "md", revealChildrenOnHover: true },
        React.createElement(Text, { color: "light", key: "hint" }, "Hover this row →"),
        iconButton,
    );
};

export const iconButtonStory: Story = {
    id: "icon-button",
    name: "IconButton",
    section: "Bootstrap",
    component: IconButtonWithPreset,
    props: [
        { name: "iconPreset", type: "icon", default: "folder", label: "Icon" },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "variant", type: "enum", options: ["default", "chip"], default: "default" },
        { name: "title", type: "string", default: "" },
        { name: "active", type: "boolean", default: false },
        { name: "warning", type: "boolean", default: false },
        { name: "disabled", type: "boolean", default: false },
        { name: "strikethrough", type: "boolean", default: false, label: "Strikethrough (diagonal line over icon)" },
        { name: "hideUntilParentHover", type: "boolean", default: false, label: "Hide until parent hover (wraps in a hover-reveal Panel)" },
    ],
};
