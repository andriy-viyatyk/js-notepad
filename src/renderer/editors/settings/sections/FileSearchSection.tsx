import { useCallback, useRef } from "react";
import { settings } from "../../../api/settings";
import { Panel } from "../../../uikit/Panel";
import { Text } from "../../../uikit/Text";
import { Textarea } from "../../../uikit/Textarea";
import type { TextareaRef } from "../../../uikit/Textarea";

export function FileSearchSection() {
    const searchExtensions = settings.use("search-extensions");
    const searchExclude = settings.use("search-exclude");
    const extensionsRef = useRef<TextareaRef>(null);
    const excludeRef = useRef<TextareaRef>(null);

    const handleExtensionsBlur = useCallback(() => {
        const value = extensionsRef.current?.getText() ?? "";
        settings.set("search-extensions", value.split(",").map((item) => item.trim()).filter(Boolean));
    }, []);

    const handleExcludeBlur = useCallback(() => {
        const value = excludeRef.current?.getText() ?? "";
        settings.set("search-exclude", value.split(",").map((item) => item.trim()).filter(Boolean));
    }, []);

    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">File Search</Text></Panel>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">File extensions included in content search (comma-separated)</Text>
            </Panel>
            <Textarea
                ref={extensionsRef}
                singleLine
                value={searchExtensions.join(", ")}
                onBlur={handleExtensionsBlur}
                maxHeight={200}
                size="sm"
            />
            <Panel paddingTop="lg" paddingBottom="md">
                <Text color="light" size="xs">
                    Folders and globs always skipped (comma-separated). Never applied to the
                    search root itself, so searching inside one of these folders still works
                </Text>
            </Panel>
            <Textarea
                ref={excludeRef}
                singleLine
                value={searchExclude.join(", ")}
                onBlur={handleExcludeBlur}
                maxHeight={200}
                size="sm"
            />
        </>
    );
}
