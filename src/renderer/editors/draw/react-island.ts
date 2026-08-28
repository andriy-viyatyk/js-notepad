import type React from "react";
import { createRoot } from "react-dom/client";

export interface MountedReactRoot {
    render(element: React.ReactElement): void;
    dispose(): void;
}

/**
 * Mount a React subtree and retain the root so later values can be rendered
 * without replacing the nested React tree.
 */
export function mountReactHandle(
    host: HTMLElement,
    element: React.ReactElement,
): MountedReactRoot {
    const root = createRoot(host);
    // Mark the host so every vanilla-to-React island is countable from the DOM. The De-React
    // programme's Rule 4 measurements count React roots, and `fillSlot`'s own span carries
    // `data-part="react-slot"` — without a marker here a `mountReactHandle` island is invisible
    // to that query and a sidebar with a live React subtree measures zero (EPIC-063 E5-3).
    host.dataset.reactRoot = "";
    root.render(element);

    let disposed = false;
    return {
        render(nextElement: React.ReactElement): void {
            if (disposed) return;
            root.render(nextElement);
        },
        dispose(): void {
            if (disposed) {
                return;
            }

            disposed = true;
            root.unmount();
            delete host.dataset.reactRoot;
        },
    };
}
