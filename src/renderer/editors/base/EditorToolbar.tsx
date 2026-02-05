import clsx from "clsx";

import styled from "@emotion/styled";
import color from "../../theme/color";

export interface EditorToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
    borderTop?: boolean;
    borderBottom?: boolean;
}

const EditorToolbarRoot = styled.div({
    display: "flex",
    alignItems: "center",
    columnGap: 4,
    flexWrap: "nowrap",
    overflow: "hidden",
    backgroundColor: color.background.dark,
    padding: "2px 4px",
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

export function EditorToolbar({
    children,
    borderTop,
    borderBottom,
    className,
    ...rest
}: EditorToolbarProps) {
    return (
        <EditorToolbarRoot
            {...rest}
            className={clsx("editor-toolbar", className, { borderTop, borderBottom })}
        >
            {children}
        </EditorToolbarRoot>
    );
}

// Re-export with old name for backward compatibility
export { EditorToolbar as PageToolbar };
export type { EditorToolbarProps as PageToolbarProps };
