import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type NativeHTMLAttributes,
    type RestPropsState,
} from "../shared/dom-props";
import { splitWithSeparators } from "../../core/utils/utils";
import { KeyedList } from "../shared/keyed-list";
import { VanillaView } from "../shared/vanilla-view";
import "./Breadcrumb.css";

export interface BreadcrumbProps
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    name?: string;
    rootLabel: string;
    value: string;
    onChange: (value: string) => void;
    separators?: string;
    trailingParentSeparator?: boolean;
    separatorContent?: string;
    size?: "sm" | "md";
    clipStart?: boolean;
}

interface BreadcrumbPart {
    key: string;
    part: "root" | "separator" | "segment";
    text: string;
    current: boolean;
    segmentIndex?: number;
}

export class BreadcrumbView extends VanillaView<BreadcrumbProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private parts: KeyedList<BreadcrumbPart, string, HTMLSpanElement> | undefined;

    public constructor(props: BreadcrumbProps) {
        super(props, document.createElement("div"));
        this.root.classList.add("breadcrumb-root");
    }

    protected onMount(): void {
        this.parts = new KeyedList(this.root, {
            keyOf: (part) => part.key,
            create: () => document.createElement("span"),
            update: (element, part) => this.updatePart(element, part),
        });
        this.own(() => this.parts?.dispose());
        this.listen(this.root, "click", this.onSegmentClick);
        this.applyProps(this.props);
        this.applyConstructionRestProps(this.props);
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: BreadcrumbProps): void {
        this.applyProps(props);
    }

    protected onDispose(): void {
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: BreadcrumbProps): void {
        const {
            name,
            rootLabel,
            value,
            onChange: _onChange,
            separators = "/\\",
            trailingParentSeparator: _trailingParentSeparator,
            separatorContent = ">",
            size = "md",
            clipStart = false,
            children: _children,
            ..._rest
        } = props;

        this.root.dataset.type = "breadcrumb";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.dataset.size = size;
        if (clipStart) this.root.dataset.clipStart = "";
        else delete this.root.dataset.clipStart;
        const segments = value ? splitWithSeparators(value, separators) : [];
        const rootIsCurrent = segments.length === 0;
        const parts: BreadcrumbPart[] = [{
            key: "root",
            part: "root",
            text: rootLabel,
            current: rootIsCurrent,
        }];
        segments.forEach((segment, index) => {
            parts.push({
                key: `separator:${index}`,
                part: "separator",
                text: separatorContent,
                current: false,
            });
            parts.push({
                key: `segment:${index}`,
                part: "segment",
                text: segment,
                current: index === segments.length - 1,
                segmentIndex: index,
            });
        });

        this.parts?.update(clipStart ? parts.slice().reverse() : parts);
    }

    private updatePart(element: HTMLSpanElement, part: BreadcrumbPart): void {
        element.dataset.part = part.part;
        if (part.current) element.dataset.current = "";
        else delete element.dataset.current;
        if (part.segmentIndex === undefined) delete element.dataset.index;
        else element.dataset.index = String(part.segmentIndex);
        element.textContent = part.text;
    }

    private readonly onSegmentClick = (event: MouseEvent): void => {
        const target = (event.target as Element | null)?.closest<HTMLSpanElement>("span[data-part]");
        if (!target || target.parentElement !== this.root) return;

        if (target.dataset.part === "root") {
            if (target.dataset.current === undefined) this.props.onChange("");
            return;
        }
        if (target.dataset.part !== "segment" || target.dataset.current !== undefined) return;

        const segmentIndex = Number(target.dataset.index);
        const { value, separators = "/\\", trailingParentSeparator = false } = this.props;
        const segments = value ? splitWithSeparators(value, separators) : [];
        if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= segments.length - 1) return;
        const joinSeparator = separators[0];
        const path = segments.slice(0, segmentIndex + 1).join(joinSeparator);
        this.props.onChange(trailingParentSeparator ? path + joinSeparator : path);
    };

    private applyConstructionRestProps(props: BreadcrumbProps): void {
        const {
            name: _name,
            rootLabel: _rootLabel,
            value: _value,
            onChange: _onChange,
            separators: _separators,
            trailingParentSeparator: _trailingParentSeparator,
            separatorContent: _separatorContent,
            size: _size,
            clipStart: _clipStart,
            children: _children,
            ...rest
        } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }
}
