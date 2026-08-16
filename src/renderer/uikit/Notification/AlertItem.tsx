import { useEffect } from "react";
import type { Ref } from "react";
import { TMessageType } from "../../core/utils/types";
import { Panel } from "../Panel";
import { Notification } from "./Notification";

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

const AUTOCLOSE_SECONDS: Record<TMessageType, number> = {
    info:    5,
    warning: 5,
    success: 2,
    error:   0,
};

export function AlertItem({ name, data, top, right, ref }: AlertItemProps) {
        const { onClose } = data;
        const autoClose = AUTOCLOSE_SECONDS[data.type];

        useEffect(() => {
            if (!autoClose) return;
            let live = true;
            const timer = setTimeout(() => {
                if (live) onClose();
            }, autoClose * 1000);
            return () => {
                live = false;
                clearTimeout(timer);
            };
        }, [autoClose, onClose]);

        return (
            <Panel
                ref={ref}
                position="absolute"
                top={top}
                right={right}
                zIndex={1000}
            >
                <Notification
                    name={name}
                    type={data.type}
                    message={data.message}
                    onClick={() => onClose("clicked")}
                    onClose={() => onClose()}
                />
            </Panel>
        );
}
