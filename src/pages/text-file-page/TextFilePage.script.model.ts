import { TModel } from "../../common/classes/model";
import { TComponentState } from "../../common/classes/state";
import { parseObject } from "../../common/parseUtils";
import { debounce } from "../../common/utils";
import { filesModel } from "../../model/files-model";

export const defaultTextPageScriptState = {
    content: "return page.content",
    open: false,
    height: 160,
}

export type TextPageScriptState = typeof defaultTextPageScriptState;

export class TextPageScriptModel extends TModel<TextPageScriptState> {
    private unsubscribe: (() => void) | undefined = undefined;
    private skipSave = false;
    id: string | undefined = undefined;
    name = "script";

    constructor() {
        super(new TComponentState(defaultTextPageScriptState));
        this.unsubscribe = this.state.subscribe(this.saveStateDebounced);
    }

    restore = async (id: string) => {
        this.id = id;
        const data = await filesModel.getCacheFile(id, this.name);
        const newState = parseObject(data) || defaultTextPageScriptState;
        this.skipSave = true;
        this.state.set({
            ...defaultTextPageScriptState,
            ...newState
        });
    }

    private saveState = async (): Promise<void> => {
        if (this.skipSave) {
            this.skipSave = false;
            return;
        }
        if (!this.id) {
            return;
        }

        const state = this.state.get();
        await filesModel.saveCacheFile(this.id, JSON.stringify(state), this.name);
    }

    private saveStateDebounced = debounce(this.saveState, 500);

    destroy = () => {
        this.unsubscribe?.();
    }

    changeContent = (newContent: string) => {
        this.state.update((s) => {
            s.content = newContent;
        });
    }

    toggleOpen = () => {
        this.state.update((s) => {
            s.open = !s.open;
        });
    }

    setHeight = (height: number) => {
        this.state.update((s) => {
            s.height = height;
        });
    }
}