import { DisposableStore, type Cleanup, type IDisposable } from "../../core/utils/DisposableStore";

/**
 * Imperative vertical splitter for the native page layout.
 * Positions two sibling placeholder divs side-by-side using absolute
 * positioning (no reparenting to avoid iframe/webview reload).
 *
 * Layout managed by this splitter:
 *   leftPane:  left=0, width=Npx
 *   splitter:  left=Npx, width=8px
 *   rightPane: left=(N+8)px, right=0
 */
export class ImperativeSplitter {
    readonly element: HTMLDivElement;
    /** When true, resize observer and drag are disabled (e.g. during compare mode) */
    paused = false;
    private widthK = 0.5;
    private observer: ResizeObserver;
    private disposed = false;
    private dragging = false;
    private startX = 0;
    private startLeftWidth = 0;

    constructor(
        private container: HTMLDivElement,
        private leftPane: HTMLDivElement,
        private rightPane: HTMLDivElement,
        private readonly disposables: DisposableStore,
    ) {
        this.element = document.createElement("div");
        Object.assign(this.element.style, {
            position: "absolute",
            top: "0",
            bottom: "0",
            width: "8px",
            flexShrink: "0",
            flexGrow: "0",
            cursor: "ew-resize",
            backgroundColor: "var(--color-bg-dark)",
            boxSizing: "border-box",
            zIndex: "1",
        });
        this.element.addEventListener("mouseenter", this.handleMouseEnter);
        this.element.addEventListener("mouseleave", this.handleMouseLeave);
        this.element.addEventListener("pointerdown", this.handlePointerDown);
        this.element.addEventListener("pointermove", this.handlePointerMove);
        this.element.addEventListener("pointerup", this.handlePointerUp);
        this.element.addEventListener("dblclick", this.handleDoubleClick);

        this.observer = new ResizeObserver(this.handleResize);
        this.observer.observe(container);

        // Preserve the existing teardown order: observer first, then element listeners.
        this.register(() => this.observer.disconnect());
        this.register(() => this.element.removeEventListener("mouseenter", this.handleMouseEnter));
        this.register(() => this.element.removeEventListener("mouseleave", this.handleMouseLeave));
        this.register(() => this.element.removeEventListener("pointerdown", this.handlePointerDown));
        this.register(() => this.element.removeEventListener("pointermove", this.handlePointerMove));
        this.register(() => this.element.removeEventListener("pointerup", this.handlePointerUp));
        this.register(() => this.element.removeEventListener("dblclick", this.handleDoubleClick));

        this.applyLayout();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.disposables.dispose();
    }

    private register(disposable: Cleanup | IDisposable): void {
        if (this.disposed) return;
        this.disposables.add(disposable);
    }

    /** Re-apply the current layout (call after compare mode exit restores grouped view) */
    reapplyLayout() {
        this.applyLayout();
    }

    private getAvailableWidth() {
        return this.container.clientWidth - 8; // 8px for splitter
    }

    private applyLayout() {
        const available = this.getAvailableWidth();
        const leftWidth = Math.max(100, Math.min(available - 100, available * this.widthK));

        // Position left pane
        this.leftPane.style.left = "0";
        this.leftPane.style.width = `${leftWidth}px`;

        // Position splitter
        this.element.style.left = `${leftWidth}px`;

        // Position right pane
        this.rightPane.style.left = `${leftWidth + 8}px`;
        this.rightPane.style.right = "0";
        this.rightPane.style.width = "";
    }

    private handleMouseEnter = () => {
        this.element.style.backgroundColor = "var(--color-bg-light)";
    };

    private handleMouseLeave = () => {
        if (!this.dragging) {
            this.element.style.backgroundColor = "var(--color-bg-dark)";
        }
    };

    private handlePointerDown = (e: PointerEvent) => {
        e.preventDefault();
        this.element.setPointerCapture(e.pointerId);
        this.dragging = true;
        this.startX = e.clientX;
        this.startLeftWidth = this.leftPane.clientWidth;
    };

    private handlePointerMove = (e: PointerEvent) => {
        if (!this.dragging) return;
        const dx = e.clientX - this.startX;
        const available = this.getAvailableWidth();
        const newWidth = Math.max(100, Math.min(available - 100, this.startLeftWidth + dx));
        this.widthK = newWidth / available;
        this.applyLayout();
    };

    private handlePointerUp = (e: PointerEvent) => {
        if (!this.dragging) return;
        this.element.releasePointerCapture(e.pointerId);
        this.dragging = false;
        this.element.style.backgroundColor = "var(--color-bg-dark)";
    };

    private handleDoubleClick = () => {
        this.widthK = 0.5;
        this.applyLayout();
    };

    private handleResize = () => {
        if (!this.paused) this.applyLayout();
    };
}
