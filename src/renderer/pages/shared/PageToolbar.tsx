import clsx from "clsx";

import styled from "@emotion/styled";
import color from "../../theme/color";

export interface PageToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
    borderTop?: boolean;
    borderBottom?: boolean;
}

const PageToolbarRoot = styled.div({
    display: "flex",
    alignItems: "center",
    columnGap: 4,
    flexWrap: "nowrap",
    overflow: "hidden",
    backgroundColor: color.background.dark,
    padding: "0 4px",
    flexShrink: 0,
    "&.borderTop": {
        borderTop: `1px solid ${color.border.light}`,
    },
    "&.borderBottom": {
        borderBottom: `1px solid ${color.border.light}`,
    },
    "&:empty": {
        display: "none",
    },
});

export function PageToolbar({
    children,
    borderTop,
    borderBottom,
    ...rest
}: PageToolbarProps) {
    return (
        <PageToolbarRoot
            {...rest}
            className={clsx("page-toolbar", { borderTop, borderBottom })}
        >
            {children}
        </PageToolbarRoot>
    );
}
