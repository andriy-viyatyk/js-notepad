import { debounce, windowUtils } from "../common/utils";
import { FileStats } from "../shared/types";

export class FileWatcher {
    private path: string;
    private unWatch: () => void;
    private onChange: () => void;
    stat: FileStats = {
        size: 0,
        mtime: 0,
        exists: false,
    }

    constructor(filePath: string, onChange: () => void) {
        this.path = filePath;
        this.onChange = onChange;
        this.unWatch = windowUtils.fs.watchFile(this.path, this.onFileChange);
        this.stat = windowUtils.fs.getFileStats(this.path);
    }

    dispose = () => {
        this.unWatch();
    }

    getTextContent = (): string => {
        return windowUtils.fs.loadStringFile(this.path);
    }

    get filePath(): string {
        return this.path;
    }

    private onFileChange = (eventType: string) => {
        const newStat = windowUtils.fs.getFileStats(this.path);
        this.stat = newStat;
        this.onChangeDebounced();
    }

    private onChangeDebounced = debounce(() => {
        this.onChange();
    }, 300);
}