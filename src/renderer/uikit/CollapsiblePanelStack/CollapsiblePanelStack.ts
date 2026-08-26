import type React from "react";
import type { ReactNode } from "react";
import type { IconName } from "../../theme/icon-registry";

export interface CollapsiblePanelProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "title" | "children"> {
    name?: string;
    id: string;
    title?: string;
    children: ReactNode | Node;
    icon?: IconName;
    // `ReactNode | Node`, matching `children` above: the implementation passes this
    // straight to `fillSlot`, which accepts `string | Node | React.ReactNode`, so a
    // vanilla caller handing a DOM node was only blocked by this declaration.
    buttons?: ReactNode | Node;
    headerRef?: (el: HTMLDivElement | null) => void;
    alwaysRenderContent?: boolean;
}

export interface CollapsiblePanelStackProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    name?: string;
    activePanel: string;
    setActivePanel: (panelId: string) => void;
    children: ReactNode;
    width?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;
    height?: number | string;
    minHeight?: number | string;
    maxHeight?: number | string;
}
