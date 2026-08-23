import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { showDialog } from "./Dialogs";
import { registerDialogView } from "./dialog-view-registry";
import { TextDialogView } from "./TextDialogView";

export const textDialogId = Symbol("textDialog");

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

export class TextDialogModel extends TDialogModel<TextDialogProps, TextDialogResult | undefined> {
    editorText: string;

    constructor(state: TComponentState<TextDialogProps>) {
        super(state);
        this.editorText = state.get().text || "";
    }

    handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            void this.close(undefined);
        }
    };

    handleEditorChange = (value: string | undefined) => {
        this.editorText = value || "";
    };
}

registerDialogView(textDialogId, TextDialogView);

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
