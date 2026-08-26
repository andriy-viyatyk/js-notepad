import { createIconElement, type IconRef } from "../../uikit/shared/slots";
import { IconPresetId } from "./storyTypes";

export const ICON_PRESETS: { id: IconPresetId; label: string; render: () => IconRef | null }[] = [
    { id: "none",     label: "None",     render: () => null },
    { id: "folder",   label: "Folder",   render: () => createIconElement("folder-open") },
    { id: "plus",     label: "Plus",     render: () => createIconElement("plus") },
    { id: "save",     label: "Save",     render: () => createIconElement("save") },
    { id: "settings", label: "Settings", render: () => createIconElement("settings") },
];

export function resolveIconPreset(id: IconPresetId | undefined): IconRef | null {
    if (!id || id === "none") return null;
    return ICON_PRESETS.find((p) => p.id === id)?.render() ?? null;
}
