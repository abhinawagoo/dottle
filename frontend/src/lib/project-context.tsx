"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { projectsApi } from "@/lib/api";
import { useOrg } from "@/lib/org-context";
import { Project } from "@/lib/types";

interface ProjectContextValue {
  projects: Project[];
  selectedProject: Project | null;
  setSelectedProject: (p: Project) => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  selectedProject: null,
  setSelectedProject: () => {},
  isLoading: true,
});

const STORAGE_KEY = "agentloop_project_id";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { selectedOrg } = useOrg();
  const [selectedProject, setSelectedProjectState] = useState<Project | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", selectedOrg?.id],
    queryFn: () => projectsApi.list(selectedOrg!.id),
    enabled: !!selectedOrg,
    staleTime: 60_000,
  });

  // Auto-select: restore from localStorage or first project, reset when org changes
  useEffect(() => {
    if (!projects.length) { setSelectedProjectState(null); return; }
    const savedId = localStorage.getItem(STORAGE_KEY);
    const saved = savedId ? projects.find((p) => p.id === savedId) : null;
    setSelectedProjectState(saved ?? projects[0]);
  }, [projects]);

  function setSelectedProject(p: Project) {
    setSelectedProjectState(p);
    localStorage.setItem(STORAGE_KEY, p.id);
  }

  return (
    <ProjectContext.Provider value={{ projects, selectedProject, setSelectedProject, isLoading }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
