import { createPortal } from "react-dom";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { LinkHostnamesNavigationPanel } from "./LinkHostnamesNavigationPanel";
import { LinkEditor } from "../LinkEditor";

export default function LinkHostnamesSecondaryView({ model, headerRef }: SecondaryViewProps) {
    if (!(model instanceof LinkEditor)) {
        return null;
    }
    return (
        <>
            {headerRef && createPortal(<>Hostnames</>, headerRef)}
            <LinkHostnamesNavigationPanel editor={model} />
        </>
    );
}
