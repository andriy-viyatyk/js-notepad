import React, { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { mountVanilla } from "../shared/mount";
import { CollapsiblePanelStackView } from "./CollapsiblePanelStackView";
import type { IconName } from "../../theme/icon-registry";

export interface CollapsiblePanelProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "title"> {
    name?: string;
    id: string;
    title?: string;
    children: ReactNode;
    icon?: IconName;
    buttons?: ReactNode;
    headerRef?: (el: HTMLDivElement | null) => void;
    alwaysRenderContent?: boolean;
}

export function CollapsiblePanel(_props: CollapsiblePanelProps): ReactElement | null {
    return null;
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

export function CollapsiblePanelStack(props: CollapsiblePanelStackProps): React.ReactElement {
    const panels: CollapsiblePanelProps[] = [];
    Children.forEach(props.children, (child) => {
        if (isValidElement(child) && child.type === CollapsiblePanel) {
            panels.push(child.props as CollapsiblePanelProps);
        }
    });

    const { children: _children, ...viewProps } = props;
    return mountVanilla(CollapsiblePanelStackView, { ...viewProps, panels });
}
