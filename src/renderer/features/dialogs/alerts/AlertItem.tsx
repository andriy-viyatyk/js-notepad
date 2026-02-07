import clsx from 'clsx';
import { forwardRef, useEffect } from 'react';
import { keyframes } from '@emotion/react';
import styled from '@emotion/styled';

import color from '../../../theme/color';
import { TMessageType } from '../../../core/utils/types';
import { CloseIcon, ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from '../../../theme/icons';
import { Button } from '../../../components/basic/Button';

const slideIn = (right: number) => keyframes({
    from: {
        right: -300,
    },
    to: {
        right,
    }
});

const AlertItemRoot = styled.div<{top: number, right: number}>(props => ({
    position: 'absolute',
    top: props.top,
    right: props.right,
    animation: `${slideIn(props.right)} 0.2s ease-in-out`,
    transition: 'top 0.2s ease-in-out',
    border: '1px solid',
    borderColor: color.border.default,
    borderRadius: 6,
    zIndex: 1000,
    padding: '8px 32px 8px 8px',
    display: 'flex',
    flexDirection: 'row',
    columnGap: 8,
    cursor: 'pointer',
    '& .icon': {
        display: 'flex',
        alignItems: 'center',
        '& svg': {
            width: 20,
            height: 20,
        },
    },
    '&.errorItem': {
        backgroundColor: color.error.background,
        color: color.error.text,
        borderColor: color.error.border,
        '& .close-alert svg': {
            color: color.error.text,
        },
        '& .close-alert:hover svg': {
            color: color.error.textHover,
        },
    },
    '&.infoItem': {
        backgroundColor: color.background.message,
        "& .icon": {
            color: color.icon.default,
        }
    },
    '&.successItem': {
        backgroundColor: color.success.background,
        color: color.success.text,
        borderColor: color.success.border,
        '& .close-alert svg': {
            color: color.success.text,
        },
        '& .close-alert:hover svg': {
            color: color.success.textHover,
        },
    },
    '&.warningItem': {
        backgroundColor: color.warning.background,
        color: color.warning.text,
        borderColor: color.warning.border,
        '& .close-alert svg': {
            color: color.warning.text,
        },
        '& .close-alert:hover svg': {
            color: color.warning.textHover,
        },
    },
    '& .closeButton': {
        position: 'absolute',
        top: 4,
        right: 4,
    },
    '& .message': {
        whiteSpace: 'pre-wrap',
        display: 'flex',
        alignItems: 'center',
    },
}), { label: 'AlertItemRoot' });

export interface AlertData {
    message: string;
    type: TMessageType;
    key: number;
    onClose: (value?: unknown) => void;
}

interface AlertItemProps {
    data: AlertData;
    top: number;
    right: number;
    className?: string;
}

const typedIcon = (type: TMessageType) => {
    switch (type) {
        case 'error':
            return <ErrorIcon />;
        case 'warning':
            return <WarningIcon />;
        case 'success':
            return <SuccessIcon />;
        default:
            return <InfoIcon />;
    }
};

const typedAutocloseSeconds = (type: TMessageType) => {
    switch (type) {
        case 'info':
        case 'warning':
            return 5;
        case 'success':
            return 2;
        default:
            return 0;
    }
};

export const AlertItem = forwardRef<HTMLDivElement, AlertItemProps>(
    function AlertItemComponent(props, ref) {
        const { data, top, right, className } = props;

        const icon = typedIcon(data.type);
        const autoClose = typedAutocloseSeconds(data.type);
        const { onClose } = data;

        useEffect(() => {
            let live = true;
            let timer: ReturnType<typeof setTimeout> | undefined;
            if (autoClose) {
                timer = setTimeout(() => {
                    if (live) {
                        onClose();
                    }
                }, autoClose * 1000);
            }
            return () => {
                live = false;
                if (timer) {
                    clearTimeout(timer);
                }
            };
        }, [autoClose, onClose]);

        const handleClick = () => {
            data.onClose('clicked');
        };

        return (
            <AlertItemRoot
                ref={ref}
                top={top}
                right={right}
                onClick={handleClick}
                className={clsx(
                    {
                        errorItem: data.type === 'error',
                        infoItem: data.type === 'info',
                        successItem: data.type === 'success',
                        warningItem: data.type === 'warning',
                    },
                    className,
                )}
            >
                <span className="icon">{icon}</span>
                <div className="message">{data.message}</div>
                <Button
                    onClick={() => data.onClose()}
                    size="small"
                    type="icon"
                    className={clsx('closeButton', 'close-alert')}
                    tooltip="Close"
                >
                    <CloseIcon />
                </Button>
            </AlertItemRoot>
        );
    },
);
