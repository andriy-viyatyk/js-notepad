import { createComponentModelDriver, type ComponentModelDriver } from "../../core/state/model";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { createDepsGate, type DepsGate } from "../../uikit/shared/deps-gate";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import type { ButtonProps } from "../../uikit/Button/ButtonView";
import type { TextFileEditorModelState } from "../text/TextEditorModel";
import { MonacoDiffEditorHostView } from "../shared/MonacoDiffEditorHostView";
import {
    FileDiffBodyModel,
    defaultFileDiffBodyState,
    type FileDiffBodyProps,
    type FileDiffBodyState,
} from "./FileDiffBodyModel";
import type { FileDiffEditor, RevSel } from "./FileDiffEditor";
import "../../uikit/Button/Button.css";

type BodyProjection = Pick<FileDiffBodyState, "fromText" | "toText">;

function selectBodyProjection(state: FileDiffBodyState): BodyProjection {
    return { fromText: state.fromText, toText: state.toText };
}

type HostProjection = Pick<TextFileEditorModelState, "gitRepo" | "language" | "filePath">;

function selectHostProjection(state: TextFileEditorModelState): HostProjection {
    return {
        gitRepo: state.gitRepo,
        language: state.language,
        filePath: state.filePath,
    };
}

const EMPTY_HOST_PROJECTION: HostProjection = {
    gitRepo: undefined,
    language: undefined,
    filePath: undefined,
};

interface FileDiffEmptyViewProps {
    model: FileDiffEditor;
}

class FileDiffEmptyView extends VanillaView<FileDiffEmptyViewProps> {
    private button: ButtonView | undefined;

    public constructor(props: FileDiffEmptyViewProps) {
        super(props, createPanelElement({
            name: "file-diff-empty",
            direction: "column",
            flex: 1,
            align: "center",
            justify: "center",
            gap: "md",
            padding: "xl",
        }));
    }

    protected onMount(): void {
        const message = createTextElement(
            "Nothing to compare — this file isn't in a git repository, or git is unavailable.",
            { color: "light" },
        );
        const button = this.child(new ButtonView(this.buttonProps()));
        this.button = button;
        this.root.append(message, button.root);
        button.mount();
    }

    protected onDispose(): void {
        this.button = undefined;
    }

    private buttonProps(): ButtonProps {
        return {
            onClick: () => void this.props.model.page?.switchMainEditor?.("monaco"),
            children: "Switch to Text Editor",
        };
    }
}

interface FileDiffContentViewProps {
    fromText: string;
    toText: string;
    language: string | undefined;
    readOnly: boolean;
    onDiffMount?: (host: MonacoDiffEditorHostView) => void;
}

class FileDiffContentView extends VanillaView<FileDiffContentViewProps> {
    private readonly diffHost: MonacoDiffEditorHostView;

    public constructor(props: FileDiffContentViewProps) {
        super(props, createPanelElement({
            name: "file-diff-body",
            direction: "column",
            flex: 1,
            overflow: "hidden",
        }));
        this.diffHost = this.child(new MonacoDiffEditorHostView(this.hostProps(props)));
    }

    protected onMount(): void {
        this.root.append(this.diffHost.root);
        this.diffHost.mount();
        // Monaco creates the diff editor in its onMount hook, so getEditor() is
        // valid only after mount has completed.
        this.props.onDiffMount?.(this.diffHost);
    }

    protected onUpdate(props: FileDiffContentViewProps): void {
        this.diffHost.update(this.hostProps(props));
    }

    private hostProps(props: FileDiffContentViewProps) {
        return {
            language: props.language,
            initialOriginal: props.fromText,
            initialModified: props.toText,
            options: {
                // The right side is editable only for the working tree.
                readOnly: props.readOnly,
                originalEditable: false,
                renderSideBySide: true,
                automaticLayout: true,
            },
        };
    }
}

export class FileDiffBodyView extends VanillaView<FileDiffBodyProps> {
    private readonly model: FileDiffEditor;
    private readonly driver: ComponentModelDriver<
        FileDiffBodyState,
        FileDiffBodyProps,
        FileDiffBodyModel
    >;
    private readonly branchRegion: HTMLSpanElement;
    private readonly swap: SubtreeSwap<"empty" | "diff">;
    private readonly diffValuesGate: DepsGate = createDepsGate();
    private readonly languageGate: DepsGate = createDepsGate();
    private bodyProjection: BodyProjection;
    private revision: RevSel;
    private hostProjection: HostProjection = EMPTY_HOST_PROJECTION;
    private boundHost: FileDiffEditor["host"] = null;
    private hostUnsubscribe: (() => void) | undefined;
    private activeKind: "empty" | "diff" | undefined;
    private activeBranch: FileDiffEmptyView | FileDiffContentView | undefined;
    private activeDiffHost: MonacoDiffEditorHostView | undefined;

