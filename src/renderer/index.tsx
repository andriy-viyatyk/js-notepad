import React from "react";
import { mountReactHandle } from "./uikit/shared/mount";
import { AlertsBarView } from "./uikit/Notification/AlertsBar";
import { ProgressOverlayView } from "./uikit/Progress/ProgressOverlayView";
import { DialogsView } from "./ui/dialogs/DialogsView";
import { PoppersView } from "./ui/dialogs/poppers/PoppersView";
import { MainPageView } from "./ui/app/MainPageView";
import { GlobalStyles } from "./theme/GlobalStyles";
import "./editors/register-editors";

export function mount(container: HTMLElement): () => void {
    const globalStylesHost = document.createElement("div");
    globalStylesHost.style.display = "contents";
    container.append(globalStylesHost);
    const globalStylesHandle = mountReactHandle(globalStylesHost, React.createElement(GlobalStyles));

    const mainPage = new MainPageView({});
    container.append(mainPage.root);
    mainPage.mount();

    const dialogs = new DialogsView(undefined);
    container.append(dialogs.root);
    dialogs.mount();

    const progress = new ProgressOverlayView({});
    container.append(progress.root);
    progress.mount();

    // `AlertsBar` is only a React face over `AlertsBarView` (`mountVanilla`), so mounting the face
    // would create a React root purely to wrap a vanilla view — the one thing D9 exists to remove.
    // `GlobalStyles` is the sole startup React root, and D6 owns it.
    const alerts = new AlertsBarView({});
    container.append(alerts.root);
    alerts.mount();

    const poppers = new PoppersView(undefined);
    container.append(poppers.root);
    poppers.mount();

    return () => {
        poppers.dispose();
        poppers.root.remove();
        alerts.dispose();
        alerts.root.remove();
        progress.dispose();
        progress.root.remove();
        dialogs.dispose();
        dialogs.root.remove();
        mainPage.dispose();
        mainPage.root.remove();
        globalStylesHost.remove();
        globalStylesHandle.dispose();
    };
}
