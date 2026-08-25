import type React from "react";
import type { SvgIconProps } from "../../theme/icons";
import { getIcon } from "../../theme/icon-registry";
import type { IconName } from "../../theme/icon-registry";

// A registry name or a freshly built DOM node. Admitting `Node` here lets callers hand over a
// built SVG without an `as unknown as` cast at every site.
export type IconRef = IconName | Node;
export type SlotText = string | React.ReactNode;

type ImportMetaWithEnv = ImportMeta & {
    env?: {
        DEV?: boolean;
    };
};

const isDevelopment = (import.meta as ImportMetaWithEnv).env?.DEV === true;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function createEmptyIconElement(viewBox = "0 0 24 24", props?: SvgIconProps): SVGElement {
    const element = document.createElementNS(SVG_NAMESPACE, "svg");
    element.setAttribute("viewBox", viewBox);
    element.setAttribute("width", String(props?.width ?? 24));
    element.setAttribute("height", String(props?.height ?? 24));
    if (props?.className) element.setAttribute("class", props.className);
    return element;
}

export function isIconName(value: string): value is IconName {
    return getIcon(value) !== undefined;
}

export function createIconElement(name: IconName, props?: SvgIconProps): SVGElement {
    const Icon = getIcon(name);
    if (!Icon) {
        if (isDevelopment) {
            console.warn(`[icon-registry] Unknown icon name "${name}".`);
        }
        return createEmptyIconElement(undefined, props);
    }

    if (!Icon.createElement) {
        if (isDevelopment) {
            console.warn(`[icon-registry] Icon "${name}" has no DOM builder.`);
        }
        return createEmptyIconElement(Icon.viewBox, props);
    }

    return Icon.createElement(props);
}
