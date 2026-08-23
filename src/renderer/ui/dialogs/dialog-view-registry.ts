import type { TModel } from "../../core/state/model";
import type { IDialogViewData, ViewProps } from "../../core/state/view";
import type { VanillaViewCtor } from "../../uikit/shared/mount";

/** Props shared by native dialog and popper constructors. */
export type DialogViewProps = ViewProps<TModel<unknown>>;
export type DialogViewCtor = VanillaViewCtor<DialogViewProps>;
type DialogViewId = IDialogViewData["viewId"];

const nativeViews = new Map<DialogViewId, DialogViewCtor>();

/** Register a native view for a dialogs-local view ID. */
export function registerDialogView(viewId: DialogViewId, ctor: DialogViewCtor): void {
    nativeViews.set(viewId, ctor);
}

/** Return the native constructor before a host consults the React registry. */
export function getDialogView(viewId: DialogViewId): DialogViewCtor | undefined {
    return nativeViews.get(viewId);
}
