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
    const model = new BoardInfoEditorModel(
        new TComponentState({ ...getDefaultBoardInfoEditorState(), ...opts }),
    );
    if (old && hostTrait) model.switchFrom(old); // lossless host transfer (tolerant of host-less)
    await model.restore();
    await page.setMainEditor(model as unknown as EditorModel);
}
