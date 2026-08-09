import type {
    IUserInterface,
    IConfirmOptions,
    IInputOptions,
    IInputResult,
    IPasswordOptions,
    ITextDialogOptions,
    ITextDialogResult,
    IHighlightOptions,
    IHighlightResult,
    NotificationType,
} from "./types/ui";
import { alertsBarModel } from "../uikit";

/** Surface installed on `window` by `assets/ui-highlight.js`. */
interface IHighlightApi {
    version: number;
    show(options: IHighlightOptions & { selector: string }): IHighlightResult;
    clear(id?: string): number;
}

declare global {
    interface Window {
        __persephoneHighlight?: IHighlightApi;
    }
}

class UserInterface implements IUserInterface {
    async confirm(message: string, options?: IConfirmOptions): Promise<string | null> {
        const { showConfirmationDialog } = await import("../ui/dialogs/ConfirmationDialog");
        const result = await showConfirmationDialog({
            message,
            ...options,
        });
        return result ?? null;
    }

    async input(message: string, options?: IInputOptions): Promise<IInputResult | null> {
        const { showInputDialog } = await import("../ui/dialogs/InputDialog");
        const result = await showInputDialog({
            message,
            ...options,
        });
        return result ?? null;
    }

    async password(options?: IPasswordOptions): Promise<string | null> {
        const { showPasswordDialog } = await import("../ui/dialogs/PasswordDialog");
        const result = await showPasswordDialog(options);
        return result ?? null;
    }

    notify(message: string, type?: NotificationType): Promise<string | undefined> {
        return alertsBarModel.addAlert(message, type ?? "info") as Promise<string | undefined>;
    }

    async textDialog(options: ITextDialogOptions): Promise<ITextDialogResult | null> {
        const { showTextDialog } = await import("../ui/dialogs/TextDialog");
        const result = await showTextDialog(options);
        return result ?? null;
    }

    async showProgress<T>(promise: Promise<T>, label?: string): Promise<T> {
        const { showProgress } = await import("../uikit/Progress/progressModel");
        return showProgress(promise, label ?? "Processing...");
    }

    async createProgress(label?: string): Promise<import("../uikit/Progress/progressModel").ProgressHandle> {
        const { createProgress } = await import("../uikit/Progress/progressModel");
        return createProgress(label ?? "Processing...");
    }

    notifyProgress(label: string, timeout?: number): void {
        import("../uikit/Progress/progressModel").then(({ notifyProgress }) => {
            notifyProgress(label, timeout);
        });
    }

    async addScreenLock(): Promise<{ release: () => void }> {
        const { addScreenLock, removeScreenLock } = await import("../uikit/Progress/progressModel");
        const lock = addScreenLock();
        return { release: () => removeScreenLock(lock) };
    }

    // ── Element highlighting ────────────────────────────────────────────
    //
    // The overlay lives in `assets/agent/ui-highlight.js` rather than here, because the same file
    // is pasted into `browser_evaluate` to highlight elements inside boards and browser pages —
    // contexts the renderer's module graph cannot reach. One implementation, three targets.
    //
    // It sits in a subfolder because the `app-asset://` handler maps the URL's HOST to a
    // directory under `assets/` (`app-asset://<dir>/<file>`); a top-level asset file has no
    // reachable URL.

    private highlightLoader?: Promise<IHighlightApi>;

    private loadHighlight(): Promise<IHighlightApi> {
        if (!this.highlightLoader) {
            this.highlightLoader = fetch("app-asset://agent/ui-highlight.js")
                .then((response) => {
                    if (!response.ok) throw new Error(`ui-highlight.js: HTTP ${response.status}`);
                    return response.text();
                })
                .then((code) => {
                    // Same mechanism the script runner uses; the app CSP grants 'unsafe-eval'
                    // and the source is a packaged asset, not remote content.
                    new Function(code)();
                    const api = window.__persephoneHighlight;
                    if (!api) throw new Error("ui-highlight.js did not install its API");
                    return api;
                })
                .catch((error) => {
                    // Drop the cached promise so a later call can retry.
                    this.highlightLoader = undefined;
                    throw error;
                });
        }
        return this.highlightLoader;
    }

    async highlightElement(
        selector: string,
        text?: string,
        options?: IHighlightOptions,
    ): Promise<IHighlightResult> {
        const api = await this.loadHighlight();
        return api.show({ ...options, selector, text: text ?? options?.text });
    }

    async clearHighlights(id?: string): Promise<number> {
        const api = window.__persephoneHighlight;
        // Nothing loaded means nothing highlighted — don't fetch the module just to clear.
        if (!api) return 0;
        return api.clear(id);
    }
}

export const ui = new UserInterface();
