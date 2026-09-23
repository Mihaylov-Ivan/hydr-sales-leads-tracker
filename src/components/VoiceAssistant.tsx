"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/store";
import { useProspecting } from "@/lib/prospecting-store";
import {
  voiceToolsForAccess,
  type VoiceAccessProfile,
} from "@/lib/voice-tools";
import {
  STAGE_LABELS,
  TODO_KIND_LABELS,
  defaultStageForTrack,
  isInternalHiddenProject,
  stagesForTrack,
  trackOfProject,
  type MilestoneKind,
  type PersonalTodoStatus,
  type Project,
  type ProjectExpenseCategory,
  type ProjectTrack,
  type ScheduleShiftUnit,
  type Stage,
  type TeamMember,
  type TodoKind,
  type WarehouseLocation,
  type WarehouseMaterialKind,
} from "@/lib/types";
import { assignableTeamMembers } from "@/lib/permissions";
import type {
  ContactMethod,
  OutreachChannel,
  OutreachResult,
  ProspectPriority,
  ProspectQualification,
  ProspectStatus,
} from "@/lib/prospecting-types";

type VoiceStatus =
  | "off"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "working";

type LogKind = "user" | "assistant" | "action" | "error";

interface LogEntry {
  id: string;
  kind: LogKind;
  text: string;
}

interface FunctionCallItem {
  type: "function_call";
  name: string;
  call_id: string;
  arguments: string;
}

interface RealtimeEvent {
  type?: string;
  error?: { message?: string };
  transcript?: string;
  delta?: string;
  item_id?: string;
  response?: {
    output?: Array<
      | FunctionCallItem
      | {
          type?: string;
          content?: Array<{ text?: string; transcript?: string }>;
        }
    >;
  };
}

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchScore(query: string, project: Project): number {
  const q = normalizeSearch(query);
  if (!q) return 0;

  const name = normalizeSearch(project.name);
  const client = normalizeSearch(project.client);
  const place = normalizeSearch(`${project.city} ${project.country}`);
  const haystack = `${name} ${client} ${place}`.trim();

  let score = 0;
  if (name === q) score += 120;
  if (client === q) score += 110;
  if (name.startsWith(q)) score += 70;
  if (client.startsWith(q)) score += 65;
  if (name.includes(q)) score += 50;
  if (client.includes(q)) score += 45;
  if (place.includes(q)) score += 25;

  const tokens = q.split(/\s+/).filter(Boolean);
  const matchedTokens = tokens.filter((token) => haystack.includes(token));
  score += matchedTokens.length * 12;
  if (tokens.length > 1 && matchedTokens.length === tokens.length) score += 20;

  return score;
}

