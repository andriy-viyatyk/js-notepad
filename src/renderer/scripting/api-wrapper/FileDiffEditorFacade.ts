import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import type { FileDiffEditor } from "../../editors/file-diff/FileDiffEditor";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";

const FILE_DIFF_ELEMENTS = [
    { name: "file-diff-picker-from", purpose: "Open the popover for selecting the original revision." },
    { name: "file-diff-picker-to", purpose: "Open the popover for selecting the modified revision." },
    { name: "text-compare-left", purpose: "Enter compare mode with the current file as the right page when a comparable left page exists." },
    { name: "text-show-resources", purpose: "Extract and open resources from an HTML host." },
] as const;

const FILE_DIFF_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "from", kind: "property", summary: "The resolved original revision, or undefined while repository-backed diff state is loading." },
    { name: "to", kind: "property", summary: "The resolved modified revision, or undefined while repository-backed diff state is loading." },
    { name: "hasStaged", kind: "property", summary: "Whether the file has staged changes, or undefined while repository-backed diff state is loading." },
    { name: "readOnly", kind: "property", summary: "Whether the resolved modified revision is not the editable working tree, or undefined while it is loading." },
];

const FILE_DIFF_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "file-diff".
File Diff exposes the selected original and modified revisions, whether staged changes were detected,
and whether the modified side is read-only. These state values are undefined until the attached host,
repository identity, and revision defaults have resolved; readOnly is true unless to.kind is
"unstaged".

elements is the page-scoped inventory of the two revision-picker buttons and the shared text controls
that apply to this host. The picker buttons open popovers containing the revision tree. text-compare-left
enters compare mode when a comparable grouped left page exists, and text-show-resources opens extracted
HTML resources when the host language is html. The File History panel is owned by page.panels under
git-diff-revisions; its git-diff-revisions-refresh and git-diff-revisions-tree descendants are panel
controls and are not duplicated in this editor inventory.`;

export class FileDiffEditorFacade implements IAiVisible {
    constructor(private readonly editor: FileDiffEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(FILE_DIFF_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
        });
        return {
            kind: "FileDiffEditor",
            summary: "File Diff facade with revision identity and shared text controls.",
            members: [...FILE_DIFF_EDITOR_MEMBERS, ...elements.members],
            help: FILE_DIFF_EDITOR_HELP,
            elements: FILE_DIFF_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "FileDiffEditor",
                id: this.id,
                name: this.name,
                from: this.from,
                to: this.to,
                hasStaged: this.hasStaged,
                readOnly: this.readOnly,
            }),
        };
    }

    get from() {
        return this.editor.diffStateReady ? this.editor.state.get().from : undefined;
    }

    get to() {
        return this.editor.diffStateReady ? this.editor.state.get().to : undefined;
    }

    get hasStaged(): boolean | undefined {
        return this.editor.diffStateReady ? this.editor.state.get().hasStaged : undefined;
    }

    get readOnly(): boolean | undefined {
        const to = this.to;
        return to ? to.kind !== "unstaged" : undefined;
    }
}
