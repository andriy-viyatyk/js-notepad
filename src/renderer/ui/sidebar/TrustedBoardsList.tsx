import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import {
    TrustedBoardsListView,
    type TrustedBoardsListProps,
} from "./TrustedBoardsListView";

export type { TrustedBoardsListProps } from "./TrustedBoardsListView";

export function TrustedBoardsList(props: TrustedBoardsListProps): React.ReactElement {
    return mountVanilla(TrustedBoardsListView, props);
}
