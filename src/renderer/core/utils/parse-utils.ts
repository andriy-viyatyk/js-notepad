import JSON5 from 'json5';

export const parseString = (value: any): string | undefined => {
    if (value === null || value === undefined || !value.toString)
        return undefined;
    return value.toString();
};

export const parseNumber = (value: any): number | undefined => {
    if (value === null || value === undefined || !value.toString)
        return undefined;
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    const int = parseInt(value, 10);
    return isNaN(int) ? undefined : int;
};

export const parseBoolean = (value: any): boolean | undefined => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string" && ["false", "no", "0"].includes(value.toLowerCase())) return false;
    return Boolean(value);
};

export const parseObject = (value: any, onError?: (error: any) => void): any | undefined => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "object") return value;
    try {
        return JSON.parse(value);
    } catch (error) {
        if (onError) onError(error);
        return undefined;
    }
}

export const parseJSON5 = (value: any, onError?: (error: any) => void): any | undefined => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "object") return value;
    try {
        return JSON5.parse(value);
    } catch (error) {
        if (onError) onError(error);
        return undefined;
    }
}
