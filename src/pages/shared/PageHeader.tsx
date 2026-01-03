import styled from "@emotion/styled";
import color from "../../theme/color";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

const PageHeaderRoot = styled.div({
    display: "flex",
    alignItems: "center",
    columnGap: 4,
    flexWrap: "nowrap",
    overflow: "hidden",
    backgroundColor: color.background.dark,
    minHeight: 28,
    padding: "0 4px",
});

export function PageHeader({ children, ...rest }: PageHeaderProps) {
    return <PageHeaderRoot {...rest}>{children}</PageHeaderRoot>;
}