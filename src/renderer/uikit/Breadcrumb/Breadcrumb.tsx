import React from "react";
import { mountVanilla } from "../shared/mount";
import { BreadcrumbView } from "./BreadcrumbView";

export interface BreadcrumbProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    name?: string;
    rootLabel: string;
    value: string;
    onChange: (value: string) => void;
    separators?: string;
    trailingParentSeparator?: boolean;
    separatorContent?: string;
    size?: "sm" | "md";
    clipStart?: boolean;
}

export function Breadcrumb(props: BreadcrumbProps): React.ReactElement {
    return mountVanilla(BreadcrumbView, props);
}
