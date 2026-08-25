import { useCallback } from "react";
import {
    Autocomplete,
    Checkbox,
    IconButton,
    Panel,
    Textarea,
} from "../../uikit";
import { RestHeader } from "./restClientTypes";

interface KeyValueEditorProps {
    items: RestHeader[];
    onUpdate: (index: number, changes: Partial<RestHeader>) => void;
    onDelete: (index: number) => void;
    onToggle: (index: number) => void;
    keyOptions?: string[];
    keyPlaceholder?: string;
    valuePlaceholder?: string;
}

export function KeyValueEditor({
    items,
    onUpdate,
    onDelete,
    onToggle,
    keyOptions,
    keyPlaceholder = "Key",
    valuePlaceholder = "Value",
}: KeyValueEditorProps) {
    return (
        <Panel name="kv-editor" direction="column" gap="xs">
            {items.map((item, index) => (
                <KeyValueRow
                    key={index}
                    item={item}
                    index={index}
                    isLast={index === items.length - 1}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onToggle={onToggle}
                    keyOptions={keyOptions}
                    keyPlaceholder={keyPlaceholder}
                    valuePlaceholder={valuePlaceholder}
                />
            ))}
        </Panel>
    );
}

interface KeyValueRowProps {
    item: RestHeader;
    index: number;
    isLast: boolean;
    onUpdate: (index: number, changes: Partial<RestHeader>) => void;
    onDelete: (index: number) => void;
    onToggle: (index: number) => void;
    keyOptions?: string[];
    keyPlaceholder: string;
    valuePlaceholder: string;
}

function KeyValueRow({
    item,
    index,
    isLast,
    onUpdate,
    onDelete,
    onToggle,
    keyOptions,
    keyPlaceholder,
    valuePlaceholder,
}: KeyValueRowProps) {
    const isEmpty = !item.key && !item.value;

    const handleKeyChange = useCallback(
        (value: string) => {
            onUpdate(index, { key: value });
        },
        [onUpdate, index],
    );

    const handleValueChange = useCallback(
        (value: string) => {
            onUpdate(index, { value });
        },
        [onUpdate, index],
    );

    const handleToggle = useCallback(() => onToggle(index), [onToggle, index]);
    const handleDelete = useCallback(() => onDelete(index), [onDelete, index]);

    return (
        <Panel
            name="kv-row"
            direction="row"
            align="start"
            gap="xs"
            paddingTop="xs"
            dimmed={!item.enabled}
        >
            <Panel name="kv-row-check-slot" paddingTop="sm" shrink={false}>
                <Checkbox checked={item.enabled} onChange={handleToggle} />
            </Panel>
            <Panel
                name="kv-row-key-slot"
                width="35%"
                minWidth={100}
                shrink={false}
            >
                {keyOptions ? (
                    <Autocomplete
                        name="kv-row-key"
                        items={keyOptions}
                        value={item.key}
                        onChange={handleKeyChange}
                        placeholder={keyPlaceholder}
                        filterMode="contains"
                        size="sm"
                    />
                ) : (
                    <Textarea
                        name="kv-row-key"
                        variant="ghost"
                        singleLine
                        value={item.key}
                        onChange={handleKeyChange}
                        placeholder={keyPlaceholder}
                        flex="1 1 0"
                        minWidth={0}
                        minHeight={24}
                    />
                )}
            </Panel>
            <Textarea
                name="kv-row-value"
                variant="ghost"
                singleLine
                value={item.value}
                onChange={handleValueChange}
                placeholder={valuePlaceholder}
                flex="1 1 0"
                minWidth={0}
                minHeight={24}
            />
            {isLast && isEmpty ? (
                <Panel width={24} shrink={false} />
            ) : (
                <IconButton
                    name="kv-row-delete"
                    size="sm"
                    icon="close"
                    title="Delete"
                    onClick={handleDelete}
                />
            )}
        </Panel>
    );
}
