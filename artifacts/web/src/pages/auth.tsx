import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { useLocation } from "wouter";
import authBg from "@assets/Gemini_Generated_Image_y7vg0oy7vg0oy7vg_1773347119413.png";

export default function AuthPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/app/qualidade/legislacoes");
    }
  }, [isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white">
        <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-gray-900 rounded-full" />
      </div>
    );
  }

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
            Bem-vindo ao Daton — sua plataforma de gestão ESG.
          </h1>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white">
        <div className="w-full max-w-[520px] px-8 py-12">
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-foreground">Entrar</h2>
            <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
              Acesse o ambiente para conduzir a operação.
            </p>
          </div>

          <button
            onClick={login}
            className="w-full bg-[#007AFF] text-white text-[13px] font-medium py-3 rounded-lg hover:bg-[#0066DD] transition-colors cursor-pointer"
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
}
