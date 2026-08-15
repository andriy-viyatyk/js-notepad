/**
 * Tracks nested native dragenter/dragleave events per target. Browsers emit leave events
 * while the pointer moves between descendants, so consumers should react only to the
 * first enter and final leave for a target.
 */
export class DragEnterCounter<TKey> {
    private readonly counts = new Map<TKey, number>();

    enter(key: TKey): boolean {
        const count = this.counts.get(key) ?? 0;
        this.counts.set(key, count + 1);
        return count === 0;
    }

    leave(key: TKey): boolean {
        const next = (this.counts.get(key) ?? 0) - 1;
        if (next > 0) {
            this.counts.set(key, next);
            return false;
        }
        this.counts.delete(key);
        return true;
    }

    clear() {
        this.counts.clear();
    }
}
