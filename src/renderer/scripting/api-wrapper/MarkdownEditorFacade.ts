import type { MarkdownEditor } from "../../editors/markdown";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";

const MARKDOWN_ELEMENTS = [
    { name: "text-compare-left", purpose: "Compare this page with the left grouped page." },
    { name: "markdown-compact-toggle", purpose: "Toggle compact spacing and typography in the rendered Markdown." },
    { name: "markdown-back", purpose: "Return to the previous Markdown document in the page's navigation history." },
    { name: "find-input", purpose: "Enter the text to find in the rendered Markdown." },
    { name: "find-prev", purpose: "Move to the previous Markdown match." },
    { name: "find-next", purpose: "Move to the next Markdown match." },
    { name: "find-close", purpose: "Close the Markdown find bar." },
] as const;

const MARKDOWN_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "viewMounted", kind: "property", summary: "True if the markdown preview container is mounted in the DOM." },
    { name: "html", kind: "property", summary: "The rendered HTML content from the preview container, or undefined when the rendered view is not mounted." },
    { name: "compactMode", kind: "property", summary: "Whether compact spacing and typography are enabled." },
    { name: "searchVisible", kind: "property", summary: "Whether the Markdown find bar is open." },
    { name: "searchText", kind: "property", summary: "The current Markdown find text." },
    { name: "currentMatchIndex", kind: "property", summary: "Zero-based index of the current Markdown match." },
    { name: "totalMatches", kind: "property", summary: "Number of matches for the current Markdown find text." },
    { name: "revealFragment", kind: "method", signature: "revealFragment(fragment: string): void", summary: "Reveal a heading fragment in the rendered Markdown.", caution: "changes the visible preview position" },
    { name: "navigateBack", kind: "method", signature: "navigateBack(): Promise<void>", summary: "Return to the previous Markdown document in page history.", caution: "navigates the current page" },
    { name: "toggleCompact", kind: "method", signature: "toggleCompact(): void", summary: "Toggle compact Markdown rendering.", caution: "changes the visible preview" },
    { name: "openSearch", kind: "method", signature: "openSearch(): void", summary: "Open the Markdown find bar.", caution: "changes the visible page UI" },
    { name: "closeSearch", kind: "method", signature: "closeSearch(): void", summary: "Close the Markdown find bar and clear its state.", caution: "changes the visible page UI" },
    { name: "setSearchText", kind: "method", signature: "setSearchText(text: string): void", summary: "Set the Markdown find text.", caution: "changes the visible find UI" },
    { name: "nextMatch", kind: "method", signature: "nextMatch(): void", summary: "Move to the next Markdown match.", caution: "changes the visible preview position" },
    { name: "prevMatch", kind: "method", signature: "prevMatch(): void", summary: "Move to the previous Markdown match.", caution: "changes the visible preview position" },
];

const MARKDOWN_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "md-view".
Markdown preview facade with rendered HTML, navigation, compact mode, and find controls.
There is no manual refresh or re-render control: the preview re-renders automatically whenever the
page content changes, so "refresh the preview" is not an action a user or an agent performs here.
Assign pages[i].content to change what is rendered; markdown-compact-toggle only changes spacing and
typography of the already-rendered document. Its
persistent controls are text-compare-left, markdown-compact-toggle, markdown-back, find-input,
find-prev, find-next, and find-close; conditional controls report visible: false when absent.
The markdown-link context menu appears only after right-clicking a rendered link and offers Open
in New Tab, Copy Link, and browser-opening variants; inspect it through menus. The page-tab popup
menu exposes Save, Save As..., Rename, Show in File Explorer, Copy File Path, Decrypt, Encrypt or
Change Password, and Make Unencrypted. Rename File, Unsaved Changes, and password dialogs are
transient and are accessed through dialogs. SVG/Drawing and Excalidraw page actions belong to the
corresponding editor surfaces. elements.visible reports DOM presence and layout, not whether a
control is enabled; reading elements does not activate a page, while highlight activates its page
and waits for its retained slot layout.`;

/**
 * Safe facade around MarkdownEditor for script access.
 * Implements the IMarkdownEditor interface from api/types/markdown-editor.d.ts.
 *
 * - `html` reads from the DOM container (rendered by the `hast → DOM` walker)
 * - `viewMounted` indicates whether the container is available
 */
export class MarkdownEditorFacade implements IAiVisible {
    constructor(private readonly editor: MarkdownEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(MARKDOWN_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
        });
        return {
            kind: "MarkdownEditor",
            summary: "Markdown preview facade.",
            members: [...MARKDOWN_EDITOR_MEMBERS, ...elements.members],
            help: MARKDOWN_EDITOR_HELP,
            elements: MARKDOWN_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "MarkdownEditor", id: this.id, name: this.name,
                viewMounted: this.viewMounted,
                compactMode: this.compactMode,
                searchVisible: this.searchVisible,
                currentMatchIndex: this.currentMatchIndex,
                totalMatches: this.totalMatches,
            }),
        };
    }

    get viewMounted(): boolean {
        return this.editor.viewMounted;
    }

    get html(): string | undefined {
        return this.editor.containerInnerHtml;
    }

    get compactMode(): boolean {
        return this.editor.state.get().compactMode;
    }

    get searchVisible(): boolean {
        return this.editor.state.get().searchVisible;
    }

    get searchText(): string {
        return this.editor.state.get().searchText;
    }

    get currentMatchIndex(): number {
        return this.editor.state.get().currentMatchIndex;
    }

    get totalMatches(): number {
        return this.editor.state.get().totalMatches;
    }

    revealFragment(fragment: string): void {
        this.editor.revealFragment(fragment);
    }

    navigateBack(): Promise<void> {
        return this.editor.navigateBack();
    }

    toggleCompact(): void {
        this.editor.toggleCompact();
    }

    openSearch(): void {
        this.editor.openSearch();
    }

    closeSearch(): void {
        this.editor.closeSearch();
    }

    setSearchText(text: string): void {
        this.editor.setSearchText(text);
    }

    nextMatch(): void {
        this.editor.nextMatch();
    }

    prevMatch(): void {
        this.editor.prevMatch();
    }
}
