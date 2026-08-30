import "./tree-indents.css";

const defaultIndentSize = 16;

/**
 * The level guides at the head of a tree row, shared by `TreeItemView` and `SectionItemView`.
 *
 * Owns a plain element array, not child views: a `VanillaView`'s `children` array is append-only,
 * so a child view could never be released when a recycled row's level shrinks.
 *
 * Rows are recycled by the virtualization pool, so `level` changes under a live instance. Grow and
 * shrink in place — never rebuild, and never touch the row root's child list wholesale (see the
 * class comment on `TreeItemView` for what that breaks).
 */
export class TreeIndents {
    private readonly elements: HTMLDivElement[] = [];
    private appliedSize: number | undefined;

    /**
     * @param host the row root the indents are inserted into.
     * @param anchor the first stable element after the indents; new indents insert before it.
     * @param extraClassName `"tree-indent"` for `TreeItem` (the hook its selected-state override
     *        targets). Section rows are never selected, so they pass nothing — matching the earlier row renderer
     *        `SectionItem`, which omitted the class.
     */
    constructor(
        private readonly host: HTMLElement,
        private readonly anchor: HTMLElement,
        private readonly extraClassName?: string,
    ) {}

    sync(level: number, indentSize: number = defaultIndentSize): void {
        // Truncate the array as well as removing the element: a shrink that only detaches leaves a
        // level-2 row recycled from a level-8 row wearing six phantom gutters.
        while (this.elements.length > level) {
            this.elements.pop()?.remove();
        }
        while (this.elements.length < level) {
            const element = document.createElement("div");
            element.dataset.part = "tree-indent";
            // Set once at creation and never touched again — element identity at index 0 is stable
            // across recycling, so the marker cannot drift.
            if (this.elements.length === 0) element.dataset.first = "";
            if (this.extraClassName) element.className = this.extraClassName;
            element.style.width = `${indentSize}px`;
            this.host.insertBefore(element, this.anchor);
            this.elements.push(element);
        }

        // No consumer in `ui/`, `editors/` or `components/` passes `indentSize`, so this is
        // normally a no-op guarded away rather than a per-row write.
        if (indentSize !== this.appliedSize) {
            this.appliedSize = indentSize;
            for (const element of this.elements) element.style.width = `${indentSize}px`;
        }
    }
}
