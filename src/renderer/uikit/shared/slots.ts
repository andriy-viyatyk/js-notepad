import { createElement, ReactNode } from "react";
import type { SvgIconProps } from "../../theme/icons";
import { getIcon } from "../../theme/icon-registry";
import type { IconName } from "../../theme/icon-registry";

export type IconRef = IconName | ReactNode;
export type SlotText = string | ReactNode;

type ImportMetaWithEnv = ImportMeta & {
    env?: {
        DEV?: boolean;
    };
};

const isDevelopment = (import.meta as ImportMetaWithEnv).env?.DEV === true;

export function renderIcon(icon: IconRef, props?: SvgIconProps): ReactNode {
    if (typeof icon !== "string") return icon;

    const Icon = getIcon(icon);
    if (!Icon) {
        if (isDevelopment) {
            console.warn(`[icon-registry] Unknown icon name "${icon}".`);
        }
        return null;
    }

    return createElement(Icon, props);
}
