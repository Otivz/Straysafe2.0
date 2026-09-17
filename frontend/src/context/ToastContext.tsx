import React, { createContext, useContext, useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
    id: string;
    type: ToastType;
    message: string;
    description?: string;
    duration?: number;
}

interface ToastContextType {
    toasts: ToastItem[];
    toast: {
        success: (message: string, description?: string, duration?: number) => void;
        error: (message: string, description?: string, duration?: number) => void;
        warning: (message: string, description?: string, duration?: number) => void;
        info: (message: string, description?: string, duration?: number) => void;
        show: (options: Omit<ToastItem, 'id'>) => void;
        dismiss: (id: string) => void;
    };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const dismiss = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const show = useCallback(
        ({ type, message, description, duration = 4000 }: Omit<ToastItem, 'id'>) => {
            const id = Math.random().toString(36).substring(2, 9);
            const newToast: ToastItem = { id, type, message, description, duration };

            setToasts((prev) => [...prev, newToast]);

            if (duration > 0) {
                setTimeout(() => {
                    dismiss(id);
                }, duration);
            }
        },
        [dismiss]
    );

    const success = useCallback(
        (message: string, description?: string, duration?: number) => {
            show({ type: 'success', message, description, duration });
        },
        [show]
    );

    const error = useCallback(
        (message: string, description?: string, duration?: number) => {
            show({ type: 'error', message, description, duration: duration || 5000 });
        },
        [show]
    );

    const warning = useCallback(
        (message: string, description?: string, duration?: number) => {
            show({ type: 'warning', message, description, duration });
        },
        [show]
    );

    const info = useCallback(
        (message: string, description?: string, duration?: number) => {
            show({ type: 'info', message, description, duration });
        },
        [show]
    );

    return (
        <ToastContext.Provider
            value={{
                toasts,
                toast: {
                    success,
                    error,
                    warning,
                    info,
                    show,
                    dismiss,
                },
            }}
        >
            {children}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context.toast;
};

export const useToastItems = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToastItems must be used within a ToastProvider');
    }
    return { toasts: context.toasts, dismiss: context.toast.dismiss };
};
