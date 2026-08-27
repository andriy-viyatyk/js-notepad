import type React from "react";
import type { SvgIconProps } from "../../theme/icons";
import { getIcon } from "../../theme/icon-registry";
import type { IconName } from "../../theme/icon-registry";

// A registry name or a freshly built DOM node. Admitting `Node` here lets callers hand over a
// built SVG without an `as unknown as` cast at every site.
export type IconRef = IconName | Node;
export type SlotText = string | React.ReactNode;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Create the visible recovery icon used when external data contains an unknown icon name. */
export function createIconPlaceholderElement(props?: SvgIconProps): SVGElement {
    const {
        viewBox = "0 0 24 24",
        width = 24,
        height = 24,
        className,
        color,
        style,
        ref: _ref,
        ...otherProps
    } = props ?? {};
    const element = document.createElementNS(SVG_NAMESPACE, "svg");
    element.setAttribute("viewBox", viewBox);
    element.setAttribute("width", String(width));
    element.setAttribute("height", String(height));
    element.setAttribute("data-icon-placeholder", "true");
    element.classList.add("icon-placeholder");
    if (className) element.classList.add(...className.split(/\s+/).filter(Boolean));
    if (color != null) {
        element.setAttribute("color", String(color));
        element.style.color = String(color);
    }
    if (typeof style === "string") element.setAttribute("style", style);
    else if (style) {
        for (const [name, value] of Object.entries(style)) {
            if (value != null && typeof value !== "boolean") {
                element.style.setProperty(name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), String(value));
            }
        }
    }
    for (const [name, value] of Object.entries(otherProps)) {
        if (value == null || name === "children" || name === "ref" || /^on[A-Z]/.test(name)) continue;
        const attribute = name === "className" ? "class" : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        element.setAttribute(attribute, String(value));
    }
    element.innerHTML = "<path d=\"M6 6L18 18M18 6L6 18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/>";
    return element;
}

export function isIconName(value: string): value is IconName {
    return getIcon(value) !== undefined;
}

export function createIconElement(name: IconName, props?: SvgIconProps): SVGElement {
    const Icon = getIcon(name);
    if (!Icon) {
        throw new Error(`Icon registry invariant violated for "${name}".`);
    }

    return Icon.createElement(props);
}
