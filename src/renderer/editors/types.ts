import { EditorOrHost } from "./base";
import type { IContentHost } from "./base/IContentHost";
import type { VanillaViewCtor } from "../uikit/shared/mount";

export type FileEditorComponent<T extends EditorOrHost | IContentHost = EditorOrHost | IContentHost> = React.ComponentType<{
    model: T;
}>;

export interface EditorViewModule {
    Editor: FileEditorComponent;
    View?: FileEditorView;
}

export type FileEditorView<T extends EditorOrHost | IContentHost = EditorOrHost | IContentHost> =
    VanillaViewCtor<{ model: T }>;
