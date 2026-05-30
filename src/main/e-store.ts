import Store from "electron-store";

/** Narrowed surface — electron-store's TS surface uses schema generics; we
 *  only need a string-keyed get/set bag. */
interface StoreSurface {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
}

class ElectronStore {
    private instance: StoreSurface;

    constructor() {
        this.instance = new Store() as unknown as StoreSurface;
    }

    public get<T>(key: string, defaultValue?: T): T | undefined {
        return (this.instance.get(key) as T | undefined) ?? defaultValue;
    }

    public set(key: string, value: unknown): void {
        this.instance.set(key, value);
    }
}

export const electronStore = new ElectronStore();
