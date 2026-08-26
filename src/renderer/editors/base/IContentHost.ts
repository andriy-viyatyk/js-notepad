import type { IState } from "../../core/state/state";
import type { HostDescriptor } from "../../../shared/persistence";
import type { MenuItem } from "../../uikit";

/** Minimal reactive state every host exposes. */
export interface IContentHostState {
    /** UTF-8 string. Editors parse/serialize as needed. */
    content: string;
    /** Monaco language id (e.g. "json", "markdown", "plaintext"). */
    language?: string;
}

export interface IContentHost {
    /** Stable identifier for the host itself. NOT the cache-file key — cache
     *  files are keyed by the wrapping editor's id (which transfers on switch).
     *  This id is for host-internal identification only. */
    readonly id: string;

    readonly state: IState<IContentHostState>;

    /** Mutate content. `byUser` differentiates user edits from programmatic
     *  changes (script writes, auto-formatting, reload). */
    changeContent(content: string, byUser?: boolean): void;

    changeLanguage(language: string | undefined): void;

    /** Release host-owned resources. Called by the owning editor's dispose()
     *  ONLY IF the host was not extracted. A switched-out host is owned by
     *  its new editor.
     *
     *  Does NOT clean cache files — that's the page's responsibility,
     *  triggered when an editor's id is finally released (no successor). */
    dispose(): Promise<void>;

    /** Serialize the host into a `HostDescriptor` for persistence. Returned
     *  as the `host` field of the wrapping editor's `EditorDescriptor`. */
    getDescriptor(): HostDescriptor;

    /** Optional root-level keystroke handler. Called by `<TextChrome>`'s
     *  outer panel `onKeyDown` so the chrome doesn't need to know the host
     *  class. `TextFileModel` will delegate Ctrl+S / Ctrl+Shift+S / F5 / F2
     *  to its actions submodel; `NoteItemEditModel` may implement a subset. */
    handleKeyDown?(e: KeyboardEvent): void;

    /** Optional context-menu items contributed to the page tab on behalf of the
     *  wrapping editor. `TextFileModel` returns the Save / Rename / encryption
     *  group; surfaced through `EditorModel.onGetMenuItems()`. */
    onGetMenuItems?(): MenuItem[];

    getEditorState<T>(editorId: string): T | undefined;

    /**
     * Persist this editor's view-state slot (HS1 — 2026-05-21). Sync.
     * Stored on the host's persistent state; survives editor switches
     * (host outlives the editor) AND app restarts (rides host descriptor
     * in `openFiles.txt`).
     *
     * Editor side calls this from a `state.subscribe` mirror set up in
     * `adoptHost` so every view-config change propagates to the slot.
     */
    setEditorState<T>(editorId: string, value: T): void;
}
