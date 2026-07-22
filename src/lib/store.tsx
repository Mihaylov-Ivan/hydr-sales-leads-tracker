"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Project, ProjectComment, Stage } from "./types";
import { SEED_PROJECTS } from "./seed";
import { supabase, commentFromRow, projectFromRow, projectToRow } from "./supabase";
import type { CommentRow, ProjectRow } from "./supabase";

const STORAGE_KEY = "hydrogenera-lead-tracker-v1";

export interface NewProjectInput {
  name: string;
  client: string;
  country: string;
  city: string;
  series: Project["series"];
  sizeKw: number;
  stage: Stage;
  baseDescription: string;
}

export type ProjectPatch = Partial<
  Pick<
    Project,
    "name" | "client" | "country" | "city" | "series" | "sizeKw" | "stage" | "baseDescription"
  >
>;

interface ProjectsApi {
  projects: Project[];
  ready: boolean;
  /** True when the server has an AI API key configured */
  aiEnabled: boolean;
  /** Project ids with an AI summary generation currently in flight */
  summarizing: Record<string, boolean>;
  addProject: (input: NewProjectInput) => string;
  addComment: (projectId: string, text: string, stageChange?: Stage) => void;
  updateProject: (projectId: string, patch: ProjectPatch) => void;
  updateComment: (projectId: string, commentId: string, text: string) => void;
  deleteComment: (projectId: string, commentId: string) => void;
  regenerateSummary: (projectId: string) => void;
  deleteProject: (projectId: string) => void;
}

const ProjectsContext = createContext<ProjectsApi | null>(null);

function loadLocal(): Project[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Project[];
  } catch {
    // corrupted storage: fall back to seed data
  }
  return SEED_PROJECTS;
}

async function loadRemote(): Promise<Project[]> {
  const [projectsRes, commentsRes] = await Promise.all([
    supabase!
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase!
      .from("project_comments")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (commentsRes.error) throw commentsRes.error;

  const byProject = new Map<string, ProjectComment[]>();
  for (const row of (commentsRes.data ?? []) as CommentRow[]) {
    const list = byProject.get(row.project_id) ?? [];
    list.push(commentFromRow(row));
    byProject.set(row.project_id, list);
  }
  return ((projectsRes.data ?? []) as ProjectRow[]).map((row) =>
    projectFromRow(row, byProject.get(row.id) ?? []),
  );
}

function logDbError(action: string) {
  return ({ error }: { error: { message: string } | null }) => {
    if (error) console.error(`Supabase ${action} failed:`, error.message);
  };
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [summarizing, setSummarizing] = useState<Record<string, boolean>>({});
  const projectsRef = useRef<Project[]>([]);
  projectsRef.current = projects;

  useEffect(() => {
    if (supabase) {
      loadRemote()
        .then(setProjects)
        .catch((e) => {
          console.error("Failed to load projects from Supabase:", e);
          setProjects([]);
        })
        .finally(() => setReady(true));
    } else {
      setProjects(loadLocal());
      setReady(true);
    }
    fetch("/api/summarize")
      .then((r) => r.json())
      .then((d) => setAiEnabled(Boolean(d.enabled)))
      .catch(() => setAiEnabled(false));
  }, []);

  // Without a database the tracker keeps persisting to localStorage.
  useEffect(() => {
    if (ready && !supabase) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    }
  }, [projects, ready]);

  const requestAiSummary = useCallback(async (project: Project) => {
    setSummarizing((s) => ({ ...s, [project.id]: true }));
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (res.ok) {
        const { summary } = (await res.json()) as { summary?: string };
        if (summary) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === project.id ? { ...p, aiSummary: summary } : p,
            ),
          );
          if (supabase) {
            void supabase
              .from("projects")
              .update({ ai_summary: summary })
              .eq("id", project.id)
              .then(logDbError("summary update"));
          }
        }
      }
    } catch {
      // network/AI failure: the rule-based summary remains as fallback
    } finally {
      setSummarizing((s) => ({ ...s, [project.id]: false }));
    }
  }, []);

  const addProject = useCallback((input: NewProjectInput): string => {
    const id = crypto.randomUUID();
    const project: Project = {
      ...input,
      id,
      comments: [],
      createdAt: new Date().toISOString(),
    };
    setProjects((prev) => [project, ...prev]);
    if (supabase) {
      void supabase
        .from("projects")
        .insert(projectToRow(project))
        .then(logDbError("project insert"));
    }
    return id;
  }, []);

  const addComment = useCallback(
    (projectId: string, text: string, stageChange?: Stage) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const comment: ProjectComment = {
        id: crypto.randomUUID(),
        text,
        author: "You",
        createdAt: new Date().toISOString(),
        ...(stageChange ? { stageChange } : {}),
      };
      const updated: Project = {
        ...current,
        stage: stageChange ?? current.stage,
        comments: [...current.comments, comment],
      };
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
      if (supabase) {
        void supabase
          .from("project_comments")
          .insert({
            id: comment.id,
            project_id: projectId,
            text: comment.text,
            author: comment.author,
            stage_change: stageChange ?? null,
            created_at: comment.createdAt,
          })
          .then(logDbError("comment insert"));
        if (stageChange) {
          void supabase
            .from("projects")
            .update({ stage: stageChange })
            .eq("id", projectId)
            .then(logDbError("stage update"));
        }
      }
      void requestAiSummary(updated);
    },
    [requestAiSummary],
  );

  const updateProject = useCallback(
    (projectId: string, patch: ProjectPatch) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const updated: Project = { ...current, ...patch };
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
      if (supabase) {
        const { id: _id, ai_summary: _summary, created_at: _created, ...row } =
          projectToRow(updated);
        void supabase
          .from("projects")
          .update(row)
          .eq("id", projectId)
          .then(logDbError("project update"));
      }
      void requestAiSummary(updated);
    },
    [requestAiSummary],
  );

  const updateComment = useCallback(
    (projectId: string, commentId: string, text: string) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const updated: Project = {
        ...current,
        comments: current.comments.map((c) =>
          c.id === commentId ? { ...c, text } : c,
        ),
      };
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
      if (supabase) {
        void supabase
          .from("project_comments")
          .update({ text })
          .eq("id", commentId)
          .then(logDbError("comment update"));
      }
      void requestAiSummary(updated);
    },
    [requestAiSummary],
  );

  const deleteComment = useCallback(
    (projectId: string, commentId: string) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const updated: Project = {
        ...current,
        comments: current.comments.filter((c) => c.id !== commentId),
      };
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
      if (supabase) {
        void supabase
          .from("project_comments")
          .delete()
          .eq("id", commentId)
          .then(logDbError("comment delete"));
      }
      void requestAiSummary(updated);
    },
    [requestAiSummary],
  );

  const regenerateSummary = useCallback(
    (projectId: string) => {
      const project = projectsRef.current.find((p) => p.id === projectId);
      if (project) void requestAiSummary(project);
    },
    [requestAiSummary],
  );

  const deleteProject = useCallback((projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (supabase) {
      // Comments are removed by the ON DELETE CASCADE constraint.
      void supabase
        .from("projects")
        .delete()
        .eq("id", projectId)
        .then(logDbError("project delete"));
    }
  }, []);

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        ready,
        aiEnabled,
        summarizing,
        addProject,
        addComment,
        updateProject,
        updateComment,
        deleteComment,
        regenerateSummary,
        deleteProject,
      }}
    >
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsApi {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used inside ProjectsProvider");
  return ctx;
}
