import { editorRegistry, type EditorOrHost } from "../../editors/base";
import type { EditorModel } from "../../editors/base/EditorModel";
import type { EditorViewModule, FileEditorComponent } from "../../editors/types";
import { parseBoardEditorId } from "../../editors/board/custom-editor-registry";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { AsyncEditorView } from "./AsyncEditorView";

export interface RenderEditorViewProps { model: EditorModel; }

export class RenderEditorView extends VanillaView<RenderEditorViewProps> {
    private asyncEditor: AsyncEditorView;
    private modelId: string;

    public constructor(props: RenderEditorViewProps) {
        super(props);
        this.root.style.display = "contents";
        this.modelId = props.model.id;
        this.asyncEditor = this.child(new AsyncEditorView(this.asyncProps(props.model)));
    }

    protected onMount(): void {
        this.root.append(this.asyncEditor.root);
        this.asyncEditor.mount();
    }

    protected onUpdate(props: RenderEditorViewProps): void {
        if (props.model.id !== this.modelId) {
            this.asyncEditor.dispose();
            this.asyncEditor.root.remove();
            this.modelId = props.model.id;
            this.asyncEditor = this.child(new AsyncEditorView(this.asyncProps(props.model)));
            this.root.append(this.asyncEditor.root);
            this.asyncEditor.mount();
            return;
        }
        this.asyncEditor.update(this.asyncProps(props.model));
    }

    private asyncProps(model: EditorModel) {
        const editorId = model.editorId;
        return {
            getEditorModule: getEditorModule(editorId),
            model: model as unknown as EditorOrHost,
            cacheKey: editorId,
        };
    }
}

const getEditorModule = (editorId: string) => async (): Promise<EditorViewModule> => {
    const defId = parseBoardEditorId(editorId) !== null ? "board-view" : editorId;
    const def = editorRegistry.getById(defId);
    if (!def) throw new Error(`No editor registered for id: ${editorId}`);
    const module = await def.loadModule();
    return { Editor: module.Component as unknown as FileEditorComponent };
};
