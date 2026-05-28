import { useEffect, useState } from "react";
import { KpiTabs, type KpiTabId } from "./_components/kpi-tabs";
import { LancarScreen } from "./_components/lancar-screen";
import { RacScreen } from "./_components/rac-screen";
import { AuditoriaScreen } from "./_components/auditoria-screen";
import KpiDashboardPage from "./dashboard";
import KpiIndicadoresPage from "./indicadores";
import KpiLancamentosPage from "./lancamentos";

const ADVANCED_LANCAR_STORAGE_KEY = "kpi:lancar:advanced";

/**
 * Shell de página única do módulo de Indicadores (KPI), espelhando o protótipo
 * IndicaOS. As abas (Dashboard, Indicadores) trocam por estado — sem navegação
 * de rota. As rotas /kpi/dashboard e /kpi/lancamentos seguem registradas como
 * páginas avulsas para uso futuro, mas o shell não navega até elas.
 */
function initialTab(): KpiTabId {
  // Deep-link a um indicador (#ind-card-N) abre direto na aba Indicadores.
  if (
    typeof window !== "undefined" &&
    (window.location.hash.startsWith("#ind-card-") ||
      window.location.hash.startsWith("#ind-edit-"))
  ) {
    return "indicadores";
  }
  return "dashboard";
}

export default function KpiModulePage() {
  const [tab, setTab] = useState<KpiTabId>(initialTab);
  /**
   * Indicador que deve receber foco ao entrar na aba "Lançar". É setado
   * pelo callback `onOpenInLancar` (vindo do drawer Explorar Corporativo
   * ou dos badges de composição) ANTES da troca de aba. LancarScreen
   * consome via prop + reseta para null logo após scrollar — assim o
   * foco não persiste em re-entradas naturais na aba.
   */
  const [pendingFocusId, setPendingFocusId] = useState<number | null>(null);
  // Toggle entre a fila guiada (LancarScreen) e a planilha avançada
  // (KpiAlimentacaoPage). Persistido em localStorage pra Ana não precisar
  // re-ativar a cada visita — o modo avançado é a UX antiga.
  const [advancedLancar, setAdvancedLancar] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(ADVANCED_LANCAR_STORAGE_KEY) === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      ADVANCED_LANCAR_STORAGE_KEY,
      advancedLancar ? "1" : "0",
    );
  }, [advancedLancar]);

  return (
    <div className="flex min-h-full flex-col">
      <KpiTabs active={tab} onChange={setTab} />
      {tab === "indicadores" ? (
        <KpiIndicadoresPage
          onOpenInLancar={(indicatorId) => {
            setPendingFocusId(indicatorId);
            setTab("lancamentos");
          }}
        />
      ) : tab === "lancamentos" ? (
        advancedLancar ? (
          <KpiLancamentosPage
            advanced={advancedLancar}
            onAdvancedChange={setAdvancedLancar}
          />
        ) : (
          <LancarScreen
            onEditIndicator={(id) => {
              window.history.replaceState(
                null,
                "",
                `${window.location.pathname}#ind-edit-${id}`,
              );
              setTab("indicadores");
            }}
            initialIndicatorId={pendingFocusId}
            onInitialIndicatorConsumed={() => setPendingFocusId(null)}
            advanced={advancedLancar}
            onAdvancedChange={setAdvancedLancar}
          />
        )
      ) : tab === "rac" ? (
        <RacScreen />
      ) : tab === "auditoria" ? (
        <AuditoriaScreen />
      ) : (
        <KpiDashboardPage
          onSelectIndicator={(id) => {
            // O efeito de scroll de indicadores.tsx lê o hash ao montar.
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}#ind-card-${id}`,
            );
            setTab("indicadores");
          }}
        />
      )}
    </div>
  );
}
