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

/**
 * DOM form of `highlight`, for a vanilla view that owns its label host (EPIC-056 C3-7).
 *
 * Same tokenizing, same `.highlighted-text` class, same non-breaking-space promotion on leaf
 * non-matches — so a converted row highlights identically to the React one. The React form above
 * stays until `AVGrid` converts (C4).
 *
 * **This function owns `host` outright.** It calls `replaceChildren`, so the host must not also be
 * managed by `fillSlot`: a view that switches a label between a React node and a plain string has to
 * release the `fillSlot` state first (`fillSlot(host, null)`) before writing through this function,
 * or the two owners fight and the label stops updating.
 */
export function highlightInto(
    host: HTMLElement,
    text: string,
    searchText: string | null | undefined,
    extraClassName?: string,
): void {
    const tokens = searchText
        ? searchText.split(/\s+/).map((s) => s.trim()).filter(Boolean)
        : [];
    if (tokens.length === 0) {
        host.textContent = text;
        return;
    }

    const fragment = document.createDocumentFragment();
    appendHighlighted(fragment, text, tokens, extraClassName);
    host.replaceChildren(fragment);
}

function appendHighlighted(
    parent: Node,
    text: string,
    tokens: string[],
    extraClassName?: string,
): void {
    if (tokens.length === 0) {
        if (text) parent.appendChild(document.createTextNode(text));
        return;
    }

    const [head, ...rest] = tokens;
    const escaped = head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "gi"));
    const lowerHead = head.toLowerCase();

    for (const part of parts) {
        if (part.toLowerCase() === lowerHead) {
            const span = document.createElement("span");
            span.className = extraClassName
                ? `highlighted-text ${extraClassName}`
                : "highlighted-text";
            span.textContent = part;
            parent.appendChild(span);
            continue;
        }

        if (rest.length > 0) {
            appendHighlighted(parent, part, rest, extraClassName);
            continue;
        }

        // Leaf non-match: promote a single leading/trailing space to a non-breaking space so
        // layout does not collapse the gap next to a matched <span>. Mirrors the React form.
        if (part.startsWith(" ")) {
            parent.appendChild(document.createTextNode(NBSP + part.substring(1)));
        } else if (part.endsWith(" ")) {
            parent.appendChild(
                document.createTextNode(part.substring(0, part.length - 1) + NBSP),
            );
        } else if (part) {
            parent.appendChild(document.createTextNode(part));
        }
    }
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
