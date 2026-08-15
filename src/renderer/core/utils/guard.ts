import { ui } from "../../api/ui";
import type { NotificationType } from "../../api/types/ui";
import { errMessage } from "../../../shared/utils";

/**
 * Run `fn`, reporting any failure as a toast instead of letting it escape.
 *
 * For the very common handler shape "do the thing; if it throws, tell the user and
 * carry on". `label` is the full prefix, so `guard("Failed to open file", …)`
 * produces exactly `Failed to open file: <message>`.
 *
 * Only use this where swallowing the error is genuinely right — the caller learns
 * nothing beyond `undefined`. When the catch has to update state, log, or re-throw,
 * keep the explicit `try`/`catch`.
 */
export async function guard<T>(
    label: string,
    fn: () => T | Promise<T>,
    level: NotificationType = "error",
): Promise<T | undefined> {
    try {
        return await fn();
    } catch (err) {
        void ui.notify(`${label}: ${errMessage(err)}`, level);
        return undefined;
    }
}
