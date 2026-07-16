import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { ActionTabs, type ActionTabId } from "./planos-acao/_components/action-tabs";
import { ListaScreen } from "./planos-acao/_components/lista-screen";
import { PainelExecutivo } from "./planos-acao/_components/painel-executivo";
import { PainelOperacional } from "./planos-acao/_components/painel-operacional";
import { AuditoriaScreen } from "./planos-acao/_components/auditoria-screen";
import { EficaciaScreen } from "./planos-acao/_components/eficacia-screen";
import { NovaAcaoDialog } from "./planos-acao/_components/nova-acao-dialog";

export default function ActionPlansModulePage() {
  const { organization } = useAuth();
  const { canWrite } = usePermissions();
  const orgId = organization!.id;

  usePageTitle("Gestão de Ações");
  usePageSubtitle("Tratamento central de ações corretivas, preventivas e de melhoria");

  const [tab, setTab] = useState<ActionTabId>("lista");
  const [novaOpen, setNovaOpen] = useState(false);

  useHeaderActions(
    canWrite ? (
      <Button size="sm" onClick={() => setNovaOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" /> Novo plano de ação
      </Button>
    ) : null,
  );

  return (
    <div className="p-6">
      <ActionTabs active={tab} onChange={setTab} />
      <div className="pt-5">
        {tab === "lista" && <ListaScreen orgId={orgId} canWrite={canWrite} onNova={() => setNovaOpen(true)} />}
        {tab === "executivo" && <PainelExecutivo orgId={orgId} />}
        {tab === "operacional" && <PainelOperacional orgId={orgId} />}
        {tab === "auditoria" && <AuditoriaScreen orgId={orgId} />}
        {tab === "eficacia" && <EficaciaScreen orgId={orgId} />}
      </div>
      <NovaAcaoDialog orgId={orgId} open={novaOpen} onOpenChange={setNovaOpen} />
    </div>
  );
}
