import { find, html, svg, type Info, type Schema } from "property-information";
import type { Element as HastElement, Properties } from "hast";

export type HastNamespace = "html" | "svg";
export type HastProperties = Record<string, unknown>;

const NAMESPACE_URIS: Record<string, string> = {
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/XML/1998/namespace",
    xmlns: "http://www.w3.org/2000/xmlns/",
};

function schemaFor(namespace: HastNamespace): Schema {
    return namespace === "svg" ? svg : html;
}

function isEventProperty(name: string): boolean {
    return name.toLowerCase().startsWith("on");
}

function isNaNValue(value: unknown): boolean {
    return typeof value === "number" && Number.isNaN(value);
}

function serializeArray(info: Info, value: unknown[]): string {
    const items = value.filter((item) => item != null && !isNaNValue(item));
    // This follows hast-util-to-jsx-runtime: comma-separated properties use
    // commas, while every other array property uses spaces. The two metadata
    // flags below make that choice explicit for SVG and HTML schemas.
    if (info.commaSeparated) return items.join(",");
    if (info.commaOrSpaceSeparated || info.spaceSeparated) return items.join(" ");
    return items.join(" ");
}

function serializeValue(info: Info, value: unknown): unknown {
    return Array.isArray(value) ? serializeArray(info, value) : value;
}

function cssPropertyName(name: string): string {
    if (name.startsWith("--")) return name;
    const cssName = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    return cssName.startsWith("ms-") ? `-${cssName}` : cssName;
}

function styleObjectToString(value: Record<string, unknown>): string {
    return Object.entries(value)
        .filter(([, item]) => item != null && typeof item !== "boolean" && !isNaNValue(item))
        .map(([name, item]) => `${cssPropertyName(name)}: ${String(item)};`)
        .join(" ");
}

function applyStyle(element: globalThis.Element, value: unknown): void {
    if (typeof value === "string") {
        element.setAttribute("style", value);
        return;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) return;

    const styledElement = element as unknown as HTMLElement | SVGElement;
    for (const [name, item] of Object.entries(value)) {
        if (item == null || typeof item === "boolean" || isNaNValue(item)) continue;
        styledElement.style.setProperty(cssPropertyName(name), String(item));
    }
}

function setNamespacedAttribute(element: globalThis.Element, info: Info, value: string): void {
    if (info.space && NAMESPACE_URIS[info.space]) {
        element.setAttributeNS(NAMESPACE_URIS[info.space], info.attribute, value);
    } else {
        element.setAttribute(info.attribute, value);
    }
}

function setProperty(element: globalThis.Element, info: Info, value: unknown): void {
    const domElement = element as unknown as Record<string, unknown>;
    if (info.mustUseProperty) {
        domElement[info.property] = info.boolean ? Boolean(value) : value;
        return;
    }

    if (info.property === "style") {
        applyStyle(element, value);
        return;
    }

    if (info.boolean) {
        if (value) element.setAttribute(info.attribute, "");
        else element.removeAttribute(info.attribute);
        return;
    }

    if (info.booleanish) {
        setNamespacedAttribute(element, info, typeof value === "boolean" ? String(value) : String(value));
        return;
    }

    if (info.overloadedBoolean) {
        if (value === true) setNamespacedAttribute(element, info, "");
        else if (value !== false) setNamespacedAttribute(element, info, String(value));
        else element.removeAttribute(info.attribute);
        return;
    }

    if (info.number) {
        setNamespacedAttribute(element, info, String(value));
        return;
    }

    setNamespacedAttribute(element, info, String(value));
}

/** Apply HAST properties to a real DOM element using property-information. */
export function applyHastProperties(
    element: globalThis.Element,
    properties: Properties | HastProperties | undefined,
    namespace: HastNamespace,
): void {
    const schema = schemaFor(namespace);
    for (const [name, rawValue] of Object.entries(properties ?? {})) {
        if (name === "children" || isEventProperty(name)) continue;
        if (rawValue == null || isNaNValue(rawValue)) continue;

        const info = find(schema, name);
        const value = serializeValue(info, rawValue);
        if (value == null || isNaNValue(value)) continue;
        setProperty(element, info, value);
    }
}

/** Convert HAST property names and values for a mounted view's residual props. */
export function toDomProperties(
    properties: Properties | HastProperties | undefined,
    namespace: HastNamespace,
): HastProperties {
    const schema = schemaFor(namespace);
    const result: HastProperties = {};

    for (const [name, rawValue] of Object.entries(properties ?? {})) {
        if (name === "children" || isEventProperty(name)) continue;
        if (rawValue == null || isNaNValue(rawValue)) continue;
        const info = find(schema, name);
        const value = serializeValue(info, rawValue);
        if (value == null || isNaNValue(value)) continue;
        result[info.property] = info.property === "style" && value && typeof value === "object"
            ? styleObjectToString(value as Record<string, unknown>)
            : value;
    }

    return result;
}

/** Concatenate all text descendants of an element, matching the old code override. */
export function hastText(node: HastElement): string {
    let text = "";
    for (const child of node.children) {
        if (child.type === "text") text += child.value;
        else if (child.type === "element") text += hastText(child);
    }
    return text;
}
