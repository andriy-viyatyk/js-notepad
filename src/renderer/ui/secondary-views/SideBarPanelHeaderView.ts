import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { createIconElement, isIconName } from "../../uikit/shared/slots";
import type { IconRef } from "../../uikit/shared/slots";
import type { IconName } from "../../theme/icon-registry";

type ImportMetaWithEnv = ImportMeta & {
    env?: {
        DEV?: boolean;
    };
};

const isDevelopment = (import.meta as ImportMetaWithEnv).env?.DEV === true;

/** Narrow a registry-resolved icon to the DOM arm used by vanilla headers. */
export function resolveSideBarPanelHeaderIcon(
    icon: IconRef | undefined,
    panelId: string,
): IconName | undefined {
    if (typeof icon === "string" && isIconName(icon)) return icon;
    if (icon !== undefined && isDevelopment) {
        console.error(
            `[SideBarPanelHeaderView] Cannot render icon for vanilla secondary panel "${panelId}": `
            + "SecondaryViewsView.resolveIcon returned a React EditorIcon fallback which the vanilla header cannot render.",
        );
    }
    return undefined;
}

// onShowMain is deliberately unimplemented for this pilot. GitPanelSecondaryView,
// MnemeTreeSecondaryView, and LinkCategorySecondaryView will need it in future vanilla
// conversions. Preserve data-type="sidebar-show-main" (the exact value is in the
// CollapsiblePanelStack.css pointer-events="auto" allowlist), data-active, stopPropagation
// on click, and replace the React Tooltip with attachTooltip, as IconButtonView does.

export interface SideBarPanelHeaderDomProps {
    headerRef: HTMLDivElement | null;
    icon?: IconName | Node;
    title: string;
    titleAttribute?: string;
    actions?: Node;
}

export interface SideBarPanelHeaderHandle {
    update(props: SideBarPanelHeaderDomProps): void;
    dispose(): void;
}

class SideBarPanelHeaderDom implements SideBarPanelHeaderHandle {
    private readonly titleElement: HTMLSpanElement;
    private readonly titleGroup: HTMLDivElement;
    private readonly actionsGroup: HTMLDivElement;
    private currentHeader: HTMLDivElement | null = null;
    private currentIcon: IconName | Node | undefined;
    private iconNode: Node | undefined;
    private currentActions: Node | undefined;
    private disposed = false;

    public constructor(props: SideBarPanelHeaderDomProps) {
        this.titleElement = createTextElement("", {
            color: "inherit",
            size: "md",
            truncate: true,
        });
        this.titleGroup = createPanelElement(
            {
                name: "sidebar-panel-title",
                direction: "row",
                align: "center",
                gap: "sm",
                flex: 1,
                width: 0,
                overflow: "hidden",
            },
            [this.titleElement],
        );
        this.actionsGroup = createPanelElement({
            name: "sidebar-panel-actions",
            direction: "row",
            align: "center",
            gap: "xs",
            shrink: false,
        });
        this.update(props);
    }

    public update(props: SideBarPanelHeaderDomProps): void {
        if (this.disposed) return;

        this.titleElement.textContent = props.title;
        if (props.titleAttribute === undefined) this.titleElement.removeAttribute("title");
        else this.titleElement.title = props.titleAttribute;

        if (this.currentIcon !== props.icon) {
            if (this.iconNode) this.iconNode.parentNode?.removeChild(this.iconNode);
            this.currentIcon = props.icon;
            this.iconNode = typeof props.icon === "string"
                ? createIconElement(props.icon)
                : props.icon;
        }

        if (this.currentActions !== props.actions) {
            this.actionsGroup.replaceChildren();
            this.currentActions = props.actions;
            if (props.actions) this.actionsGroup.append(props.actions);
        }

        if (this.currentHeader !== props.headerRef) {
            this.detachNodes();
            this.currentHeader = props.headerRef;
        }
        this.attachNodes();
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.detachNodes();
        this.actionsGroup.replaceChildren();
        this.currentActions = undefined;
        this.iconNode = undefined;
        this.currentIcon = undefined;
    }

    private attachNodes(): void {
        if (!this.currentHeader) return;
        if (this.iconNode) this.currentHeader.append(this.iconNode);
        this.currentHeader.append(this.titleGroup);
        if (this.currentActions) this.currentHeader.append(this.actionsGroup);
    }

    private detachNodes(): void {
        if (this.iconNode) this.iconNode.parentNode?.removeChild(this.iconNode);
        this.titleGroup.remove();
        this.actionsGroup.remove();
        this.currentHeader = null;
    }
}

export function createSideBarPanelHeader(
    props: SideBarPanelHeaderDomProps,
): SideBarPanelHeaderHandle {
    return new SideBarPanelHeaderDom(props);
}
