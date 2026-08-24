import { PathInputView } from "../PathInput/PathInputView";
import type { PathInputProps } from "../PathInput/PathInputModel";
import { TagView } from "../Tag/TagView";
import type { TagProps } from "../Tag/Tag";
import { guard } from "../../core/utils/guard";
import { applyRestProps, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/react-compat";
import { claimViewOwnership, VanillaView } from "../shared/vanilla-view";
import { KeyedList } from "../shared/keyed-list";
import type { TagsInputProps } from "./TagsInput";
import "./TagsInput.css";

interface TagRecord {
    tag: string;
    key: string;
}

export class TagsInputView extends VanillaView<TagsInputProps> {
    private inputSlot: HTMLDivElement | undefined;
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private readonly tagViews = new Map<HTMLSpanElement, TagView>();
    private tagsList: KeyedList<TagRecord, string, HTMLSpanElement> | undefined;
    private inputView: PathInputView | undefined;
    private draft = "";

    public constructor(props: TagsInputProps) {
        super(props, document.createElement("div"));
        this.root.classList.add("tags-input-root");
    }

    protected onMount(): void {
        this.inputSlot = document.createElement("div");
        this.applyRootProps(this.props);
        this.syncInput(this.props);

        this.tagsList = new KeyedList(this.root, {
            keyOf: (record) => record.key,
            create: (record) => this.createTag(record),
            update: (element, record) => this.updateTag(element, record),
            remove: (element) => this.removeTag(element),
        });
        this.tagsList.update(this.tagRecords(this.props.value));
        this.own(() => this.tagsList?.dispose());
    }

    protected onUpdate(props: TagsInputProps): void {
        this.applyRootProps(props);
        this.syncInput(props);
        this.tagsList?.update(this.tagRecords(props.value));
    }

    protected onDispose(): void {
        clearRestListeners(this.root, this.restPropsState);
    }

    private tagRecords(tags: string[]): TagRecord[] {
        const occurrence = new Map<string, number>();
        return tags.map((tag) => {
            const index = occurrence.get(tag) ?? 0;
            occurrence.set(tag, index + 1);
            return { tag, key: `${tag}#${index}` };
        });
    }

    private createTag(record: TagRecord): HTMLSpanElement {
        const view = new TagView(this.tagProps(record.tag));
        claimViewOwnership(view);
        this.tagViews.set(view.root, view);
        return view.root;
    }

    private updateTag(element: HTMLSpanElement, record: TagRecord): void {
        const view = this.tagViews.get(element);
        if (!view) throw new Error("TagsInput lost a tag view.");
        view.update(this.tagProps(record.tag));
    }

    private removeTag(element: HTMLSpanElement): void {
        const view = this.tagViews.get(element);
        view?.dispose();
        this.tagViews.delete(element);
    }

    private tagProps(tag: string): TagProps {
        const props = this.props;
        return {
            label: tag,
            variant: props.tagVariant ?? "filled",
            size: props.size ?? "md",
            disabled: props.disabled,
            onRemove: props.readOnly ? undefined : () => this.handleRemove(tag),
        };
    }

    private syncInput(props: TagsInputProps): void {
        if (props.readOnly) {
            const inputView = this.inputView;
            this.inputView = undefined;
            if (inputView) {
                void guard("Failed to dispose path input", () => this.releaseChild(inputView));
            }
            this.inputSlot?.remove();
            return;
        }

        if (!this.inputView) {
            if (!this.inputSlot) return;
            this.inputView = this.child(new PathInputView(this.inputProps(props)));
            this.root.append(this.inputSlot);
            this.inputSlot.append(this.inputView.root);
            this.inputView.mount();
        } else {
            this.inputView.update(this.inputProps(props));
        }
    }

    private inputProps(props: TagsInputProps): PathInputProps {
        return {
            value: this.draft,
            onChange: this.handleInputChange,
            onBlur: this.handleAddBlur,
            paths: props.items ?? [],
            separator: props.separator ?? ":",
            maxDepth: props.maxDepth ?? 1,
            placeholder: props.placeholder ?? "Type + Enter to add",
            disabled: props.disabled,
            size: props.size ?? "md",
        };
    }

    private readonly handleInputChange = (value: string): void => {
        this.draft = value;
        this.inputView?.update(this.inputProps(this.props));
    };

    private readonly handleAddBlur = (finalValue?: string): void => {
        if (finalValue === undefined) {
            this.draft = "";
            this.inputView?.update(this.inputProps(this.props));
            return;
        }

        const separator = this.props.separator ?? ":";
        const trimmed = finalValue.trim();
        const cleaned = trimmed.endsWith(separator)
            ? trimmed.slice(0, -1)
            : trimmed;
        if (cleaned && !this.props.value.includes(cleaned)) {
            this.props.onChange([...this.props.value, cleaned]);
        }
        this.draft = "";
        this.inputView?.update(this.inputProps(this.props));
    };

    private readonly handleRemove = (tag: string): void => {
        this.props.onChange(this.props.value.filter((value) => value !== tag));
    };

    private applyRootProps(props: TagsInputProps): void {
        const {
            name,
            value: _value,
            onChange: _onChange,
            items: _items,
            separator: _separator,
            maxDepth: _maxDepth,
            placeholder: _placeholder,
            tagVariant: _tagVariant,
            size: _size,
            disabled,
            readOnly,
            "aria-label": ariaLabel,
            children: _children,
            ...rest
        } = props;

        this.root.dataset.type = "tags-input";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        if (disabled) this.root.dataset.disabled = "";
        else delete this.root.dataset.disabled;
        if (readOnly) this.root.dataset.readonly = "";
        else delete this.root.dataset.readonly;
        if (ariaLabel === undefined) this.root.removeAttribute("aria-label");
        else this.root.setAttribute("aria-label", ariaLabel);
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
        this.root.classList.add("tags-input-root");
    }
}
