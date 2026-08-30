import { createIconElement } from "../shared/slots";
import { fillSlot } from "../shared/fill-slot";
import { KeyedList } from "../shared/keyed-list";
import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type NativeHTMLAttributes,
    type RestPropsState,
} from "../shared/dom-props";
import type { IconName } from "../../theme/icon-registry";
import type { SlotContent } from "../shared/fill-slot";
import { VanillaView } from "../shared/vanilla-view";
import "./CollapsiblePanelStack.css";

export interface CollapsiblePanelProps
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className" | "title" | "children"> {
    name?: string;
    id: string;
    title?: string;
    children: SlotContent;
    /** When both childrenFactory and children are supplied, childrenFactory wins and children is ignored. */
    childrenFactory?: (header: HTMLDivElement, isOpen: boolean) => SlotContent;
    icon?: IconName;
    buttons?: SlotContent;
    headerRef?: (el: HTMLDivElement | null) => void;
    alwaysRenderContent?: boolean;
}

export interface CollapsiblePanelStackProps
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className"> {
    name?: string;
    activePanel: string;
    setActivePanel: (panelId: string) => void;
    children: SlotContent;
    width?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;
    height?: number | string;
    minHeight?: number | string;
    maxHeight?: number | string;
}

type StackViewProps = Omit<CollapsiblePanelStackProps, "children"> & {
    panels: CollapsiblePanelProps[];
};

interface PanelRecord {
    root: HTMLDivElement;
    header: HTMLDivElement;
    content?: HTMLDivElement;
    buttonsHost?: HTMLSpanElement;
    buttonsCleanup?: () => void;
    headerRelease: () => void;
    buttonsRelease?: () => void;
    headerRef?: (element: HTMLDivElement | null) => void;
    ownedHeaderNodes: Node[];
    contentCleanup?: () => void;
}

function cssLength(value: number | string): string {
    return typeof value === "number" ? `${value}px` : value;
}

