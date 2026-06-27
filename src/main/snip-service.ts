import { spawn } from "child_process";
import { app, nativeImage } from "electron";
import path from "path";
import { openWindows } from "./open-windows";

function getSnipToolPath(): string {
    if (app.isPackaged) {
        return path.join(path.dirname(process.execPath), "persephone-snip.exe");
    }
    return path.join(__dirname, "../../snip-tool/target/release/persephone-snip.exe");
}

export async function startScreenSnip(hideWindows: boolean): Promise<string | null> {
    const snipExe = getSnipToolPath();

    // "Snip Persephone" (hideWindows === false) leaves every window untouched so the
    // user can snip Persephone's own content. The snip tool captures the screen before
    // showing its overlay, so the live Persephone window is included in the snapshot.
    if (hideWindows) {
        openWindows.hideWindows();
        // Give Windows time to fully hide the app windows and repaint the desktop.
        await new Promise((r) => setTimeout(r, 200));
    }

    try {
        const pngBuffer = await new Promise<Buffer | null>((resolve) => {
            const child = spawn(snipExe, [], {
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: false,
            });

            const chunks: Buffer[] = [];
            child.stdout.on("data", (chunk: Buffer) => { chunks.push(chunk); });
            child.stderr.on("data", (chunk: Buffer) => {
                console.error("snip-tool:", chunk.toString());
            });

            child.on("close", (code) => {
                if (code === 0 && chunks.length > 0) {
                    resolve(Buffer.concat(chunks));
                } else {
                    resolve(null);
                }
            });

            child.on("error", (err) => {
                console.error("Failed to start snip tool:", err);
                resolve(null);
            });
        });

        if (!pngBuffer) return null;

        const img = nativeImage.createFromBuffer(pngBuffer);
        return img.isEmpty() ? null : img.toDataURL();
    } finally {
        if (hideWindows) openWindows.showWindows();
    }
}
