import React from "react";
import { TComponentState } from "../../core/state/state";
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
} from "../base/v4/EditorModel";
import { FolderIcon } from "../../components/icons/FileIcon";
import { fpBasename } from "../../core/utils/file-path";
import {
    decodeCategoryLink,
    encodeCategoryLink,
    type ITreeProviderLink,
} from "../../content/tree-providers/tree-provider-link";

/**
 * EPIC-028 / US-576 — native v4 Category (Folder View) editor. NO-HOST editor
 * (no `CONTENT_HOST_TRAIT`) and a tree-provider CONSUMER — it reads a sibling
 * host's `treeProvider` from `page.panelEditors` (Link / Explorer / Archive) and
 * renders a `CategoryView`. Owns NO `treeProvider` and contributes no panel.
 *
 * Realizes walkthrough 03 / N5: cross-editor reactivity lives in the VIEW
 * (`CategoryEditor.tsx` subscribes to `page.state` via `useOptionalState`); the
 * model-side `onSecondaryEditorsChanged` / `_providerVersion` duck-type hook is
 * deleted.
 *
 * Class name kept as `CategoryEditorModel` (the view file owns the
 * `CategoryEditor` name) — re-parented in place, no rename/alias (CT-IMPL1;
 * follows MCP MC-C1).
 *
 * Design rationale: doc/tasks/US-576-category-editor-migration/README.md.
 */

export interface CategoryEditorModelState extends EditorStateBase {
    type: "categoryPage";
}

export function getDefaultCategoryEditorModelState(): CategoryEditorModelState {
    return {
        id: crypto.randomUUID(),
        title: "",
        modified: false,
        type: "categoryPage",
        filePath: "",
    };
}

export class CategoryEditorModel extends V4EditorModel<CategoryEditorModelState> {
    /** v4 editor identity. Matches the legacy registry id so v4
     *  `EditorDescriptor.editorId` and pre-US-576 saved descriptors
     *  (`deriveEditorId({type:"categoryPage"}) === "category-view"`) agree. */
    readonly editorId = "category-view";

    noLanguage = true;

    constructor(state?: TComponentState<CategoryEditorModelState>) {
        super(state ?? new TComponentState(getDefaultCategoryEditorModelState()));
        this.getIcon = () => React.createElement(
            "span",
            { style: { display: "inline-block", transform: "translate(-2px, -3px)" } },
            React.createElement(FolderIcon),
        );
    }

    /** Decoded category path from the tree-category:// link in filePath. */
    get categoryPath(): string {
        const link = this.decodedLink;
        return link?.category ?? "";
    }

    /** Decoded link metadata. Null if filePath is not a valid tree-category:// link. */
    get decodedLink(): ITreeProviderLink | null {
        const filePath = this.state.get().filePath;
        if (!filePath) return null;
        return decodeCategoryLink(filePath);
    }

    /** Initialize from an ITreeProviderLink (sets filePath and title). */
    initFromLink(link: ITreeProviderLink): void {
        const title = fpBasename(link.category) || link.category || "Folder";
        this.state.update((s) => {
            s.title = title;
            s.filePath = encodeCategoryLink(link);
        });
    }
}
