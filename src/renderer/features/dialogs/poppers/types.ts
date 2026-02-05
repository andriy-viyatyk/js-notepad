import { TDialogModel } from "../../../core/state/model";
import { IDialogViewData } from "../../../core/state/view";
import { PopperPosition } from "../../../components/overlay/Popper";


export class TPopperModel<T = any, R = any> extends TDialogModel<T, R> {
    position: PopperPosition = {};
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IPopperViewData<
    M extends TPopperModel<T> = TPopperModel,
    T = any
> extends IDialogViewData<M, T> {}
