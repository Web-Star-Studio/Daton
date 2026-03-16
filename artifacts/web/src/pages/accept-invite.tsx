import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { getValidateInviteTokenQueryKey, useValidateInviteToken, useAcceptInvitation } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import authBg from "@assets/Gemini_Generated_Image_y7vg0oy7vg0oy7vg_1773347119413.png";

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [, setLocation] = useLocation();
  const { login } = useAuth();

  const { data, isLoading, error } = useValidateInviteToken(token, {
    query: {
      queryKey: getValidateInviteTokenQueryKey(token),
      enabled: !!token,
      retry: false,
    },
  });

  const acceptMut = useAcceptInvitation();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!name.trim()) {
      setFormError("Informe seu nome");
      return;
    }
    if (password.length < 6) {
      setFormError("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    try {
      const result = await acceptMut.mutateAsync({
        token,
        data: { name: name.trim(), password },
      });
      if (result.token) {
        login(result.token);
        setLocation("/organizacao");
      }
    } catch (err: any) {
      setFormError(err?.response?.data?.error || err?.data?.error || "Erro ao aceitar convite");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Verificando convite...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden lg:flex lg:w-1/2 relative items-end p-12">
          <img src={authBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-4">
            <h1 className="text-2xl font-bold text-foreground">Convite inválido</h1>
            <p className="text-muted-foreground">
              Este link de convite é inválido, já foi utilizado ou expirou.
            </p>
            <Button variant="outline" onClick={() => setLocation("/")}>
              Ir para login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-1/2 relative items-end p-12">
        <img src={authBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <h1 className="relative z-10 text-4xl font-bold text-white leading-tight drop-shadow-lg">
          Bem-vindo ao Daton — sua plataforma de gestão ESG.
        </h1>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Aceitar convite</h1>
            <p className="text-muted-foreground mt-1">
              <strong>{data.invitedByName}</strong> convidou você para fazer parte da organização{" "}
              <strong>{data.organizationName}</strong>.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={data.email}
                disabled
                className="bg-muted/50"
              />
            </div>
            <div>
              <Label>Seu nome</Label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome completo"
                autoFocus
              />
            </div>
            <div>
              <Label>Crie uma senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <Button type="submit" className="w-full" size="lg" isLoading={acceptMut.isPending}>
              Criar conta e entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
