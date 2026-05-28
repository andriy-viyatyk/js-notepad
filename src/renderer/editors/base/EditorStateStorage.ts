export interface EditorStateStorage {
    getState(name: string): Promise<string | undefined>;
    setState(name: string, state: string): Promise<void>;
}
