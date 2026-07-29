"use client";

import { useState } from "react";
import { useProjects } from "@/lib/store";
import { ProjectContact } from "@/lib/types";

type FieldKey = "name" | "position" | "email" | "phone";

const FIELD_PLACEHOLDERS: Record<FieldKey, string> = {
  name: "Name",
  position: "Position",
  email: "Email",
  phone: "Phone",
};

/** Click-to-edit field; shows a muted "+ add …" hint when empty. */
function ContactField({
  value,
  field,
  onSave,
  className = "",
}: {
  value: string | undefined;
  field: FieldKey;
  onSave: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== (value ?? "")) onSave(next);
    else setDraft(value ?? "");
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        placeholder={FIELD_PLACEHOLDERS[field]}
        className="w-full rounded border border-teal-accent bg-surface px-1 py-0.5 text-sm text-ink outline-none"
      />
    );
  }
  if (!value) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className="rounded px-1 text-left text-xs italic text-muted/60 opacity-0 transition hover:text-teal-accent group-hover/contact:opacity-100"
      >
        + add {FIELD_PLACEHOLDERS[field].toLowerCase()}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Click to edit"
      className={`-mx-1 cursor-text truncate rounded px-1 text-left transition hover:bg-teal-soft ${className}`}
    >
      {value}
    </button>
  );
}

function ContactCard({
  contact,
  onPatch,
  onDelete,
}: {
  contact: ProjectContact;
  onPatch: (patch: Partial<Record<FieldKey, string>>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="group/contact relative flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-3">
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete contact"
        title="Delete contact"
        className="absolute right-2 top-2 rounded p-1 text-muted/60 opacity-0 transition hover:text-red-500 group-hover/contact:opacity-100"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
          <path d="M6.5 1a1 1 0 0 0-1 1H3a.75.75 0 0 0 0 1.5h10A.75.75 0 0 0 13 2h-2.5a1 1 0 0 0-1-1h-3ZM4 5h8l-.6 8.4A1.75 1.75 0 0 1 9.66 15H6.34a1.75 1.75 0 0 1-1.74-1.6L4 5Z" />
        </svg>
      </button>

      <ContactField
        value={contact.name}
        field="name"
        onSave={(name) => onPatch({ name })}
        className="pr-6 text-sm font-semibold text-deep"
      />
      <ContactField
        value={contact.position}
        field="position"
        onSave={(position) => onPatch({ position })}
        className="text-xs text-muted"
      />
      <div className="mt-1 flex flex-col gap-0.5 text-sm text-ink">
        <ContactField
          value={contact.email}
          field="email"
          onSave={(email) => onPatch({ email })}
          className="text-sm text-teal-accent"
        />
        <ContactField
          value={contact.phone}
          field="phone"
          onSave={(phone) => onPatch({ phone })}
          className="text-sm"
        />
      </div>
    </div>
  );
}

const newContactInputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-teal-accent";

export default function ContactList({
  projectId,
  contacts,
}: {
  projectId: string;
  contacts: ProjectContact[];
}) {
  const { addContact, updateContact, deleteContact } = useProjects();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const hasInput = Boolean(
    name.trim() || position.trim() || email.trim() || phone.trim(),
  );

  function reset() {
    setName("");
    setPosition("");
    setEmail("");
    setPhone("");
    setAdding(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasInput) return;
    addContact(projectId, { name, position, email, phone });
    reset();
  }

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
          Contacts
        </h2>
        {contacts.length > 0 && (
          <span className="text-xs font-semibold text-muted">{contacts.length}</span>
        )}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto rounded-lg border border-teal-accent/40 px-3 py-1 text-xs font-semibold text-teal-accent transition hover:bg-teal-accent/10"
          >
            + Add contact
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={submit} className="mb-3 rounded-xl border border-dashed border-line p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className={newContactInputCls}
            />
            <input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Position"
              className={newContactInputCls}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={newContactInputCls}
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              className={newContactInputCls}
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded px-3 py-1.5 text-xs text-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!hasInput}
              className="rounded-lg bg-olive px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-olive-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add Contact
            </button>
          </div>
        </form>
      )}

      {contacts.length === 0 && !adding ? (
        <p className="px-2 py-3 text-sm text-muted/80">
          No contacts yet. Add the people you deal with on this project.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contacts.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              onPatch={(patch) => updateContact(projectId, c.id, patch)}
              onDelete={() => deleteContact(projectId, c.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
