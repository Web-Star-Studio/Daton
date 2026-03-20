import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useUpdateMe, useUpdateMyPassword } from "@workspace/api-client-react";

type ProfileFormData = {
  name: string;
  email: string;
};

type PasswordFormData = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export default function ProfileSettingsPage() {
  const { user, refreshAuth } = useAuth();
  const updateMeMut = useUpdateMe();
  const updateMyPasswordMut = useUpdateMyPassword();

  usePageTitle("Ajustes de perfil");
  usePageSubtitle("Atualize seus dados de acesso e segurança.");

  const profileForm = useForm<ProfileFormData>({
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
    },
  });
  const passwordForm = useForm<PasswordFormData>({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    profileForm.reset({
      name: user?.name ?? "",
      email: user?.email ?? "",
    });
  }, [profileForm, user?.email, user?.name]);

  if (!user) return null;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border/60 bg-white/70 p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">Perfil</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Edite seu nome e email de acesso.
          </p>
        </div>

        <form
          className="space-y-5"
          onSubmit={profileForm.handleSubmit(async (data) => {
            try {
              await updateMeMut.mutateAsync({
                data: {
                  name: data.name.trim(),
                  email: data.email.trim(),
                },
              });
              await refreshAuth();
              toast({
                title: "Perfil atualizado",
                description: "Seus dados foram salvos com sucesso.",
              });
            } catch (error: unknown) {
              const message =
                typeof error === "object" && error !== null && "data" in error
                  ? (error as { data?: { error?: string } }).data?.error
                  : error instanceof Error
                    ? error.message
                    : undefined;
              toast({
                title: "Erro ao salvar perfil",
                description: message || "Não foi possível atualizar seus dados.",
                variant: "destructive",
              });
            }
          })}
        >
          <div className="grid grid-cols-2 gap-5">
            <div>
              <Label>Nome</Label>
              <Input
                {...profileForm.register("name", {
                  required: "Informe seu nome",
                })}
                placeholder="Seu nome completo"
              />
              {profileForm.formState.errors.name && (
                <p className="mt-1.5 text-xs text-destructive">
                  {profileForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                {...profileForm.register("email", {
                  required: "Informe seu email",
                })}
                placeholder="voce@empresa.com"
              />
              {profileForm.formState.errors.email && (
                <p className="mt-1.5 text-xs text-destructive">
                  {profileForm.formState.errors.email.message}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" isLoading={updateMeMut.isPending}>
              Salvar perfil
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border/60 bg-white/70 p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">Segurança</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Troque sua senha de acesso.
          </p>
        </div>

        <form
          className="space-y-5"
          onSubmit={passwordForm.handleSubmit(async (data) => {
            if (data.newPassword !== data.confirmPassword) {
              passwordForm.setError("confirmPassword", {
                type: "manual",
                message: "A confirmação de senha não confere",
              });
              return;
            }

            try {
              await updateMyPasswordMut.mutateAsync({
                data: {
                  currentPassword: data.currentPassword,
                  newPassword: data.newPassword,
                  confirmPassword: data.confirmPassword,
                },
              });
              passwordForm.reset();
              toast({
                title: "Senha atualizada",
                description: "Sua senha foi alterada com sucesso.",
              });
            } catch (error: unknown) {
              const message =
                typeof error === "object" && error !== null && "data" in error
                  ? (error as { data?: { error?: string } }).data?.error
                  : error instanceof Error
                    ? error.message
                    : undefined;
              toast({
                title: "Erro ao atualizar senha",
                description: message || "Não foi possível atualizar sua senha.",
                variant: "destructive",
              });
            }
          })}
        >
          <div className="grid grid-cols-3 gap-5">
            <div>
              <Label>Senha atual</Label>
              <Input
                type="password"
                {...passwordForm.register("currentPassword", {
                  required: "Informe sua senha atual",
                })}
              />
              {passwordForm.formState.errors.currentPassword && (
                <p className="mt-1.5 text-xs text-destructive">
                  {passwordForm.formState.errors.currentPassword.message}
                </p>
              )}
            </div>
            <div>
              <Label>Nova senha</Label>
              <Input
                type="password"
                {...passwordForm.register("newPassword", {
                  required: "Informe a nova senha",
                  minLength: {
                    value: 6,
                    message: "A senha deve ter no mínimo 6 caracteres",
                  },
                })}
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="mt-1.5 text-xs text-destructive">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>
            <div>
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                {...passwordForm.register("confirmPassword", {
                  required: "Confirme a nova senha",
                })}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="mt-1.5 text-xs text-destructive">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              isLoading={updateMyPasswordMut.isPending}
            >
              Atualizar senha
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
