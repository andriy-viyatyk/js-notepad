import React, { cloneElement, useCallback, useEffect, useRef, useState } from "react";
import type { Placement } from "@floating-ui/dom";
import { attachTooltip, type TooltipOptions } from "./attach-tooltip";
import type { SlotContent } from "../shared/fill-slot";
import "./Tooltip.css";

export interface TooltipProps {
    name?: string;
    content: SlotContent;
    children: React.ReactElement<Record<string, unknown>>;
    placement?: Placement;
    offset?: [number, number];
    delayShow?: number;
    delayHide?: number;
    disabled?: boolean;
}

type ChildRef = React.Ref<unknown> | undefined;

function assignRef(ref: ChildRef, value: Element | null): void {
    if (typeof ref === "function") ref(value);
    else if (ref && typeof ref === "object") {
        (ref as React.MutableRefObject<Element | null>).current = value;
    }
}

/** React compatibility wrapper around the framework-neutral tooltip attachment. */
export function Tooltip({
    name,
    content,
    children,
    placement = "top",
    offset = [0, 8],
    delayShow = 800,
    delayHide = 100,
    disabled,
}: TooltipProps) {
    const [trigger, setTrigger] = useState<Element | null>(null);
    const attachmentRef = useRef<ReturnType<typeof attachTooltip> | null>(null);
    const optionsRef = useRef<TooltipOptions | undefined>(undefined);
    const options: TooltipOptions = {
        name,
        content,
        placement,
        offset,
        delayShow,
        delayHide,
        disabled,
    };
    optionsRef.current = options;

    const childRef = (children.props as { ref?: ChildRef }).ref;
    const mergedRef = useCallback((node: Element | null) => {
        setTrigger(node);
        assignRef(childRef, node);
    }, [childRef]);

    useEffect(() => {
        if (!trigger) return;
        const options = optionsRef.current;
        if (!options) return;
        const attachment = attachTooltip(trigger, options);
        attachmentRef.current = attachment;
        return () => {
            if (attachmentRef.current === attachment) attachmentRef.current = null;
            attachment.dispose();
        };
    }, [trigger]);

    useEffect(() => {
        const options = optionsRef.current;
        if (options) attachmentRef.current?.update(options);
    }, [name, content, placement, offset, delayShow, delayHide, disabled]);

    return cloneElement(children, { ref: mergedRef });
}

export type { Placement } from "@floating-ui/dom";
