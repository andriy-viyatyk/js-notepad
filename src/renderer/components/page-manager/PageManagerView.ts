import type { VanillaViewCtor } from "../../uikit/shared/vanilla-view";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { PageSlot, type PageSlotViewProps } from "./PageSlot";

export interface PageManagerProps {
    /** Unique IDs for each page/tab — must be stable across renders. */
    pageIds: string[];
    /** ID of the currently active (visible) page. */
    activeId: string;
    /** Page factory — receives a page ID and returns a native page view. */
    renderPage: (id: string) => VanillaViewCtor<PageSlotViewProps>;
    /** Optional CSS class for the container div. */
    className?: string;
}

/** Native host for browser internal tabs with one retained page view per tab. */
export class PageManagerView extends VanillaView<PageManagerProps> {
    private readonly slots = new Map<string, PageSlot>();

    public constructor(props: PageManagerProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.reconcile(this.props);
    }

    protected onUpdate(props: PageManagerProps): void {
        this.reconcile(props);
    }

    protected onDispose(): void {
        const slots = Array.from(this.slots.values());
        this.slots.clear();

        let firstError: unknown;
        let hasError = false;
        for (const slot of slots) {
            try {
                slot.dispose();
            } catch (error) {
                if (!hasError) {
                    hasError = true;
                    firstError = error;
                }
            }
        }

        if (hasError) {
            throw firstError;
        }
    }

    private reconcile(props: PageManagerProps): void {
        const { pageIds, renderPage, activeId, className } = props;
        this.root.className = className ?? "";
        const currentIds = new Set(pageIds);

        for (const [id, slot] of this.slots) {
            if (!currentIds.has(id)) {
                slot.dispose();
                this.slots.delete(id);
            }
        }

        for (const id of pageIds) {
            let slot = this.slots.get(id);
            if (!slot) {
                slot = new PageSlot(id, applyPageManagerStyle);
                this.slots.set(id, slot);
            }
            slot.renderNative(this.root, renderPage(id));
        }

        for (const [id, slot] of this.slots) {
            slot.element.style.display = id === activeId ? "" : "none";
        }
    }
}

function applyPageManagerStyle(element: HTMLDivElement): void {
    element.style.position = "absolute";
    element.style.inset = "0";
    element.style.display = "none";
}
