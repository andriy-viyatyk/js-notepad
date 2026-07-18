import { TComponentState } from "../../core/state/state";
import { CONTENT_HOST_TRAIT } from "../base/editor-traits";
import type { EditorModel } from "../base/EditorModel";
import type { PageModel } from "../../api/pages/PageModel";
import { BoardInfoEditorModel, getDefaultBoardInfoEditorState } from "./BoardInfoEditorModel";

/**
 * Navigate a page's main editor to the Board Info editor with explicit params (EPIC-045 / US-867).
 *
 * `switchMainEditor` alone cannot cover every opener — its board branch only knows mask-bearing
 * trusted boards and its simple branch needs a `filePath`. This helper replaces the page's main
 * editor directly, preserving a transferable content host where one exists:
 *
 * - File page / content-host board (the outgoing editor holds `CONTENT_HOST_TRAIT`): the host is
 *   transferred losslessly via `switchFrom`, so **Open board** can return to the board view with the
 *   file content intact.
 * - Simple board / `board-view` / standalone (no host): `confirmRelease` runs first (a veto aborts),
 *   then a host-less Board Info opens.
 *
 * Reached from the board-toolbar Properties button, the hub, and the update toast.
 */
export async function openBoardInfo(
    page: PageModel,
    opts: { catalogId?: string; boardRoot?: string },
): Promise<void> {
    const old = page.mainEditorInstance;
    const hostTrait = old?.traits.get(CONTENT_HOST_TRAIT);
    if (old && !hostTrait && !(await old.confirmRelease())) return; // simple/board-view veto
    // A host-less source (a simple custom-editor board / `board-view`) carries no content host to
    // hand over, so capture its file path directly. Board Info's switch widget then offers the
    // file's real peers (e.g. Archive | Excel | +) and a working path back to the board (US-876).
    const filePath = old && !hostTrait ? old.filePath : undefined;
    const model = new BoardInfoEditorModel(
        new TComponentState({
            ...getDefaultBoardInfoEditorState(),
            ...opts,
            ...(filePath ? { filePath } : {}),
        }),
    );
    if (old && hostTrait) model.switchFrom(old); // lossless host transfer (tolerant of host-less)
    await model.restore();
    await page.setMainEditor(model as unknown as EditorModel);
}

/**
 * Open the Board Info editor in a NEW page (EPIC-045 / US-870 — the hub's Install / Update /
 * Properties actions). Unlike `openBoardInfo(page, …)`, which replaces an existing page's main
 * editor, this creates a fresh Board Info page and focuses it, leaving all other pages untouched.
 * `catalogId` → install mode; `boardRoot` → properties mode.
 */
export async function openBoardInfoPage(
    opts: { catalogId?: string; boardRoot?: string },
): Promise<void> {
    const { app } = await import("../../api/app");
    const model = new BoardInfoEditorModel(
        new TComponentState({ ...getDefaultBoardInfoEditorState(), ...opts }),
    );
    await model.restore();
    app.pages.addPage(model as unknown as EditorModel);
}
