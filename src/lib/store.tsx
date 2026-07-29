"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Project, ProjectComment, ProjectTodo, Stage, TodoKind } from "./types";
import { SEED_PROJECTS } from "./seed";
import {
  supabase,
  commentFromRow,
  projectFromRow,
  projectToRow,
  todoFromRow,
} from "./supabase";
import type { CommentRow, ProjectRow, TodoRow } from "./supabase";

const STORAGE_KEY = "hydrogenera-lead-tracker-v1";

export interface NewProjectInput {
  name: string;
  client: string;
  country: string;
  city: string;
  series: Project["series"];
  market: Project["market"];
  sizeKw: number;
  stage: Stage;
  baseDescription: string;
}

export type ProjectPatch = Partial<
  Pick<
    Project,
    | "name"
    | "client"
    | "country"
    | "city"
    | "series"
    | "market"
    | "sizeKw"
    | "stage"
    | "baseDescription"
  >
>;

/** `null` clears the field, `undefined` leaves it unchanged. */
export interface TodoPatch {
  text?: string;
  answer?: string | null;
  dueDate?: string | null;
}

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
  addTodo: (
    projectId: string,
    kind: TodoKind,
    text: string,
    dueDate?: string,
  ) => void;
  toggleTodo: (projectId: string, todoId: string) => void;
  updateTodo: (projectId: string, todoId: string, patch: TodoPatch) => void;
  deleteTodo: (projectId: string, todoId: string) => void;
}

const ProjectsContext = createContext<ProjectsApi | null>(null);

function loadLocal(): Project[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Project[];
      // Data saved before the todos/kinds/markets features may lack these fields
      return parsed.map((p) => ({
        ...p,
        market: p.market ?? "Clean H2",
        todos: (p.todos ?? []).map((t) => ({ ...t, kind: t.kind ?? "our-action" })),
      }));
    }
  } catch {
    // corrupted storage: fall back to seed data
  }
  return SEED_PROJECTS;
}

async function loadRemote(): Promise<Project[]> {
  const [projectsRes, commentsRes, todosRes] = await Promise.all([
    supabase!
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase!
      .from("project_comments")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase!
      .from("project_todos")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (commentsRes.error) throw commentsRes.error;
  if (todosRes.error) throw todosRes.error;

  const commentsByProject = new Map<string, ProjectComment[]>();
  for (const row of (commentsRes.data ?? []) as CommentRow[]) {
    const list = commentsByProject.get(row.project_id) ?? [];
    list.push(commentFromRow(row));
    commentsByProject.set(row.project_id, list);
  }
  const todosByProject = new Map<string, ProjectTodo[]>();
  for (const row of (todosRes.data ?? []) as TodoRow[]) {
    const list = todosByProject.get(row.project_id) ?? [];
    list.push(todoFromRow(row));
    todosByProject.set(row.project_id, list);
  }
  return ((projectsRes.data ?? []) as ProjectRow[]).map((row) =>
    projectFromRow(
      row,
      commentsByProject.get(row.id) ?? [],
      todosByProject.get(row.id) ?? [],
    ),
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
    const createdAt = new Date().toISOString();
    const description = input.baseDescription.trim();
    // The summary entered at creation doubles as the first update in the timeline.
    const initialComment: ProjectComment | null = description
      ? {
          id: crypto.randomUUID(),
          text: description,
          author: "You",
          createdAt,
        }
      : null;
    const project: Project = {
      ...input,
      id,
      comments: initialComment ? [initialComment] : [],
      todos: [],
      createdAt,
    };
    setProjects((prev) => [project, ...prev]);
    if (supabase) {
      // Insert the comment only after the project row exists (FK constraint).
      void supabase
        .from("projects")
        .insert(projectToRow(project))
        .then((res) => {
          logDbError("project insert")(res);
          if (res.error || !initialComment) return;
          void supabase!
            .from("project_comments")
            .insert({
              id: initialComment.id,
              project_id: id,
              text: initialComment.text,
              author: initialComment.author,
              stage_change: null,
              created_at: initialComment.createdAt,
            })
            .then(logDbError("initial comment insert"));
        });
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

  const mutateTodos = useCallback(
    (projectId: string, fn: (todos: ProjectTodo[]) => ProjectTodo[]) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, todos: fn(p.todos) } : p,
        ),
      );
    },
    [],
  );

  const addTodo = useCallback(
    (projectId: string, kind: TodoKind, text: string, dueDate?: string) => {
      const todo: ProjectTodo = {
        id: crypto.randomUUID(),
        kind,
        text,
        done: false,
        ...(dueDate ? { dueDate } : {}),
        createdAt: new Date().toISOString(),
      };
      mutateTodos(projectId, (todos) => [...todos, todo]);
      if (supabase) {
        void supabase
          .from("project_todos")
          .insert({
            id: todo.id,
            project_id: projectId,
            kind: todo.kind,
            text: todo.text,
            done: false,
            due_date: dueDate ?? null,
            created_at: todo.createdAt,
          })
          .then(logDbError("todo insert"));
      }
    },
    [mutateTodos],
  );

  const toggleTodo = useCallback(
    (projectId: string, todoId: string) => {
      const current = projectsRef.current
        .find((p) => p.id === projectId)
        ?.todos.find((t) => t.id === todoId);
      if (!current) return;
      const done = !current.done;
      const doneAt = done ? new Date().toISOString() : undefined;
      mutateTodos(projectId, (todos) =>
        todos.map((t) => (t.id === todoId ? { ...t, done, doneAt } : t)),
      );
      if (supabase) {
        void supabase
          .from("project_todos")
          .update({ done, done_at: doneAt ?? null })
          .eq("id", todoId)
          .then(logDbError("todo toggle"));
      }
    },
    [mutateTodos],
  );

  const updateTodo = useCallback(
    (projectId: string, todoId: string, patch: TodoPatch) => {
      mutateTodos(projectId, (todos) =>
        todos.map((t) => {
          if (t.id !== todoId) return t;
          const next = { ...t };
          if (patch.text !== undefined) next.text = patch.text;
          if (patch.answer !== undefined) {
            if (patch.answer === null) delete next.answer;
            else next.answer = patch.answer;
          }
          if (patch.dueDate !== undefined) {
            if (patch.dueDate === null) delete next.dueDate;
            else next.dueDate = patch.dueDate;
          }
          return next;
        }),
      );
      if (supabase) {
        const row: Record<string, string | null> = {};
        if (patch.text !== undefined) row.text = patch.text;
        if (patch.answer !== undefined) row.answer = patch.answer;
        if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
        void supabase
          .from("project_todos")
          .update(row)
          .eq("id", todoId)
          .then(logDbError("todo update"));
      }
    },
    [mutateTodos],
  );

  const deleteTodo = useCallback(
    (projectId: string, todoId: string) => {
      mutateTodos(projectId, (todos) => todos.filter((t) => t.id !== todoId));
      if (supabase) {
        void supabase
          .from("project_todos")
          .delete()
          .eq("id", todoId)
          .then(logDbError("todo delete"));
      }
    },
    [mutateTodos],
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
        addTodo,
        toggleTodo,
        updateTodo,
        deleteTodo,
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
