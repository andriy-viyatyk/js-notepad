// Main components
export { TextPageView } from './TextPageView';
export { TextToolbar } from './TextToolbar';
export { TextFooter } from './TextFooter';
export { TextEditor, TextEditorModel } from './TextEditor';
export { ActiveEditor } from './ActiveEditor';
export { EncryptionPanel } from './EncryptionPanel';
export { ScriptPanel, ScriptPanelModel, defaultScriptPanelState } from './ScriptPanel';
export type { ScriptPanelState } from './ScriptPanel';

// Model
export {
    TextFileModel,
    getDefaultTextFilePageModelState,
    newTextFileModel,
    newTextFileModelFromState,
    isTextFileModel,
} from './TextPageModel';
export type { TextFilePageModelState } from './TextPageModel';

// Re-exports for backward compatibility (old names)
export { TextPageView as TextFilePage } from './TextPageView';
export { TextToolbar as TextFileActions } from './TextToolbar';
export { TextFooter as TextFileFooterActions } from './TextFooter';
export { EncryptionPanel as EncriptionPanel } from './EncryptionPanel';
export { ScriptPanel as ScriptEditor, ScriptPanelModel as ScriptEditorModel } from './ScriptPanel';
export { defaultScriptPanelState as defaultScriptEditorState } from './ScriptPanel';
export type { ScriptPanelState as ScriptEditorState } from './ScriptPanel';
export { TextFileModel as TextFilePageModel } from './TextPageModel';
