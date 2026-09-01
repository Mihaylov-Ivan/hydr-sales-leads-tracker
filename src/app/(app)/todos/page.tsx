"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  PersonalTodoStatus,
  PERSONAL_TODO_BOARD_STATUSES,
  PERSONAL_TODO_STATUS_LABELS,
  PERSONAL_TODO_STATUSES,
  comparePersonalTodos,
} from "@/lib/types";
import PersonalTodoCard, {
  PERSONAL_TODO_DRAG_TYPE,
} from "@/components/PersonalTodoCard";
import NewPersonalTodoDialog from "@/components/NewPersonalTodoDialog";

const COLUMN_ACCENT: Record<PersonalTodoStatus, string> = {
  cancelled: "border-t-muted",
  todo: "border-t-teal-accent",
  doing: "border-t-amber-accent",
  done: "border-t-green-accent",
};

const COLUMN_MIN_PX = 270;

const CANCELLED_STORAGE_KEY = "hydrogenera-show-personal-cancelled-v1";
const DONE_STORAGE_KEY = "hydrogenera-show-personal-done-v1";

function readDraggedTodoId(e: React.DragEvent): string {
  return (
    e.dataTransfer.getData(PERSONAL_TODO_DRAG_TYPE) ||
    e.dataTransfer.getData("text/plain")
  );
}

function resolveDropIndex(
  root: HTMLElement,
  clientY: number,
  todoIds: string[],
): number {
  for (let i = 0; i < todoIds.length; i++) {
    const el = root.querySelector<HTMLElement>(
      `[data-todo-item="${todoIds[i]}"]`,
    );
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return todoIds.length;
}

type ColumnDragHandlers = {
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
};

function CollapsedStatusRail({
  status,
  count,
  isOver,
  onExpand,
  onDropTodo,
  dragHandlers,
}: {
  status: "cancelled" | "done";
  count: number;
  isOver: boolean;
  onExpand: () => void;
  onDropTodo: (todoId: string) => void;
  dragHandlers: Omit<ColumnDragHandlers, "onDrop">;
}) {
  const label = PERSONAL_TODO_STATUS_LABELS[status];
  const muted = status === "cancelled" || status === "done";
  return (
    <button
      type="button"
      aria-expanded={false}
      aria-controls={`${status}-column`}
      onClick={onExpand}
      onDragOver={dragHandlers.onDragOver}
      onDragLeave={dragHandlers.onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        const id = readDraggedTodoId(e);
        if (id) onDropTodo(id);
      }}
      className={`group flex h-full w-11 shrink-0 flex-col items-center justify-between rounded-xl border border-t-4 py-3 transition ${
        muted
          ? "border-t-muted border-line bg-muted/5 hover:border-muted hover:bg-muted/10"
          : "border-t-deep border-line bg-surface-tint/60 hover:border-deep/40 hover:bg-surface-tint"
      } ${
        isOver ? "border-teal-accent bg-teal-soft/40 ring-2 ring-teal-accent/30" : ""
      }`}
      title={`Show ${label.toLowerCase()} tasks`}
    >
      <span className="rounded-full bg-panel px-1.5 py-0.5 text-[10px] font-bold text-muted shadow-sm">
        {count}
      </span>
      <span
        className="flex flex-1 items-center justify-center px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {label}
      </span>
      <span
        className="text-sm text-muted/70 transition group-hover:translate-x-0.5 group-hover:text-muted"
        aria-hidden
      >
        ›
      </span>
    </button>
  );
}

function DropIndicator() {
  return (
    <div
      aria-hidden
      className="my-0.5 h-1 shrink-0 rounded-full bg-teal-accent shadow-[0_0_0_2px_rgba(45,125,125,0.15)]"
    />
  );
}

