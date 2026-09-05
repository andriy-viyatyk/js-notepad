import type { SvgEditor } from "../../editors/svg";
import { writePngToFile } from "../../editors/shared/image-export";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const SVG_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "svg", kind: "property", summary: "The SVG source content." },
    { name: "savePngToFile", kind: "method", signature: "savePngToFile(filePath: string): Promise<string>", summary: "Rasterise the SVG to PNG (1x scale) and write it to filePath. Parent directories are created as needed. Returns the written path.", caution: "writes a PNG and may overwrite the target" },
];

const SVG_EDITOR_HELP = `Obtain via pages[i].asSvg() on an SVG preview page (\`svg-view\`); pass true — \`asSvg(true)\` — to switch a compatible page to this editor first.
Read-only SVG preview facade with PNG export.`;

/**
 * Safe facade around SvgEditor for script access.
 * Implements the ISvgEditor interface from api/types/svg-editor.d.ts.
 *
 * - Minimal read-only facade — exposes the raw SVG source from the host.
 * - Stays sync; no queue.execute requests.
 */
export class SvgEditorFacade implements IAiVisible {
    constructor(private readonly editor: SvgEditor) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "SvgEditor",
            summary: "SVG preview facade.",
            members: SVG_EDITOR_MEMBERS,
            help: SVG_EDITOR_HELP,
            summarize: () => ({ kind: "SvgEditor", svgLength: this.svg.length }),
        };
    }

    get svg(): string {
        return this.editor.host?.state.get().content ?? "";
    }

    /** Render the SVG to PNG and write it to `filePath`. Returns the path. */
    savePngToFile(filePath: string): Promise<string> {
        return writePngToFile(this.editor, filePath);
    }
}
