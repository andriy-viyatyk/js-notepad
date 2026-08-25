import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { attachTooltip, type TooltipAttachment } from "../../uikit/Tooltip/attach-tooltip";
import { createIconElement } from "../../uikit/shared/slots";
import "./SideBarPanelHeader.css";

export interface SideBarPanelHeaderDomProps {
    headerRef: HTMLDivElement | null;
    icon?: Node;
    badge?: Node;
    title: string | Node;
    titleAttribute?: string;
    actions?: Node;
    onShowMain?: () => void;
    showMainTitle?: string;
    showMainActive?: boolean;
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
    private currentIcon: Node | undefined;
    private iconNode: Node | undefined;
    private currentBadge: Node | undefined;
    private currentTitleNode: Node | undefined;
    private currentActions: Node | undefined;
    private readonly showMainButton: HTMLButtonElement;
    private readonly showMainTooltip: TooltipAttachment;
    private showMainAction: (() => void) | undefined;
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
        this.showMainButton = document.createElement("button");
        this.showMainButton.type = "button";
        this.showMainButton.dataset.type = "sidebar-show-main";
        this.showMainButton.append(createIconElement("chevron-right"));
        this.showMainButton.addEventListener("click", this.onShowMainClick);
        this.showMainTooltip = attachTooltip(this.showMainButton, { content: null });
        this.update(props);
    }

    public update(props: SideBarPanelHeaderDomProps): void {
        if (this.disposed) return;

        if (typeof props.title === "string") {
            this.currentTitleNode?.parentNode?.removeChild(this.currentTitleNode);
            this.currentTitleNode = undefined;
            this.titleElement.textContent = props.title;
        } else {
            this.titleElement.textContent = "";
            if (this.currentTitleNode !== props.title) {
                this.currentTitleNode?.parentNode?.removeChild(this.currentTitleNode);
                this.currentTitleNode = props.title;
            }
        }
        const titleTarget = typeof props.title === "string"
            ? this.titleElement
            : props.title instanceof Element ? props.title : undefined;
        if (titleTarget) {
            if (props.titleAttribute === undefined) titleTarget.removeAttribute("title");
            else titleTarget.setAttribute("title", props.titleAttribute);
        }

        if (this.currentBadge !== props.badge) {
            this.currentBadge?.parentNode?.removeChild(this.currentBadge);
            this.currentBadge = props.badge;
        }
        this.titleGroup.replaceChildren(
            ...(this.currentBadge ? [this.currentBadge] : []),
            this.currentTitleNode ?? this.titleElement,
        );

        if (this.currentIcon !== props.icon) {
            if (this.iconNode) this.iconNode.parentNode?.removeChild(this.iconNode);
            this.currentIcon = props.icon;
            this.iconNode = props.icon;
        }

        if (this.currentActions !== props.actions) {
            this.actionsGroup.replaceChildren();
            this.currentActions = props.actions;
            if (props.actions) this.actionsGroup.append(props.actions);
        }

        this.showMainAction = props.onShowMain;
        if (props.showMainActive) this.showMainButton.dataset.active = "";
        else delete this.showMainButton.dataset.active;
        if (!props.onShowMain) this.showMainButton.remove();
        this.showMainTooltip.update({
            content: props.onShowMain ? props.showMainTitle ?? "Show in main view" : null,
        });

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
        this.showMainAction = undefined;
        this.showMainTooltip.dispose();
        this.showMainButton.removeEventListener("click", this.onShowMainClick);
        this.iconNode = undefined;
        this.currentIcon = undefined;
        this.currentBadge = undefined;
        this.currentTitleNode = undefined;
    }

    private attachNodes(): void {
        if (!this.currentHeader) return;
        if (this.iconNode) this.currentHeader.append(this.iconNode);
        this.currentHeader.append(this.titleGroup);
        if (this.currentActions) this.currentHeader.append(this.actionsGroup);
        if (this.showMainAction) this.currentHeader.append(this.showMainButton);
    }

    private detachNodes(): void {
        if (this.iconNode) this.iconNode.parentNode?.removeChild(this.iconNode);
        this.titleGroup.remove();
        this.actionsGroup.remove();
        this.showMainButton.remove();
        this.currentHeader = null;
    }

    private readonly onShowMainClick = (event: MouseEvent): void => {
        if (this.disposed || !this.showMainAction) return;
        event.stopPropagation();
        this.showMainAction();
    };
}

export function createSideBarPanelHeader(
    props: SideBarPanelHeaderDomProps,
): SideBarPanelHeaderHandle {
    return new SideBarPanelHeaderDom(props);
}
