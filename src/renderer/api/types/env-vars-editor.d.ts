export type IEnvVarsStatus = "ok" | "locked" | "error";

export interface IEnvVarSnapshot {
    readonly name: string;
    readonly value: string;
}

export interface IEnvVarsEditor {
    readonly id: "env-vars-view";
    readonly name: string;
    readonly status: IEnvVarsStatus | undefined;
    readonly encrypted: boolean | undefined;
    readonly unlocked: boolean | undefined;
    readonly errorMessage: string | undefined;
    readonly namespaces: string[] | undefined;
    readonly selectedNamespace: string | undefined;
    readonly profiles: string[] | undefined;
    readonly selectedProfile: string | undefined;
    readonly variables: IEnvVarSnapshot[] | undefined;

    selectNamespace(namespace: string): void;
    selectProfile(profile: string): void;
    addNamespace(name: string): boolean;
    deleteNamespace(name: string): Promise<void>;
    addProfile(namespace: string, name: string): boolean;
    deleteProfile(namespace: string, profile: string): Promise<void>;
    showEncryptionDialog(message?: string): Promise<void>;
}
