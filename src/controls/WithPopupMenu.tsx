import React, { useCallback, useState } from 'react';
import ReactDOM from 'react-dom';
import { VirtualElement } from '@floating-ui/react/dist/floating-ui.react';

import { PopupMenu, PopupMenuProps } from './PopupMenu';

type TargetElement = Element | VirtualElement | null | undefined;

interface WithPopupMenuProps extends Omit<PopupMenuProps, 'children'> {
    children: (setOpen: (el: TargetElement) => void) => React.ReactElement;
}

const defaultOffset = [-4, 4] as [number, number];

export function WithPopupMenu(props: WithPopupMenuProps) {
    const { children, items, offset, ...popperProps } = props;
    const [el, setElement] = useState<TargetElement>(null);

    const onPopupClose = useCallback(() => {
        setElement(null);
    }, []);

    return children ? (
        <>
            {children(setElement)}
            {ReactDOM.createPortal(
                <PopupMenu
                    open={Boolean(el)}
                    items={items}
                    elementRef={el}
                    onClose={onPopupClose}
                    offset={offset ?? defaultOffset}
                    {...popperProps}
                />,
                document.body,
            )}
        </>
    ) : null;
}