    public constructor(props: FileDiffBodyProps) {
        super(props, createContentsRoot());
        this.model = props.model;
        this.driver = createComponentModelDriver(
            { model: props.model },
            FileDiffBodyModel,
            defaultFileDiffBodyState,
        );
        this.bodyProjection = selectBodyProjection(this.driver.model.state.get());
        this.revision = props.model.state.get().to;
        this.branchRegion = createContentsRoot();
        this.swap = new SubtreeSwap(this.branchRegion);
        this.root.dataset.type = "file-diff-body";
        this.root.append(this.branchRegion);
        this.own(() => this.swap.dispose());
        this.own(() => this.driver.dispose());
    }

    protected onMount(): void {
        this.driver.mount();
        // bind() owns its unsubscribe and has no early-release operation. The
        // field is replaced only by syncHostBinding(), never by a bind call.
        this.own(() => this.hostUnsubscribe?.());
        this.bind(this.driver.model.state, selectBodyProjection, this.syncBodyProjection);
        this.bind(this.model.state, (state) => state.to, this.syncRevision);
    }

    protected onUpdate(props: FileDiffBodyProps): void {
        if (props.model !== this.model) {
            throw new Error("File Diff body received a different model instance.");
        }
        this.syncHostBinding();
        this.syncCurrentBody();
    }

    protected onDispose(): void {
        this.activeBranch = undefined;
        this.activeKind = undefined;
        this.activeDiffHost = undefined;
        this.boundHost = null;
        this.hostProjection = EMPTY_HOST_PROJECTION;
    }

    private readonly syncBodyProjection = (projection: BodyProjection): void => {
        this.bodyProjection = projection;
        this.syncCurrentBody();
    };

    private readonly syncRevision = (revision: RevSel): void => {
        this.revision = revision;
        this.syncCurrentBody();
    };

    private syncCurrentBody(): void {
        this.syncHostBinding();
        const { fromText, toText } = this.bodyProjection;
        const { filePath, gitRepo, language } = this.hostProjection;
        const branchKey = gitRepo && filePath ? "diff" : "empty";
        const branchChanged = this.syncBranch(branchKey, fromText, toText, language);

        const diffDependencies = [filePath, fromText, gitRepo, toText];
        if (this.diffValuesGate.changed(diffDependencies)) {
            if (gitRepo && filePath) {
                this.activeDiffHost?.setDiffValues(fromText, toText);
            }
        }

        const languageDependencies = [filePath, gitRepo, language];
        if (this.languageGate.changed(languageDependencies)) {
            if (gitRepo && filePath) {
                this.activeDiffHost?.setLanguage(language);
            }
        }

        if (branchChanged) {
            this.diffValuesGate.prime(diffDependencies);
            this.languageGate.prime(languageDependencies);
        }
    }

    private syncHostBinding(): void {
        const host = this.model.host;
        if (host === this.boundHost) return;

        this.hostUnsubscribe?.();
        this.hostUnsubscribe = undefined;
        this.boundHost = host;
        this.hostProjection = host
            ? selectHostProjection(host.state.get())
            : EMPTY_HOST_PROJECTION;

        if (host) {
            this.hostUnsubscribe = this.ownSubscription(host.state.subscribe(
                (projection) => {
                    this.hostProjection = projection;
                    this.syncCurrentBody();
                },
                selectHostProjection,
            ));
        }
    }

    private syncBranch(
        kind: "empty" | "diff",
        fromText: string,
        toText: string,
        language: string | undefined,
    ): boolean {
        if (kind === this.activeKind && this.activeBranch) {
            if (kind === "diff") {
                (this.activeBranch as FileDiffContentView).update(
                    this.contentProps(fromText, toText, language),
                );
            }
            return false;
        }

        if (kind === "empty") {
            this.swap.clear();
            this.activeBranch = undefined;
            this.activeDiffHost = undefined;
        }

        this.activeKind = kind;
        let created: FileDiffEmptyView | FileDiffContentView | undefined;
        try {
            this.swap.set(kind, () => {
                created = kind === "empty"
                    ? new FileDiffEmptyView({ model: this.model })
                    : new FileDiffContentView({
                        ...this.contentProps(fromText, toText, language),
                        onDiffMount: this.handleDiffMount,
                    });
                this.activeBranch = created;
                return created;
            });
            if (!created) return true;
            created.mount();
            return true;
        } catch (mountError) {
            this.activeBranch = undefined;
            this.activeKind = undefined;
            this.activeDiffHost = undefined;
            try {
                this.swap.clear();
            } catch {
                // Preserve the original branch mount failure.
            }
            throw mountError;
        }
    }

    private contentProps(
        fromText: string,
        toText: string,
        language: string | undefined,
    ): FileDiffContentViewProps {
        return {
            fromText,
            toText,
            language,
            readOnly: this.revision.kind !== "unstaged",
        };
    }

    private readonly handleDiffMount = (host: MonacoDiffEditorHostView): void => {
        this.activeDiffHost = host;
        this.driver.model.onDiffMount(host);
    };
}

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}
