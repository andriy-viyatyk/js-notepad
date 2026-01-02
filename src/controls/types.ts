export type ComponentOptions<T> = T[] | (() => T[] | Promise<T[]>);

export interface FieldProps<T> {
    value: T;
    onChange?: (value: T) => void;
    className?: string;
}