import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey, type User, type Organization } from "@workspace/api-client-react";

type UserRole = "platform_admin" | "org_admin" | "operator" | "analyst";
type AppModule =
  | "documents"
  | "legislations"
  | "employees"
  | "units"
  | "departments"
  | "positions"
  | "governance"
  | "suppliers"
  | "environmental"
  | "kpi"
  | "assets";

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  role: UserRole | null;
  modules: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("daton_token"));
  const queryClient = useQueryClient();
  
  const { data, isLoading, error, refetch } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      enabled: !!token,
    },
  });

  const login = (newToken: string) => {
    localStorage.setItem("daton_token", newToken);
    setToken(newToken);
    refetch();
  };

  const logout = () => {
    localStorage.removeItem("daton_token");
    setToken(null);
    queryClient.clear();
    window.location.href = import.meta.env.BASE_URL || "/";
  };

  const refreshAuth = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    await refetch();
  };

  useEffect(() => {
    if (error) {
      localStorage.removeItem("daton_token");
      setToken(null);
      queryClient.clear();
    }
  }, [error]);

  const role = (data?.user?.role as UserRole) || null;
  const modules = data?.modules || [];

  return (
    <AuthContext.Provider
      value={{
        user: data?.user || null,
        organization: data?.organization || null,
        role,
        modules,
        isLoading: isLoading && !!token,
        isAuthenticated: !!data?.user,
        login,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function usePermissions() {
  const { role, modules } = useAuth();

  return useMemo(() => {
    const isAdmin = role === "platform_admin" || role === "org_admin";
    const isOrgAdmin = role === "org_admin";
    const isPlatformAdmin = role === "platform_admin";
    const isAnalyst = role === "analyst";

    const canWrite = !isAnalyst;

    const hasModuleAccess = (mod: AppModule): boolean => {
      if (isAdmin) return true;
      return modules.includes(mod);
    };

    const canWriteModule = (mod: AppModule): boolean => {
      return canWrite && hasModuleAccess(mod);
    };

    return {
      role,
      isAdmin,
      isOrgAdmin,
      isPlatformAdmin,
      isAnalyst,
      canWrite,
      hasModuleAccess,
      canWriteModule,
      modules,
    };
  }, [role, modules]);
}
