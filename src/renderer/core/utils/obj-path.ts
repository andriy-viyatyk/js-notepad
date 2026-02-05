const PATH_REGEX = /\["([^"]+)"\]|\[\'([^\']+)\'\]|[^.\[\]]+/g;

/**
 * Parses a string path into an array of property keys.
 * This function handles both dot notation and bracket notation.
 *
 * @param path The path string to parse.
 * @returns An array of property keys.
 */
function parsePath(path?: string): string[] {
    if (!path) {
        return [];
    }
    const pathParts = path.match(PATH_REGEX);
    if (!pathParts) {
        return [];
    }
    return pathParts
        .map((part) => {
            if (part.startsWith('["') && part.endsWith('"]')) {
                return part.substring(2, part.length - 2);
            }
            if (part.startsWith("['") && part.endsWith("']")) {
                return part.substring(2, part.length - 2);
            }
            return part;
        })
        .filter(Boolean);
}

/**
 * Validates a path string to ensure it has a correct syntax.
 * It checks that all parts of the path are correctly formatted according to
 * the supported dot and bracket notation.
 *
 * @param path The path string to validate.
 * @returns True if the path is valid, false otherwise.
 */
function validatePath(path?: string): boolean {
    if (!path || typeof path !== "string") {
        return false;
    }
    const matchedParts = path.match(PATH_REGEX);
    if (!matchedParts || matchedParts.length === 0) {
        return false;
    }
    let reconstructedPath = matchedParts[0];
    for (let i = 1; i < matchedParts.length; i++) {
        const prevPart = matchedParts[i - 1];
        const currentPart = matchedParts[i];
        const prevPartIsBracketed =
            prevPart.startsWith("[") && prevPart.endsWith("]");
        const currentPartIsBracketed =
            currentPart.startsWith("[") && currentPart.endsWith("]");
        if (!prevPartIsBracketed || !currentPartIsBracketed) {
            reconstructedPath += ".";
        }
        reconstructedPath += currentPart;
    }
    return reconstructedPath === path;
}

/**
 * Determines if a property name needs to be wrapped in bracket notation
 * when constructing a path string. This is necessary for keys that contain
 * special characters like dots, brackets, or quotes, which would otherwise
 * break the path's syntax.
 *
 * @param propName The property name to check.
 * @returns True if the property name needs to be wrapped, false otherwise.
 */
function needToWrap(propName: string): boolean {
    return /[.\[\]'"]/.test(propName);
}

// Wrap prop if needed with validation. Return undefined if wrapping is invalid.
function wrapProp(propName: string): string | undefined {
    if (!needToWrap(propName)) {
        return propName;
    }
    let wrapped = `['${propName}']`;
    if (validatePath(wrapped)) return wrapped;
    wrapped = `["${propName}"]`;
    if (validatePath(wrapped)) return wrapped;
    return undefined;
}

function getValueByPath(obj: any, path: string[]): any {
    if (!path.length) {
        return obj;
    }

    if (!obj || typeof obj !== "object") {
        return undefined;
    }

    const prop = path.shift();
    return getValueByPath(obj[prop!], path);
}

export function getValue(obj: any, path?: string | number | symbol): any {
    const parsedPath = parsePath(path?.toString());
    return getValueByPath(obj, parsedPath);
}

function setValueByPath(obj: any, path: string[], value: any): void {
    if (!obj || typeof obj !== "object" || path.length === 0) {
        return;
    }

    const prop = path.shift()!;
    if (path.length === 0) {
        obj[prop] = value;
        return;
    }

    if (!obj[prop] || typeof obj[prop] !== "object") {
        obj[prop] = {};
    }

    setValueByPath(obj[prop], path, value);
}

export function setValue(obj: any, path: string, value: any): void {
    const parsedPath = parsePath(path);
    setValueByPath(obj, parsedPath, value);
}

export const objUtils = {
    parsePath,
    validatePath,
    wrapProp,
    getValue,
    setValue
}
