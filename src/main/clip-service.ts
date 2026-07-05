// Windows file-clipboard service (US-807). Bridges the renderer to the
// clipboard subcommands of persephone-snip.exe (see snip-tool/src/clipboard.rs)
// because Electron's clipboard API cannot read a multi-file CF_HDROP list nor
// write one at all.

import { spawn } from "child_process";
import { getSnipToolPath } from "./snip-service";
import type { ClipboardFileList } from "../ipc/clipboard-ipc";

const EMPTY: ClipboardFileList = { paths: [], dropEffect: "none" };

/** Read the OS file clipboard. Degrades to an empty result (never throws) when
 *  the helper exe is missing (dev build without a local `cargo build --release`)
 *  or its output is unparsable. */
export async function readClipboardFiles(): Promise<ClipboardFileList> {
    return new Promise((resolve) => {
        const child = spawn(getSnipToolPath(), ["clipboard-read"], {
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });

        const chunks: Buffer[] = [];
        child.stdout.on("data", (chunk: Buffer) => { chunks.push(chunk); });
        child.stderr.on("data", (chunk: Buffer) => {
            console.error("clip-tool:", chunk.toString());
        });

        child.on("close", (code) => {
            if (code !== 0 || chunks.length === 0) {
                resolve(EMPTY);
                return;
            }
            try {
                const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                if (Array.isArray(parsed?.paths)) {
                    resolve({
                        paths: parsed.paths.filter((p: unknown) => typeof p === "string"),
                        dropEffect: parsed.dropEffect === "cut" ? "cut"
                            : parsed.paths.length ? "copy" : "none",
                    });
                    return;
                }
            } catch (e) {
                console.error("clip-tool: bad clipboard-read output:", e);
            }
            resolve(EMPTY);
        });

        child.on("error", (err) => {
            console.error("Failed to start clip tool:", err);
            resolve(EMPTY);
        });
    });
}

/** Put `paths` on the OS file clipboard as CF_HDROP (+ Preferred DropEffect).
 *  An empty `paths` list clears the clipboard — used to consume a "cut"
 *  clipboard after a successful paste, the way Windows Explorer does. */
export async function writeClipboardFiles(paths: string[], cut: boolean): Promise<boolean> {
    return new Promise((resolve) => {
        const args = cut ? ["clipboard-write", "--cut"] : ["clipboard-write"];
        const child = spawn(getSnipToolPath(), args, {
            stdio: ["pipe", "ignore", "pipe"],
            windowsHide: true,
        });

        child.stderr.on("data", (chunk: Buffer) => {
            console.error("clip-tool:", chunk.toString());
        });

        child.on("close", (code) => { resolve(code === 0); });
        child.on("error", (err) => {
            console.error("Failed to start clip tool:", err);
            resolve(false);
        });

        if (paths.length) {
            child.stdin.write(paths.join("\r\n") + "\r\n", "utf8");
        }
        child.stdin.end();
    });
}