export class CollapsiblePanelStackView extends VanillaView<StackViewProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private panelList: KeyedList<CollapsiblePanelProps, string, HTMLDivElement> | undefined;
    private readonly records = new WeakMap<HTMLDivElement, PanelRecord>();
    private previousPanel: string | null = null;
    private lastActivePanel: string;

    public constructor(props: StackViewProps) {
        super(props, document.createElement("div"));
        this.lastActivePanel = props.activePanel;
        this.root.classList.add("collapsible-panel-stack-root");
    }

    protected onMount(): void {
        this.applyRootProps(this.props);
        this.applyConstructionRestProps(this.props);
        this.panelList = new KeyedList(this.root, {
            keyOf: (panel) => panel.id,
            create: (panel) => this.createPanel(panel),
            update: (element, panel) => this.updatePanel(element, panel),
            remove: (element) => this.removePanel(element),
        });
        this.own(() => this.panelList?.dispose());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
        this.panelList.update(this.props.panels);
    }

    protected onUpdate(props: StackViewProps): void {
        if (props.activePanel !== this.lastActivePanel) {
            this.previousPanel = this.lastActivePanel;
            this.lastActivePanel = props.activePanel;
        }
        this.applyRootProps(props);
        this.panelList?.update(props.panels);
    }

    protected onDispose(): void {
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyRootProps(props: StackViewProps): void {
        const {
            name,
            activePanel: _activePanel,
            setActivePanel: _setActivePanel,
            panels: _panels,
            width,
            minWidth,
            maxWidth,
            height,
            minHeight,
            maxHeight,
            ..._rest
        } = props;

        this.root.dataset.type = "collapsible-panel-stack";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.setLength("width", width);
        this.setLength("min-width", minWidth);
        this.setLength("max-width", maxWidth);
        this.setLength("height", height);
        this.setLength("min-height", minHeight);
        this.setLength("max-height", maxHeight);
    }

    private applyConstructionRestProps(props: StackViewProps): void {
        const {
            name: _name,
            activePanel: _activePanel,
            setActivePanel: _setActivePanel,
            panels: _panels,
            width: _width,
            minWidth: _minWidth,
            maxWidth: _maxWidth,
            height: _height,
            minHeight: _minHeight,
            maxHeight: _maxHeight,
            ...rest
        } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    private setLength(property: string, value: number | string | undefined): void {
        if (value === undefined) this.root.style.removeProperty(property);
        else this.root.style.setProperty(property, cssLength(value));
    }

    private createPanel(panel: CollapsiblePanelProps): HTMLDivElement {
        const root = document.createElement("div");
        root.classList.add("collapsible-panel-root");
        const header = document.createElement("div");
        header.dataset.part = "header";
        const record: PanelRecord = {
            root,
            header,
            ownedHeaderNodes: [],
            headerRelease: () => undefined,
        };
        this.records.set(root, record);
        record.headerRelease = this.listen(header, "click", (event) => {
            const target = event.target as Element | null;
            if (target?.closest('[data-part="header-buttons"]')) return;
            this.togglePanel(panel.id);
        });
        root.append(header);
        return root;
    }

    private updatePanel(root: HTMLDivElement, panel: CollapsiblePanelProps): void {
        const record = this.records.get(root);
        if (!record) throw new Error("CollapsiblePanelStack lost a panel record.");
        const isOpen = this.props.activePanel === panel.id;
        root.dataset.type = "collapsible-panel";
        if (panel.name === undefined) delete root.dataset.name;
        else root.dataset.name = panel.name;
        root.dataset.state = isOpen ? "open" : "closed";
        this.updateHeader(record, panel, isOpen);
        this.updateContent(record, panel, isOpen);
    }

    private updateHeader(record: PanelRecord, panel: CollapsiblePanelProps, isOpen: boolean): void {
        const oldRef = record.headerRef;
        const refChanged = oldRef !== panel.headerRef;
        if (refChanged) {
            oldRef?.(null);
            record.headerRef = panel.headerRef;
        }

        for (const node of record.ownedHeaderNodes) node.parentNode?.removeChild(node);
        record.ownedHeaderNodes = [];

        const showChevron = !panel.headerRef && !panel.childrenFactory && !panel.buttons;
        if (showChevron) {
            const chevron = createIconElement(isOpen ? "chevron-down" : "chevron-right");
            record.ownedHeaderNodes.push(chevron);
        }
        if (panel.icon) {
            record.ownedHeaderNodes.push(createIconElement(panel.icon));
        }
        if (panel.title !== undefined) {
            record.ownedHeaderNodes.push(document.createTextNode(panel.title));
        }

        const hasButtons = Boolean(panel.buttons);
        if (hasButtons) {
            const spacer = document.createElement("span");
            spacer.dataset.part = "header-spacer";
            record.ownedHeaderNodes.push(spacer);
            if (!record.buttonsHost) {
                record.buttonsHost = document.createElement("span");
                record.buttonsHost.dataset.part = "header-buttons";
                record.buttonsRelease = this.listen(record.buttonsHost, "click", (event) => event.stopPropagation());
            }
            record.ownedHeaderNodes.push(record.buttonsHost);
            record.buttonsCleanup = fillSlot(record.buttonsHost, panel.buttons);
        } else if (record.buttonsHost) {
            record.buttonsCleanup?.();
            record.buttonsCleanup = undefined;
            record.buttonsRelease?.();
            record.buttonsRelease = undefined;
            record.buttonsHost.remove();
            record.buttonsHost = undefined;
        }

        const externalNodes = new Set<Node>(this.getExternalHeaderNodes(record));
        for (const node of record.ownedHeaderNodes) {
            const firstExternal = Array.from(record.header.childNodes).find((child) => externalNodes.has(child));
            record.header.insertBefore(node, firstExternal ?? null);
        }

        if (refChanged) record.headerRef?.(record.header);
    }

    private getExternalHeaderNodes(record: PanelRecord): Node[] {
        return Array.from(record.header.childNodes).filter(
            (node) => !record.ownedHeaderNodes.includes(node),
        );
    }

    private updateContent(record: PanelRecord, panel: CollapsiblePanelProps, isOpen: boolean): void {
        const shouldRender = Boolean(panel.alwaysRenderContent || isOpen);
        if (!shouldRender) {
            record.contentCleanup?.();
            record.contentCleanup = undefined;
            record.content?.remove();
            record.content = undefined;
            return;
        }

        if (!record.content) {
            record.content = document.createElement("div");
            record.content.dataset.part = "content";
            record.root.append(record.content);
        }
        record.content.style.display = isOpen ? "" : "none";
        const children = panel.childrenFactory
            ? panel.childrenFactory(record.header, isOpen)
            : panel.children;
        record.contentCleanup = fillSlot(record.content, children);
    }

    private removePanel(root: HTMLDivElement): void {
        const record = this.records.get(root);
        if (!record) return;
        record.headerRef?.(null);
        record.headerRelease();
        record.buttonsCleanup?.();
        record.buttonsRelease?.();
        record.contentCleanup?.();
        record.buttonsHost?.remove();
        record.content?.remove();
        root.remove();
        this.records.delete(root);
    }

    private togglePanel(panelId: string): void {
        const activePanel = this.props.activePanel;
        if (activePanel === panelId) {
            const previous = this.previousPanel;
            if (previous && this.props.panels.some((panel) => panel.id === previous)) {
                this.props.setActivePanel(previous);
                return;
            }
            const fallback = this.props.panels.find((panel) => panel.id !== panelId);
            if (fallback) this.props.setActivePanel(fallback.id);
            return;
        }
        this.props.setActivePanel(panelId);
    }
}
