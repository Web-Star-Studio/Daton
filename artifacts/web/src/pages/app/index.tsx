import React, { useEffect } from "react";
import { useLocation } from "wouter";

export default function AppIndex() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect default /app to the main module for now
    setLocation("/app/qualidade/legislacoes");
  }, [setLocation]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-muted-foreground">Carregando módulo...</div>
    </div>
  );
}
