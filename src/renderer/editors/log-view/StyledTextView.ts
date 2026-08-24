import type { StyledText } from "./logTypes";
import { VanillaView } from "../../uikit/shared/vanilla-view";

export interface StyledTextViewProps {
    text: StyledText;
}

/** A display-contents view for the former React fragment-only helper. */
export class StyledTextView extends VanillaView<StyledTextViewProps> {
    public constructor(props: StyledTextViewProps) {
        super(props, document.createElement("span"));
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.writeText(this.props.text);
    }

    protected onUpdate(props: StyledTextViewProps): void {
        this.writeText(props.text);
    }

    private writeText(text: StyledText): void {
        const nodes: Node[] = [];
        if (typeof text === "string") {
            nodes.push(document.createTextNode(text));
        } else {
            for (const segment of text) {
                const span = document.createElement("span");
                span.textContent = segment.text;
                if (segment.styles) Object.assign(span.style, segment.styles);
                nodes.push(span);
            }
        }
        this.root.replaceChildren(...nodes);
    }
}