function StatusColumn({
  todos,
  isOver,
  draggingId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onReorder,
  onMove,
  accentClass,
  headerExtra,
  status,
  onExpand,
  expanded,
}: {
  status: PersonalTodoStatus;
  todos: ReturnType<typeof useProjects>["personalTodos"];
  isOver: boolean;
  draggingId: string | null;
  onDragStart: (todoId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onReorder: (todoId: string, direction: "up" | "down") => void;
  onMove: (draggedId: string, targetIndex: number) => void;
  accentClass: string;
  headerExtra?: React.ReactNode;
  onExpand?: () => void;
  expanded?: boolean;
}) {
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const isDragging = draggingId !== null;
  const todoIds = todos.map((t) => t.id);

  function clearDropState() {
    setDropIndex(null);
  }

  function handleListDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    onDragOver(e);
    setDropIndex(resolveDropIndex(e.currentTarget, e.clientY, todoIds));
  }

  function handleListDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = readDraggedTodoId(e);
    const index = resolveDropIndex(e.currentTarget, e.clientY, todoIds);
    clearDropState();
    onDragEnd();
    if (!draggedId) return;
    onMove(draggedId, index);
  }

  const headerBg = isOver
    ? "bg-teal-soft/40"
    : status === "cancelled" || status === "done"
      ? "bg-muted/5"
      : "bg-surface-tint/60";

  return (
    <section
      onDragLeave={(e) => {
        onDragLeave(e);
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          clearDropState();
        }
      }}
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-t-4 transition ${accentClass} ${
        isOver
          ? "border-teal-accent bg-teal-soft/40 ring-2 ring-teal-accent/30"
          : status === "cancelled" || status === "done"
            ? "border-line/80 bg-muted/5"
            : "border-line bg-surface-tint/60"
      }`}
    >
      <header
        className={`sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 border-b border-line/70 px-4 py-3 backdrop-blur-sm ${headerBg}`}
      >
        <h2
          className={`text-sm font-bold uppercase tracking-wide ${
            status === "cancelled" || status === "done"
              ? "text-muted"
              : "text-deep"
          }`}
        >
          {PERSONAL_TODO_STATUS_LABELS[status]}
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-panel px-2.5 py-0.5 text-xs font-semibold text-muted shadow-sm">
            {todos.length}
          </span>
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              title={
                expanded
                  ? "Exit full screen"
                  : `Expand ${PERSONAL_TODO_STATUS_LABELS[status]}`
              }
              className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted transition hover:bg-panel hover:text-deep"
            >
              {expanded ? "Exit" : "Expand"}
            </button>
          )}
          {headerExtra}
        </div>
      </header>
      <div
        onDragOver={handleListDragOver}
        onDrop={handleListDrop}
        className={`min-h-0 flex-1 gap-2 overflow-y-auto overscroll-contain px-3 py-3 ${
          expanded
            ? "grid grid-cols-1 content-start sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "flex flex-col"
        }`}
      >
        {todos.length === 0 ? (
          <>
            {isDragging && dropIndex === 0 && <DropIndicator />}
            <p
              className={`shrink-0 rounded-lg border border-dashed py-8 text-center text-xs ${
                isOver
                  ? "border-teal-accent text-teal-accent"
                  : "border-line text-muted"
              } ${expanded ? "col-span-full" : ""}`}
            >
              {isOver ? "Drop to move here" : "No tasks here."}
            </p>
          </>
        ) : (
          todos.map((t, index) => (
            <Fragment key={t.id}>
              {isDragging && dropIndex === index && <DropIndicator />}
              <div data-todo-item={t.id} className="shrink-0">
                <PersonalTodoCard
                  todo={t}
                  isDragging={draggingId === t.id}
                  canMoveUp={index > 0}
                  canMoveDown={index < todos.length - 1}
                  onMoveUp={() => onReorder(t.id, "up")}
                  onMoveDown={() => onReorder(t.id, "down")}
                  onDragStartExtra={() => onDragStart(t.id)}
                  onDragEndExtra={onDragEnd}
                />
              </div>
            </Fragment>
          ))
        )}
        {isDragging && dropIndex === todos.length && todos.length > 0 && (
          <DropIndicator />
        )}
      </div>
    </section>
  );
}

export default function PersonalTodosPage() {
  const {
    personalTodos,
    ready,
    movePersonalTodo,
    reorderPersonalTodo,
  } = useProjects();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [dragOverStatus, setDragOverStatus] =
    useState<PersonalTodoStatus | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [cancelledPrefReady, setCancelledPrefReady] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [donePrefReady, setDonePrefReady] = useState(false);
  const [expandedStatus, setExpandedStatus] =
    useState<PersonalTodoStatus | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CANCELLED_STORAGE_KEY) === "1") {
        setShowCancelled(true);
      }
      if (window.localStorage.getItem(DONE_STORAGE_KEY) === "1") {
        setShowDone(true);
      }
    } catch {
      /* ignore */
    }
    setCancelledPrefReady(true);
    setDonePrefReady(true);
  }, []);

  useEffect(() => {
    if (!cancelledPrefReady) return;
    try {
      window.localStorage.setItem(
        CANCELLED_STORAGE_KEY,
        showCancelled ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [showCancelled, cancelledPrefReady]);

  useEffect(() => {
    if (!donePrefReady) return;
    try {
      window.localStorage.setItem(DONE_STORAGE_KEY, showDone ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [showDone, donePrefReady]);

  useEffect(() => {
    if (!expandedStatus) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpandedStatus(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expandedStatus]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return personalTodos;
    return personalTodos.filter((t) =>
      [t.title, t.description ?? "", ...(t.comments.map((c) => c.text) ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [personalTodos, search]);

  const byStatus = useMemo(() => {
    const map: Record<PersonalTodoStatus, typeof filtered> = {
      cancelled: [],
      todo: [],
      doing: [],
      done: [],
    };
    for (const t of filtered) map[t.status].push(t);
    for (const status of PERSONAL_TODO_STATUSES) {
      map[status].sort(comparePersonalTodos);
    }
    return map;
  }, [filtered]);

  function moveTodoToStatus(todoId: string, status: PersonalTodoStatus) {
    const todo = personalTodos.find((t) => t.id === todoId);
    if (!todo || todo.status === status) return;
    const targetIndex = byStatus[status].filter((t) => t.id !== todoId).length;
    movePersonalTodo(todoId, status, targetIndex);
    if (status === "cancelled") setShowCancelled(true);
    if (status === "done") setShowDone(true);
  }

  function moveTodoInColumn(
    status: PersonalTodoStatus,
    draggedId: string,
    targetIndex: number,
  ) {
    setDragOverStatus(null);
    movePersonalTodo(draggedId, status, targetIndex);
    if (status === "cancelled") setShowCancelled(true);
    if (status === "done") setShowDone(true);
  }

  function columnDragHandlers(
    status: PersonalTodoStatus,
  ): Omit<ColumnDragHandlers, "onDrop"> {
    return {
      onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOverStatus !== status) setDragOverStatus(status);
      },
      onDragLeave: (e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragOverStatus((cur) => (cur === status ? null : cur));
      },
    };
  }

  if (!ready) {
    return <p className="py-20 text-center text-muted">Loading to-dos…</p>;
  }

  const cancelledCount = byStatus.cancelled.length;
  const doneCount = byStatus.done.length;
  const cancelledOver = dragOverStatus === "cancelled";
  const doneOver = dragOverStatus === "done";

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col gap-3 overflow-hidden sm:gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-deep">Personal to-dos</h1>
          <p className="mt-1 text-sm text-muted">
            Drag tasks to reorder within a column or move between columns.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-olive px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-olive-ink shadow-sm transition hover:brightness-105"
        >
          + New task
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks, descriptions, comments…"
          className="min-w-56 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink shadow-sm placeholder:text-muted/60 outline-none focus:border-teal-accent"
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        {!showCancelled && (
          <CollapsedStatusRail
            status="cancelled"
            count={cancelledCount}
            isOver={cancelledOver}
            onExpand={() => setShowCancelled(true)}
            onDropTodo={(id) => moveTodoToStatus(id, "cancelled")}
            dragHandlers={columnDragHandlers("cancelled")}
          />
        )}

        <div
          id="cancelled-column"
          aria-hidden={!showCancelled}
          className={`min-h-0 overflow-hidden transition-[max-width,opacity,flex-basis] duration-300 ease-out ${
            showCancelled
              ? "max-w-[20rem] shrink-0 basis-[270px] opacity-100"
              : "pointer-events-none max-w-0 flex-none basis-0 opacity-0"
          }`}
          style={showCancelled ? { minWidth: COLUMN_MIN_PX } : undefined}
        >
          <div
            className={`h-full min-h-0 w-full min-w-[270px] transition-transform duration-300 ease-out ${
              showCancelled ? "translate-x-0" : "-translate-x-3"
            }`}
          >
            <StatusColumn
              status="cancelled"
              todos={byStatus.cancelled}
              isOver={cancelledOver}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDragEnd={() => setDraggingId(null)}
              accentClass={COLUMN_ACCENT.cancelled}
              onReorder={reorderPersonalTodo}
              onMove={(draggedId, targetIndex) =>
                moveTodoInColumn("cancelled", draggedId, targetIndex)
              }
              {...columnDragHandlers("cancelled")}
              onExpand={() => setExpandedStatus("cancelled")}
              headerExtra={
                <button
                  type="button"
                  onClick={() => setShowCancelled(false)}
                  title="Hide cancelled"
                  className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted transition hover:bg-panel hover:text-deep"
                >
                  Hide
                </button>
              }
            />
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain">
          {PERSONAL_TODO_BOARD_STATUSES.map((status) => (
            <div
              key={status}
              className="flex h-full min-h-0 min-w-[270px] flex-1 basis-[270px]"
            >
              <StatusColumn
                status={status}
                todos={byStatus[status]}
                isOver={dragOverStatus === status}
                draggingId={draggingId}
                onDragStart={setDraggingId}
                onDragEnd={() => setDraggingId(null)}
                accentClass={COLUMN_ACCENT[status]}
                onReorder={reorderPersonalTodo}
                onMove={(draggedId, targetIndex) =>
                  moveTodoInColumn(status, draggedId, targetIndex)
                }
                {...columnDragHandlers(status)}
                onExpand={() => setExpandedStatus(status)}
              />
            </div>
          ))}
        </div>

        {!showDone && (
          <CollapsedStatusRail
            status="done"
            count={doneCount}
            isOver={doneOver}
            onExpand={() => setShowDone(true)}
            onDropTodo={(id) => moveTodoToStatus(id, "done")}
            dragHandlers={columnDragHandlers("done")}
          />
        )}

        <div
          id="done-column"
          aria-hidden={!showDone}
          className={`min-h-0 overflow-hidden transition-[max-width,opacity,flex-basis] duration-300 ease-out ${
            showDone
              ? "max-w-[20rem] shrink-0 basis-[270px] opacity-100"
              : "pointer-events-none max-w-0 flex-none basis-0 opacity-0"
          }`}
          style={showDone ? { minWidth: COLUMN_MIN_PX } : undefined}
        >
          <div
            className={`h-full min-h-0 w-full min-w-[270px] transition-transform duration-300 ease-out ${
              showDone ? "translate-x-0" : "translate-x-3"
            }`}
          >
            <StatusColumn
              status="done"
              todos={byStatus.done}
              isOver={doneOver}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDragEnd={() => setDraggingId(null)}
              accentClass={COLUMN_ACCENT.done}
              onReorder={reorderPersonalTodo}
              onMove={(draggedId, targetIndex) =>
                moveTodoInColumn("done", draggedId, targetIndex)
              }
              {...columnDragHandlers("done")}
              onExpand={() => setExpandedStatus("done")}
              headerExtra={
                <button
                  type="button"
                  onClick={() => setShowDone(false)}
                  title="Hide done"
                  className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted transition hover:bg-panel hover:text-deep"
                >
                  Hide
                </button>
              }
            />
          </div>
        </div>
      </div>

      {expandedStatus && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-deep/40 p-3 backdrop-blur-sm sm:p-4"
          onClick={() => setExpandedStatus(null)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-[1800px] min-h-0 flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <StatusColumn
              status={expandedStatus}
              todos={byStatus[expandedStatus]}
              isOver={dragOverStatus === expandedStatus}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDragEnd={() => setDraggingId(null)}
              accentClass={COLUMN_ACCENT[expandedStatus]}
              onReorder={reorderPersonalTodo}
              onMove={(draggedId, targetIndex) =>
                moveTodoInColumn(expandedStatus, draggedId, targetIndex)
              }
              {...columnDragHandlers(expandedStatus)}
              expanded
              onExpand={() => setExpandedStatus(null)}
            />
          </div>
        </div>
      )}

      {showNew && <NewPersonalTodoDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}
