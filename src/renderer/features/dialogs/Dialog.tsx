import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import React, { ReactNode } from "react";
import clsx from "clsx";

import color from "../../theme/color";
import { FlexSpace } from "../../components/layout/Elements";
import { Button } from "../../components/basic/Button";
import { CloseIcon } from "../../theme/icons";

export type DialogPosition = "center" | "right";

const pulse = keyframes`
  0% { transform: scale(0.9); }
  100% { transform: scale(1); }
`;

const DialogRoot = styled.div<{ position?: DialogPosition }>(
    (props) => ({
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        background: "transparent",
        animation: `${pulse} 0.1s ease-out`,
        ...(props.position !== "right"
            ? {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
              }
            : {}),
        "& .dialog": {
            ...(props.position === "right"
                ? {
                      position: "absolute",
                      top: 0,
                      right: 0,
                      bottom: 0,
                      left: "unset",
                      minWidth: 200,
                      borderLeft: `1px solid ${color.border.default}`,
                  }
                : {
                      border: `1px solid ${color.border.default}`,
                      borderRadius: 6,
                      boxShadow: color.shadow.default,
                  }),
        },
        "&:focus": {
            outline: "none",
        },
    }),
    { label: "DialogRoot" }
);

interface DialogProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "children"
> {
    children: React.ReactNode;
    className?: string;
    onBackdropClick?: () => void;
    position?: "center" | "right";
    autoFocus?: boolean;
}

export function Dialog({
    children,
    className,
    onBackdropClick,
    position,
    autoFocus = true,
    ...rest
}: DialogProps) {
    const dialogRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (autoFocus) {
            dialogRef.current?.focus();
        }
    }, [autoFocus]);

    return (
        <DialogRoot
            ref={dialogRef}
            className={className}
            onClick={onBackdropClick}
            position={position}
            tabIndex={1}
            {...rest}
        >
            {children}
        </DialogRoot>
    );
}

const DialogContentRoot = styled.div(
    {
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: color.background.default,
        "& .dialog-header": {
            padding: "2px 4px",
            borderBottom: `1px solid ${color.border.default}`,
            backgroundColor: color.background.light,
            display: "flex",
            alignItems: "center",
            columnGap: 8,
            overflow: "hidden",
            "& .dialog-title": {
                display: "flex",
                alignItems: "center",
                columnGap: 8,
                flex: "1 1 auto",
                minWidth: 80,
                overflow: "hidden",
            },
        },
    },
    { label: "DialogContent" }
);

interface DialogContentProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "children" | "title"
> {
    children: React.ReactNode;
    onClose?: () => void;
    title?: ReactNode;
    className?: string;
    buttons?: React.ReactNode;
}

export function DialogContent({
    children,
    onClose,
    title,
    className,
    buttons,
    ...rest
}: DialogContentProps) {
    return (
        <DialogContentRoot className={clsx("dialog", className)} {...rest}>
            <div className="dialog-header">
                <span className="dialog-title">{title}</span>
                <FlexSpace />
                {buttons}
                <Button onClick={onClose} type="icon">
                    <CloseIcon />
                </Button>
            </div>
            {children}
        </DialogContentRoot>
    );
}
