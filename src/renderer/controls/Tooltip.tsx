import ReactDOM from "react-dom";
import { Tooltip as ReactTooltip, ITooltip } from "react-tooltip";
import styled from "@emotion/styled";
import clsx from "clsx";

import color from "../theme/color";

const TooltipRoot = styled(ReactTooltip)({
    "&.app-tooltip": {
        backgroundColor: color.background.default,
        color: color.text.dark,
        zIndex: 1000,
        borderRadius: 4,
        border: `1px solid ${color.border.default}`,
        fontSize: 14,
        whiteSpace: "pre",
        padding: 0,
        "& .tooltip-content": {
            padding: 8,
        },
    },
});

export function Tooltip(props: Readonly<ITooltip>) {
    const { className, delayShow = 600, children, place = "top", ...otherProps } = props;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    return ReactDOM.createPortal(
        <TooltipRoot
            className={clsx("app-tooltip", className)}
            delayShow={delayShow}
            clickable
            place={place}
            {...otherProps}
        >
            <div onClick={handleClick} className="tooltip-content">
                {children as React.ReactNode}
            </div>
        </TooltipRoot>,
        document.body
    );
}
