import type { ReactElement } from "react";
import type { TextFileModel } from "../text/TextEditorModel";
import { mountVanilla } from "../../uikit/shared/mount";
import type { SlotContent } from "../../uikit/shared/fill-slot";
import { ContentHostFooterView } from "./ContentHostFooterView";

export interface ContentHostFooterProps {
    host: TextFileModel;
    /** Editor-specific footer status. Rendered before the encoding label
     *  (e.g. the Todo editor's "N items" count). */
    footerContributions?: SlotContent;
}

/** The shared native text-host footer row. */
export function ContentHostFooter(props: ContentHostFooterProps): ReactElement {
    return mountVanilla(ContentHostFooterView, props);
}
