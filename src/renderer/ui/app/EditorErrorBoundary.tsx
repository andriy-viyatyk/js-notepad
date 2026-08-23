import { Component, type ErrorInfo, type ReactNode } from "react";
import "./EditorErrorBoundary.css";

interface EditorErrorBoundaryProps { children: ReactNode; }
interface EditorErrorBoundaryState { error: Error | null; }

export class EditorErrorBoundary extends Component<EditorErrorBoundaryProps, EditorErrorBoundaryState> {
    state: EditorErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): EditorErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error("Editor crashed:", error, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <div className="editor-error-root">
                <div className="error-title">Editor crashed</div>
                <div className="error-message">{error.message}</div>
                {error.stack && <div className="error-stack">{error.stack}</div>}
            </div>
        );
    }
}
