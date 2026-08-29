import * as monaco from "monaco-editor";
import type { TextFileEditorModelState, TextFileModel } from "../text";
import { pagesModel } from "../../api/pages";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { createToolbarElement } from "../../uikit/Toolbar/toolbar-style";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { MonacoDiffEditorHostView } from "../shared/MonacoDiffEditorHostView";

export interface CompareEditorProps {
    model: TextFileModel;
    groupedModel: TextFileModel;
    /** The left page's id — needed to exit compare mode on the pair. CK10. */
    leftPageId: string;
}

interface CompareProjection {
    content: string;
    language?: string;
    filePath?: string;
    title: string;
}

function selectCompareProjection(state: TextFileEditorModelState): CompareProjection {
    return {
        content: state.content,
        language: state.language,
        filePath: state.filePath,
        title: state.title,
    };
}

function compareLabel(projection: CompareProjection): string {
    return projection.filePath || projection.title;
}

export class CompareEditor extends VanillaView<CompareEditorProps> {
    private model: TextFileModel;
    private groupedModel: TextFileModel;
    private leftPageId: string;
    private modelSubscription: (() => void) | undefined;
    private groupedModelSubscription: (() => void) | undefined;
    private originalModel: monaco.editor.ITextModel | undefined;
    private modifiedModel: monaco.editor.ITextModel | undefined;
    private currentLanguage: string | undefined;

    private readonly leftLabel: HTMLSpanElement;
    private readonly rightLabel: HTMLSpanElement;
    private readonly exitButton: IconButtonView;
    private readonly diffHost: MonacoDiffEditorHostView;

    public constructor(props: CompareEditorProps) {
        super(
            props,
            createPanelElement({
                name: "compare-root",
                direction: "column",
                flex: true,
                overflow: "hidden",
            }),
        );
        this.model = props.model;
        this.groupedModel = props.groupedModel;
        this.leftPageId = props.leftPageId;

        const initialLeftLabel = compareLabel(selectCompareProjection(props.model.state.get()));
        const initialRightLabel = compareLabel(selectCompareProjection(props.groupedModel.state.get()));
        this.leftLabel = createTextElement(initialLeftLabel, { truncate: true, color: "light" });
        this.leftLabel.dir = "rtl";
        this.leftLabel.title = initialLeftLabel;
        this.rightLabel = createTextElement(initialRightLabel, { truncate: true, color: "light" });
        this.rightLabel.dir = "rtl";
        this.rightLabel.title = initialRightLabel;

        this.exitButton = this.child(new IconButtonView({
            name: "compare-exit",
            size: "sm",
            title: "Exit Compare Mode",
            icon: "compare",
            onClick: () => pagesModel.exitCompareMode(this.leftPageId),
        }));
        this.diffHost = this.child(new MonacoDiffEditorHostView({
            options: {
                readOnly: false,
                renderSideBySide: true,
                automaticLayout: true,
            },
        }));

        const leftPanel = createPanelElement(
            { flex: 1, overflow: "hidden", justify: "end" },
            [this.leftLabel],
        );
        const rightPanel = createPanelElement({ flex: 1, overflow: "hidden" }, [this.rightLabel]);
        const separator = createTextElement("→", { size: "xl", color: "light" });
        const toolbar = createToolbarElement({
            orientation: "horizontal",
            background: "dark",
            borderBottom: true,
        });
        toolbar.append(leftPanel, separator, rightPanel, this.exitButton.root);
        this.root.append(toolbar, this.diffHost.root);
    }

    protected onMount(): void {
        this.exitButton.mount();
        this.diffHost.mount();
        this.bindModels(this.model, this.groupedModel);
        this.diffHost.listenToModifiedContent(() => {
            const modifiedEditor = this.diffHost.editor?.getModifiedEditor();
            if (!modifiedEditor) return;
            const newValue = modifiedEditor.getValue();
            this.groupedModel.changeContent(newValue, true);
        });
        this.own(() => {
            this.modelSubscription?.();
            this.groupedModelSubscription?.();
            this.modelSubscription = undefined;
            this.groupedModelSubscription = undefined;
        });
    }

    protected onUpdate(props: CompareEditorProps): void {
        const modelChanged = this.model !== props.model || this.groupedModel !== props.groupedModel;
        this.leftPageId = props.leftPageId;
        if (!modelChanged) return;
        this.bindModels(props.model, props.groupedModel);
    }

    private bindModels(model: TextFileModel, groupedModel: TextFileModel): void {
        this.modelSubscription?.();
        this.groupedModelSubscription?.();
        this.model = model;
        this.groupedModel = groupedModel;

        const leftProjection = selectCompareProjection(model.state.get());
        const rightProjection = selectCompareProjection(groupedModel.state.get());
        const language = leftProjection.language;

        const previousModels = [this.originalModel, this.modifiedModel].filter(
            (model): model is monaco.editor.ITextModel => model !== undefined,
        );
        if (previousModels.length > 0) {
            // The widget defers disposal of its previous model references. Keep
            // the host-owned models alive until that macrotask has run.
            this.diffHost.setModel(null);
            this.diffHost.releaseOwnedModels(previousModels);
        }

        this.originalModel = this.diffHost.createModel(leftProjection.content, language);
        this.modifiedModel = this.diffHost.createModel(rightProjection.content, language);
        this.currentLanguage = undefined;
        this.diffHost.setModel({
            original: this.originalModel,
            modified: this.modifiedModel,
        }, "owned");
        this.applyLeftProjection(leftProjection);
        this.applyRightProjection(rightProjection);

        this.modelSubscription = this.ownSubscription(model.state.subscribe(
            (projection) => this.applyLeftProjection(projection),
            selectCompareProjection,
        ));
        this.groupedModelSubscription = this.ownSubscription(groupedModel.state.subscribe(
            (projection) => this.applyRightProjection(projection),
            selectCompareProjection,
        ));
    }

    private applyLeftProjection(projection: CompareProjection): void {
        this.updateLabel(this.leftLabel, compareLabel(projection));
        if (this.originalModel && this.originalModel.getValue() !== projection.content) {
            this.originalModel.setValue(projection.content);
        }
        if (!this.originalModel || !this.modifiedModel || !projection.language) return;
        if (this.currentLanguage === projection.language) return;
        monaco.editor.setModelLanguage(this.originalModel, projection.language);
        monaco.editor.setModelLanguage(this.modifiedModel, projection.language);
        this.currentLanguage = projection.language;
    }

    private applyRightProjection(projection: CompareProjection): void {
        this.updateLabel(this.rightLabel, compareLabel(projection));
        if (this.modifiedModel && this.modifiedModel.getValue() !== projection.content) {
            this.modifiedModel.setValue(projection.content);
        }
    }

    private updateLabel(element: HTMLSpanElement, label: string): void {
        element.textContent = label;
        element.title = label;
    }
}
