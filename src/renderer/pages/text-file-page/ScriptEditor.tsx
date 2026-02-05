import { Editor } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import styled from "@emotion/styled";

import { TModel } from "../../core/state/model";
import { TextFileModel } from "./TextFilePage.model";
import { Splitter } from "../../components/layout/Splitter";
import color from "../../theme/color";
import { PageToolbar } from "../shared/PageToolbar";
import { CloseIcon, RunAllIcon, RunIcon } from "../../theme/icons";
import { Button } from "../../components/basic/Button";
import { FlexSpace } from "../../components/layout/Elements";
import { TComponentState } from "../../core/state/state";
import { filesModel } from "../../model/files-model";
import { parseObject } from "../../core/utils/parse-utils";
import { debounce } from "../../../shared/utils";

const ScriptEditorRoot = styled.div({
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    "& .splitter": {
        backgroundColor: color.background.dark,
    },
    "& .page-toolbar": {
        marginBottom: 2,
    },
});

export const defaultScriptEditorState = {
    content: "return page.content",
    open: false,
    height: 160,
    hasSelection: false,
    data: {},
}

export type ScriptEditorState = typeof defaultScriptEditorState;

export class ScriptEditorModel extends TModel<ScriptEditorState> {
    editorRef = null as monaco.editor.IStandaloneCodeEditor | null;
    private pageModel: TextFileModel;
    private unsubscribe: (() => void) | undefined = undefined;
    private skipSave = false;
    private selectionListenerDisposable: monaco.IDisposable | null = null;
    private scriptData: Record<string, any> | undefined = {};
    id: string | undefined = undefined;
    name = "script";

    get data() {
        return this.scriptData;
    }

    constructor(pageModel: TextFileModel) {
        super(new TComponentState(defaultScriptEditorState));
        this.pageModel = pageModel;
        this.unsubscribe = this.state.subscribe(this.saveStateDebounced);
    }

    restore = async (id: string) => {
        this.id = id;
        const data = await filesModel.getCacheFile(id, this.name);
        const newState = parseObject(data) || defaultScriptEditorState;
        this.skipSave = true;
        this.state.set({
            ...defaultScriptEditorState,
            ...newState
        });
    }

    private saveState = async (): Promise<void> => {
        if (this.skipSave) {
            this.skipSave = false;
            return;
        }
        if (!this.id) {
            return;
        }

        const state = this.state.get();
        await filesModel.saveCacheFile(this.id, JSON.stringify(state), this.name);
    }

    private saveStateDebounced = debounce(this.saveState, 300);

    dispose = () => {
        this.unsubscribe?.();
        this.selectionListenerDisposable?.dispose();
        this.selectionListenerDisposable = null;
    }

    changeContent = (newContent: string) => {
        this.state.update((s) => {
            s.content = newContent;
        });
    }

    toggleOpen = () => {
        this.state.update((s) => {
            s.open = !s.open;
        });
    }

    setHeight = (height: number) => {
        this.state.update((s) => {
            s.height = height;
        });
    }

    handleEditorChange = (value: string | undefined) => {
        this.changeContent(value || "");
    };

    handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.code === "F5") {
            e.preventDefault();
            this.pageModel.runRelatedScript();
        }
    };

    setupSelectionListener = (editor: monaco.editor.IStandaloneCodeEditor) => {
        this.selectionListenerDisposable = editor.onDidChangeCursorSelection((e) => {
            const selection = editor.getSelection();
            const hasSelection = selection ? !selection.isEmpty() : false;
            
            if (this.state.get().hasSelection !== hasSelection) {
                this.state.update(s => { s.hasSelection = hasSelection; });
            }
        });
    };

    handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
        this.editorRef = editor;
        this.setupSelectionListener(editor);
    };

    getSelectedText = (): string => {
        if (!this.editorRef) {
            return "";
        }
        
        const selection = this.editorRef.getSelection();
        if (!selection || selection.isEmpty()) {
            return "";
        }
        
        return this.editorRef.getModel()?.getValueInRange(selection) || "";
    };
}

interface ScriptEditorProps {
    model: TextFileModel;
}

export function ScriptEditor({ model }: ScriptEditorProps) {
    const scriptModel = model.script;
    const state = model.script.state.use();

    if (!state.open) {
        return null;
    }

    return (
        <ScriptEditorRoot
            style={{ height: state.height }}
            onKeyDown={scriptModel.handleKeyDown}
        >
            <Splitter
                type="horizontal"
                initialHeight={state.height}
                borderSized="top"
                onChangeHeight={scriptModel.setHeight}
            />
            <PageToolbar borderTop>
                <Button
                    title={state.hasSelection ? "Run Selected Script (F5)" : "Run Script (F5)"}
                    type="icon"
                    size="small"
                    onClick={() => model.runRelatedScript()}
                >
                    <RunIcon />
                </Button>
                {state.hasSelection && (
                    <Button
                        key="run-all_script"
                        type="icon"
                        size="small"
                        title="Run All Script"
                        onClick={() => model.runRelatedScript(true)}
                    >
                        <RunAllIcon />
                    </Button>
                )}
                <FlexSpace />
                <Button
                    title="Close Script Editor"
                    type="icon"
                    size="small"
                    onClick={scriptModel.toggleOpen}
                >
                    <CloseIcon />
                </Button>
            </PageToolbar>
            <Editor
                value={state.content}
                language="javascript"
                onMount={scriptModel.handleEditorDidMount}
                onChange={scriptModel.handleEditorChange}
                theme="custom-dark"
                options={{
                    automaticLayout: true,
                }}
            />
        </ScriptEditorRoot>
    );
}
