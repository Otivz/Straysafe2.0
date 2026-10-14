// Polling helper: run the callback only while this tab is visible. Hidden / background tabs stop asking the server
// for updates (the next visible tick, or a refresh when the tab comes back, catches up).
export const whenVisible = <T extends (...args: any[]) => any>(fn: T) => (...args: Parameters<T>): void => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') fn(...args);
};
