import { TComponentState, TOneState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/EditorModel";
import type { EditorDescriptor } from "../../../shared/persistence";
import type { ArchiveTreeProvider } from "../../content/tree-providers/ArchiveTreeProvider";
import { fpBasename, isPlainLocalPath, buildArchivePath } from "../../core/utils/file-path";
import { archiveService, type ArchiveEntry } from "../../api/archive-service";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import { ArchiveIcon } from "../../theme/icons";
import type { NavigationState } from "../base/navigation-state";
import type { IPageHost } from "../../api/pages/IPageHost";
import type { MenuItem } from "../../uikit";
import { filePathMenuItems } from "../shared/editor-menu-items";

export interface ArchiveEditorState extends EditorStateBase {
    /** State-type discriminator (used by `_openZipArchive` for de-dup). */
    type: "archiveFile";
    /** Archive source URL (path to the archive file). */
    archiveUrl: string;
}

export const defaultArchiveEditorState: ArchiveEditorState = {
    id: "",
    title: "",
    modified: false,
    type: "archiveFile",
    archiveUrl: "",
};

export function getDefaultArchiveEditorState(): ArchiveEditorState {
    return { ...defaultArchiveEditorState, id: crypto.randomUUID() };
}

export class ArchiveEditor extends EditorModel<ArchiveEditorState> {
    /** Editor identity. Matches `EditorDescriptor.editorId`. */
    readonly editorId = "archive-view";

    noLanguage = true;

    /** Tree provider for browsing archive contents. Owned by this model.
     *  Public field (mirror Explorer EX-IMPL5) — read by both views AND by the
     *  EX8 `instanceof` chain in CategoryEditor. */
    treeProvider: ArchiveTreeProvider | null = null;

    /** Selection state — highlights current entry in the archive tree. */
    readonly selectionState = new TOneState<NavigationState>({ selectedHref: null });

    /** Reveal request — reactive counter. When bumped, the view calls
     *  revealItem(selectedHref). */
    readonly revealVersion = new TOneState({ version: 0 });

    constructor(state: TComponentState<ArchiveEditorState>) {
        super(state);
        this.getIconElement = () => ArchiveIcon.createElement({ width: 16, height: 16 });
    }

    /** Expose the archive path as `filePath` so host-less consumers read a single value:
     *  the switch widget (matching file-associated boards, US-876) and the `switchMainEditor`
     *  simple-board branch (which bails on a missing `filePath`). Stored as `archiveUrl`. */
    override get filePath(): string | undefined {
        return this.state.get().archiveUrl || undefined;
    }

    /** Switch options while ON the archive view (base returns []): just this editor, so the
     *  switch widget renders once a file-associated board (e.g. an Excel viewer for a `.xlsx`,
     *  itself a ZIP) is appended by the widget — letting the user switch back to the board
     *  (US-876). A plain archive with no associated board yields a single-entry list, which the
     *  widget hides — no regression. Empty for a non-local archive (boards edit local files). */
    override findCompatibleEditors(): string[] {
        const path = this.filePath;
        if (!path || !isPlainLocalPath(path)) return [];
        return [this.editorId];
    }

    /** Initialize from archive path. Creates ArchiveTreeProvider and sets title. */
    async initFromArchive(archiveUrl: string): Promise<void> {
        const { ArchiveTreeProvider } = await import(
            "../../content/tree-providers/ArchiveTreeProvider"
        );
        this.treeProvider = new ArchiveTreeProvider(archiveUrl);
        this.state.update((s) => {
            s.title = fpBasename(archiveUrl);
            s.archiveUrl = archiveUrl;
        });
    }

    async restore(): Promise<void> {
        await super.restore();
        const archiveUrl = this.state.get().archiveUrl;
        if (archiveUrl && !this.treeProvider) {
            const { ArchiveTreeProvider } = await import(
                "../../content/tree-providers/ArchiveTreeProvider"
            );
            this.treeProvider = new ArchiveTreeProvider(archiveUrl);
        }
        // Direct-open path may already have `page`; navigation/restore paths
        // publish via setPage() once attached.
        if (this.treeProvider && this.page) {
            this.secondaryView = ["archive-tree"];
        }
    }

    async listEntries(): Promise<ArchiveEntry[] | undefined> {
        const provider = this.treeProvider;
        if (!this.page || !provider) return undefined;
        const archivePath = provider.sourceUrl;
        return archiveService.listEntries(archivePath).then(entries => entries.map(entry => ({ ...entry })));
    }

    async openEntry(innerPath: string): Promise<void> {
        const provider = this.requireArchiveProvider();
        const archivePath = provider.sourceUrl;
        const prefix = `${archivePath}!`;
        const entryPath = innerPath.startsWith(prefix) ? innerPath.slice(prefix.length) : innerPath;
        const href = buildArchivePath(archivePath, entryPath);
        this.selectionState.update((state) => { state.selectedHref = href; });

        const navigationUrl = await provider.getNavigationUrlByHref(entryPath);
        const url = navigationUrl === entryPath ? href : navigationUrl;
        await app.events.openRawLink.sendAsync(createLinkData(url, {
            pageId: this.page?.id ?? this.id,
            sourceId: this.id,
        }));
    }

    /**
     * The tree click handler, moved here from `ArchiveEditorView` and
     * `ArchiveSecondaryView` so both views and the facade share one path.
     *
     * It asks the provider for the navigation URL rather than rebuilding the
     * inner path itself: `getNavigationUrl` returns `item.href` for a file and
     * an encoded category link for a directory (`ArchiveTreeProvider.ts:107-115`),
     * and that distinction is the provider's to make. Deriving `category/title`
     * here would silently take the directory branch for every item.
     *
     * The guard returns rather than throwing, as both view handlers did: this
     * runs from a click through `void`, where a throw is an unhandled rejection.
     * `openEntry` is the path-taking action and keeps its diagnostic throw.
     */
    async openTreeItem(item: ITreeProviderItem): Promise<void> {
        const provider = this.treeProvider;
        if (!this.page || !provider) return;
        const url = provider.getNavigationUrl(item) ?? item.href;
        this.selectionState.update((state) => { state.selectedHref = item.href; });
        await app.events.openRawLink.sendAsync(createLinkData(url, {
            pageId: this.page?.id ?? this.id,
            sourceId: this.id,
        }));
    }

    async extractTo(targetDir: string): Promise<void> {
        const archivePath = this.requireArchiveProvider().sourceUrl;
        await archiveService.extractTo(archivePath, targetDir);
    }

    private requireArchiveProvider(): ArchiveTreeProvider {
        if (!this.page || !this.treeProvider) {
            throw new Error("Archive action unavailable: no page host or archive loaded.");
        }
        return this.treeProvider;
    }

    setPage(page: IPageHost | null): void {
        super.setPage(page);
        if (page && this.treeProvider && !this.secondaryView?.length) {
            this.secondaryView = ["archive-tree"];
        }
    }

    /**
     * Navigation survival: keep this model as secondary view if the new page
     * was opened from this archive (sourceLink.sourceId matches). NOT a no-op
     * — the base default would unconditionally clear `secondaryView` and
     * drop Archive's panel on every navigation.
     */
    beforeNavigateAway(newModel: EditorModel): void {
        if (this._isOpenedFromThisArchive(newModel)) return;
        this.secondaryView = undefined;
    }

    /**
     * Called when the page's main editor changes during navigation.
     * If the new main editor was NOT opened from this archive, remove self from
     * the sidebar; otherwise highlight + reveal the navigated entry.
     */
    onMainEditorChanged(newMainEditor: EditorModel | null): void {
        if (!newMainEditor || newMainEditor === this) return;
        if (this._isOpenedFromThisArchive(newMainEditor)) {
            const url = (newMainEditor.state.get() as { sourceLink?: { url?: string } })
                .sourceLink?.url ?? null;
            this.selectionState.update((s) => { s.selectedHref = url; });
            if (url && this.page?.activePanelId === "archive-tree") {
                this.revealVersion.update((s) => { s.version++; });
            }
            this.page?.expandPanel("archive-tree");
        } else {
            this.secondaryView = undefined;
        }
    }

    /** React to panel expansion — reveal current entry when "archive-tree" becomes active. */
    onPanelExpanded(panelId: string): void {
        if (panelId === "archive-tree") {
            const href = this.selectionState.get().selectedHref;
            if (href) {
                // The monotonic token is a reveal command consumed by the secondary view, whose
                // binding schedules the cancellable animation-frame reveal after the panel exists.
                this.revealVersion.update((s) => { s.version++; });
            }
        }
    }

    /** Check if a model was opened from this archive via sourceLink. Reads the
     *  source id from both the editor's own state and its content host (see
     *  `EditorModel.getNavigationSourceId`) so navigation into a text editor
     *  (e.g. Monaco) keeps the Archive panel instead of dropping it. */
    private _isOpenedFromThisArchive(model: EditorModel): boolean {
        return model.getNavigationSourceId() === this.id;
    }

    /** Show in File Explorer / Copy File Path for the archive file. */
    onGetMenuItems(): MenuItem[] {
        return filePathMenuItems(this.state.get().archiveUrl);
    }

    async dispose(): Promise<void> {
        this.treeProvider = null;
        await super.dispose();
    }

    applyRestoreData(data: RestoreData<ArchiveEditorState>): void {
        super.applyRestoreData(data);
        const archiveUrl = data.archiveUrl;
        if (archiveUrl) {
            this.state.update((s) => { s.archiveUrl = archiveUrl; });
        }
    }

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                ...s,
                archiveUrl: s.archiveUrl,
            } as unknown as Record<string, unknown>,
        };
    }
}
