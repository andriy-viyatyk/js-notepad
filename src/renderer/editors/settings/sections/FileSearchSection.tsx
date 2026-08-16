import { useCallback, useEffect, useRef } from "react";
import { settings } from "../../../api/settings";
import { Panel } from "../../../uikit/Panel";
import { Text } from "../../../uikit/Text";
import { Textarea } from "../../../uikit/Textarea";

export function FileSearchSection() {
    const searchExtensions = settings.use("search-extensions");
    const searchExclude = settings.use("search-exclude");
    const extensionsValue = useRef(searchExtensions.join(", "));
    const excludeValue = useRef(searchExclude.join(", "));

    useEffect(() => {
        extensionsValue.current = searchExtensions.join(", ");
    }, [searchExtensions]);
    useEffect(() => {
        excludeValue.current = searchExclude.join(", ");
    }, [searchExclude]);

    const handleExtensionsBlur = useCallback(() => {
        const value = extensionsValue.current;
        settings.set("search-extensions", value.split(",").map((item) => item.trim()).filter(Boolean));
    }, []);

    const handleExcludeBlur = useCallback(() => {
        const value = excludeValue.current;
        settings.set("search-exclude", value.split(",").map((item) => item.trim()).filter(Boolean));
    }, []);

    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">File Search</Text></Panel>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">File extensions included in content search (comma-separated)</Text>
            </Panel>
            <Textarea
                onChange={(value) => { extensionsValue.current = value; }}
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
                onChange={(value) => { excludeValue.current = value; }}
                singleLine
                value={searchExclude.join(", ")}
                onBlur={handleExcludeBlur}
                maxHeight={200}
                size="sm"
            />
        </>
    );
}
