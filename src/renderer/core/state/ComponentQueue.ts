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
        this._handler = handler;
        const drained = this._queue;
        this._queue = [];
        for (const ev of drained) handler(ev);
        return () => {
            if (this._handler === handler) {
                this._handler = null;
            }
        };
    }

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
        this._requestHandler = handler;
        const pending = this._pendingRequests;
        this._pendingRequests = [];
        for (const { req, resolve, reject } of pending) {
            try { resolve(handler(req)); } catch (error) { reject(error); }
        }
        return () => {
            if (this._requestHandler === handler) {
                this._requestHandler = null;
            }
        };
    }

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
