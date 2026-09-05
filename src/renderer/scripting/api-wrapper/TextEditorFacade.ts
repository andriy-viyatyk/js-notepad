import type { MonacoEditor } from "../../editors/monaco/MonacoEditor";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";

const TEXT_ELEMENTS = [
    { name: "text-compare-left", purpose: "Compare this text page with the left grouped page when the compare action is available." },
    { name: "text-run-script", purpose: "Run the current script, when this text page uses a script language." },
    { name: "text-run-all-script", purpose: "Run all script content when a selection is present." },
    { name: "text-show-resources", purpose: "Show extracted HTML resources when this text page uses the html language." },
] as const;

const TEXT_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "editorMounted", kind: "property", summary: "True when the Monaco editor is visible and mounted. The queue layer defers commands until mount, so this is informational - consumers no longer need to gate calls on it." },
    { name: "getSelectedText", kind: "method", signature: "getSelectedText(): Promise<string>", summary: "Get currently selected text, or empty string if no selection." },
    { name: "revealLine", kind: "method", signature: "revealLine(lineNumber: number): void", summary: "Scroll to reveal a specific line in the center of the editor." },
    { name: "setHighlightText", kind: "method", signature: "setHighlightText(text?: string): void", summary: "Highlight all occurrences of text with find-match decorations." },
    { name: "getCursorPosition", kind: "method", signature: "getCursorPosition(): Promise<{ lineNumber: number; column: number }>", summary: "Get current cursor position. Returns {lineNumber: 1, column: 1} if editor is not mounted." },
    { name: "insertText", kind: "method", signature: "insertText(text: string): Promise<void>", summary: "Insert text at current cursor position." },
    { name: "replaceSelection", kind: "method", signature: "replaceSelection(text: string): Promise<void>", summary: "Replace current selection with text." },
];

const TEXT_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "monaco".
Monaco text editor operations for selection, cursor, insertion, replacement, and line navigation.
elements is the curated proof surface for four existing text-toolbar controls. Its visible values
describe the current page layout; reading them does not activate a page, while highlight activates
the owning page and waits for its slot layout before drawing.`;

export class TextEditorFacade implements IAiVisible {
    constructor(private readonly editor: MonacoEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(TEXT_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
        });
        return {
            kind: "TextEditor",
            summary: "Monaco text editor facade.",
            members: [...TEXT_EDITOR_MEMBERS, ...elements.members],
            help: TEXT_EDITOR_HELP,
            elements: TEXT_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({ kind: "TextEditor", id: this.id, name: this.name, editorMounted: this.editorMounted }),
        };
    }

    /** True once the editor model exists. Queue-backed commands no longer
     *  require gating on this — the queue defers commands until mount. */
    get editorMounted(): boolean {
        return true;
    }

    // ── Fire-and-forget commands (sync — queued until view mounts) ──────

    revealLine(lineNumber: number): void {
        this.editor.revealLine(lineNumber);
    }

    setHighlightText(text?: string): void {
        this.editor.setHighlightText(text);
    }

    // ── View-context queries (async — queue.execute returns a Promise) ──

    async getSelectedText(): Promise<string> {
        return this.editor.getSelectedText();
    }

    async getCursorPosition(): Promise<{ lineNumber: number; column: number }> {
        return this.editor.getCursorPosition();
    }

    async insertText(text: string): Promise<void> {
        await this.editor.insertText(text);
    }

    async replaceSelection(text: string): Promise<void> {
        await this.editor.replaceSelection(text);
    }
}
