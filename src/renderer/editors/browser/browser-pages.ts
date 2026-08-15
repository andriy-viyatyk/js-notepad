import { TComponentState } from "../../core/state/state";
import { BrowserEditor } from "./BrowserEditor";
import { getDefaultBrowserPageState } from "./BrowserEditorModel";
import type { PagesModel } from "../../api/pages/PagesModel";
import type { PageModel } from "../../api/pages/PageModel";
import { settings } from "../../api/settings";
import { ui } from "../../api/ui";
import { fs as appFs } from "../../api/fs";
import { errMessage } from "../../../shared/utils";

// ============================================================================
// Browser page opening — the browser-specific halves of the pages lifecycle.
//
// Lives here (not in PagesLifecycleModel) so the startup-loaded pages model
// carries no static import of the browser chunk; the lifecycle reaches these
// through `await import(...)`, keeping the browser editor lazily loaded.
// ============================================================================

export interface ShowBrowserPageOptions {
    profileName?: string;
    incognito?: boolean;
    tor?: boolean;
    url?: string;
}

export async function showBrowserPage(
    model: PagesModel,
    options?: ShowBrowserPageOptions,
): Promise<PageModel | undefined> {
    if (options?.tor) {
        const torPath = settings.get("tor.exe-path");
        if (!torPath) {
            ui.notify(
                "Browser (Tor) requires tor.exe path. Configure it in Settings → tor.exe-path",
                "error",
            );
            return;
        }
        if (!(await appFs.exists(torPath))) {
            ui.notify(`tor.exe not found at: ${torPath}`, "error");
            return;
        }
    }

    const editor = new BrowserEditor(
        new TComponentState(getDefaultBrowserPageState()),
    );
    if (options?.profileName || options?.incognito || options?.tor) {
        editor.state.update((s) => {
            if (options.profileName) s.profileName = options.profileName;
            if (options.incognito) s.isIncognito = true;
            if (options.tor) s.isTor = true;
        });
    }
    const openUrl = options?.url;
    if (openUrl) {
        editor.state.update((s) => {
            s.url = openUrl;
            const tab = s.tabs?.[0];
            if (tab) {
                tab.url = openUrl;
                tab.homeUrl = openUrl;
            }
        });
    }
    await editor.restore();

    // Arm the Tor proxy BEFORE the page is added. `addPage` mounts the
    // webview, which begins loading `options.url` immediately, whereas the
    // daemon takes seconds to bootstrap — and an unproxied Electron
    // session is DIRECT. Arming first makes that window fail closed
    // instead of leaking the opening navigation onto the normal network.
    if (options?.tor) {
        try {
            await editor.armTorProxy();
        } catch (err) {
            // Refuse to open rather than open unproxied: a Tor page whose
            // partition could not be armed would browse over the normal
            // network, which is the exact failure this guards against.
            ui.notify(
                `Could not secure the Tor session — the page was not opened: ${
                    errMessage(err)
                }`,
                "error",
            );
            return;
        }
    }

    const page = model.lifecycle.addPage(editor);

    // Bootstrapping stays un-awaited: it can take tens of seconds, and the
    // partition is already fail-closed, so the page may mount behind the
    // Tor overlay while the daemon comes up.
    if (options?.tor) {
        void editor.initTorProxy();
    }
    return page;
}

export async function openUrlInBrowserTab(
    model: PagesModel,
    url: string,
    options?: {
        incognito?: boolean;
        profileName?: string;
        external?: boolean;
    },
): Promise<string | undefined> {
    const pages = model.state.get().pages;
    const activePage = model.query.activePage;
    const activeIndex = activePage ? pages.indexOf(activePage) : -1;

    const matchesBrowser = (page: PageModel) => {
        const editor = page.mainEditorInstance;
        if (!(editor instanceof BrowserEditor)) return false;
        const pageState = editor.state.get();
        if (options?.incognito) return !!pageState.isIncognito;
        if (options?.external) {
            return !pageState.isIncognito && !pageState.isTor;
        }
        const targetProfile =
            options?.profileName !== undefined
                ? options.profileName || ""
                : undefined;
        return (
            !pageState.isIncognito &&
            !pageState.isTor &&
            (targetProfile === undefined ||
                (pageState.profileName ?? "") === targetProfile)
        );
    };

    const addTabToPage = (index: number): string | undefined => {
        const page = pages[index];
        const editor = page.mainEditorInstance;
        if (!(editor instanceof BrowserEditor)) return undefined;
        const tabs = editor.state.get().tabs;
        if (tabs?.length === 1 && tabs[0].url === "about:blank") {
            editor.navigate(url);
        } else {
            editor.addTab(url);
        }
        model.navigation.showPage(page.id);
        return page.id;
    };

    if (options?.external) {
        if (activeIndex >= 0 && matchesBrowser(pages[activeIndex])) {
            return addTabToPage(activeIndex);
        }
        for (let i = 0; i < pages.length; i++) {
            if (matchesBrowser(pages[i])) {
                return addTabToPage(i);
            }
        }
    } else {
        if (activeIndex >= 0 && matchesBrowser(pages[activeIndex])) {
            return addTabToPage(activeIndex);
        }
        for (let i = activeIndex + 1; i < pages.length; i++) {
            if (matchesBrowser(pages[i])) {
                return addTabToPage(i);
            }
        }
        for (let i = activeIndex - 1; i >= 0; i--) {
            if (matchesBrowser(pages[i])) {
                return addTabToPage(i);
            }
        }
    }

    const profileName = options?.incognito
        ? undefined
        : (options?.profileName ??
              settings.get("browser-default-profile")) || undefined;
    const showOptions = {
        url,
        ...(options?.incognito
            ? { incognito: true }
            : profileName
              ? { profileName }
              : {}),
    };
    const page = await showBrowserPage(model, showOptions);
    return page?.id;
}
