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
  ProjectFile,
  ProjectFileKind,
  ProjectFinancials,
  ProjectMilestone,
  ProjectPayment,
  ProjectTodo,
  Stage,
  TeamMember,
  TodoKind,
  CompanyFinanceSettings,
  TEAM_MEMBERS,
  DEFAULT_EMAIL_REMINDER_DAYS,
  emptyFinancials,
  defaultFinanceSettings,
  normalizeStage,
  todayDate,
} from "./types";
import { SEED_PROJECTS } from "./seed";
import {
  supabase,
  commentFromRow,
  contactFromRow,
  fileFromRow,
  projectFromRow,
  teamMemberFromRow,
  teamMemberToRow,
  todoFromRow,
} from "./supabase";
import type {
  CommentRow,
  ContactRow,
  FileRow,
  ProjectRow,
  TeamMemberRow,
  TodoRow,
} from "./supabase";
import {
  FinanceImportData,
  sanitizeAppFinancials,
  settingsAfterImport,
} from "./finance-import";

const STORAGE_KEY = "hydrogenera-lead-tracker-v1";
const TEAM_STORAGE_KEY = "hydrogenera-team-members-v1";
const TEAM_MIGRATED_KEY = "hydrogenera-team-members-migrated-v1";
const CURRENT_USER_STORAGE_KEY = "hydrogenera-current-user-v1";
const SHOW_FINANCIALS_STORAGE_KEY = "hydrogenera-show-financials-v1";
const FINANCE_SETTINGS_STORAGE_KEY = "hydrogenera-finance-settings-v1";
const FINANCE_IMPORT_STORAGE_KEY = "hydrogenera-finance-import-v1";
const PROJECT_FINANCIALS_STORAGE_KEY = "hydrogenera-project-financials-v1";
const FILE_STORAGE_BUCKET = "project-files";
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function loadLocalProjectFinancials(): Record<string, ProjectFinancials> {
  try {
    const raw = window.localStorage.getItem(PROJECT_FINANCIALS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ProjectFinancials>;
    if (!parsed || typeof parsed !== "object") return {};
    const cleaned: Record<string, ProjectFinancials> = {};
    for (const [id, f] of Object.entries(parsed)) {
      cleaned[id] = sanitizeAppFinancials(f);
    }
    return cleaned;
  } catch {
    return {};
  }
}

function withLocalFinancials(projects: Project[]): Project[] {
  const local = loadLocalProjectFinancials();
  return projects.map((p) => ({
    ...p,
    financials: sanitizeAppFinancials(
      local[p.id] ?? p.financials ?? emptyFinancials(),
    ),
  }));
}

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
  leadUserId?: string;
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
    | "lastClientContactAt"
    | "emailReminderDays"
    | "emailReminderEnabled"
    | "leadUserId"
  >
>;

/** `null` clears the field, `undefined` leaves it unchanged. */
export interface TodoPatch {
  text?: string;
  answer?: string | null;
  dueDate?: string | null;
  ownerUserId?: string | null;
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
  /** Pass `null` to clear actualization; omit to leave unchanged on update */
  actualDate?: string | null;
}

/** Same shape as a payment — dated cash outflow */
export type ExpenseInput = PaymentInput;

export interface FinanceSettingsPatch {
  openingCash?: number;
  openingCashAsOf?: string | null;
  minWorkingCapital?: number;
  stageProbabilities?: CompanyFinanceSettings["stageProbabilities"];
  monthlyExpenses?: CompanyFinanceSettings["monthlyExpenses"];
}

export interface MilestoneInput {
  kind: MilestoneKind;
  date: string;
  note?: string;
}

interface ProjectsApi {
  teamMembers: TeamMember[];
  addTeamMember: (input: { name: string; email?: string }) => void;
  updateTeamMember: (
    memberId: string,
    patch: { name?: string; email?: string | null },
  ) => void;
  /** Currently selected app user (for authorship of updates) */
  currentUserId: string | null;
  setCurrentUserId: (userId: string | null) => void;
  /** When false, financial panels/timelines stay hidden */
  showFinancials: boolean;
  setShowFinancials: (show: boolean) => void;
  /** Company opening cash, min WC, stage win probabilities (local only) */
  financeSettings: CompanyFinanceSettings;
  updateFinanceSettings: (patch: FinanceSettingsPatch) => void;
  /** CSV/Excel actuals import — source of past company + project cash */
  financeImport: FinanceImportData | null;
  applyFinanceImport: (data: FinanceImportData) => void;
  clearFinanceImport: () => void;
  projects: Project[];
  ready: boolean;
  /** True when the server has an AI API key configured */
  aiEnabled: boolean;
  /** Project ids with an AI summary generation currently in flight */
  summarizing: Record<string, boolean>;
  addProject: (input: NewProjectInput) => string;
  addComment: (projectId: string, text: string, stageChange?: Stage) => void;
  updateProject: (projectId: string, patch: ProjectPatch) => void;
  /** Mark client as contacted today — restarts the follow-up window */
  markClientContacted: (projectId: string) => void;
  updateComment: (projectId: string, commentId: string, text: string) => void;
  deleteComment: (projectId: string, commentId: string) => void;
  regenerateSummary: (projectId: string) => void;
  deleteProject: (projectId: string) => void;
  addTodo: (
    projectId: string,
    kind: TodoKind,
    text: string,
    dueDate?: string,
    ownerUserId?: string,
  ) => void;
  toggleTodo: (projectId: string, todoId: string) => void;
  updateTodo: (projectId: string, todoId: string, patch: TodoPatch) => void;
  deleteTodo: (projectId: string, todoId: string) => void;
  addContact: (projectId: string, input: ContactInput) => void;
  updateContact: (projectId: string, contactId: string, patch: ContactInput) => void;
  deleteContact: (projectId: string, contactId: string) => void;
  addProjectFile: (
    projectId: string,
    file: File,
    kind: ProjectFileKind,
    note?: string,
  ) => Promise<{ ok: true; file: ProjectFile } | { ok: false; error: string }>;
  updateProjectFile: (
    projectId: string,
    fileId: string,
    patch: { kind?: ProjectFileKind; note?: string | null },
  ) => void;
  deleteProjectFile: (projectId: string, fileId: string) => Promise<void>;
  getProjectFileUrl: (file: ProjectFile) => Promise<string | null>;
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
        stage: normalizeStage(p.stage),
        market: p.market ?? "Clean H2",
        lastClientContactAt:
          p.lastClientContactAt ?? p.createdAt.slice(0, 10),
        emailReminderDays: p.emailReminderDays ?? DEFAULT_EMAIL_REMINDER_DAYS,
        emailReminderEnabled: p.emailReminderEnabled !== false,
        ...(p.leadUserId ? { leadUserId: p.leadUserId } : {}),
        todos: (p.todos ?? []).map((t) => ({ ...t, kind: t.kind ?? "our-action" })),
        contacts: p.contacts ?? [],
        files: (p.files ?? []).map((f) => ({
          ...f,
          kind: f.kind ?? "other",
          mimeType: f.mimeType || "application/octet-stream",
          sizeBytes: f.sizeBytes ?? 0,
        })),
        comments: (p.comments ?? []).map((c) => ({
          ...c,
          ...(c.stageChange
            ? { stageChange: normalizeStage(c.stageChange) }
            : {}),
        })),
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

function loadLocalTeamMembers(): TeamMember[] {
  try {
    const raw = window.localStorage.getItem(TEAM_STORAGE_KEY);
    if (!raw) return TEAM_MEMBERS;
    const parsed = JSON.parse(raw) as TeamMember[];
    const sanitized = parsed
      .map((m) => ({
        id: m.id,
        name: m.name?.trim() ?? "",
        ...(m.email?.trim() ? { email: m.email.trim() } : {}),
      }))
      .filter((m) => m.id && m.name);
    return sanitized.length > 0 ? sanitized : TEAM_MEMBERS;
  } catch {
    return TEAM_MEMBERS;
  }
}

function sanitizeTeamMembers(rows: TeamMember[]): TeamMember[] {
  return rows
    .map((m) => ({
      id: m.id,
      name: m.name?.trim() ?? "",
      ...(m.email?.trim() ? { email: m.email.trim() } : {}),
    }))
    .filter((m) => m.id && m.name);
}

/**
 * Load team members from Supabase. If the table is empty (or missing),
 * seed once from browser localStorage so existing name edits are not lost.
 */
async function loadRemoteTeamMembers(): Promise<TeamMember[]> {
  const res = await supabase!
    .from("team_members")
    .select("*")
    .order("name", { ascending: true });

  if (res.error) {
    console.error("Supabase team members load failed:", res.error.message);
    return loadLocalTeamMembers();
  }

  const remote = sanitizeTeamMembers(
    ((res.data ?? []) as TeamMemberRow[]).map(teamMemberFromRow),
  );

  let migrated = false;
  let hadLocalStore = false;
  try {
    migrated = window.localStorage.getItem(TEAM_MIGRATED_KEY) === "1";
    hadLocalStore = window.localStorage.getItem(TEAM_STORAGE_KEY) != null;
  } catch {
    // ignore
  }

  if (!migrated) {
    const local = loadLocalTeamMembers();
    const byId = new Map<string, TeamMember>();
    for (const m of remote) byId.set(m.id, m);

    if (remote.length === 0) {
      for (const m of local) byId.set(m.id, m);
    } else if (hadLocalStore) {
      // This browser had edited the roster before DB sync — push those
      // names up once, then treat Supabase as the source of truth.
      for (const m of local) byId.set(m.id, m);
    } else {
      for (const m of local) {
        if (!byId.has(m.id)) byId.set(m.id, m);
      }
    }

    const merged = sanitizeTeamMembers([...byId.values()]);
    if (merged.length > 0) {
      const { error } = await supabase!
        .from("team_members")
        .upsert(merged.map(teamMemberToRow), { onConflict: "id" });
      if (error) {
        console.error("Supabase team members seed failed:", error.message);
      } else {
        try {
          window.localStorage.setItem(TEAM_MIGRATED_KEY, "1");
        } catch {
          // ignore
        }
        return merged.sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  }

  if (remote.length > 0) return remote;
  return loadLocalTeamMembers();
}

function loadLocalCurrentUserId(members: TeamMember[]): string | null {
  try {
    const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (!raw) return members[0]?.id ?? null;
    const id = JSON.parse(raw) as string | null;
    if (!id) return null;
    return members.some((m) => m.id === id) ? id : (members[0]?.id ?? null);
  } catch {
    return members[0]?.id ?? null;
  }
}

function loadShowFinancials(): boolean {
  try {
    const raw = window.localStorage.getItem(SHOW_FINANCIALS_STORAGE_KEY);
    if (raw == null) return false;
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

function loadLocalFinanceSettings(): CompanyFinanceSettings {
  try {
    const raw = window.localStorage.getItem(FINANCE_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultFinanceSettings();
    const parsed = JSON.parse(raw) as Partial<CompanyFinanceSettings>;
    const base = defaultFinanceSettings();
    return {
      openingCash:
        typeof parsed.openingCash === "number"
          ? parsed.openingCash
          : base.openingCash,
      minWorkingCapital:
        typeof parsed.minWorkingCapital === "number"
          ? parsed.minWorkingCapital
          : base.minWorkingCapital,
      stageProbabilities: {
        ...base.stageProbabilities,
        ...(parsed.stageProbabilities ?? {}),
      },
      monthlyExpenses: Array.isArray(parsed.monthlyExpenses)
        ? parsed.monthlyExpenses
        : base.monthlyExpenses,
      ...(typeof parsed.openingCashAsOf === "string"
        ? { openingCashAsOf: parsed.openingCashAsOf.slice(0, 7) }
        : {}),
    };
  } catch {
    return defaultFinanceSettings();
  }
}

function loadLocalFinanceImport(): FinanceImportData | null {
  try {
    const raw = window.localStorage.getItem(FINANCE_IMPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FinanceImportData;
    if (!parsed || !Array.isArray(parsed.projectActuals)) {
      return null;
    }
    return {
      ...parsed,
      companyMonths: Array.isArray(parsed.companyMonths)
        ? parsed.companyMonths
        : [],
      projectExpected: Array.isArray(parsed.projectExpected)
        ? parsed.projectExpected
        : [],
      projectMilestones: Array.isArray(parsed.projectMilestones)
        ? parsed.projectMilestones
        : [],
    };
  } catch {
    return null;
  }
}

async function loadRemote(): Promise<Project[]> {
  const [
    projectsRes,
    commentsRes,
    todosRes,
    contactsRes,
    filesRes,
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
      .from("project_files")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (commentsRes.error) throw commentsRes.error;
  if (todosRes.error) throw todosRes.error;
  if (contactsRes.error) {
    console.error("Supabase contacts load failed:", contactsRes.error.message);
  }
  if (filesRes.error) {
    console.error("Supabase files load failed:", filesRes.error.message);
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
  const filesByProject = new Map<string, ProjectFile[]>();
  for (const row of (filesRes.data ?? []) as FileRow[]) {
    const list = filesByProject.get(row.project_id) ?? [];
    list.push(fileFromRow(row));
    filesByProject.set(row.project_id, list);
  }
  // Financial schedules are local / Excel only — never loaded from DB.
  return ((projectsRes.data ?? []) as ProjectRow[]).map((row) =>
    projectFromRow(
      row,
      commentsByProject.get(row.id) ?? [],
      todosByProject.get(row.id) ?? [],
      contactsByProject.get(row.id) ?? [],
      emptyFinancials(),
      filesByProject.get(row.id) ?? [],
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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(TEAM_MEMBERS);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(null);
  const [showFinancials, setShowFinancialsState] = useState(false);
  const [financeSettings, setFinanceSettings] = useState<CompanyFinanceSettings>(
    defaultFinanceSettings,
  );
  const [financeImport, setFinanceImport] = useState<FinanceImportData | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [supportsOwnershipFields, setSupportsOwnershipFields] = useState(false);
  const [supportsCommentAuthorId, setSupportsCommentAuthorId] = useState(false);
  const [summarizing, setSummarizing] = useState<Record<string, boolean>>({});
  const projectsRef = useRef<Project[]>([]);
  projectsRef.current = projects;
  const teamMembersRef = useRef<TeamMember[]>(teamMembers);
  teamMembersRef.current = teamMembers;
  const currentUserIdRef = useRef<string | null>(currentUserId);
  currentUserIdRef.current = currentUserId;

  useEffect(() => {
    setShowFinancialsState(loadShowFinancials());

    async function boot() {
      if (supabase) {
        const [members, remoteProjects] = await Promise.all([
          loadRemoteTeamMembers().catch((e) => {
            console.error("Failed to load team members from Supabase:", e);
            return loadLocalTeamMembers();
          }),
          loadRemote().catch((e) => {
            console.error("Failed to load projects from Supabase:", e);
            return [] as Project[];
          }),
        ]);
        setTeamMembers(members);
        setCurrentUserIdState(loadLocalCurrentUserId(members));
        setProjects(withLocalFinancials(remoteProjects));
        setFinanceSettings(loadLocalFinanceSettings());
        setFinanceImport(loadLocalFinanceImport());
        setReady(true);
      } else {
        const members = loadLocalTeamMembers();
        setTeamMembers(members);
        setCurrentUserIdState(loadLocalCurrentUserId(members));
        setProjects(withLocalFinancials(loadLocal()));
        setFinanceSettings(loadLocalFinanceSettings());
        setFinanceImport(loadLocalFinanceImport());
        setReady(true);
      }
    }

    void boot();

    fetch("/api/summarize")
      .then((r) => r.json())
      .then((d) => setAiEnabled(Boolean(d.enabled)))
      .catch(() => setAiEnabled(false));
    if (supabase) {
      Promise.all([
        supabase.from("projects").select("lead_user_id").limit(1),
        supabase.from("project_todos").select("owner_user_id").limit(1),
        supabase.from("project_comments").select("author_user_id").limit(1),
      ])
        .then(([projectsCols, todosCols, commentsCols]) => {
          setSupportsOwnershipFields(
            !projectsCols.error && !todosCols.error,
          );
          setSupportsCommentAuthorId(!commentsCols.error);
        })
        .catch(() => {
          setSupportsOwnershipFields(false);
          setSupportsCommentAuthorId(false);
        });
    }
  }, []);

  // Without a database the tracker keeps persisting to localStorage.
  useEffect(() => {
    if (ready && !supabase) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    }
  }, [projects, ready]);

  useEffect(() => {
    if (ready && !supabase) {
      window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teamMembers));
    }
  }, [teamMembers, ready]);

  useEffect(() => {
    if (ready) {
      window.localStorage.setItem(
        FINANCE_SETTINGS_STORAGE_KEY,
        JSON.stringify(financeSettings),
      );
    }
  }, [financeSettings, ready]);

  // App-entered schedules only — never persist Excel import-/expect- ids.
  useEffect(() => {
    if (!ready) return;
    const map: Record<string, ProjectFinancials> = {};
    for (const p of projects) {
      map[p.id] = sanitizeAppFinancials(p.financials);
    }
    window.localStorage.setItem(
      PROJECT_FINANCIALS_STORAGE_KEY,
      JSON.stringify(map),
    );
  }, [projects, ready]);

  useEffect(() => {
    if (ready) {
      if (financeImport) {
        window.localStorage.setItem(
          FINANCE_IMPORT_STORAGE_KEY,
          JSON.stringify(financeImport),
        );
      } else {
        window.localStorage.removeItem(FINANCE_IMPORT_STORAGE_KEY);
      }
    }
  }, [financeImport, ready]);

  useEffect(() => {
    if (ready) {
      window.localStorage.setItem(
        CURRENT_USER_STORAGE_KEY,
        JSON.stringify(currentUserId),
      );
    }
  }, [currentUserId, ready]);

  useEffect(() => {
    if (ready) {
      window.localStorage.setItem(
        SHOW_FINANCIALS_STORAGE_KEY,
        JSON.stringify(showFinancials),
      );
    }
  }, [showFinancials, ready]);

  // If the selected user is removed/edited away, fall back to first member.
  useEffect(() => {
    if (!ready) return;
    if (
      currentUserId &&
      !teamMembers.some((m) => m.id === currentUserId)
    ) {
      setCurrentUserIdState(teamMembers[0]?.id ?? null);
    }
  }, [teamMembers, currentUserId, ready]);

  const setCurrentUserId = useCallback((userId: string | null) => {
    setCurrentUserIdState(userId);
  }, []);

  const setShowFinancials = useCallback((show: boolean) => {
    setShowFinancialsState(show);
  }, []);

  const updateFinanceSettings = useCallback((patch: FinanceSettingsPatch) => {
    setFinanceSettings((prev) => {
      const next: CompanyFinanceSettings = {
        openingCash:
          patch.openingCash !== undefined
            ? patch.openingCash
            : prev.openingCash,
        minWorkingCapital:
          patch.minWorkingCapital !== undefined
            ? patch.minWorkingCapital
            : prev.minWorkingCapital,
        stageProbabilities: {
          ...prev.stageProbabilities,
          ...(patch.stageProbabilities ?? {}),
        },
        monthlyExpenses:
          patch.monthlyExpenses !== undefined
            ? patch.monthlyExpenses
            : prev.monthlyExpenses,
      };
      if (patch.openingCashAsOf !== undefined) {
        if (patch.openingCashAsOf) next.openingCashAsOf = patch.openingCashAsOf;
        // else omit / clear
      } else if (prev.openingCashAsOf) {
        next.openingCashAsOf = prev.openingCashAsOf;
      }
      return next;
    });
  }, []);

  const applyFinanceImport = useCallback((data: FinanceImportData) => {
    setFinanceImport(data);
    setFinanceSettings((prev) => settingsAfterImport(prev, data));
    // Drop local payment/expense schedules while Excel is the source of truth.
    // Keep contract summary fields only.
    setProjects((prev) =>
      prev.map((p) => {
        const f = sanitizeAppFinancials(p.financials);
        return {
          ...p,
          financials: {
            ...f,
            payments: [],
            expenseSchedule: [],
          },
        };
      }),
    );
  }, []);

  const clearFinanceImport = useCallback(() => {
    setFinanceImport(null);
    setFinanceSettings((prev) => ({
      ...prev,
      monthlyExpenses: (prev.monthlyExpenses ?? []).filter(
        (e) => e.status === "projected",
      ),
    }));
  }, []);

  const resolveAuthor = useCallback(() => {
    const id = currentUserIdRef.current;
    const member = id
      ? teamMembersRef.current.find((m) => m.id === id)
      : undefined;
    return {
      author: member?.name ?? "You",
      ...(member ? { authorUserId: member.id } : {}),
    };
  }, []);

  const addTeamMember = useCallback(
    (input: { name: string; email?: string }) => {
      const name = input.name.trim();
      const email = input.email?.trim();
      if (!name) return;
      const member: TeamMember = {
        id: crypto.randomUUID(),
        name,
        ...(email ? { email } : {}),
      };
      setTeamMembers((prev) =>
        [...prev, member].sort((a, b) => a.name.localeCompare(b.name)),
      );
      if (supabase) {
        void supabase
          .from("team_members")
          .upsert(teamMemberToRow(member), { onConflict: "id" })
          .then(logDbError("team member insert"));
      }
    },
    [],
  );

  const updateTeamMember = useCallback(
    (memberId: string, patch: { name?: string; email?: string | null }) => {
      const current = teamMembersRef.current.find((m) => m.id === memberId);
      if (!current) return;

      const next: TeamMember = { ...current };
      if (patch.name !== undefined) {
        const trimmed = patch.name.trim();
        // Keep non-empty trimmed names; allow brief untrimmed input while typing
        if (trimmed) next.name = trimmed;
        else if (patch.name.length > 0) next.name = patch.name;
      }
      if (patch.email !== undefined) {
        if (patch.email === null || !patch.email.trim()) delete next.email;
        else next.email = patch.email.trim();
      }

      teamMembersRef.current = teamMembersRef.current.map((m) =>
        m.id === memberId ? next : m,
      );
      setTeamMembers((prev) =>
        prev.map((m) => (m.id === memberId ? next : m)),
      );

      if (supabase) {
        void supabase
          .from("team_members")
          .upsert(teamMemberToRow(next), { onConflict: "id" })
          .then(logDbError("team member update"));
      }
    },
    [],
  );

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
    const authorInfo = resolveAuthor();
    // The summary entered at creation doubles as the first update in the timeline.
    const initialComment: ProjectComment | null = description
      ? {
          id: crypto.randomUUID(),
          text: description,
          author: authorInfo.author,
          ...(authorInfo.authorUserId
            ? { authorUserId: authorInfo.authorUserId }
            : {}),
          createdAt,
        }
      : null;
    const project: Project = {
      ...input,
      id,
      lastClientContactAt: createdAt.slice(0, 10),
      emailReminderDays: DEFAULT_EMAIL_REMINDER_DAYS,
      emailReminderEnabled: true,
      ...(input.leadUserId ? { leadUserId: input.leadUserId } : {}),
      comments: initialComment ? [initialComment] : [],
      todos: [],
      contacts: [],
      files: [],
      financials: emptyFinancials(),
      createdAt,
    };
    setProjects((prev) => [project, ...prev]);
    if (supabase) {
      // Insert the comment only after the project row exists (FK constraint).
      void supabase
        .from("projects")
        .insert({
          id: project.id,
          name: project.name,
          client: project.client,
          country: project.country,
          city: project.city,
          series: project.series,
          market: project.market,
          size_kw: project.sizeKw,
          stage: project.stage,
          base_description: project.baseDescription,
          ai_summary: project.aiSummary ?? null,
          last_client_contact_at: project.lastClientContactAt,
          email_reminder_days: project.emailReminderDays,
          email_reminder_enabled: project.emailReminderEnabled,
          ...(supportsOwnershipFields
            ? { lead_user_id: project.leadUserId ?? null }
            : {}),
          created_at: project.createdAt,
        })
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
              ...(supportsCommentAuthorId
                ? { author_user_id: initialComment.authorUserId ?? null }
                : {}),
              stage_change: null,
              created_at: initialComment.createdAt,
            })
            .then(logDbError("initial comment insert"));
        });
    }
    return id;
  }, [supportsOwnershipFields, supportsCommentAuthorId, resolveAuthor]);

  const addComment = useCallback(
    (projectId: string, text: string, stageChange?: Stage) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const authorInfo = resolveAuthor();
      const comment: ProjectComment = {
        id: crypto.randomUUID(),
        text,
        author: authorInfo.author,
        ...(authorInfo.authorUserId
          ? { authorUserId: authorInfo.authorUserId }
          : {}),
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
            ...(supportsCommentAuthorId
              ? { author_user_id: comment.authorUserId ?? null }
              : {}),
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
    [requestAiSummary, resolveAuthor, supportsCommentAuthorId],
  );

  const updateProject = useCallback(
    (projectId: string, patch: ProjectPatch) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const updated: Project = { ...current, ...patch };
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
      if (supabase) {
        const row: Record<string, string | number | boolean | null> = {};
        if (patch.name !== undefined) row.name = patch.name;
        if (patch.client !== undefined) row.client = patch.client;
        if (patch.country !== undefined) row.country = patch.country;
        if (patch.city !== undefined) row.city = patch.city;
        if (patch.series !== undefined) row.series = patch.series;
        if (patch.market !== undefined) row.market = patch.market;
        if (patch.sizeKw !== undefined) row.size_kw = patch.sizeKw;
        if (patch.stage !== undefined) row.stage = patch.stage;
        if (patch.baseDescription !== undefined)
          row.base_description = patch.baseDescription;
        if (patch.lastClientContactAt !== undefined)
          row.last_client_contact_at = patch.lastClientContactAt;
        if (patch.emailReminderDays !== undefined)
          row.email_reminder_days = patch.emailReminderDays;
        if (patch.emailReminderEnabled !== undefined)
          row.email_reminder_enabled = patch.emailReminderEnabled;
        if (supportsOwnershipFields && patch.leadUserId !== undefined) {
          row.lead_user_id = patch.leadUserId ?? null;
        }
        void supabase
          .from("projects")
          .update(row)
          .eq("id", projectId)
          .then(logDbError("project update"));
      }
      void requestAiSummary(updated);
    },
    [requestAiSummary, supportsOwnershipFields],
  );

  const markClientContacted = useCallback(
    (projectId: string) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const lastClientContactAt = todayDate();
      const updated: Project = { ...current, lastClientContactAt };
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
      if (supabase) {
        void supabase
          .from("projects")
          .update({ last_client_contact_at: lastClientContactAt })
          .eq("id", projectId)
          .then(logDbError("mark client contacted"));
      }
    },
    [],
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
    (
      projectId: string,
      kind: TodoKind,
      text: string,
      dueDate?: string,
      ownerUserId?: string,
    ) => {
      const todo: ProjectTodo = {
        id: crypto.randomUUID(),
        kind,
        text,
        done: false,
        ...(dueDate ? { dueDate } : {}),
        ...(ownerUserId ? { ownerUserId } : {}),
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
            ...(supportsOwnershipFields
              ? { owner_user_id: todo.ownerUserId ?? null }
              : {}),
            created_at: todo.createdAt,
          })
          .then(logDbError("todo insert"));
      }
    },
    [mutateTodos, supportsOwnershipFields],
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
          if (patch.ownerUserId !== undefined) {
            if (patch.ownerUserId === null) delete next.ownerUserId;
            else next.ownerUserId = patch.ownerUserId;
          }
          return next;
        }),
      );
      if (supabase) {
        const row: Record<string, string | null> = {};
        if (patch.text !== undefined) row.text = patch.text;
        if (patch.answer !== undefined) row.answer = patch.answer;
        if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
        if (supportsOwnershipFields && patch.ownerUserId !== undefined) {
          row.owner_user_id = patch.ownerUserId;
        }
        void supabase
          .from("project_todos")
          .update(row)
          .eq("id", todoId)
          .then(logDbError("todo update"));
      }
    },
    [mutateTodos, supportsOwnershipFields],
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

  const mutateFiles = useCallback(
    (projectId: string, fn: (files: ProjectFile[]) => ProjectFile[]) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, files: fn(p.files ?? []) } : p,
        ),
      );
    },
    [],
  );

  const addProjectFile = useCallback(
    async (
      projectId: string,
      file: File,
      kind: ProjectFileKind,
      note?: string,
    ): Promise<{ ok: true; file: ProjectFile } | { ok: false; error: string }> => {
      if (file.size <= 0) {
        return { ok: false, error: "The selected file is empty." };
      }
      if (file.size > MAX_FILE_BYTES) {
        return {
          ok: false,
          error: `File is too large (max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB).`,
        };
      }

      const author = resolveAuthor();
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const safeName = file.name.replace(/[^\w.\- ()[\]]+/g, "_");
      const storagePath = `${projectId}/${id}/${safeName}`;

      const record: ProjectFile = {
        id,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        kind,
        ...(note?.trim() ? { note: note.trim() } : {}),
        storagePath,
        ...(author.authorUserId
          ? { uploadedByUserId: author.authorUserId }
          : {}),
        uploadedByName: author.author,
        createdAt,
      };

      if (supabase) {
        const { error: uploadError } = await supabase.storage
          .from(FILE_STORAGE_BUCKET)
          .upload(storagePath, file, {
            contentType: record.mimeType,
            upsert: false,
          });
        if (uploadError) {
          return {
            ok: false,
            error: uploadError.message || "Upload to storage failed.",
          };
        }

        const { error: insertError } = await supabase
          .from("project_files")
          .insert({
            id: record.id,
            project_id: projectId,
            name: record.name,
            mime_type: record.mimeType,
            size_bytes: record.sizeBytes,
            kind: record.kind,
            note: record.note ?? null,
            storage_path: record.storagePath,
            uploaded_by_user_id: record.uploadedByUserId ?? null,
            uploaded_by_name: record.uploadedByName ?? null,
            created_at: record.createdAt,
          });
        if (insertError) {
          void supabase.storage.from(FILE_STORAGE_BUCKET).remove([storagePath]);
          return {
            ok: false,
            error: insertError.message || "Could not save file metadata.",
          };
        }
      } else {
        // Local fallback: keep a data URL so downloads still work offline.
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(reader.error ?? new Error("read failed"));
            reader.readAsDataURL(file);
          });
          record.localDataUrl = dataUrl;
        } catch {
          return { ok: false, error: "Could not read the selected file." };
        }
      }

      mutateFiles(projectId, (files) => [record, ...files]);
      return { ok: true, file: record };
    },
    [mutateFiles, resolveAuthor],
  );

  const updateProjectFile = useCallback(
    (
      projectId: string,
      fileId: string,
      patch: { kind?: ProjectFileKind; note?: string | null },
    ) => {
      mutateFiles(projectId, (files) =>
        files.map((f) => {
          if (f.id !== fileId) return f;
          const next = { ...f };
          if (patch.kind !== undefined) next.kind = patch.kind;
          if (patch.note !== undefined) {
            if (patch.note === null || !patch.note.trim()) delete next.note;
            else next.note = patch.note.trim();
          }
          return next;
        }),
      );
      if (supabase) {
        const row: Record<string, string | null> = {};
        if (patch.kind !== undefined) row.kind = patch.kind;
        if (patch.note !== undefined) {
          row.note = patch.note && patch.note.trim() ? patch.note.trim() : null;
        }
        void supabase
          .from("project_files")
          .update(row)
          .eq("id", fileId)
          .then(logDbError("file update"));
      }
    },
    [mutateFiles],
  );

  const deleteProjectFile = useCallback(
    async (projectId: string, fileId: string) => {
      const current = projectsRef.current
        .find((p) => p.id === projectId)
        ?.files.find((f) => f.id === fileId);
      mutateFiles(projectId, (files) => files.filter((f) => f.id !== fileId));
      if (supabase && current) {
        void supabase
          .from("project_files")
          .delete()
          .eq("id", fileId)
          .then(logDbError("file delete"));
        if (current.storagePath) {
          void supabase.storage
            .from(FILE_STORAGE_BUCKET)
            .remove([current.storagePath])
            .then(({ error }) => {
              if (error)
                console.error("Supabase file storage delete failed:", error.message);
            });
        }
      }
    },
    [mutateFiles],
  );

  const getProjectFileUrl = useCallback(async (file: ProjectFile) => {
    if (file.localDataUrl) return file.localDataUrl;
    if (!supabase) return null;
    const { data, error } = await supabase.storage
      .from(FILE_STORAGE_BUCKET)
      .createSignedUrl(file.storagePath, 60 * 60);
    if (error) {
      console.error("Supabase signed URL failed:", error.message);
      return null;
    }
    return data.signedUrl;
  }, []);

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
        if (next.contractValue != null && next.expenses != null) {
          next.expectedProfit = next.contractValue - next.expenses;
        } else {
          delete next.expectedProfit;
        }
        return next;
      });
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
        ...(input.actualDate ? { actualDate: input.actualDate } : {}),
        ...(input.label?.trim() ? { label: input.label.trim() } : {}),
        ...(linked ? { milestoneId: linked.id } : {}),
        createdAt: new Date().toISOString(),
      };
      mutateFinancials(projectId, (f) => ({
        ...f,
        payments: [...f.payments, payment],
      }));
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
          if (patch.actualDate !== undefined) {
            if (patch.actualDate) next.actualDate = patch.actualDate;
          } else if (p.actualDate) {
            next.actualDate = p.actualDate;
          }
          return next;
        }),
      }));
    },
    [mutateFinancials],
  );

  const deletePayment = useCallback(
    (projectId: string, paymentId: string) => {
      mutateFinancials(projectId, (f) => ({
        ...f,
        payments: f.payments.filter((p) => p.id !== paymentId),
      }));
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
        ...(input.actualDate ? { actualDate: input.actualDate } : {}),
        ...(input.label?.trim() ? { label: input.label.trim() } : {}),
        ...(linked ? { milestoneId: linked.id } : {}),
        createdAt: new Date().toISOString(),
      };
      mutateFinancials(projectId, (f) => ({
        ...f,
        expenseSchedule: [...(f.expenseSchedule ?? []), expense],
      }));
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
          if (patch.actualDate !== undefined) {
            if (patch.actualDate) next.actualDate = patch.actualDate;
          } else if (e.actualDate) {
            next.actualDate = e.actualDate;
          }
          return next;
        }),
      }));
    },
    [mutateFinancials],
  );

  const deleteExpense = useCallback(
    (projectId: string, expenseId: string) => {
      mutateFinancials(projectId, (f) => ({
        ...f,
        expenseSchedule: (f.expenseSchedule ?? []).filter(
          (e) => e.id !== expenseId,
        ),
      }));
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
    },
    [mutateFinancials],
  );

  const updateMilestone = useCallback(
    (projectId: string, milestoneId: string, patch: MilestoneInput) => {
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
    },
    [mutateFinancials],
  );

  const deleteMilestone = useCallback(
    (projectId: string, milestoneId: string) => {
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
        teamMembers,
        addTeamMember,
        updateTeamMember,
        currentUserId,
        setCurrentUserId,
        showFinancials,
        setShowFinancials,
        financeSettings,
        updateFinanceSettings,
        financeImport,
        applyFinanceImport,
        clearFinanceImport,
        projects,
        ready,
        aiEnabled,
        summarizing,
        addProject,
        addComment,
        updateProject,
        markClientContacted,
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
        addProjectFile,
        updateProjectFile,
        deleteProjectFile,
        getProjectFileUrl,
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
