import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useLayoutState } from "@/contexts/LayoutContext";
import {
  BarChart2,
  Bell,
  Building2,
  ChevronRight,
  Leaf,
  Landmark,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  Settings,
  Sparkles,
  Wrench,
} from "lucide-react";
import { cn, formatFirstAndLastName } from "@/lib/utils";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import {
  getListNotificationsQueryKey,
  useListNotifications,
} from "@workspace/api-client-react";

const datonLogo = "/images/daton-logo.png";
const appBg = "/images/bg-auth.png";

type AppModule =
  | "documents"
  | "legislations"
  | "employees"
  | "units"
  | "departments"
  | "positions"
  | "governance"
  | "suppliers"
  | "customers"
  | "environmental"
  | "kpi"
  | "assets";

type NavLink = {
  href: string;
  label: string;
};

type NavSection = {
  label: string;
  links: NavLink[];
};

type PopoverPosition = {
  left: number;
  top?: number;
  bottom?: number;
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, organization } = useAuth();
  const { hasModuleAccess } = usePermissions();
  const [location, navigate] = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isChatOpen, setChatOpen] = useState(false);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [organizacaoPopover, setOrganizacaoPopover] = useState(false);
  const [qualidadePopover, setQualidadePopover] = useState(false);
  const [governancaPopover, setGovernancaPopover] = useState(false);
  const [ambientalPopover, setAmbientalPopover] = useState(false);
  const [kpiPopover, setKpiPopover] = useState(false);
  const [infraestruturaPopover, setInfraestruturaPopover] = useState(false);
  const [configuracoesPopover, setConfiguracoesPopover] = useState(false);
  const [orgPopoverPos, setOrgPopoverPos] = useState<PopoverPosition>({
    top: 0,
    left: 0,
  });
  const [qualidadePopoverPos, setQualidadePopoverPos] =
    useState<PopoverPosition>({
      top: 0,
      left: 0,
    });
  const [governancaPopoverPos, setGovernancaPopoverPos] =
    useState<PopoverPosition>({
      top: 0,
      left: 0,
    });
  const [ambientalPopoverPos, setAmbientalPopoverPos] =
    useState<PopoverPosition>({
      top: 0,
      left: 0,
    });
  const [kpiPopoverPos, setKpiPopoverPos] = useState<PopoverPosition>({
    top: 0,
    left: 0,
  });
  const [infraestruturaPopoverPos, setInfraestruturaPopoverPos] =
    useState<PopoverPosition>({
      top: 0,
      left: 0,
    });
  const [configuracoesPopoverPos, setConfiguracoesPopoverPos] =
    useState<PopoverPosition>({
      left: 0,
      bottom: 0,
    });
  const organizacaoRef = useRef<HTMLDivElement>(null);
  const qualidadeRef = useRef<HTMLDivElement>(null);
  const governancaRef = useRef<HTMLDivElement>(null);
  const ambientalRef = useRef<HTMLDivElement>(null);
  const kpiRef = useRef<HTMLDivElement>(null);
  const infraestruturaRef = useRef<HTMLDivElement>(null);
  const configuracoesRef = useRef<HTMLDivElement>(null);
  const organizacaoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const qualidadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const governancaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const ambientalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const kpiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const infraestruturaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const configuracoesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const { headerActions, pageTitle } = useLayoutState();
  const orgId = organization?.id;
  const { data: notifData } = useListNotifications(orgId!, {
    query: {
      queryKey: getListNotificationsQueryKey(orgId!),
      enabled: !!orgId,
      refetchInterval: 30000,
    },
  });
  const unreadNotifCount = notifData?.unreadCount ?? 0;
  const normalizedLocation =
    location === "/app"
      ? "/organizacao"
      : location.replace(/^\/app(?=\/|$)/, "");
  const displayName = formatFirstAndLastName(user?.name);

  useEffect(() => {
    return () => {
      if (organizacaoTimeoutRef.current) {
        clearTimeout(organizacaoTimeoutRef.current);
        organizacaoTimeoutRef.current = null;
      }
      if (qualidadeTimeoutRef.current) {
        clearTimeout(qualidadeTimeoutRef.current);
        qualidadeTimeoutRef.current = null;
      }
      if (governancaTimeoutRef.current) {
        clearTimeout(governancaTimeoutRef.current);
        governancaTimeoutRef.current = null;
      }
      if (ambientalTimeoutRef.current) {
        clearTimeout(ambientalTimeoutRef.current);
        ambientalTimeoutRef.current = null;
      }
      if (kpiTimeoutRef.current) {
        clearTimeout(kpiTimeoutRef.current);
        kpiTimeoutRef.current = null;
      }
      if (infraestruturaTimeoutRef.current) {
        clearTimeout(infraestruturaTimeoutRef.current);
        infraestruturaTimeoutRef.current = null;
      }
      if (configuracoesTimeoutRef.current) {
        clearTimeout(configuracoesTimeoutRef.current);
        configuracoesTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const moduleByPath: Array<{ prefix: string; module: AppModule }> = [
      { prefix: "/qualidade/legislacoes", module: "legislations" },
      { prefix: "/qualidade/fornecedores", module: "suppliers" },
      { prefix: "/qualidade/clientes", module: "customers" },
      { prefix: "/organizacao/colaboradores", module: "employees" },
      { prefix: "/organizacao/unidades", module: "units" },
      { prefix: "/organizacao/departamentos", module: "departments" },
      { prefix: "/organizacao/cargos", module: "positions" },
      { prefix: "/governanca", module: "governance" },
      { prefix: "/ambiental", module: "environmental" },
      { prefix: "/kpi", module: "kpi" },
      { prefix: "/infraestrutura", module: "assets" },
    ];

    const deniedRoute = moduleByPath.find(
      (entry) =>
        normalizedLocation.startsWith(entry.prefix) &&
        !hasModuleAccess(entry.module),
    );
    if (deniedRoute) {
      navigate("/organizacao");
      return;
    }
  }, [hasModuleAccess, navigate, normalizedLocation]);

  const isActive = (path: string) => normalizedLocation.startsWith(path);
  const isNavLinkActive = (href: string) =>
    normalizedLocation === href || normalizedLocation.startsWith(`${href}/`);

  const getBreadcrumbs = (): { label: string; href?: string }[] => {
    const crumbs: { label: string; href?: string }[] = [];

    if (normalizedLocation.startsWith("/qualidade")) {
      crumbs.push({ label: "Qualidade" });

      if (normalizedLocation.startsWith("/qualidade/legislacoes")) {
        crumbs.push({ label: "Legislações", href: "/qualidade/legislacoes" });
        if (pageTitle && normalizedLocation !== "/qualidade/legislacoes") {
          crumbs.push({ label: pageTitle });
        }
      } else if (normalizedLocation.startsWith("/qualidade/documentacao")) {
        crumbs.push({ label: "Documentação", href: "/qualidade/documentacao" });
        if (pageTitle && normalizedLocation !== "/qualidade/documentacao") {
          crumbs.push({ label: pageTitle });
        }
      } else if (normalizedLocation.startsWith("/qualidade/fornecedores")) {
        crumbs.push({ label: "Fornecedores", href: "/qualidade/fornecedores" });
        if (pageTitle && normalizedLocation !== "/qualidade/fornecedores") {
          crumbs.push({ label: pageTitle });
        }
      } else if (normalizedLocation.startsWith("/qualidade/clientes")) {
        crumbs.push({ label: "Clientes SGI", href: "/qualidade/clientes" });
        if (pageTitle && normalizedLocation !== "/qualidade/clientes") {
          crumbs.push({ label: pageTitle });
        }
      }
    } else if (normalizedLocation.startsWith("/organizacao")) {
      crumbs.push({ label: "Organização", href: "/organizacao" });

      if (normalizedLocation.startsWith("/organizacao/colaboradores")) {
        crumbs.push({
          label: "Colaboradores",
          href: "/organizacao/colaboradores",
        });
        if (pageTitle && normalizedLocation !== "/organizacao/colaboradores") {
          crumbs.push({ label: pageTitle });
        }
      } else if (normalizedLocation.startsWith("/organizacao/unidades")) {
        crumbs.push({ label: "Unidades", href: "/organizacao/unidades" });
        if (pageTitle && normalizedLocation !== "/organizacao/unidades") {
          crumbs.push({ label: pageTitle });
        }
      } else if (normalizedLocation.startsWith("/organizacao/departamentos")) {
        crumbs.push({
          label: "Departamentos",
          href: "/organizacao/departamentos",
        });
      } else if (normalizedLocation.startsWith("/organizacao/cargos")) {
        crumbs.push({ label: "Cargos", href: "/organizacao/cargos" });
      }
    } else if (normalizedLocation.startsWith("/infraestrutura")) {
      crumbs.push({ label: "Infraestrutura" });

      if (normalizedLocation.startsWith("/infraestrutura/ativos")) {
        crumbs.push({ label: "Ativos", href: "/infraestrutura/ativos" });
      } else if (normalizedLocation.startsWith("/infraestrutura/ambiente")) {
        crumbs.push({
          label: "Ambiente Operacional",
          href: "/infraestrutura/ambiente",
        });
      } else if (normalizedLocation.startsWith("/infraestrutura/medicao")) {
        crumbs.push({
          label: "Instrumentos de Medição",
          href: "/infraestrutura/medicao",
        });
      }
    } else if (normalizedLocation.startsWith("/governanca")) {
      crumbs.push({ label: "Governança" });

      if (normalizedLocation.startsWith("/governanca/riscos-oportunidades")) {
        crumbs.push({
          label: "Riscos e Oportunidades",
          href: "/governanca/riscos-oportunidades",
        });
      } else if (
        normalizedLocation.startsWith("/governanca/planejamento-operacional")
      ) {
        crumbs.push({
          label: "Planejamento Operacional",
          href: "/governanca/planejamento-operacional",
        });
      } else if (
        normalizedLocation.startsWith("/governanca/conhecimento-critico")
      ) {
        crumbs.push({
          label: "Conhecimento Crítico",
          href: "/governanca/conhecimento-critico",
        });
      } else if (normalizedLocation.startsWith("/governanca/processos-sgq")) {
        crumbs.push({
          label: "Processos SGQ",
          href: "/governanca/processos-sgq",
        });
      } else if (
        normalizedLocation.startsWith("/governanca/projeto-desenvolvimento")
      ) {
        crumbs.push({
          label: "Projeto e Desenvolvimento",
          href: "/governanca/projeto-desenvolvimento",
        });
      } else if (normalizedLocation.startsWith("/governanca/auditorias")) {
        crumbs.push({
          label: "Auditorias",
          href: "/governanca/auditorias",
        });
      } else if (
        normalizedLocation.startsWith("/governanca/nao-conformidades")
      ) {
        crumbs.push({
          label: "Não Conformidades",
          href: "/governanca/nao-conformidades",
        });
      } else if (
        normalizedLocation.startsWith("/governanca/analises-criticas")
      ) {
        crumbs.push({
          label: "Análises Críticas",
          href: "/governanca/analises-criticas",
        });
      } else if (normalizedLocation.startsWith("/governanca/planejamento")) {
        crumbs.push({
          label: "Planejamento",
          href: "/governanca/planejamento",
        });
        if (pageTitle && normalizedLocation !== "/governanca/planejamento") {
          crumbs.push({ label: pageTitle });
        }
      }
    } else if (normalizedLocation.startsWith("/ambiental")) {
      crumbs.push({ label: "Ambiental" });

      if (normalizedLocation.startsWith("/ambiental/laia")) {
        crumbs.push({ label: "LAIA", href: "/ambiental/laia" });
        if (pageTitle && normalizedLocation !== "/ambiental/laia") {
          crumbs.push({ label: pageTitle });
        }
      }
    } else if (normalizedLocation.startsWith("/kpi")) {
      crumbs.push({ label: "Indicadores (KPI)" });

      if (normalizedLocation.startsWith("/kpi/indicadores")) {
        crumbs.push({ label: "Indicadores", href: "/kpi/indicadores" });
      } else if (normalizedLocation.startsWith("/kpi/lancamentos")) {
        crumbs.push({ label: "Lançamento", href: "/kpi/lancamentos" });
      } else if (normalizedLocation.startsWith("/kpi/dashboard")) {
        crumbs.push({ label: "Dashboard", href: "/kpi/dashboard" });
      }
    } else if (normalizedLocation.startsWith("/configuracoes")) {
      crumbs.push({ label: "Configurações" });

      if (normalizedLocation.startsWith("/configuracoes/perfil")) {
        crumbs.push({ label: "Ajustes de perfil" });
      } else if (normalizedLocation.startsWith("/configuracoes/sistema")) {
        crumbs.push({ label: "Ajustes do sistema" });
      }
    }

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  const organizacaoLinks: NavLink[] = [
    { href: "/organizacao", label: "Visão Geral" },
    ...(hasModuleAccess("employees")
      ? [{ href: "/organizacao/colaboradores", label: "Colaboradores" }]
      : []),
    ...(hasModuleAccess("units")
      ? [{ href: "/organizacao/unidades", label: "Unidades" }]
      : []),
    ...(hasModuleAccess("departments")
      ? [{ href: "/organizacao/departamentos", label: "Departamentos" }]
      : []),
    ...(hasModuleAccess("positions")
      ? [{ href: "/organizacao/cargos", label: "Cargos" }]
      : []),
  ];

  const qualidadeLinks: NavLink[] = [
    ...(hasModuleAccess("legislations")
      ? [{ href: "/qualidade/legislacoes", label: "Legislações" }]
      : []),
    ...(hasModuleAccess("suppliers")
      ? [{ href: "/qualidade/fornecedores", label: "Fornecedores" }]
      : []),
    ...(hasModuleAccess("customers")
      ? [{ href: "/qualidade/clientes", label: "Clientes SGI" }]
      : []),
    { href: "/qualidade/documentacao", label: "Documentação" },
  ];

  const governancaLinks: NavLink[] = [
    { href: "/governanca/planejamento", label: "Planejamento" },
    {
      href: "/governanca/riscos-oportunidades",
      label: "Riscos e Oportunidades",
    },
  ];
  const governancaSections: NavSection[] = [
    {
      label: "Planejamento Estratégico",
      links: governancaLinks,
    },
    {
      label: "Planejamento Operacional",
      links: [
        {
          href: "/governanca/planejamento-operacional",
          label: "Planejamento Operacional",
        },
      ],
    },
    {
      label: "Gestão do Sistema",
      links: [
        { href: "/governanca/processos-sgq", label: "Processos SGQ" },
        {
          href: "/governanca/projeto-desenvolvimento",
          label: "Projeto e Desenvolvimento",
        },
        {
          href: "/governanca/conhecimento-critico",
          label: "Conhecimento Crítico",
        },
        { href: "/governanca/auditorias", label: "Auditorias" },
        { href: "/governanca/nao-conformidades", label: "Não Conformidades" },
        { href: "/governanca/analises-criticas", label: "Análises Críticas" },
      ],
    },
  ];
  const ambientalSections: NavSection[] = [
    {
      label: "Gestão Ambiental",
      links: [{ href: "/ambiental/laia", label: "LAIA" }],
    },
  ];

  const configuracoesLinks: NavLink[] = [
    { href: "/configuracoes/perfil", label: "Perfil" },
    { href: "/configuracoes/sistema", label: "Sistema" },
  ];

  const kpiLinks: NavLink[] = [
    { href: "/kpi/indicadores", label: "Indicadores" },
    { href: "/kpi/lancamentos", label: "Lançamentos" },
    { href: "/kpi/dashboard", label: "Dashboard" },
  ];

  const infraestruturaLinks: NavLink[] = [
    ...(hasModuleAccess("assets")
      ? [
          { href: "/infraestrutura/ativos", label: "Ativos" },
          { href: "/infraestrutura/ambiente", label: "Ambiente Operacional" },
          { href: "/infraestrutura/medicao", label: "Instrumentos de Medição" },
        ]
      : []),
  ];

  const showQualidade = qualidadeLinks.length > 0;
  const showGovernanca = hasModuleAccess("governance");
  const showAmbiental = hasModuleAccess("environmental");
  const showKpi = hasModuleAccess("kpi");
  const showInfraestrutura = infraestruturaLinks.length > 0;

  const openPopover = (
    ref: React.RefObject<HTMLDivElement | null>,
    setPos: React.Dispatch<React.SetStateAction<PopoverPosition>>,
    setOpen: React.Dispatch<React.SetStateAction<boolean>>,
    timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    preferredSide: "down" | "up" = "down",
  ) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const left = rect.right + 6;

      if (preferredSide === "up") {
        setPos({
          left,
          bottom: window.innerHeight - rect.bottom,
        });
      } else {
        setPos({
          left,
          top: rect.top,
        });
      }
    }

    setOpen(true);
  };

  const closePopover = (
    setOpen: React.Dispatch<React.SetStateAction<boolean>>,
    timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  ) => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  const renderPopover = (
    title: string,
    links: NavLink[],
    isOpen: boolean,
    setOpen: React.Dispatch<React.SetStateAction<boolean>>,
    position: PopoverPosition,
    timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  ) => {
    if (!isOpen) return null;

    return (
      <div
        className="fixed z-[100] min-w-[190px] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-border/60 bg-popover px-1.5 py-2 shadow-lg animate-[popoverIn_150ms_cubic-bezier(0.16,1,0.3,1)]"
        style={{
          left: position.left,
          top: position.top,
          bottom: position.bottom,
        }}
        onMouseEnter={() => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
        }}
        onMouseLeave={() => closePopover(setOpen, timeoutRef)}
      >
        <p className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center rounded-lg px-2.5 py-2 text-[12px] transition-colors cursor-pointer",
              isNavLinkActive(link.href)
                ? "bg-muted/50 font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>
    );
  };

  const renderSectionPopover = (
    sections: NavSection[],
    isOpen: boolean,
    setOpen: React.Dispatch<React.SetStateAction<boolean>>,
    position: PopoverPosition,
    timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  ) => {
    if (!isOpen) return null;

    return (
      <div
        className="fixed z-[100] min-w-[230px] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-border/60 bg-popover px-1.5 py-2 shadow-lg animate-[popoverIn_150ms_cubic-bezier(0.16,1,0.3,1)]"
        style={{
          left: position.left,
          top: position.top,
          bottom: position.bottom,
        }}
        onMouseEnter={() => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
        }}
        onMouseLeave={() => closePopover(setOpen, timeoutRef)}
      >
        {sections.map((section) => (
          <div key={section.label} className="mb-1 last:mb-0">
            <p className="px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
            {section.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center rounded-lg px-2.5 py-2 text-[12px] transition-colors cursor-pointer",
                  isNavLinkActive(link.href)
                    ? "bg-muted/50 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="app-bg-overlay flex h-screen w-full overflow-hidden gap-2.5 bg-cover bg-center bg-no-repeat p-2.5"
      style={{
        ["--app-bg-url" as string]: `url(${appBg})`,
      }}
    >
      <aside
        className={cn(
          "z-20 flex shrink-0 flex-col rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-md transition-all duration-300",
          isSidebarOpen ? "w-[228px]" : "w-14",
        )}
      >
        <div className="flex h-14 items-center justify-center">
          <img
            src={datonLogo}
            alt="Daton"
            className={cn(
              "object-contain transition-all duration-300 dark:invert",
              isSidebarOpen ? "h-6" : "h-4",
            )}
          />
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto px-2.5 py-5">
          <div
            ref={organizacaoRef}
            onMouseEnter={() =>
              openPopover(
                organizacaoRef,
                setOrgPopoverPos,
                setOrganizacaoPopover,
                organizacaoTimeoutRef,
              )
            }
            onMouseLeave={() =>
              closePopover(setOrganizacaoPopover, organizacaoTimeoutRef)
            }
          >
            <Link
              href="/organizacao"
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors cursor-pointer",
                isActive("/organizacao")
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div className="flex items-center">
                <Building2
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    isSidebarOpen && "mr-2.5",
                  )}
                />
                {isSidebarOpen && <span>Organização</span>}
              </div>
              {isSidebarOpen && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
            </Link>
          </div>

          {showGovernanca && (
            <div
              ref={governancaRef}
              onMouseEnter={() =>
                openPopover(
                  governancaRef,
                  setGovernancaPopoverPos,
                  setGovernancaPopover,
                  governancaTimeoutRef,
                )
              }
              onMouseLeave={() =>
                closePopover(setGovernancaPopover, governancaTimeoutRef)
              }
            >
              <Link
                href={governancaLinks[0].href}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors cursor-pointer",
                  isActive("/governanca")
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="flex items-center">
                  <Landmark
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isSidebarOpen && "mr-2.5",
                    )}
                  />
                  {isSidebarOpen && <span>Governança</span>}
                </div>
                {isSidebarOpen && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
              </Link>
            </div>
          )}

          {showAmbiental && (
            <div
              ref={ambientalRef}
              onMouseEnter={() =>
                openPopover(
                  ambientalRef,
                  setAmbientalPopoverPos,
                  setAmbientalPopover,
                  ambientalTimeoutRef,
                )
              }
              onMouseLeave={() =>
                closePopover(setAmbientalPopover, ambientalTimeoutRef)
              }
            >
              <Link
                href="/ambiental/laia"
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors cursor-pointer",
                  isActive("/ambiental")
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="flex items-center">
                  <Leaf
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isSidebarOpen && "mr-2.5",
                    )}
                  />
                  {isSidebarOpen && <span>Ambiental</span>}
                </div>
                {isSidebarOpen && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
              </Link>
            </div>
          )}

          {showKpi && (
            <div
              ref={kpiRef}
              onMouseEnter={() =>
                openPopover(
                  kpiRef,
                  setKpiPopoverPos,
                  setKpiPopover,
                  kpiTimeoutRef,
                )
              }
              onMouseLeave={() => closePopover(setKpiPopover, kpiTimeoutRef)}
            >
              <Link
                href="/kpi/indicadores"
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors cursor-pointer",
                  isActive("/kpi")
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="flex items-center">
                  <BarChart2
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isSidebarOpen && "mr-2.5",
                    )}
                  />
                  {isSidebarOpen && <span>Indicadores</span>}
                </div>
                {isSidebarOpen && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
              </Link>
            </div>
          )}

          {showInfraestrutura && (
            <div
              ref={infraestruturaRef}
              onMouseEnter={() =>
                openPopover(
                  infraestruturaRef,
                  setInfraestruturaPopoverPos,
                  setInfraestruturaPopover,
                  infraestruturaTimeoutRef,
                )
              }
              onMouseLeave={() =>
                closePopover(setInfraestruturaPopover, infraestruturaTimeoutRef)
              }
            >
              <Link
                href="/infraestrutura/ativos"
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors cursor-pointer",
                  isActive("/infraestrutura")
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="flex items-center">
                  <Wrench
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isSidebarOpen && "mr-2.5",
                    )}
                  />
                  {isSidebarOpen && <span>Infraestrutura</span>}
                </div>
                {isSidebarOpen && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
              </Link>
            </div>
          )}

          {showQualidade && (
            <div
              ref={qualidadeRef}
              onMouseEnter={() =>
                openPopover(
                  qualidadeRef,
                  setQualidadePopoverPos,
                  setQualidadePopover,
                  qualidadeTimeoutRef,
                )
              }
              onMouseLeave={() =>
                closePopover(setQualidadePopover, qualidadeTimeoutRef)
              }
            >
              <Link
                href={qualidadeLinks[0].href}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors cursor-pointer",
                  isActive("/qualidade")
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="flex items-center">
                  <Scale
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isSidebarOpen && "mr-2.5",
                    )}
                  />
                  {isSidebarOpen && <span>Qualidade</span>}
                </div>
                {isSidebarOpen && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
              </Link>
            </div>
          )}

          {renderPopover(
            "Organização",
            organizacaoLinks,
            organizacaoPopover,
            setOrganizacaoPopover,
            orgPopoverPos,
            organizacaoTimeoutRef,
          )}
          {renderPopover(
            "Qualidade",
            qualidadeLinks,
            qualidadePopover,
            setQualidadePopover,
            qualidadePopoverPos,
            qualidadeTimeoutRef,
          )}
          {renderSectionPopover(
            governancaSections,
            governancaPopover,
            setGovernancaPopover,
            governancaPopoverPos,
            governancaTimeoutRef,
          )}
          {renderSectionPopover(
            ambientalSections,
            ambientalPopover,
            setAmbientalPopover,
            ambientalPopoverPos,
            ambientalTimeoutRef,
          )}
          {renderPopover(
            "Indicadores (KPI)",
            kpiLinks,
            kpiPopover,
            setKpiPopover,
            kpiPopoverPos,
            kpiTimeoutRef,
          )}
          {renderPopover(
            "Infraestrutura",
            infraestruturaLinks,
            infraestruturaPopover,
            setInfraestruturaPopover,
            infraestruturaPopoverPos,
            infraestruturaTimeoutRef,
          )}
        </div>

        <div className="space-y-1 px-2.5 pb-3">
          <div
            ref={configuracoesRef}
            onMouseEnter={() =>
              openPopover(
                configuracoesRef,
                setConfiguracoesPopoverPos,
                setConfiguracoesPopover,
                configuracoesTimeoutRef,
                "up",
              )
            }
            onMouseLeave={() =>
              closePopover(setConfiguracoesPopover, configuracoesTimeoutRef)
            }
          >
            <Link
              href={configuracoesLinks[0].href}
              className={cn(
                "flex h-10 w-full items-center justify-between rounded-lg px-2.5 text-[13px] leading-none transition-colors cursor-pointer",
                isActive("/configuracoes")
                  ? "bg-muted/50 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div className="flex h-full items-center">
                <Settings
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    isSidebarOpen && "mr-2.5",
                  )}
                />
                {isSidebarOpen && (
                  <span className="block leading-none">Ajustes</span>
                )}
              </div>
              {isSidebarOpen && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              )}
            </Link>
          </div>

          {renderPopover(
            "Ajustes",
            configuracoesLinks,
            configuracoesPopover,
            setConfiguracoesPopover,
            configuracoesPopoverPos,
            configuracoesTimeoutRef,
          )}
        </div>

        <div className="border-t border-border/40 px-2.5 py-3">
          <div
            className={cn(
              "flex items-center",
              isSidebarOpen ? "justify-between gap-2" : "justify-center",
            )}
          >
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-xs font-medium text-foreground/60">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              {isSidebarOpen && (
                <span className="truncate text-[13px] text-muted-foreground">
                  {displayName}
                </span>
              )}
            </div>
            {isSidebarOpen && (
              <button
                onClick={logout}
                className="cursor-pointer rounded p-1.5 text-muted-foreground/50 transition-colors hover:text-foreground"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/78 shadow-sm backdrop-blur-md">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border/40 bg-card/42 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="cursor-pointer rounded p-1.5 text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
            <nav className="flex items-center text-[13px]">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 && (
                    <span className="mx-2 text-muted-foreground/40">/</span>
                  )}
                  {crumb.href && index < breadcrumbs.length - 1 ? (
                    <Link
                      href={crumb.href}
                      className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={
                        index === breadcrumbs.length - 1
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {headerActions}
            <button
              onClick={() => setNotificationsOpen(!isNotificationsOpen)}
              className="relative cursor-pointer rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary/60 hover:text-foreground"
              title="Notificações"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
                  {unreadNotifCount}
                </span>
              )}
            </button>
            {isNotificationsOpen && (
              <NotificationsPanel onClose={() => setNotificationsOpen(false)} />
            )}
            {!isChatOpen && (
              <button
                onClick={() => setChatOpen(true)}
                className="cursor-pointer rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary/60 hover:text-foreground"
                title="Daton AI"
              >
                <Sparkles className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8">
          <div
            key={location}
            className="mx-auto w-full max-w-6xl lg:w-[90%] lg:max-w-[1440px] animate-fade-in-up"
          >
            {children}
          </div>
        </div>
      </main>

      <ChatPanel isOpen={isChatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
