import { TComponentState } from "../../core/state/state";
import { fpDirname } from "../../core/utils/file-path";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { PageModel } from "../../api/pages/PageModel";
import { ExplorerEditor, getDefaultExplorerEditorState } from "./ExplorerEditorModel";

// ============================================================================
// page-explorer — Explorer provisioning for a page.
//
// Extracted from PageModel: constructing an ExplorerEditor is an editor
// concern, not page state. The page keeps thin delegates (`toggleNavigator`
// is part of IPageHost) plus the sync `findExplorer` / `canOpenNavigator`
// queries and the microtask queueing for auto-init.
// ============================================================================

/** Derive the Explorer root folder from the first panel-contributing editor
 *  exposing a local-file navigator target (Link/Todo/Notebook/…). Returns
 *  "" when none has a file target (e.g. an unsaved collection). */
export function explorerRootForPanels(page: PageModel): string {
    for (const e of page.editors) {
        if (!e.contributesPanels()) continue;
        const target = e.getNavigatorTarget();
        if (!target) continue;
        if (target.pipe?.provider.type === "file" && target.pipe.provider.sourceUrl) {
            return fpDirname(target.pipe.provider.sourceUrl);
        }
        if (target.filePath) {
            return fpDirname(target.filePath);
        }
    }
    return "";
}

/** When the sidebar is mandatory (a panel editor like Links is present) and
 *  there is no Explorer yet, auto-create one rooted at the panel editor's
 *  file folder — restoring the pre-mandatory-sidebar affordance where the
 *  user could toggle a file-folder Explorer alongside the panels. Guarded by
 *  `findExplorer()` so a persisted Explorer re-attached during session
 *  restore is never duplicated (the page defers this call to a microtask;
 *  all restore attaches run synchronously before it fires). */
export async function autoInitExplorer(page: PageModel): Promise<void> {
    if (page.findExplorer()) return;
    if (!page.sidebarMandatory) return;
    const rootPath = explorerRootForPanels(page);
    if (!rootPath) return;
    const state = new TComponentState({
        ...getDefaultExplorerEditorState(),
        rootPath,
    });
    const explorer = new ExplorerEditor(state);
    page.attach(explorer);
    await explorer.restore();
}

/** Toggle the SecondaryViews panel. Creates an ExplorerEditor (rooted at the
 *  given pipe's / file's folder) when the page has neither an Explorer nor a
 *  sidebar model yet. */
export async function toggleNavigator(
    page: PageModel,
    pipe?: IContentPipe | null,
    filePath?: string,
): Promise<void> {
    const existing = page.findExplorer();
    if (existing || page.secondaryViewsModel) {
        const open = page.ensureSecondaryViewsModel().state.get().open;
        page.setSecondaryViewsState({ open: !open });
        return;
    }

    let rootPath = "";
    if (pipe?.provider.type === "file" && pipe.provider.sourceUrl) {
        rootPath = fpDirname(pipe.provider.sourceUrl);
    } else if (filePath) {
        rootPath = fpDirname(filePath);
    }
    if (!rootPath) return;

    const state = new TComponentState({
        ...getDefaultExplorerEditorState(),
        rootPath,
    });
    const explorer = new ExplorerEditor(state);
    page.attach(explorer);
    await explorer.restore();

    page.setSecondaryViewsState({ open: true });
}
