import Store from "electron-store";

class ElectronStore {
    private instance: any;

    constructor() {
        this.instance = new Store();
    }

    public get<T>(key: string, defaultValue?: T): T | undefined {
        return this.instance.get(key) ?? defaultValue;
    }

    public set(key: string, value: any): void {
        this.instance.set(key, value);
    }
}

export const electronStore = new ElectronStore();