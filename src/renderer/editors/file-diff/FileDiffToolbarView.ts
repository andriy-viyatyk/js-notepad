import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import type { FileDiffEditor, FileDiffEditorState } from "./FileDiffEditor";
import { RevisionPickerView } from "./RevisionPickerView";

type FileDiffToolbarProjection = Pick<FileDiffEditorState, "from" | "to" | "hasStaged">;

function selectToolbarProjection(state: FileDiffEditorState): FileDiffToolbarProjection {
    return { from: state.from, to: state.to, hasStaged: state.hasStaged };
}

export class FileDiffToolbarView extends VanillaView<{ model: FileDiffEditor }> {
    private readonly model: FileDiffEditor;
    private readonly fromPicker: RevisionPickerView;
    private readonly toPicker: RevisionPickerView;

    public constructor(props: { model: FileDiffEditor }) {
        super(props, createPanelElement({ align: "center", gap: "xs" }));
        this.model = props.model;
        const projection = selectToolbarProjection(props.model.state.get());
        const fromPicker = this.child(new RevisionPickerView(this.pickerProps("from", projection)));
        const toPicker = this.child(new RevisionPickerView(this.pickerProps("to", projection)));
        this.fromPicker = fromPicker;
        this.toPicker = toPicker;
        this.root.append(
            createTextElement("From", { size: "sm", color: "light" }),
            fromPicker.root,
            createTextElement("→", { size: "sm", color: "light" }),
            toPicker.root,
        );
    }

    protected onMount(): void {
        this.fromPicker.mount();
        this.toPicker.mount();
        this.bind(this.model.state, selectToolbarProjection, this.syncProjection);
    }

    protected onUpdate(props: { model: FileDiffEditor }): void {
        if (props.model !== this.model) {
            throw new Error("File Diff toolbar received a different model instance.");
        }
        this.syncProjection(selectToolbarProjection(props.model.state.get()));
    }

    private readonly syncProjection = (projection: FileDiffToolbarProjection): void => {
        this.fromPicker.update(this.pickerProps("from", projection));
        this.toPicker.update(this.pickerProps("to", projection));
    };

    private pickerProps(
        side: "from" | "to",
        projection: FileDiffToolbarProjection,
    ): ConstructorParameters<typeof RevisionPickerView>[0] {
        return {
            side,
            picker: this.model.fileTree,
            value: side === "from" ? projection.from : projection.to,
            showStaged: projection.hasStaged,
            onPick: side === "from" ? this.model.setFrom : this.model.setTo,
        };
    }
}
