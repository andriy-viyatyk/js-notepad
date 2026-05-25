export { ExplorerEditor, getDefaultExplorerEditorState } from "./ExplorerEditorModel";
export type { ExplorerEditorState } from "./ExplorerEditorModel";
// Compatibility aliases — retire under US-559 cleanup. Keep `ExplorerEditorModel`
// + `ExplorerEditorModelState` names usable from legacy callsites that haven't
// been updated yet.
export { ExplorerEditor as ExplorerEditorModel } from "./ExplorerEditorModel";
export type { ExplorerEditorState as ExplorerEditorModelState } from "./ExplorerEditorModel";
export { getDefaultExplorerEditorState as getDefaultExplorerEditorModelState } from "./ExplorerEditorModel";
