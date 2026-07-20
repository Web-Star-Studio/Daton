import React, { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

// Controlled score input that stays in sync with refetched data.
export function ScoreInput({
  score,
  disabled,
  onSave,
}: {
  score: number | null;
  disabled: boolean;
  onSave: (v: number) => void;
}) {
  const [val, setVal] = useState(score != null ? String(score) : "");
  useEffect(() => {
    setVal(score != null ? String(score) : "");
  }, [score]);
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      max={10}
      step={0.5}
      value={val}
      disabled={disabled}
      className="h-8 w-20"
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val === "" || val === String(score ?? "")) return;
        const parsed = Number(val);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
          // Valor inválido: volta ao que estava, em vez de gravar lixo — mas
          // avisa, senão o número digitado some sem explicação (achado 3 da
          // revisão de fix/score-precisao-nota).
          toast({
            title: "Nota inválida",
            description: "A nota deve estar entre 0 e 10.",
            variant: "destructive",
          });
          setVal(score != null ? String(score) : "");
          return;
        }
        onSave(parsed);
      }}
    />
  );
}
