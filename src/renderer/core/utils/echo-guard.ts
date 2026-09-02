const MAX_PENDING_TOKENS = 3;

export interface EchoGuard<T> {
    arm(token: T): void;
    consume(token: T): boolean;
}

/**
 * Create an independent bounded guard for exact self-write echoes.
 *
 * `consume()` always resolves the observed event. A matching token and all
 * older tokens are removed, while newer tokens remain pending. A nonmatching
 * change clears every pending token before returning `false`; this retires
 * arm-and-hope because the nonmatching change is processed and disarms the
 * pending echoes, so no stale token can swallow the next genuine change.
 */
export function createEchoGuard<T>(): EchoGuard<T> {
    const pendingTokens: T[] = [];

    return {
        arm(token: T): void {
            pendingTokens.push(token);
            if (pendingTokens.length > MAX_PENDING_TOKENS) {
                pendingTokens.shift();
            }
        },

        consume(token: T): boolean {
            const matchingIndex = pendingTokens.findIndex(
                (pendingToken) => pendingToken === token,
            );
            if (matchingIndex === -1) {
                pendingTokens.length = 0;
                return false;
            }

            pendingTokens.splice(0, matchingIndex + 1);
            return true;
        },
    };
}
