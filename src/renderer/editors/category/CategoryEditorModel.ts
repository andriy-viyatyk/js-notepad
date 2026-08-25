import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
} from "../base/EditorModel";
import { createFolderIconElement } from "../../components/icons/icon-elements";
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
    }

    getIconElement = (): HTMLElement => {
        const wrapper = document.createElement("span");
        wrapper.style.display = "inline-block";
        wrapper.style.transform = "translate(-2px, -3px)";
        wrapper.append(createFolderIconElement());
        return wrapper;
    };

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
