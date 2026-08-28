import { TComponentState } from "../../core/state/state";
import type { EditorModel } from "./EditorModel";
import { editorRegistry } from "./editorRegistry";
// customEditorRegistry is deliberately static: the module is already required
// statically for parseBoardEditorId, so a nested dynamic import of it would be
// redundant (this whole module is only reached via PageModel's dynamic import).
import { parseBoardEditorId, customEditorRegistry } from "../board/custom-editor-registry";
import { BOARD_INFO_EDITOR_ID } from "../board-info/board-info-id";
import type { PageModel } from "../../api/pages/PageModel";
import { guard } from "../../core/utils/guard";
import { fpBasename } from "../../core/utils/file-path";

// ============================================================================
// editor-switch — the switch-widget "open this file in editor X" transition.
//
// Extracted from PageModel so the page model holds page state only; PageModel
// keeps a thin dynamic-import delegate. The pages model is reached via dynamic
// import (child→parent) exactly as the original code did from PageModel.
// ============================================================================

/** Shared dispose-and-rebuild path: confirm release of the old editor, rebuild
 *  the target FRESH over the file, honor an explicit built-in target that
 *  differs from the file's natural resolveId (mirrors openFile /
 *  navigatePageTo; no-op for board targets), and install it as main. */
async function rebuildEditorOverFile(
    page: PageModel,
    oldEditor: EditorModel,
    filePath: string,
    newEditorId: string,
): Promise<void> {
    const released = await oldEditor.confirmRelease();
    if (!released) return; // Cancel → stay on the current editor
    const { pagesModel } = await import("../../api/pages");
    const { attachEditorToPage } = await import("../../api/pages/PagesLifecycleModel");
    // A failed module load for the target editor rejects here. Unguarded, the user
    // answered the release prompt and then nothing happened at all (US-1163's shape).
    // `confirmRelease` is a predicate and disposes nothing, so aborting leaves the
    // existing editor installed and usable — the toast explains why it stayed.
    const built = await guard(`Failed to open ${fpBasename(filePath)}`, () =>
        pagesModel.lifecycle.createEditorFromFile(filePath, undefined, newEditorId));
    if (!built) return;
    if (
        built.state.get().type === "textFile"
        && parseBoardEditorId(newEditorId) === null
    ) {
        built.state.update((s) => {
            (s as { editor?: string }).editor = newEditorId;
        });
    }
    await page.setMainEditor(attachEditorToPage(built));
}

export async function switchMainEditor(
    page: PageModel,
    newEditorId: string,
): Promise<void> {
    const oldEditor = page.mainEditorInstance;
    if (!oldEditor) return;
    if (oldEditor.editorId === newEditorId) return;

    // A board editor (either side) has no shared content host to hand over via
    // `switchFrom`, so a board-boundary switch confirms release of the old editor
    // (CE4) and rebuilds the target FRESH over the file (dispose-and-rebuild). The
    // board writes the file directly, so a rebuilt built-in reads current disk
    // content — no stale-cache handling needed.
    const newBoardRoot = parseBoardEditorId(newEditorId);
    const boardInvolved =
        newBoardRoot !== null
        || parseBoardEditorId(oldEditor.editorId) !== null;
    if (boardInvolved) {
        // A content-host board (EPIC-043) transfers the shared host like Monaco↔Grid;
        // a simple board (EPIC-042) has no host and dispose-and-rebuilds. Determine the
        // NEW board's kind from the registry (a plain built-in is host-capable iff it
        // declares `hasContentHost`).
        let newBoardKind: "simple" | "content-host" | undefined;
        if (newBoardRoot !== null) {
            newBoardKind =
                customEditorRegistry.entries.find((e) => e.editorId === newEditorId)
                    ?.editorKind ?? "simple";
        }
        const oldHostCapable = !!oldEditor.contentHost;
        const newHostCapable =
            newBoardRoot !== null
                ? newBoardKind === "content-host"
                : !!editorRegistry.getById(newEditorId)?.hasContentHost;

        if (oldHostCapable && newHostCapable) {
            // Host-transfer switch — no reload, no confirmRelease (nothing is lost).
            let newEditor: EditorModel;
            if (newBoardRoot !== null) {
                const { getDefaultBoardEditorState } = await import("../board");
                const { BoardContentEditorModel } = await import(
                    "../board/BoardContentEditorModel"
                );
                const filePath =
                    (oldEditor.contentHost as { filePath?: string } | null)?.filePath
                    ?? oldEditor.filePath;
                const model = new BoardContentEditorModel(
                    new TComponentState(getDefaultBoardEditorState()),
                );
                model.initFromBoardRoot(newBoardRoot, filePath ?? undefined);
                newEditor = model as unknown as EditorModel;
            } else {
                newEditor = await editorRegistry.createEditor(newEditorId);
            }
            newEditor.switchFrom(oldEditor); // extracts + adopts the shared host
            await newEditor.restore();
            await page.setMainEditor(newEditor);
            return;
        }

        // Simple board (either direction) — dispose-and-rebuild + confirmRelease (EPIC-042).
        const filePath =
            (oldEditor.contentHost as { filePath?: string } | null)?.filePath
            ?? oldEditor.filePath;
        if (!filePath) return;
        await rebuildEditorOverFile(page, oldEditor, filePath, newEditorId);
        return;
    }

    const def = editorRegistry.getById(newEditorId);
    if (!def) {
        throw new Error(`No editor registered for id: ${newEditorId}`);
    }
    // A host-transfer switch needs the OLD editor to actually hold a shared content host for
    // the new one to adopt. A host-less source — the Board Info install page that never
    // adopted a host, or the host-less Archive viewer for a zip-based file (US-864/US-876) —
    // has nothing to hand over, and a real file editor's `switchFrom` would throw. When the
    // target is such a file editor, dispose-and-rebuild it over the file instead (mirrors the
    // simple-board branch above). The "+" install target (Board Info) is exempt: its tolerant
    // `switchFrom` captures the file path itself, so it stays on the createEditor path below.
    if (!oldEditor.contentHost && newEditorId !== BOARD_INFO_EDITOR_ID) {
        const filePath = oldEditor.filePath;
        if (!filePath) return;
        await rebuildEditorOverFile(page, oldEditor, filePath, newEditorId);
        return;
    }
    const newEditor = await editorRegistry.createEditor(newEditorId);
    newEditor.switchFrom(oldEditor);
    await newEditor.restore();
    await page.setMainEditor(newEditor);
}
