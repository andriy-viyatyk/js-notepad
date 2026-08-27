import { createIconElement } from "../../uikit/shared/slots";
import type { MenuItem } from "../../uikit/Menu/types";
import { IncognitoIcon } from "../../theme/language-icons";
import { DEFAULT_BROWSER_COLOR } from "../../theme/palette-colors";
import { createLinkData } from "../../../shared/link-data";
import { settings } from "../../api/settings";

function createDirectMenuIcon(component: { createElement?: () => SVGElement }): SVGElement {
    const icon = component.createElement();
    if (!icon) throw new Error("Menu icon does not have a DOM builder.");
    return icon;
}

/**
 * Appends "Open in ..." menu items for a URL to the given menu items array.
 * Includes: OS default browser, internal browser (default profile),
 * each user-configured browser profile, and incognito.
 *
 * All items route through the openRawLink pipeline with target="browser"
 * and appropriate browserMode metadata.
 */
export function appendLinkOpenMenuItems(
    menuItems: MenuItem[],
    href: string,
    options?: { startGroup?: boolean; disabled?: boolean },
): void {
    const disabled = options?.disabled ?? false;

    const fireOpenRawLink = async (browserMode: string) => {
        const { app } = await import("../../api/app");
        await app.events.openRawLink.sendAsync(
            createLinkData(href, { target: "browser", browserMode }),
        );
    };

    menuItems.push(
        {
            label: "Open in Default Browser",
            icon: createIconElement("open-file"),
            onClick: () => { fireOpenRawLink("os-default"); },
            disabled,
            startGroup: options?.startGroup,
        },
        {
            label: "Open in Internal Browser",
            icon: createIconElement("globe", { color: DEFAULT_BROWSER_COLOR }),
            onClick: () => { fireOpenRawLink("internal"); },
            disabled,
        },
        ...settings.get("browser-profiles").map((profile) => ({
            label: `Open in ${profile.name}`,
            icon: createIconElement("globe", { color: profile.color }),
            onClick: () => { fireOpenRawLink(`profile:${profile.name}`); },
            disabled,
        })),
        {
            label: "Open in Incognito",
            icon: createDirectMenuIcon(IncognitoIcon),
            onClick: () => { fireOpenRawLink("incognito"); },
            disabled,
        },
    );
}
