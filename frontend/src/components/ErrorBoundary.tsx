import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    public reset = () => {
        this.props.onReset?.();
        this.setState({ hasError: false, error: null });
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="w-full min-h-[40vh] flex flex-col items-center justify-center p-6 text-center font-sans">
                    <div className="bg-red-50/90 border border-red-200 rounded-2xl p-6 max-w-md w-full space-y-3 shadow-sm">
                        <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-lg font-bold">
                            ⚠️
                        </div>
                        <h2 className="text-base font-black text-red-950">Unable to load this section</h2>
                        <p className="text-xs text-red-700 leading-relaxed">
                            {this.state.error?.message || 'An unexpected rendering error occurred.'}
                        </p>
                        <div className="flex items-center justify-center gap-2 pt-2">
                            <button
                                type="button"
                                onClick={this.reset}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                                Try Again
                            </button>
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-white border border-red-200 text-red-700 hover:bg-red-50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                                Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
