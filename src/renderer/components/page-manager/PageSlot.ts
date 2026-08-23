import React, { type ReactNode } from "react";
import { mountReactHandle, type MountedReactRoot } from "../../uikit/shared/mount";

export type PageSlotStyle = (element: HTMLDivElement) => void;

/** Owns one stable page placeholder and its retained React page island. */
export class PageSlot {
    readonly element: HTMLDivElement;

    private reactHandle: MountedReactRoot | undefined;
    private generation = 0;
    private disposed = false;

    public constructor(
        readonly id: string,
        applyStyle: PageSlotStyle,
    ) {
        this.element = document.createElement("div");
        applyStyle(this.element);
    }

    /** Attach a newly-created placeholder without ever reordering a live one. */
    attach(root: HTMLElement): void {
        if (this.disposed || this.element.parentNode) {
            return;
        }

        root.appendChild(this.element);
    }

    /** Render into one retained root, attaching before its first mount. */
    render(root: HTMLElement, content: ReactNode): void {
        if (this.disposed) {
            return;
        }

        const element = React.createElement(React.Fragment, null, content);
        if (this.reactHandle) {
            this.reactHandle.render(element);
            return;
        }

        this.attach(root);
        this.reactHandle = mountReactHandle(this.element, element);
    }

    /** Detach immediately, then dispose the nested root after the outer commit. */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        const generation = ++this.generation;
        const reactHandle = this.reactHandle;
        this.reactHandle = undefined;
        this.element.remove();

        if (!reactHandle) {
            return;
        }

        queueMicrotask(() => {
            if (this.generation !== generation) {
                return;
            }
            reactHandle.dispose();
        });
    }
}
