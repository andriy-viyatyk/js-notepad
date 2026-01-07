import { PageModel } from "../model/page-model";
import { TextFileModel } from "../pages/text-file-page/TextFilePage.model";
import { pagesModel } from "../model/pages-model";

const wrapPage = (page?: PageModel) => {
    if (!page || !(page instanceof TextFileModel)) {
        return undefined;
    }
    const textPage = page as TextFileModel;

    return {
        get content() {
            return textPage.state.get().content;
        },
        set content(value: string) {
            textPage.changeContent(value);
        },
        get grouped() {
            let grouped = pagesModel.getGroupedPage(textPage.id);
            if (!grouped) {
                grouped = pagesModel.requireGroupedText(textPage.id);
            }
            return wrapPage(grouped);
        },
        get language() {
            return textPage.state.get().language;
        },
        set language(value: string) {
            textPage.changeLanguage(value);
        },
        get data() {
            return textPage.script.data;
        }
    };
};

const createCustomContext = (page?: PageModel) => {
    return {
        page: wrapPage(page),
    };
}

export function createScriptContext(page?: PageModel) {
    const customContext = createCustomContext(page);

    // Create a read-only proxy for window/globalThis
    const readOnlyGlobalThis = new Proxy(globalThis, {
        get(target, prop) {
            if (Object.hasOwn(customContext, prop)) {
                return (customContext as any)[prop];
            }
            const value = (target as any)[prop];

            // If it's a function, bind it to globalThis
            if (typeof value === "function") {
                return value.bind(globalThis);
            }

            return value;
        },
        set(target, prop, value) {
            (customContext as any)[prop] = value;
            return true; // Return true to indicate "success" but don't actually set
        },
        deleteProperty() {
            // Prevent deletions
            return false;
        },
        defineProperty() {
            // Prevent defining new properties
            return false;
        },
    });

    return new Proxy(customContext, {
        get(target, prop) {
            // First check custom context
            if (prop in target) {
                return (target as any)[prop];
            }

            // Special handling for 'window' and 'globalThis'
            if (prop === "window" || prop === "globalThis") {
                return readOnlyGlobalThis;
            }

            // Then check globalThis
            if (prop in globalThis) {
                const value = (globalThis as any)[prop];

                // If it's a function, bind it to globalThis
                if (typeof value === "function") {
                    return value.bind(globalThis);
                }

                return value;
            }

            return undefined;
        },

        has(target, prop) {
            return prop in target || prop in globalThis;
        },

        set(target, prop, value) {
            (target as any)[prop] = value;
            return true;
        },

        deleteProperty(target, prop) {
            // Only allow deleting custom context properties
            if (prop in target) {
                delete (target as any)[prop];
                return true;
            }
            // Prevent deleting global properties
            return false;
        },
    });
}
