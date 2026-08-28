import type { NativeHTMLAttributes } from "../shared/dom-props";
import type { IconName } from "../../theme/icon-registry";
import type { SlotContent } from "../shared/fill-slot";

export interface CollapsiblePanelProps
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className" | "title" | "children"> {
    name?: string;
    id: string;
    title?: string;
    children: SlotContent;
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
