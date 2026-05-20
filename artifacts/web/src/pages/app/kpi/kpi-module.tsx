import { useLocation } from "wouter";
import { KpiTabs, getKpiTab } from "./_components/kpi-tabs";
import KpiDashboardPage from "./dashboard";
import KpiIndicadoresPage from "./indicadores";
import KpiLancamentosPage from "./lancamentos";

/**
 * Single-page shell for the KPI module — a top tab bar (mirroring the IndicaOS
 * prototype) hosts Dashboard / Indicadores / Lançar. The active tab is derived
 * from the route so deep-links (/kpi/dashboard, /kpi/indicadores, …) keep working.
 */
export default function KpiModulePage() {
  const [location] = useLocation();
  const active = getKpiTab(location);

  return (
    <div className="flex min-h-full flex-col">
      <KpiTabs active={active} />
      {active === "indicadores" ? (
        <KpiIndicadoresPage />
      ) : active === "lancamentos" ? (
        <KpiLancamentosPage />
      ) : (
        <KpiDashboardPage />
      )}
    </div>
  );
}
