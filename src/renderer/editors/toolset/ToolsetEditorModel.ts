import { createElement, type ReactNode } from "react";

import { EditorModel, type EditorStateBase } from "../base/EditorModel";
import { ToolsIcon } from "../../theme/icons";
import { fpBasename, fpJoin, fpNormalizeForCompare } from "../../core/utils/file-path";
import { decodePersephoneToolsetLink } from "../../content/persephone-toolset-link";
import {
    readToolsManifest,
    validateToolsManifest,
    type ToolsManifest,
} from "../../api/tools/tools-manifest";
import { TOOLS_EXECUTION_LOG_FILE } from "../../api/tools/tool-log";

export interface ToolsetEditorState extends EditorStateBase {
    type: "toolsetPage";
    editor: "toolset-view";
    /** The toolset's OWN absolute root path — the folder that contains `tools-manifest.json`.
     *  Always set for a live toolset; absent only in legacy/broken persisted state, which
     *  `restore()` drops. */
    toolsetRoot?: string;
    /** Display title — the toolset's authoritative name (manifest), else the folder basename. */
    title: string;
    /** Parsed manifest, or null when missing/unparseable. Re-read on open/restore/Refresh. */
    manifest?: ToolsManifest | null;
    /** True when the manifest parsed AND passed structural validation. */
    valid?: boolean;
    /** Validation / read errors (shown instead of the tool list when invalid). */
    errors?: string[];
}

export const getDefaultToolsetEditorState = (): ToolsetEditorState => ({
    id: crypto.randomUUID(),
    title: "Agent Tool",
    modified: false,
    type: "toolsetPage",
    editor: "toolset-view",
    manifest: null,
});

/**
 * Toolset editor (EPIC-038 / US-805).
 *
 * A lightweight, read-only view of a single registered toolset: shows the manifest's info + the
 * declared tools and offers Open-Folder / Open-Log buttons. Opened by a `persephone-toolset://`
 * link — from the Boards/Tools panels, or the Explorer `tools-manifest.json` "Open Toolset"
 * button (which registers first when untrusted). It does NOT execute anything, so it is not itself
 * trust-gated; registration state is shown as a chip. A plain main editor — does not survive
 * navigation.
 */
export class ToolsetEditorModel extends EditorModel<ToolsetEditorState> {
    readonly editorId = "toolset-view";

    noLanguage = true;
    skipSave = true;
    showBackgroundOrnament = true;

    getIcon = (): ReactNode => createElement(ToolsIcon);

    /** Absolute path to this toolset's execution log (for the Open-Log action), or undefined
     *  when no toolset is resolved. */
    getLogPath(): string | undefined {
        const root = this.state.get().toolsetRoot;
        return root ? fpJoin(root, TOOLS_EXECUTION_LOG_FILE) : undefined;
    }

    /** Per-page singleton: re-navigating to the SAME toolset reuses this instance rather than
     *  stacking a duplicate. Matches the `persephone-toolset://` link for this toolset's root. */
    matchesNavigationTarget(target: string | undefined, filePath: string): boolean {
        if (target !== "toolset-view") return false;
        const root = this.state.get().toolsetRoot;
        if (!root) return false;
        const link = decodePersephoneToolsetLink(filePath);
        return !!link && fpNormalizeForCompare(link.toolsetRoot) === fpNormalizeForCompare(root);
    }

    onNavigationReuse(): void {
        void this.reload();
    }

    /** Init — opened by a `persephone-toolset://` link (US-805). */
    initFromToolsetRoot(toolsetRoot: string): void {
        this.state.update((s) => {
            s.toolsetRoot = toolsetRoot;
            s.title = fpBasename(toolsetRoot);
        });
        void this.reload();
    }

    /** Persistence restore (app restart + cross-window). `toolsetRoot` rides the persisted state;
     *  re-read the manifest. Drop broken state with no `toolsetRoot`. */
    async restore(): Promise<void> {
        const s = this.state.get();
        if (!s.toolsetRoot) throw new Error("toolset editor without a root — dropped on restore");
        await this.reload();
    }

    /** (Re-)read the manifest at `toolsetRoot`, validate it, and refresh the reactive state.
     *  Called on init/restore, on navigation reuse, and by the view's Refresh button. */
    async reload(): Promise<void> {
        const root = this.state.get().toolsetRoot;
        if (!root) return;
        const manifest = await readToolsManifest(root);
        const validation = manifest
            ? validateToolsManifest(manifest)
            : { ok: false, errors: ["Manifest missing or unreadable."] };
        const name =
            (manifest && typeof manifest.name === "string" && manifest.name.trim()) ||
            fpBasename(root);
        this.state.update((s) => {
            s.manifest = manifest;
            s.valid = validation.ok;
            s.errors = validation.errors;
            s.title = name;
        });
    }
}
