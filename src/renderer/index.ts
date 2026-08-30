import { AlertsBarView } from "./uikit/Notification/AlertsBar";
import { ProgressOverlayView } from "./uikit/Progress/ProgressOverlayView";
import { DialogsView } from "./ui/dialogs/DialogsView";
import { PoppersView } from "./ui/dialogs/poppers/PoppersView";
import { MainPageView } from "./ui/app/MainPageView";
import { installGlobalStyles } from "./theme/global-styles";
import "./editors/register-editors";

export function mount(container: HTMLElement): () => void {
    const disposeGlobalStyles = installGlobalStyles();

    const mainPage = new MainPageView({});
    container.append(mainPage.root);
    mainPage.mount();

    const dialogs = new DialogsView(undefined);
    container.append(dialogs.root);
    dialogs.mount();

    const progress = new ProgressOverlayView({});
    container.append(progress.root);
    progress.mount();

    // `AlertsBar` is already a native face over `AlertsBarView`.
    // mounting a wrapper would create an unnecessary framework root purely to wrap a vanilla view — the one thing D9 exists to remove.
    // The startup path creates no extra framework root.
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
        disposeGlobalStyles();
    };
}
