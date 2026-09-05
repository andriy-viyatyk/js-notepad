export interface IEditorSwitchOption {
    readonly id: string;
    readonly label: string;
}

export interface IPageEditorSwitches {
    readonly current: string;
    readonly options: readonly IEditorSwitchOption[];
    switchTo(id: string): Promise<void>;
    readonly elements: readonly {
        readonly name: string;
        readonly purpose: string;
        readonly selector: string;
        readonly visible: boolean;
    }[];
}
