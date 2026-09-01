const MAX_CALLBACKS_PER_DRAIN = 10_000;

let dispatchDepth = 0;
let draining = false;
const pendingCallbacks: Array<() => void> = [];

const escalateError = (error: unknown): void => {
    setTimeout(() => { throw error; }, 0);
};

const drain = (): void => {
    draining = true;
    let cursor = 0;
    try {
        while (cursor < pendingCallbacks.length) {
            if (cursor >= MAX_CALLBACKS_PER_DRAIN) {
                pendingCallbacks.length = 0;
                escalateError(new Error(
                    `afterDispatch drain exceeded the maximum of ${MAX_CALLBACKS_PER_DRAIN} callbacks`,
                ));
                return;
            }

            const callback = pendingCallbacks[cursor++];
            try {
                callback();
            } catch (error) {
                escalateError(error);
            }
        }
        pendingCallbacks.length = 0;
    } finally {
        draining = false;
    }
};

export function afterDispatch(callback: () => void): void {
    if (dispatchDepth > 0 || draining) {
        pendingCallbacks.push(callback);
    } else {
        callback();
    }
}

// Internal seam used only by TOneState.stateChanged.
export function runInDispatch(callback: () => void): void {
    dispatchDepth++;
    try {
        callback();
    } finally {
        dispatchDepth--;
        if (dispatchDepth === 0 && !draining) drain();
    }
}
