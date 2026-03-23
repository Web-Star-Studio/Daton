import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { usePermissions } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganizationUsersSettingsSection } from "@/components/settings/OrganizationUsersSettingsSection";
import { cn } from "@/lib/utils";

type SystemTab = "users" | "appearance";

export default function SystemSettingsPage() {
  const { isOrgAdmin } = usePermissions();
  const { theme, setTheme } = useTheme();
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
          <section className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm">
            <div className="mb-2">
              <h2 className="text-lg font-semibold text-foreground">Tema visual</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Escolha como o Daton aparece para você. A preferência é salva separadamente para cada usuário neste navegador.
              </p>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {([
                { value: "light", label: "Claro", description: "Fundo claro com texto escuro", icon: Sun },
                { value: "dark", label: "Escuro", description: "Fundo escuro com texto claro", icon: Moon },
                { value: "system", label: "Sistema", description: "Segue a preferência do dispositivo", icon: Monitor },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "flex flex-col items-center gap-3 rounded-xl border-2 p-5 text-center transition-colors cursor-pointer",
                    theme === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-foreground/15",
                  )}
                >
                  <option.icon className={cn(
                    "h-6 w-6",
                    theme === option.value ? "text-primary" : "text-muted-foreground",
                  )} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{option.label}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{option.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm">
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
              <p className="text-sm font-medium text-foreground">Preferências de interface</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Ajustes de densidade, layout e preferências de navegação entrarão nesta área.
              </p>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
