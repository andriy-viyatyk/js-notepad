import { TComponentState } from "../../core/state/state";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Button } from "../../uikit/Button";
import { IconButton } from "../../uikit/IconButton";
import { Spacer } from "../../uikit/Spacer";
import { PlusIcon, DeleteIcon, BoardIcon } from "../../theme/icons";
import { projectTrust } from "../../api/project-trust";
import { ui } from "../../api/ui";
import { showTrustProjectDialog } from "../../ui/dialogs/TrustProjectDialog";
import { showInputDialog } from "../../ui/dialogs/InputDialog";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import { decodePersephoneFolderLink } from "../../content/persephone-folder-link";
import { fpJoin } from "../../core/utils/file-path";
import {
    BoardEditorModel,
    getDefaultBoardEditorState,
    type BoardEditorState,
} from "./BoardEditorModel";
import { UntrustedProjectView } from "./UntrustedProjectView";
import { BoardWebview } from "./BoardWebview";
import type { EditorModule } from "../types";
import type { EditorOrHost } from "../base";
import type { EditorType, IEditorState } from "../../../shared/types";

// =============================================================================
// Component — board management + host region (US-722). Gated by the per-project
// trust gate (US-721): an untrusted project shows the placeholder + Trust
// button. Trusted: a board list with create/delete; selecting a board shows the
// host region (a placeholder until the board:// webview lands in US-723).
// =============================================================================

export function BoardEditorView({ model }: { model: BoardEditorModel }) {
    const s = model.state.use((st) => ({
        persephonePath: st.persephonePath,
        boards: st.boards,
        selectedBoard: st.selectedBoard,
        reloadToken: st.reloadToken,
        title: st.title,
    }));
    const trusted = projectTrust.useIsTrusted(s.persephonePath);

    if (!trusted) {
        return (
            <UntrustedProjectView
                path={s.persephonePath}
                onTrust={async () => {
                    if (await showTrustProjectDialog(s.persephonePath)) {
                        await projectTrust.trust(s.persephonePath);
                    }
                }}
            />
        );
    }

    const handleCreate = async () => {
        const res = await showInputDialog({
            title: "Create board",
            message: "Board name (becomes the folder name):",
            value: "",
            buttons: ["Create", "Cancel"],
        });
        if (res?.button !== "Create") return;
        const name = res.value.trim();
        if (!name) return;
        try {
            await model.createBoard(name);
        } catch (err) {
            ui.notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const handleDelete = async (name: string) => {
        const answer = await showConfirmationDialog({
            title: "Delete board",
            message: `Delete board "${name}"? This permanently removes its folder and all its files.`,
            buttons: ["Delete", "Cancel"],
        });
        if (answer !== "Delete") return;
        await model.deleteBoard(name);
    };

    // A selected board takes the full editor area — no toolbar (the board owns its
    // own page). Back to the list is via the side-panel ">" button.
    if (s.selectedBoard) {
        return (
            <Panel direction="column" flex={1} width="100%">
                <BoardWebview
                    key={`${s.selectedBoard}__${s.reloadToken}`}
                    model={model}
                    boardRoot={fpJoin(s.persephonePath, "boards", s.selectedBoard)}
                />
            </Panel>
        );
    }

    return (
        <Panel direction="column" flex={1} width="100%">
            {/* Toolbar (board list) */}
            <Panel
                name="board-toolbar"
                direction="row"
                gap="sm"
                align="center"
                background="dark"
                borderBottom
                shrink={false}
                paddingX="sm"
                paddingY="xs"
            >
                <Text size="md">{s.title}</Text>
                <Spacer />
                <Button name="board-create" size="sm" icon={<PlusIcon />} onClick={() => void handleCreate()}>
                    New board
                </Button>
            </Panel>

            {/* Body */}
            {s.boards.length === 0 ? (
                <Panel flex={1} direction="column" align="center" justify="center" gap="md" padding="xl">
                    <Text color="light" align="center">No boards yet. Create one to get started.</Text>
                    <Button
                        name="board-create-empty"
                        variant="primary"
                        icon={<PlusIcon />}
                        onClick={() => void handleCreate()}
                    >
                        Create board
                    </Button>
                </Panel>
            ) : (
                <Panel flex={1} align="center" justify="center" overflow="auto" paddingY="lg">
                    <Panel direction="column" align="center" gap="sm" width="100%">
                        {s.boards.map((name) => (
                            <Panel
                                key={name}
                                name="board-tile"
                                direction="row"
                                align="center"
                                gap="sm"
                                width="50%"
                                height={34}
                                paddingX="lg"
                                border
                                rounded="md"
                                borderColor="subtle"
                                clickable
                                onClick={() => model.selectBoard(name)}
                                revealChildrenOnHover
                            >
                                <BoardIcon width={16} height={16} />
                                <Panel flex={1} overflow="hidden" minWidth={0}>
                                    <Text size="sm" truncate title={name}>{name}</Text>
                                </Panel>
                                <IconButton
                                    name="board-tile-delete"
                                    size="sm"
                                    title="Delete board"
                                    icon={<DeleteIcon />}
                                    hideUntilParentHover
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void handleDelete(name);
                                    }}
                                />
                            </Panel>
                        ))}
                    </Panel>
                </Panel>
            )}
        </Panel>
    );
}

// =============================================================================
// Legacy EditorModule default export — consumed by `buildEditorById`
// (navigatePageTo path) and session restore.
// =============================================================================

const boardEditorModule: EditorModule = {
    Editor: BoardEditorView as unknown as EditorModule["Editor"],

    newEditorModel: async (filePath?: string) => {
        const model = new BoardEditorModel(new TComponentState(getDefaultBoardEditorState()));
        if (filePath) {
            const link = decodePersephoneFolderLink(filePath);
            if (link) model.initFromPersephone(link.persephonePath);
        }
        return model as unknown as EditorOrHost;
    },

    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "boardPage") return null;
        return new BoardEditorModel(
            new TComponentState(getDefaultBoardEditorState()),
        ) as unknown as EditorOrHost;
    },

    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const model = new BoardEditorModel(
            new TComponentState({
                ...getDefaultBoardEditorState(),
                ...(state as Partial<BoardEditorState>),
            }),
        );
        // Session restore: persephonePath rides the persisted state — re-init.
        await model.restore();
        return model as unknown as EditorOrHost;
    },
};

export default boardEditorModule;
