import { errMessage } from "../../shared/utils";

/**
 * Hand a file or folder to the OS shell, the way double-clicking it in Windows
 * Explorer would (`shell.openPath` in main).
 *
 * Shared by the tree context menu ("Open with Default App") and the Explorer
 * panel's double-click, so both report failure the same way. `shell.openPath`
 * does NOT throw when it cannot open something — it resolves to an error string
 * (typically because no application is registered for the extension), which is
 * why this returns/reports rather than relying on a rejected promise.
 */
export async function openWithDefaultApp(path: string): Promise<void> {
    const { api } = await import("../../ipc/renderer/api");
    let error: string;
    try {
        error = await api.openPath(path);
    } catch (err) {
        error = errMessage(err);
    }
    if (!error) return;

    const { ui } = await import("../api/ui");
    void ui.notify(`Could not open ${path}: ${error}`, "error");
}
