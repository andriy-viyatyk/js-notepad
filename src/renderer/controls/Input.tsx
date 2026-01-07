import React, { forwardRef, InputHTMLAttributes, ReactNode } from "react";
import styled from "@emotion/styled";

import { InputBase } from "./InputBase";

const InputRoot = styled.div<{
    addornmentStartWidth?: number;
    addornmentEndWidth?: number;
    width?: number | string;
    maxWidth?: number | string;
}>(
    (props) => ({
        position: "relative",
        width: props.width,
        maxWidth: props.maxWidth,
        flexShrink: 0,
        "& input": {
            ...(props.addornmentStartWidth
                ? {
                      paddingLeft: props.addornmentStartWidth,
                  }
                : {}),
            ...(props.addornmentEndWidth
                ? {
                      paddingRight: props.addornmentEndWidth,
                  }
                : {}),
        },
        "& .addornmentStart": {
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            width: props.addornmentStartWidth,
        },
        "& .addornmentEnd": {
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            width: props.addornmentEndWidth,
        },
    }),
    { label: "InputRoot" }
);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    addornmentStart?: ReactNode;
    addornmentStartWidth?: number;
    addornmentEnd?: ReactNode;
    addornmentEndWidth?: number;
    children?: ReactNode;
    maxWidth?: number | string;
}

export const Input = forwardRef(function InputComponent(
    props: Readonly<InputProps>,
    ref: React.Ref<HTMLInputElement>
) {
    const {
        addornmentStart,
        addornmentStartWidth,
        addornmentEnd,
        addornmentEndWidth,
        width,
        maxWidth,
        children,
        className,
        style,
        ...otherProps
    } = props;

    return (
        <InputRoot
            className={className}
            addornmentStartWidth={addornmentStartWidth}
            addornmentEndWidth={addornmentEndWidth}
            width={width}
            maxWidth={maxWidth}
            style={style}
        >
            {Boolean(addornmentStart) && (
                <div className="addornmentStart">{addornmentStart}</div>
            )}
            <InputBase width="100%" {...otherProps} ref={ref} />
            {Boolean(addornmentEnd) && (
                <div className="addornmentEnd">{addornmentEnd}</div>
            )}
            {children}
        </InputRoot>
    );
});
