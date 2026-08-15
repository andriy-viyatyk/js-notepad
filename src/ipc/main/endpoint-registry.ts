import { ipcMain } from "electron";
import { Endpoint, type Api } from "../api-types";
import { errMessage } from "../../shared/utils";

type AddEventParam<T> = T extends (...args: infer Args) => infer Return
    ? (event: Electron.IpcMainEvent, ...args: Args) => Return
    : never;

/** Main-side API signatures, derived from the renderer API contract. */
export type MainApi = { [K in keyof Api]: AddEventParam<Api[K]> };

/** Endpoint registration preserves the API contract while centralizing reply/error wiring. */
export type BindEndpoint = <K extends Endpoint>(command: K, handler: MainApi[K]) => void;

/** Register an `Endpoint` request/reply handler using the renderer API's
 * established channel and error semantics. Service registrars compose this
 * instead of each owning their own `ipcMain.on` wrapper. */
export const bindEndpoint: BindEndpoint = (command, handler) => {
    ipcMain.on(command, async (event, arg, commandId) => {
        try {
            const invoke = handler as (...args: unknown[]) => unknown;
            const result = await invoke(event, ...arg);
            event.reply(`${command}_${commandId}`, result);
        } catch (e) {
            console.error("Api Error:", e);
            const error = new Error(errMessage(e, "Unknown error"));
            event.reply(`${command}_${commandId}`, error);
        }
    });
};
