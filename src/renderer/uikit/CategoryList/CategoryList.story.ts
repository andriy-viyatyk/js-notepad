import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { CategoryListView } from "./CategoryListView";
import type { CategoryListProps } from "./CategoryList";
import type { Story } from "../../editors/storybook/storyTypes";

interface CategoryListDemoProps {
    separator?: string;
    rootLabel?: string;
    showCounts?: boolean;
}

const SAMPLE_TAGS = [
    "dev",
    "draft",
    "release:1.0.0",
    "release:1.0.1",
    "release:1.1.0",
    "stage:design",
    "stage:review",
    "stage:done",
];

const SAMPLE_HOSTNAMES = [
    "github.com",
    "google.com",
    "anthropic.com",
    "example.org",
];

const TAG_COUNTS: Record<string, number> = {
    "": 12,
    "dev": 3,
    "draft": 2,
    "release:": 4,
    "release:1.0.0": 1,
    "release:1.0.1": 2,
    "release:1.1.0": 1,
    "stage:": 3,
    "stage:design": 1,
    "stage:review": 1,
    "stage:done": 1,
};

const HOST_COUNTS: Record<string, number> = {
    "": 4, "github.com": 2, "google.com": 1, "anthropic.com": 0, "example.org": 1,
};

function createSelectedLabel(): { element: HTMLSpanElement; value: HTMLElement } {
    const element = createTextElement("", { size: "sm" });
    const value = document.createElement("code");
    element.append(document.createTextNode("selected: "), value);
    return { element, value };
}

function createTagsDescription(): HTMLSpanElement {
    const element = createTextElement("", { size: "sm", color: "light" });
    const release = document.createElement("code");
    const stage = document.createElement("code");
    release.textContent = "release";
    stage.textContent = "stage";
    element.append(
        document.createTextNode("Tags-style — separator drills into a subcategory (try clicking the chevron next to "),
        release,
        document.createTextNode(" or "),
        stage,
        document.createTextNode(")."),
    );
    return element;
}

function createFlatDescription(): HTMLSpanElement {
    const element = createTextElement("", { size: "sm", color: "light" });
    const separator = document.createElement("code");
    separator.textContent = 'separator="\\0"';
    element.append(document.createTextNode("Flat — drill-in disabled with "), separator, document.createTextNode("."));
    return element;
}

class CategoryListDemoView extends VanillaView<CategoryListDemoProps> {
    private tagValue = "";
    private hostValue = "";
    private tagListView: CategoryListView | undefined;
    private hostListView: CategoryListView | undefined;
    private tagValueElement: HTMLElement | undefined;
    private hostValueElement: HTMLElement | undefined;

    public constructor(props: CategoryListDemoProps) {
        super(props, createPanelElement({ direction: "column", gap: "xl", padding: "xl" }));
    }

    protected onMount(): void {
        const tagLabel = createSelectedLabel();
        const hostLabel = createSelectedLabel();
        this.tagValueElement = tagLabel.value;
        this.hostValueElement = hostLabel.value;

        const tagList = this.child(new CategoryListView(this.tagProps(this.props)));
        const hostList = this.child(new CategoryListView(this.hostProps()));
        this.tagListView = tagList;
        this.hostListView = hostList;

        const tagPanel = createPanelElement({ width: 220, height: 280, border: true, rounded: "md", overflow: "hidden" }, [tagList.root]);
        const hostPanel = createPanelElement({ width: 220, height: 200, border: true, rounded: "md", overflow: "hidden" }, [hostList.root]);
        const tagSection = createPanelElement({ direction: "column", gap: "md" }, [
            createTagsDescription(),
            createPanelElement({ direction: "row", gap: "md", align: "start" }, [tagPanel, tagLabel.element]),
        ]);
        const hostSection = createPanelElement({ direction: "column", gap: "md" }, [
            createFlatDescription(),
            createPanelElement({ direction: "row", gap: "md", align: "start" }, [hostPanel, hostLabel.element]),
        ]);

        this.root.append(tagSection, hostSection);
        tagList.mount();
        hostList.mount();
        this.updateValueLabels();
    }

    protected onUpdate(props: CategoryListDemoProps): void {
        this.tagListView?.update(this.tagProps(props));
        this.hostListView?.update(this.hostProps());
        this.updateValueLabels();
    }

    private readonly onTagChange = (value: string): void => {
        this.tagValue = value;
        this.tagListView?.update(this.tagProps(this.props));
        this.updateValueLabels();
    };

    private readonly onHostChange = (value: string): void => {
        this.hostValue = value;
        this.hostListView?.update(this.hostProps());
        this.updateValueLabels();
    };

    private tagProps(props: CategoryListDemoProps): CategoryListProps {
        return {
            items: SAMPLE_TAGS,
            value: this.tagValue,
            onChange: this.onTagChange,
            separator: props.separator ?? ":",
            rootLabel: props.rootLabel ?? "All",
            getCount: props.showCounts ? (value) => TAG_COUNTS[value] : undefined,
        };
    }

    private hostProps(): CategoryListProps {
        return {
            items: SAMPLE_HOSTNAMES,
            value: this.hostValue,
            onChange: this.onHostChange,
            separator: "\0",
            rootLabel: "All hostnames",
            getCount: this.props.showCounts ? (value) => HOST_COUNTS[value] : undefined,
        };
    }

    private updateValueLabels(): void {
        if (this.tagValueElement) this.tagValueElement.textContent = JSON.stringify(this.tagValue);
        if (this.hostValueElement) this.hostValueElement.textContent = JSON.stringify(this.hostValue);
    }

    protected onDispose(): void {
        this.tagListView = undefined;
        this.hostListView = undefined;
        this.tagValueElement = undefined;
        this.hostValueElement = undefined;
    }
}

export const categoryListStory: Story<CategoryListDemoProps> = {
    id: "category-list",
    name: "CategoryList",
    section: "Lists",
    view: CategoryListDemoView,
    props: [
        { name: "separator", type: "string", default: ":" },
        { name: "rootLabel", type: "string", default: "All" },
        { name: "showCounts", type: "boolean", default: true },
    ],
};
