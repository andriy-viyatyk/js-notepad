import { useCallback, useMemo } from "react";
import { Editor } from "@monaco-editor/react";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Tag } from "../../uikit/Tag";
import { Input } from "../../uikit/Input";
import { Textarea } from "../../uikit/Textarea";
import { Checkbox } from "../../uikit/Checkbox";
import { Select } from "../../uikit/Select";
import { IListBoxItem } from "../../uikit/ListBox";
import { McpToolInfo } from "./McpInspectorEditorModel";

const CODE_FIELD_PATTERNS = /^(script|code|content|body|query|json|yaml|xml|source|template|expression|command)$/i;

function isCodeLikeField(name: string): boolean {
    return CODE_FIELD_PATTERNS.test(name);
}

function getSchemaType(schema: any): string {
    if (!schema) return "string";
    if (schema.type) return schema.type;
    if (schema.enum) return "enum";
    return "string";
}

interface ToolArgFormProps {
    schema: McpToolInfo["inputSchema"];
    args: Record<string, string>;
    onArgChange: (name: string, value: string) => void;
    disabled?: boolean;
}

export function ToolArgForm({ schema, args, onArgChange, disabled }: ToolArgFormProps) {
    // Wrap in useMemo so identity is stable when schema.properties is present;
    // otherwise the `|| {}` fallback creates a fresh object every render and
    // makes the propEntries useMemo below recompute unnecessarily.
    const properties = useMemo(() => schema.properties || {}, [schema.properties]);
    const requiredFields = useMemo(() => new Set(schema.required || []), [schema.required]);
    const propEntries = useMemo(() => Object.entries(properties), [properties]);

    if (propEntries.length === 0) {
        return <Text size="md" color="light" italic>No arguments</Text>;
    }

    return (
        <Panel direction="column" gap="lg">
            {propEntries.map(([name, propSchema]) => (
                <ArgField
                    key={name}
                    name={name}
                    propSchema={propSchema as any}
                    required={requiredFields.has(name)}
                    value={args[name] || ""}
                    onChange={onArgChange}
                    disabled={disabled}
                />
            ))}
        </Panel>
    );
}

interface ArgFieldProps {
    name: string;
    propSchema: any;
    required: boolean;
    value: string;
    onChange: (name: string, value: string) => void;
    disabled?: boolean;
}

function ArgField({ name, propSchema, required, value, onChange, disabled }: ArgFieldProps) {
    const type = getSchemaType(propSchema);
    const description = propSchema?.description;
    const isBoolean = type === "boolean";

    const handleChange = useCallback(
        (v: string) => onChange(name, v),
        [name, onChange],
    );

    const handleEditorChange = useCallback(
        (v: string | undefined) => onChange(name, v || ""),
        [name, onChange],
    );

    const handleCheckboxChange = useCallback(
        (c: boolean) => onChange(name, String(c)),
        [name, onChange],
    );

    const enumItems = useMemo<IListBoxItem[]>(
        () => propSchema?.enum
            ? (propSchema.enum as string[]).map((opt) => ({ value: opt, label: opt }))
            : [],
        [propSchema?.enum],
    );

    const selectedEnumItem = useMemo(
        () => enumItems.find((it) => it.value === value) ?? null,
        [enumItems, value],
    );

    let input: React.ReactNode;

    if (isBoolean) {
        input = (
            <Checkbox
                checked={value === "true"}
                onChange={handleCheckboxChange}
                disabled={disabled}
            >
                {name}
            </Checkbox>
        );
    } else if (propSchema?.enum) {
        input = (
            <Select<IListBoxItem>
                items={enumItems}
                value={selectedEnumItem}
                onChange={(it) => onChange(name, String(it.value))}
                placeholder="— select —"
                disabled={disabled}
                size="sm"
            />
        );
    } else if (type === "number" || type === "integer") {
        input = (
            <Input
                value={value}
                onChange={handleChange}
                placeholder={propSchema?.default !== undefined ? String(propSchema.default) : ""}
                disabled={disabled}
                size="sm"
            />
        );
    } else if (type === "object" || type === "array" || isCodeLikeField(name)) {
        const lang = (type === "object" || type === "array") ? "json" : "plaintext";
        const height = (type === "object" || type === "array") ? 120 : 80;
        input = (
            <Panel border rounded="md" overflow="hidden" height={height}>
                <Editor
                    value={value}
                    language={lang}
                    theme="custom-dark"
                    onChange={handleEditorChange}
                    options={{
                        automaticLayout: true,
                        minimap: { enabled: false },
                        lineNumbers: "off",
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        folding: false,
                        renderLineHighlight: "none",
                        padding: { top: 4, bottom: 4 },
                        readOnly: disabled,
                        domReadOnly: disabled,
                        overviewRulerLanes: 0,
                        scrollbar: { alwaysConsumeMouseWheel: false },
                    }}
                />
            </Panel>
        );
    } else {
        input = (
            <Textarea
                value={value}
                onChange={handleChange}
                placeholder={propSchema?.default !== undefined ? String(propSchema.default) : ""}
                readOnly={disabled}
                size="sm"
            />
        );
    }

    return (
        <Panel direction="column" gap="xs">
            {!isBoolean && (
                <Panel direction="row" gap="md" align="center">
                    <Text size="base" color="default">{name}</Text>
                    <Tag size="sm" label={type} />
                    {required && <Text size="xs" color="error">required</Text>}
                </Panel>
            )}
            {input}
            {description && <Text size="md" color="light">{description}</Text>}
        </Panel>
    );
}
