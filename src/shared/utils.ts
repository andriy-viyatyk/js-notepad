export function debounce<T extends (...args: any[]) => void>(
    func: T,
    delay: number,
    canRun?: () => boolean
): (...args: Parameters<T>) => void {
    let timeoutId: any = null;

    return (...args: Parameters<T>) => {
        const run = () => {
            if (!canRun || canRun()) {
                func(...args);
                return;
            }
            timeoutId = setTimeout(run, delay);
        };

        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(run, delay);
    };
}