import { createPortal } from "react-dom";
import type { SecondaryEditorProps } from "../../../ui/navigation/secondary-editor-registry";
import { LinkHostnamesPanel } from "./LinkHostnamesPanel";
import { LinkEditor } from "../LinkEditor";

/**
 * EPIC-028 / US-555 — secondary-editor wrapper for the Hostnames sidebar
 * panel. `model` is always a v4 LinkEditor instance.
 */
export default function LinkHostnamesSecondaryEditor({ model, headerRef }: SecondaryEditorProps) {
    if (!(model instanceof LinkEditor)) {
        return null;
    }
    return (
        <>
            {headerRef && createPortal(<>Hostnames</>, headerRef)}
            <LinkHostnamesPanel vm={model} />
        </>
    );
}
