import React, { useEffect, useState } from "react";
import { usePermissions } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { OrganizationUsersSettingsSection } from "@/components/settings/OrganizationUsersSettingsSection";

type SystemTab = "users" | "appearance";

export default function SystemSettingsPage() {
  const { isOrgAdmin } = usePermissions();
  const defaultTab: SystemTab = isOrgAdmin ? "users" : "appearance";
  const [activeTab, setActiveTab] = useState<SystemTab>(defaultTab);

  usePageTitle("Ajustes do sistema");
  usePageSubtitle("Gerencie acessos internos e configurações estruturais do ambiente.");

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SystemTab)}>
        <TabsList>
          {isOrgAdmin && <TabsTrigger value="users">Usuários</TabsTrigger>}
          <TabsTrigger value="appearance">Aparência</TabsTrigger>
        </TabsList>

        {isOrgAdmin && (
          <TabsContent value="users">
            <OrganizationUsersSettingsSection />
          </TabsContent>
        )}

        <TabsContent value="appearance" className="space-y-6">
          <section className="rounded-2xl border border-border/60 bg-white/70 p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">Aparência</h2>
              <Badge variant="secondary" className="text-[10px]">
                Estrutural
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Esta aba prepara a área de configuração visual do sistema. Nesta primeira
              entrega, ela entra como estrutura base e espaço reservado para preferências
              futuras de aparência.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                <p className="text-sm font-medium text-foreground">Tema visual</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Configurações de tema e contraste serão adicionadas aqui.
                </p>
              </div>
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                <p className="text-sm font-medium text-foreground">Preferências de interface</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Ajustes de densidade, layout e preferências de navegação entrarão nesta área.
                </p>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
