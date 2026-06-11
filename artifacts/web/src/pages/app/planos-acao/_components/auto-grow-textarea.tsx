import { useLayoutEffect, useRef } from "react";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Textarea that grows and shrinks to fit its content — no inner scrollbar and no
 * truncation, so the full text is always visible. Starts at a single row and
 * expands as the text wraps. Safe only for always-visible containers (it measures
 * scrollHeight on mount); the 5W2H / 5-whys cards render in plain sections.
 */
export function AutoGrowTextarea({ className, value, ...props }: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Re-measure whenever the value changes (typing, IA draft fill, data load).
  useLayoutEffect(resize, [value]);
  // Width changes on viewport resize alter wrapping, so re-measure then too.
  useLayoutEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <Textarea
      ref={ref}
      value={value}
      rows={1}
      className={cn("min-h-0 resize-none overflow-hidden", className)}
      {...props}
    />
  );
}
