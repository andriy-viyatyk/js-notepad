import type { IHighlightOptions, IHighlightResult } from "../../api/types/ui";
import type { IAiElement, IAiElementDeclaration, IAiMember } from "../../../shared/ai-vision/types";

interface IProvidedValue {
    readonly value: unknown;
}

type HighlightElement = (
    selector: string,
    message?: string,
    options?: IHighlightOptions,
) => Promise<IHighlightResult>;

export interface CreateElementsOptions {
    readonly itemLabel?: string;
    readonly validNamesLabel?: string;
    readonly unknownNameError?: (name: string, declarations: readonly IAiElementDeclaration[]) => string | undefined;
    readonly scopeSelector?: string;
    readonly scopeRootNames?: readonly string[];
    readonly beforeHighlight?: (selector: string) => void | Promise<void>;
    readonly highlightOptions?: IHighlightOptions;
}

function splitSelectorList(selector: string): string[] {
    const selectors: string[] = [];
    let start = 0;
    let parentheses = 0;
    let brackets = 0;
    let quote: string | undefined;
    let escaped = false;

    for (let index = 0; index < selector.length; index++) {
        const character = selector[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (character === "\\") {
            escaped = true;
            continue;
        }
        if (quote) {
            if (character === quote) quote = undefined;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === "(") parentheses++;
        else if (character === ")") parentheses = Math.max(0, parentheses - 1);
        else if (character === "[") brackets++;
        else if (character === "]") brackets = Math.max(0, brackets - 1);
        else if (character === "," && parentheses === 0 && brackets === 0) {
            selectors.push(selector.slice(start, index).trim());
            start = index + 1;
        }
    }

    selectors.push(selector.slice(start).trim());
    return selectors.filter(Boolean);
}

function resolvedSelector(
    declaration: IAiElementDeclaration,
    options: CreateElementsOptions,
): string {
    const selector = declaration.selector ?? `[data-name="${declaration.name}"]`;
    if (!options.scopeSelector) return selector;
    const root = options.scopeRootNames?.includes(declaration.name) ?? false;
    const separator = root ? "" : " ";
    return splitSelectorList(selector)
        .map((branch) => `${options.scopeSelector}${separator}${branch}`)
        .join(", ");
}

function validateDeclarations(declarations: readonly IAiElementDeclaration[]): void {
    const names = new Set<string>();
    for (const declaration of declarations) {
        if (!declaration.name || declaration.name.includes("\"") || declaration.name.includes("\\")) {
            throw new Error(`Invalid AiVision element name ${JSON.stringify(declaration.name)}.`);
        }
        if (names.has(declaration.name)) {
            throw new Error(`Duplicate AiVision element name ${JSON.stringify(declaration.name)}.`);
        }
        names.add(declaration.name);
    }
}

function isVisible(selector: string): boolean {
    if (typeof document === "undefined") return false;
    try {
        return Array.from(document.querySelectorAll<HTMLElement>(selector)).some(element => element.offsetParent !== null);
    } catch {
        return false;
    }
}

export function createElements(
    declarations: readonly IAiElementDeclaration[],
    highlightElement: HighlightElement,
    options: CreateElementsOptions = {},
): {
    readonly members: readonly IAiMember[];
    provide(name: string): IProvidedValue | undefined;
} {
    validateDeclarations(declarations);

    const declarationsByName = new Map(declarations.map(declaration => [declaration.name, declaration]));
    const members: readonly IAiMember[] = [
        { name: "elements", kind: "property", summary: "Curated controls owned by this UI surface, with live visibility and resolved selectors." },
        { name: "highlight", kind: "method", signature: "highlight(name: string, message?: string)", summary: "Highlight one curated UI control by name.", caution: "changes the visible UI; returns as soon as the overlay is drawn — the user dismisses it afterwards" },
    ];

    const provide = (name: string): IProvidedValue | undefined => {
        if (name === "elements") {
            const elements: IAiElement[] = declarations.map(declaration => {
                const selector = resolvedSelector(declaration, options);
                return {
                    name: declaration.name,
                    purpose: declaration.purpose,
                    selector,
                    visible: isVisible(selector),
                };
            });
            return { value: elements };
        }

        if (name === "highlight") {
            return {
                value: (elementName: string, message?: string): Promise<IHighlightResult> => {
                    const declaration = declarationsByName.get(elementName);
                    if (!declaration) {
                        const customError = options.unknownNameError?.(elementName, declarations);
                        if (customError) throw new Error(customError);
                        const validNames = declarations.map(item => item.name).join(", ") || "(none)";
                        const itemLabel = options.itemLabel ?? "AiVision element";
                        const validNamesLabel = options.validNamesLabel ?? "Valid element names";
                        throw new Error(`Unknown ${itemLabel} ${JSON.stringify(elementName)}. ${validNamesLabel}: ${validNames}.`);
                    }
                    const selector = resolvedSelector(declaration, options);
                    return Promise.resolve(options.beforeHighlight?.(selector))
                        .then(() => highlightElement(selector, message, options.highlightOptions));
                },
            };
        }

        return undefined;
    };

    return { members, provide };
}
