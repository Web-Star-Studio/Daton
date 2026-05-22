import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { RoadSafetyTabs, type RoadSafetyTab } from "./_components/road-safety-tabs";
import { PainelScreen } from "./_components/painel";
import { CadastroScreen } from "./_components/cadastro";
import { LancamentosScreen } from "./_components/lancamentos";
import { EvidenciaScreen } from "./_components/evidencia";

/**
 * Módulo de Fatores de Desempenho da Segurança Viária (ISO 39001 · 6.3).
 * Shell de aba única — Painel / Cadastro / Lançar / Evidência — espelhando o
 * protótipo. O estado de navegação (aba ativa, FD em edição/lançamento) vive
 * aqui para que mudar de aba não perca o contexto selecionado.
 */
export default function RoadSafetyModulePage() {
  const { organization } = useAuth();
  const orgId = organization!.id;

  const [tab, setTab] = useState<RoadSafetyTab>("painel");
  const [editFactorId, setEditFactorId] = useState<number | null>(null);
  const [launchFactorId, setLaunchFactorId] = useState<number | null>(null);

  usePageTitle("Fatores de Desempenho");
  usePageSubtitle("Segurança Viária · ISO 39001 · item 6.3");

  const goEdit = (id: number | null) => {
    setEditFactorId(id);
    setTab("cadastro");
  };
  const goLaunch = (id: number | null) => {
    setLaunchFactorId(id);
    setTab("lancamentos");
  };

  useHeaderActions(
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => setTab("evidencia")}>
        <FileText className="mr-1.5 h-4 w-4" />
        Gerar Evidência
      </Button>
      <Button size="sm" onClick={() => goEdit(null)}>
        <Plus className="mr-1.5 h-4 w-4" />
        Novo FD
      </Button>
    </div>,
  );

  return (
    <div className="flex min-h-full flex-col">
      <RoadSafetyTabs active={tab} onChange={setTab} />
      <div className="pt-4">
        {tab === "painel" && (
          <PainelScreen orgId={orgId} onView={goEdit} onLaunch={goLaunch} onNew={() => goEdit(null)} />
        )}
        {tab === "cadastro" && (
          <CadastroScreen
            orgId={orgId}
            factorId={editFactorId}
            onSaved={() => setTab("painel")}
            onCancel={() => setTab("painel")}
          />
        )}
        {tab === "lancamentos" && (
          <LancamentosScreen orgId={orgId} initialFactorId={launchFactorId} />
        )}
        {tab === "evidencia" && <EvidenciaScreen orgId={orgId} />}
      </div>
    </div>
  );
}
