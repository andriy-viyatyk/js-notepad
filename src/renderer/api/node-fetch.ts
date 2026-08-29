/**
 * Node.js HTTP client — bypasses Chromium's network stack for full header control.
 *
 * Uses Node's http/https modules directly (available because nodeIntegration: true).
 * No automatic headers (Origin, User-Agent, Sec-Fetch-*, etc.) are injected.
 * Returns a standard web Response object.
 *
 * Used by:
 *  - `app.fetch()` — script API for HTTP requests
 *  - Rest Client editor — for executing requests
 *
 * Based on the proven implementation in av-player/src/main/network/nodeHttpFetch.ts.
 */

import type { IFetchOptions } from "./types/app";

const https = require("https") as typeof import("https");
const http = require("http") as typeof import("http");
const zlib = require("zlib") as typeof import("zlib");

/** Default HTTPS agent with keep-alive for connection reuse. */
const defaultHttpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 8,
    keepAliveMsecs: 30000,
    timeout: 60000,
    rejectUnauthorized: true,
});

/** HTTPS agent that skips SSL certificate validation. */
const insecureHttpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 8,
    keepAliveMsecs: 30000,
    timeout: 60000,
    rejectUnauthorized: false,
});

export function nodeFetch(
    url: string,
    options?: IFetchOptions,
): Promise<Response> {
    const method = options?.method ?? "GET";
    const headers = options?.headers ?? {};
    const body = options?.body ?? null;
    const timeout = options?.timeout ?? 30000;
    const maxRedirects = options?.maxRedirects ?? 10;
    const rejectUnauthorized = options?.rejectUnauthorized !== false;

    return doFetch(url, method, headers, body, timeout, maxRedirects, rejectUnauthorized);
}

