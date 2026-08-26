import type { ReactElement, ReactNode } from "react";
import type { TextFileModel } from "../text/TextEditorModel";
import { mountVanilla } from "../../uikit/shared/mount";
import { ContentHostFooterView } from "./ContentHostFooterView";

export interface ContentHostFooterProps {
    host: TextFileModel;
    /** Editor-specific footer status. Rendered before the encoding label
     *  (e.g. the Todo editor's "N items" count). */
    footerContributions?: ReactNode;
}

/** The shared native text-host footer row. */
export function ContentHostFooter(props: ContentHostFooterProps): ReactElement {
    return mountVanilla(ContentHostFooterView, props);
}
