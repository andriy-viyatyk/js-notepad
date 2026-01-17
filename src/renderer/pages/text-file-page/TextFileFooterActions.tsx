import { ReactNode } from "react";
import styled from "@emotion/styled";
import clsx from "clsx";

import { TextFileModel } from "./TextFilePage.model";
import { Button } from "../../controls/Button";
import color from "../../theme/color";
import { FlexSpace } from "../../controls/Elements";

const FooterButton = styled(Button)({
    "&.footer-button": {
        color: color.text.light,
        fontSize: 13,
        "&.isActive": {
            color: color.text.default,
        },
    },
});

interface TextFileFooterActionsProps {
    model: TextFileModel;
}

export function TextFileFooterActions({ model }: TextFileFooterActionsProps) {
    const { open } = model.script.state.use((s) => ({
        open: s.open,
    }));
    const { encoding, editor } = model.state.use((s) => ({
        encoding: s.encoding,
        editor: s.editor,
    }));
    const actions: ReactNode[] = [];

    actions.push(
        <FooterButton
            key="toggle-script"
            size="small"
            type="icon"
            onClick={model.script.toggleOpen}
            className={clsx("footer-button", { isActive: open })}
        >
            script
        </FooterButton>,
        <FlexSpace key="flex-space" />
    );

    if (editor && editor !== "monaco") {
        actions.push(
            <div
                ref={model.setFooterRefLast}
                key="editor-place-last"
                className="footer-label hide-empty"
            />
        );
    }

    actions.push(
        <span className="footer-label" key="encoding-label">
            {encoding || "utf-8"}
        </span>
    );

    return <>{actions}</>;
}
