import { boardVars } from "../../api/board-vars/BoardEnvStore";
import type { EnvVarsEditor } from "./EnvVarsEditor";

// =============================================================================
// persephone.var.show() — open the CONFIGURED board-vars file, scoped to the calling
// board's namespace (EPIC-046 / US-889).
//
// Mirrors PagesModel.openFile's "dispatch via openRawLink, then look the page up
// independently" shape rather than calling PagesLifecycleModel.openFile directly — that
// shape is what makes this work identically whether the file is fresh-opened or already
// open in another tab (see US-889 task doc, Background/design decision #7).
//
// Imports BoardEnvStore directly (not the api/board-vars barrel) to avoid a circular
// module dependency: the barrel re-exports board-vars-bridge.ts, which imports this file.
// =============================================================================

export async function openEnvVarsPage(namespace: string): Promise<void> {
    const path = boardVars.filePath;
    if (!path) throw new Error("Board environment variables file is not configured.");

    const { app } = await import("../../api/app");
    const { createLinkData } = await import("../../../shared/link-data");
    await app.events.openRawLink.sendAsync(
        createLinkData(path, {
            target: "env-vars-view",
            envNamespace: namespace,
            sourceId: "board-vars-show",
        }),
    );

    const { pagesModel } = await import("../../api/pages");
    const page = pagesModel.pages.find(
        (p) => (p.mainEditor as { filePath?: string } | null)?.filePath === path,
    );
    (page?.mainEditorInstance as unknown as EnvVarsEditor | undefined)?.focusNamespace(namespace);
}
