import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addSibling,
  indentNode,
  outdentNode,
  removeNode,
  updateNode,
} from "./tree-ops";

type BaseNode = { id: string; text?: string; children: BaseNode[] };

/**
 * Árvore como LISTA ANINHADA (indenta/desindenta), não como desenho.
 * O registro auditável é a hierarquia — e um editor gráfico custaria dez vezes mais
 * sem acrescentar nada ao que o auditor lê.
 */
export function EditorArvore<T extends BaseNode>({
  nodes,
  onChange,
  novoNo,
  extras,
  placeholder = "Descreva o evento",
  addLabel = "Adicionar item",
  readOnly = false,
  depth = 0,
}: {
  nodes: T[];
  onChange: (next: T[]) => void;
  novoNo: () => T;
  /** Campos próprios do método (porta E/OU, tipo Condição/Ação, evidência…). */
  extras?: (node: T, update: (next: T) => void) => React.ReactNode;
  placeholder?: string;
  addLabel?: string;
  readOnly?: boolean;
  depth?: number;
}) {
  const patch = (id: string, next: T) =>
    onChange(updateNode(nodes, id, () => next));

  return (
    <div className="space-y-1.5">
      {nodes.map((node) => (
        <div key={node.id} className="space-y-1.5">
          <div
            className="flex items-start gap-1.5"
            style={{ paddingLeft: depth * 20 }}
          >
            <Input
              className="h-8 flex-1 text-[13px]"
              value={node.text ?? ""}
              placeholder={placeholder}
              readOnly={readOnly}
              onChange={(e) =>
                patch(node.id, { ...node, text: e.target.value })
              }
            />
            {extras?.(node, (next) => patch(node.id, next))}
            {!readOnly && (
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label="Desindentar"
                  title="Desindentar"
                  onClick={() => onChange(outdentNode(nodes, node.id))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label="Indentar"
                  title="Indentar"
                  onClick={() => onChange(indentNode(nodes, node.id))}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label="Adicionar item abaixo"
                  title="Adicionar item abaixo"
                  onClick={() => onChange(addSibling(nodes, node.id, novoNo()))}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label="Remover item (e o que estiver abaixo dele)"
                  title="Remover"
                  onClick={() => onChange(removeNode(nodes, node.id))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          {node.children.length > 0 && (
            <EditorArvore
              nodes={node.children as T[]}
              onChange={(children) => patch(node.id, { ...node, children })}
              novoNo={novoNo}
              extras={extras}
              placeholder={placeholder}
              readOnly={readOnly}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
      {!readOnly && depth === 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => onChange([...nodes, novoNo()])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}
