"use client";

import { useState } from "react";
import { useProjects } from "@/lib/store";

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-teal-accent";

export default function TeamMembersPanel({ onClose }: { onClose: () => void }) {
  const { teamMembers, addTeamMember, updateTeamMember } = useProjects();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    addTeamMember({ name: n, email: email.trim() || undefined });
    setName("");
    setEmail("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-deep/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-3xl rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-deep">Team Members</h2>
            <p className="mt-1 text-xs text-muted">
              Add and edit people assignable to project leads and action items.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
          >
            Close
          </button>
        </div>

        <form
          onSubmit={submit}
          className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className={inputCls}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-lg bg-olive px-4 py-2 text-sm font-bold text-olive-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add User
          </button>
        </form>

        <ul className="space-y-2">
          {teamMembers.map((member) => (
            <li
              key={member.id}
              className="grid gap-2 rounded-lg border border-line bg-panel p-2.5 md:grid-cols-[1fr_1fr]"
            >
              <input
                value={member.name}
                onChange={(e) =>
                  updateTeamMember(member.id, {
                    name: e.target.value,
                  })
                }
                className={inputCls}
                aria-label={`Name for ${member.name}`}
              />
              <input
                value={member.email ?? ""}
                onChange={(e) =>
                  updateTeamMember(member.id, {
                    email: e.target.value,
                  })
                }
                className={inputCls}
                placeholder="Email (optional)"
                aria-label={`Email for ${member.name}`}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
