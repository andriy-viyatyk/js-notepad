import type { Element, Root, RootContent } from "hast";
import { resolveRelatedLink } from "../../core/utils/path-utils";

interface RehypeMarkdownOverridesOptions {
    filePath?: string;
    wikiRoot?: string;
}

function decodeUrl(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function iconPath(checked: boolean): Element {
    const children: Element[] = [
        {
            type: "element",
            tagName: "rect",
            properties: {
                x: 0.75,
                y: 0.75,
                width: 14.5,
                height: 14.5,
                rx: 3.25,
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.5,
            },
            children: [],
        },
    ];

    if (checked) {
        children.push({
            type: "element",
            tagName: "path",
            properties: {
                d: "M3.75 7.75L6.75 10.75L12.25 5.25",
                stroke: "currentColor",
                strokeWidth: 2,
                strokeLinecap: "round",
                strokeLinejoin: "round",
                fill: "none",
            },
            children: [],
        });
    }

    return {
        type: "element",
        tagName: "svg",
        properties: {
            viewBox: "0 0 16 16",
            width: 14,
            height: 14,
        },
        children: [{
            type: "element",
            tagName: "g",
            properties: {},
            children,
        }],
    };
}

function rewriteLinkProperty(
    element: Element,
    property: "href" | "src",
    filePath: string | undefined,
    wikiRoot: string | undefined,
): void {
    const decoded = decodeUrl(element.properties?.[property]);
    if (decoded === undefined) return;
    element.properties ??= {};
    element.properties[property] = resolveRelatedLink(filePath, decoded, wikiRoot);
}

function walk(node: Root | Element, options: RehypeMarkdownOverridesOptions): void {
    for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index] as RootContent;
        if (child.type !== "element") continue;

        const properties = child.properties ?? {};
        if (child.tagName === "input" && properties.type === "checkbox") {
            node.children[index] = iconPath(Boolean(properties.checked));
            continue;
        }

        if (child.tagName === "a") {
            rewriteLinkProperty(child, "href", options.filePath, options.wikiRoot);
        } else if (child.tagName === "img") {
            rewriteLinkProperty(child, "src", options.filePath, options.wikiRoot);
        }

        walk(child, options);
    }
}

/** Rewrite markdown-specific HAST without creating framework or DOM nodes. */
export function rehypeMarkdownOverrides(
    options: RehypeMarkdownOverridesOptions = {},
) {
    return (tree: Root): void => {
        walk(tree, options);
    };
}
