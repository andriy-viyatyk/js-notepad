import type { IArchiveEditor, IArchiveEntry } from "../../api/types/archive-editor";
import type { ArchiveEditor } from "../../editors/archive/ArchiveEditor";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const ARCHIVE_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "archive-refresh", purpose: "Locate the visible archive refresh control; refresh remains a view-owned operation." },
    { name: "archive-collapse-all", purpose: "Locate the visible archive collapse-all control; collapse remains a view-owned operation." },
];

const ARCHIVE_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id: archive-view." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "archivePath", kind: "property", summary: "The loaded archive path, or undefined without an attached loaded archive." },
    { name: "selectedEntryHref", kind: "property", summary: "The selected archive entry href, or undefined when no entry is selected." },
    { name: "listEntries", kind: "method", signature: "listEntries(): Promise<IArchiveEntry[] | undefined>", summary: "List copied metadata snapshots for all archive entries; I/O errors remain errors." },
    { name: "openEntry", kind: "method", signature: "openEntry(innerPath: string): Promise<void>", summary: "Open an archive-relative entry through the model-owned navigation path.", caution: "opens a page for the selected archive entry" },
    { name: "extractTo", kind: "method", signature: "extractTo(targetDir: string): Promise<void>", summary: "Extract all archive entries into a target directory using the existing zip-slip protection.", caution: "extracts archive entries and writes the user's disk" },
];

const ARCHIVE_HELP = `Access via pages[i].editor after narrowing editor.id to "archive-view".
This page-scoped facade exposes the two curated editor controls archive-refresh and
archive-collapse-all. They are locations only: their handlers operate on the mounted
TreeProviderViewModel and are not facade actions. The archive-secondary-view and
archive-secondary-close controls belong to the archive sidebar panel under page.panels and US-1323,
not this editor facade.

elements resolves selectors below this page's [data-page-id] scope. highlight activates the page,
waits for its layout, and passes highlightOptions: { all: true }; a result's count is the total
number of matching controls and highlighted is the number of rings drawn by the overlay.
archivePath and selectedEntryHref are undefined when detached or unloaded, and a null internal
selection is exposed as undefined. listEntries returns fresh copied metadata records, including []
for a loaded empty archive, and returns undefined only when detached or unloaded. It does not expose
archive bytes, entry contents, the tree provider, or service objects.

openEntry(innerPath) and listEntries are model-backed. openEntry has no password path, and encrypted
archives are unsupported by this surface; reader errors are returned. extractTo preserves the
existing zip-slip protection and writes the user's disk. No action reaches into a view, menu,
clipboard, or unmounted view model.`;

export class ArchiveEditorFacade implements IAiVisible, IArchiveEditor {
    constructor(
        private readonly editor: ArchiveEditor,
        readonly id: "archive-view",
        readonly name: string,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(ARCHIVE_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "ArchiveEditor",
            summary: "Archive metadata and model-backed navigation/extraction facade.",
            members: [...ARCHIVE_MEMBERS, ...elements.members],
            help: ARCHIVE_HELP,
            elements: ARCHIVE_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "ArchiveEditor",
                id: this.id,
                name: this.name,
                archivePath: this.archivePath,
                selectedEntryHref: this.selectedEntryHref,
            }),
        };
    }

    get archivePath(): string | undefined {
        return this.editor.page && this.editor.treeProvider
            ? this.editor.treeProvider.sourceUrl
            : undefined;
    }

    get selectedEntryHref(): string | undefined {
        return this.archivePath ? this.editor.selectionState.get().selectedHref ?? undefined : undefined;
    }

    listEntries(): Promise<IArchiveEntry[] | undefined> {
        return this.editor.listEntries().then(entries => entries?.map(entry => ({ ...entry })));
    }

    openEntry(innerPath: string): Promise<void> {
        this.requireArchive();
        return this.editor.openEntry(innerPath);
    }

    extractTo(targetDir: string): Promise<void> {
        this.requireArchive();
        return this.editor.extractTo(targetDir);
    }

    private requireArchive(): void {
        if (!this.editor.page || !this.editor.treeProvider) {
            throw new Error("Archive action unavailable: no page host or archive loaded.");
        }
    }
}
