import React, { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey, type User, type Organization } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
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

  useEffect(() => {
    if (error) {
      localStorage.removeItem("daton_token");
      setToken(null);
      queryClient.clear();
    }
  }, [error]);

  return (
    <AuthContext.Provider
      value={{
        user: data?.user || null,
        organization: data?.organization || null,
        isLoading: isLoading && !!token,
        isAuthenticated: !!data?.user,
        login,
        logout,
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
