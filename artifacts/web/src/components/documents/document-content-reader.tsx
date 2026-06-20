import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DocumentContentSection } from "@workspace/api-client-react";

export function DocumentContentReader({
  sections,
}: {
  sections?: DocumentContentSection[];
}) {
  const ordered = useMemo(
    () => [...(sections ?? [])].sort((a, b) => a.order - b.order),
    [sections],
  );
  if (!sections || sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Nenhum conteúdo redigido.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {ordered.map((section) => (
        <section key={section.id} className="space-y-2">
          <h3 className="text-sm font-semibold">{section.title || "—"}</h3>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {section.body || "_Sem conteúdo._"}
            </ReactMarkdown>
          </div>
        </section>
      ))}
    </div>
  );
}
