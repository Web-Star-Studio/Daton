import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useLogin, useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "A senha é obrigatória"),
});

const registerSchema = z.object({
  razaoSocial: z.string().min(2, "Razão social é obrigatória"),
  nomeFantasia: z.string().optional(),
  cnpj: z.string().optional(),
  adminName: z.string().min(2, "Nome do administrador é obrigatório"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
  terms: z.literal(true, { errorMap: () => ({ message: "Você deve aceitar os termos" }) }),
});

type LoginData = z.infer<typeof loginSchema>;
type RegisterData = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const authBg = "/images/bg-auth.png";
  const [isLogin, setIsLogin] = useState(true);
  const [, setLocation] = useLocation();
  const { login: setAuthToken } = useAuth();

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const loginForm = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
  });

  const registerForm = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
  });

  const onLogin = async (data: LoginData) => {
    try {
      const res = await loginMutation.mutateAsync({ data });
      setAuthToken(res.token);
      setLocation("/organizacao");
    } catch {
      alert("Credenciais inválidas");
    }
  };

  const onRegister = async (data: RegisterData) => {
    try {
      const res = await registerMutation.mutateAsync({
        data: {
          razaoSocial: data.razaoSocial,
          nomeFantasia: data.nomeFantasia,
          cnpj: data.cnpj,
          adminName: data.adminName,
          email: data.email,
          password: data.password,
        },
      });
      setAuthToken(res.token);
      setLocation("/organizacao");
    } catch {
      alert("Erro ao criar conta. Verifique os dados.");
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
            {isLogin
              ? "Bem-vindo ao Daton — sua plataforma de gestão ESG."
              : "Estruture a organização e habilite o primeiro responsável para sustentar a governança ESG desde o primeiro dia."}
          </h1>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white">
        <div className="w-full max-w-[520px] px-8 py-12">
          {isLogin ? (
            <>
              <div className="mb-10">
                <h2 className="text-lg font-semibold text-foreground">Entrar</h2>
                <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                  Informe suas credenciais para acessar o ambiente e conduzir a operação.
                </p>
              </div>

              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-8">
                <div className="space-y-6">
                  <div>
                    <Label>E-mail de trabalho</Label>
                    <Input {...loginForm.register("email")} className="mt-2" />
                    {loginForm.formState.errors.email && (
                      <p className="text-xs text-destructive mt-1.5">{loginForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div>
                    <Label>Senha</Label>
                    <Input type="password" {...loginForm.register("password")} className="mt-2" />
                    {loginForm.formState.errors.password && (
                      <p className="text-xs text-destructive mt-1.5">{loginForm.formState.errors.password.message}</p>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="w-full bg-[#007AFF] text-white text-[13px] font-medium py-3 rounded-lg hover:bg-[#0066DD] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {loginMutation.isPending ? "Entrando..." : "Entrar no Daton"}
                </button>

                <p className="text-[13px] text-muted-foreground">
                  Vai estruturar uma nova organização?{" "}
                  <button
                    type="button"
                    onClick={() => setIsLogin(false)}
                    className="text-foreground underline underline-offset-2 hover:text-foreground/70 cursor-pointer"
                  >
                    Criar ambiente
                  </button>
                </p>
              </form>
            </>
          ) : (
            <>
              <div className="mb-10">
                <h2 className="text-lg font-semibold text-foreground">Estruturar organização</h2>
                <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                  Isso estabelece a base identitária da qual o restante do Daton depende: entidade legal, acesso inicial e a base de governança que depois pode se expandir para múltiplas unidades.
                </p>
              </div>

              <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-8">
                <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                  <div>
                    <Label>Razão social</Label>
                    <Input {...registerForm.register("razaoSocial")} className="mt-2" />
                    {registerForm.formState.errors.razaoSocial && (
                      <p className="text-xs text-destructive mt-1.5">{registerForm.formState.errors.razaoSocial.message}</p>
                    )}
                  </div>
                  <div>
                    <Label>Nome fantasia</Label>
                    <Input {...registerForm.register("nomeFantasia")} className="mt-2" />
                  </div>
                  <div>
                    <Label>CNPJ</Label>
                    <Input {...registerForm.register("cnpj")} placeholder="00.000.000/0000-00" className="mt-2" />
                  </div>
                  <div>
                    <Label>Nome completo do administrador</Label>
                    <Input {...registerForm.register("adminName")} className="mt-2" />
                    {registerForm.formState.errors.adminName && (
                      <p className="text-xs text-destructive mt-1.5">{registerForm.formState.errors.adminName.message}</p>
                    )}
                  </div>
                  <div>
                    <Label>E-mail do administrador</Label>
                    <Input {...registerForm.register("email")} className="mt-2" />
                    {registerForm.formState.errors.email && (
                      <p className="text-xs text-destructive mt-1.5">{registerForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div>
                    <Label>Senha</Label>
                    <Input type="password" {...registerForm.register("password")} className="mt-2" />
                    {registerForm.formState.errors.password && (
                      <p className="text-xs text-destructive mt-1.5">{registerForm.formState.errors.password.message}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="terms"
                    checked={registerForm.watch("terms") === true}
                    onCheckedChange={(checked) =>
                      registerForm.setValue("terms", checked === true ? true : (false as unknown as true), { shouldValidate: true })
                    }
                    className="mt-0.5"
                  />
                  <label htmlFor="terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                    Ao marcar esta caixa, declaro que li, entendi e concordo com os Termos de Serviço, a Política de Privacidade, o EULA e a Política de Uso Aceitável do Daton.
                  </label>
                </div>
                {registerForm.formState.errors.terms && (
                  <p className="text-xs text-destructive">{registerForm.formState.errors.terms.message}</p>
                )}

                <button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="w-full bg-[#007AFF] text-white text-[13px] font-medium py-3 rounded-lg hover:bg-[#0066DD] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {registerMutation.isPending ? "Criando..." : "Continuar com a criação"}
                </button>

                <p className="text-[13px] text-muted-foreground">
                  Já possui um ambiente?{" "}
                  <button
                    type="button"
                    onClick={() => setIsLogin(true)}
                    className="text-foreground underline underline-offset-2 hover:text-foreground/70 cursor-pointer"
                  >
                    Entrar
                  </button>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
