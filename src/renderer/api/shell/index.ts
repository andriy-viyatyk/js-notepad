import type { IShell, IVersionService, IEncryptionService } from "../types/shell";
import { encryption } from "./encryption";
import { version } from "./version";
import { openExternal, startScreenSnip } from "./shell-calls";

class Shell implements IShell {
    readonly encryption: IEncryptionService = encryption;
    readonly version: IVersionService = version;

    openExternal(url: string): Promise<void> {
        return openExternal(url);
    }

    startScreenSnip(hideWindows: boolean): Promise<string | null> {
        return startScreenSnip(hideWindows);
    }
}

export const shell = new Shell();
