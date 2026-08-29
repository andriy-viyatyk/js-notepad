/**
 * Build a multipart/form-data body from FormDataEntry array.
 * Streams file parts directly from disk without loading into memory.
 */

import { fpBasename } from "../../core/utils/file-path";
import { FormDataEntry } from "./restClientTypes";

const fs = require("fs") as typeof import("fs");

export function buildMultipartBody(entries: FormDataEntry[]): {
    boundary: string;
    stream: ReadableStream;
} {
    const boundary = `----FormBoundary${crypto.randomUUID().replace(/-/g, "")}`;
    const enabled = entries.filter((e) => e.enabled && e.key.trim());

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();

            for (const entry of enabled) {
                const key = entry.key.trim();
                controller.enqueue(encoder.encode(`--${boundary}\r\n`));

                if (entry.type === "file" && entry.value) {
                    const filePath = entry.value;
                    if (!fs.existsSync(filePath)) {
                        controller.error(new Error(`File not found: ${filePath}`));
                        return;
                    }
                    const fileName = fpBasename(filePath);
                    controller.enqueue(encoder.encode(
                        `Content-Disposition: form-data; name="${key}"; filename="${fileName}"\r\n` +
                        `Content-Type: application/octet-stream\r\n\r\n`
                    ));

                    // Stream file content
                    await new Promise<void>((resolve, reject) => {
                        // The multipart read stream owns these callbacks until the file
                        // part ends or errors; they are not view/model resources.
                        const fileStream = fs.createReadStream(filePath);
                        fileStream.on("data", (chunk: Buffer) => {
                            controller.enqueue(new Uint8Array(chunk));
                        });
                        fileStream.on("end", resolve);
                        fileStream.on("error", reject);
                    });

                    controller.enqueue(encoder.encode("\r\n"));
                } else {
                    // Text field
                    controller.enqueue(encoder.encode(
                        `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
                        `${entry.value}\r\n`
                    ));
                }
            }

            controller.enqueue(encoder.encode(`--${boundary}--\r\n`));
            controller.close();
        },
    });

    return { boundary, stream };
}
