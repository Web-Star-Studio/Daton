import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import "./index.css";

createRoot(document.getElementById("root")!, {
  onUncaughtError(error, errorInfo) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[React] Erro não capturado:", err.message);
    console.error("[React] Stack:", err.stack);
    console.error("[React] Componente:", errorInfo.componentStack);
  },
  onCaughtError(error, errorInfo) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[React] Erro capturado por ErrorBoundary:", err.message);
    console.error("[React] Stack:", err.stack);
    console.error("[React] Componente:", errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
