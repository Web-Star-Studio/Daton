import { useState } from "react";
import { useLocation } from "wouter";
import { useHeaderActions } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";
import { useListDocuments, getListDocumentsQueryKey, useListUnits } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Plus, FileText } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em Revisão",
  approved: "Aprovado",
  rejected: "Rejeitado",
  distributed: "Distribuído",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_review: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  distributed: "bg-blue-50 text-blue-700",
};

const TYPE_LABELS: Record<string, string> = {
  manual: "Manual",
  procedimento: "Procedimento",
  instrucao: "Instrução",
  formulario: "Formulário",
  registro: "Registro",
  politica: "Política",
  outro: "Outro",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
}

export default function DocumentacaoPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState<number | undefined>(undefined);

  const { data: units } = useListUnits(orgId!, {
    query: { enabled: !!orgId },
  });

  const { data: documents, isLoading } = useListDocuments(
    orgId!,
    {
      search: search || undefined,
      type: typeFilter || undefined,
      status: statusFilter || undefined,
      unitId: unitFilter,
    },
    {
      query: {
        queryKey: [...getListDocumentsQueryKey(orgId!), search, typeFilter, statusFilter, unitFilter],
        enabled: !!orgId,
      },
    }
  );

  useHeaderActions(
    <Button size="sm" onClick={() => navigate("/app/qualidade/documentacao/novo")}>
      <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo Documento
    </Button>
  );

  return (
    <>
      <div className="flex flex-wrap gap-6 items-end mb-8">
        <div className="flex-1 min-w-[200px]">
          <Label>Buscar</Label>
          <Input
            placeholder="Título do documento..."
            className="mt-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Label>Tipo</Label>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="mt-2">
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Label>Status</Label>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="mt-2">
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Label>Filial</Label>
          <Select
            value={unitFilter?.toString() ?? ""}
            onChange={(e) => setUnitFilter(e.target.value ? parseInt(e.target.value, 10) : undefined)}
            className="mt-2"
          >
            <option value="">Todas</option>
            {units?.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Título</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Versão</th>
                <th className="px-6 py-4">Validade</th>
                <th className="px-6 py-4">Criado por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : documents?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <FileText className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground">Nenhum documento encontrado.</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">Crie um novo documento para começar.</p>
                  </td>
                </tr>
              ) : (
                documents?.map((doc) => (
                  <tr
                    key={doc.id}
                    className="hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/app/qualidade/documentacao/${doc.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{doc.title}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-muted-foreground text-xs">{TYPE_LABELS[doc.type] || doc.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABELS[doc.status] || doc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      v{doc.currentVersion}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {formatDate(doc.validityDate)}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {doc.createdByName || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
