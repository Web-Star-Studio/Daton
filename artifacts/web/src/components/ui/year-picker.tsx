import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const CURRENT_YEAR = new Date().getFullYear();

export function YearPicker({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  const [open, setOpen] = useState(false);
  const [decade, setDecade] = useState(Math.floor(value / 10) * 10);
  const years = Array.from({ length: 10 }, (_, i) => decade + i);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          {value}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setDecade((d) => d - 10)}
            className="rounded p-1 hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">{decade}–{decade + 9}</span>
          <button
            type="button"
            onClick={() => setDecade((d) => d + 10)}
            className="rounded p-1 hover:bg-muted transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => { onChange(y); setOpen(false); }}
              className={cn(
                "rounded py-1.5 text-sm font-medium transition-colors",
                y === value
                  ? "bg-primary text-primary-foreground"
                  : y === CURRENT_YEAR
                  ? "bg-muted font-semibold hover:bg-muted/80"
                  : "hover:bg-muted text-foreground",
              )}
            >
              {y}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
