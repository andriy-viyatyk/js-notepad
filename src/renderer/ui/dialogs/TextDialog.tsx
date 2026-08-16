import { Editor, OnMount } from "@monaco-editor/react";

import { Dialog, DialogContent, Panel, Button } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { TComponentState } from "../../core/state/state";
import { showDialog } from "./Dialogs";

const textDialogId = Symbol("textDialog");

export interface TextDialogEditorOptions {
    language?: string;
    wordWrap?: "on" | "off" | "wordWrapColumn" | "bounded";
    minimap?: boolean;
    lineNumbers?: "on" | "off" | "relative" | "interval";
}

export interface TextDialogProps {
    title?: string;
    text?: string;
    buttons?: string[];
    readOnly?: boolean;
    options?: TextDialogEditorOptions;
    width?: number;
    height?: number;
}

const defaultTextDialogProps: Required<Pick<TextDialogProps, "title" | "text" | "buttons" | "readOnly">> = {
    title: "",
    text: "",
    buttons: ["OK"],
    readOnly: true,
};

export interface TextDialogResult {
    text: string;
    button: string;
}

class TextDialogModel extends TDialogModel<TextDialogProps, TextDialogResult | undefined> {
    editorText: string;

    constructor(state: TComponentState<TextDialogProps>) {
        super(state);
        this.editorText = state.get().text || "";
    }

    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
        }
    };

    handleEditorChange = (value: string | undefined) => {
        this.editorText = value || "";
    };
}

function TextDialog({ model }: ViewPropsRO<TextDialogModel>) {
    const state = model.state.use();
    const title = state.title || defaultTextDialogProps.title;
    const buttons = state.buttons || defaultTextDialogProps.buttons;
    const readOnly = state.readOnly ?? defaultTextDialogProps.readOnly;
    const opts = state.options;

    const handleEditorDidMount: OnMount = (editor) => {
        editor.focus();
    };

    return (
        <Dialog name="text-dialog" onKeyDown={model.handleKeyDown} autoFocus={false}>
            <DialogContent
                title={title}
                icon="confirm"
                onClose={() => model.close(undefined)}
                width={state.width || 600}
                height={state.height || 400}
            >
                <Panel flex overflow="hidden">
                    <Editor
                        value={state.text || ""}
                        language={opts?.language || "plaintext"}
                        onChange={readOnly ? undefined : model.handleEditorChange}
                        onMount={handleEditorDidMount}
                        theme="custom-dark"
                        options={{
                            automaticLayout: true,
                            readOnly,
                            wordWrap: opts?.wordWrap || "on",
                            minimap: { enabled: opts?.minimap ?? false },
                            lineNumbers: opts?.lineNumbers || "off",
                            scrollBeyondLastLine: false,
                            renderLineHighlight: readOnly ? "none" : "line",
                            domReadOnly: readOnly,
                        }}
                    />
                </Panel>
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    {buttons.map((bt, i) => (
                        <Button
                            key={i}
                            onClick={() => model.close({ text: model.editorText, button: bt })}
                        >
                            {bt}
                        </Button>
                    ))}
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(textDialogId, TextDialog as DefaultView);

export function showTextDialog(props: TextDialogProps) {
    const modelState = {
        ...defaultTextDialogProps,
        ...props,
    };

    const model = new TextDialogModel(new TComponentState(modelState));
    return showDialog({
        viewId: textDialogId,
        model,
    }) as Promise<TextDialogResult | undefined>;
}
