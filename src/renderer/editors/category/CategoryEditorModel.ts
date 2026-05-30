import React from "react";
import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
} from "../base/EditorModel";
import { FolderIcon } from "../../components/icons/FileIcon";
import { fpBasename } from "../../core/utils/file-path";
import {
    decodeCategoryLink,
    encodeCategoryLink,
    type ITreeProviderLink,
} from "../../content/tree-providers/tree-provider-link";

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

export class CategoryEditorModel extends EditorModel<CategoryEditorModelState> {
    /** Editor identity. Matches `EditorDescriptor.editorId`. */
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
