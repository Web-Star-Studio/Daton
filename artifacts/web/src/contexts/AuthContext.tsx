import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useGetMe, type User, type Organization } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    fetch("/api/auth/user", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: { id: string } | null }>;
      })
      .then((data) => {
        setHasSession(!!data.user);
        setSessionChecked(true);
      })
      .catch(() => {
        setHasSession(false);
        setSessionChecked(true);
      });
  }, []);

  const { data, isLoading, error } = useGetMe({
    query: {
      retry: false,
      enabled: hasSession && sessionChecked,
    },
  });

  const login = useCallback(() => {
    const base = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base)}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/api/logout";
  }, []);

  useEffect(() => {
    if (error && sessionChecked) {
      setHasSession(false);
    }
  }, [error, sessionChecked]);

  const loading = !sessionChecked || (hasSession && isLoading);

  return (
    <AuthContext.Provider
      value={{
        user: data?.user || null,
        organization: data?.organization || null,
        isLoading: loading,
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
