"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  MilestoneKind,
  Project,
  ProjectComment,
  ProjectContact,
  ProjectExpenseItem,
  ProjectFinancials,
  ProjectMilestone,
  ProjectPayment,
  ProjectTodo,
  Stage,
  TodoKind,
  emptyFinancials,
} from "./types";
import { SEED_PROJECTS } from "./seed";
import {
  supabase,
  commentFromRow,
  contactFromRow,
  expenseFromRow,
  financialsFromParts,
  milestoneFromRow,
  paymentFromRow,
  projectFromRow,
  projectToRow,
  todoFromRow,
} from "./supabase";
import type {
  CommentRow,
  ContactRow,
  ExpenseRow,
  MilestoneRow,
  PaymentRow,
  ProjectRow,
  TodoRow,
} from "./supabase";

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

/** All fields optional; empty strings are treated as "not provided". */
export interface ContactInput {
  name?: string;
  email?: string;
  phone?: string;
  position?: string;
}

/** `null` clears the field, `undefined` leaves it unchanged. */
export interface FinancialsPatch {
  contractValue?: number | null;
  contractSignedDate?: string | null;
  expenses?: number | null;
  expectedProfit?: number | null;
}

export interface PaymentInput {
  amount: number;
  /** Pass `null` to clear an existing percent */
  percent?: number | null;
  dueDate: string;
  label?: string;
  /** Tie this payment to a project deadline (date follows the milestone) */
  milestoneId?: string;
}

/** Same shape as a payment — dated cash outflow */
export type ExpenseInput = PaymentInput;

export interface MilestoneInput {
  kind: MilestoneKind;
  date: string;
  note?: string;
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
  addContact: (projectId: string, input: ContactInput) => void;
  updateContact: (projectId: string, contactId: string, patch: ContactInput) => void;
  deleteContact: (projectId: string, contactId: string) => void;
  updateFinancials: (projectId: string, patch: FinancialsPatch) => void;
  addPayment: (projectId: string, input: PaymentInput) => void;
  updatePayment: (projectId: string, paymentId: string, patch: PaymentInput) => void;
  deletePayment: (projectId: string, paymentId: string) => void;
  addExpense: (projectId: string, input: ExpenseInput) => void;
  updateExpense: (projectId: string, expenseId: string, patch: ExpenseInput) => void;
  deleteExpense: (projectId: string, expenseId: string) => void;
  addMilestone: (projectId: string, input: MilestoneInput) => void;
  updateMilestone: (
    projectId: string,
    milestoneId: string,
    patch: MilestoneInput,
  ) => void;
  deleteMilestone: (projectId: string, milestoneId: string) => void;
}

const ProjectsContext = createContext<ProjectsApi | null>(null);

function loadLocal(): Project[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Project[];
      // Data saved before newer features may lack these fields
      return parsed.map((p) => ({
        ...p,
        market: p.market ?? "Clean H2",
        todos: (p.todos ?? []).map((t) => ({ ...t, kind: t.kind ?? "our-action" })),
        contacts: p.contacts ?? [],
        financials: {
          ...emptyFinancials(),
          ...p.financials,
          payments: p.financials?.payments ?? [],
          expenseSchedule: p.financials?.expenseSchedule ?? [],
          milestones: p.financials?.milestones ?? [],
        },
      }));
    }
  } catch {
    // corrupted storage: fall back to seed data
  }
  return SEED_PROJECTS;
}

