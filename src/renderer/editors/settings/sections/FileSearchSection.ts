import { settings } from "../../../api/settings";
import { TextareaView } from "../../../uikit/Textarea/TextareaView";
import type { TextareaProps } from "../../../uikit/Textarea/TextareaView";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { createSectionRoot, panel, text } from "./settings-native";
import "../../../uikit/Textarea/Textarea.css";

export class FileSearchSectionView extends VanillaView<Record<string, never>> {
    private extensionsTextarea: TextareaView | undefined;
    private excludeTextarea: TextareaView | undefined;
    private extensionsValue = "";
    private excludeValue = "";

    public constructor(props: Record<string, never>) {
        super(props, createSectionRoot("settings-section"));
    }

    protected onMount(): void {
        const searchExtensions = settings.get("search-extensions");
        const searchExclude = settings.get("search-exclude");
        this.extensionsValue = searchExtensions.join(", ");
        this.excludeValue = searchExclude.join(", ");

        this.root.append(
            panel({ paddingBottom: "lg" }, text("File Search", { bold: true, size: "sm" })),
            panel(
                { paddingBottom: "md" },
                text("File extensions included in content search (comma-separated)", { color: "light", size: "xs" }),
            ),
        );

        this.extensionsTextarea = this.child(new TextareaView(this.textareaProps(
            this.extensionsValue,
            (value) => { this.extensionsValue = value; },
            () => this.saveExtensions(),
        )));
        this.root.append(this.extensionsTextarea.root);
        this.extensionsTextarea.mount();

        this.root.append(panel(
            { paddingTop: "lg", paddingBottom: "md" },
            text(
                "Folders and globs always skipped (comma-separated). Never applied to the search root itself, so searching inside one of these folders still works",
                { color: "light", size: "xs" },
            ),
        ));

        this.excludeTextarea = this.child(new TextareaView(this.textareaProps(
            this.excludeValue,
            (value) => { this.excludeValue = value; },
            () => this.saveExclude(),
        )));
        this.root.append(this.excludeTextarea.root);
        this.excludeTextarea.mount();

        const subscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "search-extensions") this.syncExtensions();
            if (key === "search-exclude") this.syncExclude();
        });
        this.own(() => subscription.dispose());
    }

    protected onDispose(): void {
        this.extensionsTextarea = undefined;
        this.excludeTextarea = undefined;
    }

    private textareaProps(value: string, onChange: (value: string) => void, onBlur: () => void): TextareaProps {
        return {
            value,
            onChange,
            onBlur,
            singleLine: true,
            maxHeight: 200,
            size: "sm",
        };
    }

    private syncExtensions(): void {
        this.extensionsValue = settings.get("search-extensions").join(", ");
        this.extensionsTextarea?.update(this.textareaProps(
            this.extensionsValue,
            (value) => { this.extensionsValue = value; },
            () => this.saveExtensions(),
        ));
    }

    private syncExclude(): void {
        this.excludeValue = settings.get("search-exclude").join(", ");
        this.excludeTextarea?.update(this.textareaProps(
            this.excludeValue,
            (value) => { this.excludeValue = value; },
            () => this.saveExclude(),
        ));
    }

    private saveExtensions(): void {
        settings.set("search-extensions", this.extensionsValue.split(",").map((item) => item.trim()).filter(Boolean));
    }

    private saveExclude(): void {
        settings.set("search-exclude", this.excludeValue.split(",").map((item) => item.trim()).filter(Boolean));
    }
}

export { FileSearchSectionView as FileSearchSection };
