import React, { forwardRef, ReactNode, Ref, useMemo } from 'react';
import clsx from 'clsx';
import styled from '@emotion/styled';

import { Tooltip } from './Tooltip';
import color from '../theme/color';
import { CircularProgress } from './CircularProgress';
import { windowUtils } from '../common/utils';

const ButtonRoot = styled.button({
    display: 'flex',
    flexDirection: 'row',
    columnGap: 6,
    alignItems: 'center',
    backgroundColor: color.background.default,
    color: color.text.default,
    border: '1px solid',
    borderColor: 'transparent',
    borderRadius: 6,
    cursor: 'pointer',
    textWrap: 'nowrap',
    position: 'relative',
    '& svg': {
        color: color.icon.light,
    },
    '&.notIcon': {
        '&:hover': {
            backgroundColor: color.background.light,
            "&.lightBackground": {
                backgroundColor: color.background.default,
            },
            "&.darkBackground": {
                backgroundColor: color.background.default,
            },
        },
        '&:active': {
            backgroundColor: color.background.dark,
            "&.lightBackground": {
                backgroundColor: color.background.light,
            },
            "&.darkBackground": {
                backgroundColor: color.background.default,
            },
        },
    },
    '&.small': {
        height: 24,
        padding: 2,
        '& svg': {
            width: 16,
            height: 16,
        },
    },
    '&.medium': {
        height: 32,
        padding: 3,
    },
    '&.flat': {},
    '&.raised': {
        borderColor: color.border.default,
    },
    '&.icon': {
        '& svg': {
            color: color.icon.light,
        },
        height: 'unset',
        '&:hover:not(.disabled) svg': {
            color: color.icon.default,
        },
        '&:active svg': {
            color: color.icon.dark,
        },
        backgroundColor: 'transparent',
    },
    '&.extraPadding': {
        paddingLeft: 8,
        paddingRight: 8,
    },
    '&.disabled': {
        color: color.text.light,
        '& svg': {
            color: color.icon.disabled,
        },
        cursor: 'default',
        '&:hover.notIcon': {
            backgroundColor: color.background.default,
            "&.lightBackground": {
                backgroundColor: color.background.light,
            },
            "&.darkBackground": {
                backgroundColor: color.background.dark,
            },
        },
    },
    '& .button-progress': {
        position: 'absolute',
        top: '50%',
        left: 2,
        transform: 'translate(0, -50%)',
        width: 16,
        height: 16,
        backgroundColor: color.background.default,
    },
    "&.lightBackground": {
        backgroundColor: color.background.light,
        "& .button-progress": {
            backgroundColor: color.background.light,
        },
    },
    "&.darkBackground": {
        backgroundColor: color.background.dark,
        "& .button-progress": {
            backgroundColor: color.background.dark,
        },
    }
}, { label: 'ButtonRoot' });

type ParentType = Omit<React.HTMLAttributes<HTMLButtonElement>, 'type'>;

export interface ButtonProps extends ParentType {
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => any;
    onDoubleClick?: () => void;
    children?: ReactNode;
    className?: string;
    size?: 'small' | 'medium';
    type?: 'flat' | 'raised' | 'icon';
    tooltip?: ReactNode;
    extraPadding?: boolean;
    disabled?: boolean;
    invisible?: boolean;
    background?: "default" | "light" | "dark";
}

export const Button = forwardRef(function ButtonComponent(props: Readonly<ButtonProps>, ref: Ref<HTMLButtonElement>) {
    const {
        children,
        onClick,
        onDoubleClick,
        className,
        size = 'medium',
        type = 'flat',
        title,
        tooltip,
        extraPadding: textPadding,
        disabled,
        invisible,
        background,
    } = props;
    const id = useMemo(() => windowUtils.uuid(), []);
    const [loading, setLoading] = React.useState(false);

    const onClickProxy = useMemo(() => {
        return onClick
            ? (e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                e.preventDefault();
                const mayBePromise = onClick(e);
                if (mayBePromise instanceof Promise) {
                    setLoading(true);
                    mayBePromise.finally(() => {
                        setLoading(false);
                    });
                }
            }
            : undefined;
    }, [onClick]);

    if (invisible) {
        return null;
    }

    return (
        <>
            <ButtonRoot
                ref={ref}
                onClick={onClickProxy}
                onDoubleClick={onDoubleClick}
                type="button"
                className={clsx(
                    {
                        notIcon: children && type !== 'icon',
                        small: size === 'small',
                        medium: size === 'medium',
                        raised: type === 'raised',
                        flat: type === 'flat',
                        icon: type === 'icon',
                        extraPadding: textPadding,
                        disabled: disabled || loading,
                        lightBackground: background === 'light',
                        darkBackground: background === 'dark',
                    },
                    className,
                )}
                data-tooltip-id={id}
                disabled={disabled || loading}
            >
                {children}
                {loading && <CircularProgress className='button-progress'/>}
            </ButtonRoot>
            {Boolean(tooltip ?? title) && (
                <Tooltip id={id}>{tooltip ?? title}</Tooltip>
            )}
        </>
    );
});