function doFetch(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | ReadableStream | null,
    timeout: number,
    maxRedirects: number,
    rejectUnauthorized: boolean,
): Promise<Response> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === "https:";

        const agent = isHttps
            ? (rejectUnauthorized ? defaultHttpsAgent : insecureHttpsAgent)
            : undefined;

        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method,
            headers,
            agent,
            timeout,
        };

        const lib = isHttps ? https : http;
        const req = lib.request(reqOptions, (res) => {
            // Handle redirects (301, 302, 303, 307, 308)
            if (
                res.statusCode &&
                [301, 302, 303, 307, 308].includes(res.statusCode)
            ) {
                const location = res.headers.location;

                if (!location) {
                    res.destroy();
                    reject(new Error(`Redirect ${res.statusCode} without Location header`));
                    return;
                }

                if (maxRedirects <= 0) {
                    res.destroy();
                    reject(new Error("Too many redirects"));
                    return;
                }

                // The active HTTP response owns this end listener until the redirect
                // response is drained; a view/model disposer must not touch the request.
                // Drain the redirect response body
                res.resume();
                res.on("end", () => {});

                const redirectUrl = location.startsWith("http")
                    ? location
                    : new URL(location, url).toString();

                // 303 always switches to GET; 301/302 switch POST to GET
                const newMethod =
                    res.statusCode === 303 ||
                    (method === "POST" && [301, 302].includes(res.statusCode))
                        ? "GET"
                        : method;

                const redirectHeaders = { ...headers };
                const redirectUrlObj = new URL(redirectUrl);

                // Update Host header for the new target
                redirectHeaders["Host"] = redirectUrlObj.host;

                // Update Sec-Fetch-Site if present
                const isCrossOrigin = urlObj.origin !== redirectUrlObj.origin;
                if (redirectHeaders["Sec-Fetch-Site"]) {
                    redirectHeaders["Sec-Fetch-Site"] = isCrossOrigin
                        ? "cross-site"
                        : "same-origin";
                }

                // Strip body-related headers on method change to GET
                if (newMethod === "GET") {
                    delete redirectHeaders["Content-Length"];
                    delete redirectHeaders["Content-Type"];
                    delete redirectHeaders["Origin"];
                }

                // Cancel the original body stream if switching to GET
                if (body && typeof body !== "string" && newMethod === "GET") {
                    body.cancel().catch(() => {});
                }

                doFetch(
                    redirectUrl,
                    newMethod,
                    redirectHeaders,
                    newMethod === "GET" ? null : body,
                    timeout,
                    maxRedirects - 1,
                    rejectUnauthorized,
                ).then(resolve, reject);

                return;
            }

            // Build response headers
            const responseHeaders = new Headers();
            for (const [k, v] of Object.entries(res.headers)) {
                responseHeaders.set(k, Array.isArray(v) ? v.join(", ") : v || "");
            }

            // Decompression
            const contentEncoding = res.headers["content-encoding"];
            let responseStream = res as NodeJS.ReadableStream;

            if (contentEncoding === "gzip") {
                responseStream = res.pipe(zlib.createGunzip());
            } else if (contentEncoding === "deflate") {
                responseStream = res.pipe(zlib.createInflate());
            } else if (contentEncoding === "br") {
                responseStream = res.pipe(zlib.createBrotliDecompress());
            } else if (contentEncoding === "zstd") {
                // createZstdDecompress was added in Node 23; not yet in @types/node.
                const z = zlib as typeof zlib & { createZstdDecompress(): NodeJS.ReadWriteStream };
                responseStream = res.pipe(z.createZstdDecompress());
            }

            // The response/readable stream owns these callbacks until it ends or is
            // cancelled; they are request-lifetime resources, not view/model resources.
            if (responseStream !== res) {
                responseStream.on("error", (err) => {
                    console.error("nodeFetch decompression error:", err);
                    res.destroy();
                });
            }

            // Remove content-encoding since we've decompressed
            responseHeaders.delete("content-encoding");

            // Wrap Node stream as web ReadableStream
            let isCancelled = false;
            const readableStream = new ReadableStream({
                start(controller) {
                    responseStream.on("data", (chunk) => {
                        if (!isCancelled) {
                            try {
                                controller.enqueue(new Uint8Array(chunk));
                            } catch {
                                // Stream likely cancelled
                            }
                        }
                    });

                    responseStream.on("end", () => {
                        if (!isCancelled) {
                            try {
                                controller.close();
                            } catch {
                                // Already closed
                            }
                        }
                    });

                    responseStream.on("error", (err) => {
                        if (!isCancelled) {
                            try {
                                controller.error(err);
                            } catch {
                                // Already closed
                            }
                        }
                    });
                },
                cancel() {
                    isCancelled = true;
                    if (responseStream !== res) {
                        (responseStream as NodeJS.ReadableStream & { destroy?(): void }).destroy?.();
                    }
                    res.destroy();
                    responseStream.removeAllListeners();
                },
            });

            // Some status codes have no body
            const hasBody =
                res.statusCode &&
                res.statusCode !== 101 &&
                res.statusCode !== 103 &&
                res.statusCode !== 204 &&
                res.statusCode !== 205 &&
                res.statusCode !== 304;

            resolve(
                new Response(hasBody ? readableStream : null, {
                    status: res.statusCode || 200,
                    statusText: res.statusMessage || "OK",
                    headers: responseHeaders,
                }),
            );
        });

        // The request owns its timeout/error listeners through completion or failure.
        req.on("timeout", () => {
            req.destroy();
            reject(new Error(`Request timeout [${timeout}ms]: ${url}`));
        });

        req.on("error", (err) => {
            reject(err);
        });

        // Send request body
        if (body && typeof body === "string") {
            req.end(body);
        } else if (body) {
            const reader = (body as ReadableStream).getReader();
            const pump = async () => {
                try {
                    const { done, value } = await reader.read();
                    if (done) {
                        req.end();
                        return;
                    }
                    req.write(value);
                    await pump();
                } catch (err) {
                    req.destroy();
                    reject(err);
                }
            };
            pump();
        } else {
            req.end();
        }
    });
}
