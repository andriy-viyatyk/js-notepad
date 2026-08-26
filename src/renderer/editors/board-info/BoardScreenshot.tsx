import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { BoardScreenshotView, type BoardScreenshotViewProps } from "./BoardScreenshotView";

export type { BoardScreenshotViewProps };

export function BoardScreenshot(props: BoardScreenshotViewProps): React.ReactElement {
    return mountVanilla(BoardScreenshotView, props);
}
