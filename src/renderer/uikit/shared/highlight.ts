import React from "react";

const NBSP = " ";

/**
 * Split `text` on whitespace-separated tokens of `searchText`, recursively, returning
 * a flat array of React nodes where matches are wrapped in
 * `<span class="highlighted-text">`. The global `.highlighted-text` rule
 * (theme/GlobalStyles.tsx) paints matches in the accent color — keeping highlighting
 * consistent across every consumer (UIKit primitives, markdown rehype, FileSearch …).
 *
 * Pass `extraClassName` to layer a variant on top of the global class, e.g.
 * `"highlighted-text-active"` for the current match in find-in-page navigation.
 *
 * When `searchText` is empty / null / whitespace-only, returns the raw text.
 */
export function highlight(
    text: string,
    searchText: string | null | undefined,
    extraClassName?: string,
): React.ReactNode {
    if (!searchText) return text;
    const tokens = searchText.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) return text;
    return highlightRecursive(text, tokens, 0, extraClassName);
}

function highlightRecursive(
    text: string,
    tokens: string[],
    keyBase: number,
    extraClassName?: string,
): React.ReactNode {
    if (tokens.length === 0) return text;
    const [head, ...rest] = tokens;
    const escaped = head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expr = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(expr);
    const matchClassName = extraClassName
        ? `highlighted-text ${extraClassName}`
        : "highlighted-text";
    return parts.map((part, i) => {
        const key = `${keyBase}-${i}`;
        if (part.toLowerCase() === head.toLowerCase()) {
            return React.createElement(
                "span",
                { key, className: matchClassName },
                part,
            );
        }
        // Recurse into remaining tokens for multi-word matching.
        if (rest.length > 0) {
            return React.createElement(
                React.Fragment,
                { key },
                highlightRecursive(part, rest, i, extraClassName),
            );
        }
        // Leaf non-match: promote a single leading/trailing space to a non-breaking
        // space (U+00A0) so layout does not collapse the gap adjacent to a matched
        // <span>. Mirrors the legacy `highlightText` behaviour.
        if (part.startsWith(" ")) {
            return React.createElement(
                React.Fragment,
                { key },
                NBSP,
                part.substring(1),
            );
        }
        if (part.endsWith(" ")) {
            return React.createElement(
                React.Fragment,
                { key },
                part.substring(0, part.length - 1),
                NBSP,
            );
        }
        return React.createElement(React.Fragment, { key }, part);
    });
}
