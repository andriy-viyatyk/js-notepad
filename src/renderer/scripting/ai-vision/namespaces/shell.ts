import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const SHELL_MEMBERS: readonly IAiMember[] = [
    { name: "openExternal", kind: "method", signature: "openExternal(url: string)", summary: "Open a URL in the OS default browser.", caution: "opens or focuses an external application" },
    { name: "startScreenSnip", kind: "method", signature: "startScreenSnip(hideWindows: boolean)", summary: "Run the native screen-snip tool and return a PNG data URL or null.", caution: "opens native capture UI and can hide Persephone windows" },
    { name: "version", kind: "property", node: true, summary: "Runtime and application update service." },
    { name: "encryption", kind: "property", node: true, summary: "AES-GCM text encryption service." },
];

const VERSION_SERVICE_MEMBERS: readonly IAiMember[] = [
    { name: "runtimeVersions", kind: "method", signature: "runtimeVersions()", summary: "Read Electron, Node, and Chrome versions." },
    { name: "checkForUpdates", kind: "method", signature: "checkForUpdates(force?: boolean)", summary: "Check for application updates and return update information." },
];

const ENCRYPTION_SERVICE_MEMBERS: readonly IAiMember[] = [
    { name: "encrypt", kind: "method", signature: "encrypt(text: string, password: string)", summary: "Encrypt text with a password." },
    { name: "decrypt", kind: "method", signature: "decrypt(encryptedText: string, password: string)", summary: "Decrypt text with a password." },
    { name: "isEncrypted", kind: "method", signature: "isEncrypted(text: string)", summary: "Check whether text has the supported encrypted prefix." },
];

export function describeShell(_instance: unknown): IAiVisionDescriptor {
    return {
        kind: "Shell",
        summary: "Open URLs, capture screen snippets, encrypt/decrypt text, and inspect runtime/update versions.",
        members: SHELL_MEMBERS,
        help: "Use openExternal and startScreenSnip only when opening external UI is intended; use encryption for text protected by a password.",
        summarize: () => ({ kind: "Shell" }),
    };
}

export function describeVersionService(_instance: unknown): IAiVisionDescriptor {
    return {
        kind: "VersionService",
        summary: "Inspect runtime versions and application updates.",
        members: VERSION_SERVICE_MEMBERS,
        help: "Use runtimeVersions to inspect the runtime and checkForUpdates to query update availability.",
        summarize: () => ({ kind: "VersionService" }),
    };
}

export function describeEncryptionService(_instance: unknown): IAiVisionDescriptor {
    return {
        kind: "EncryptionService",
        summary: "Encrypt and decrypt text with the application AES-GCM service.",
        members: ENCRYPTION_SERVICE_MEMBERS,
        help: "Keep passwords private and use isEncrypted before attempting to decrypt text.",
        summarize: () => ({ kind: "EncryptionService" }),
    };
}
