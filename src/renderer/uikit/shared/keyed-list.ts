export interface KeyedListOptions<T, K extends PropertyKey, E extends Node = HTMLElement> {
    keyOf(item: T): K;
    create(item: T, index: number): E;
    update(element: E, item: T, index: number): void;
    remove?(element: E, item: T): void;
}

interface KeyedRecord<T, K extends PropertyKey, E extends Node> {
    key: K;
    item: T;
    element: E;
}

/**
 * Reconciles a dedicated DOM container by stable keys without replacing
 * elements that remain in the list.
 */
export class KeyedList<T, K extends PropertyKey, E extends Node = HTMLElement> {
    private readonly records = new Map<K, KeyedRecord<T, K, E>>();
    private disposed = false;

    constructor(
        private readonly parent: Node,
        private readonly options: KeyedListOptions<T, K, E>,
    ) {}

    update(items: readonly T[]): void {
        if (this.disposed) {
            return;
        }

        const keys = new Set<K>();
        const keyedItems: Array<{ key: K; item: T; index: number }> = [];
        items.forEach((item, index) => {
            const key = this.options.keyOf(item);
            if (keys.has(key)) {
                throw new Error(`KeyedList received duplicate key: ${String(key)}`);
            }
            keys.add(key);
            keyedItems.push({ key, item, index });
        });

        // Removal is completed before any new record is created. This also
        // leaves the map representing only retained records if a callback
        // throws; all removal callbacks still get a chance to run.
        let firstError: unknown;
        let hasError = false;
        const capture = (action: () => void): void => {
            try {
                action();
            } catch (error) {
                if (!hasError) {
                    hasError = true;
                    firstError = error;
                }
            }
        };

        const retained = new Map<K, KeyedRecord<T, K, E>>();
        for (const [key, record] of this.records) {
            if (keys.has(key)) {
                retained.set(key, record);
                continue;
            }

            capture(() => this.options.remove?.(record.element, record.item));
            capture(() => this.detach(record.element));
        }
        this.records.clear();
        retained.forEach((record, key) => this.records.set(key, record));

        if (hasError) {
            throw firstError;
        }

        // Create missing records only after all removals have completed.
        const nextRecords = new Map<K, KeyedRecord<T, K, E>>();
        for (const { key, item, index } of keyedItems) {
            const existing = this.records.get(key);
            const record = existing ?? {
                key,
                item,
                element: this.options.create(item, index),
            };
            nextRecords.set(key, record);
        }

        this.records.clear();
        nextRecords.forEach((record, key) => this.records.set(key, record));

        // Walk a cursor through the managed range. Do not reinsert a node that
        // is already at the cursor: moving it would disturb focus, transitions,
        // and IME composition even though the resulting order is unchanged.
        let cursor = this.parent.firstChild;
        for (const { key } of keyedItems) {
            const record = this.getRecord(nextRecords, key);
            if (cursor !== (record.element as Node)) {
                this.parent.insertBefore(record.element, cursor);
            }
            cursor = record.element.nextSibling;
        }

        // Update after ordering so callbacks observe the final index and DOM.
        keyedItems.forEach(({ key, item, index }) => {
            const record = this.getRecord(nextRecords, key);
            this.options.update(record.element, item, index);
            record.item = item;
        });
    }

    get(key: K): E | undefined {
        return this.records.get(key)?.element;
    }

    clear(): void {
        if (this.disposed) {
            return;
        }

        this.clearRecords();
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.clearRecords();
    }

    private clearRecords(): void {
        const records = Array.from(this.records.values());
        this.records.clear();

        let firstError: unknown;
        let hasError = false;
        for (const record of records) {
            try {
                this.options.remove?.(record.element, record.item);
            } catch (error) {
                if (!hasError) {
                    hasError = true;
                    firstError = error;
                }
            }

            try {
                this.detach(record.element);
            } catch (error) {
                if (!hasError) {
                    hasError = true;
                    firstError = error;
                }
            }
        }

        if (hasError) {
            throw firstError;
        }
    }

    /** KeyedList owns its managed nodes, so it also owns detaching them. */
    private detach(element: E): void {
        element.parentNode?.removeChild(element);
    }

    private getRecord(
        records: Map<K, KeyedRecord<T, K, E>>,
        key: K,
    ): KeyedRecord<T, K, E> {
        const record = records.get(key);
        if (!record) {
            throw new Error(`KeyedList lost record for key: ${String(key)}`);
        }
        return record;
    }
}
