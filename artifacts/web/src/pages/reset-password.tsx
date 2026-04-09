import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";

const schema = z
  .object({
    newPassword: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
    confirmPassword: z.string().min(1, "Confirme sua senha"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

type TokenState = "loading" | "valid" | "invalid";

export default function ResetPasswordPage() {
  const authBg = "/images/bg-auth.png";
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [tokenState, setTokenState] = useState<TokenState>("loading");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      return;
    }
    fetch(`${apiBase}/api/auth/password-reset/validate/${encodeURIComponent(token)}`)
      .then((res) => {
        setTokenState(res.ok ? "valid" : "invalid");
      })
      .catch(() => setTokenState("invalid"));
  }, [token, apiBase]);

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: data.newPassword, confirmPassword: data.confirmPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { error?: string }).error ?? "Erro ao redefinir senha. Tente novamente.");
        return;
      }
      sessionStorage.setItem("daton_auth_notice", "Senha redefinida com sucesso. Faça login com sua nova senha.");
      navigate("/auth");
    } catch {
      setError("Erro ao conectar com o servidor. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src={authBg}
          alt="Edifício com vegetação"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30" />
        <div className="relative z-10 flex flex-col justify-between p-10 w-full">
          <p className="text-white/90 text-xl tracking-wide font-light">daton</p>
          <h1 className="text-white text-[2.5rem] leading-tight font-bold max-w-[520px]">
            Defina uma nova senha e retome o controle da sua operação.
          </h1>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center bg-card">
        <div className="w-full max-w-[520px] px-8 py-12">
          {tokenState === "loading" && (
            <p className="text-sm text-muted-foreground">Validando link...</p>
          )}

          {tokenState === "invalid" && (
            <>
              <div className="mb-10">
                <h2 className="text-lg font-semibold text-foreground">Link inválido ou expirado</h2>
                <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                  Este link de redefinição não é mais válido. Links expiram em 1 hora e só podem ser usados uma vez.
                </p>
              </div>
              <Link
                href="/auth/esqueci-minha-senha"
                className="inline-block bg-primary text-primary-foreground text-[13px] font-medium px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors"
              >
                Solicitar novo link
              </Link>
              <p className="text-[13px] text-muted-foreground mt-6">
                <Link
                  href="/auth"
                  className="text-foreground underline underline-offset-2 hover:text-foreground/70"
                >
                  Voltar para o login
                </Link>
              </p>
            </>
          )}

          {tokenState === "valid" && (
            <>
              <div className="mb-10">
                <h2 className="text-lg font-semibold text-foreground">Redefinir senha</h2>
                <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                  Escolha uma nova senha para sua conta. Mínimo de 6 caracteres.
                </p>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="newPassword">Nova senha</Label>
                    <div className="relative mt-2">
                      <Input
                        id="newPassword"
                        type={showPassword ? "text" : "password"}
                        {...form.register("newPassword")}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {form.formState.errors.newPassword && (
                      <p className="text-xs text-destructive mt-1.5">
                        {form.formState.errors.newPassword.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                    <div className="relative mt-2">
                      <Input
                        id="confirmPassword"
                        type={showConfirm ? "text" : "password"}
                        {...form.register("confirmPassword")}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        aria-label={showConfirm ? "Ocultar senha" : "Mostrar senha"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {form.formState.errors.confirmPassword && (
                      <p className="text-xs text-destructive mt-1.5">
                        {form.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-primary text-primary-foreground text-[13px] font-medium py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? "Salvando..." : "Salvar nova senha"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
