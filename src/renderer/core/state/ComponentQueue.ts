import { useEffect, useRef } from "react";

export interface ComponentQueueEvent {
    readonly type: string;
}

interface PendingRequest<Req> {
    req: Req;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
}

export class ComponentQueue<
    E extends ComponentQueueEvent = ComponentQueueEvent,
    Req = never,
> {
    private _queue: E[] = [];
    private _handler: ((event: E) => void) | null = null;

    private _pendingRequests: PendingRequest<Req>[] = [];
    private _requestHandler: ((req: Req) => unknown) | null = null;

    /** Fire an event. Delivers sync if a handler is subscribed; queues otherwise.
     *  No coalescing — the queue replays identical events in order. */
    send(event: E): void {
        if (this._handler) {
            this._handler(event);
        } else {
            this._queue.push(event);
        }
    }

    /** Programmatic subscribe. Drains queued events to the handler FIFO,
     *  then routes future sends. Replaces any existing handler. */
    subscribe(handler: (event: E) => void): () => void {
        const drained = this._queue;
        this._queue = [];
        for (const ev of drained) handler(ev);

        this._handler = handler;
        return () => {
            if (this._handler === handler) {
                this._handler = null;
            }
        };
    }

    /** React hook for the fire-and-forget channel. Handler is captured in a
     *  ref so re-renders don't churn the subscription (and lose the drain).
     *
     *  Hook-shaped method on a non-component class — call only from React
     *  function components or other hooks. `rules-of-hooks` doesn't model
     *  this pattern (sees `useX` inside a class definition and treats the
     *  class as a component), so the disable is intentional. */
    /* eslint-disable react-hooks/rules-of-hooks */
    use(handler: (event: E) => void): void {
        const handlerRef = useRef(handler);
        handlerRef.current = handler;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `this` is a stable per-instance reference; exhaustive-deps classifies it as "complex expression" and refuses to verify
        useEffect(() => this.subscribe((ev) => handlerRef.current(ev)), [this]);
    }
    /* eslint-enable react-hooks/rules-of-hooks */

    /**
     * Send a request, expect a reply. Resolves sync from the registered handler
     * if present; queues otherwise. Pending requests reject if `dispose()` runs
     * before any handler drains them.
     *
     * Consumer narrows the return type via cast:
     *   const text = await queue.execute({ type: "getSelectedText" }) as string;
     */
    execute(req: Req): Promise<unknown> {
        if (this._requestHandler) {
            try {
                return Promise.resolve(this._requestHandler(req));
            } catch (error) {
                return Promise.reject(error);
            }
        }
        return new Promise<unknown>((resolve, reject) => {
            this._pendingRequests.push({ req, resolve, reject });
        });
    }

    /** Programmatic register for the request/reply channel. Drains pending
     *  requests by invoking `handler` and resolving each Promise; thrown
     *  errors become Promise rejections. Replaces any existing handler. */
    register(handler: (req: Req) => unknown): () => void {
        const pending = this._pendingRequests;
        this._pendingRequests = [];
        for (const { req, resolve, reject } of pending) {
            try { resolve(handler(req)); } catch (error) { reject(error); }
        }

        this._requestHandler = handler;
        return () => {
            if (this._requestHandler === handler) {
                this._requestHandler = null;
            }
        };
    }

    /** React hook for the request/reply channel. Same ref-stability pattern as `use`. */
    /* eslint-disable react-hooks/rules-of-hooks -- hook-shaped class method; see `use()` above */
    useRequest(handler: (req: Req) => unknown): void {
        const handlerRef = useRef(handler);
        handlerRef.current = handler;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `this` is a stable per-instance reference; see `use()` above
        useEffect(() => this.register((req) => handlerRef.current(req)), [this]);
    }
    /* eslint-enable react-hooks/rules-of-hooks */

    /** Clear both channels and reject any pending requests. Called by
     *  EditorModel.dispose so an editor that closes before its view mounts
     *  doesn't leak events or hang awaiting scripts. */
    dispose(): void {
        this._queue.length = 0;
        this._handler = null;

        const pending = this._pendingRequests;
        this._pendingRequests = [];
        for (const { reject } of pending) {
            reject(new Error("ComponentQueue disposed before request was handled"));
        }
        this._requestHandler = null;
    }

    get pendingCount(): number {
        return this._queue.length;
    }

    get pendingRequestCount(): number {
        return this._pendingRequests.length;
    }
}
