import type { IHighlightResult } from "../../api/types/ui";
import type { IAiElement, IAiElementDeclaration, IAiMember } from "../../../shared/ai-vision/types";

interface IProvidedValue {
    readonly value: unknown;
}

type HighlightElement = (selector: string, message?: string) => Promise<IHighlightResult>;

interface CreateElementsOptions {
    readonly itemLabel?: string;
    readonly validNamesLabel?: string;
    readonly unknownNameError?: (name: string, declarations: readonly IAiElementDeclaration[]) => string | undefined;
}

function resolvedSelector(declaration: IAiElementDeclaration): string {
    return declaration.selector ?? `[data-name="${declaration.name}"]`;
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
                const selector = resolvedSelector(declaration);
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
                    return highlightElement(resolvedSelector(declaration), message);
                },
            };
        }

        return undefined;
    };

    return { members, provide };
}
