import type { ReactElement } from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import {
    SecondaryViewsView,
    type SecondaryViewsProps,
} from "./SecondaryViewsView";

export type { SecondaryViewsProps } from "./SecondaryViewsView";

/**
 * SecondaryViews is the controlled React boundary for the native sidebar host.
 * Owners remain responsible for subscriptions and layout-state side effects.
 */
export function SecondaryViews(props: SecondaryViewsProps): ReactElement | null {
    if (!props.state.open) return null;
    return mountVanilla(SecondaryViewsView, props);
}
