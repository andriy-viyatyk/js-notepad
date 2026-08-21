import type { Ref } from "react";
import type { TMessageType } from "../../core/utils/types";
import { mountVanilla } from "../shared/mount";
import { AlertItemView, type AlertItemViewProps } from "./AlertItemView";

export interface AlertData {
    message: string;
    type: TMessageType;
    key: number;
    onClose: (value?: unknown) => void;
}

interface AlertItemProps {
    ref?: Ref<HTMLDivElement>;
    /** Optional debug label forwarded to the inner Notification's `data-name`. */
    name?: string;
    data: AlertData;
    top: number;
    right: number;
}

export function AlertItem({ name, data, top, right, ref }: AlertItemProps) {
    const props: AlertItemViewProps = { name, data, top, right, ref };
    return mountVanilla(AlertItemView, props);
}
