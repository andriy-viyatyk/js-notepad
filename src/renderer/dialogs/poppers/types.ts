import { TDialogModel } from "../../common/classes/model";
import { IDialogViewData } from "../../common/classes/view";
import { PopperPosition } from "../../controls/Popper";


export class TPopperModel<T = any, R = any> extends TDialogModel<T, R> {
    position: PopperPosition = {};
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IPopperViewData<
    M extends TPopperModel<T> = TPopperModel,
    T = any
> extends IDialogViewData<M, T> {}
