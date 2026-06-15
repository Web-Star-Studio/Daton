import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DocumentContentSection } from "@workspace/api-client-react";

export function DocumentContentReader({
  sections,
}: {
  sections: DocumentContentSection[];
}) {
  if (!sections || sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Nenhum conteúdo redigido.
      </p>
    );
  }
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-6">
      {ordered.map((section) => (
        <section key={section.id} className="space-y-2">
          <h3 className="text-sm font-semibold">{section.title || "—"}</h3>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {section.body || "_Sem conteúdo._"}
            </ReactMarkdown>
          </div>
        </section>
      ))}
    </div>
  );
}
