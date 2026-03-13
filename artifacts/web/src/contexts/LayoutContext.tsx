import React, { createContext, useContext, useState, useRef, useEffect } from "react";

interface LayoutState {
  headerActions: React.ReactNode;
  pageTitle: string | undefined;
  pageSubtitle: string | undefined;
}

interface LayoutSetters {
  setHeaderActions: (actions: React.ReactNode) => void;
  setPageTitle: (title: string | undefined) => void;
  setPageSubtitle: (subtitle: string | undefined) => void;
}

const LayoutStateContext = createContext<LayoutState>({ headerActions: null, pageTitle: undefined, pageSubtitle: undefined });
const LayoutSettersContext = createContext<LayoutSetters | null>(null);

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [headerActions, setHeaderActions] = useState<React.ReactNode>(null);
  const [pageTitle, setPageTitle] = useState<string | undefined>(undefined);
  const [pageSubtitle, setPageSubtitle] = useState<string | undefined>(undefined);

  const setters = React.useMemo<LayoutSetters>(() => ({
    setHeaderActions,
    setPageTitle,
    setPageSubtitle,
  }), []);

  return (
    <LayoutSettersContext.Provider value={setters}>
      <LayoutStateContext.Provider value={{ headerActions, pageTitle, pageSubtitle }}>
        {children}
      </LayoutStateContext.Provider>
    </LayoutSettersContext.Provider>
  );
}

export function useLayoutState() {
  return useContext(LayoutStateContext);
}

function useLayoutSetters() {
  const ctx = useContext(LayoutSettersContext);
  if (!ctx) throw new Error("useLayoutSetters must be used within LayoutProvider");
  return ctx;
}

export function useHeaderActions(actions: React.ReactNode) {
  const { setHeaderActions } = useLayoutSetters();
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    setHeaderActions(ref.current);
  });

  useEffect(() => {
    return () => setHeaderActions(null);
  }, [setHeaderActions]);
}

export function usePageTitle(title: string | undefined) {
  const { setPageTitle } = useLayoutSetters();
  useEffect(() => {
    setPageTitle(title);
    return () => setPageTitle(undefined);
  }, [title, setPageTitle]);
}

export function usePageSubtitle(subtitle: string | undefined) {
  const { setPageSubtitle } = useLayoutSetters();
  useEffect(() => {
    setPageSubtitle(subtitle);
    return () => setPageSubtitle(undefined);
  }, [subtitle, setPageSubtitle]);
}
