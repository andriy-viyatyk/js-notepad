/**
 * Rehype plugin that highlights search text in rendered Markdown.
 * Walks the HAST tree, finds text nodes containing matches,
 * and wraps them in <span class="highlighted-text"> elements.
 * Skips text inside code/pre/script/style elements.
 */
import type { Root, RootContent, Element, ElementContent, Text } from "hast";

/** Tags whose text content should not be highlighted */
const SKIP_TAGS = new Set(["code", "pre", "script", "style"]);

/**
 * Create a rehype plugin that highlights search words in text nodes.
 * Splits search text into space-separated words (same logic as notebook search).
 */
export function createRehypeHighlight(searchText: string) {
    const words = searchText.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return () => () => {};

    // Build combined regex: matches any search word, case-insensitive
    const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

    return () => (tree: Root) => {
        walkNode(tree, pattern, false);
    };
}

/** Recursively walk the HAST tree, splitting text nodes that contain matches */
function walkNode(node: Root | Element, pattern: RegExp, skip: boolean) {
    const newChildren: RootContent[] = [];
    let changed = false;

    for (const child of node.children) {
        if (child.type === "element") {
            const shouldSkip = skip || SKIP_TAGS.has(child.tagName);
            walkNode(child, pattern, shouldSkip);
            newChildren.push(child);
        } else if (child.type === "text" && !skip) {
            const parts = splitTextNode(child.value, pattern);
            // Changed if result differs from original (not a single text node)
            if (parts.length !== 1 || parts[0].type !== "text") {
                newChildren.push(...parts);
                changed = true;
            } else {
                newChildren.push(child);
            }
        } else {
            newChildren.push(child);
        }
    }

    if (changed) {
        node.children = newChildren;
    }
}

/**
 * Split text by the search pattern.
 * Using a capturing group in split() interleaves non-match and match parts:
 * even indices = non-match text, odd indices = matched text.
 */
function splitTextNode(text: string, pattern: RegExp): ElementContent[] {
    const parts = text.split(pattern);
    if (parts.length <= 1) return [{ type: "text", value: text } as Text];

    const result: ElementContent[] = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;

        if (i % 2 === 1) {
            // Matched text — wrap in highlighted span
            result.push({
                type: "element",
                tagName: "span",
                properties: { className: ["highlighted-text"] },
                children: [{ type: "text", value: part }],
            } as Element);
        } else {
            result.push({ type: "text", value: part } as Text);
        }
    }

    return result;
}
