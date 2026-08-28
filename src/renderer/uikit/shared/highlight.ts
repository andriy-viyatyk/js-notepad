const NBSP = "\u00a0";

/**
 * DOM form of the former React highlighter, for a vanilla view that owns its label host.
 *
 * Same tokenizing, same `.highlighted-text` class, same non-breaking-space promotion on leaf
 * non-matches, so a converted row highlights identically to the former React implementation.
 *
 * This function owns `host` outright. It calls `replaceChildren`, so the host must not also be
 * managed by `fillSlot`: a view that switches a label between a plain string and highlighted DOM
 * has to release the `fillSlot` state first (`fillSlot(host, null)`) before writing through this
 * function, or the two owners fight and the label stops updating.
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
        // layout does not collapse the gap next to a matched <span>. Mirrors the former React path.
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
