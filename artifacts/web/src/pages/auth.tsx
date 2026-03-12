import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useLogin, useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "A senha é obrigatória"),
});

const registerSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
  organizationName: z.string().min(2, "Nome da organização é obrigatório"),
});

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [, setLocation] = useLocation();
  const { login: setAuthToken } = useAuth();

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });

  const onLogin = async (data: z.infer<typeof loginSchema>) => {
    try {
      const res = await loginMutation.mutateAsync({ data });
      setAuthToken(res.token);
      setLocation("/app/qualidade/legislacoes");
    } catch (error: any) {
      alert("Credenciais inválidas");
    }
  };

  const onRegister = async (data: z.infer<typeof registerSchema>) => {
    try {
      const res = await registerMutation.mutateAsync({ data });
      setAuthToken(res.token);
      setLocation("/app/qualidade/legislacoes");
    } catch (error: any) {
      alert("Erro ao criar conta. Verifique os dados.");
    }
  };

  return (
    <div className="min-h-screen w-full flex relative">
      {/* Background image requested via requirements */}
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`} 
          alt="Abstract elegant background" 
          className="w-full h-full object-cover opacity-60"
        />
      </div>

      <div className="relative z-10 flex w-full items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/80 backdrop-blur-xl border-white/40 shadow-2xl">
          <CardHeader className="text-center space-y-2 pb-8">
            <div className="w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center text-2xl font-bold mx-auto mb-4 shadow-lg shadow-primary/20">
              d.
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              Bem-vindo ao Daton
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Plataforma unificada de ESG, Qualidade e Compliance
            </p>
          </CardHeader>
          <CardContent>
            {isLogin ? (
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <Input {...loginForm.register("email")} placeholder="seu@email.com" />
                  {loginForm.formState.errors.email && (
                    <p className="text-sm text-destructive mt-1">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input type="password" {...loginForm.register("password")} placeholder="••••••••" />
                </div>
                <Button type="submit" className="w-full" isLoading={loginMutation.isPending}>
                  Entrar
                </Button>
                <div className="text-center mt-4">
                  <button type="button" onClick={() => setIsLogin(false)} className="text-sm text-primary hover:underline">
                    Não tem uma conta? Cadastre-se
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                <div>
                  <Label>Nome Completo</Label>
                  <Input {...registerForm.register("name")} placeholder="João Silva" />
                </div>
                <div>
                  <Label>Email corporativo</Label>
                  <Input {...registerForm.register("email")} placeholder="joao@empresa.com" />
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input type="password" {...registerForm.register("password")} placeholder="••••••••" />
                </div>
                <div>
                  <Label>Nome da Organização</Label>
                  <Input {...registerForm.register("organizationName")} placeholder="Acme Corp" />
                </div>
                <Button type="submit" className="w-full mt-2" isLoading={registerMutation.isPending}>
                  Criar conta
                </Button>
                <div className="text-center mt-4">
                  <button type="button" onClick={() => setIsLogin(true)} className="text-sm text-primary hover:underline">
                    Já tem uma conta? Entre
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
