import { EditorOrHost } from "./base";
import type { IContentHost } from "./base/IContentHost";

export type FileEditorComponent<T extends EditorOrHost | IContentHost = EditorOrHost | IContentHost> = React.ComponentType<{
    model: T;
}>;

export interface EditorViewModule {
    Editor: FileEditorComponent;
}
