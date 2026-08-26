import type { ReactElement, ReactNode } from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { PageToolbarView, SwitchWidgetView } from "./PageToolbarView";
import type { EditorModel } from "./EditorModel";

interface PageToolbarProps {
    name?: string;
    model: EditorModel;
    children?: ReactNode;
    /** Contributions rendered AFTER the auto-inserted spacer and BEFORE the
     *  switch widget. Useful for editors whose action buttons sit on the
     *  right side of the row (e.g. ImageViewer's Save / Copy / Draw). */
    rightContributions?: ReactNode;
    /** Suppress the auto-inserted `<Spacer />`. For editors whose children
     *  should fill the row (e.g. Video's flex URL/cURL textarea —
     *  VD-IMPL4). Default false — the spacer pushes `rightContributions` + the
     *  switch widget to the right edge. */
    noSpacer?: boolean;
    borderTop?: boolean;
    borderBottom?: boolean;
}

export function PageToolbar(props: PageToolbarProps): ReactElement {
    return mountVanilla(PageToolbarView, props);
}

export function SwitchWidget(props: { model: EditorModel }): ReactElement {
    return mountVanilla(SwitchWidgetView, props);
}
