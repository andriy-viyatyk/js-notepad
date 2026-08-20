import type { Placement } from "@floating-ui/dom";
import { MenuView } from "./MenuView";
import type { MenuItem } from "./types";

export interface MenuAttachOptions {
    items: MenuItem[];
    placement?: Placement;
    offset?: [number, number];
    name?: string;
    onClose?: () => void;
}

export interface MenuHandle {
    update(options: MenuAttachOptions): void;
    dispose(): void;
}

/** Attach one caller-owned vanilla menu to an anchor. */
export function openMenu(anchor: Element, options: MenuAttachOptions): MenuHandle {
    let currentOptions = options;
    let disposed = false;
    let closeNotified = false;
    let disposeOwned = (): void => undefined;

    const close = (): void => {
        if (disposed || closeNotified) return;
        closeNotified = true;
        const callback = currentOptions.onClose;
        disposeOwned();
        callback?.();
    };

    const view = new MenuView({
        ...options,
        elementRef: anchor,
        open: true,
        onClose: (itemClicked) => {
            void itemClicked;
            close();
        },
    });
    document.body.append(view.root);
    try {
        view.mount();
    } catch (error) {
        view.dispose();
        view.root.remove();
        throw error;
    }

    disposeOwned = (): void => {
        if (disposed) return;
        disposed = true;
        view.dispose();
        view.root.remove();
    };

    const handle: MenuHandle = {
        update(nextOptions): void {
            if (disposed) return;
            currentOptions = nextOptions;
            view.update({
                ...nextOptions,
                elementRef: anchor,
                open: true,
                onClose: (itemClicked) => {
                    void itemClicked;
                    close();
                },
            });
        },
        dispose(): void {
            disposeOwned();
        },
    };
    return handle;
}
