import styled from '@emotion/styled';
import React, { forwardRef, ReactNode, useMemo } from 'react';

import { FieldProps } from './types';
import { Input, InputProps } from './Input';
import color from '../../theme/color';
import clsx from 'clsx';

const TextFieldRoot = styled(Input)({
    position: 'relative',
    '& .textField-label': {
        color: color.text.light,
        position: 'absolute',
        left: 4,
        top: -18,
        fontSize: 14,
        whiteSpace: "nowrap",
        "&.label-left": {
            position: "absolute",
            left: 'unset',
            right: "calc(100% + 2px)",
            top: "50%",
            transform: "translateY(-50%)",
        }
    },
    '& .inner-label': {
        fontSize: 14,
        color: color.text.light,
        marginLeft: 4,
    },
    '& input': {
        paddingTop: 0,
        paddingBottom: 0,
        height: 26,
    }
});

export interface TextFieldProps extends FieldProps<string>, Omit<InputProps, 'value' | 'onChange'> {
    startButtons?: ReactNode[];
    endButtons?: ReactNode[];
    endButtonsWidth?: number;
    label?: string;
    labelLeft?: boolean;
    innerLabel?: string;
    placeholder?: string;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    password?: boolean;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    adjustWithCharWidth?: number;
}

const buttonWidth = 16;
const buttonSpacing = 4;

export const TextField = forwardRef(function TextFieldComponent(props: Readonly<TextFieldProps>, ref: React.Ref<HTMLInputElement>) {
    const {
        value,
        onChange,
        className,
        startButtons,
        endButtons,
        label,
        labelLeft,
        innerLabel,
        placeholder,
        onKeyDown,
        password,
        onClick,
        disabled,
        adjustWithCharWidth,
        width: propsWidth,
        ...other
    } = props;

    const addornmentEndWidth = endButtons?.length
        ? endButtons.length * (buttonWidth + buttonSpacing) + 1
        : undefined;

    const startButtonsWidth = startButtons?.length
        ? startButtons.length * (buttonWidth + buttonSpacing) + 1
        : 0;
    const innerLabelWidth = innerLabel ? innerLabel.length * 8 + 12 : 0;

    const startAddornment = (startButtons?.length || innerLabel) ? (
        <>
            {startButtons}
            {innerLabel && <span className='inner-label'>{innerLabel}</span>}
        </>
    ) : undefined;

    const addornmentStartWidth = (startButtonsWidth + innerLabelWidth) || undefined;

    const width = useMemo(() => {
        if (adjustWithCharWidth && typeof value === 'string') {
            return value.length * adjustWithCharWidth + (endButtons ? addornmentEndWidth || 0 : 0) + 24;
        }
        return propsWidth;
    }, [adjustWithCharWidth, value, addornmentEndWidth, endButtons, propsWidth]);

    return (
        <TextFieldRoot
            ref={ref}
            type={password ? "password" : "text"}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className={clsx("text-field", {"with-label": label}, className)}
            addornmentStart={startAddornment}
            addornmentStartWidth={addornmentStartWidth}
            addornmentEnd={endButtons}
            addornmentEndWidth={addornmentEndWidth}
            placeholder={placeholder}
            onKeyDown={onKeyDown}
            onClick={onClick}
            disabled={disabled}
            width={width}
            {...other}
        >
            {Boolean(label) && <div className={clsx("textField-label", {"label-left": labelLeft})}>{label}</div>}
        </TextFieldRoot>
    );
});
