import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../../ui/secondary-views/SideBarPanelHeader";
import { LinkHostnamesNavigationPanel } from "./LinkHostnamesNavigationPanel";
import { LinkEditor } from "../LinkEditor";

export default function LinkHostnamesSecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    if (!(model instanceof LinkEditor)) {
        return null;
    }
    return (
        <>
            <SideBarPanelHeader headerRef={headerRef} icon={icon} title="Hostnames" />
            <LinkHostnamesNavigationPanel editor={model} />
        </>
    );
}