function teamMemberScore(query: string, member: TeamMember): number {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const name = normalizeSearch(member.name);
  const username = normalizeSearch(member.username ?? "");
  const email = normalizeSearch(member.email ?? "");
  const haystack = `${name} ${username} ${email}`;

  let score = 0;
  if (name === q || username === q || email === q) score += 100;
  if (name.startsWith(q) || username.startsWith(q)) score += 60;
  if (haystack.includes(q)) score += 40;
  const tokens = q.split(/\s+/).filter(Boolean);
  score += tokens.filter((token) => haystack.includes(token)).length * 10;
  return score;
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function localDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function assistantTextFromResponse(event: RealtimeEvent): string | null {
  const output = event.response?.output ?? [];
  const parts: string[] = [];
  for (const item of output) {
    if (item.type === "function_call" || !("content" in item)) continue;
    for (const part of item.content ?? []) {
      const text = part.transcript?.trim() || part.text?.trim();
      if (text) parts.push(text);
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export default function VoiceAssistant() {
  const projectsApi = useProjects();
  const {
    projects,
    teamMembers,
    ready,
    addComment,
    addTodo,
    updateProject,
  } = projectsApi;
  const prospectingApi = useProspecting();
  const {
    user,
    authEnabled,
    ready: authReady,
    can,
    canWrite,
  } = useAuth();

  const enabled = process.env.NEXT_PUBLIC_AI_VOICE === "true";
  const hasPermission = useCallback(
    (permission: Parameters<typeof can>[0]) =>
      !authEnabled || Boolean(user?.isAdmin) || can(permission),
    [authEnabled, can, user?.isAdmin],
  );

  const accessProfile = useMemo<VoiceAccessProfile>(
    () => ({
      anyArea:
        !authEnabled ||
        Boolean(
          user?.isAdmin ||
            user?.permissions.some((permission) => permission !== "viewer"),
        ),
      projectGeneral:
        !authEnabled ||
        Boolean(
          user?.isAdmin ||
            can("sales") ||
            can("technical_sales") ||
            can("eu_funding_rnd"),
        ),
      prospecting: !authEnabled || Boolean(user?.isAdmin || can("sales")),
      ganttWrite:
        !authEnabled ||
        Boolean(user?.isAdmin || can("technical_sales") || can("eu_funding_rnd")),
      ganttRead:
        !authEnabled ||
        Boolean(
          user?.isAdmin ||
            can("technical_sales") ||
            can("eu_funding_rnd") ||
            can("production"),
        ),
      finance:
        !authEnabled ||
        Boolean(user?.isAdmin || can("finance") || can("eu_funding_rnd")),
      warehouse: !authEnabled || Boolean(user?.isAdmin || can("warehouse")),
      production: !authEnabled || Boolean(user?.isAdmin || can("production")),
      sales: !authEnabled || Boolean(user?.isAdmin || can("sales")),
      salesManager:
        !authEnabled || Boolean(user?.isAdmin || can("sales_manager")),
      admin: !authEnabled ? false : Boolean(user?.isAdmin),
      canWrite: !authEnabled || canWrite,
    }),
    [authEnabled, can, canWrite, user?.isAdmin, user?.permissions],
  );

  const hasAreaAccess = accessProfile.anyArea;

  const [panelOpen, setPanelOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [micMuted, setMicMuted] = useState(false);
  const [typedInput, setTypedInput] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const toolResultsRef = useRef<Map<string, string>>(new Map());
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const logsScrollRef = useRef<HTMLDivElement | null>(null);

  const stateRef = useRef({
    projects,
    teamMembers,
    ready,
    addComment,
    addTodo,
    updateProject,
    projectsApi,
    prospectingApi,
    user,
    authEnabled,
    canWrite,
  });
  stateRef.current = {
    projects,
    teamMembers,
    ready,
    addComment,
    addTodo,
    updateProject,
    projectsApi,
    prospectingApi,
    user,
    authEnabled,
    canWrite,
  };

  const appendLog = useCallback((kind: LogKind, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLogs((prev) => [
      ...prev.slice(-49),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind,
        text: trimmed,
      },
    ]);
  }, []);

  const allowedProjects = useCallback((): Project[] => {
    const s = stateRef.current;
    return s.projects.filter((project) => {
      if (isInternalHiddenProject(project)) return false;
      if (!s.authEnabled) return true;
      if (!s.user) return false;
      if (s.user.isAdmin) return true;
      const track = trackOfProject(project);
      if (track === "sales") {
        return (
          s.user.permissions.includes("sales") ||
          s.user.permissions.includes("technical_sales")
        );
      }
      return s.user.permissions.includes("eu_funding_rnd");
    });
  }, []);

  const executeTool = useCallback(
    async (name: string, rawArgs: string): Promise<string> => {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
      } catch {
        return JSON.stringify({
          ok: false,
          error: "Invalid tool arguments.",
        });
      }

      const s = stateRef.current;
      if (!s.ready) {
        return JSON.stringify({
          ok: false,
          error: "CRM data is still loading. Ask the user to wait a moment.",
        });
      }

      const visibleProjects = allowedProjects();
      const findProject = (id: unknown) =>
        typeof id === "string"
          ? visibleProjects.find((project) => project.id === id)
          : undefined;

      if (name === "search_projects") {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (!query) {
          return JSON.stringify({
            ok: false,
            error: "A project search query is required.",
          });
        }
        const matches = visibleProjects
          .map((project) => ({
            project,
            score: matchScore(query, project),
          }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map(({ project, score }) => ({
            id: project.id,
            name: project.name,
            client: project.client,
            location: [project.city, project.country].filter(Boolean).join(", "),
            stage: project.stage,
            stage_label: STAGE_LABELS[project.stage],
            track: trackOfProject(project),
            score,
          }));

        return JSON.stringify({
          ok: true,
          count: matches.length,
          projects: matches,
          instruction:
            matches.length === 1
              ? "One clear CRM match was found."
              : matches.length === 0
                ? "No CRM project matched. Ask the user for another project/client name."
                : "Multiple CRM matches were found. If more than one is plausible, ask the user which one they mean before writing.",
        });
      }

      if (name === "get_project") {
        const project = findProject(args.project_id);
        if (!project) {
          return JSON.stringify({
            ok: false,
            error: "Project not found or not available to this user.",
          });
        }

        const updates = [...(project.comments ?? [])]
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .slice(0, 10)
          .map((comment) => ({
            text: comment.text,
            author: comment.author,
            created_at: comment.createdAt,
            stage_change: comment.stageChange ?? null,
          }));

        const openTasks = (project.todos ?? [])
          .filter((todo) => !todo.done)
          .slice(0, 12)
          .map((todo) => ({
            id: todo.id,
            kind: todo.kind,
            text: todo.text,
            due_date: todo.dueDate ?? null,
            owner_user_id: todo.ownerUserId ?? null,
          }));

        return JSON.stringify({
          ok: true,
          project: {
            id: project.id,
            name: project.name,
            client: project.client,
            country: project.country,
            city: project.city,
            series: project.series,
            market: project.market,
            size_kw: project.sizeKw,
            stage: project.stage,
            stage_label: STAGE_LABELS[project.stage],
            track: trackOfProject(project),
            summary: project.aiSummary || project.baseDescription || "",
            recent_updates: updates,
            open_tasks: openTasks,
          },
        });
      }

      if (name === "search_team_members") {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (!query) {
          return JSON.stringify({
            ok: false,
            error: "A team-member search query is required.",
          });
        }
        const matches = assignableTeamMembers(s.teamMembers)
          .map((member) => ({
            member,
            score: teamMemberScore(query, member),
          }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map(({ member, score }) => ({
            id: member.id,
            name: member.name,
            username: member.username ?? null,
            score,
          }));

        return JSON.stringify({
          ok: true,
          count: matches.length,
          team_members: matches,
          instruction:
            matches.length === 1
              ? "One clear assignable team member was found."
              : matches.length === 0
                ? "No assignable team member matched. Ask the user who should own the task."
                : "Multiple team members matched. Ask the user which person they mean before assigning.",
        });
      }

      const canMutate = !s.authEnabled || s.canWrite;
      if (!canMutate) {
        return JSON.stringify({
          ok: false,
          error: "This account is read-only and cannot change CRM data.",
        });
      }

      if (name === "add_project_comment") {
        const project = findProject(args.project_id);
        const text = typeof args.text === "string" ? args.text.trim() : "";
        const stageChange =
          typeof args.stage_change === "string"
            ? (args.stage_change as Stage)
            : undefined;

        if (!project) {
          return JSON.stringify({
            ok: false,
            error: "Project not found or not available to this user.",
          });
        }
        if (!text) {
          return JSON.stringify({ ok: false, error: "Comment text is required." });
        }
        if (
          stageChange &&
          !stagesForTrack(trackOfProject(project)).includes(stageChange)
        ) {
          return JSON.stringify({
            ok: false,
            error: "That stage is not valid for this project's track.",
          });
        }

        s.addComment(project.id, text, stageChange);
        appendLog(
          "action",
          `Added update to ${project.name}${stageChange ? ` and moved it to ${STAGE_LABELS[stageChange]}` : ""}.`,
        );
        return JSON.stringify({
          ok: true,
          project_id: project.id,
          project_name: project.name,
          saved: "comment",
          stage: stageChange ?? project.stage,
        });
      }

      if (name === "create_project_task") {
        const project = findProject(args.project_id);
        const text = typeof args.text === "string" ? args.text.trim() : "";
        const kind: TodoKind = "our-action";
        const dueDate =
          typeof args.due_date === "string" && args.due_date.trim()
            ? args.due_date.trim()
            : undefined;
        const ownerUserId =
          typeof args.owner_user_id === "string" && args.owner_user_id.trim()
            ? args.owner_user_id.trim()
            : undefined;

        if (!project) {
          return JSON.stringify({
            ok: false,
            error: "Project not found or not available to this user.",
          });
        }
        if (!text) {
          return JSON.stringify({ ok: false, error: "Task text is required." });
        }
        if (dueDate && !isValidDateOnly(dueDate)) {
          return JSON.stringify({
            ok: false,
            error: "due_date must be a real date in YYYY-MM-DD format.",
          });
        }
        if (
          ownerUserId &&
          !assignableTeamMembers(s.teamMembers).some(
            (member) => member.id === ownerUserId,
          )
        ) {
          return JSON.stringify({
            ok: false,
            error:
              "The requested assignee is not an assignable team member. Search the team roster again.",
          });
        }

        s.addTodo(
          project.id,
          kind,
          text,
          dueDate,
          ownerUserId,
        );

        const ownerName = ownerUserId
          ? s.teamMembers.find((member) => member.id === ownerUserId)?.name
          : null;
        appendLog(
          "action",
          `Created ${TODO_KIND_LABELS[kind].toLowerCase()} on ${project.name}${dueDate ? ` due ${dueDate}` : ""}${ownerName ? ` for ${ownerName}` : ""}.`,
        );
        return JSON.stringify({
          ok: true,
          project_id: project.id,
          project_name: project.name,
          saved: "task",
          kind,
          due_date: dueDate ?? null,
          owner_user_id: ownerUserId ?? null,
          owner_name: ownerName ?? null,
        });
      }

      if (name === "change_project_stage") {
        const project = findProject(args.project_id);
        const stage =
          typeof args.stage === "string" ? (args.stage as Stage) : undefined;
        if (!project) {
          return JSON.stringify({
            ok: false,
            error: "Project not found or not available to this user.",
          });
        }
        if (!stage || !stagesForTrack(trackOfProject(project)).includes(stage)) {
          return JSON.stringify({
            ok: false,
            error: "A valid stage for this project track is required.",
          });
        }

        s.updateProject(project.id, { stage });
        appendLog(
          "action",
          `Moved ${project.name} to ${STAGE_LABELS[stage]}.`,
        );
        return JSON.stringify({
          ok: true,
          project_id: project.id,
          project_name: project.name,
          saved: "stage",
          stage,
          stage_label: STAGE_LABELS[stage],
        });
      }

      return JSON.stringify({
        ok: false,
        error: `Unsupported CRM tool: ${name}`,
      });
    },
    [allowedProjects, appendLog],
  );

  const stopSession = useCallback(() => {
    dcRef.current?.close();
    dcRef.current = null;

    pcRef.current?.close();
    pcRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }

    toolResultsRef.current.clear();
    setStatus("off");
    setMicMuted(false);
  }, []);

  useEffect(() => {
    return () => {
      dcRef.current?.close();
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.srcObject = null;
      }
    };
  }, []);

  const sendSessionConfiguration = useCallback((dc: RTCDataChannel) => {
    const now = new Date();
    const timeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "local timezone";
    const localTime = now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const localDate = localDateOnly(now);

    const instructions = `You are Hydr AI, the voice assistant inside the Hydrogenera CRM.

The user's local date is ${localDate}, local time is ${localTime}, timezone ${timeZone}.

Conversation style:
- Talk naturally and briefly, like a capable colleague. Do not sound like a command parser.
- The user may speak in incomplete or conversational sentences. Infer ordinary wording, but never invent CRM facts.
- If something important is unclear, ask one short follow-up question and wait for the answer.
- Do not recite internal IDs, tool names, JSON, or implementation details.

CRM safety and action rules:
- Use the CRM tools for CRM facts and actions. Do not claim an action happened unless its tool returned ok:true.
- Before any write, search for the project unless that exact project_id was already resolved unambiguously in this conversation.
- Never guess a project. If no project matches, ask for another name. If several matches are plausible, ask which project the user means before writing.
- If the user names an assignee, search the team roster unless that exact user id was already resolved in this conversation. Never invent an assignee.
- For relative dates, calculate the exact YYYY-MM-DD using the user's local date above. If the wording genuinely has two plausible dates, say the exact date you intend and ask the user to confirm before creating the task.
- Do not add unnecessary confirmations for routine, unambiguous actions. Execute them and confirm concisely afterwards.
- A spoken project update should normally be stored as a project comment/update. Preserve the factual content and only clean up filler or obvious speech disfluencies.
- A spoken reminder or follow-up should normally become a project action item with an appropriate due date.
- Only change a project stage if the user explicitly asks for it or clearly states that the stage itself has changed.
- If the user requests a CRM operation not exposed by the available tools, explain that limitation in one sentence and ask the smallest useful follow-up.
- After a successful write, confirm what was changed in one short sentence.
`;

    dc.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          instructions,
          tools: CRM_TOOLS,
          tool_choice: "auto",
          audio: {
            input: {
              transcription: {
                model: "gpt-4o-mini-transcribe",
              },
            },
          },
        },
      }),
    );
  }, []);

  const startSession = useCallback(async () => {
    if (pcRef.current || status === "connecting") return;
    setError(null);
    setStatus("connecting");
    toolResultsRef.current.clear();

    try {
      if (!window.isSecureContext) {
        throw new Error(
          "Microphone access requires HTTPS (or localhost). Open the CRM over HTTPS to use voice.",
        );
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone access.");
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioRef.current = audio;

      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0] ?? null;
        void audio.play().catch(() => {
          // The session was started by a user gesture; browsers normally allow this.
        });
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed" ||
          pc.connectionState === "disconnected"
        ) {
          if (pcRef.current === pc) {
            setError(
              pc.connectionState === "failed"
                ? "Voice connection failed. Please reconnect."
                : null,
            );
            stopSession();
          }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      for (const track of stream.getAudioTracks()) {
        // Do not transmit speech until our CRM instructions/tools are active.
        track.enabled = false;
        pc.addTrack(track, stream);
      }

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.addEventListener("open", () => {
        sendSessionConfiguration(dc);
      });

      dc.addEventListener("message", (message) => {
        void (async () => {
          let event: RealtimeEvent;
          try {
            event = JSON.parse(String(message.data)) as RealtimeEvent;
          } catch {
            return;
          }

          if (event.type === "session.updated") {
            streamRef.current?.getAudioTracks().forEach((track) => {
              track.enabled = true;
            });
            setMicMuted(false);
            setStatus("listening");
            return;
          }

          if (event.type === "input_audio_buffer.speech_started") {
            setStatus("listening");
            return;
          }

          if (
            event.type ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            const spoken = event.transcript?.trim();
            if (spoken) appendLog("user", spoken);
            return;
          }

          if (event.type === "response.created") {
            setStatus("thinking");
            return;
          }

          if (
            event.type === "response.output_audio.delta" ||
            event.type === "response.audio.delta"
          ) {
            setStatus("speaking");
            return;
          }

          if (event.type === "error") {
            const messageText =
              event.error?.message || "The realtime voice service reported an error.";
            setError(messageText);
            appendLog("error", messageText);
            setStatus("listening");
            return;
          }

          if (event.type !== "response.done") return;

          const output = event.response?.output ?? [];
          const calls = output.filter(
            (item): item is FunctionCallItem => item.type === "function_call",
          );

          if (calls.length > 0) {
            setStatus("working");

            for (const call of calls) {
              let toolOutput = toolResultsRef.current.get(call.call_id);
              if (!toolOutput) {
                toolOutput = await executeTool(call.name, call.arguments);
                toolResultsRef.current.set(call.call_id, toolOutput);
              }

              if (dc.readyState === "open") {
                dc.send(
                  JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: call.call_id,
                      output: toolOutput,
                    },
                  }),
                );
              }
            }

            if (dc.readyState === "open") {
              dc.send(JSON.stringify({ type: "response.create" }));
              setStatus("thinking");
            }
            return;
          }

          const assistantText = assistantTextFromResponse(event);
          if (assistantText) appendLog("assistant", assistantText);
          setStatus("listening");
        })();
      });

      dc.addEventListener("close", () => {
        if (dcRef.current === dc) stopSession();
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch("/api/ai/voice/session", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(detail?.error || `Voice connection failed (${response.status}).`);
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
    } catch (e) {
      const messageText =
        e instanceof Error ? e.message : "Could not start the voice assistant.";
      setError(messageText);
      appendLog("error", messageText);
      stopSession();
    }
  }, [
    appendLog,
    executeTool,
    sendSessionConfiguration,
    status,
    stopSession,
  ]);

  const toggleMic = useCallback(() => {
    const nextMuted = !micMuted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  }, [micMuted]);

  const sendTypedMessage = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const text = typedInput.trim();
      const dc = dcRef.current;
      if (!text || !dc || dc.readyState !== "open") return;

      dc.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text }],
          },
        }),
      );
      dc.send(JSON.stringify({ type: "response.create" }));
      appendLog("user", text);
      setTypedInput("");
      setStatus("thinking");
    },
    [appendLog, typedInput],
  );

  const statusLabel = useMemo(() => {
    if (status === "off") return "Not connected";
    if (status === "connecting") return "Connecting…";
    if (status === "listening") return micMuted ? "Microphone muted" : "Listening";
    if (status === "thinking") return "Thinking…";
    if (status === "speaking") return "Speaking";
    return "Updating CRM…";
  }, [micMuted, status]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const scroller = logsScrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [logs, panelOpen]);

  if (!enabled || !authReady || isViewer || !hasAreaAccess) {
    return null;
  }

  const connected = status !== "off" && status !== "connecting";

  const panel =
    panelOpen && mounted && typeof document !== "undefined"
      ? createPortal(
          <section
            role="dialog"
            aria-label="Hydr AI"
            style={{
              position: "fixed",
              bottom: 20,
              right: 20,
              zIndex: 99999,
              width: "min(390px, calc(100vw - 2rem))",
            }}
            className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      status === "off"
                        ? "bg-muted/40"
                        : status === "connecting"
                          ? "animate-pulse bg-amber-400"
                          : "bg-teal-accent"
                    }`}
                    aria-hidden
                  />
                  <h2 className="text-sm font-bold text-deep">Hydr AI</h2>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">{statusLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopSession();
                  setPanelOpen(false);
                }}
                className="cursor-pointer rounded-md p-1.5 text-muted transition hover:bg-surface hover:text-deep"
                aria-label="Close AI assistant"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="m5 5 10 10M15 5 5 15"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

          <div
            ref={logsScrollRef}
            className="min-h-40 max-h-[min(22rem,45vh)] space-y-2 overflow-y-auto overscroll-contain px-4 py-3"
          >
            {logs.length === 0 ? (
              <div className="space-y-2 text-xs leading-relaxed text-muted">
                <p className="font-semibold text-deep">
                  Speak normally — no special commands needed.
                </p>
                <p>
                  “Update Project DW: we visited the site and optimized the burners…”
                </p>
                <p>
                  “Add a task to contact Volkswagen next Thursday and assign it to Elena.”
                </p>
                <p className="text-[11px]">
                  If a project, person, or date is unclear, Hydr AI will ask you before changing the CRM.
                </p>
              </div>
            ) : (
              <>
                {logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      entry.kind === "action"
                        ? "border border-teal-accent/20 bg-teal-soft text-deep"
                        : entry.kind === "error"
                          ? "border border-red-200 bg-red-50 text-red-700"
                          : entry.kind === "user"
                            ? "ml-8 bg-deep text-white"
                            : "mr-8 bg-surface text-deep"
                    }`}
                  >
                    {entry.kind === "action" && (
                      <span className="mr-1 font-bold text-teal-accent">CRM:</span>
                    )}
                    {entry.kind === "user" && (
                      <span className="mr-1 font-semibold text-white/70">You:</span>
                    )}
                    {entry.kind === "assistant" && (
                      <span className="mr-1 font-semibold text-teal-accent">Hydr:</span>
                    )}
                    {entry.text}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </>
            )}
          </div>

          {error && (
            <div className="border-t border-line bg-red-50 px-4 py-2 text-[11px] text-red-700">
              {error}
            </div>
          )}

          <div className="border-t border-line px-4 py-3">
            {status === "off" || status === "connecting" ? (
              <button
                type="button"
                disabled={status === "connecting" || !ready}
                onClick={() => void startSession()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                  <path
                    d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                {status === "connecting" ? "Connecting…" : "Start voice conversation"}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`flex flex-1 items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    micMuted
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-line bg-surface text-deep hover:border-teal-accent/40"
                  }`}
                >
                  {micMuted ? "Unmute microphone" : "Mute microphone"}
                </button>
                <button
                  type="button"
                  onClick={stopSession}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted transition hover:text-deep"
                >
                  Stop
                </button>
              </div>
            )}

            <form onSubmit={sendTypedMessage} className="mt-2 flex gap-2">
              <input
                value={typedInput}
                onChange={(event) => setTypedInput(event.target.value)}
                disabled={!connected}
                placeholder={
                  connected ? "Or type a CRM request…" : "Start voice to enable chat"
                }
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-deep outline-none placeholder:text-muted/60 focus:border-teal-accent disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!connected || !typedInput.trim()}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-deep transition hover:border-teal-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </div>
        </section>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        title="Open Hydr AI voice assistant"
        className="inline-flex cursor-pointer shrink-0 items-center gap-1.5 rounded-lg bg-olive px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide text-olive-ink shadow-sm transition hover:brightness-95 sm:px-3 sm:text-xs"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
          <path
            d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        Ask Hydr
      </button>
      {panel}
    </>
  );
}
