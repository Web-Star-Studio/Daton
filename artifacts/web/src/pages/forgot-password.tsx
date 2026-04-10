import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().email("E-mail inválido"),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const authBg = "/images/bg-auth.png";
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
      const res = await fetch(`${apiBase}/api/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Erro ao enviar. Tente novamente.");
        return;
      }
      setSubmitted(true);
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
            Recupere o acesso à sua conta e retome a gestão onde parou.
          </h1>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center bg-card">
        <div className="w-full max-w-[520px] px-8 py-12">
          {submitted ? (
            <>
              <div className="mb-10">
                <h2 className="text-lg font-semibold text-foreground">Verifique seu e-mail</h2>
                <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                  Se o endereço informado estiver cadastrado, você receberá um link de redefinição em breve. O link expira em 1 hora.
                </p>
              </div>
              <p className="text-[13px] text-muted-foreground">
                <Link
                  href="/auth"
                  className="text-foreground underline underline-offset-2 hover:text-foreground/70"
                >
                  Voltar para o login
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="mb-10">
                <h2 className="text-lg font-semibold text-foreground">Esqueci minha senha</h2>
                <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                  Informe o e-mail da sua conta e enviaremos um link para redefinir sua senha.
                </p>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div>
                  <Label htmlFor="email">E-mail de trabalho</Label>
                  <Input
                    id="email"
                    type="email"
                    {...form.register("email")}
                    className="mt-2"
                  />
                  {form.formState.errors.email && (
                    <p className="text-xs text-destructive mt-1.5">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-primary text-primary-foreground text-[13px] font-medium py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? "Enviando..." : "Enviar link de redefinição"}
                </button>

                <p className="text-[13px] text-muted-foreground">
                  Lembrou a senha?{" "}
                  <Link
                    href="/auth"
                    className="text-foreground underline underline-offset-2 hover:text-foreground/70"
                  >
                    Entrar
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
