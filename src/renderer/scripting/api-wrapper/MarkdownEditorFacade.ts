import type { MarkdownEditor } from "../../editors/markdown";

/**
 * Safe facade around MarkdownEditor for script access.
 * Implements the IMarkdownEditor interface from api/types/markdown-editor.d.ts.
 *
 * - `html` reads from the DOM container (rendered by the `hast → DOM` walker)
 * - `viewMounted` indicates whether the container is available
 */
export class MarkdownEditorFacade {
    constructor(private readonly editor: MarkdownEditor) {}

    get viewMounted(): boolean {
        return this.editor.viewMounted;
    }

    get html(): string {
        return this.editor.containerInnerHtml;
    }
}
