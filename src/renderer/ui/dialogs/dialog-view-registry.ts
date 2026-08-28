import type { TDialogModel, TModel } from "../../core/state/model";
import type { VanillaViewCtor } from "../../uikit/shared/vanilla-view";

export interface ViewProps<M extends TModel<T>, T = unknown> {
    model: M;
    className?: string;
}

export interface IViewData<M extends TModel<T>, T = unknown> {
    // eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
    viewId: Symbol;
    model: M;
    internalId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IDialogViewData<
    // M's default uses `any` to accept all concrete TDialogModel subclasses
    // at use sites (e.g. `showDialog({ model: ConfirmationDialogModel, ... })`).
    // TS classes are invariant in their type parameters, and defaults can't
    // forward-reference later type params, so widening to `unknown` would
    // reject those subclass assignments. The `any` is load-bearing here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    M extends TDialogModel<T> = TDialogModel<any, any>,
    T = unknown,
> extends IViewData<M, T> {}

/** Props shared by native dialog and popper constructors. */
export type DialogViewProps = ViewProps<TModel<unknown>>;
export type DialogViewCtor = VanillaViewCtor<DialogViewProps>;
type DialogViewId = IDialogViewData["viewId"];

const nativeViews = new Map<DialogViewId, DialogViewCtor>();

/** Register a native view for a dialogs-local view ID. */
export function registerDialogView(viewId: DialogViewId, ctor: DialogViewCtor): void {
    nativeViews.set(viewId, ctor);
}

/** Return the native constructor registered for a dialogs-local view ID. */
export function getDialogView(viewId: DialogViewId): DialogViewCtor | undefined {
    return nativeViews.get(viewId);
}
