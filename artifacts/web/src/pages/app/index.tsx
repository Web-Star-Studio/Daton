import React, { useEffect } from "react";
import { useLocation } from "wouter";

export default function AppIndex() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/organizacao");
  }, [setLocation]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-muted-foreground">Carregando módulo...</div>
    </div>
  );
}
