import { createElement, type ReactNode } from "react";

import { EditorModel, type EditorStateBase } from "../base/EditorModel";
import { MemoryIcon } from "../../theme/icons";
import { MEMORY_ICON_COLOR } from "../../theme/palette-colors";
import type { IPageHost } from "../../api/pages/IPageHost";
import type { ISubscriptionObject } from "../../api/types/events";
import { mnemeConnection } from "../../api/mneme-connection";
import { decodeMnemeFolderLink } from "../../content/mneme-folder-link";
import { parseToolResult } from "../mneme-config/mnemeTypes";
import { MnemeTreeProvider } from "../../content/tree-providers/MnemeTreeProvider";

export interface MnemeRootEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "mnemeRootPage";
    /** Absolute folder of the Mneme root (the parent of the clicked `.mneme`). */
    rootFolder: string;
    /** Resolved Mneme root name (e.g. "TestWiki"). Empty until resolved. */
    rootName: string;
    /** True while resolving the root name from the sidecar. */
    resolving: boolean;
    /** Set when the root can't be resolved (not registered / not connected). */
    error?: string;
}

/** Folder name (basename) of a root folder path, or "Mneme" when empty. */
function rootFolderName(rootFolder: string): string {
    return rootFolder.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "Mneme";
}

/** Normalize a filesystem path for case-insensitive, separator-agnostic compare. */
function normPath(p: string): string {
    return p.replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
}

export const getDefaultMnemeRootEditorState = (): MnemeRootEditorState => ({
    // Per-instance UUID — keys this editor in `page.editors[]`. Two roots open at
    // once are two distinct instances, each contributing its own `mneme-tree` panel.
    id: crypto.randomUUID(),
    title: "Mneme",
    modified: false,
    type: "mnemeRootPage",
    editor: "mneme-root",
    rootFolder: "",
    rootName: "",
    resolving: false,
});

/**
 * Mneme root editor (EPIC-032 / US-663).
 *
 * Opened by clicking a `.mneme` folder in any file tree (mirrors `.git` → Git
 * Tree). The main view is a "Mneme" placeholder for now; the editor's value is
 * its **read-only file-tree secondary panel** (`mneme-tree`), driven by a
 * {@link MnemeTreeProvider} for the resolved root. Follows the Git Tree
 * "survive navigation, close only via the panel `x`" lifecycle, and is a
 * per-root navigation singleton so re-clicking the same `.mneme` reuses this
 * instance instead of stacking duplicate panels.
 */
export class MnemeRootEditorModel extends EditorModel<MnemeRootEditorState> {
    readonly editorId = "mneme-root";

    noLanguage = true;
    skipSave = true;
    showBackgroundOrnament = true;

    /** Tree provider for the resolved root — null until `resolveRoot` succeeds. */
    treeProvider: MnemeTreeProvider | null = null;

    /** Connection-status subscription, so a late connection self-resolves. */
    private _statusSub: ISubscriptionObject | null = null;

    /** Tab/panel icon — the Mneme (Memory) glyph. */
    getIcon = (): ReactNode => createElement(MemoryIcon, { color: MEMORY_ICON_COLOR });

    /** Register the read-only "Wiki" tree panel when attached to a page
     *  (Pattern B — the editor is its own surviving secondary view). */
    setPage(page: IPageHost | null): void {
        super.setPage(page);
        if (page && !this.secondaryView?.length) {
            this.secondaryView = ["mneme-tree"];
        }
    }

    /** Survive navigation (Pattern B): the base default would clear the panel,
     *  so override to a no-op. The sole removal path is the panel's "x". */
    beforeNavigateAway(): void {
        // Intentionally empty — survive unconditionally.
    }

    /** Per-page singleton: re-navigating to the SAME root's `.mneme` reuses this
     *  instance (promote back to main) rather than building a duplicate panel. A
     *  DIFFERENT root does not match → a second instance + a second panel. */
    matchesNavigationTarget(target: string | undefined, filePath: string): boolean {
        if (target !== "mneme-root") return false;
        const link = decodeMnemeFolderLink(filePath);
        return !!link && normPath(link.rootFolder) === normPath(this.state.get().rootFolder);
    }

    /** Manual close (the panel "x"): detach + dispose this editor only. */
    async requestClose(): Promise<void> {
        await this.page?.removeSecondaryView(this);
    }

    /** Seed rootFolder + provisional title from a decoded `mneme-folder://` link,
     *  then resolve the root name from the sidecar. */
    initFromRootFolder(rootFolder: string): void {
        this.state.update((s) => {
            s.rootFolder = rootFolder;
            s.title = rootFolderName(rootFolder);
            s.resolving = true;
        });
        this.ensureStatusSub();
        void this.resolveRoot();
    }

    /** Session-restore entry — rootFolder rides the persisted state. */
    restoreFromState(): void {
        this.ensureStatusSub();
        void this.resolveRoot();
    }

    /** Subscribe once to connection status so a root opened while Mneme is down
     *  resolves automatically when the shared connection comes up. */
    private ensureStatusSub(): void {
        if (this._statusSub) return;
        this._statusSub = mnemeConnection.onStatusChange((status) => {
            if (status === "connected" && !this.state.get().rootName) void this.resolveRoot();
        });
    }

    /** Resolve the root name by matching `rootFolder` against the sidecar's
     *  registered roots (`wiki_list_roots`), then build the tree provider. */
    private async resolveRoot(): Promise<void> {
        const rootFolder = this.state.get().rootFolder;
        if (!rootFolder || this.state.get().rootName) return;

        const client = mnemeConnection.getClient();
        if (!client) {
            this.state.update((s) => { s.resolving = false; s.error = "Mneme is not connected."; });
            return;
        }

        this.state.update((s) => { s.resolving = true; s.error = undefined; });
        try {
            const result = await client.callTool(
                { name: "wiki_list_roots", arguments: {} },
                undefined,
                { timeout: 10_000 },
            );
            const roots = parseToolResult<{ roots: { name: string; folder: string }[] }>(result)?.roots ?? [];
            const target = normPath(rootFolder);
            const match = roots.find((r) => normPath(r.folder) === target);
            if (!match) {
                this.state.update((s) => { s.resolving = false; s.error = "Not a registered Mneme root."; });
                return;
            }
            this.treeProvider = new MnemeTreeProvider(match.name);
            this.state.update((s) => {
                s.resolving = false;
                s.error = undefined;
                s.rootName = match.name;
                s.title = match.name;
            });
        } catch {
            this.state.update((s) => { s.resolving = false; s.error = "Failed to reach Mneme."; });
        }
    }

    async dispose(): Promise<void> {
        this._statusSub?.unsubscribe();
        this._statusSub = null;
        this.treeProvider?.dispose();
        this.treeProvider = null;
        // Do NOT dispose mnemeConnection — it is shared across the app.
        await super.dispose();
    }
}
