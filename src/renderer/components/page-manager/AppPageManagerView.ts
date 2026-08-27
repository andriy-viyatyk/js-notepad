import type { VanillaViewCtor } from "../../uikit/shared/mount";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { GroupContainer } from "./GroupContainer";
import { PageSlot, type PageSlotViewProps } from "./PageSlot";

export interface AppPageManagerProps {
    /** All page IDs in display order. */
    pageIds: string[];
    /** Active page ID. */
    activeId: string;
    /** Grouped page ID (the partner of the active page, if grouped). */
    groupedActiveId?: string;
    /** Grouping map: left page ID → right page ID. */
    grouping: Map<string, string>;
    /** Set of left page IDs in compare mode. */
    compareModeIds?: Set<string>;
    /** Native constructor for page content. */
    pageView: VanillaViewCtor<PageSlotViewProps>;
    /** Optional CSS class for the container. */
    className?: string;
}

/** Native application-page host with deferred React page islands and CSS grouping. */
export class AppPageManagerView extends VanillaView<AppPageManagerProps> {
    private readonly slots = new Map<string, PageSlot>();
    private readonly groupContainers = new Map<string, GroupContainer>();
    private readonly hasBeenActive = new Set<string>();

    public constructor(props: AppPageManagerProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.reconcile(this.props);
    }

    protected onUpdate(props: AppPageManagerProps): void {
        this.reconcile(props);
    }

    protected onDispose(): void {
        const groups = Array.from(this.groupContainers.values());
        const slots = Array.from(this.slots.values());
        this.groupContainers.clear();
        this.slots.clear();
        this.hasBeenActive.clear();

        let firstError: unknown;
        let hasError = false;
        const runCleanup = (cleanup: () => void): void => {
            try {
                cleanup();
            } catch (error) {
                if (!hasError) {
                    hasError = true;
                    firstError = error;
                }
            }
        };

        groups.forEach((group) => runCleanup(() => group.dispose()));
        slots.forEach((slot) => runCleanup(() => slot.dispose()));

        if (hasError) {
            throw firstError;
        }
    }

    private reconcile(props: AppPageManagerProps): void {
        const {
            pageIds,
            activeId,
            groupedActiveId,
            grouping,
            compareModeIds,
            pageView,
            className,
        } = props;
        this.root.className = className ?? "";

        if (activeId) this.hasBeenActive.add(activeId);
        if (groupedActiveId) this.hasBeenActive.add(groupedActiveId);

        const currentIds = new Set(pageIds);

        for (const [id, slot] of this.slots) {
            if (!currentIds.has(id)) {
                slot.dispose();
                this.slots.delete(id);
                this.hasBeenActive.delete(id);
            }
        }

        const validGrouping = new Map<string, string>();
        for (const [leftId, rightId] of grouping) {
            if (currentIds.has(leftId) && currentIds.has(rightId)) {
                validGrouping.set(leftId, rightId);
            }
        }

        let firstError: unknown;
        let hasError = false;
        const runCleanup = (cleanup: () => void): void => {
            try {
                cleanup();
            } catch (error) {
                if (!hasError) {
                    hasError = true;
                    firstError = error;
                }
            }
        };

        for (const [leftId, group] of Array.from(this.groupContainers)) {
            const rightId = validGrouping.get(leftId);
            const expectedRight = rightId ? this.slots.get(rightId)?.element : undefined;
            if (!expectedRight || group.rightPlaceholder !== expectedRight) {
                this.groupContainers.delete(leftId);
                runCleanup(() => group.dispose());
            }
        }

        for (const leftId of validGrouping.keys()) {
            if (this.groupContainers.has(leftId)) {
                continue;
            }

            const rightId = validGrouping.get(leftId);
            if (!rightId) {
                continue;
            }
            const leftPlaceholder = this.slots.get(leftId)?.element;
            const rightPlaceholder = this.slots.get(rightId)?.element;
            if (!leftPlaceholder || !rightPlaceholder) {
                continue;
            }

            this.groupContainers.set(
                leftId,
                new GroupContainer(this.root as HTMLDivElement, leftPlaceholder, rightPlaceholder),
            );
        }

        for (const id of pageIds) {
            let slot = this.slots.get(id);
            if (!slot) {
                slot = new PageSlot(id, applyAppPageSlotStyle);
                this.slots.set(id, slot);
            }
            slot.attach(this.root);
        }

        for (const id of pageIds) {
            if (!this.hasBeenActive.has(id)) {
                continue;
            }
            this.slots.get(id)?.renderNative(this.root, pageView);
        }

        const activeGroupId = findGroupId(activeId, validGrouping);
        for (const [id, slot] of this.slots) {
            const groupId = findGroupId(id, validGrouping);
            if (groupId === undefined) {
                slot.element.style.display = id === activeId ? "flex" : "none";
                continue;
            }

            const isActiveGroup = groupId === activeGroupId;
            const inCompareMode = compareModeIds?.has(groupId) ?? false;
            if (!isActiveGroup) {
                slot.element.style.display = "none";
            } else if (inCompareMode) {
                if (validGrouping.has(id)) {
                    applyStandaloneStyle(slot.element);
                    slot.element.style.display = "flex";
                } else {
                    slot.element.style.display = "none";
                }
            } else {
                slot.element.style.display = "flex";
            }
        }

        for (const [leftId, group] of this.groupContainers) {
            const isActive = leftId === activeGroupId;
            const inCompareMode = compareModeIds?.has(leftId) ?? false;
            const wasCompareMode = group.compareMode;
            if (wasCompareMode !== inCompareMode) {
                group.setCompareMode(inCompareMode);
                if (wasCompareMode && !inCompareMode) {
                    const rightId = validGrouping.get(leftId);
                    const leftSlot = this.slots.get(leftId);
                    const rightSlot = rightId ? this.slots.get(rightId) : undefined;
                    const display = isActive ? "flex" : "none";
                    if (leftSlot) leftSlot.element.style.display = display;
                    if (rightSlot) rightSlot.element.style.display = display;
                }
            }
            group.splitter.element.style.display = isActive && !inCompareMode ? "" : "none";
        }

        if (hasError) {
            throw firstError;
        }
    }
}

function applyStandaloneStyle(element: HTMLDivElement): void {
    Object.assign(element.style, {
        top: "",
        bottom: "",
        left: "",
        right: "",
        width: "",
        minWidth: "",
        maxWidth: "",
        flex: "",
        flexShrink: "",
    });
    Object.assign(element.style, {
        position: "absolute",
        inset: "0",
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
    });
}

function applyAppPageSlotStyle(element: HTMLDivElement): void {
    applyStandaloneStyle(element);
    element.style.display = "none";
}

function findGroupId(
    pageId: string,
    grouping: Map<string, string>,
): string | undefined {
    if (grouping.has(pageId)) return pageId;
    for (const [leftId, rightId] of grouping) {
        if (rightId === pageId) return leftId;
    }
    return undefined;
}
