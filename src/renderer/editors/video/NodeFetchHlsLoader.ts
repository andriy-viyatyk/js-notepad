import type {
    Loader,
    LoaderContext,
    LoaderConfiguration,
    LoaderCallbacks,
    LoaderStats,
    HlsConfig,
} from "hls.js";
import { LoadStats } from "hls.js";
import { errMessage } from "../../../shared/utils";

/**
 * hls.js Loader implementation backed by nodeFetch (Node.js http/https).
 *
 * Bypasses Chromium's network stack entirely, so ALL headers including
 * Origin, Referer, and Host are sent as-is. Used when the user provides
 * a cURL command with custom headers for an M3U8 stream.
 *
 * Returns a class (not an instance) — hls.js calls `new config.loader(config)`
 * internally for each request.
 */
export function createNodeFetchLoaderClass(
    extraHeaders: Record<string, string>,
): { new (config: HlsConfig): Loader<LoaderContext> } {
    return class NodeFetchLoader implements Loader<LoaderContext> {
        context: LoaderContext | null = null;
        stats: LoaderStats = new LoadStats();
        private controller: AbortController | null = null;

        constructor(_config: HlsConfig) {}

        destroy(): void {
            this.abort();
        }

        abort(): void {
            this.controller?.abort();
            this.controller = null;
        }

        async load(
            context: LoaderContext,
            _config: LoaderConfiguration,
            callbacks: LoaderCallbacks<LoaderContext>,
        ): Promise<void> {
            this.context = context;
            this.controller = new AbortController();
            const stats = this.stats;

            stats.loading.start = performance.now();

            // Merge context headers (from hls.js) with extra headers (from cURL).
            // hls.js own headers (e.g. Accept) win over extra headers.
            const headers: Record<string, string> = {
                ...extraHeaders,
                ...(context.headers as Record<string, string> | undefined),
            };

            // Add Range header if hls.js requests a byte range
            if (context.rangeStart !== undefined) {
                const rangeEnd =
                    context.rangeEnd !== undefined ? context.rangeEnd.toString() : "";
                headers["Range"] = `bytes=${context.rangeStart}-${rangeEnd}`;
            }

            try {
                const { nodeFetch } = await import("../../api/node-fetch");
                const response = await nodeFetch(context.url, {
                    method: "GET",
                    headers,
                });

                if (!response.ok) {
                    callbacks.onError(
                        { code: response.status, text: response.statusText },
                        context,
                        response,
                        stats,
                    );
                    return;
                }

                stats.loading.first = performance.now();
                stats.total = parseInt(
                    response.headers.get("content-length") || "0",
                    10,
                );

                const data =
                    context.responseType === "arraybuffer"
                        ? await response.arrayBuffer()
                        : await response.text();

                stats.loaded =
                    typeof data === "string" ? data.length : data.byteLength;
                stats.loading.end = performance.now();

                callbacks.onSuccess(
                    { url: context.url, data },
                    stats,
                    context,
                    response,
                );
            } catch (error: unknown) {
                if (error instanceof Error && error.name === "AbortError") {
                    stats.aborted = true;
                    callbacks.onAbort?.(stats, context, null);
                    return;
                }
                callbacks.onError(
                    {
                        code: 0,
                        text: errMessage(error),
                    },
                    context,
                    null,
                    stats,
                );
            }
        }

        getCacheAge(): number | null {
            return null;
        }

        getResponseHeader(_name: string): string | null {
            return null;
        }
    };
}
