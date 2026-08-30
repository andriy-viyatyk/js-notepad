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
    // programme's Rule 4 measurements count live roots separately from native `fillSlot` hosts,
    // which carry `data-part="children-slot"`; this direct mount host is neither, so it needs its
    // own marker or a live Excalidraw island would be invisible to the root query (EPIC-063 E5-3).
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
