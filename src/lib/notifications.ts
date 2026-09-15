import type { TeamMember } from "@/lib/types";

export type NotificationType = "task_assigned" | "mentioned";

export interface AppNotification {
  id: string;
  recipientUserId: string;
  actorUserId?: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  projectId?: string;
  todoId?: string;
  commentId?: string;
  readAt?: string;
  createdAt: string;
}

/** Token after @: letters, digits, dots, underscores, hyphens. */
const MENTION_TOKEN_RE = /@([A-Za-z0-9._-]+)/g;

function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Resolve @mentions in free text to team member ids.
 * Matches @username, @FirstName, compacted @FullName, and @u-id fragments.
 */
export function parseMentionedUserIds(
  text: string,
  members: TeamMember[],
): string[] {
  if (!text || members.length === 0) return [];

  const found = new Set<string>();

  // Multi-word display names (longest first) — "@Ivan Mihaylov"
  const byNameLen = [...members].sort(
    (a, b) => b.name.trim().length - a.name.trim().length,
  );
  const lowerText = text.toLowerCase();
  for (const m of byNameLen) {
    const name = m.name.trim();
    if (name.length < 2) continue;
    if (lowerText.includes(`@${name.toLowerCase()}`)) {
      found.add(m.id);
    }
  }

  const tokens = new Set<string>();
  MENTION_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_TOKEN_RE.exec(text)) !== null) {
    tokens.add(match[1].toLowerCase());
  }

  for (const member of members) {
    if (found.has(member.id)) continue;
    const username = member.username?.trim().toLowerCase() ?? "";
    const usernameCompact = username.replace(/\./g, "");
    const nameCompact = normalizeToken(member.name);
    const firstName = member.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const idLower = member.id.toLowerCase();
    const idBare = idLower.replace(/^u-/, "");

    for (const t of tokens) {
      const tCompact = t.replace(/\./g, "");
      if (
        (username && (username === t || usernameCompact === tCompact)) ||
        (nameCompact && nameCompact === tCompact) ||
        (firstName.length >= 2 && firstName === t) ||
        idLower === t ||
        idBare === t
      ) {
        found.add(member.id);
        break;
      }
    }
  }

  return [...found];
}

/** Members suggested while typing after `@`. */
export function mentionSuggestions(
  query: string,
  members: TeamMember[],
  limit = 8,
): TeamMember[] {
  const q = query.trim().toLowerCase();
  const pool = members.filter((m) => m.isActive !== false);
  if (!q) return pool.slice(0, limit);
  return pool
    .filter((m) => {
      const username = m.username?.toLowerCase() ?? "";
      const name = m.name.toLowerCase();
      return (
        username.includes(q) ||
        name.includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    })
    .slice(0, limit);
}

/** Preferred insert handle for a member (username if set, else first name). */
export function mentionHandle(member: TeamMember): string {
  const username = member.username?.trim();
  if (username) return username;
  return member.name.trim().split(/\s+/)[0] || member.id;
}

export function formatMentionLabel(member: TeamMember): string {
  const handle = mentionHandle(member);
  if (member.username) return `${member.name} (@${handle})`;
  return member.name;
}
