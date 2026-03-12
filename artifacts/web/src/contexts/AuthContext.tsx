import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { type User, type Organization } from "@workspace/api-client-react/src/generated/api.schemas";

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
  
  // Custom fetch wrapper logic assumes localstorage token, but if not we can at least render based on me
  const { data, isLoading, error, refetch } = useGetMe({
    query: {
      retry: false,
      enabled: !!token,
    }
  });

  const login = (newToken: string) => {
    localStorage.setItem("daton_token", newToken);
    setToken(newToken);
    refetch();
  };

  const logout = () => {
    localStorage.removeItem("daton_token");
    setToken(null);
  };

  // Clear token if unauthorized
  useEffect(() => {
    if (error) {
      logout();
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
