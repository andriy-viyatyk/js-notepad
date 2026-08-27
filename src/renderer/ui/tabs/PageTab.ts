import type { PageModel } from "../../api/pages/PageModel";

export const minTabWidth = 80;
const ICON_SLOT = 20;
const TAB_PADDING = 4;
export const pinnedTabWidth = 2 * ICON_SLOT + TAB_PADDING;
export const pinnedTabEncryptedWidth = 3 * ICON_SLOT + TAB_PADDING;

export interface PageTabProps {
    model: PageModel;
    pinnedLeft?: number;
}
