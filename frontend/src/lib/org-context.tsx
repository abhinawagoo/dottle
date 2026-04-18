"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { orgsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface OrgContextValue {
  orgs: Org[];
  selectedOrg: Org | null;
  setSelectedOrg: (o: Org) => void;
  isLoading: boolean;
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  selectedOrg: null,
  setSelectedOrg: () => {},
  isLoading: true,
});

const ORG_KEY = "dottle_org_id";

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedOrg, setSelectedOrgState] = useState<Org | null>(null);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ["orgs", user?.id],
    queryFn: () => orgsApi.list(),
    enabled: !!user,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!orgs.length) return;
    const savedId = localStorage.getItem(ORG_KEY);
    const saved = savedId ? orgs.find((o) => o.id === savedId) : null;
    setSelectedOrgState(saved ?? orgs[0]);
  }, [orgs]);

  function setSelectedOrg(o: Org) {
    setSelectedOrgState(o);
    localStorage.setItem(ORG_KEY, o.id);
  }

  return (
    <OrgContext.Provider value={{ orgs, selectedOrg, setSelectedOrg, isLoading }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
