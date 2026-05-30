import { TDialogModel } from "../../../core/state/model";
import { IDialogViewData } from "../../../core/state/view";
import { PopoverPosition } from "../../../uikit/Popover/Popover";


export class TPopperModel<T = unknown, R = unknown> extends TDialogModel<T, R> {
    position: PopoverPosition = {};
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IPopperViewData<
    // M's default uses `any` to accept concrete TPopperModel subclasses at
    // use sites — same TS limitation as IDialogViewData (class invariance +
    // forward-reference forbidden in defaults).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    M extends TPopperModel<T> = TPopperModel<any, any>,
    T = unknown
> extends IDialogViewData<M, T> {}
