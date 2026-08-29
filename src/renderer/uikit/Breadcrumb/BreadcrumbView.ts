import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type RestPropsState,
} from "../shared/dom-props";
import { splitWithSeparators } from "../../core/utils/utils";
import { VanillaView } from "../shared/vanilla-view";
import type { BreadcrumbProps } from "./Breadcrumb";
import "./Breadcrumb.css";

export class BreadcrumbView extends VanillaView<BreadcrumbProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();

    public constructor(props: BreadcrumbProps) {
        super(props, document.createElement("div"));
        this.root.classList.add("breadcrumb-root");
    }

    protected onMount(): void {
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
            trailingParentSeparator = false,
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
        const joinSeparator = separators[0];
        const segments = value ? splitWithSeparators(value, separators) : [];
        const nodes: Node[] = [];
        const rootIsCurrent = segments.length === 0;
        const rootSegment = this.createSegment(rootLabel, "root", rootIsCurrent);
        if (!rootIsCurrent) {
            this.listen(rootSegment, "click", this.onRootClick);
        }
        nodes.push(rootSegment);

        segments.forEach((segment, index) => {
            const isLeaf = index === segments.length - 1;
            const separator = document.createElement("span");
            separator.dataset.part = "separator";
            separator.textContent = separatorContent;
            nodes.push(separator);

            const segmentElement = this.createSegment(segment, "segment", isLeaf);
            if (!isLeaf) {
                this.listen(segmentElement, "click", () => {
                    const path = segments.slice(0, index + 1).join(joinSeparator);
                    const finalPath = trailingParentSeparator
                        ? path + joinSeparator
                        : path;
                    this.props.onChange(finalPath);
                });
            }
            nodes.push(segmentElement);
        });

        this.root.replaceChildren(...(clipStart ? nodes.reverse() : nodes));
    }

    private createSegment(
        text: string,
        part: "root" | "segment",
        current: boolean,
    ): HTMLSpanElement {
        const element = document.createElement("span");
        element.dataset.part = part;
        if (current) element.dataset.current = "";
        element.textContent = text;
        return element;
    }

    private readonly onRootClick = (): void => {
        this.props.onChange("");
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
