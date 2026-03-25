import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/contexts/LayoutContext";
import {
  useListMyRevisionRequests,
  getListMyRevisionRequestsQueryKey,
} from "@workspace/api-client-react";
import type { DocumentRevisionRequest } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, XCircle, FileText } from "lucide-react";

function formatDateTime(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(d);
  }
}

export default function MinhasRevisoesPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();

  usePageTitle("Minhas Revisões");

  const { data: requests, isLoading } = useListMyRevisionRequests(orgId!, {
    query: {
      queryKey: getListMyRevisionRequestsQueryKey(orgId!),
      enabled: !!orgId,
    },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold">Minhas Revisões</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Solicitações de revisão pendentes onde você é o revisor designado.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
      ) : !requests || requests.length === 0 ? (
        <div className="py-16 text-center">
          <CheckCircle className="w-10 h-10 mx-auto text-emerald-400/50 mb-3" />
          <p className="text-muted-foreground">Nenhuma solicitação de revisão pendente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r: DocumentRevisionRequest) => (
            <div
              key={r.id}
              className="border border-border/60 rounded-lg p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      <Clock className="h-3 w-3" /> Pendente
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-0.5">
                    {r.documentTitle || `Documento #${r.documentId}`}
                  </p>
                  <p className="text-sm text-muted-foreground">{r.changeDescription}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Solicitante: {r.requestedByName || "—"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/qualidade/documentacao/${r.documentId}?tab=revisions`)}
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Ver Documento
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
