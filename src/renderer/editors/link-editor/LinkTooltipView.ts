import color from "../../theme/color";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createIconElement } from "../../uikit/shared/slots";
import { spacing } from "../../uikit/tokens";
import type { ILink } from "../../api/types/io.tree";
import { resolveTorSrc, type TorProxyInfo } from "./tor-src";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Tag/Tag.css";
import "../../uikit/Input/Input.css";

export interface LinkTooltipContentProps {
    link: ILink;
    allTags?: string[];
    onToggleTag?: (link: ILink, tag: string) => void;
    /** Show "Copy link as JSON" affordance next to the title. Default: false. */
    showCopyJson?: boolean;
    /** US-896 — Tor session to fetch the preview image through, on a Tor page. */
    imageProxy?: TorProxyInfo | null;
}

/**
 * Build the native tooltip body for a link row. The returned subtree is deliberately plain DOM:
 * `attachTooltip` owns Node content, but it cannot dispose a VanillaView passed through that arm.
 * Event handlers therefore live on the short-lived tooltip nodes and disappear with the overlay.
 */
export function createLinkTooltipContent({
    link,
    allTags,
    onToggleTag,
    showCopyJson,
    imageProxy,
}: Readonly<LinkTooltipContentProps>): HTMLDivElement {
    const root = createPanelElement({
        name: "link-tooltip-body",
        direction: "column",
        gap: "xs",
        maxWidth: 360,
    });

    const header = createPanelElement({ direction: "row", align: "start", gap: "xs" });
    const title = document.createElement("span");
    title.style.flex = "1";
    title.style.fontWeight = "600";
    title.style.color = color.text.strong;
    title.style.whiteSpace = "normal";
    title.style.wordBreak = "break-word";
    title.textContent = link.title || "Untitled";
    header.append(title);

    if (showCopyJson) {
        const copy = document.createElement("span");
        copy.style.cursor = "pointer";
        copy.style.color = color.text.light;
        copy.style.flexShrink = "0";
        copy.style.marginTop = "1px";
        copy.title = "Copy link as JSON";
        copy.append(createIconElement("copy", { width: 14, height: 14 }));
        copy.addEventListener("click", () => {
            void navigator.clipboard.writeText(JSON.stringify(link, null, 4));
        });
        header.append(copy);
    }
    root.append(header);

    if (link.href) {
        const href = document.createElement("span");
        href.style.fontSize = "12px";
        href.style.color = color.text.light;
        href.style.whiteSpace = "normal";
        href.style.wordBreak = "break-all";
        href.style.userSelect = "text";
        href.textContent = link.href;
        root.append(href);
    }

    const imageSrc = resolveTorSrc(link.imgSrc, imageProxy);
    if (imageSrc) {
        const image = document.createElement("img");
        image.style.marginTop = `${spacing.sm}px`;
        image.style.maxWidth = "100%";
        image.style.maxHeight = "200px";
        image.style.objectFit = "contain";
        image.style.borderRadius = "4px";
        image.style.border = `1px solid ${color.border.default}`;
        image.src = imageSrc;
        image.alt = "";
        root.append(image);
    }

    if (allTags?.length && onToggleTag) {
        const tagsPanel = createPanelElement({
            name: "link-tooltip-tags",
            direction: "column",
            gap: "xs",
            paddingTop: "sm",
            borderTop: true,
        });
        const tags = createPanelElement({
            direction: "row",
            wrap: true,
            gap: "xs",
            maxHeight: 120,
            overflowY: "auto",
        });
        const linkTags = link.tags ?? [];
        for (const tag of [...allTags].sort()) {
            const tagElement = document.createElement("span");
            tagElement.dataset.type = "tag";
            tagElement.dataset.variant = "outlined";
            tagElement.dataset.size = "sm";
            if (linkTags.includes(tag)) tagElement.dataset.selected = "";
            tagElement.dataset.clickable = "";
            tagElement.textContent = tag;
            tagElement.addEventListener("click", () => onToggleTag(link, tag));
            tags.append(tagElement);
        }

        const inputRoot = document.createElement("div");
        inputRoot.dataset.type = "input";
        inputRoot.dataset.name = "link-tooltip-new-tag";
        inputRoot.dataset.size = "sm";
        inputRoot.dataset.variant = "ghost";
        inputRoot.style.minWidth = "60px";
        inputRoot.style.maxWidth = "120px";
        const input = document.createElement("input");
        input.dataset.size = "sm";
        input.dataset.tone = "default";
        input.placeholder = "+ tag (Enter)";
        inputRoot.append(input);

        const commitNewTag = (value: string): void => {
            const trimmed = value.trim().replace(/:$/, "");
            if (trimmed && !linkTags.includes(trimmed)) onToggleTag(link, trimmed);
            input.value = "";
        };
        input.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitNewTag(input.value);
        });
        tags.append(inputRoot);
        tagsPanel.append(tags);
        root.append(tagsPanel);
    }

    return root;
}
