import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Erro capturado:", error.message);
    console.error("[ErrorBoundary] Stack:", error.stack);
    console.error("[ErrorBoundary] Componente:", info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Ocorreu um erro inesperado</p>
          <p className="font-mono text-xs text-muted-foreground break-all max-w-xl">
            {error.message}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => this.setState({ error: null })}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Tentar novamente
        </Button>
        {import.meta.env.DEV && (
          <details className="mt-2 w-full max-w-xl text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Stack trace
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs text-muted-foreground">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
