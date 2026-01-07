import { nodeUtils } from "../common/node-utils";
import { FileStats } from "../../shared/types";
import { debounce } from "../../shared/utils";

export class FileWatcher {
    private path: string;
    private unWatch: () => void;
    private onChange: () => void;

    stat: FileStats = {
        size: 0,
        mtime: 0,
        exists: false,
    }
    encoding = "utf-8";

    constructor(filePath: string, onChange: () => void) {
        this.path = filePath;
        this.onChange = onChange;
        this.unWatch = nodeUtils.watchFile(this.path, this.onFileChange);
        this.stat = nodeUtils.getFileStats(this.path);
    }

    dispose = () => {
        this.unWatch();
    }

    getTextContent = (encoding?: string): string => {
        const fileData = nodeUtils.loadStringFile(this.path, encoding);
        this.encoding = fileData.encoding;
        return fileData.content;
    }

    get filePath(): string {
        return this.path;
    }

    private onFileChange = (eventType: string) => {
        const newStat = nodeUtils.getFileStats(this.path);
        this.stat = newStat;
        this.onChangeDebounced();
    }

    private onChangeDebounced = debounce(() => {
        this.onChange();
    }, 300);
}