import { EditorOrHost } from "./base";
import type { IContentHost } from "./base/IContentHost";
import type { VanillaViewCtor } from "../uikit/shared/mount";

export interface EditorViewModule {
    View: FileEditorView;
}

export type FileEditorView<T extends EditorOrHost | IContentHost = EditorOrHost | IContentHost> =
    VanillaViewCtor<{ model: T }>;
