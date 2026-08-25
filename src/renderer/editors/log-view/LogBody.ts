import type { LogViewEditor } from "./LogViewEditor";
import { mountVanilla } from "../../uikit/shared/mount";
import { LogBodyView } from "./LogBodyView";

export function LogBody({ model }: { model: LogViewEditor }) {
    return mountVanilla(LogBodyView, { model });
}
