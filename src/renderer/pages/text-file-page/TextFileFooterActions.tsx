import { ReactNode } from "react";
import styled from "@emotion/styled";
import clsx from "clsx";

import { TextFileModel } from "./TextFilePage.model";
import { Button } from "../../controls/Button";
import color from "../../theme/color";

const FooterButton = styled(Button)({
    "&.footer-button": {
        color: color.text.light,
        fontSize: 13,
        "&.isActive": {
            color: color.text.default,
        }
    }
});

interface TextFileFooterActionsProps {
    model: TextFileModel;
}

export function TextFileFooterActions({ model }: TextFileFooterActionsProps) {
    const scriptOpen = model.script.state.use().open;
    const actions: ReactNode[] = [];

    actions.push(
        <FooterButton
            key="toggle-script"
            size="small"
            type="icon"
            onClick={model.script.toggleOpen}
            className={clsx("footer-button", {isActive: scriptOpen})}
        >
            script
        </FooterButton>
    )

    return <>{actions}</>
}