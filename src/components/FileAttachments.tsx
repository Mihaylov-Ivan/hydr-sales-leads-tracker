"use client";

import { useMemo, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  ProjectFile,
  ProjectFileKind,
  PROJECT_FILE_KINDS,
  PROJECT_FILE_KIND_LABELS,
} from "@/lib/types";

const ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toUpperCase() : "FILE";
}

function FileRow({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const { updateProjectFile, deleteProjectFile, getProjectFileUrl } =
    useProjects();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const url = await getProjectFileUrl(file);
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteProjectFile(projectId, file.id);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <li className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-[10px] font-bold uppercase tracking-wide text-teal-accent">
          {extensionOf(file.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-deep" title={file.name}>
            {file.name}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatBytes(file.sizeBytes)}
            {file.mimeType ? ` · ${file.mimeType}` : ""}
            {" · "}
            {formatWhen(file.createdAt)}
            {file.uploadedByName ? ` · ${file.uploadedByName}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={file.kind}
              onChange={(e) =>
                updateProjectFile(projectId, file.id, {
                  kind: e.target.value as ProjectFileKind,
                })
              }
              className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium text-ink outline-none focus:border-teal-accent"
              aria-label="File category"
            >
              {PROJECT_FILE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PROJECT_FILE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              value={file.note ?? ""}
              onChange={(e) =>
                updateProjectFile(projectId, file.id, {
                  note: e.target.value,
                })
              }
              placeholder="Note (optional)"
              className="min-w-[10rem] flex-1 rounded-md border border-line bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-teal-accent"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void download()}
            className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-deep transition hover:border-teal-accent/40 hover:text-teal-accent disabled:opacity-40"
          >
            Open
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-40"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-muted hover:text-ink"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg px-2 py-1.5 text-xs text-muted transition hover:text-red-500 disabled:opacity-40"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function FileAttachments({
  projectId,
  files,
}: {
  projectId: string;
  files: ProjectFile[];
}) {
  const { addProjectFile } = useProjects();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ProjectFileKind>("offer");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<{
    name: string;
    sizeBytes: number;
    mimeType: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const sorted = useMemo(
    () =>
      [...files].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [files],
  );

  async function uploadSelected(fileList: FileList | File[] | null) {
    const file = fileList && fileList[0];
    if (!file) return;
    setError("");
    setPending({
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
    });
    setUploading(true);
    try {
      const result = await addProjectFile(
        projectId,
        file,
        kind,
        note.trim() || undefined,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setUploading(false);
      setPending(null);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
          Files
        </h2>
        <p className="mt-1 text-xs text-muted">
          Attach offers, financial models, PDFs, Word/Excel files, and more.
        </p>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-[10rem_1fr]">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Category
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ProjectFileKind)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal-accent"
          >
            {PROJECT_FILE_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROJECT_FILE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Note
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Offer rev B · Feb 2026"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal-accent"
          />
        </label>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void uploadSelected(e.dataTransfer.files);
        }}
        className={`rounded-xl border border-dashed px-4 py-6 text-center transition ${
          dragOver
            ? "border-teal-accent bg-teal-soft/50"
            : "border-line bg-surface"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => void uploadSelected(e.target.files)}
        />
        <p className="text-sm text-ink">
          Drag &amp; drop a file here, or{" "}
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="font-semibold text-teal-accent hover:underline disabled:opacity-40"
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-muted">
          PDF, Word, Excel, PowerPoint, CSV, images · max 25 MB
        </p>

        {pending && (
          <div className="mx-auto mt-4 max-w-md rounded-lg border border-teal-accent/30 bg-teal-soft/40 px-3 py-2 text-left text-xs text-ink">
            <p className="font-semibold text-deep">
              {uploading ? "Uploading…" : "Selected"} · {pending.name}
            </p>
            <p className="mt-0.5 text-muted">
              {formatBytes(pending.sizeBytes)}
              {pending.mimeType ? ` · ${pending.mimeType}` : ""}
              {" · "}
              {PROJECT_FILE_KIND_LABELS[kind]}
              {note.trim() ? ` · ${note.trim()}` : ""}
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-muted/80">
          No files yet. Upload an offer or financial model to keep it with the
          project.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {sorted.map((f) => (
            <FileRow key={f.id} projectId={projectId} file={f} />
          ))}
        </ul>
      )}
    </section>
  );
}
