// Clipboard IPC data types (US-807) — plain data crossing the main↔renderer
// boundary for Windows file-clipboard (CF_HDROP) interop. No main-only
// dependencies live here so both api-types.ts (renderer-facing) and
// clip-service.ts (main) can import them.

/** "Preferred DropEffect" semantics of the clipboard's file list.
 *  "cut" ⇒ paste should MOVE the files; "none" ⇒ no files on the clipboard. */
export type ClipboardDropEffect = "copy" | "cut" | "none";

/** Result of reading the OS file clipboard (what Windows Explorer puts there
 *  on Ctrl+C / Ctrl+X over files). */
export interface ClipboardFileList {
    /** Absolute file/folder paths; empty when the clipboard holds no files. */
    paths: string[];
    dropEffect: ClipboardDropEffect;
}
