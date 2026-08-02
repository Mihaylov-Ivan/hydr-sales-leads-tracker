"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import {
  Market,
  MARKETS,
  Series,
  Stage,
  STAGE_LABELS,
  BOARD_STAGES,
} from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-teal-accent";
const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";

export default function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const { addProject, teamMembers } = useProjects();
  const router = useRouter();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [series, setSeries] = useState<Series>("Z Series");
  const [market, setMarket] = useState<Market>("Clean H2");
  const [sizeKw, setSizeKw] = useState("");
  const [stage, setStage] = useState<Stage>("cold-lead");
  const [leadUserId, setLeadUserId] = useState("");
  const [description, setDescription] = useState("");

  const valid =
    name.trim() && client.trim() && country.trim() && Number(sizeKw) > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const id = addProject({
      name: name.trim(),
      client: client.trim(),
      country: country.trim(),
      city: city.trim(),
      series,
      market,
      sizeKw: Number(sizeKw),
      stage,
      baseDescription: description.trim(),
      leadUserId: leadUserId || undefined,
    });
    onClose();
    router.push(`/projects/${id}`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-deep/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <h2 className="mb-5 text-lg font-bold text-deep">New Project</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Project name *</label>
            <input
              autoFocus
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Varna Port Refuelling Station"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Client *</label>
            <input
              className={inputCls}
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Company name"
            />
          </div>
          <div>
            <label className={labelCls}>Country *</label>
            <input
              className={inputCls}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Bulgaria"
            />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input
              className={inputCls}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Varna"
            />
          </div>
          <div>
            <label className={labelCls}>System</label>
            <select
              className={inputCls}
              value={series}
              onChange={(e) => setSeries(e.target.value as Series)}
            >
              <option>Z Series</option>
              <option>E Series</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Size (kW) *</label>
            <input
              className={inputCls}
              type="number"
              min={1}
              value={sizeKw}
              onChange={(e) => setSizeKw(e.target.value)}
              placeholder="500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Market</label>
            <select
              className={inputCls}
              value={market}
              onChange={(e) => setMarket(e.target.value as Market)}
            >
              {MARKETS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Stage</label>
            <div className="grid grid-cols-2 gap-2">
              {BOARD_STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStage(s)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                    stage === s
                      ? "border-teal-accent bg-teal-soft text-teal-accent"
                      : "border-line bg-panel text-muted hover:border-teal-accent/40"
                  }`}
                >
                  {STAGE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Summary description</label>
            <textarea
              className={`${inputCls} min-h-24 resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about? This is posted as the project's first update."
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Project lead</label>
            <select
              className={inputCls}
              value={leadUserId}
              onChange={(e) => setLeadUserId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="rounded-lg bg-olive px-5 py-2 text-sm font-bold uppercase tracking-wide text-olive-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create Project
          </button>
        </div>
      </form>
    </div>
  );
}