async function loadRemote(): Promise<Project[]> {
  const [
    projectsRes,
    commentsRes,
    todosRes,
    contactsRes,
    paymentsRes,
    expensesRes,
    milestonesRes,
  ] = await Promise.all([
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
    supabase!
      .from("project_contacts")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase!
      .from("project_payments")
      .select("*")
      .order("due_date", { ascending: true }),
    supabase!
      .from("project_expenses")
      .select("*")
      .order("due_date", { ascending: true }),
    supabase!
      .from("project_milestones")
      .select("*")
      .order("date", { ascending: true }),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (commentsRes.error) throw commentsRes.error;
  if (todosRes.error) throw todosRes.error;
  // Non-fatal: tables/columns may not exist until the pending migration runs
  if (contactsRes.error) {
    console.error("Supabase contacts load failed:", contactsRes.error.message);
  }
  if (paymentsRes.error) {
    console.error("Supabase payments load failed:", paymentsRes.error.message);
  }
  if (expensesRes.error) {
    console.error("Supabase expenses load failed:", expensesRes.error.message);
  }
  if (milestonesRes.error) {
    console.error(
      "Supabase milestones load failed:",
      milestonesRes.error.message,
    );
  }

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
  const contactsByProject = new Map<string, ProjectContact[]>();
  for (const row of (contactsRes.data ?? []) as ContactRow[]) {
    const list = contactsByProject.get(row.project_id) ?? [];
    list.push(contactFromRow(row));
    contactsByProject.set(row.project_id, list);
  }
  const paymentsByProject = new Map<string, ProjectPayment[]>();
  for (const row of (paymentsRes.data ?? []) as PaymentRow[]) {
    const list = paymentsByProject.get(row.project_id) ?? [];
    list.push(paymentFromRow(row));
    paymentsByProject.set(row.project_id, list);
  }
  const expensesByProject = new Map<string, ProjectExpenseItem[]>();
  for (const row of (expensesRes.data ?? []) as ExpenseRow[]) {
    const list = expensesByProject.get(row.project_id) ?? [];
    list.push(expenseFromRow(row));
    expensesByProject.set(row.project_id, list);
  }
  const milestonesByProject = new Map<string, ProjectMilestone[]>();
  for (const row of (milestonesRes.data ?? []) as MilestoneRow[]) {
    const list = milestonesByProject.get(row.project_id) ?? [];
    list.push(milestoneFromRow(row));
    milestonesByProject.set(row.project_id, list);
  }
  return ((projectsRes.data ?? []) as ProjectRow[]).map((row) =>
    projectFromRow(
      row,
      commentsByProject.get(row.id) ?? [],
      todosByProject.get(row.id) ?? [],
      contactsByProject.get(row.id) ?? [],
      financialsFromParts(
        row,
        paymentsByProject.get(row.id) ?? [],
        milestonesByProject.get(row.id) ?? [],
        expensesByProject.get(row.id) ?? [],
      ),
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
      contacts: [],
      financials: emptyFinancials(),
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

  const mutateContacts = useCallback(
    (projectId: string, fn: (contacts: ProjectContact[]) => ProjectContact[]) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, contacts: fn(p.contacts) } : p,
        ),
      );
    },
    [],
  );

  const addContact = useCallback(
    (projectId: string, input: ContactInput) => {
      const name = input.name?.trim();
      const email = input.email?.trim();
      const phone = input.phone?.trim();
      const position = input.position?.trim();
      if (!name && !email && !phone && !position) return;
      const contact: ProjectContact = {
        id: crypto.randomUUID(),
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(position ? { position } : {}),
        createdAt: new Date().toISOString(),
      };
      mutateContacts(projectId, (contacts) => [...contacts, contact]);
      if (supabase) {
        void supabase
          .from("project_contacts")
          .insert({
            id: contact.id,
            project_id: projectId,
            name: name || null,
            email: email || null,
            phone: phone || null,
            position: position || null,
            created_at: contact.createdAt,
          })
          .then(logDbError("contact insert"));
      }
    },
    [mutateContacts],
  );

  const updateContact = useCallback(
    (projectId: string, contactId: string, patch: ContactInput) => {
      mutateContacts(projectId, (contacts) =>
        contacts.map((c) => {
          if (c.id !== contactId) return c;
          const next = { ...c };
          for (const key of ["name", "email", "phone", "position"] as const) {
            const value = patch[key];
            if (value === undefined) continue;
            const trimmed = value.trim();
            if (trimmed) next[key] = trimmed;
            else delete next[key];
          }
          return next;
        }),
      );
      if (supabase) {
        const row: Record<string, string | null> = {};
        for (const key of ["name", "email", "phone", "position"] as const) {
          const value = patch[key];
          if (value !== undefined) row[key] = value.trim() || null;
        }
        void supabase
          .from("project_contacts")
          .update(row)
          .eq("id", contactId)
          .then(logDbError("contact update"));
      }
    },
    [mutateContacts],
  );

  const deleteContact = useCallback(
    (projectId: string, contactId: string) => {
      mutateContacts(projectId, (contacts) =>
        contacts.filter((c) => c.id !== contactId),
      );
      if (supabase) {
        void supabase
          .from("project_contacts")
          .delete()
          .eq("id", contactId)
          .then(logDbError("contact delete"));
      }
    },
    [mutateContacts],
  );

  const mutateFinancials = useCallback(
    (projectId: string, fn: (f: ProjectFinancials) => ProjectFinancials) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, financials: fn(p.financials) } : p,
        ),
      );
    },
    [],
  );

  const updateFinancials = useCallback(
    (projectId: string, patch: FinancialsPatch) => {
      let syncedProfit: number | null | undefined;
      mutateFinancials(projectId, (f) => {
        const next = { ...f };
        if (patch.contractValue !== undefined) {
          if (patch.contractValue === null) delete next.contractValue;
          else next.contractValue = patch.contractValue;
        }
        if (patch.contractSignedDate !== undefined) {
          if (patch.contractSignedDate === null) delete next.contractSignedDate;
          else next.contractSignedDate = patch.contractSignedDate;
        }
        if (patch.expenses !== undefined) {
          if (patch.expenses === null) delete next.expenses;
          else next.expenses = patch.expenses;
        }
        // Profit is always contract − overall expenses when both are set
        if (next.contractValue != null && next.expenses != null) {
          next.expectedProfit = next.contractValue - next.expenses;
          syncedProfit = next.expectedProfit;
        } else {
          delete next.expectedProfit;
          syncedProfit = null;
        }
        return next;
      });
      if (supabase) {
        const row: Record<string, number | string | null> = {};
        if (patch.contractValue !== undefined)
          row.contract_value = patch.contractValue;
        if (patch.contractSignedDate !== undefined)
          row.contract_signed_date = patch.contractSignedDate;
        if (patch.expenses !== undefined) row.expenses = patch.expenses;
        if (syncedProfit !== undefined) row.expected_profit = syncedProfit;
        void supabase
          .from("projects")
          .update(row)
          .eq("id", projectId)
          .then(logDbError("financials update"));
      }
    },
    [mutateFinancials],
  );

  const addPayment = useCallback(
    (projectId: string, input: PaymentInput) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const linked = input.milestoneId
        ? current?.financials.milestones.find((m) => m.id === input.milestoneId)
        : undefined;
      const dueDate = linked?.date ?? input.dueDate;
      const payment: ProjectPayment = {
        id: crypto.randomUUID(),
        amount: input.amount,
        ...(input.percent != null ? { percent: input.percent } : {}),
        dueDate,
        ...(input.label?.trim() ? { label: input.label.trim() } : {}),
        ...(linked ? { milestoneId: linked.id } : {}),
        createdAt: new Date().toISOString(),
      };
      mutateFinancials(projectId, (f) => ({
        ...f,
        payments: [...f.payments, payment],
      }));
      if (supabase) {
        void supabase
          .from("project_payments")
          .insert({
            id: payment.id,
            project_id: projectId,
            amount: payment.amount,
            percent: payment.percent ?? null,
            due_date: payment.dueDate,
            label: payment.label ?? null,
            milestone_id: payment.milestoneId ?? null,
            created_at: payment.createdAt,
          })
          .then(logDbError("payment insert"));
      }
    },
    [mutateFinancials],
  );

  const updatePayment = useCallback(
    (projectId: string, paymentId: string, patch: PaymentInput) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const linked = patch.milestoneId
        ? current?.financials.milestones.find((m) => m.id === patch.milestoneId)
        : undefined;
      const dueDate = linked?.date ?? patch.dueDate;
      mutateFinancials(projectId, (f) => ({
        ...f,
        payments: f.payments.map((p) => {
          if (p.id !== paymentId) return p;
          const next: ProjectPayment = {
            id: p.id,
            amount: patch.amount,
            dueDate,
            createdAt: p.createdAt,
          };
          if (patch.percent != null) next.percent = patch.percent;
          if (patch.label?.trim()) next.label = patch.label.trim();
          if (linked) next.milestoneId = linked.id;
          return next;
        }),
      }));
      if (supabase) {
        void supabase
          .from("project_payments")
          .update({
            amount: patch.amount,
            percent: patch.percent ?? null,
            due_date: dueDate,
            label: patch.label?.trim() || null,
            milestone_id: linked?.id ?? null,
          })
          .eq("id", paymentId)
          .then(logDbError("payment update"));
      }
    },
    [mutateFinancials],
  );

  const deletePayment = useCallback(
    (projectId: string, paymentId: string) => {
      mutateFinancials(projectId, (f) => ({
        ...f,
        payments: f.payments.filter((p) => p.id !== paymentId),
      }));
      if (supabase) {
        void supabase
          .from("project_payments")
          .delete()
          .eq("id", paymentId)
          .then(logDbError("payment delete"));
      }
    },
    [mutateFinancials],
  );

  const addExpense = useCallback(
    (projectId: string, input: ExpenseInput) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const linked = input.milestoneId
        ? current?.financials.milestones.find((m) => m.id === input.milestoneId)
        : undefined;
      const dueDate = linked?.date ?? input.dueDate;
      const expense: ProjectExpenseItem = {
        id: crypto.randomUUID(),
        amount: input.amount,
        ...(input.percent != null ? { percent: input.percent } : {}),
        dueDate,
        ...(input.label?.trim() ? { label: input.label.trim() } : {}),
        ...(linked ? { milestoneId: linked.id } : {}),
        createdAt: new Date().toISOString(),
      };
      mutateFinancials(projectId, (f) => ({
        ...f,
        expenseSchedule: [...(f.expenseSchedule ?? []), expense],
      }));
      if (supabase) {
        void supabase
          .from("project_expenses")
          .insert({
            id: expense.id,
            project_id: projectId,
            amount: expense.amount,
            percent: expense.percent ?? null,
            due_date: expense.dueDate,
            label: expense.label ?? null,
            milestone_id: expense.milestoneId ?? null,
            created_at: expense.createdAt,
          })
          .then(logDbError("expense insert"));
      }
    },
    [mutateFinancials],
  );

  const updateExpense = useCallback(
    (projectId: string, expenseId: string, patch: ExpenseInput) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const linked = patch.milestoneId
        ? current?.financials.milestones.find((m) => m.id === patch.milestoneId)
        : undefined;
      const dueDate = linked?.date ?? patch.dueDate;
      mutateFinancials(projectId, (f) => ({
        ...f,
        expenseSchedule: (f.expenseSchedule ?? []).map((e) => {
          if (e.id !== expenseId) return e;
          const next: ProjectExpenseItem = {
            id: e.id,
            amount: patch.amount,
            dueDate,
            createdAt: e.createdAt,
          };
          if (patch.percent != null) next.percent = patch.percent;
          if (patch.label?.trim()) next.label = patch.label.trim();
          if (linked) next.milestoneId = linked.id;
          return next;
        }),
      }));
      if (supabase) {
        void supabase
          .from("project_expenses")
          .update({
            amount: patch.amount,
            percent: patch.percent ?? null,
            due_date: dueDate,
            label: patch.label?.trim() || null,
            milestone_id: linked?.id ?? null,
          })
          .eq("id", expenseId)
          .then(logDbError("expense update"));
      }
    },
    [mutateFinancials],
  );

  const deleteExpense = useCallback(
    (projectId: string, expenseId: string) => {
      mutateFinancials(projectId, (f) => ({
        ...f,
        expenseSchedule: (f.expenseSchedule ?? []).filter((e) => e.id !== expenseId),
      }));
      if (supabase) {
        void supabase
          .from("project_expenses")
          .delete()
          .eq("id", expenseId)
          .then(logDbError("expense delete"));
      }
    },
    [mutateFinancials],
  );

  const addMilestone = useCallback(
    (projectId: string, input: MilestoneInput) => {
      const milestone: ProjectMilestone = {
        id: crypto.randomUUID(),
        kind: input.kind,
        date: input.date,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        createdAt: new Date().toISOString(),
      };
      mutateFinancials(projectId, (f) => ({
        ...f,
        milestones: [...f.milestones, milestone],
      }));
      if (supabase) {
        void supabase
          .from("project_milestones")
          .insert({
            id: milestone.id,
            project_id: projectId,
            kind: milestone.kind,
            date: milestone.date,
            note: milestone.note ?? null,
            created_at: milestone.createdAt,
          })
          .then(logDbError("milestone insert"));
      }
    },
    [mutateFinancials],
  );

  const updateMilestone = useCallback(
    (projectId: string, milestoneId: string, patch: MilestoneInput) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      const linkedPaymentIds =
        current?.financials.payments
          .filter((p) => p.milestoneId === milestoneId)
          .map((p) => p.id) ?? [];
      const linkedExpenseIds =
        current?.financials.expenseSchedule
          ?.filter((e) => e.milestoneId === milestoneId)
          .map((e) => e.id) ?? [];
      mutateFinancials(projectId, (f) => ({
        ...f,
        milestones: f.milestones.map((m) =>
          m.id === milestoneId
            ? {
                ...m,
                kind: patch.kind,
                date: patch.date,
                ...(patch.note?.trim()
                  ? { note: patch.note.trim() }
                  : { note: undefined }),
              }
            : m,
        ),
        payments: f.payments.map((p) =>
          p.milestoneId === milestoneId ? { ...p, dueDate: patch.date } : p,
        ),
        expenseSchedule: (f.expenseSchedule ?? []).map((e) =>
          e.milestoneId === milestoneId ? { ...e, dueDate: patch.date } : e,
        ),
      }));
      if (supabase) {
        void supabase
          .from("project_milestones")
          .update({
            kind: patch.kind,
            date: patch.date,
            note: patch.note?.trim() || null,
          })
          .eq("id", milestoneId)
          .then(logDbError("milestone update"));
        for (const paymentId of linkedPaymentIds) {
          void supabase
            .from("project_payments")
            .update({ due_date: patch.date })
            .eq("id", paymentId)
            .then(logDbError("linked payment date sync"));
        }
        for (const expenseId of linkedExpenseIds) {
          void supabase
            .from("project_expenses")
            .update({ due_date: patch.date })
            .eq("id", expenseId)
            .then(logDbError("linked expense date sync"));
        }
      }
    },
    [mutateFinancials],
  );

  const deleteMilestone = useCallback(
    (projectId: string, milestoneId: string) => {
      // Keep payments/expenses; just clear the link so they stay on the last known date.
      mutateFinancials(projectId, (f) => ({
        ...f,
        milestones: f.milestones.filter((m) => m.id !== milestoneId),
        payments: f.payments.map((p) => {
          if (p.milestoneId !== milestoneId) return p;
          const next = { ...p };
          delete next.milestoneId;
          return next;
        }),
        expenseSchedule: (f.expenseSchedule ?? []).map((e) => {
          if (e.milestoneId !== milestoneId) return e;
          const next = { ...e };
          delete next.milestoneId;
          return next;
        }),
      }));
      if (supabase) {
        void supabase
          .from("project_milestones")
          .delete()
          .eq("id", milestoneId)
          .then(logDbError("milestone delete"));
        void supabase
          .from("project_payments")
          .update({ milestone_id: null })
          .eq("milestone_id", milestoneId)
          .then(logDbError("unlink payments from milestone"));
        void supabase
          .from("project_expenses")
          .update({ milestone_id: null })
          .eq("milestone_id", milestoneId)
          .then(logDbError("unlink expenses from milestone"));
      }
    },
    [mutateFinancials],
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
        addContact,
        updateContact,
        deleteContact,
        updateFinancials,
        addPayment,
        updatePayment,
        deletePayment,
        addExpense,
        updateExpense,
        deleteExpense,
        addMilestone,
        updateMilestone,
        deleteMilestone,
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
